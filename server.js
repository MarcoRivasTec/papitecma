require("dotenv").config();
const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const typeDefs = require("./graphql/schemas/schema");
const resolvers = require("./graphql/resolvers/resolvers");
const { poolPromises } = require("./config/dbConfig");
const jwt = require("jsonwebtoken");
const app = express();
const port = 8083;
const subdomain = "papitecma";
// const https = require("https");

let homeHost;
let tecmaHost;

const getHosts = async () => {
	if (process.env.HOST === "ZENITH") {
		const { getWiFiIPAddressHost } = require("./utils/ipaddress");
		homeHost = await getWiFiIPAddressHost();
		console.log("WiFi IP Address: ", homeHost);
	} else {
		homeHost = false;
	}

	if (process.env.HOST === "ZENITH") {
		const { getTecmaVPNIPAddressHost } = require("./utils/ipaddress");
		tecmaHost = await getTecmaVPNIPAddressHost();
		console.log("TecmaVPN IP Address: ", tecmaHost);
	} else {
		tecmaHost = false;
	}
};

getHosts();

// const sslOptions = {
// 	key: fs.readFileSync("/path/to/your/privatekey.pem"),
// 	cert: fs.readFileSync("/path/to/your/certificate.pem"),
// };

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

const server = new ApolloServer({
	typeDefs,
	resolvers,
	playground: true,
	context: async ({ req }) => {
		const pools = await Promise.all(Object.values(poolPromises));
		return { pools, user: req.user };
	},
});

server.start().then(() => {
	server.applyMiddleware({ app, path: `/${subdomain}` });

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

	if (homeHost !== false) {
		app.listen(port, homeHost, () => {
			console.log(
				`Server running at http://${homeHost}:${port}${server.graphqlPath}`
			);
		});
	}
	if (tecmaHost !== false) {
		app.listen(port, tecmaHost, () => {
			console.log(
				`Server running at http://${tecmaHost}:${port}${server.graphqlPath}`
			);
		});
	}
	app.listen(port, () => {
		console.log(
			`Server running at http://localhost:${port}${server.graphqlPath}`
		);
	});

	// https.createServer(sslOptions, app).listen(port, () => {
	// 	console.log(`Server running securely at https://tecmamovil.com:${port}/${subdomain}`);
	// });
});
