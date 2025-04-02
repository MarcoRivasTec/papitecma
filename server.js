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

const app = express();
const port = 443;
const testPort = 8083;
const subdomain = "api";
const domain = "tecmamovilconnect.com";
let host;
let localNetHost = false;
let homeHost = false;
let tecmaHost = false;

process.env.HOST === "PRODUCTION" && console.log("Loading SSL Cert");
const sslOptions =
	process.env.HOST === "PRODUCTION"
		? {
				key: fs.readFileSync(
					"C:/TECMA Services/Certificates/TECMA Movil Connect/privkey.pem"
				),
				cert: fs.readFileSync(
					"C:/TECMA Services/Certificates/TECMA Movil Connect/fullchain.pem"
				),
		  }
		: null;

const getHosts = async () => {
	if (process.env.HOST === "PRODUCTION") {
		console.log("Host mode set to PRODUCTION");
		// host = `http://${domain}`;
		host = `https://${subdomain}.${domain}`;
		console.log("Host will be: ", host);

		// authHost = "https://auth.tecmamovilconnect.com";
	} else if (process.env.HOST === "DEV") {
		console.log("Host mode set to DEV");
		const { getLocalIp } = require("./utils/ipaddress");
		localNetHost = await getLocalIp();
		console.log("Local IP Address: ", localNetHost);
		const { getWiFiIPAddressHost } = require("./utils/ipaddress");
		homeHost = await getWiFiIPAddressHost();
		console.log("WiFi IP Address: ", homeHost);
		if (homeHost) {
			console.log("Setting Env file with new address");
			// await updateEnvFile(homeHost);
		} else {
			console.log("Skipping setting env file (no ip address located)");
		}
		const { getTecmaVPNIPAddressHost } = require("./utils/ipaddress");
		tecmaHost = await getTecmaVPNIPAddressHost();
		console.log("TecmaVPN IP Address: ", tecmaHost);

		host = `http://localhost:${port}/`;
		// authHost = `http://localhost:${port}`;
	} else {
		console.log("Host mode not recognized");
		host = `http://localhost:${port}/`;
		// authHost = `http://localhost:8083`;
	}
};

console.log("Getting hosts");
getHosts();
console.log("Done getting hosts");

console.log("Applying middleware");

// Middleware to authenticate JWT token
app.use((req, res, next) => {
	const token = req.headers["authorization"];
	if (token) {
		jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
			if (err) {
				return res.status(401).json({ message: "Unauthorized" });
			} else {
				req.user = decoded;
				next();
			}
		});
	} else {
		next();
	}
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static("public"));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
// Enable CORS
app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin, X-Requested-With, Content-Type, Accept, Authorization"
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

console.log("Creating server");
const apolloServer = new ApolloServer({
	typeDefs,
	resolvers,
	playground: false,
	plugins: [
		...(process.env.HOST === "PRODUCTION"
			? [ApolloServerPluginLandingPageDisabled()]
			: []),
	],
	context: async ({ req }) => {
		const pools = await Promise.all(Object.values(poolPromises));
		return { pools, user: req.user };
	},
});

console.log("Starting server");

apolloServer.start().then(() => {
	// MiddleWare
	console.log("Applying QL");

	if (process.env.HOST === "DEV") {
		console.log("\n\nServer starting in development mode");
		apolloServer.applyMiddleware({ app, path: `/papitecma` });
		// http.createServer(app).listen(testPort, () => {
		// 	console.log(
		// 		`\nServer running on ${homeHost} and ${tecmaHost} and http://localhost:${testPort}/`
		// 	);
		// });

		app.listen(testPort, () => {
			console.log(
				`Server running at http://localhost:${testPort}${apolloServer.graphqlPath}`
			);
		});

		if (localNetHost !== false) {
			app.listen(testPort, localNetHost, () => {
				console.log(
					`\nServer running at http://${localNetHost}:${testPort}${apolloServer.graphqlPath}`
				);
			});
		}
		if (homeHost !== false) {
			app.listen(testPort, homeHost, () => {
				console.log(
					`\nServer running at http://${homeHost}:${testPort}${apolloServer.graphqlPath}`
				);
			});
		}
		if (tecmaHost !== false) {
			app.listen(testPort, tecmaHost, () => {
				console.log(
					`\nServer running at http://${tecmaHost}:${testPort}${apolloServer.graphqlPath}`
				);
			});
		}
	} else if (process.env.HOST === "PRODUCTION") {
		console.log(`QL applied to: "/"`);
		apolloServer.applyMiddleware({ app, path: `/` });
		console.log("Server starting in production mode");
		https.createServer(sslOptions, app).listen(port, () => {
			console.log(`Server running securely on ${host}`);
		});
	} else {
		console.log(`Error starting server, no host mode recognized`);
		return;
	}

	// 	// }
	// 	// app.listen(port, () => {
	// 	// 	console.log(`Server running at ${host}${server.graphqlPath}`);
	// 	// });

	// 	// https.createServer(sslOptions, app).listen(port, () => {
	// 	// 	console.log(`Server running securely at https://tecmamovil.com:${port}/${subdomain}`);
	// 	// });
});
// Export app for testing (if applicable)
// module.exports = app;
