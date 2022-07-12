var instance_skel = require('../../instance_skel')
var GetUpgradeScripts = require('./upgrades')

class instance extends instance_skel {
	static GetUpgradeScripts = GetUpgradeScripts

	constructor(system, id, config) {
		super(system, id, config)

		this.actions() // export actions
	}

	init() {
		this.status(this.STATE_OK)
	}
	// When module gets deleted
	destroy() {
		this.debug('destroy')
	}

	updateConfig(config) {
		this.config = config
	}

	// Return config fields for web config
	config_fields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 8,
				regex: this.REGEX_IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Target Port',
				width: 4,
				regex: this.REGEX_PORT,
			},
		]
	}

	actions() {
		this.setActions({
			send_blank: {
				label: 'Send message without arguments',
				options: [
					{
						type: 'textwithvariables',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
					},
				],
			},
			send_int: {
				label: 'Send integer',
				options: [
					{
						type: 'textwithvariables',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
					},
					{
						type: 'textwithvariables',
						label: 'Value',
						id: 'int',
						default: 1,
						regex: this.REGEX_SIGNED_NUMBER,
					},
				],
			},
			send_float: {
				label: 'Send float',
				options: [
					{
						type: 'textwithvariables',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
					},
					{
						type: 'textwithvariables',
						label: 'Value',
						id: 'float',
						default: 1,
						regex: this.REGEX_SIGNED_FLOAT,
					},
				],
			},
			send_string: {
				label: 'Send string',
				options: [
					{
						type: 'textwithvariables',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
					},
					{
						type: 'textwithvariables',
						label: 'Value',
						id: 'string',
						default: 'text',
					},
				],
			},
			send_multiple: {
				label: 'Send message with multiple arguments',
				options: [
					{
						type: 'textwithvariables',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
					},
					{
						type: 'textwithvariables',
						label: 'Arguments',
						id: 'arguments',
						default: '1 "test" 2.5',
					},
				],
			},
		})
	}
	action(action) {
		var args = null
		var path = action.options.path
		this.system.emit('variable_parse', action.options.path, function (value) {
			path = value
		})

		this.debug('action: ', action)

		switch (action.action) {
			case 'send_blank':
				args = []
				break
			case 'send_int':
				var int
				this.system.emit('variable_parse', action.options.int, function (value) {
					int = value
				})
				args = [
					{
						type: 'i',
						value: parseInt(int),
					},
				]
				break
			case 'send_float':
				var float
				this.system.emit('variable_parse', action.options.float, function (value) {
					float = value
				})
				args = [
					{
						type: 'f',
						value: parseFloat(float),
					},
				]
				break
			case 'send_string':
				var string
				this.system.emit('variable_parse', action.options.string, function (value) {
					string = value
				})
				args = [
					{
						type: 's',
						value: '' + string,
					},
				]
				break
			case 'send_multiple':
				var args
				this.system.emit('variable_parse', action.options.arguments, function (value) {
					args = value
				})
				let args2 = args.replace(/“/g, '"').replace(/”/g, '"').split(' ')
				let arg

				if (args2.length) {
					args = []
				}

				for (let i = 0; i < args2.length; i++) {
					if (args2[i].length == 0) continue
					if (isNaN(args2[i])) {
						var str = args2[i]
						if (str.startsWith('"')) {
							//a quoted string..
							while (!args2[i].endsWith('"')) {
								i++
								str += ' ' + args2[i]
							}
						}
						arg = {
							type: 's',
							value: str.replace(/"/g, '').replace(/'/g, ''),
						}
						args.push(arg)
					} else if (args2[i].indexOf('.') > -1) {
						arg = {
							type: 'f',
							value: parseFloat(args2[i]),
						}
						args.push(arg)
					} else {
						arg = {
							type: 'i',
							value: parseInt(args2[i]),
						}
						args.push(arg)
					}
				}
				break
			default:
				break
		}

		if (args !== null) {
			this.debug('Sending OSC', this.config.host, this.config.port, path)
			this.oscSend(this.config.host, this.config.port, path, args)
		}
	}
}

exports = module.exports = instance
