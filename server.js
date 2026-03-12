require("dotenv").config();
const fs = require("fs");
const express = require("express");
const { ApolloServer } = require("apollo-server-express");

const typeDefs = require("./graphql/schemas/schema");
const resolvers = require("./graphql/resolvers/resolvers");

const { poolPromises } = require("./config/dbConfig");
const jwt = require("jsonwebtoken");
const { updateEnvFile } = require("./utils/updateEnv");
const path = require("path");
const http = require("http");
const https = require("https");
const { ApolloServerPluginLandingPageDisabled } = require("apollo-server-core");
const { executeParameterizedQuery } = require("./utils/dbUtils");

function getUserFromAuthHeader(req) {

	console.log("Extracting user from auth header");
	const auth = req.headers.authorization || "";
	const [scheme, token] = auth.split(" ");

	if ((scheme || "").toLowerCase() !== "bearer" || !token) {
		console.log("Invalid authorization header");
		return null;
	}

	/* -------------------------
	   1️⃣ Try TecmaMovil user token
	------------------------- */

	try {
		console.log("Trying mobile token");

		const payload = jwt.verify(token, process.env.JWT_KEY, {
			clockTolerance: 5,
		});

		if (!payload.empId || !payload.region) {
			console.log("Invalid mobile token");
			throw new Error("Invalid mobile token");
		}

		return {
			type: "user",
			empId: payload.empId,
			region: payload.region
		};

	} catch (error) {
		console.log("Error occurred while verifying mobile token:", error);
	}

	/* -------------------------
	   2️⃣ Try CSA service token
	------------------------- */

	try {
		console.log("Trying service token");
		const payload = jwt.verify(
			token,
			process.env.CSA_SERVICE_SECRET
		);

		if (!payload.scope)
			throw new Error("Invalid service token");

		console.log("Service token valid with data: ", payload);
		return {
			type: "service",
			scope: payload.scope,
			sub: payload.sub
		};

	} catch (error) {
		console.log("Error occurred while verifying service token:", error);
	}
	console.log("No valid token found, returning null user");
	return null;
}

const app = express();
const port = 443;
const testPort = 8083;
const internalPort = 50003;
const subdomain = "api";
const domain = "tecmamovilconnect.com";
let host;
let homeHost = false;
let tecmaHost = false;
let localNetHost = false;
const specificEndpoint = "";

const getHosts = async () => {
	if (process.env.HOST === "PRODUCTION") {
		console.log("Host mode set to PRODUCTION");
		host = `https://${subdomain}.${domain}`;
		console.log("Host will be: ", host);
	} else if (process.env.HOST === "DEV") {
		console.log("Host mode set to DEV");
		const {
			getLocalIp,
			getWiFiIPAddressHost,
			getTecmaVPNIPAddressHost,
		} = require("./utils/ipaddress");
		localNetHost =
			specificEndpoint === "" ? await getLocalIp() : specificEndpoint;
		console.log("Local IP Address: ", localNetHost);
		homeHost = await getWiFiIPAddressHost();
		console.log("WiFi IP Address: ", homeHost);
		if (homeHost) {
			console.log("Setting Env file with new address");
			// await updateEnvFile(homeHost);
		} else {
			console.log("Skipping setting env file (no ip address located)");
		}
		tecmaHost = await getTecmaVPNIPAddressHost();
		console.log("TecmaVPN IP Address: ", tecmaHost);

		host = `http://localhost:${port}/`;
	} else {
		console.log("Host mode not recognized");
		host = `http://localhost:${port}/`;
	}
};

console.log("Getting hosts");
getHosts();
console.log("Done getting hosts");

console.log("Applying middleware");

// Middleware to authenticate JWT token
app.use((req, _res, next) => {
	console.log("Received request for:", req.path);
	req.user = getUserFromAuthHeader(req); // may be null if no/invalid token
	next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static("public"));

// Enable CORS
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept, Authorization",
	);
	if (req.method === "OPTIONS") {
		res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
		return res.status(200).json({});
	}
	next();
});
console.log("Done applying middleware");

console.log("Apply index.html");
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/vacation-certificates/:fileName", (req, res) => {
	console.log("Requesting vacation certificate file:", req.params.fileName);
	const { fileName } = req.params;

	if (!/^Constancia_de_Vacaciones_\d+_\d{12}\.pdf$/.test(fileName)) {
		return res.status(400).send("Invalid file name.");
	}

	const filePath = path.resolve(
		__dirname,
		"../public/vacation-certificates",
		fileName,
	);

	if (!fs.existsSync(filePath)) {
		return res.status(404).send("File not found.");
	}

	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
	res.sendFile(filePath);
});

const NOTIF_SECRET = process.env.NOTIF_KEY;
const NOTIF_DIR = path.resolve(__dirname, "./public/notifications");

app.get("/download/notification", (req, res) => {
	const { token } = req.query;
	console.log("Token is: ", token);
	if (!token) return res.status(400).send("Missing token");

	try {
		const payload = jwt.verify(token, NOTIF_SECRET, { clockTolerance: 5 });
		if (payload.typ !== "download" || !payload.file) {
			return res.status(400).send("Invalid token");
		}
		if (!/^[a-zA-Z0-9._-]+$/.test(payload.file)) {
			return res.status(400).send("Invalid filename");
		}

		const filePath = path.join(NOTIF_DIR, payload.file);
		if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

		res.setHeader("Cache-Control", "no-store, max-age=0");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${payload.file}"`,
		);
		return res.sendFile(filePath);
	} catch {
		return res.status(401).send("Link expired or invalid");
	}
});

app.get("/download/loan", async (req, res) => {

	try {
		console.log("Received loan download request with query:", req.query);
		const { token } = req.query;

		if (!token)
			return res.status(400).json({ message: "Missing token" });

		let decoded;


		try {
			decoded = jwt.verify(token, process.env.FILE_DOWNLOAD_SECRET);
			console.log("Decoded data: ", decoded)
		} catch (err) {
			return res.status(403).json({ message: "Invalid or expired token" });
		}

		if (decoded.scope !== "loan_download")
			return res.status(403).json({ message: "Invalid scope" });

		const result = await executeParameterizedQuery(`
			SELECT pdf_relative_path
			FROM Loans
			WHERE loan_id = @param1
		`, [decoded.loan_id], "Error fetching Loan PDF relative path", "tecmamovilcentral");

		if (!result.length)
			return res.status(404).json({ message: "Loan not found" });

		const filePath = path.normalize(
			path.join(process.cwd(), result[0].pdf_relative_path)
		);

		if (!fs.existsSync(filePath))
			return res.status(404).json({ message: "File not found" });

		res.download(filePath);

	} catch (err) {

		console.error("Loan download error:", err);

		res.status(403).json({
			message: "Invalid or expired download token"
		});

	}

});

console.log("Creating server");
const apolloServer = new ApolloServer({
	typeDefs,
	resolvers,
	playground: false,
	plugins: [
		...(process.env.HOST === "DEV"
			// ? []
			? []
			: [ApolloServerPluginLandingPageDisabled()]),
	],
	context: async ({ req }) => {
		// const pools = await Promise.all(Object.values(poolPromises));
		const pools = {};
		// console.log("Context created with user:", req);
		return { pools, user: req.user, req };
	},
});

console.log("Starting server");

apolloServer.start().then(() => {
	// MiddleWare
	console.log("Applying QL");

	if (process.env.HOST === "DEV") {
		console.log("\n\nServer starting in development mode");
		apolloServer.applyMiddleware({ app, path: `/papitecma` });

		// app.listen(testPort, "0.0.0.0", () => {
		// 	console.log(`Server running at:`);
		// 	console.log(`http://localhost:${testPort}${apolloServer.graphqlPath}`);
		// 	console.log(`http://192.168.1.95:${testPort}${apolloServer.graphqlPath}`);
		// });

		app.listen(testPort, () => {
			console.log(
				`Server running at http://localhost:${testPort}${apolloServer.graphqlPath}`
			);
		});

		if (localNetHost !== false) {
			app.listen(testPort, localNetHost, () => {
				console.log(
					`\nLocal net host server running at http://${localNetHost}:${testPort}${apolloServer.graphqlPath}`
				);
			});
		}

		// if (homeHost !== false) {
		// 	app.listen(testPort, homeHost, () => {
		// 		console.log(
		// 			`\nHome host server running at http://${homeHost}:${testPort}${apolloServer.graphqlPath}`
		// 		);
		// 	});
		// }
		// if (tecmaHost !== false) {
		// 	app.listen(testPort, tecmaHost, () => {
		// 		console.log(
		// 			`\nTecma host server running at http://${tecmaHost}:${testPort}${apolloServer.graphqlPath}`
		// 		);
		// 	});
		// }
	} else if (process.env.HOST === "PRODUCTION") {
		console.log(`QL applied to: "/"`);
		apolloServer.applyMiddleware({ app, path: `/` });
		console.log("Server starting in production mode");
		http.createServer(app).listen(internalPort, () => {
			console.log(`\nUsing port: ${internalPort}`);
			console.log(`\nServer running on and http://api.tecmamovilconnect.com/`);
		});
	} else {
		console.log(`Error starting server, no host mode recognized`);
		return;
	}
	// console.log(`Server running securely at https://tecmamovil.com:${port}/${subdomain}`);
	// 	// });
});
// Export app for testing (if applicable)
// module.exports = app;
