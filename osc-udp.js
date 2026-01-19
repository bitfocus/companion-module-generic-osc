const osc = require('osc');
const dgram = require('dgram');
const { onDataHandler } = require('./osc-feedback.js');

class OSCUDPClient {
	constructor(root, host, remotePort, localPort, listen) {
		this.root = root;
		this.host = host;
		this.remotePort = remotePort;
		this.localPort = localPort;
		this.listen = listen;
		this.udpPort = null;
		this.connected = false;
		this.socket = null;
	}

	openConnection() {
		if (this.connected) {
			this.root.log('info', 'UDP connection is already open');
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			this.root.updateStatus('connecting');
			this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

			this.socket.on('error', (err) => {
				this.root.log('warn', `Socket error: ${err.message}`);
				try {
					this.socket.close();
				} catch (_) {
					// ignore
				}
				this.connected = false;
				this.root.updateStatus('connection_failure');
				reject(new Error(`Socket error: ${err.message}`));
			});

			this.socket.on('message', (msg, rinfo) => {
				this.root.log('debug', `Received UDP message from ${rinfo.address}:${rinfo.port}`);

				this.root.setVariableValues({
					latest_received_client: rinfo.address,
					latest_received_port: rinfo.port,
				});

				if (this.listen) {
					onDataHandler(this.root, msg);
				}
			});

			// If not listening, do not bind => ephemeral source port.
			// This is valid for sending-only use cases.
			if (!this.listen) {
				this.connected = true;
				this.root.updateStatus('ok');
				this.root.log('info', 'UDP socket opened (ephemeral source port; not bound)');
				resolve();
				return;
			}

			// If listening, bind to localPort => fixed source port for replies.
			// (Devices that "reply to sender" will send back to this port.)
			const lp = Number(this.localPort);
			if (!Number.isInteger(lp) || lp <= 0 || lp > 65535) {
				this.connected = false;
				this.root.updateStatus('connection_failure');
				reject(new Error('localPort must be a valid UDP port (1-65535) when listen=true'));
				return;
			}

			this.socket.bind({ address: '0.0.0.0', port: lp }, () => {
				this.connected = true;
				this.root.updateStatus('ok');
				this.root.log('info', `Listening for OSC messages on 0.0.0.0:${lp} (fixed source port)`);
				resolve();
			});
		});
	}

	closeConnection() {
		if (!this.socket || !this.connected) {
			this.root.log('debug', 'No UDP connection to close');
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			try {
				this.socket.close();
			} catch (_) {
				// ignore
			}
			this.connected = false;
			this.root.log('info', 'UDP connection closed manually');

			if (this.listen) {
				this.root.updateStatus('disconnected');
			}

			resolve();
		});
	}

	async sendCommand(command, args = []) {
		if (!this.connected) {
			this.root.log('info', 'No open UDP connection. Opening connection now...');
			await this.openConnection();
		}

		return new Promise((resolve, reject) => {
			try {
				const message = osc.writePacket(
					{
						address: command,
						args: args,
					},
					{ metadata: true },
				);

				// Send to REMOTE destination port (remotePort), NOT the bound localPort
				this.socket.send(message, 0, message.byteLength, this.remotePort, this.host, (err) => {
					if (err) {
						this.root.log('warn', `Error sending OSC message: ${err.message}`);
						reject(new Error(err.message));
						return;
					}

					this.root.log('debug', `Sent command: ${command} with args: ${JSON.stringify(args)}`);

					// If we did not bind (listen=false), we can still report what ephemeral port got chosen
					// once the socket has been used.
					let localRememberedPort;
					try {
						localRememberedPort = this.socket?.address?.()?.port;
					} catch (_) {
						localRememberedPort = undefined;
					}

					// Update Variables (keep same variable keys as your previous version)
					const args_string = (args || []).map((item) => item?.value).join(' ');

					this.root.setVariableValues({
						latest_sent_raw: `${command} ${args_string}`.trim(),
						latest_sent_path: command,
						latest_sent_args: args?.length ? args.map((arg) => arg.value) : undefined,
						latest_sent_timestamp: Date.now(),
					});

					resolve();
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
