const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base')
const OSCRawClient = require('./osc-raw.js');
const OSCTCPClient = require('./osc-tcp.js');
const OSCUDPClient = require('./osc-udp.js');
const UpgradeScripts = require('./upgrades');

class OSCInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config;

		this.udpClient = new OSCUDPClient(this, this.config.host, this.config.port, this.config.listen);
		this.tcpClient = new OSCTCPClient(this, this.config.host, this.config.port, this.config.listen);
		this.rawClient = new OSCRawClient(this, this.config.host, this.config.port, this.config.listen);
		this.feedbackDefs = {};
		this.onDataReceived = {};

		this.updateStatus('ok');

		this.updateActions(); // export actions
		this.updateFeedbacks(); // export feedback
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config;
		this.udpClient = new OSCUDPClient(this, this.config.host, this.config.port, this.config.listen);
		this.tcpClient = new OSCTCPClient(this, this.config.host, this.config.port, this.config.listen);
		this.rawClient = new OSCRawClient(this, this.config.host, this.config.port, this.config.listen);
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 8,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Target Port',
				width: 4,
				regex: Regex.PORT,
			},
			{
				type: 'dropdown',
				id: 'protocol',
				label: 'Protocol',
				choices: [
					{ id: 'udp', label: 'UDP (Default)' },
					{ id: 'tcp', label: 'TCP' },
					{ id: 'tcp-raw', label: 'TCP (Raw)' }
				],
				default: 'udp',
				width: 4
			},
			{
				type: 'checkbox',
				id: 'listen',
				label: 'Listen for Feedback',
				width: 4,
				default: false,
			}
		]
	}

	updateActions() {

		const sendOscMessage = async (path, args) => {
			this.log('debug', `Sending OSC [${this.config.protocol}] ${this.config.host}:${this.config.port} ${path}`)
			this.log('debug', `Sending Args ${JSON.stringify(args)}`)

			if (this.config.protocol === 'udp') {
				this.oscSend(this.config.host, this.config.port, path, args);

			} else if (this.config.protocol === 'tcp') {
				
				this.tcpClient.sendCommand(path, args)
				.then(() => {
					this.log('info', `TCP Command sent successfully. Path: ${path}, Args: ${JSON.stringify(args)}`);
				})
				.catch(err => {
					this.error('error', 'Failed to send TCP command:', err);
				});

			} else if (this.config.protocol === 'tcp-raw') {

				this.rawClient.sendCommand(path, args)
				.then(() => {
					this.log('info', `TCP Raw Command sent successfully. Path: ${path}, Args: ${JSON.stringify(args)}`);
				})
				.catch(err => {
					this.error('error', 'Failed to send TCP Raw command:', err);
				});
			}
		}

		this.setActionDefinitions({
			send_blank: {
				name: 'Send message without arguments',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)

					sendOscMessage(path, [])
				},
			},
			send_int: {
				name: 'Send integer',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'int',
						default: 1,
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const int = await this.parseVariablesInString(event.options.int)

					sendOscMessage(path, [
						{
							type: 'i',
							value: parseInt(int),
						},
					])
				},
			},
			send_float: {
				name: 'Send float',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'float',
						default: 1,
						regex: Regex.SIGNED_FLOAT,
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const float = await this.parseVariablesInString(event.options.float)

					sendOscMessage(path, [
						{
							type: 'f',
							value: parseFloat(float),
						},
					])
				},
			},
			send_string: {
				name: 'Send string',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'string',
						default: 'text',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const string = await this.parseVariablesInString(event.options.string)

					sendOscMessage(path, [
						{
							type: 's',
							value: '' + string,
						},
					])
				},
			},
			send_multiple: {
				name: 'Send message with multiple arguments',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Arguments',
						id: 'arguments',
						default: '1 "test" 2.5',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const argsStr = await this.parseVariablesInString(event.options.arguments)

					const rawArgs = (argsStr + '').replace(/“/g, '"').replace(/”/g, '"').split(' ')

					if (rawArgs.length) {
						const args = []
						for (let i = 0; i < rawArgs.length; i++) {
							if (rawArgs[i].length == 0) continue
							if (isNaN(rawArgs[i])) {
								let str = rawArgs[i]
								if (str.startsWith('"')) {
									//a quoted string..
									while (!rawArgs[i].endsWith('"')) {
										i++
										str += ' ' + rawArgs[i]
									}
								} else if(str.startsWith('{')) {
									//Probably a JSON object
									try {
										args.push((JSON.parse(rawArgs[i])))
									} catch (error) {
										this.log('error', `not a JSON object ${rawArgs[i]}`)
									}
								}

								args.push({
									type: 's',
									value: str.replace(/"/g, '').replace(/'/g, ''),
								})
							} else if (rawArgs[i].indexOf('.') > -1) {
								args.push({
									type: 'f',
									value: parseFloat(rawArgs[i]),
								})
							} else {
								args.push({
									type: 'i',
									value: parseInt(rawArgs[i]),
								})
							}
						}

						sendOscMessage(path, args)
					}
				},
			},
			send_boolean: {
				name: 'Send boolean',
				options: [
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The boolean type is non-standard and may only work with some receivers.',
						id: 'warning'
					},
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'checkbox',
						label: 'Value',
						id: 'value',
						default: false,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					let type = 'F'
					if (event.options.value === true) {
						type = 'T'
					}

					sendOscMessage(path, [
						{
							type,
						},
					])
				},
			},
		})
	}
	
	updateFeedbacks() {
		this.setFeedbackDefinitions({
			osc_feedback: {
				type: 'boolean',
				name: 'Listen for OSC messages',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Arguments',
						id: 'arguments',
						default: '1 "test" 2.5',
						useVariables: true,
					}
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '');
					let argsStr = await context.parseVariablesInString(feedback.options.arguments || '');
	
					this.log('info', `Evaluating feedback ${feedback.id}.`);
	
					const rawArgs = (argsStr + '').replace(/“/g, '"').replace(/”/g, '"').split(' ');
	
					if (rawArgs.length) {
						const args = [];
						for (let i = 0; i < rawArgs.length; i++) {
							if (rawArgs[i] === undefined || rawArgs[i].length === 0) continue;
							if (isNaN(rawArgs[i])) {
								let str = rawArgs[i];
								if (str.startsWith('"')) {
									// Ensure the string is complete
									while (i < rawArgs.length - 1 && !rawArgs[i].endsWith('"')) {
										i++;
										str += ' ' + rawArgs[i];
									}
									if (!str.endsWith('"')) {
										this.log('warn', `Unmatched quote in arguments: ${str}`);
										return false;
									}
								}
								args.push(str.replace(/"/g, '').replace(/'/g, ''));
							} else if (rawArgs[i].indexOf('.') > -1) {
								args.push(parseFloat(rawArgs[i]));
							} else {
								args.push(parseInt(rawArgs[i]));
							}
						}
	
						if (this.onDataReceived.hasOwnProperty(path)) {
							// Compare args by value
							const rx_args = this.onDataReceived[path];

							this.log('debug', `Evaluated feedback ${feedback.id}. Path: ${path}. Args: ${JSON.stringify(args)} RX_Args: ${JSON.stringify(rx_args)}`);

							for (let i = 0; i < args.length; i++) {
								if (args[i] !== rx_args[i]) {
									this.log('warn', `Feedback ${feedback.id} returned false! Argument mismatch at index ${i}. Expected: ${args[i]}, Received: ${rx_args[i]}`);
									return false;
								}
							}
		
							this.log('debug', `Feedback ${feedback.id} returned true!`);

							return true;

						} else {
							this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in database.`);
							return false;
						}
						
					}
	
					return false;
				},
				subscribe: (feedback) => {
					this.log('info', `Subscribing to feedback ${feedback.id}.`);
	
					// Open connection if one doesn't already exist and listen is enabled
					if (this.config.listen) {
						if (this.config.protocol === 'udp' && !this.udpClient.isConnected()) {
							this.udpClient.openConnection();
	
						} else if (this.config.protocol === 'tcp' && !this.tcpClient.isConnected()) {
							this.tcpClient.openConnection();
	
						} else if (this.config.protocol === 'tcp-raw' && !this.rawClient.isConnected()) {
							this.rawClient.openConnection();
						}
					}
				},
				unsubscribe: (feedback) => {
					this.log('info', `Unsubscribing from feedback ${feedback.id}`);
					// Unsubscribe from OSC messages using the stored listener
					if (this.feedbackDefs[feedback.id]) {
						delete this.feedbackDefs[feedback.id];
					}
				},
			}
		});
	}	
	
	
}

runEntrypoint(OSCInstance, UpgradeScripts)
