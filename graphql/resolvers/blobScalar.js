const { GraphQLScalarType, Kind } = require("graphql");

const blobScalar = new GraphQLScalarType({
	name: "Blob",
	description: "A binary blob",
	parseValue(value) {
		return Buffer.from(value, "base64"); // Convert incoming string to Buffer
	},
	serialize(value) {
		return value.toString("base64"); // Convert outgoing Buffer to Base64 string
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			return Buffer.from(ast.value, "base64"); // Convert hard-coded AST string to Buffer
		}
		return null; // Invalid hard-coded value (not a string)
	},
});

module.exports = blobScalar;
