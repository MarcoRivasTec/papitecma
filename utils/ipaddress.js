const os = require("os");
const fs = require("fs");

const getLocalIp = async () => {
	const interfaces = os.networkInterfaces();
	// console.log("Network interfaces: ", interfaces);
	for (const name of Object.keys(interfaces)) {
		// console.log(`Checking interface: ${name}`);
		for (const iface of interfaces[name]) {
			// console.log(`Interface: ${name}, Address: ${iface.address}, Family: ${iface.family}, Internal: ${iface.internal}`);
			if (iface.family === "IPv4" && !iface.internal && !name.includes("vEthernet")) {
				return iface.address;
			}
		}
	}
	return false; // Fallback in case no IP is found
}

const getWiFiIPAddressHost = async () => {
	const interfaces = os.networkInterfaces();
	for (const [name, iface] of Object.entries(interfaces)) {
		if (name === "Wi-Fi") {
			for (const alias of iface) {
				if (
					alias.family === "IPv4" &&
					!alias.internal
					// && alias.address.startsWith("192")
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
	// console.log("Interfaces are: ", interfaces);
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
		} else if (name === "Ethernet 6") {
			for (const alias of iface) {
				if (alias.family === "IPv4" && !alias.internal) {
					console.log(`Local IP Address: ${alias.address}`);
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

module.exports = { getLocalIp, getWiFiIPAddressHost, getTecmaVPNIPAddressHost };
