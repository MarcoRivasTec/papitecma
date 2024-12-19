const { GraphQLScalarType, Kind } = require("graphql");

const dateScalar = new GraphQLScalarType({
	name: "Date",
	description: "A valid Date value, formatted as dd-mm-yyyy",
	serialize(value) {
		if (value instanceof Date) {
			const day = String(value.getUTCDate()).padStart(2, "0");
			const month = String(value.getUTCMonth() + 1).padStart(2, "0"); // Months are zero-based
			const year = value.getUTCFullYear();
			return `${day}-${month}-${year}`;
		}
		return null;
	},
	parseValue(value) {
		// Convert incoming string to Date, stripping the time component
		return value ? parseDate(value) : null;
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			// Convert hard-coded AST string to Date, stripping the time component
			return ast.value ? parseDate(ast.value) : null;
		}
		return null;
	},
});

function parseDate(value) {
	const datePart = value.split(" ")[0];
	const [year, month, day] = datePart.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day)); // Months are zero-based
}


module.exports = dateScalar;
