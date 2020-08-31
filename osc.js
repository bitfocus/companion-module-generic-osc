var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	// Example: When this script was committed, a fix needed to be made
	// this will only be run if you had an instance of an older "version" before.
	// "version" is calculated out from how many upgradescripts your intance config has run.
	// So just add a addUpgradeScript when you commit a breaking change to the config, that fixes
	// the config.

	self.addUpgradeScript(function () {
		// just an example
		if (self.config.host !== undefined) {
			self.config.old_host = self.config.host;
		}
	});

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;
};
instance.prototype.init = function() {
	var self = this;

	self.status(self.STATE_OK);

	debug = self.debug;
	log = self.log;
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			//width: 8, 
			//commented out as this causes the length ofan OSC command to be truncated at 9 characters...
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Target Port',
			width: 4,
			regex: self.REGEX_PORT
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	debug('destroy');
};

instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {
		'send_blank': {
			label: 'Send message without arguments',
			options: [
				{
					 type: 'textinput',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				}
			]
		},
		'send_int': {
			label: 'Send integer',
			options: [
				{
					 type: 'textinput',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textinput',
					 label: 'Value',
					 id: 'int',
					 default: 1,
					 regex: self.REGEX_SIGNED_NUMBER
				}
			]
		},
		'send_float': {
			label: 'Send float',
			options: [
				{
					 type: 'textinput',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textinput',
					 label: 'Value',
					 id: 'float',
					 default: 1,
					 regex: self.REGEX_SIGNED_FLOAT
				}
			]
		},
		'send_string': {
			label: 'Send string',
			options: [
				{
					 type: 'textinput',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textinput',
					 label: 'Value',
					 id: 'string',
					 default: 'text'
				}
			]
		},
		'send_multiple': {
			label: 'Send message with multiple arguments',
			options: [
				{
					 type: 'textinput',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textinput',
					 label: 'Arguments',
					 id: 'arguments',
					 default: '1 "test" 2.5' 
				}
			]
		}

	});
}

instance.prototype.action = function(action) {
	var self = this;
	
	var args = null;

	debug('action: ', action);
	
	switch(action.action) {
		case 'send_blank':
			args = [];
			break;
		case 'send_int':
			args = [{
				type: 'i',
				value: parseInt(action.options.int)
			}];
			break;
		case 'send_float':
			args = [{
				type: 'f',
				value: parseFloat(action.options.float)
			}];
			break;
		case 'send_string':
			args = [{
				type: 's',
				value: '' + action.options.string
			}];
			break;
		case 'send_multiple':
			let arguments = action.options.arguments.split(' ');
			let arg;
			
			if (arguments.length) {
				args = [];
			}
			
			for (let i = 0; i < arguments.length; i++) {
				if (isNaN(arguments[i])) {
					arg = {
						type: 's',
						value: arguments[i].replace(/"/g, '').replace(/'/g, '')
					};
					args.push(arg);
				}
				else if (arguments[i].indexOf('.') > -1) {
					arg = {
						type: 'f',
						value: parseFloat(arguments[i])
					};
					args.push(arg);
				}
				else {
					arg = {
						type: 'i',
						value: parseInt(arguments[i])
					};
					args.push(arg);
				}
			}
			break;
		default:
			break;
	}
	
	if (args !== null) {
		debug('Sending OSC',self.config.host, self.config.port, action.options.path);
		console.log('sending osc');
		console.log(args);
		self.system.emit('osc_send', self.config.host, self.config.port, action.options.path, args);
	}
	

};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
