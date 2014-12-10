var Workspace = function() {
  this.initialize.apply(this, arguments)
}

Workspace.prototype = {

  attributes: ['title', 'handle', 'description'],

  initialize: function*(properties) {
    if (!properties) return;
    if (properties.id) this.id = properties.id;

    this.title = properties.title;
    this.handle = properties.handle;
    this.description = properties.description;

    this._data = properties.save ? properties : models.workspaces.build(this);

    return this;
  }

  save: function*() {

    this.attributes.forEach(function(key) {
      this._data[key] = this[key]
    }, this);

    yield this._data.save().complete(gx.resume);
    this.id = this._data.id;
  }

	update: function*(args) {

		this.attributes.forEach(function(key) {
			if (key in args) this[key] = args[key];
		}, this);

		yield this.save();
	},

	destroy: function*() {
		yield this._data.destroy().complete(gx.resume);
	},
}

Workspace.create = function*(args) {
	var properties = {};

	Workspace.prototype.attributes.forEach(function(key) {
		properties[key] = args[key]
	});

  var workspace = yield new Workspace(properties);

  yield workspace.save();

  return workspace;
}

Workspace.load = function*(args) {
  
  var criteria = {};

  Object.keys(args).forEach(function(key) {
    if (Workspace.prototype.attributes.indexOf(key) > -1 )
      criteria[key] = args[key];
  })

	var data = yield models.workspaces
		.find({ where: criteria })
		.complete(gx.resume);

  var workspace = yield new Workspace(data);

  return workspace;
}

Collection.all = function*(args) {

	var workspace_handle = args.workspace_handle;

	var workspaces = models.workspaces
		.findAll({})
		.complete(gx.resume);

	return workspaces;
};

Workspace = gx.class(Workspace, { functions: false });

module.exports = Workspace;
