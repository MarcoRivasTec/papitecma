// dbConfig.js
const sql = require("mssql");

const configs = {
	tecmamovilcentral: {
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		server: process.env.DB_HOST,
		database: process.env.DB_TECMAMOVIL,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	tecmamovilwest: {
		user: process.env.DB_USER_WEST,
		password: process.env.DB_PASS_WEST,
		server: process.env.DB_HOST_WEST,
		database: process.env.DB_TECMAMOVIL,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	tecmacentral: {
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		server: process.env.DB_HOST,
		database: process.env.DB_NAME_1,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	kioskocentral: {
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		server: process.env.DB_HOST,
		database: process.env.DB_NAME_2,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	amxpro: {
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		server: process.env.DB_HOST,
		database: process.env.DB_NAME_5,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	kioskoamx: {
		user: process.env.DB_USER,
		password: process.env.DB_PASS,
		server: process.env.DB_HOST,
		database: process.env.DB_NAME_6,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	tecmawest: {
		user: process.env.DB_USER_WEST,
		password: process.env.DB_PASS_WEST,
		server: process.env.DB_HOST_WEST,
		database: process.env.DB_NAME_3,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	kioskowest: {
		user: process.env.DB_USER_WEST,
		password: process.env.DB_PASS_WEST,
		server: process.env.DB_HOST_WEST,
		database: process.env.DB_NAME_4,
		options: {
			encrypt: false, // Use encryption if needed
			enableArithAbort: true,
		},
	},
	// Add more configurations as needed
};

const poolPromises = {};

for (const [key, config] of Object.entries(configs)) {
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
