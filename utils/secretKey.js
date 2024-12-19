const crypto = require("crypto");

const generateSecretKey = () => {
	return crypto.randomBytes(32).toString("hex");
};

const secretKey = generateSecretKey();
console.log("Generated Secret Key:", secretKey);
