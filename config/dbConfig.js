// dbConfig.js
const sql = require("mssql");

const configs = {
	tecmamovilcentral: {
		user: process.env.DB_USER_TECMAMOVILCENTRAL,
		password: process.env.DB_PASS_TECMAMOVILCENTRAL,
		server: process.env.DB_HOST_TECMAMOVILCENTRAL,
		port: parseInt(process.env.DB_PORT_TECMAMOVILCENTRAL, 10),
		database: process.env.DB_NAME_TECMAMOVILCENTRAL,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	tecmamovilwest: {
		user: process.env.DB_USER_TECMAMOVILWEST,
		password: process.env.DB_PASS_TECMAMOVILWEST,
		server: process.env.DB_HOST_TECMAMOVILWEST,
		port: parseInt(process.env.DB_PORT_TECMAMOVILWEST, 10),
		database: process.env.DB_NAME_TECMAMOVILWEST,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	tecmacentral: {
		user: process.env.DB_USER_TECMACENTRAL,
		password: process.env.DB_PASS_TECMACENTRAL,
		server: process.env.DB_HOST_TECMACENTRAL,
		port: parseInt(process.env.DB_PORT_TECMACENTRAL, 10),
		database: process.env.DB_NAME_TECMACENTRAL,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	kioskocentral: {
		user: process.env.DB_USER_KIOSKOCENTRAL,
		password: process.env.DB_PASS_KIOSKOCENTRAL,
		server: process.env.DB_HOST_KIOSKOCENTRAL,
		port: parseInt(process.env.DB_PORT_KIOSKOCENTRAL, 10),
		database: process.env.DB_NAME_KIOSKOCENTRAL,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	amxpro: {
		user: process.env.DB_USER_AMX,
		password: process.env.DB_PASS_AMX,
		server: process.env.DB_HOST_AMX,
		port: parseInt(process.env.DB_PORT_AMX, 10),
		database: process.env.DB_NAME_AMX,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	kioskoamx: {
		user: process.env.DB_USER_KIOSKOAMX,
		password: process.env.DB_PASS_KIOSKOAMX,
		server: process.env.DB_HOST_KIOSKOAMX,
		port: parseInt(process.env.DB_PORT_KIOSKOAMX, 10),
		database: process.env.DB_NAME_KIOSKOAMX,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	tecmawest: {
		user: process.env.DB_USER_TECMAWEST,
		password: process.env.DB_PASS_TECMAWEST,
		server: process.env.DB_HOST_TECMAWEST,
		port: parseInt(process.env.DB_PORT_TECMAWEST, 10),
		database: process.env.DB_NAME_TECMAWEST,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	kioskowest: {
		user: process.env.DB_USER_KIOSKOWEST,
		password: process.env.DB_PASS_KIOSKOWEST,
		server: process.env.DB_HOST_KIOSKOWEST,
		port: parseInt(process.env.DB_PORT_KIOSKOWEST, 10),
		database: process.env.DB_NAME_KIOSKOWEST,
		options: {
			encrypt: false,
			enableArithAbort: true,
		},
	},
	// tecma_csa: {
	// 	user: process.env.DB_USER,
	// 	password: process.env.DB_PASS,
	// 	server: process.env.DB_HOST,
	// 	database: process.env.DB_NAME_7,
	// 	options: {
	// 		encrypt: false,
	// 		enableArithAbort: true,
	// 	},
	// },
};

const poolPromises = {};

for (const [key, config] of Object.entries(configs)) {
	// console.log(`Connecting to ${key} with config: `, JSON.stringify(config, null, 1));
	poolPromises[key] = new sql.ConnectionPool(config)
		.connect()
		.then((pool) => {
			console.log(`Connected to ${key}`);
			return pool;
		})
		.catch((err) => {
			console.log(`Database Connection Failed for ${key}! Bad Config: `, err);
			throw err;
		});
}

module.exports = {
	sql,
	poolPromises,
};
