const dns = require('dns');
const net = require('net');
const OSCRawClient = require('./osc-raw.js');
const OSCTCPClient = require('./osc-tcp.js');
const OSCUDPClient = require('./osc-udp.js');

async function resolveHostname(root, hostname) {
	return new Promise((resolve, reject) => {
		dns.lookup(hostname, { family: 4 }, (err, address, family) => {
			if (err) {
				reject(err);
			} else {
				root.log('info', `Resolved ${hostname} to ${address}`);
				resolve(address);
			}
		});
	});
}

function isValidIPAddress(ip) {
	const result = net.isIP(ip);
	return result === 4 || result === 6; // Return true if it's either IPv4 or IPv6
}

function parseArguments(argsStr) {
	const rawArgs = (argsStr + '').replace(/“/g, '"').replace(/”/g, '"').split(' ');
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
					return { error: `Unmatched quote in arguments: ${str}` };
				}
			}
			args.push(str.replace(/"/g, '').replace(/'/g, ''));
		} else if (rawArgs[i].indexOf('.') > -1) {
			args.push(parseFloat(rawArgs[i]));
		} else {
			args.push(parseInt(rawArgs[i]));
		}
	}
	return { args };
}

function evaluateComparison(receivedValue, targetValue, comparison) {
	switch (comparison) {
		case 'equal':
			return receivedValue === targetValue;
		case 'greaterthan':
			return receivedValue > targetValue;
		case 'lessthan':
			return receivedValue < targetValue;
		case 'greaterthanequal':
			return receivedValue >= targetValue;
		case 'lessthanequal':
			return receivedValue <= targetValue;
		case 'notequal':
			return receivedValue !== targetValue;
		default:
			return false;
	}
}

function setupOSC(instance) {
	if (instance.config.protocol === 'udp') {
		instance.client = new OSCUDPClient(
			instance,
			instance.targetHost,
			instance.config.targetPort,
			instance.config.feedbackPort,
			instance.config.listen,
		);
	} else if (instance.config.protocol === 'tcp') {
		instance.client = new OSCTCPClient(
			instance,
			instance.targetHost,
			instance.config.targetPort,
			instance.config.listen,
		);
	} else if (instance.config.protocol === 'tcp-raw') {
		instance.client = new OSCRawClient(
			instance,
			instance.targetHost,
			instance.config.targetPort,
			instance.config.listen,
		);
	} else {
		instance.client = null;
		instance.updateStatus('bad_config');
	}
}

const clampInt = (v, min, max) => {
	const n = Number(v);
	if (!Number.isFinite(n)) return null;
	const i = Math.trunc(n);
	if (i < min || i > max) return null;
	return i;
};

const parseHexByte = (s) => {
	const cleaned = String(s || '')
		.trim()
		.replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{1,2}$/.test(cleaned)) return null;
	return parseInt(cleaned, 16);
};

const parseHexBytes = (s, expectedLen) => {
	const cleaned = String(s || '')
		.trim()
		.replace(/,/g, ' ')
		.replace(/\s+/g, ' ')
		.split(' ')
		.filter(Boolean);

	if (cleaned.length !== expectedLen) return null;

	const bytes = cleaned.map((b) => parseHexByte(b));
	if (bytes.some((b) => b === null)) return null;

	return Buffer.from(bytes);
};

const midiTypeFromStatus = (status) => {
	const hi = status & 0xf0;
	if (hi === 0x80) return 'noteoff';
	if (hi === 0x90) return 'noteon';
	if (hi === 0xa0) return 'polyaftertouch';
	if (hi === 0xb0) return 'cc';
	if (hi === 0xc0) return 'program';
	if (hi === 0xd0) return 'channelpressure';
	if (hi === 0xe0) return 'pitchbend';
	return 'unknown';
};

module.exports = {
	resolveHostname,
	isValidIPAddress,
	parseArguments,
	evaluateComparison,
	setupOSC,
	clampInt,
	parseHexByte,
	parseHexBytes,
	midiTypeFromStatus,
};
