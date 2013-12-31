var Deferrals = require('../lib/deferrals');
var async = require('async');

exports.initialize = function(app) {

	var models = app.dreamer.models;

	app.get("/admin/users", function* (req, res, resume) {

		var users = yield models.users
			.findAll({})
			.complete(resume());

		res.render("users.html", { users: users });
	});

	app.get("/admin/users/new", function(req, res) {

		res.render("user.html", { action: 'New' });
	});

	app.get("/admin/users/:user_id/edit", function* (req, res, resume) {

		var user_id = req.params.user_id;
		var user, workspaces, permissions;

		models.users
			.find({ where: { id: user_id } })
			.complete(resume());

		models.workspaces
			.findAll({})
			.complete(resume());

		models.workspace_user_permissions
			.findAll({ where: { user_id: user_id } })
			.complete(resume());

		var user = yield resume;
		var workspaces = yield resume;
		var permissions = yield resume;

		workspaces.forEach(function(workspace) {

			var workspace_permission = permissions
				.filter(function(p) { return p.workspace_handle == workspace.handle; })
				.shift();

			if (workspace_permission) {
				workspace.permission = workspace_permission.permission;
			}
		});

		res.render("user.html", { 
			action: 'Edit',
			user: user,
			workspaces: workspaces
		});
	});

	app.post("/admin/users/:user_id/edit", function* (req, res, resume) {

		var user_id = req.params.user_id;

		var user = models.users
			.find({ where: { id: user_id } })
			.complete(resume());

		var fields = ['username', 'is_superuser'];

		fields.forEach(function(field) {
			user[field] = req.body[field];
		});

		var errors = user.validate();

		if (errors) {
			req.flash('danger', 'There was an error: ' + JSON.stringify(errors));
			return res.redirect("/admin/users");
		}

		var workspace_permissions = [];

		var workspace_handles = Array.isArray(req.body.workspace_handle) ? 
			req.body.workspace_handle : [ req.body.workspace_handle ];

		var permissions = Array.isArray(req.body.permission) ? 
			req.body.permission : [ req.body.permission ];

		workspace_handles.forEach(function(handle, index) {
			permission = {
				user_id: user.id,
				permission: permissions[index],
				workspace_handle: handle
			};
			workspace_permissions.push(permission);
		});

		console.log(workspace_permissions);

		yield user.save().complete(resume());
		req.flash('info', 'Saved user');

		var query = 'delete from workspace_user_permissions where user_id = ?';

		yield app.dreamer.db
			.query(query, null, {raw: true}, [user_id])
			.complete(resume());

		async.forEach(workspace_permissions, function(permission, callback) {

			models.workspace_user_permissions
				.create(permission)
				.error(req.error)
				.success(callback);

		}, function() { 
			res.redirect("/admin/users");
		});
	});

	app.post("/admin/users/new", function(req, res, resume) {

		var user = models.users.build({
			username: req.body.username
		});

		var errors = user.validate();

		if (!errors) {
			user.save().complete(resume());
			req.flash('info', 'Created new user');
			res.redirect("/admin/users");
		} else {
			req.flash('error', 'There was an error');
			res.redirect("/admin/users/new");
		}
	});
};
	

