const OSC = require('osc-js');
const net = require('net');

class OSCRawClient {
	constructor(root, host, port) {
		this.root = root;
		this.host = host;
		this.port = port;
		this.client = null;
		this.connected = false;
	}

	openConnection() {
		if (this.connected) {
			this.root.log('info', 'Connection is already open');
			return;
		}

		return new Promise((resolve, reject) => {
			this.client = new net.Socket();

			this.client.connect(this.port, this.host, () => {
				this.root.log('info', `Connected to OSC Server ${this.host}:${this.port}`);
				this.connected = true;
				resolve();
			});

			this.client.on('error', (err) => {
				const errorMessage = `Error connecting to OSC server: ${err.message}`;
				this.root.log('warn', errorMessage);
				this.client.destroy();
				this.connected = false;
				reject(new Error(errorMessage));
			});

			this.client.on('close', () => {
				this.root.log('info', 'Disconnected from OSC server');
				this.connected = false;
			});
		});
	}

	closeConnection() {
		if (this.client && this.connected) {
			this.client.end();
			this.connected = false;
			this.root.log('info', 'Connection closed manually');
		} else {
			this.root.log('info', 'No connection to close');
		}
	}

	async sendCommand(command, args) {
		if (!this.connected) {
			this.root.log('info', 'No open connection. Opening connection now...');
			await this.openConnection();
		}

		return new Promise((resolve, reject) => {
			// Extract the 'value' property from each object in args
			const values = args.map(arg => arg.value);

			// Create an OSC message
			const message = new OSC.Message(command, ...values);
			const binary = message.pack();

			this.client.write(Buffer.from(binary), (err) => {
				if (err) {
					const errorMessage = `Error sending OSC command: ${err.message}`;
					this.root.log('warn', errorMessage);
					reject(new Error(errorMessage));
				} else {
					this.root.log('debug', `Sent command: ${command} with args: ${values.join(', ')}`);
					resolve();
				}
			});
		});
	}

	// New method to check if the client is connected
	isConnected() {
		return this.connected;
	}
}

module.exports = OSCRawClient;