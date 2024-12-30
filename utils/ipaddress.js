const os = require("os");
const fs = require("fs");

const getWiFiIPAddressHost = async () => {
	const interfaces = os.networkInterfaces();
	for (const [name, iface] of Object.entries(interfaces)) {
		if (name === "Wi-Fi") {
			for (const alias of iface) {
				if (
					alias.family === "IPv4" &&
					!alias.internal &&
					alias.address.startsWith("192")
				) {
					// console.log(`Wi-Fi Address: ${alias.address}`);
					// // Append to the log file
					// fs.appendFileSync(
					// 	"wifi_ip_log.txt",
					// 	`Wi-Fi Address: ${alias.address}\n`
					// );
					return alias.address;
				}
			}
		}
	}
	return false; // Return a default if no match is found
};

const getTecmaVPNIPAddressHost = async () => {
	const interfaces = os.networkInterfaces();
	// console.log(interfaces);
	for (const [name, iface] of Object.entries(interfaces)) {
		if (name === "TecmaVPN") {
			for (const alias of iface) {
				if (alias.family === "IPv4" && !alias.internal) {
					// console.log(`TecmaVPN Address: ${alias.address}`);
					// Append to the log file
					// fs.appendFileSync(
					// 	"tecma_ip_log.txt",
					// 	`TecmaVPN Address: ${alias.address}\n`
					// );
					return alias.address;
				}
			}
		} else if (name === "Ethernet 4") {
			for (const alias of iface) {
				if (alias.family === "IPv4" && !alias.internal) {
					// console.log(`TecmaVPN Address: ${alias.address}`);
					// Append to the log file
					// fs.appendFileSync(
					// 	"tecma_ip_log.txt",
					// 	`TecmaVPN Address: ${alias.address}\n`
					// );
					return alias.address;
				}
			}
		}
	}
	return false; // Fallback to localhost if no external IP is found
};

module.exports = { getWiFiIPAddressHost, getTecmaVPNIPAddressHost };
