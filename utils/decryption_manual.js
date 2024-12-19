const CryptoJS = require("crypto-js");
const fs = require("fs");

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

const secretKey = "$kyWalk3r!";
const decryptedPassword = "cBXbrXXL3lMvmefP2U2qcQ==";
const unencryptedPassword = "153616"
// 900485
// 110212

// 91605
// 210487

// // Encrypt
// const encryptedPassword = encrypt(password, secretKey);
// console.log(`Encrypted: ${encryptedPassword}`);

// // Decrypt
const encryptedPassword = encryptOld(unencryptedPassword, secretKey);
// const decryptedPassword = decryptOld(encryptedPassword, secretKey);
console.log(`Encrypted string: ${encryptedPassword}`);

// fs.readFile("./toDecrypt.txt", "utf8", (err, data) => {
// 	if (err) throw err;

// 	// Split the content by line
// 	const lines = data.split("\n");

// 	// Loop through each line and decrypt it
// 	lines.forEach((line) => {
// 		if (line.trim()) {
// 			const decrypted = decryptOld(line.trim(), secretKey);
// 			console.log(`Decrypted string: ${decrypted}`);
// 		}
// 	});
// });

// Example usage
// const encryptedText = 'QHc6GB6PVD80cmuiyEkqfQ==';
// const magKey = '$kyWalk3r!';
// const decrypted = descifrar(encryptedText, magKey);
// console.log(decrypted);
