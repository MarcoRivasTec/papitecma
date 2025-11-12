const fs = require("fs");
const path = require("path");

const updateEnvFile = async (ip) => {
	try {
		// Define the path to the .env file
		const envFilePath = path.join(__dirname, "../../mobile/env/.env");
		console.log("Env file path is: ", envFilePath);

		// Read the existing .env file
		let envContent = fs.existsSync(envFilePath)
			? fs.readFileSync(envFilePath, "utf-8")
			: "";

		// Update the API_ENDPOINT in the .env file
		const updatedEnvContent = envContent.replace(
			/API_ENDPOINT="http:\/\/.*:8083\/papitecma"/,
			`API_ENDPOINT="http://${ip}:8083/papitecma"`
		);

		// Write the updated content back to the .env file
		fs.writeFileSync(envFilePath, updatedEnvContent, "utf-8");

		console.log(
			`.env file updated with new API_ENDPOINT: http://${ip}:8083/papitecma`
		);
	} catch (error) {
		console.error("An error occurred while updating the .env file:", error);
	}
};

module.exports = { updateEnvFile };
