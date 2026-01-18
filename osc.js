const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base');
const UpgradeScripts = require('./upgrades');
const { resolveHostname, isValidIPAddress, parseArguments, evaluateComparison, setupOSC, clampInt, parseHexByte, parseHexBytes, midiTypeFromStatus } = require('./helpers.js');

class OSCInstance extends InstanceBase {
	constructor(internal) {
		super(internal);
	}

	//Initialization
	async init(config) {
		this.config = config;
		this.targetHost;
		this.client;

		this.onDataReceived = {};

		let validate = false;

		if (this.config.host) {
			if (!isValidIPAddress(this.config.host)) {
				await resolveHostname(this, this.config.host)
					.then((ip) => {
						this.targetHost = ip;
						validate = true;
					})
					.catch((err) => {
						this.log('error', `Unable to resolve hostname for ${this.config.host}: ${err.message}`);
						this.updateStatus('bad_config');
						validate = false;
					});
			} else {
				this.targetHost = this.config.host;
				validate = true;
			}
		}

		if (this.config.listen) {
			if (this.targetHost && (this.config.targetPort || this.config.feedbackPort)) {
				setupOSC(this);

				if (validate) {
					this.setupListeners();
				}
			}
		} else {
			this.updateStatus('ok');
		}

		this.updateActions(); // export actions
		this.updateFeedbacks(); // export feedback
		this.updateVariables(); // export variables
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy');
	}

	async configUpdated(config) {
		this.config = config;

		if (this.client && this.client.isConnected()) {
			await this.client
				.closeConnection()
				.then(() => {
					this.client = null;
				})
				.catch((err) => {
					this.log('error', `${this.config.protocol} close error: ${err.message}`);
				});
		}

		let validate = false;
		if (!this.config.host) {
			this.updateStatus('bad_config');
			this.log('warn', 'No host specified in config (null)');
		} else if (!this.config.targetPort) {
			this.updateStatus('bad_config');
			this.log('warn', 'No targetPort specified in config (null)');
		} else if (!isValidIPAddress(this.config.host)) {
			await resolveHostname(this, this.config.host)
				.then((ip) => {
					this.targetHost = ip;
					validate = true;
				})
				.catch((err) => {
					this.log('error', `Unable to resolve hostname for ${this.config.host}: ${err.message}`);
					this.updateStatus('bad_config');
					validate = false;
				});
		} else {
			this.targetHost = this.config.host;
			validate = true;
		}

		if (!validate) {
			return;
		}

		setupOSC(this);

		this.setupListeners();
	}

	async setupListeners() {
		this.log('info', `Resetting Listeners..`);

		if (this.config.listen) {
			if (this.config.protocol && this.client && !this.client.isConnected()) {
				await this.client.openConnection().catch((err) => {
					this.log('error', err.message);
				});
			}
		} else {
			this.updateStatus('ok');
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target Hostname or IP',
				width: 8,
				regex: Regex.HOSTNAME,
				required: true,
			},
			{
				type: 'textinput',
				id: 'targetPort',
				label: 'Target Port',
				width: 4,
				regex: Regex.PORT,
				required: true,
			},
			{
				type: 'dropdown',
				id: 'protocol',
				label: 'Protocol',
				choices: [
					{ id: 'udp', label: 'UDP (Default)' },
					{ id: 'tcp', label: 'TCP' },
					{ id: 'tcp-raw', label: 'TCP (Raw)' },
				],
				default: 'udp',
				width: 4,
				required: true,
			},
			{
				type: 'checkbox',
				id: 'listen',
				label: 'Listen for Feedback',
				width: 4,
				default: false,
				required: true,
			},
			{
				type: 'textinput',
				id: 'feedbackPort',
				label: 'Feedback Port',
				width: 4,
				regex: Regex.PORT,
				isVisible: (options, data) => options.listen && options.protocol === 'udp',
				isVisibleExpression: "$(options:listen) === true && $(options:protocol) === 'udp'",
			},
		];
	}

	updateActions() {
		const sendOscMessage = async (path, args, type) => {
			const args_json = JSON.stringify(args);
			const args_string = args.map((item) => item.value).join(' ');

			this.log('debug', `Sending OSC [${this.config.protocol}] ${this.targetHost}:${this.config.targetPort} ${path}`);
			this.log('debug', `Sending Args ${args_json}`);

			if (this.config.protocol === 'udp') {
				//Update Variables
				this.setVariableValues({
					latest_sent_raw: `${path} ${args_string}`,
					latest_sent_path: path,
					latest_sent_args: args.length > 0 ? args.map((arg) => arg.value) : undefined,
					latest_sent_timestamp: Date.now(),
				});

				this.oscSend(this.targetHost, this.config.targetPort, path, args);
			} else {
				await this.client
					.sendCommand(path, args)
					.then(() => {
						this.log('info', `${this.config.protocol} Command sent successfully. Path: ${path}, Args: ${args_json}`);
					})
					.catch((err) => {
						this.log('error', `Failed to send ${this.config.protocol} command:`, err.message);
					});
			}
		};

		this.setActionDefinitions({
			send_blank: {
				name: 'Send message without arguments',
				description: 'Send an OSC message without arguments',
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
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));

					sendOscMessage(path, []);
				},
			},
			send_int: {
				name: 'Send integer',
				description: 'Send a single integer value (type "i") as OSC argument',
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
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					const int = await this.parseVariablesInString(String(event.options.int ?? ''));

					sendOscMessage(path, [
						{
							type: 'i',
							value: parseInt(int),
						},
					]);
				},
			},
			send_float: {
				name: 'Send float',
				description: 'Send a float (type "f") argument',
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
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					const float = await this.parseVariablesInString(String(event.options.float ?? ''));

					sendOscMessage(path, [
						{
							type: 'f',
							value: parseFloat(float),
						},
					]);
				},
			},
			send_string: {
				name: 'Send string',
				description: 'Send a string (type "s") argument',
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
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					const string = await this.parseVariablesInString(String(event.options.string ?? ''));

					sendOscMessage(path, [
						{
							type: 's',
							value: '' + string,
						},
					]);
				},
			},
			send_multiple: {
				name: 'Send message with multiple arguments',
				description: 'Send a message with multiple arguments of different types (int, float, string, boolean)',
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
						default: `1 "Let's go" 2.5`,
						useVariables: true,
						tooltip: `Use a space delimited list of numbers, true, false or strings. Numbers without a decimal point are considered integer and numbers with a point are considered float. When using a variable that holds an array the elements of the array will be passed as arguments.`,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					const args = await this.parseVariablesInString(String(event.options.arguments ?? ''));

					function tokenize(input) {
						if (!input || input.trim() === '') {
							return [];
						}
						// Normalize fancy quotes to standard double quotes
						input = input.replaceAll(/[\u201C\u201D\u201E\u201F]/g, '"');

						const regex = /(-?\d+(?:\.\d+)?)|true|false|"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)'|\S+/g;
						const tokens = [];
						let match;

						while ((match = regex.exec(input)) !== null) {
							if (match[1] !== undefined && match[1].match(/\./)) {
								// Float
								tokens.push({ type: 'f', value: parseFloat(match[1]) });
							} else if (match[1] !== undefined && !match[1].match(/\./)) {
								// Integer
								tokens.push({ type: 'i', value: parseInt(match[1]) });
							} else if (match[2] !== undefined) {
								// Double-quoted string: include quotes as literal characters
								tokens.push({ type: 's', value: match[2].replace(/\\"/g, '"') });
							} else if (match[3] !== undefined) {
								// Single-quoted string: include quotes as literal characters
								tokens.push({ type: 's', value: match[3].replace(/\\'/g, "'") });
							} else if (match[0] === 'true') {
								tokens.push({ type: 'T' });
							} else if (match[0] === 'false') {
								tokens.push({ type: 'F' });
							} else {
								// Other non-space tokens: wrap as a string
								tokens.push({ type: 's', value: match[0] });
							}
						}

						return tokens;
					}

					function mapArgArray(arr) {
						return arr
							.filter((itm) => {
								const type = typeof itm;
								return type === 'string' || type === 'boolean' || type === 'number';
							})
							.map((itm) => {
								if (typeof itm === 'number') return { type: 'f', value: itm };
								else if (typeof itm === 'string') return { type: 's', value: itm };
								else if (itm === true) return { type: 'T' };
								else if (itm === false) return { type: 'F' };
							});
					}

					let argsArray = [];
					if (Array.isArray(args)) {
						if (args.length) argsArray = mapArgArray(args);
					} else {
						argsArray = tokenize(args);
					}

					sendOscMessage(path, argsArray);
				},
			},
			send_boolean: {
				name: 'Send boolean',
				description: 'Send a boolean value as OSC True (type "T") or False (type "F")',
				options: [
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The boolean type is non-standard and may only work with some receivers.',
						id: 'warning',
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
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					let type = 'F';
					if (event.options.value === true) {
						type = 'T';
					}

					sendOscMessage(path, [
						{
							type,
						},
					]);
				},
			},
			send_blob: {
				name: 'Send blob',
				description: 'Sends an OSC blob argument (type "b"). You can provide the blob data as Base64 or Hex.',
				options: [
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The blob type is non-standard and may only work with some receivers.',
						id: 'warning',
					},
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Blob Data (Base64)',
						id: 'blob',
						default: '',
						useVariables: true,
						isVisible: (options, data) => options.hexswitch === false,
						isVisibleExpression: '$(options:hexswitch) === false',
					},
					{
						type: 'textinput',
						label: 'Blob Data (Hex)',
						id: 'blob_hex',
						default: '0A0B0C',
						useVariables: true,
						isVisible: (options, data) => options.hexswitch === true,
						isVisibleExpression: '$(options:hexswitch) === true',
					},
					{
						type: 'checkbox',
						label: 'Use Hex',
						id: 'hexswitch',
						default: false,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					const blob = await this.parseVariablesInString(String(event.options.blob ?? ''));
					const blob_hex = await this.parseVariablesInString(String(event.options.blob_hex ?? ''));

					let blobBuffer;

					if (event.options.hexswitch === true) {
						// Convert Hex string to a Buffer
						blobBuffer = Buffer.from(blob_hex.replace(/[\s,]/g, ''), 'hex');

						if (!blobBuffer) {
							this.log('error', `Invalid blob data: ${blob_hex}`);
							return;
						}
					} else {
						// Convert Base64 string to a Buffer
						blobBuffer = Buffer.from(blob.replace(/[\s,]/g, ''), 'base64');

						if (!blobBuffer) {
							this.log('error', `Invalid blob data: ${blob}`);
							return;
						}
					}

					sendOscMessage(path, [
						{
							type: 'b', // OSC blob type
							value: blobBuffer,
						},
					]);
				},
			},
			send_midi: {
				name: 'Send MIDI message (OSC MIDI)',
				description: 'Sends an OSC MIDI argument (type "m") containing 4 bytes: portId, status, data1, data2. Supports friendly MIDI modes or raw hex',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'dropdown',
						label: 'Mode',
						id: 'mode',
						default: 'noteon',
						choices: [
							{ id: 'noteon', label: 'Note On' },
							{ id: 'noteoff', label: 'Note Off' },
							{ id: 'cc', label: 'Control Change (CC)' },
							{ id: 'program', label: 'Program Change' },
							{ id: 'pitchbend', label: 'Pitch Bend' },
							{ id: 'polyaftertouch', label: 'Poly Aftertouch' },
							{ id: 'channelpressure', label: 'Channel Pressure' },
							{ id: 'raw', label: 'Raw (4 bytes hex)' },
						]
					},
					{
						type: 'number',
						label: 'MIDI Port ID (0-255)',
						id: 'portId',
						default: 0,
						useVariables: true,
						min: 0,
						max: 255,
						tooltip: 'OSC MIDI has a leading "port" byte. Leave 0 unless you know your receiver expects something else.',
					},
					{
						type: 'number',
						label: 'Channel (1-16)',
						id: 'channel',
						default: 1,
						min: 1,
						max: 16,
						useVariables: true,
						isVisible: (options) => options.mode !== 'raw',
						isVisibleExpression: "$(options:mode) !== 'raw'",
					},
					{
						type: 'number',
						label: 'Data 1 (Note/CC/Program)',
						id: 'data1',
						default: 69,
						min: 0,
						max: 127,
						useVariables: true,
						isVisible: (options) => options.mode !== 'raw' && options.mode !== 'pitchbend',
						isVisibleExpression: "$(options:mode) !== 'raw' && $(options:mode) !== 'pitchbend'",
						tooltip: 'Note On/Off: Note number (0-127). CC: Controller number (0-127). Program: Program number (0-127).',
					},
					{
						type: 'number',
						label: 'Data 2 (Velocity/Value)',
						id: 'data2',
						default: 100,
						min: 0,
						max: 127,
						useVariables: true,
						isVisible: (options) => options.mode !== 'raw' && options.mode !== 'program' && options.mode !== 'channelpressure' && options.mode !== 'pitchbend',
						isVisibleExpression: "$(options:mode) !== 'raw' && $(options:mode) !== 'program' && $(options:mode) !== 'channelpressure' && $(options:mode) !== 'pitchbend'",
						tooltip: 'Note On/Off: Velocity (0-127). CC: Value (0-127). Poly Aftertouch: Pressure (0-127).',
					},
					{
						type: 'number',
						label: 'Pitch Bend (center 0; range -8192..8191)',
						id: 'pitch',
						default: 0,
						min: -8192,
						max: 8191,
						useVariables: true,
						isVisible: (options) => options.mode === 'pitchbend',
						isVisibleExpression: "$(options:mode) === 'pitchbend'",
					},
					{
						type: 'textinput',
						label: 'Raw bytes (4 hex bytes, e.g. "00 90 45 65")',
						id: 'rawHex',
						default: '00 90 45 65',
						useVariables: true,
						isVisible: (options) => options.mode === 'raw',
						isVisibleExpression: "$(options:mode) === 'raw'",
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(String(event.options.path ?? ''));
					const mode = event.options.mode;

					if (mode === 'raw') {
						const rawHex = await this.parseVariablesInString(String(event.options.rawHex ?? ''));
						const buf = parseHexBytes(rawHex, 4);
						if (!buf) {
							this.log('error', `Invalid raw MIDI hex. Expected 4 bytes, e.g. "00 90 45 65". Got: ${rawHex}`);
							return;
						}

						sendOscMessage(path, [{ type: 'm', value: buf }]);
						return;
					}

					const portIdStr = await this.parseVariablesInString(String(event.options.portId ?? '0'));
					const channelStr = await this.parseVariablesInString(String(event.options.channel ?? '1'));
					const data1Str = await this.parseVariablesInString(String(event.options.data1 ?? '0'));
					const data2Str = await this.parseVariablesInString(String(event.options.data2 ?? '0'));
					const pitchStr = await this.parseVariablesInString(String(event.options.pitch ?? '0'));

					const portId = clampInt(portIdStr, 0, 255);
					const channel = clampInt(channelStr, 1, 16);

					if (portId === null) {
						this.log('error', `Invalid MIDI Port ID (0-255): ${portIdStr}`);
						return;
					}
					if (channel === null) {
						this.log('error', `Invalid MIDI Channel (1-16): ${channelStr}`);
						return;
					}

					let statusBase;
					let data1 = 0;
					let data2 = 0;

					if (mode === 'noteon') statusBase = 0x90;
					else if (mode === 'noteoff') statusBase = 0x80;
					else if (mode === 'cc') statusBase = 0xB0;
					else if (mode === 'program') statusBase = 0xC0;
					else if (mode === 'polyaftertouch') statusBase = 0xA0;
					else if (mode === 'channelpressure') statusBase = 0xD0;
					else if (mode === 'pitchbend') statusBase = 0xE0;
					else {
						this.log('error', `Unknown MIDI mode: ${mode}`);
						return;
					}

					const status = statusBase | ((channel - 1) & 0x0F);

					if (mode === 'pitchbend') {
						// MIDI pitch bend is 14-bit: 0..16383, center 8192.
						const pitch = clampInt(pitchStr, -8192, 8191);
						if (pitch === null) {
							this.log('error', `Invalid Pitch Bend (-8192..8191): ${pitchStr}`);
							return;
						}
						const bend14 = pitch + 8192;
						data1 = bend14 & 0x7F; // LSB
						data2 = (bend14 >> 7) & 0x7F; // MSB
					} else {
						// data1 always present for these
						const d1 = clampInt(data1Str, 0, 127);
						if (d1 === null) {
							this.log('error', `Invalid Data 1 (0-127): ${data1Str}`);
							return;
						}
						data1 = d1;

						// data2 only for some message types
						if (mode === 'program' || mode === 'channelpressure') {
							data2 = 0;
						} else {
							const d2 = clampInt(data2Str, 0, 127);
							if (d2 === null) {
								this.log('error', `Invalid Data 2 (0-127): ${data2Str}`);
								return;
							}
							data2 = d2;
						}
					}

					const buf = Buffer.from([portId, status, data1, data2]);
					sendOscMessage(path, [{ type: 'm', value: buf }]);
				},
			},

		});
	}

	updateFeedbacks() {
		this.setFeedbackDefinitions({
			osc_feedback_int: {
				type: 'boolean',
				name: 'Listen for OSC messages (Integer)',
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
						label: 'Value',
						id: 'arguments',
						default: 1,
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'greaterthan', label: '>' },
							{ id: 'lessthan', label: '<' },
							{ id: 'greaterthanequal', label: '>=' },
							{ id: 'lessthanequal', label: '<=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					const targetValueStr = await context.parseVariablesInString(String(feedback.options.arguments ?? ''));
					const comparison = feedback.options.comparison;

					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					const targetValue = parseFloat(targetValueStr);
					if (isNaN(targetValue)) {
						this.log('warn', `Invalid target value: ${targetValueStr}`);
						return false;
					}

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path];
						const receivedValue = parseFloat(rx_args[0].value);

						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison);

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`);
						return comparisonResult;
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}
				},
			},
			osc_feedback_float: {
				type: 'boolean',
				name: 'Listen for OSC messages (Float)',
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
						label: 'Value',
						id: 'arguments',
						default: 1,
						regex: Regex.SIGNED_FLOAT,
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'greaterthan', label: '>' },
							{ id: 'lessthan', label: '<' },
							{ id: 'greaterthanequal', label: '>=' },
							{ id: 'lessthanequal', label: '<=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					const targetValueStr = await context.parseVariablesInString(String(feedback.options.arguments ?? ''));
					const comparison = feedback.options.comparison;

					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					const targetValue = parseFloat(targetValueStr);
					if (isNaN(targetValue)) {
						this.log('warn', `Invalid target value: ${targetValueStr}`);
						return false;
					}

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path];
						const receivedValue = parseFloat(rx_args[0].value);

						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison);

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`);
						return comparisonResult;
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}
				},
			},
			osc_feedback_bool: {
				type: 'boolean',
				name: 'Listen for OSC messages (Boolean)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The boolean type is non-standard and may only work with some receivers.',
						id: 'warning',
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
						id: 'arguments',
						default: false,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					const targetValue = feedback.options.arguments;
					const comparison = feedback.options.comparison;

					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path];
						const receivedValue = rx_args[0].value === true ? true : false;

						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison);

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`);
						return comparisonResult;
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}
				},
			},
			osc_feedback_string: {
				type: 'boolean',
				name: 'Listen for OSC messages (String)',
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
						label: 'Value',
						id: 'arguments',
						default: 'my favorite string',
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					const targetValue = await context.parseVariablesInString(String(feedback.options.arguments ?? ''));
					const comparison = feedback.options.comparison;

					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path];

						if (typeof rx_args[0].value !== 'string') {
							this.log('warn', `Feedback ${feedback.id} received a non-string value: ${receivedValue}`);
							return false;
						}

						const receivedValue = String(rx_args[0].value);
						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison);

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`);
						return comparisonResult;
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}
				},
			},
			osc_feedback_midi: {
				type: 'boolean',
				name: 'Listen for OSC messages (OSC MIDI)',
				description: 'Matches incoming OSC MIDI (type "m") messages by type/channel/data bytes. Requires "Listen for Feedback" enabled.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/midiMessage',
						useVariables: true,
						required: true,
					},
					{
						type: 'dropdown',
						label: 'Match Mode',
						id: 'matchMode',
						default: 'fields',
						choices: [
							{ id: 'fields', label: 'Match by MIDI fields (recommended)' },
							{ id: 'raw', label: 'Match raw 4 bytes (hex)' },
						],
					},
					{
						type: 'dropdown',
						label: 'MIDI Type',
						id: 'midiType',
						default: 'any',
						choices: [
							{ id: 'any', label: 'Any' },
							{ id: 'noteon', label: 'Note On' },
							{ id: 'noteoff', label: 'Note Off' },
							{ id: 'cc', label: 'Control Change (CC)' },
							{ id: 'program', label: 'Program Change' },
							{ id: 'pitchbend', label: 'Pitch Bend' },
							{ id: 'polyaftertouch', label: 'Poly Aftertouch' },
							{ id: 'channelpressure', label: 'Channel Pressure' },
						],
						isVisible: (options) => options.matchMode === 'fields',
						isVisibleExpression: "$(options:matchMode) === 'fields'",
					},
					{
						type: 'checkbox',
						label: 'Match Channel',
						id: 'matchChannel',
						default: true,
						isVisible: (options) => options.matchMode === 'fields',
						isVisibleExpression: "$(options:matchMode) === 'fields'",
					},
					{
						type: 'number',
						label: 'Channel (1-16)',
						id: 'channel',
						default: 1,
						min: 1,
						max: 16,
						useVariables: true,
						isVisible: (options) => options.matchMode === 'fields' && options.matchChannel === true,
						isVisibleExpression: "$(options:matchMode) === 'fields' && $(options:matchChannel) === true",
					},
					{
						type: 'checkbox',
						label: 'Match Data 1 (Note/CC/Program)',
						id: 'matchData1',
						default: false,
						isVisible: (options) => options.matchMode === 'fields',
						isVisibleExpression: "$(options:matchMode) === 'fields'",
					},
					{
						type: 'number',
						label: 'Data 1 (0-127)',
						id: 'data1',
						default: 69,
						min: 0,
						max: 127,
						useVariables: true,
						isVisible: (options) => options.matchMode === 'fields' && options.matchData1 === true,
						isVisibleExpression: "$(options:matchMode) === 'fields' && $(options:matchData1) === true",
					},
					{
						type: 'checkbox',
						label: 'Match Data 2 (Velocity/Value)',
						id: 'matchData2',
						default: false,
						isVisible: (options) => options.matchMode === 'fields',
						isVisibleExpression: "$(options:matchMode) === 'fields'",
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Data 2 Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'greaterthan', label: '>' },
							{ id: 'lessthan', label: '<' },
							{ id: 'greaterthanequal', label: '>=' },
							{ id: 'lessthanequal', label: '<=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
						isVisible: (options) => options.matchMode === 'fields' && options.matchData2 === true,
						isVisibleExpression: "$(options:matchMode) === 'fields' && $(options:matchData2) === true",
					},
					{
						type: 'number',
						label: 'Data 2 (0-127)',
						id: 'data2',
						default: 100,
						min: 0,
						max: 127,
						useVariables: true,
						isVisible: (options) => options.matchMode === 'fields' && options.matchData2 === true,
						isVisibleExpression: "$(options:matchMode) === 'fields' && $(options:matchData2) === true",
					},
					{
						type: 'textinput',
						label: 'Raw bytes (4 hex bytes, e.g. "00 90 45 65")',
						id: 'rawHex',
						default: '00 90 45 65',
						useVariables: true,
						isVisible: (options) => options.matchMode === 'raw',
						isVisibleExpression: "$(options:matchMode) === 'raw'",
						tooltip: 'Matches the full 4-byte OSC MIDI payload: portId status data1 data2.',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					const matchMode = feedback.options.matchMode;
					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					if (!Object.prototype.hasOwnProperty.call(this.onDataReceived, path)) {
						return false;
					}

					const rx_args = this.onDataReceived[path];
					const v = rx_args?.[0]?.value;

					// We expect OSC MIDI arg value to be a Buffer/Uint8Array with 4 bytes.
					const buf = Buffer.isBuffer(v) ? v : v instanceof Uint8Array ? Buffer.from(v) : null;
					if (!buf || buf.length < 4) {
						return false;
					}

					if (matchMode === 'raw') {
						const rawHex = await context.parseVariablesInString(String(feedback.options.rawHex ?? ''));
						const expected = parseHexBytes(rawHex, 4);
						if (!expected) {
							this.log('warn', `Invalid raw MIDI hex in feedback: ${rawHex}`);
							return false;
						}
						return buf.slice(0, 4).equals(expected);
					}

					// Field matching
					const portId = buf[0];
					const status = buf[1];
					const data1 = buf[2];
					const data2 = buf[3];

					const midiType = midiTypeFromStatus(status);
					const channel = (status & 0x0F) + 1;

					const wantedType = feedback.options.midiType || 'any';
					if (wantedType !== 'any' && wantedType !== midiType) {
						return false;
					}

					if (feedback.options.matchChannel === true) {
						const chanStr = await context.parseVariablesInString(String(feedback.options.channel ?? '1'));
						const wantedChannel = clampInt(chanStr, 1, 16);
						if (wantedChannel === null) return false;
						if (channel !== wantedChannel) return false;
					}

					if (feedback.options.matchData1 === true) {
						const d1Str = await context.parseVariablesInString(String(feedback.options.data1 ?? '0'));
						const wantedD1 = clampInt(d1Str, 0, 127);
						if (wantedD1 === null) return false;
						if (data1 !== wantedD1) return false;
					}

					if (feedback.options.matchData2 === true) {
						const d2Str = await context.parseVariablesInString(String(feedback.options.data2 ?? '0'));
						const wantedD2 = clampInt(d2Str, 0, 127);
						if (wantedD2 === null) return false;

						const cmp = feedback.options.comparison || 'equal';
						return evaluateComparison(data2, wantedD2, cmp);
					}

					return true;
				},
			},
			osc_feedback_multi: {
				type: 'boolean',
				name: 'Listen for OSC messages (Multiple Arguments)',
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
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					let argsStr = await context.parseVariablesInString(String(feedback.options.arguments ?? ''));
					const comparison = feedback.options.comparison;

					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					const { args, error } = parseArguments(argsStr);
					if (error) {
						this.log('warn', error);
						return false;
					}

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path];
						let comparisonResult = comparison === 'equal';
						for (let i = 0; i < args.length; i++) {
							comparisonResult = evaluateComparison(rx_args[i].value, args[i], comparison);
							if ((comparison === 'equal' && !comparisonResult) || (comparison === 'notequal' && comparisonResult)) {
								break;
							}
						}

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`);
						return comparisonResult;
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}
				},
			},
			osc_feedback_multi_specific: {
				type: 'boolean',
				name: 'Listen for OSC messages (Specific Arguments)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
						required: true,
					},
					{
						type: 'textinput',
						label: 'Argument Index (0 for first argument)',
						id: 'index',
						default: 0,
						regex: Regex.NUMBER,
						useVariables: true,
						required: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'arguments',
						default: '1',
						useVariables: true,
					},
					{
						id: 'comparison_string',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
						isVisible: (options, data) => Number.isFinite(options.arguments) === false,
						isVisibleExpression: 'isNumber($(options:arguments)) === false',
					},
					{
						id: 'comparison_number',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'greaterthan', label: '>' },
							{ id: 'lessthan', label: '<' },
							{ id: 'greaterthanequal', label: '>=' },
							{ id: 'lessthanequal', label: '<=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
						isVisible: (options, data) => Number.isFinite(options.arguments) === true,
						isVisibleExpression: 'isNumber($(options:arguments)) === true',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					const _index = await context.parseVariablesInString(String(feedback.options.index ?? ''));
					const rawValue = await context.parseVariablesInString(String(feedback.options.arguments ?? ''));

					const comparison_number = feedback.options.comparison_number;
					const comparison_string = feedback.options.comparison_string;

					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					const parseTyped = (raw) => {
						if (typeof raw === 'number' && Number.isFinite(raw)) {
							return { kind: 'number', value: raw };
						}

						if (typeof raw === 'boolean') {
							return { kind: 'boolean', value: raw };
						}

						const s = String(raw).trim();

						// boolean-like strings
						if (/^(true|false)$/i.test(s)) {
							return { kind: 'boolean', value: s.toLowerCase() === 'true' };
						}

						// strict number-like strings
						if (s !== '' && Number.isFinite(Number(s))) {
							return { kind: 'number', value: Number(s) };
						}

						return { kind: 'string', value: s };
					};

					// index must be numeric
					const idx = parseTyped(_index);
					if (idx.kind !== 'number') {
						return false;
					}
					const index = idx.value;

					if (!Object.prototype.hasOwnProperty.call(this.onDataReceived, path)) {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}

					const rx_args = this.onDataReceived[path];
					const receivedRaw = rx_args?.[index]?.value;

					const target = parseTyped(rawValue);

					// number comparison
					if (target.kind === 'number') {
						const received = Number(receivedRaw);
						if (!Number.isFinite(received)) {
							return false;
						}

						const result = evaluateComparison(received, target.value, comparison_number);
						this.log('debug', `Feedback ${feedback.id} comparison result: ${result}`);
						return result;
					}

					// boolean comparison (via string comparator)
					if (target.kind === 'boolean') {
						let receivedBool;

						if (typeof receivedRaw === 'boolean') {
							receivedBool = receivedRaw;
						} else if (typeof receivedRaw === 'string' && /^(true|false)$/i.test(receivedRaw.trim())) {
							receivedBool = receivedRaw.trim().toLowerCase() === 'true';
						} else {
							return false;
						}

						const left = receivedBool ? 'true' : 'false';
						const right = target.value ? 'true' : 'false';

						const result = evaluateComparison(left, right, comparison_string);
						this.log('debug', `Feedback ${feedback.id} comparison result: ${result}`);
						return result;
					}

					// string comparison
					const result = evaluateComparison(String(receivedRaw), target.value, comparison_string);
					this.log('debug', `Feedback ${feedback.id} comparison result: ${result}`);
					return result;
				},
			},
			osc_feedback_noargs: {
				type: 'boolean',
				name: 'Listen for OSC messages (No Arguments)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(String(feedback.options.path ?? ''));
					this.log('debug', `Evaluating feedback ${feedback.id}.`);

					if (this.onDataReceived.hasOwnProperty(path) && this.onDataReceived[path].length > 0) {
						this.log('debug', `Feedback ${feedback.id} returned true!`);
						delete this.onDataReceived[path]; // Remove the path from the dictionary to create a debounce
						return true;
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`);
						return false;
					}
				},
			}
		});
	}

	updateVariables() {
		this.setVariableDefinitions([
			{ variableId: 'latest_received_timestamp', name: 'Latest OSC message received timestamp' },
			{ variableId: 'latest_received_raw', name: 'Latest OSC message received' },
			{ variableId: 'latest_received_path', name: 'Latest OSC command received' },
			{ variableId: 'latest_received_client', name: 'Latest OSC message received client (UDP only)' },
			{ variableId: 'latest_received_port', name: 'Latest OSC message received port (UDP only)' },
			{ variableId: 'latest_received_args', name: 'Latest OSC arguments received array.' },
			{ variableId: 'latest_sent_timestamp', name: 'Latest OSC message sent timestamp' },
			{ variableId: 'latest_sent_raw', name: 'Latest OSC message sent' },
			{ variableId: 'latest_sent_path', name: 'Latest OSC command sent' },
			{ variableId: 'latest_sent_args', name: 'Latest OSC arguments sent array.' },
		]);
	}
}

runEntrypoint(OSCInstance, UpgradeScripts);
