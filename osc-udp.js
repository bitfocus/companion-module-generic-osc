const osc = require('osc');
const { onDataHandler } = require('./osc-feedback.js');

class OSCUDPClient {
	constructor(root, host, port, listen) {
		this.root = root;
		this.host = host;
		this.port = port;
		this.listen = listen;
		this.udpPort = null;
		this.connected = false;
	}

	openConnection() {
		if (this.connected) {
			this.root.log('info', 'UDP connection is already open');
			return;
		}

		return new Promise((resolve, reject) => {
			this.udpPort = new osc.UDPPort({
				localAddress: "0.0.0.0",
				localPort: this.port,
				remoteAddress: this.host,
				remotePort: this.port,
				metadata: true,
			});

			this.udpPort.on("ready", () => {
				this.root.log('info', `Connected to OSC Server ${this.host}:${this.port} via UDP`);
				this.connected = true;
				resolve();
			});

			this.udpPort.on("error", (err) => {
				const errorMessage = `Error with UDP port: ${err.message}`;
				this.root.log('warn', errorMessage);
				this.udpPort.close();
				this.connected = false;
				reject(new Error(errorMessage));
			});

			this.udpPort.on("message", (oscMessage, timeTag, info) => {
				this.root.log('debug', `Received OSC message: ${JSON.stringify(oscMessage)} from ${info.address}:${info.port}`);
				if (this.listen) {
					onDataHandler(this.root, oscMessage);
				}
			});

			this.udpPort.on("close", () => {
				this.root.log('info', 'UDP connection closed');
				this.connected = false;
			});

			// Open the UDP port
			this.udpPort.open();
		});
	}

	closeConnection() {
		if (this.udpPort && this.connected) {
			this.udpPort.close();
			this.connected = false;
			this.root.log('info', 'UDP connection closed manually');
		} else {
			this.root.log('info', 'No UDP connection to close');
		}
	}

    //The code is here but this function is not utilised.
	async sendCommand(command, args) {
		if (!this.connected) {
			this.root.log('info', 'No open UDP connection. Opening connection now...');
			await this.openConnection();
		}

		return new Promise((resolve, reject) => {
			try {
				// Send the OSC message
				this.udpPort.send({
					address: command,
					args: args // Ensure args have correct type and value fields
				}, this.host, this.port);

				this.root.log('debug', `Sent command: ${command} with args: ${JSON.stringify(args)}`);
				resolve();
			} catch (err) {
				this.root.log('warn', `Error sending OSC message: ${err.message}`);
				reject(new Error(err.message));
			}
		});
	}

	// New method to check if the client is connected
	isConnected() {
		return this.connected;
	}
}

module.exports = OSCUDPClient;
