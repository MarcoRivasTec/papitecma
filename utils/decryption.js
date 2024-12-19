const CryptoJS = require("crypto-js");

function decryptOld(encString, oldKey) {
	// Ensure the magKey is base64 encoded as in the C# function
	const str = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(oldKey));

	// Use the key for decryption
	const key = CryptoJS.enc.Utf8.parse(str);

	// Decrypt the input
	const decrypted = CryptoJS.AES.decrypt(encString, key, {
		mode: CryptoJS.mode.ECB,
		padding: CryptoJS.pad.Pkcs7,
	});

	// Convert the decrypted data to ASCII string
	const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);

	return decryptedString;
}

function encryptOld(stringToEncrypt, oldKey) {
    // Ensure the magKey is base64 encoded as in the C# function
	const str = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(oldKey));

	// Use the key for encryption
	const key = CryptoJS.enc.Utf8.parse(str);

	// Encrypt the input
	const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(stringToEncrypt), key, {
		mode: CryptoJS.mode.ECB,
		padding: CryptoJS.pad.Pkcs7,
	});

	// Convert the encrypted data to a Base64 string
	const encryptedString = encrypted.toString();

	return encryptedString;
}

const crypto = require("crypto");

const encrypt = (text, secretKey) => {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv(
		"aes-256-cbc",
		Buffer.from(secretKey, "hex"),
		iv
	);
	let encrypted = cipher.update(text, "utf8", "base64");
	encrypted += cipher.final("base64");
	return `${iv.toString("base64")}:${encrypted}`;
};

// Function to decrypt and decode from Base64
const decrypt = (encryptedText, secretKey) => {
	const [iv, encrypted] = encryptedText.split(":");
	const decipher = crypto.createDecipheriv(
		"aes-256-cbc",
		Buffer.from(secretKey, "hex"),
		Buffer.from(iv, "base64")
	);
	let decrypted = decipher.update(encrypted, "base64", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
};

module.exports = {
	decryptOld,
	encryptOld,
	decrypt,
	encrypt,
}