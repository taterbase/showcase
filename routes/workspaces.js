var gx = require('gx');
var find = require('lodash.find')
var Collection = require('../lib/collection')
var Item = require('../lib/item')
var File = require('../lib/file')
var fs = require('fs')
var each = require('each-async')
var clone = require('../lib/clone')
var yazl = require('yazl')
var yauzl = require('yauzl')
var uuid = require('node-uuid')
var mkdirp = require('mkdirp')
var dirName = require('path').dirname

var read = gx.gentrify(fs.readFile)

exports.initialize = function(app) {

	var models = app.dreamer.models;
	var workspaceAdmin = app.showcase.middleware.workspacePermission('administrator');
	var workspaceLoader = app.showcase.middleware.workspaceLoader;
	var requireSuperuser = app.showcase.middleware.requireSuperuser;
	var tmp_storage_path = app.showcase.config.files.tmp_path;

	var fields = ['title', 'handle', 'description'];

	app.get("/workspaces", function*(req, res) {

		var workspaces = yield models.workspaces
			.findAll({})
			.complete(gx.resume);

		res.render("workspaces.html", { workspaces: workspaces });
	});

	app.get("/workspaces/new", requireSuperuser, function(req, res) {

		var breadcrumbs = [ { text: 'New' } ];

		res.render("workspace.html", {
			breadcrumbs: breadcrumbs
		});
	});

	app.get("/workspaces/import", requireSuperuser, function(req, res) {

		var breadcrumbs = [ { text: 'Import Showcase' } ];

		res.render("import_showcase.html", {
			breadcrumbs: breadcrumbs
		});
	});

  app.post('/workspaces/import', requireSuperuser, function(req, res) {
    var importDir = tmp_storage_path + '/showcase-import-' + uuid.v1()
    yauzl.open(req.files["import-file"].path, function(err, zipfile) {
      if (err) {
        console.log(err)
        return res.send(500, "Could not parse import zip file")
      }

      zipfile.on('entry', function(entry) {
        var destination = importDir + '/' + entry.fileName

        zipfile.openReadStream(entry, function(err, readStream) {
          if (err) {
            console.log(err, readStream)
            return res.send(500, "Could not parse import zip file")
          }
          mkdirp(dirName(destination), function(err) {
            if (err)
              console.log(err)

            console.log(destination)
            readStream.pipe(fs.createWriteStream(destination))
          })
        })
      })

      zipfile.once('end', function() {
        res.send("ay good job dawg")
      })
    })
  })

	app.get("/workspaces/export", requireSuperuser, function*(req, res) {
    var zip = new yazl.ZipFile()
    var zipLocation = tmp_storage_path + '/export.zip'

    zip.outputStream.pipe(fs.createWriteStream(zipLocation)).on('close', function() {
      res.sendfile(zipLocation)
    })

    var result = {
      workspaces: [],
      collections: [],
      items: [],
      images: []
    }
    
		result.workspaces = yield models.workspaces
			.findAll({})
			.complete(gx.resume);

    var workspace_handles = result.workspaces.map(function(workspace) {
      return workspace.handle
    })

    result.collections = yield Collection.all({workspace_handle: {in: workspace_handles}})

    var collection_ids = result.collections.map(function(collection) {
      return collection.id
    })

    result.items = yield Item.all({collection_id: {in: collection_ids}})

    var images = result.items.map(function(item) {
      var images = []

      item.collection.fields.filter(function(field) {
        return field.data_type === 'image'
      }).forEach(function(field) {
        var data = clone(item.data[field.name])
        data.item_id = item.id
        images.push(data)
      })
      return images
    }).reduce(function(prev, curr) {
      return prev.concat(curr)
    })

    each(images, function(image, index, done) {
      File.load({id: image.file_id}, function(err, imageData) {
        zip.addFile(imageData.path, 'images/item_' + image.item_id + '/file_' + image.file_id + '/' + imageData.original_filename)
        done(err)
      })
    }, function(err) {
      result.images = images
      result.items.forEach(function(item) {
        delete item.collection
      })
      zip.addBuffer(new Buffer(JSON.stringify(result, null, 2)), 'data.json', {
        mtime: new Date(),
        mode: 0100664 // -rw-rw-r--
      })
      zip.end()
    })


  })

	app.get("/workspaces/:workspace_handle/edit", workspaceLoader, workspaceAdmin, function(req, res) {

		var workspace = req.showcase.workspace;

		var breadcrumbs = [
			{ href: '/workspaces/' + workspace.handle + '/collections', text: workspace.title }
		];

		res.render("workspace.html", {
			breadcrumbs: breadcrumbs,
			workspace: workspace
		});
	});

	app.post("/workspaces/new", requireSuperuser, function*(req, res) {

    var workspace = models.workspaces.build({
			title: req.body.title,
			handle: req.body.handle,
			description: req.body.description
		});

		var errors = workspace.validate();

		fields.forEach(function(field) {
			if (workspace[field]) return;
			errors = errors || {};
			errors[field] = [field + ' is required'];
		});

		if (!errors) {
			yield workspace.save().complete(gx.resume);
			req.flash('info', 'Saved new workspace');
			res.redirect("/workspaces");
		} else {
			req.flash('danger', 'There was an error: ' + JSON.stringify(errors));
			res.redirect("/workspaces/new");
		}
	});

	app.delete("/workspaces/:workspace_handle", workspaceLoader, workspaceAdmin, function*(req, res) {

		var workspace = req.showcase.workspace;
		yield workspace.destroy().complete(gx.resume);
		req.flash('info', 'Deleted workspace');
		res.redirect('/workspaces');
	});

	app.post("/workspaces/:workspace_handle/edit", workspaceLoader, workspaceAdmin, function*(req, res) {

		var workspace = req.showcase.workspace;

		fields.forEach(function(field) {
			workspace[field] = req.body[field];
		});

		var errors = workspace.validate();

		fields.forEach(function(field) {
			if (workspace[field]) return;
			errors = errors || {};
			errors[field] = [field + ' is required'];
		});

		if (!errors) {
			yield workspace.save().complete(gx.resume);
			req.flash('info', 'Saved workspace');
			res.redirect("/workspaces");
		} else {
			req.flash('danger', 'There was an error: ' + JSON.stringify(errors));
			res.redirect("/workspaces/" + workspace.handle);
		}

	});
};
