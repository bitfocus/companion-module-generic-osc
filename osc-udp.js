const osc = require('osc');
const dgram = require('dgram');
const { onDataHandler } = require('./osc-feedback.js');

class OSCUDPClient {
	constructor(root, host, port, listen) {
		this.root = root;
		this.host = host;
		this.port = port;
		this.listen = listen;
		this.udpPort = null;
		this.connected = false;
		this.socket = null;
	}

	openConnection() {
		if (this.connected) {
			this.root.log('info', 'UDP connection is already open');
			return;
		}

		return new Promise((resolve, reject) => {
			this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

			this.socket.on('error', (err) => {
				this.root.log('warn', `Socket error: ${err.message}`);
				this.socket.close();
				this.connected = false;
				reject(new Error(`Socket error: ${err.message}`));
			});

			this.socket.on('message', (msg, rinfo) => {
				this.root.log('debug', `Received UDP message from ${rinfo.address}:${rinfo.port}`);
				//const oscMessage = osc.readPacket(msg, { metadata: true });

				if (this.listen) {
					onDataHandler(this.root, msg);
				}
			});

			this.socket.bind({ address: "0.0.0.0", port: this.port }, () => {
				this.root.log('info', `Listening for OSC messages on port ${this.port} with SO_REUSEPORT`);
				this.connected = true;
				resolve();
			});
		});
	}

	closeConnection() {
		if (this.socket && this.connected) {
			this.socket.close();
			this.connected = false;
			this.root.log('info', 'UDP connection closed manually');
		} else {
			this.root.log('info', 'No UDP connection to close');
		}
	}

	//Even though this is defined, this code is not used - as Companions internal OSC sender is still used.
	async sendCommand(command, args) {
		if (!this.connected) {
			this.root.log('info', 'No open UDP connection. Opening connection now...');
			await this.openConnection();
		}

		return new Promise((resolve, reject) => {
			try {
				const message = osc.writePacket({
					address: command,
					args: args // Ensure args have correct type and value fields
				}, { metadata: true });

				this.socket.send(message, 0, message.byteLength, this.port, this.host, (err) => {
					if (err) {
						this.root.log('warn', `Error sending OSC message: ${err.message}`);
						reject(new Error(err.message));
					} else {
						this.root.log('debug', `Sent command: ${command} with args: ${JSON.stringify(args)}`);
						resolve();
					}
				});
			} catch (err) {
				this.root.log('warn', `Error sending OSC message: ${err.message}`);
				reject(new Error(err.message));
			}
		});
	}

	isConnected() {
		return this.connected;
	}
}

module.exports = OSCUDPClient;
