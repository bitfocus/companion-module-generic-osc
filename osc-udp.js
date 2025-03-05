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
			this.root.updateStatus('connecting');
			this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

			this.socket.on('error', (err) => {
				this.root.log('warn', `Socket error: ${err.message}`);
				this.socket.close();
				this.connected = false;
				this.root.updateStatus('connection_failure');
				reject(new Error(`Socket error: ${err.message}`));
			});

			this.socket.on('message', (msg, rinfo) => {
				this.root.log('debug', `Received UDP message from ${rinfo.address}:${rinfo.port}`);

				this.root.setVariableValues({
                    'latest_received_client': rinfo.address,
					'latest_received_port': rinfo.port
                });

				if (this.listen) {
					onDataHandler(this.root, msg);
				}
			});

			this.socket.bind({ address: "0.0.0.0", port: this.port }, () => {
				this.root.log('info', `Listening for OSC messages on port ${this.port} with SO_REUSEPORT`);
				this.connected = true;
				this.root.updateStatus('ok');
				resolve();
			});
		});
	}

	closeConnection() {
        if (!this.socket || !this.connected) {
            this.root.log('debug', 'No UDP connection to close');
            return;
        }

        return new Promise((resolve, reject) => {
            this.socket.close();
            this.connected = false;
            this.root.log('info', 'UDP connection closed manually');

			if (this.listen) {
				this.root.updateStatus('disconnected');
			}
			
            resolve();
        });
	}

	//Even though it is defined, this code is not used - as Companion's internal OSC sender is still used.
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

						//Update Variables
						const args_string = args.map(item => item.value).join(" ");

						this.root.setVariableValues({
							'latest_sent_raw': `${command} ${args_string}`,
							'latest_sent_path': command,
							'latest_sent_args': (args.length > 0) ? args : 'undefined',
							'latest_sent_timestamp': Date.now()
						});

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
