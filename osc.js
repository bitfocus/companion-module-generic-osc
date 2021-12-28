var instance_skel = require('../../instance_skel');
var GetUpgradeScripts = require('./upgrades')

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.GetUpgradeScripts = GetUpgradeScripts

instance.prototype.updateConfig = function(config) {
	var self = this;

	self.config = config;
};
instance.prototype.init = function() {
	var self = this;

	self.status(self.STATE_OK);
};

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 8,
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
	self.debug('destroy');
};

instance.prototype.actions = function(system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {
		'send_blank': {
			label: 'Send message without arguments',
			options: [
				{
					 type: 'textwithvariables',
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
					 type: 'textwithvariables',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textwithvariables',
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
					 type: 'textwithvariables',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textwithvariables',
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
					 type: 'textwithvariables',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textwithvariables',
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
					 type: 'textwithvariables',
					 label: 'OSC Path',
					 id: 'path',
					 default: '/osc/path'
				},
				{
					 type: 'textwithvariables',
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

	self.debug('action: ', action);

	switch(action.action) {
		case 'send_blank':
			args = [];
			break;
		case 'send_int':
			var int;
			self.system.emit('variable_parse', action.options.int, function (value) {
				int = value
			})
			args = [{
				type: 'i',
				value: parseInt(int)
			}];
			break;
		case 'send_float':
			var float;
			self.system.emit('variable_parse', action.options.float, function (value) {
				float = value
			})
			args = [{
				type: 'f',
				value: parseFloat(float)
			}];
			break;
		case 'send_string':
			var string;
			self.system.emit('variable_parse', action.options.string, function (value) {
				string = value
			})
			args = [{
				type: 's',
				value: '' + string
			}];
			break;
		case 'send_multiple':
			var args;
			self.system.emit('variable_parse', action.options.arguments, function (value) {
				args = value
			})
			let arguments = args.replace(/“/g, '"').replace(/”/g, '"').split(' ');
			let arg;

			if (arguments.length) {
				args = [];
			}

			for (let i = 0; i < arguments.length; i++) {
				if (arguments[i].length == 0)
					continue;   
				if (isNaN(arguments[i])) {
					var str = arguments[i];
					if (str.startsWith("\""))
					{  //a quoted string..
						  while (!arguments[i].endsWith("\""))
							{
								 i++;
								 str += " "+arguments[i];
							}

					}
					arg = {
						type: 's',
						value: str.replace(/"/g, '').replace(/'/g, '')
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
		self.debug('Sending OSC',self.config.host, self.config.port, action.options.path);
		self.system.emit('osc_send', self.config.host, self.config.port, action.options.path, args);
	}


};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
