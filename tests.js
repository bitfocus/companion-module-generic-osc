/* tests.js
 *
 * Unit tests for helpers.js and osc-feedback.js
 *
 * Framework: Mocha
 * Assertions: Chai
 * Stubs/Mocks: Sinon
 * Require mocking: Proxyquire
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('helpers.js', () => {
	describe('resolveHostname()', () => {
		it('resolves IPv4 address and logs an info message', async () => {
			// Description: When dns.lookup succeeds, resolveHostname should resolve with the address and log.
			const dnsMock = {
				lookup: sinon.stub().callsFake((hostname, opts, cb) => cb(null, '1.2.3.4', 4)),
			};

			const helpers = proxyquire('./helpers.js', {
				dns: dnsMock,
			});

			const root = { log: sinon.stub() };

			const result = await helpers.resolveHostname(root, 'example.com');

			expect(result).to.equal('1.2.3.4');
			expect(root.log.called).to.equal(true);

			const [level, msg] = root.log.firstCall.args;
			expect(level).to.equal('info');
			expect(msg).to.include('Resolved example.com to 1.2.3.4');
		});

		it('rejects when dns.lookup fails', async () => {
			// Description: When dns.lookup errors, resolveHostname should reject with the same error.
			const err = new Error('DNS failure');
			const dnsMock = {
				lookup: sinon.stub().callsFake((hostname, opts, cb) => cb(err)),
			};

			const helpers = proxyquire('./helpers.js', {
				dns: dnsMock,
			});

			const root = { log: sinon.stub() };

			let caught;
			try {
				await helpers.resolveHostname(root, 'example.com');
			} catch (e) {
				caught = e;
			}

			expect(caught).to.equal(err);
			expect(root.log.called).to.equal(false);
		});
	});

	describe('isValidIPAddress()', () => {
		it('returns true for a valid IPv4 address', () => {
			// Description: net.isIP returns 4 for IPv4, which should map to true.
			const helpers = require('./helpers.js');
			expect(helpers.isValidIPAddress('192.168.1.10')).to.equal(true);
		});

		it('returns true for a valid IPv6 address', () => {
			// Description: net.isIP returns 6 for IPv6, which should map to true.
			const helpers = require('./helpers.js');
			expect(helpers.isValidIPAddress('2001:db8::1')).to.equal(true);
		});

		it('returns false for an invalid IP string', () => {
			// Description: net.isIP returns 0 for invalid input, which should map to false.
			const helpers = require('./helpers.js');
			expect(helpers.isValidIPAddress('not-an-ip')).to.equal(false);
		});
	});

	describe('parseArguments()', () => {
		const helpers = require('./helpers.js');

		it('parses ints and floats correctly', () => {
			// Description: Whole numbers become ints, decimals become floats.
			const { args, error } = helpers.parseArguments('1 2 3.5 -7 -8.25 0');
			expect(error).to.equal(undefined);
			expect(args).to.deep.equal([1, 2, 3.5, -7, -8.25, 0]);
		});

		it('parses unquoted strings and strips quotes/apostrophes', () => {
			// Description: Non-numeric tokens remain strings; quotes and apostrophes are removed.
			const { args, error } = helpers.parseArguments('hello \'world\' "test"');
			expect(error).to.equal(undefined);
			expect(args).to.deep.equal(['hello', 'world', 'test']);
		});

		it('parses quoted strings with spaces as a single argument', () => {
			// Description: A token starting with " should be combined until a closing " is found.
			const { args, error } = helpers.parseArguments('"hello world" 123');
			expect(error).to.equal(undefined);
			expect(args).to.deep.equal(['hello world', 123]);
		});

		it('supports smart quotes by converting them to normal quotes', () => {
			// Description: “ ” should be converted to " so quoted parsing works.
			const { args, error } = helpers.parseArguments('“hello world” 5');
			expect(error).to.equal(undefined);
			expect(args).to.deep.equal(['hello world', 5]);
		});

		it('returns an error on unmatched quotes', () => {
			// Description: If a quoted string never closes, parseArguments returns {error}.
			const { args, error } = helpers.parseArguments('"hello world 123');
			expect(args).to.equal(undefined);
			expect(error).to.be.a('string');
			expect(error).to.include('Unmatched quote');
		});

		it('ignores extra whitespace tokens', () => {
			// Description: Multiple spaces should not create empty args.
			const { args, error } = helpers.parseArguments('1   2     "a b"    c');
			expect(error).to.equal(undefined);
			expect(args).to.deep.equal([1, 2, 'a b', 'c']);
		});
	});

	describe('evaluateComparison()', () => {
		const helpers = require('./helpers.js');

		it('supports equal', () => {
			// Description: Strict equality.
			expect(helpers.evaluateComparison(5, 5, 'equal')).to.equal(true);
			expect(helpers.evaluateComparison(5, 6, 'equal')).to.equal(false);
		});

		it('supports notequal', () => {
			// Description: Strict inequality.
			expect(helpers.evaluateComparison(5, 6, 'notequal')).to.equal(true);
			expect(helpers.evaluateComparison(5, 5, 'notequal')).to.equal(false);
		});

		it('supports greaterthan / lessthan', () => {
			// Description: Numeric comparisons.
			expect(helpers.evaluateComparison(10, 5, 'greaterthan')).to.equal(true);
			expect(helpers.evaluateComparison(1, 5, 'greaterthan')).to.equal(false);

			expect(helpers.evaluateComparison(1, 5, 'lessthan')).to.equal(true);
			expect(helpers.evaluateComparison(10, 5, 'lessthan')).to.equal(false);
		});

		it('supports greaterthanequal / lessthanequal', () => {
			// Description: Inclusive numeric comparisons.
			expect(helpers.evaluateComparison(5, 5, 'greaterthanequal')).to.equal(true);
			expect(helpers.evaluateComparison(4, 5, 'greaterthanequal')).to.equal(false);

			expect(helpers.evaluateComparison(5, 5, 'lessthanequal')).to.equal(true);
			expect(helpers.evaluateComparison(6, 5, 'lessthanequal')).to.equal(false);
		});

		it('returns false for unknown comparisons', () => {
			// Description: Default branch should be false.
			expect(helpers.evaluateComparison(1, 1, 'doesnotexist')).to.equal(false);
		});
	});

	describe('integer and range validation helpers', () => {
		const helpers = require('./helpers.js');

		describe('clampInt()', () => {
			it('accepts numeric input, truncates decimals, and returns value within bounds', () => {
				// Description: clampInt normalizes numeric input and enforces inclusive bounds.
				expect(helpers.clampInt('5', 0, 10)).to.equal(5);
				expect(helpers.clampInt(5.9, 0, 10)).to.equal(5);
				expect(helpers.clampInt(-3.1, -10, 0)).to.equal(-3);
			});

			it('rejects non-numeric, infinite, or out-of-range values', () => {
				// Description: clampInt returns null for invalid or out-of-range values.
				expect(helpers.clampInt('nope', 0, 10)).to.equal(null);
				expect(helpers.clampInt(Infinity, 0, 10)).to.equal(null);
				expect(helpers.clampInt(-1, 0, 10)).to.equal(null);
				expect(helpers.clampInt(11, 0, 10)).to.equal(null);
			});
		});
	});

	describe('hexadecimal parsing helpers (used for MIDI + blob handling)', () => {
		const helpers = require('./helpers.js');

		describe('parseHexByte()', () => {
			it('parses a single hexadecimal byte with optional 0x prefix', () => {
				// Description: Accepts 1–2 hex digits and optional 0x prefix.
				expect(helpers.parseHexByte('A')).to.equal(0x0a);
				expect(helpers.parseHexByte('0A')).to.equal(0x0a);
				expect(helpers.parseHexByte('0x0a')).to.equal(0x0a);
				expect(helpers.parseHexByte('ff')).to.equal(0xff);
			});

			it('rejects invalid hexadecimal byte representations', () => {
				// Description: Rejects empty, oversized, or non-hex strings.
				expect(helpers.parseHexByte('')).to.equal(null);
				expect(helpers.parseHexByte('0x')).to.equal(null);
				expect(helpers.parseHexByte('100')).to.equal(null);
				expect(helpers.parseHexByte('GG')).to.equal(null);
				expect(helpers.parseHexByte('0xGG')).to.equal(null);
			});
		});

		describe('parseHexBytes()', () => {
			it('parses multiple hex bytes into a Buffer when length matches', () => {
				// Description: Returns a Buffer only when the number of bytes matches expectedLen.
				const buf = helpers.parseHexBytes('00 90 45 65', 4);
				expect(Buffer.isBuffer(buf)).to.equal(true);
				expect(buf.equals(Buffer.from([0x00, 0x90, 0x45, 0x65]))).to.equal(true);
			});

			it('accepts comma-separated and irregularly spaced hex byte lists', () => {
				// Description: Normalizes commas and whitespace before parsing.
				const buf = helpers.parseHexBytes('00, 90,   45  65', 4);
				expect(buf.equals(Buffer.from([0x00, 0x90, 0x45, 0x65]))).to.equal(true);
			});

			it('rejects input when byte count does not match expected length', () => {
				// Description: Ensures exact byte length for fixed-size MIDI messages.
				expect(helpers.parseHexBytes('00 90 45', 4)).to.equal(null);
				expect(helpers.parseHexBytes('00 90 45 65 01', 4)).to.equal(null);
			});

			it('rejects input when any token is not a valid hex byte', () => {
				// Description: Any invalid byte invalidates the entire sequence.
				expect(helpers.parseHexBytes('00 90 GG 65', 4)).to.equal(null);
			});
		});
	});

	describe('MIDI message classification helpers', () => {
		const helpers = require('./helpers.js');

		describe('midiTypeFromStatus()', () => {
			it('maps MIDI status byte high nibble to a semantic message type', () => {
				// Description: Identifies MIDI message types independent of channel.
				expect(helpers.midiTypeFromStatus(0x90)).to.equal('noteon');
				expect(helpers.midiTypeFromStatus(0x80)).to.equal('noteoff');
				expect(helpers.midiTypeFromStatus(0xb3)).to.equal('cc');
				expect(helpers.midiTypeFromStatus(0xc0)).to.equal('program');
				expect(helpers.midiTypeFromStatus(0xe0)).to.equal('pitchbend');
				expect(helpers.midiTypeFromStatus(0xa0)).to.equal('polyaftertouch');
				expect(helpers.midiTypeFromStatus(0xd0)).to.equal('channelpressure');
			});

			it('returns "unknown" for unsupported or system status bytes', () => {
				// Description: System Common / System Realtime messages are not mapped here.
				expect(helpers.midiTypeFromStatus(0x00)).to.equal('unknown');
				expect(helpers.midiTypeFromStatus(0xf0)).to.equal('unknown');
			});
		});
	});

	describe('setupOSC()', () => {
		it('creates an OSCUDPClient when protocol is udp', () => {
			// setupOSC should instantiate OSCUDPClient with expected args.
			const OSCUDPClientStub = sinon.stub();
			const helpers = proxyquire('./helpers.js', {
				'./osc-udp.js': OSCUDPClientStub,
				'./osc-tcp.js': sinon.stub(),
				'./osc-raw.js': sinon.stub(),
			});

			const instance = {
				config: { protocol: 'udp', targetPort: 8000, feedbackPort: 8001, listen: true },
				targetHost: '1.2.3.4',
				updateStatus: sinon.stub(),
			};

			helpers.setupOSC(instance);

			expect(OSCUDPClientStub.calledOnce).to.equal(true);

			const [rootArg, hostArg, remotePortArg, localPortArg, listenArg] = OSCUDPClientStub.firstCall.args;

			expect(rootArg).to.equal(instance);
			expect(hostArg).to.equal('1.2.3.4');
			expect(remotePortArg).to.equal(8000); // destination
			expect(localPortArg).to.equal(8001); // bound local port when listening
			expect(listenArg).to.equal(true);

			expect(instance.client).to.be.ok;
			expect(instance.updateStatus.called).to.equal(false);
		});

		it('creates an OSCTCPClient when protocol is tcp', () => {
			// Description: setupOSC should instantiate OSCTCPClient with expected args.
			const OSCTCPClientStub = sinon.stub();
			const helpers = proxyquire('./helpers.js', {
				'./osc-udp.js': sinon.stub(),
				'./osc-tcp.js': OSCTCPClientStub,
				'./osc-raw.js': sinon.stub(),
			});

			const instance = {
				config: { protocol: 'tcp', targetPort: 10000, listen: false },
				targetHost: 'example.local',
				updateStatus: sinon.stub(),
			};

			helpers.setupOSC(instance);

			expect(OSCTCPClientStub.calledOnce).to.equal(true);
			const args = OSCTCPClientStub.firstCall.args;
			expect(args[1]).to.equal('example.local');
			expect(args[2]).to.equal(10000);
			expect(args[3]).to.equal(false);
		});

		it('creates an OSCRawClient when protocol is tcp-raw', () => {
			// Description: setupOSC should instantiate OSCRawClient with expected args.
			const OSCRawClientStub = sinon.stub();
			const helpers = proxyquire('./helpers.js', {
				'./osc-udp.js': sinon.stub(),
				'./osc-tcp.js': sinon.stub(),
				'./osc-raw.js': OSCRawClientStub,
			});

			const instance = {
				config: { protocol: 'tcp-raw', targetPort: 7777, listen: true },
				targetHost: '10.0.0.1',
				updateStatus: sinon.stub(),
			};

			helpers.setupOSC(instance);

			expect(OSCRawClientStub.calledOnce).to.equal(true);
			const args = OSCRawClientStub.firstCall.args;
			expect(args[1]).to.equal('10.0.0.1');
			expect(args[2]).to.equal(7777);
			expect(args[3]).to.equal(true);
		});

		it('sets client null and marks bad_config for unknown protocol', () => {
			// Description: For unknown protocol, setupOSC should set instance.client = null and call updateStatus("bad_config").
			const helpers = require('./helpers.js');

			const instance = {
				config: { protocol: 'nope' },
				targetHost: 'x',
				updateStatus: sinon.stub(),
			};

			helpers.setupOSC(instance);

			expect(instance.client).to.equal(null);
			expect(instance.updateStatus.calledOnce).to.equal(true);
			expect(instance.updateStatus.firstCall.args[0]).to.equal('bad_config');
		});
	});
});

describe('osc-feedback.js', () => {
	describe('onDataHandler()', () => {
		it('handles OSC bundle packets including int/float/string/blob/midi/bool', async () => {
			// Description: Bundle elements should be stored in onDataReceived and trigger feedback/variable updates per element.
			const oscMock = {
				readPacket: sinon.stub(),
				writePacket: sinon.stub(),
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

			oscMock.readPacket.returns(bundle);
			oscMock.writePacket.returns(Buffer.alloc(4));

			const { onDataHandler } = proxyquire('./osc-feedback.js', { osc: oscMock });

			const root = {
				log: sinon.stub(),
				onDataReceived: {},
				checkFeedbacks: sinon.stub().resolves(),
				setVariableValues: sinon.stub(),
			};

			await onDataHandler(root, Buffer.alloc(4));

			// Existing types
			expect(root.onDataReceived['/a']).to.deep.equal([{ type: 'i', value: 10 }]);
			expect(root.onDataReceived['/f']).to.deep.equal([{ type: 'f', value: 1.5 }]);
			expect(root.onDataReceived['/b']).to.deep.equal([{ type: 's', value: 'hi' }]);

			// Blob: verify raw Buffer bytes
			expect(root.onDataReceived['/blob']).to.have.lengthOf(1);
			expect(root.onDataReceived['/blob'][0].type).to.equal('b');
			expect(Buffer.isBuffer(root.onDataReceived['/blob'][0].value)).to.equal(true);
			expect(root.onDataReceived['/blob'][0].value.equals(blobBuf)).to.equal(true);

			// Midi: verify raw Buffer bytes
			expect(root.onDataReceived['/midiMessage']).to.have.lengthOf(1);
			expect(root.onDataReceived['/midiMessage'][0].type).to.equal('m');
			expect(Buffer.isBuffer(root.onDataReceived['/midiMessage'][0].value)).to.equal(true);
			expect(root.onDataReceived['/midiMessage'][0].value.equals(midiBuf)).to.equal(true);

			// Bools
			expect(root.onDataReceived['/boolTrue']).to.deep.equal([{ type: 'T', value: true }]);
			expect(root.onDataReceived['/boolFalse']).to.deep.equal([{ type: 'F', value: false }]);

			// Called per element
			expect(root.checkFeedbacks.callCount).to.equal(7);
			expect(root.setVariableValues.callCount).to.equal(7);

			// Spot-check that latest_received_args uses the raw value list (buffers and bools included)
			// Find the setVariableValues call corresponding to /blob
			const blobCall = root.setVariableValues.getCalls().find((c) => c.args[0]?.latest_received_path === '/blob');
			expect(blobCall).to.exist;
			expect(blobCall.args[0].latest_received_args).to.have.lengthOf(1);
			expect(Buffer.isBuffer(blobCall.args[0].latest_received_args[0])).to.equal(true);
			expect(blobCall.args[0].latest_received_args[0].equals(blobBuf)).to.equal(true);

			const midiCall = root.setVariableValues
				.getCalls()
				.find((c) => c.args[0]?.latest_received_path === '/midiMessage');
			expect(midiCall).to.exist;
			expect(Buffer.isBuffer(midiCall.args[0].latest_received_args[0])).to.equal(true);
			expect(midiCall.args[0].latest_received_args[0].equals(midiBuf)).to.equal(true);

			const trueCall = root.setVariableValues.getCalls().find((c) => c.args[0]?.latest_received_path === '/boolTrue');
			expect(trueCall).to.exist;
			expect(trueCall.args[0].latest_received_args).to.deep.equal([true]);

			const falseCall = root.setVariableValues.getCalls().find((c) => c.args[0]?.latest_received_path === '/boolFalse');
			expect(falseCall).to.exist;
			expect(falseCall.args[0].latest_received_args).to.deep.equal([false]);
		});
	});
});
