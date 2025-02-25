const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");

// Cartas: guarderia, visa, prestamo, trabajo, permiso
async function generateLetterPDF({ data }) {
	handlebars.registerHelper("eq", function (a, b) {
		return a === b;
	});

	handlebars.registerHelper("orEquals", function (variable, ...args) {
		// Remove the last argument which is the Handlebars options object
		const options = args.pop();

		// Check if the variable matches any of the provided values
		return args.some((value) => variable === value);
	});

	// const outputDir = path.join(__dirname, "../pdfs/");
	// const outputPath = path.join(outputDir, "CartaTrabajo.pdf");

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/letterTemplate.html"),
		"utf8"
	);

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template(data);

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });

	// Generate the PDF as a buffer
	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});
	console.log("Generated pdf file");

	await browser.close();

	return Buffer.from(pdfUint8Array);
}

async function generateAdjustmentPDF({ data }) {
	handlebars.registerHelper("eq", function (a, b) {
		return a === b;
	});

	handlebars.registerHelper("orEquals", function (variable, ...args) {
		// Remove the last argument which is the Handlebars options object
		const options = args.pop();

		// Check if the variable matches any of the provided values
		return args.some((value) => variable === value);
	});
	// console.log("Data: ", data);
	// return;
	const outputDir = path.join(__dirname, "../pdfs/");
	const outputPath = path.join(outputDir, `AjustePrenomina.pdf`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/adjustmentTemplate.html"),
		"utf8"
	);

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template(data);

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });
	// await browser.close();
	// return;
	// Generate the PDF as a buffer
	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});
	console.log("Generated pdf file");

	await browser.close();

	return Buffer.from(pdfUint8Array);

	console.log(Buffer.isBuffer(pdfBuffer));
	console.log("After checkingbuffer1");

	console.log(Buffer.isBuffer(pdfBuffer));
	console.log("After checkingbuffer 2");
	return pdfBuffer;
}

async function generatePermitPDF({ data }) {
	handlebars.registerHelper("eq", function (a, b) {
		return a === b;
	});

	handlebars.registerHelper("orEquals", function (variable, ...args) {
		// Remove the last argument which is the Handlebars options object
		const options = args.pop();

		// Check if the variable matches any of the provided values
		return args.some((value) => variable === value);
	});

	// const outputDir = path.join(__dirname, "../pdfs/");
	// const outputPath = path.join(outputDir, `PermisoDias.pdf`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/permitTemplate.html"),
		"utf8"
	);

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template(data);

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// await page.pdf({
	// 	// path: outputPath,
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });

	// Generate the PDF as a buffer
	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});
	console.log("Generated pdf file");

	await browser.close();

	return Buffer.from(pdfUint8Array);
}

async function generateVacationsPDF({ data }) {
	handlebars.registerHelper("eq", function (a, b) {
		return a === b;
	});

	handlebars.registerHelper("orEquals", function (variable, ...args) {
		// Remove the last argument which is the Handlebars options object
		const options = args.pop();

		// Check if the variable matches any of the provided values
		return args.some((value) => variable === value);
	});

	// const outputDir = path.join(__dirname, "../pdfs/");
	// const outputPath = path.join(outputDir, `Vacaciones.pdf`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/vacationsTemplate.html"),
		"utf8"
	);

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template(data);

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });

	// Generate the PDF as a buffer
	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});
	console.log("Generated pdf file");

	await browser.close();

	return Buffer.from(pdfUint8Array);
}

// Alta IMSS
async function generateIMSSPDF({ data }) {
	// const outputDir = path.join(__dirname, "../pdfs/");
	// const outputPath = path.join(outputDir, "CartaTrabajo.pdf");

	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	const htmlContent = fs.readFileSync(
		path.join(__dirname, "./letterTemplate.html"),
		"utf8"
	);

	// const template = handlebars.compile(htmlTemplate);
	// const htmlContent = template({ name, date });

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// Generate the PDF as a buffer
	const pdfBuffer = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });

	await browser.close();

	return pdfBuffer;
}

// Prestamo Fondo Ahorro
async function generateSavingsLoanPDF({ data }) {
	const outputDir = path.join(__dirname, "../pdfs/");
	const outputPath = path.join(outputDir, `PtmoFA.pdf`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/loanTemplate.html"),
		"utf8"
	);

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template(data);

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });

	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});
	console.log("Generated pdf file");

	await browser.close();

	return Buffer.from(pdfUint8Array);
}

// Retiro Fondo Ahorro
async function generateSavingWithdrawPDF({ data }) {
	// const outputDir = path.join(__dirname, "../pdfs/");
	// const outputPath = path.join(outputDir, "RetiroFA.pdf");

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/withdrawTemplate.html"),
		"utf8"
	);

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template(data);

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// Generate the PDF as a buffer
	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });

	await browser.close();

	return Buffer.from(pdfUint8Array);
}

async function generatePayrollPDF({ data, payroll }) {
	// const outputDir = path.join(__dirname, "../pdfs/");
	// const outputPath = path.join(outputDir, `ReciboDeNomina.pdf`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless=old"],
	});
	const page = await browser.newPage();

	console.log("Payroll: ", payroll);
	const htmlTemplate = fs.readFileSync(
		path.join(__dirname, "./templates/payrollTemplate.html"),
		"utf8"
	);

	const percepcionesRows = payroll
		.filter((item) => item.tipo === 1)
		.map((item) => `<tr><td>${item.concepto}</td><td>${item.importe}</td></tr>`)
		.join("");

	const deduccionesRows = payroll
		.filter((item) => item.tipo === 2)
		.map((item) => `<tr><td>${item.concepto}</td><td>${item.importe}</td></tr>`)
		.join("");

	const template = handlebars.compile(htmlTemplate);
	const htmlContent = template({
		...data,
		percepcionesRows,
		deduccionesRows,
	});

	await page.setContent(htmlContent, { waitUntil: "networkidle0" });

	// await page.pdf({
	// 	path: outputPath, // Output path
	// 	format: "LETTER", // Paper format
	// 	printBackground: true, // Print CSS backgrounds
	// });
	// await browser.close();
	// return;
	// Generate the PDF as a buffer
	const pdfUint8Array = await page.pdf({
		format: "LETTER",
		printBackground: true,
	});
	console.log("Generated pdf file");

	await browser.close();

	return Buffer.from(pdfUint8Array);

	console.log(Buffer.isBuffer(pdfBuffer));
	console.log("After checkingbuffer1");

	console.log(Buffer.isBuffer(pdfBuffer));
	console.log("After checkingbuffer 2");
	return pdfBuffer;
}

module.exports = {
	generateLetterPDF,
	generateAdjustmentPDF,
	generatePermitPDF,
	generateVacationsPDF,
	generateIMSSPDF,
	generateSavingsLoanPDF,
	generateSavingWithdrawPDF,
	generatePayrollPDF,
};
