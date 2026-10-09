/* tests.js
 *
 * Unit tests for the module
 *
 * Framework: node:test
 * Assertions: node:assert
 */

import { describe, it, mock, before } from 'node:test';
import assert from 'node:assert/strict';
import osc from 'osc';
import * as helpers from './helpers.js';
import { onDataHandler } from './osc-feedback.js';
import { OSCUDPClient } from './osc-udp.js';
import { OSCTCPClient } from './osc-tcp.js';
import { OSCRawClient } from './osc-raw.js';
import OSCInstance, { UpgradeScripts } from './osc.js';

// Silence the module logger from @companion-module/base
globalThis.COMPANION_LOGGER = () => {};

// A minimal stand-in for the host, implementing the InstanceContext interface from @companion-module/base/host-api
function createTestContext() {
	return {
		_isInstanceContext: true,
		id: 'test',
		label: 'test',
		upgradeScripts: [],
		updateStatus: mock.fn(),
		setActionDefinitions: mock.fn(),
		setFeedbackDefinitions: mock.fn(),
		setVariableDefinitions: mock.fn(),
		setVariableValues: mock.fn(),
		checkAllFeedbacks: mock.fn(),
	};
}

// Create an instance and run init, returning the instance and the definitions it reported to the host
async function initInstance(config) {
	const context = createTestContext();
	const instance = new OSCInstance(context);
	await instance.init(config);

	return {
		instance,
		context,
		actions: context.setActionDefinitions.mock.calls[0].arguments[0],
		feedbacks: context.setFeedbackDefinitions.mock.calls[0].arguments[0],
	};
}

const sendOnlyConfig = { host: '127.0.0.1', targetPort: 7700, protocol: 'udp', listen: false };

describe('helpers.js', () => {
	describe('resolveHostname()', () => {
		it('resolves localhost and logs an info message', async () => {
			// Description: When the lookup succeeds, resolveHostname should resolve with the address and log.
			const root = { log: mock.fn() };

			const result = await helpers.resolveHostname(root, 'localhost');

			assert.equal(result, '127.0.0.1');
			assert.ok(root.log.mock.callCount() > 0);

			const [level, msg] = root.log.mock.calls[0].arguments;
			assert.equal(level, 'info');
			assert.ok(msg.includes('Resolved localhost to 127.0.0.1'));
		});

		it('rejects when the lookup fails', async () => {
			// Description: The .invalid TLD is reserved and never resolves (RFC 6761), so resolveHostname should reject.
			const root = { log: mock.fn() };

			await assert.rejects(helpers.resolveHostname(root, 'nonexistent.invalid'));
			assert.equal(root.log.mock.callCount(), 0);
		});
	});

	describe('isValidIPAddress()', () => {
		it('returns true for a valid IPv4 address', () => {
			// Description: net.isIP returns 4 for IPv4, which should map to true.
			assert.equal(helpers.isValidIPAddress('192.168.1.10'), true);
		});

		it('returns true for a valid IPv6 address', () => {
			// Description: net.isIP returns 6 for IPv6, which should map to true.
			assert.equal(helpers.isValidIPAddress('2001:db8::1'), true);
		});

		it('returns false for an invalid IP string', () => {
			// Description: net.isIP returns 0 for invalid input, which should map to false.
			assert.equal(helpers.isValidIPAddress('not-an-ip'), false);
		});
	});

	describe('parseArguments()', () => {
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
		function createInstance(config, targetHost) {
			return { config, targetHost, updateStatus: mock.fn() };
		}

		it('creates an OSCUDPClient when protocol is udp', () => {
			const instance = createInstance(
				{ protocol: 'udp', targetPort: 8000, feedbackPort: 8001, listen: true },
				'1.2.3.4',
			);

			helpers.setupOSC(instance);

			assert.ok(instance.client instanceof OSCUDPClient);
			assert.equal(instance.client.root, instance);
			assert.equal(instance.client.host, '1.2.3.4');
			assert.equal(instance.client.remotePort, 8000); // destination
			assert.equal(instance.client.localPort, 8001); // bound local port when listening
			assert.equal(instance.client.listen, true);
			assert.equal(instance.updateStatus.mock.callCount(), 0);
		});

		it('creates an OSCTCPClient when protocol is tcp', () => {
			const instance = createInstance({ protocol: 'tcp', targetPort: 10000, listen: false }, 'example.local');

			helpers.setupOSC(instance);

			assert.ok(instance.client instanceof OSCTCPClient);
			assert.equal(instance.client.host, 'example.local');
			assert.equal(instance.client.port, 10000);
			assert.equal(instance.client.listen, false);
		});

		it('creates an OSCRawClient when protocol is tcp-raw', () => {
			const instance = createInstance({ protocol: 'tcp-raw', targetPort: 7777, listen: true }, '10.0.0.1');

			helpers.setupOSC(instance);

			assert.ok(instance.client instanceof OSCRawClient);
			assert.equal(instance.client.host, '10.0.0.1');
			assert.equal(instance.client.port, 7777);
			assert.equal(instance.client.listen, true);
		});

		it('sets client null and marks bad_config for unknown protocol', () => {
			const instance = createInstance({ protocol: 'nope' }, 'x');

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
			const blobBuf = Buffer.from([0x63, 0x61, 0x74, 0x21]); // "cat!"
			const midiBuf = Buffer.from([0x00, 0x90, 0x45, 0x65]);

			const data = osc.writePacket(
				{
					timeTag: osc.timeTag(0),
					packets: [
						{ address: '/a', args: [{ type: 'i', value: 10 }] },
						{ address: '/f', args: [{ type: 'f', value: 1.5 }] },
						{ address: '/b', args: [{ type: 's', value: 'hi' }] },
						{ address: '/blob', args: [{ type: 'b', value: blobBuf }] },
						{ address: '/midiMessage', args: [{ type: 'm', value: midiBuf }] },
						{ address: '/boolTrue', args: [{ type: 'T', value: true }] },
						{ address: '/boolFalse', args: [{ type: 'F', value: false }] },
					],
				},
				{ metadata: true },
			);

			const root = {
				log: mock.fn(),
				onDataReceived: {},
				checkAllFeedbacks: mock.fn(),
				setVariableValues: mock.fn(),
			};

			await onDataHandler(root, Buffer.from(data));

			assert.deepEqual(root.onDataReceived['/a'], [{ type: 'i', value: 10 }]);
			assert.deepEqual(root.onDataReceived['/f'], [{ type: 'f', value: 1.5 }]);
			assert.deepEqual(root.onDataReceived['/b'], [{ type: 's', value: 'hi' }]);

			// Blob and midi: verify the raw bytes
			assert.equal(root.onDataReceived['/blob'].length, 1);
			assert.equal(root.onDataReceived['/blob'][0].type, 'b');
			assert.ok(Buffer.from(root.onDataReceived['/blob'][0].value).equals(blobBuf));

			assert.equal(root.onDataReceived['/midiMessage'].length, 1);
			assert.equal(root.onDataReceived['/midiMessage'][0].type, 'm');
			assert.ok(Buffer.from(root.onDataReceived['/midiMessage'][0].value).equals(midiBuf));

			assert.deepEqual(root.onDataReceived['/boolTrue'], [{ type: 'T', value: true }]);
			assert.deepEqual(root.onDataReceived['/boolFalse'], [{ type: 'F', value: false }]);

			// Called per element
			assert.equal(root.checkAllFeedbacks.mock.callCount(), 7);
			assert.equal(root.setVariableValues.mock.callCount(), 7);

			// latest_received_args uses the raw value list (buffers and bools included)
			const findVariablesFor = (path) =>
				root.setVariableValues.mock.calls.find((c) => c.arguments[0]?.latest_received_path === path)?.arguments[0];

			const blobVars = findVariablesFor('/blob');
			assert.ok(blobVars);
			assert.equal(blobVars.latest_received_args.length, 1);
			assert.ok(Buffer.from(blobVars.latest_received_args[0]).equals(blobBuf));

			assert.deepEqual(findVariablesFor('/boolTrue').latest_received_args, [true]);
			assert.deepEqual(findVariablesFor('/boolFalse').latest_received_args, [false]);
		});
	});
});

describe('osc.js', () => {
	describe('init()', () => {
		it('creates the client on startup when listen is disabled', async () => {
			// Description: Regression for #95, the client must be created even without feedback enabled.
			const { instance, context } = await initInstance(sendOnlyConfig);

			assert.ok(instance.client instanceof OSCUDPClient);
			assert.equal(context.updateStatus.mock.calls.at(-1).arguments[0], 'ok');
		});

		it('reports bad_config when no host is set', async () => {
			const { instance, context } = await initInstance({ ...sendOnlyConfig, host: '' });

			assert.equal(instance.client, undefined);
			assert.equal(context.updateStatus.mock.calls.at(-1).arguments[0], 'bad_config');
		});
	});

	describe('definitions', () => {
		let definitions;
		before(async () => {
			definitions = await initInstance(sendOnlyConfig);
		});

		it('only references non-expression fields from isVisibleExpression', () => {
			// Description: Fields which can be expressions cannot be referenced by isVisibleExpression in API 2.0
			const groups = { ...definitions.actions, ...definitions.feedbacks };
			for (const [id, definition] of Object.entries(groups)) {
				for (const option of definition.options) {
					assert.equal(option.isVisible, undefined, `${id}.${option.id} uses isVisible`);
					if (!option.isVisibleExpression) continue;

					for (const [, ref] of option.isVisibleExpression.matchAll(/\$\(options:(\w+)\)/g)) {
						const target = definition.options.find((o) => o.id === ref);
						assert.ok(target, `${id}.${option.id} references missing option ${ref}`);
						assert.equal(target.disableAutoExpression, true, `${id}.${option.id} references expression field ${ref}`);
					}
				}
			}
		});
	});

	describe('osc_feedback_multi_specific', () => {
		let callback, instance;
		before(async () => {
			const definitions = await initInstance(sendOnlyConfig);
			callback = definitions.feedbacks.osc_feedback_multi_specific.callback;
			instance = definitions.instance;
		});

		const check = (args, options) => {
			instance.onDataReceived['/test'] = args;
			return callback({ id: 'fb', options: { path: '/test', index: 0, ...options } }, {});
		};

		it('compares numerically', async () => {
			const received = [{ type: 'f', value: 2.5 }];
			assert.equal(await check(received, { arguments: '2.5', comparison: 'equal' }), true);
			assert.equal(await check(received, { arguments: '2', comparison: 'greaterthan' }), true);
			assert.equal(await check(received, { arguments: '3', comparison: 'greaterthanequal' }), false);
			assert.equal(await check(received, { arguments: 'abc', comparison: 'equal' }), false);
		});

		it('compares as strings', async () => {
			const received = [{ type: 's', value: 'hello' }];
			assert.equal(await check(received, { arguments: 'hello', comparison: 'equal_string' }), true);
			assert.equal(await check(received, { arguments: 'world', comparison: 'notequal_string' }), true);
			assert.equal(await check([{ type: 's', value: '01' }], { arguments: '1', comparison: 'equal_string' }), false);
		});

		it('compares booleans as strings', async () => {
			assert.equal(await check([{ type: 'T', value: true }], { arguments: 'TRUE', comparison: 'equal_string' }), true);
			assert.equal(
				await check([{ type: 'F', value: false }], { arguments: 'true', comparison: 'equal_string' }),
				false,
			);
		});
	});
});

describe('upgrades.js', () => {
	const runScript = (script, { actions = [], feedbacks = [] }) =>
		script({ currentConfig: {} }, { config: null, secrets: null, actions, feedbacks });

	const value = (v) => ({ isExpression: false, value: v });

	it('converts numeric text fields to numbers or expressions', () => {
		const result = runScript(UpgradeScripts[1], {
			actions: [
				{ id: 'a', controlId: 'c', actionId: 'send_int', options: { path: value('/x'), int: value('5') } },
				{ id: 'b', controlId: 'c', actionId: 'send_float', options: { path: value('/x'), float: value('$(local:a)') } },
				{ id: 'c', controlId: 'c', actionId: 'send_string', options: { string: value('5') } },
			],
			feedbacks: [
				{ id: 'd', controlId: 'c', feedbackId: 'osc_feedback_int', options: { arguments: value(3) } },
				{ id: 'e', controlId: 'c', feedbackId: 'osc_feedback_multi_specific', options: { index: value('1') } },
			],
		});

		assert.equal(result.updatedActions.length, 2);
		assert.deepEqual(result.updatedActions[0].options, { path: value('/x'), int: value(5) });
		assert.deepEqual(result.updatedActions[1].options.float, { isExpression: true, value: '$(local:a)' });

		assert.equal(result.updatedFeedbacks.length, 2);
		assert.deepEqual(result.updatedFeedbacks[0].options.arguments, value(3));
		assert.deepEqual(result.updatedFeedbacks[1].options.index, value(1));
	});

	it('merges the multi_specific comparison options', () => {
		const feedback = (id, args) => ({
			id,
			controlId: 'c',
			feedbackId: 'osc_feedback_multi_specific',
			options: {
				arguments: value(args),
				comparison_number: value('greaterthan'),
				comparison_string: value('notequal'),
			},
		});

		const result = runScript(UpgradeScripts[2], {
			feedbacks: [feedback('a', '5'), feedback('b', 'hello'), feedback('c', 'true')],
		});

		assert.equal(result.updatedFeedbacks.length, 3);
		assert.deepEqual(result.updatedFeedbacks[0].options, { arguments: value('5'), comparison: value('greaterthan') });
		assert.deepEqual(result.updatedFeedbacks[1].options, {
			arguments: value('hello'),
			comparison: value('notequal_string'),
		});
		assert.deepEqual(result.updatedFeedbacks[2].options.comparison, value('notequal_string'));
	});
});
