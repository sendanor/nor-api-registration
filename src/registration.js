/** User profile API */

"use strict";

var $Q = require('q');
var crypt = require('crypt3');
var copy = require('nor-data').copy;
var debug = require('nor-debug');
var is = require('nor-is');
var NoPg = require('nor-nopg');
var HTTPError = require('nor-express').HTTPError;
var ref = require('nor-ref');
var helpers = require('nor-api-helpers');

/** */
function noob_view(req, res) {
	return function(data) {
		return data;
	};
}

/** Returns nor-express based registration resource */
var registration_builder = module.exports = function registration_builder(opts) {
	opts = copy( opts || {} );

	opts.user_type = opts.user_type || "User";
	opts.user_keys = opts.user_keys || ["email", "password"];
	opts.path = opts.path || 'api/registration';
	opts.profile_path = opts.profile_path || 'api/profile';
	opts.user_view = opts.user_view || noob_view;

	debug.assert(opts.pg).is('string');
	debug.assert(opts.user_type).is('string');
	debug.assert(opts.user_keys).is('array');
	debug.assert(opts.path).is('string');
	debug.assert(opts.profile_path).is('string');
	debug.assert(opts.user_view).is('function');

	var routes = {};

	/** Returns nothing */
	routes.GET = function(req, res) {
		return { '$ref': ref(req, opts.path) };
	};

	/** Registration for new user to the system */
	routes.POST = function(req, res) {
		var input = helpers.parse_body_params(req, opts.user_keys);
		var data = {};
		if(input.name) {
			data.name = input.name;
		}
		data.email = input.email;
		data.password = crypt(input.password, crypt.createSalt('md5'));
		data.flags = {};
		debug.assert(data.email).is('string');
		debug.assert(data.password).is('string');
		// FIXME: Validate email address
		return $Q(NoPg.start(opts.pg).searchSingle(opts.user_type)({"email":data.email}).then(function(db) {
			var user = db.fetch();
			if(is.obj(user) && is.uuid(user.$id)) {
				throw new HTTPError(409, "Email address reserved");
			}
			return db.create(opts.user_type)(data);
		}).commit().then(function(db) {
			var item = db.fetch();
			debug.assert(item).is('object');
			return opts.user_view(req, res)(item);
			//res.redirect(303, ref(req, 'api'));
		}).then(function(user) {
			debug.assert(user).is('object');
			delete user.password;
			user.$ref = ref(req, opts.profile_path);
			return user;
		}));
	};

	// Returns the resource
	return routes;
}; // End of registration_builder

/* EOF */
