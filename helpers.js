const dns = require('dns');
const net = require('net');

async function resolveHostname(root, hostname) {
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, { family: 4 }, (err, address, family) => {
        if (err) {
          reject(err);
        } else {
          root.log('info', `Resolved ${hostname} to ${address}`);
          resolve(address);
        }
      });
    });
  }

function isValidIPAddress(ip) {
    const result = net.isIP(ip);
    return result === 4 || result === 6; // Return true if it's either IPv4 or IPv6
}

module.exports = { resolveHostname, isValidIPAddress};