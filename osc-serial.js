const osc = require('osc');
const { SerialPort } = require('serialport')

async function getSerialPortChoices(root) {
    try {
        const ports = await listSerialPorts(root);
        return ports; // ports are already in { id, label } format
    } catch (error) {
        root.log('warn', `Error fetching serial ports: ${error}`);
        return [];
    }
}

function listSerialPorts(root) {
    return SerialPort.list()
        .then(ports => {
            return ports.map(port => ({
                id: port.path, // Ensure 'id' is the unique identifier (device path)
                label: `${port.manufacturer || port.path} ${port.serialNumber || ''}`.trim() // Concatenate manufacturer and serial number
            }));
        })
        .catch(err => {
            root.log('warn', `Error listing serial ports: ${err}`);
            return [];
        });
}

function sendSerialCommand(root, host, command, args) {
    return new Promise((resolve, reject) => {
        // Create a new TCP port

        const serialPort = new osc.SerialPort({
            devicePath: host, //"/dev/cu.usbmodem22131",
            metadata: true
        });

        // Handle errors during communication
        serialPort.on("error", (err) => {
            const errorMessage = `Error with Serial port: ${err.message}`;
            root.log('warn', errorMessage);
            serialPort.close();
            reject(new Error(errorMessage));
        });

        // Open the socket
        serialPort.open();

        // When the port is ready, send the OSC message
        serialPort.on("ready", () => {
            root.log('debug', `Connected to OSC Server ${host}`);

            try {
                // Send the OSC message
                serialPort.send({
                    address: command,
                    args: args // Ensure args have correct type and value fields
                }, host, port);

                root.log('debug', `Sent command: ${command} with args: ${JSON.stringify(args)}`);
                serialPort.close(); // Close the connection after sending the message
                resolve();
            } catch (err) {
                root.log('warn', `Error sending OSC message: ${err.message}`);
                serialPort.close();
                reject(new Error(err.message));
            }
        });

        // Handle port close event
        serialPort.on("close", () => {
            root.log('debug', 'Disconnected from OSC server');
        });
    });
}

module.exports = { sendSerialCommand, getSerialPortChoices };