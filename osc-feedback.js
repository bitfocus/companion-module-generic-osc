const osc = require('osc');

let buffer = Buffer.alloc(0);

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
                let packet = osc.readPacket(message, {});
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
        buffer = Buffer.concat([buffer, data]);
        root.log('trace', `Buffer length: ${buffer.length}`);

        // Parse the OSC messages
        const { remainingBuffer, packets } = await parseOscMessages(root, buffer);
        buffer = remainingBuffer;

        // Handle the parsed packets
        for (const packet of packets) {
            if (packet.address) {
                root.onDataReceived[packet.address] = packet.args;
                root.log('debug', `OSC message: ${packet.address}, args: ${JSON.stringify(packet.args)}`);

                await root.checkFeedbacks();


            } else if (packet.packets) {
                for (const element of packet.packets) {
                    if (element.address) {
                        root.onDataReceived[element.address] = element.args;
                        root.log('debug', `Bundle element message: ${element.address}, args: ${JSON.stringify(element.args)}`);
                        
                        await root.checkFeedbacks();
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
