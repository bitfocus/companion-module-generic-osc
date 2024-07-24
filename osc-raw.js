const OSC = require('osc-js');
const net = require('net');

function sendRAWCommand(root, host, port, command, args) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();

        client.connect(port, host, () => {
            root.log('debug', `Connected to OSC Server ${host}:${port}`);

            // Extract the 'value' property from each object in args
            const values = args.map(arg => arg.value);

            // Create an OSC message
            const message = new OSC.Message(command, ...values);
            const binary = message.pack();

            client.write(Buffer.from(binary), (err) => {
                if (err) {
                    const errorMessage = `Error sending OSC command: ${err.message}`;
                    root.log('warn', errorMessage);
                    client.destroy();
                    reject(new Error(errorMessage));
                } else {
                    root.log('debug', `Sent command: ${command} with args: ${values.join(', ')}`);
                    client.end(); // Close the connection after sending the command
                    resolve();
                }
            });
        });

        client.on('error', (err) => {
            const errorMessage = `Error connecting to OSC server: ${err.message}`;
            root.log('warn', errorMessage);
            client.destroy();
            reject(new Error(errorMessage));
        });

        client.on('close', () => {
            root.log('debug', 'Disconnected from OSC server');
        });
    });
}

module.exports = { sendRAWCommand };
