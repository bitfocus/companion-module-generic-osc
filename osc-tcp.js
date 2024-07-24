const osc = require('osc');

function sendTCPCommand(root, host, port, command, args) {
    return new Promise((resolve, reject) => {
        // Create a new TCP port
        const tcpPort = new osc.TCPSocketPort({
            address: host,
            port: port,
        });

        // Handle errors during communication
        tcpPort.on("error", (err) => {
            const errorMessage = `Error with TCP port: ${err.message}`;
            root.log('warn', errorMessage);
            tcpPort.close();
            reject(new Error(errorMessage));
        });

        // Open the socket
        tcpPort.open();

        // When the port is ready, send the OSC message
        tcpPort.on("ready", () => {
            root.log('debug', `Connected to OSC Server ${host}:${port}`);

            try {
                // Send the OSC message
                tcpPort.send({
                    address: command,
                    args: args // Ensure args have correct type and value fields
                }, host, port);

                root.log('debug', `Sent command: ${command} with args: ${JSON.stringify(args)}`);
                tcpPort.close(); // Close the connection after sending the message
                resolve();
            } catch (err) {
                root.log('warn', `Error sending OSC message: ${err.message}`);
                tcpPort.close();
                reject(new Error(err.message));
            }
        });

        // Handle port close event
        tcpPort.on("close", () => {
            root.log('debug', 'Disconnected from OSC server');
        });
    });
}

module.exports = { sendTCPCommand };