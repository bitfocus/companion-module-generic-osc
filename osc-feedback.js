import osc from 'osc';

function getCompleteMessageLength(buffer) {
	try {
		// Keep the type metadata, so that types such as OSC MIDI are re-encoded at their original length
		const packet = osc.readPacket(buffer, { metadata: true });
		return osc.writePacket(packet, { metadata: true }).length;
	} catch (err) {
		// Handle incomplete message
		return buffer.length + 1; // Ensure the message length exceeds buffer length to wait for more data
	}
}

async function parseOscMessages(root, buffer) {
	const packets = [];

	while (buffer.length > 0) {
		const messageLength = getCompleteMessageLength(buffer);
		if (messageLength <= buffer.length) {
			// Copy into a standalone array, as the osc library ignores the byteOffset of pooled Buffers when reading blobs
			const message = new Uint8Array(buffer.subarray(0, messageLength));
			buffer = buffer.slice(messageLength);

			try {
				let packet = osc.readPacket(message, { metadata: true });
				packets.push(packet);
			} catch (err) {
				root.log('error', `Error parsing OSC message: ${err.message}. Data: ${message}`);
			}
		} else {
			break; // Wait for more data
		}
	}

	return { remainingBuffer: buffer, packets };
}

async function onDataHandler(root, data) {
	try {
		let buffer = Buffer.alloc(0);
		buffer = Buffer.concat([buffer, data]);
		root.log('debug', `Buffer length: ${buffer.length}`);

		// Parse the OSC messages
		const { remainingBuffer, packets } = await parseOscMessages(root, buffer);
		buffer = remainingBuffer;

		root.log('debug', `Raw: ${JSON.stringify(data)}`);

		// Handle the parsed packets
		for (const packet of packets) {
			if (packet.address) {
				if (!packet.args || packet.args.length === 0) {
					root.onDataReceived[packet.address] = [{ type: 'i', value: null }];
					root.log('debug', `OSC message: ${packet.address}, args: Null (${root.onDataReceived[packet.address]})`);

					root.checkAllFeedbacks();
					//Update Variables
					root.setVariableValues({
						latest_received_raw: `${packet.address}`,
						latest_received_path: packet.address,
						latest_received_args: undefined,
						latest_received_timestamp: Date.now(),
					});

					return;
				}

				root.onDataReceived[packet.address] = packet.args;
				const args_json = JSON.stringify(packet.args);
				const args_string = packet.args.map((item) => item.value).join(' ');

				root.log('debug', `OSC message: ${packet.address}, args: ${args_json}`);

				root.checkAllFeedbacks();

				//Update Variables
				root.setVariableValues({
					latest_received_raw: `${packet.address} ${args_string}`,
					latest_received_path: packet.address,
					latest_received_args: packet.args.length ? packet.args.map((arg) => arg.value) : undefined,
					latest_received_timestamp: Date.now(),
				});
			} else if (packet.packets) {
				for (const element of packet.packets) {
					if (element.address) {
						root.onDataReceived[element.address] = element.args;
						root.log('debug', `Bundle element message: ${element.address}, args: ${JSON.stringify(element.args)}`);

						root.checkAllFeedbacks();

						//Update Variables
						root.setVariableValues({
							latest_received_raw: `${element.address} ${element.args}`,
							latest_received_path: element.address,
							latest_received_args: element.args.length ? element.args.map((arg) => arg.value) : undefined,
							latest_received_timestamp: Date.now(),
						});
					}
				}
			}
		}

		root.log('debug', `Remaining buffer length: ${buffer.length}`);
	} catch (err) {
		root.log('error', `Error handling incoming data: ${err.message}`);
	}
}

export { onDataHandler };
