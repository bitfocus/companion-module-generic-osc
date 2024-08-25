const osc = require('osc');
const { onDataHandler } = require('./osc-feedback.js');

class OSCTCPClient {
	constructor(root, host, port, listen) {
		this.root = root;
		this.host = host;
		this.port = port;
		this.listen = listen;
		this.tcpPort = null;
		this.connected = false;
	}

	openConnection() {
		if (this.connected) {
			this.root.log('info', 'TCP connection is already open');
			return;
		}

		return new Promise((resolve, reject) => {
            this.root.updateStatus('connecting');
			this.tcpPort = new osc.TCPSocketPort({
				address: this.host,
				port: this.port,
			});

			this.tcpPort.on("error", (err) => {
				const errorMessage = `Error with TCP port: ${err.message}`;
				this.tcpPort.close();
				this.connected = false;
        this.root.updateStatus('connection_failure');
				reject(new Error(errorMessage));
			});

			this.tcpPort.on("ready", () => {
				this.root.log('info', `Connected to OSC Server ${this.host}:${this.port}`);
				this.connected = true;
        this.root.updateStatus('ok');
				resolve();
			});

			this.tcpPort.on("data", async (data) => {
				if (this.listen) {
					onDataHandler(this.root, data);
				}
			});
      
			this.tcpPort.on("close", () => {
				this.root.log('info', 'Disconnected from OSC server');
				this.connected = false;
			});

			// Open the TCP port
			this.tcpPort.open();
		});
	}

	closeConnection() {
        if (!this.tcpPort || !this.connected) {
            this.root.log('debug', 'No TCP connection to close');
            return;
        }

        return new Promise((resolve, reject) => {
            this.tcpPort.close();
            this.connected = false;
            
            if (this.listen) {
				this.root.updateStatus('disconnected');
			}

            this.root.log('info', 'TCP connection closed manually');
            resolve();
        });
	}

	async sendCommand(command, args) {
		if (!this.connected) {
			this.root.log('info', 'No open TCP connection. Opening connection now...');
			await this.openConnection();
		}

		return new Promise((resolve, reject) => {
			try {
				// Send the OSC message
				this.tcpPort.send({
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

module.exports = OSCTCPClient;
