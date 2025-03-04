const osc = require('osc');

function getCompleteMessageLength(buffer) {
    try {
        const packet = osc.readPacket(buffer, {});
        return osc.writePacket(packet).length;
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
            const message = buffer.slice(0, messageLength);
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
        root.log('trace', `Buffer length: ${buffer.length}`);

        // Parse the OSC messages
        const { remainingBuffer, packets } = await parseOscMessages(root, buffer);
        buffer = remainingBuffer;

        root.log('debug', `Raw: ${JSON.stringify(data)}`);

        // Handle the parsed packets
        for (const packet of packets) {
            if (packet.address) {
                root.onDataReceived[packet.address] = packet.args;
                const args_json = JSON.stringify(packet.args);
                const args_string = packet.args.map(item => item.value).join(" ");

                root.log('debug', `OSC message: ${packet.address}, args: ${args_json}`);

                await root.checkFeedbacks();

                //Update Variables
                root.setVariableValues({
                    'latest_received_raw': `${packet.address} ${args_string}`,
                    'latest_received_path': packet.address,
                    'latest_received_type': packet.type,
                    'latest_received_args': (packet.args.length > 0) ? args_json : '',
                    'latest_received_arg1': (packet.args.length > 0) ? packet.args[0].value : '',
                    'latest_received_arg2': (packet.args.length > 1) ? packet.args[1].value : '',
                    'latest_received_arg3': (packet.args.length > 2) ? packet.args[2].value : '',
                    'latest_received_arg4': (packet.args.length > 3) ? packet.args[3].value : '',
                    'latest_received_arg5': (packet.args.length > 4) ? packet.args[4].value : '',
                    'latest_received_timestamp': Date.now()
                });

            } else if (packet.packets) {
                for (const element of packet.packets) {
                    if (element.address) {
                        root.onDataReceived[element.address] = element.args;
                        root.log('debug', `Bundle element message: ${element.address}, args: ${JSON.stringify(element.args)}`);
                        
                        await root.checkFeedbacks();

                        //Update Variables
                        root.setVariableValues({
                            'latest_received_raw': `${packet.address} ${args_json}`,
                            'latest_received_path': packet.address,
                            'latest_received_type': packet.type,
                            'latest_received_args': (packet.args.length > 0) ? args_json : '',
                            'latest_received_arg1': (packet.args.length > 0) ? packet.args[0].value : '',
                            'latest_received_arg2': (packet.args.length > 1) ? packet.args[1].value : '',
                            'latest_received_arg3': (packet.args.length > 2) ? packet.args[2].value : '',
                            'latest_received_arg4': (packet.args.length > 3) ? packet.args[3].value : '',
                            'latest_received_arg5': (packet.args.length > 4) ? packet.args[4].value : '',
                            'latest_received_timestamp': Date.now()
                        });
                    }
                }
            }
        }

        root.log('trace', `Remaining buffer length: ${buffer.length}`);
    } catch (err) {
        root.log('error', `Error handling incoming data: ${err.message}`);
    }
}

module.exports = { onDataHandler };
