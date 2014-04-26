/** User profile API */

"use strict";

var $Q = require('q');
var crypt = require('crypt3');
var copy2 = require('nor-data').copy2;
var debug = require('nor-debug');
var is = require('nor-is');
var NoPg = require('nor-nopg');
var HTTPError = require('nor-express').HTTPError;
var ref = require('nor-ref');
var helpers = require('nor-api-helpers');

/** Returns nor-express based registration resource
 * @param opts.pg {string} The Postgresql configuration string for NoPG database
 * @param opts.user_type {string} The NoPg type for User accounts. Defaults to `"User"`.
 * @param opts.user_keys {array} The keywords that are accepted from user in the registration. Defaults to `["email", "password"]`.
 * @param opts.unique_keys {array} The keywords that are required to be unique in the database. Defaults to `["email"]`.
 * @param opts.path {string} The base path of this API resource. Defaults to `"/api/registration"`.
 * @param opts.profile_path {string} The path to profile resource. Defaults to `"/api/profile"`.
 * @param opts.defaults {object} Default values for new user accounts. If the value or one of the properties is a function, it will be called instead. The data object is passed as the first argument and the return value will be used as new value.
 * @param opts.user_view {NoPg Resource} 
 */
var registration_builder = module.exports = function registration_builder(opts) {
	opts = opts || {};

	opts.user_type    = opts.user_type    || "User";
	opts.user_keys    = opts.user_keys    || ["email", "password"];
	opts.unique_keys  = opts.unique_keys  || ["email"];
	opts.path         = opts.path         || 'api/registration';
	opts.profile_path = opts.profile_path || 'api/profile';
	opts.defaults     = opts.defaults     || {};

	debug.assert(opts.pg).is('string');
	debug.assert(opts.user_type).is('string');
	debug.assert(opts.user_keys).is('array');
	debug.assert(opts.path).is('string');
	debug.assert(opts.profile_path).is('string');
	debug.assert(opts.user_view).is('object');
	debug.assert(opts.user_view.element).is('function');

	var routes = {};

	/** Returns nothing */
	routes.GET = function(req, res) {
		return { '$ref': ref(req, opts.path) };
	};

	/** Registration for new user to the system */
	routes.POST = function(req, res) {
		return $Q.fcall(function parse_params() {
			return helpers.parse_body_params(req, opts.user_keys);
		}).then(function prepare_defaults(data) {

			// First lets make sure `opts.defaults` is not a function or promise.
			return $Q.fcall(function handle_functions_and_promises() {

				// If `opts.defaults` is a function, use it to build the data 
				if(is.func(opts.defaults)) {
					return opts.defaults(data);
				}

				// Or else it could be promise, or normal data.
				return opts.defaults;

			// Then make sure any property in the default object is not function or promise, and asynchronously handle them.
			}).then(function handle_properties(defaults) {

				// Filter only properties that are missing from `data`
				return Object.keys(defaults).filter(function filter_by_undefined_values(key) {
					return key && (data[key] === undefined);

				// Asynchronously set default values to `data`
				}).map(function set_values_on_data(key) {
					return $Q.when( is.func(defaults[key]) ? defaults[key](data) : defaults[key] ).then(function set_the_result(value) {
						data[key] = value;
					});
				}).reduce($Q.when, $Q).then(function returns_data() {
					return data;
				});
			});

		}).then(function(data) {

			// Password is crypted
			debug.assert(data.password).is('string');
			data.password = crypt(data.password, crypt.createSalt('md5'));
	
			// FIXME: Validate email address format

			return NoPg.start(opts.pg).then(function check_uniqueness(db) {

				// If we do not have unique_keys, skip this part.
				if(!(is.array(opts.unique_keys) && opts.unique_keys.length >= 1)) {
					return;
				}
	
				return opts.unique_keys.map(function map_unique_key(key) {
					return function check_unique_key(db2) {
						var where = {};
						where[key] = data[key];
						return db2.searchSingle(opts.user_type)(where).then(function(db3) {
							var user = db3.fetch();
							if(is.obj(user) && is.uuid(user.$id)) {
								throw new HTTPError(409, "reserved " + key);
							}
							return db3;
						});
					};
				}).reduce($Q.when, $Q(db));
	
			}).then(function create_user(db) {
				debug.log('Going to create user: data=', data);
				return db.create(opts.user_type)(data);
			}).commit().then(function(db) {
				var item = db.fetch();
				debug.assert(item).is('object');
				return opts.user_view.element(req, res)(item);
				//res.redirect(303, ref(req, 'api'));
			}).then(function(user) {
				debug.assert(user).is('object');
				delete user.password;
				user.$ref = ref(req, opts.profile_path);
				return user;
			});
		});
	};

	// Returns the resource
	return routes;
}; // End of registration_builder

/* EOF */
