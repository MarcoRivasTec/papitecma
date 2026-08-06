// dbUtils.js
const { poolPromises, sql } = require("../config/dbConfig");

const executeQuery = async (query, errorMessage, dbName) => {
	try {
		// console.log("Query is: ", query);
		const pool = await poolPromises[dbName];
		const result = await pool.request().query(query);
		// console.log("executeQuery result: ", result);
		return result.recordset;
	} catch (err) {
		console.error("Error during query execution: ", err);
		throw new Error(errorMessage);
	}
};

const executeQueryNew = async (query, errorMessage, dbName) => {
	try {
		// console.log("Query is: ", query);
		const pool = await poolPromises[dbName];
		const result = await pool.request().query(query);
		// console.log("executeQueryNew result: ", result);
		return result.recordset[0];
	} catch (err) {
		console.error("Error during query execution: ", err);
		return { success: false, message: errorMessage };
		throw new Error(errorMessage);
	}
};

const executeParameterizedQueryParam7 = async (
	query,
	params,
	errorMessage,
	dbName,
) => {
	// console.log("Executing parameterized query");
	// console.log("Query: ", query);
	// console.log("Params: ", params);
	try {
		const pool = await poolPromises[dbName];
		const request = pool.request();
		// console.log("Pool requested");

		// Add parameters to the request
		params.forEach((param, index) => {
			// console.log("Before param: ", index);
			if (index === 7) {
				// console.log("Is buffer param");
				request.input(`param${index + 1}`, sql.VarBinary(sql.MAX), param);
			} else {
				// console.log("Is not buffer param");
				// console.log("Param added");
				request.input(`param${index + 1}`, param); // Bind each param with a unique name
			}
			// request.input(`param${index + 1}`, param); // Bind each param with a unique name
			// console.log("After param: ", index);
		});

		// console.log("Request object: ", request);

		const result = await request.query(query);
		// console.log("Result: ", result);
		return result.recordset;
	} catch (err) {
		// Log error if needed
		console.error("Error during parameterized query execution: ", err);
		throw new Error(errorMessage);
	}
};

const executeParameterizedQuery = async (
	query,
	params,
	errorMessage,
	dbName,
) => {
	// console.log("Executing parameterized query");
	// console.log("Query: ", query);
	// console.log("Params: ", params);
	try {
		const pool = await poolPromises[dbName];
		const request = pool.request();
		// console.log("Pool requested");

		// Add parameters to the request
		params.forEach((param, index) => {
				request.input(`param${index + 1}`, param);
		});

		// console.log("Request object: ", request);

		const result = await request.query(query);
		// console.log("Result: ", result);
		return result.recordset;
	} catch (err) {
		// Log error if needed
		console.error("Error during parameterized query execution: ", err);
		throw new Error(errorMessage);
	}
};

const executeParameterizedQueryTx = async (
	query,
	params,
	errorMessage,
	transaction,
) => {
	try {
		const request = transaction.request();

		params.forEach((param, index) => {
			request.input(`param${index + 1}`, param);
		});

		const result = await request.query(query);
		return result.recordset;
	} catch (err) {
		console.error("Error during TX query:", err);
		throw new Error(errorMessage);
	}
};

module.exports = {
	executeQuery,
	executeQueryNew,
	executeParameterizedQuery,
	executeParameterizedQueryParam7,
	executeParameterizedQueryTx,
};
