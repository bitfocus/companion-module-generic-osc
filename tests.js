/* tests.js
 *
 * Unit tests for helpers.js and osc-feedback.js
 *
 * Framework: node:test
 * Assertions: node:assert
 * Require mocking: Proxyquire
 */

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const proxyquire = require('proxyquire').noCallThru();

describe('helpers.js', () => {
	describe('resolveHostname()', () => {
		it('resolves IPv4 address and logs an info message', async () => {
			// Description: When dns.lookup succeeds, resolveHostname should resolve with the address and log.
			const dnsMock = {
				lookup: mock.fn((hostname, opts, cb) => cb(null, '1.2.3.4', 4)),
			};

			const helpers = proxyquire('./helpers.js', {
				dns: dnsMock,
			});

			const root = { log: mock.fn() };

			const result = await helpers.resolveHostname(root, 'example.com');

			assert.equal(result, '1.2.3.4');
			assert.ok(root.log.mock.callCount() > 0);

			const [level, msg] = root.log.mock.calls[0].arguments;
			assert.equal(level, 'info');
			assert.ok(msg.includes('Resolved example.com to 1.2.3.4'));
		});

		it('rejects when dns.lookup fails', async () => {
			// Description: When dns.lookup errors, resolveHostname should reject with the same error.
			const err = new Error('DNS failure');
			const dnsMock = {
				lookup: mock.fn((hostname, opts, cb) => cb(err)),
			};

			const helpers = proxyquire('./helpers.js', {
				dns: dnsMock,
			});

			const root = { log: mock.fn() };

			let caught;
			try {
				await helpers.resolveHostname(root, 'example.com');
			} catch (e) {
				caught = e;
			}

			assert.equal(caught, err);
			assert.equal(root.log.mock.callCount(), 0);
		});
	});

	describe('isValidIPAddress()', () => {
		it('returns true for a valid IPv4 address', () => {
			// Description: net.isIP returns 4 for IPv4, which should map to true.
			const helpers = require('./helpers.js');
			assert.equal(helpers.isValidIPAddress('192.168.1.10'), true);
		});

		it('returns true for a valid IPv6 address', () => {
			// Description: net.isIP returns 6 for IPv6, which should map to true.
			const helpers = require('./helpers.js');
			assert.equal(helpers.isValidIPAddress('2001:db8::1'), true);
		});

		it('returns false for an invalid IP string', () => {
			// Description: net.isIP returns 0 for invalid input, which should map to false.
			const helpers = require('./helpers.js');
			assert.equal(helpers.isValidIPAddress('not-an-ip'), false);
		});
	});

	describe('parseArguments()', () => {
		const helpers = require('./helpers.js');

		it('parses ints and floats correctly', () => {
			// Description: Whole numbers become ints, decimals become floats.
			const { args, error } = helpers.parseArguments('1 2 3.5 -7 -8.25 0');
			assert.equal(error, undefined);
			assert.deepEqual(args, [1, 2, 3.5, -7, -8.25, 0]);
		});

		it('parses unquoted strings and strips quotes/apostrophes', () => {
			// Description: Non-numeric tokens remain strings; quotes and apostrophes are removed.
			const { args, error } = helpers.parseArguments('hello \'world\' "test"');
			assert.equal(error, undefined);
			assert.deepEqual(args, ['hello', 'world', 'test']);
		});

		it('parses quoted strings with spaces as a single argument', () => {
			// Description: A token starting with " should be combined until a closing " is found.
			const { args, error } = helpers.parseArguments('"hello world" 123');
			assert.equal(error, undefined);
			assert.deepEqual(args, ['hello world', 123]);
		});

		it('supports smart quotes by converting them to normal quotes', () => {
			// Description: “ ” should be converted to " so quoted parsing works.
			const { args, error } = helpers.parseArguments('“hello world” 5');
			assert.equal(error, undefined);
			assert.deepEqual(args, ['hello world', 5]);
		});

		it('returns an error on unmatched quotes', () => {
			// Description: If a quoted string never closes, parseArguments returns {error}.
			const { args, error } = helpers.parseArguments('"hello world 123');
			assert.equal(args, undefined);
			assert.equal(typeof error, 'string');
			assert.ok(error.includes('Unmatched quote'));
		});

		it('ignores extra whitespace tokens', () => {
			// Description: Multiple spaces should not create empty args.
			const { args, error } = helpers.parseArguments('1   2     "a b"    c');
			assert.equal(error, undefined);
			assert.deepEqual(args, [1, 2, 'a b', 'c']);
		});
	});

	describe('evaluateComparison()', () => {
		const helpers = require('./helpers.js');

		it('supports equal', () => {
			// Description: Strict equality.
			assert.equal(helpers.evaluateComparison(5, 5, 'equal'), true);
			assert.equal(helpers.evaluateComparison(5, 6, 'equal'), false);
		});

		it('supports notequal', () => {
			// Description: Strict inequality.
			assert.equal(helpers.evaluateComparison(5, 6, 'notequal'), true);
			assert.equal(helpers.evaluateComparison(5, 5, 'notequal'), false);
		});

		it('supports greaterthan / lessthan', () => {
			// Description: Numeric comparisons.
			assert.equal(helpers.evaluateComparison(10, 5, 'greaterthan'), true);
			assert.equal(helpers.evaluateComparison(1, 5, 'greaterthan'), false);

			assert.equal(helpers.evaluateComparison(1, 5, 'lessthan'), true);
			assert.equal(helpers.evaluateComparison(10, 5, 'lessthan'), false);
		});

		it('supports greaterthanequal / lessthanequal', () => {
			// Description: Inclusive numeric comparisons.
			assert.equal(helpers.evaluateComparison(5, 5, 'greaterthanequal'), true);
			assert.equal(helpers.evaluateComparison(4, 5, 'greaterthanequal'), false);

			assert.equal(helpers.evaluateComparison(5, 5, 'lessthanequal'), true);
			assert.equal(helpers.evaluateComparison(6, 5, 'lessthanequal'), false);
		});

		it('returns false for unknown comparisons', () => {
			// Description: Default branch should be false.
			assert.equal(helpers.evaluateComparison(1, 1, 'doesnotexist'), false);
		});
	});

	describe('integer and range validation helpers', () => {
		const helpers = require('./helpers.js');

		describe('clampInt()', () => {
			it('accepts numeric input, truncates decimals, and returns value within bounds', () => {
				// Description: clampInt normalizes numeric input and enforces inclusive bounds.
				assert.equal(helpers.clampInt('5', 0, 10), 5);
				assert.equal(helpers.clampInt(5.9, 0, 10), 5);
				assert.equal(helpers.clampInt(-3.1, -10, 0), -3);
			});

			it('rejects non-numeric, infinite, or out-of-range values', () => {
				// Description: clampInt returns null for invalid or out-of-range values.
				assert.equal(helpers.clampInt('nope', 0, 10), null);
				assert.equal(helpers.clampInt(Infinity, 0, 10), null);
				assert.equal(helpers.clampInt(-1, 0, 10), null);
				assert.equal(helpers.clampInt(11, 0, 10), null);
			});
		});
	});

	describe('hexadecimal parsing helpers (used for MIDI + blob handling)', () => {
		const helpers = require('./helpers.js');

		describe('parseHexByte()', () => {
			it('parses a single hexadecimal byte with optional 0x prefix', () => {
				// Description: Accepts 1–2 hex digits and optional 0x prefix.
				assert.equal(helpers.parseHexByte('A'), 0x0a);
				assert.equal(helpers.parseHexByte('0A'), 0x0a);
				assert.equal(helpers.parseHexByte('0x0a'), 0x0a);
				assert.equal(helpers.parseHexByte('ff'), 0xff);
			});

			it('rejects invalid hexadecimal byte representations', () => {
				// Description: Rejects empty, oversized, or non-hex strings.
				assert.equal(helpers.parseHexByte(''), null);
				assert.equal(helpers.parseHexByte('0x'), null);
				assert.equal(helpers.parseHexByte('100'), null);
				assert.equal(helpers.parseHexByte('GG'), null);
				assert.equal(helpers.parseHexByte('0xGG'), null);
			});
		});

		describe('parseHexBytes()', () => {
			it('parses multiple hex bytes into a Buffer when length matches', () => {
				// Description: Returns a Buffer only when the number of bytes matches expectedLen.
				const buf = helpers.parseHexBytes('00 90 45 65', 4);
				assert.equal(Buffer.isBuffer(buf), true);
				assert.equal(buf.equals(Buffer.from([0x00, 0x90, 0x45, 0x65])), true);
			});

			it('accepts comma-separated and irregularly spaced hex byte lists', () => {
				// Description: Normalizes commas and whitespace before parsing.
				const buf = helpers.parseHexBytes('00, 90,   45  65', 4);
				assert.equal(buf.equals(Buffer.from([0x00, 0x90, 0x45, 0x65])), true);
			});

			it('rejects input when byte count does not match expected length', () => {
				// Description: Ensures exact byte length for fixed-size MIDI messages.
				assert.equal(helpers.parseHexBytes('00 90 45', 4), null);
				assert.equal(helpers.parseHexBytes('00 90 45 65 01', 4), null);
			});

			it('rejects input when any token is not a valid hex byte', () => {
				// Description: Any invalid byte invalidates the entire sequence.
				assert.equal(helpers.parseHexBytes('00 90 GG 65', 4), null);
			});
		});
	});

	describe('MIDI message classification helpers', () => {
		const helpers = require('./helpers.js');

		describe('midiTypeFromStatus()', () => {
			it('maps MIDI status byte high nibble to a semantic message type', () => {
				// Description: Identifies MIDI message types independent of channel.
				assert.equal(helpers.midiTypeFromStatus(0x90), 'noteon');
				assert.equal(helpers.midiTypeFromStatus(0x80), 'noteoff');
				assert.equal(helpers.midiTypeFromStatus(0xb3), 'cc');
				assert.equal(helpers.midiTypeFromStatus(0xc0), 'program');
				assert.equal(helpers.midiTypeFromStatus(0xe0), 'pitchbend');
				assert.equal(helpers.midiTypeFromStatus(0xa0), 'polyaftertouch');
				assert.equal(helpers.midiTypeFromStatus(0xd0), 'channelpressure');
			});

			it('returns "unknown" for unsupported or system status bytes', () => {
				// Description: System Common / System Realtime messages are not mapped here.
				assert.equal(helpers.midiTypeFromStatus(0x00), 'unknown');
				assert.equal(helpers.midiTypeFromStatus(0xf0), 'unknown');
			});
		});
	});

	describe('setupOSC()', () => {
		it('creates an OSCUDPClient when protocol is udp', () => {
			// setupOSC should instantiate OSCUDPClient with expected args.
			const OSCUDPClientStub = mock.fn();
			const helpers = proxyquire('./helpers.js', {
				'./osc-udp.js': OSCUDPClientStub,
				'./osc-tcp.js': mock.fn(),
				'./osc-raw.js': mock.fn(),
			});

			const instance = {
				config: { protocol: 'udp', targetPort: 8000, feedbackPort: 8001, listen: true },
				targetHost: '1.2.3.4',
				updateStatus: mock.fn(),
			};

			helpers.setupOSC(instance);

			assert.equal(OSCUDPClientStub.mock.callCount(), 1);

			const [rootArg, hostArg, remotePortArg, localPortArg, listenArg] = OSCUDPClientStub.mock.calls[0].arguments;

			assert.equal(rootArg, instance);
			assert.equal(hostArg, '1.2.3.4');
			assert.equal(remotePortArg, 8000); // destination
			assert.equal(localPortArg, 8001); // bound local port when listening
			assert.equal(listenArg, true);

			assert.ok(instance.client);
			assert.equal(instance.updateStatus.mock.callCount(), 0);
		});

		it('creates an OSCTCPClient when protocol is tcp', () => {
			// Description: setupOSC should instantiate OSCTCPClient with expected args.
			const OSCTCPClientStub = mock.fn();
			const helpers = proxyquire('./helpers.js', {
				'./osc-udp.js': mock.fn(),
				'./osc-tcp.js': OSCTCPClientStub,
				'./osc-raw.js': mock.fn(),
			});

			const instance = {
				config: { protocol: 'tcp', targetPort: 10000, listen: false },
				targetHost: 'example.local',
				updateStatus: mock.fn(),
			};

			helpers.setupOSC(instance);

			assert.equal(OSCTCPClientStub.mock.callCount(), 1);
			const args = OSCTCPClientStub.mock.calls[0].arguments;
			assert.equal(args[1], 'example.local');
			assert.equal(args[2], 10000);
			assert.equal(args[3], false);
		});

		it('creates an OSCRawClient when protocol is tcp-raw', () => {
			// Description: setupOSC should instantiate OSCRawClient with expected args.
			const OSCRawClientStub = mock.fn();
			const helpers = proxyquire('./helpers.js', {
				'./osc-udp.js': mock.fn(),
				'./osc-tcp.js': mock.fn(),
				'./osc-raw.js': OSCRawClientStub,
			});

			const instance = {
				config: { protocol: 'tcp-raw', targetPort: 7777, listen: true },
				targetHost: '10.0.0.1',
				updateStatus: mock.fn(),
			};

			helpers.setupOSC(instance);

			assert.equal(OSCRawClientStub.mock.callCount(), 1);
			const args = OSCRawClientStub.mock.calls[0].arguments;
			assert.equal(args[1], '10.0.0.1');
			assert.equal(args[2], 7777);
			assert.equal(args[3], true);
		});

		it('sets client null and marks bad_config for unknown protocol', () => {
			// Description: For unknown protocol, setupOSC should set instance.client = null and call updateStatus("bad_config").
			const helpers = require('./helpers.js');

			const instance = {
				config: { protocol: 'nope' },
				targetHost: 'x',
				updateStatus: mock.fn(),
			};

			helpers.setupOSC(instance);

			assert.equal(instance.client, null);
			assert.equal(instance.updateStatus.mock.callCount(), 1);
			assert.equal(instance.updateStatus.mock.calls[0].arguments[0], 'bad_config');
		});
	});
});

describe('osc-feedback.js', () => {
	describe('onDataHandler()', () => {
		it('handles OSC bundle packets including int/float/string/blob/midi/bool', async () => {
			// Description: Bundle elements should be stored in onDataReceived and trigger feedback/variable updates per element.
			const oscMock = {
				readPacket: mock.fn(),
				writePacket: mock.fn(),
			};

			const blobBuf = Buffer.from([0x63, 0x61, 0x74, 0x21]); // "cat!"
			const midiBuf = Buffer.from([0x00, 0x90, 0x45, 0x65]);

			const bundle = {
				packets: [
					{ address: '/a', args: [{ type: 'i', value: 10 }] },
					{ address: '/f', args: [{ type: 'f', value: 1.5 }] },
					{ address: '/b', args: [{ type: 's', value: 'hi' }] },

					// blob + midi
					{ address: '/blob', args: [{ type: 'b', value: blobBuf }] },
					{ address: '/midiMessage', args: [{ type: 'm', value: midiBuf }] },

					// bools (depending on osc lib metadata: often T/F)
					{ address: '/boolTrue', args: [{ type: 'T', value: true }] },
					{ address: '/boolFalse', args: [{ type: 'F', value: false }] },
				],
			};

			oscMock.readPacket.mock.mockImplementation(() => bundle);
			oscMock.writePacket.mock.mockImplementation(() => Buffer.alloc(4));

			const { onDataHandler } = proxyquire('./osc-feedback.js', { osc: oscMock });

			const root = {
				log: mock.fn(),
				onDataReceived: {},
				checkFeedbacks: mock.fn(async () => {}),
				setVariableValues: mock.fn(),
			};

			await onDataHandler(root, Buffer.alloc(4));

			// Existing types
			assert.deepEqual(root.onDataReceived['/a'], [{ type: 'i', value: 10 }]);
			assert.deepEqual(root.onDataReceived['/f'], [{ type: 'f', value: 1.5 }]);
			assert.deepEqual(root.onDataReceived['/b'], [{ type: 's', value: 'hi' }]);

			// Blob: verify raw Buffer bytes
			assert.equal(root.onDataReceived['/blob'].length, 1);
			assert.equal(root.onDataReceived['/blob'][0].type, 'b');
			assert.equal(Buffer.isBuffer(root.onDataReceived['/blob'][0].value), true);
			assert.equal(root.onDataReceived['/blob'][0].value.equals(blobBuf), true);

			// Midi: verify raw Buffer bytes
			assert.equal(root.onDataReceived['/midiMessage'].length, 1);
			assert.equal(root.onDataReceived['/midiMessage'][0].type, 'm');
			assert.equal(Buffer.isBuffer(root.onDataReceived['/midiMessage'][0].value), true);
			assert.equal(root.onDataReceived['/midiMessage'][0].value.equals(midiBuf), true);

			// Bools
			assert.deepEqual(root.onDataReceived['/boolTrue'], [{ type: 'T', value: true }]);
			assert.deepEqual(root.onDataReceived['/boolFalse'], [{ type: 'F', value: false }]);

			// Called per element
			assert.equal(root.checkFeedbacks.mock.callCount(), 7);
			assert.equal(root.setVariableValues.mock.callCount(), 7);

			// Spot-check that latest_received_args uses the raw value list (buffers and bools included)
			// Find the setVariableValues call corresponding to /blob
			const blobCall = root.setVariableValues.mock.calls.find((c) => c.arguments[0]?.latest_received_path === '/blob');
			assert.ok(blobCall);
			assert.equal(blobCall.arguments[0].latest_received_args.length, 1);
			assert.equal(Buffer.isBuffer(blobCall.arguments[0].latest_received_args[0]), true);
			assert.equal(blobCall.arguments[0].latest_received_args[0].equals(blobBuf), true);

			const midiCall = root.setVariableValues.mock.calls.find(
				(c) => c.arguments[0]?.latest_received_path === '/midiMessage',
			);
			assert.ok(midiCall);
			assert.equal(Buffer.isBuffer(midiCall.arguments[0].latest_received_args[0]), true);
			assert.equal(midiCall.arguments[0].latest_received_args[0].equals(midiBuf), true);

			const trueCall = root.setVariableValues.mock.calls.find(
				(c) => c.arguments[0]?.latest_received_path === '/boolTrue',
			);
			assert.ok(trueCall);
			assert.deepEqual(trueCall.arguments[0].latest_received_args, [true]);

			const falseCall = root.setVariableValues.mock.calls.find(
				(c) => c.arguments[0]?.latest_received_path === '/boolFalse',
			);
			assert.ok(falseCall);
			assert.deepEqual(falseCall.arguments[0].latest_received_args, [false]);
		});
	});
});

describe('osc.js', () => {
	describe('init()', () => {
		// Load osc.js with the Companion base stubbed, capturing the instance class passed to runEntrypoint
		function loadInstanceClass(clientStubs) {
			let InstanceClass;
			const helpers = proxyquire('./helpers.js', clientStubs);
			proxyquire('./osc.js', {
				'@companion-module/base': {
					InstanceBase: class {
						log() {}
						updateStatus() {}
						setActionDefinitions() {}
						setFeedbackDefinitions() {}
						setVariableDefinitions() {}
						setVariableValues() {}
					},
					Regex: {},
					runEntrypoint: (cls) => {
						InstanceClass = cls;
					},
				},
				'./helpers.js': helpers,
			});
			return InstanceClass;
		}

		it('creates the client on startup when listen is disabled', async () => {
			// Description: Regression for #95, the client must be created even without feedback enabled.
			const OSCUDPClientStub = mock.fn();
			const OSCInstance = loadInstanceClass({
				'./osc-udp.js': OSCUDPClientStub,
				'./osc-tcp.js': mock.fn(),
				'./osc-raw.js': mock.fn(),
			});

			const instance = new OSCInstance();
			await instance.init({ host: '127.0.0.1', targetPort: 7700, protocol: 'udp', listen: false });

			assert.equal(OSCUDPClientStub.mock.callCount(), 1);
			assert.ok(instance.client);
		});
	});
});
