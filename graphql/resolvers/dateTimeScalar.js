const { GraphQLScalarType, Kind } = require("graphql");

const dateTimeScalar = new GraphQLScalarType({
	name: "DateTime",
	description: "A valid DateTime value, formatted as yyyy-mm-dd hh:mm:ss.sss",
	serialize(value) {
		if (value instanceof Date) {
			const day = String(value.getUTCDate()).padStart(2, "0");
			const month = String(value.getUTCMonth() + 1).padStart(2, "0"); // Months are zero-based
			const year = value.getUTCFullYear();
			const hours = String(value.getUTCHours()).padStart(2, "0");
			const minutes = String(value.getUTCMinutes()).padStart(2, "0");
			const seconds = String(value.getUTCSeconds()).padStart(2, "0");
			const milliseconds = String(value.getUTCMilliseconds()).padStart(3, "0");
			return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
		}
		return null;
	},
	parseValue(value) {
		// Convert incoming string to Date, including time component
		return value ? parseDate(value) : null;
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			// Convert hard-coded AST string to Date, including time component
			return ast.value ? parseDate(ast.value) : null;
		}
		return null;
	},
});

function parseDate(value) {
	const [datePart, timePart] = value.split(" ");
	const [year, month, day] = datePart.split("-").map(Number);
	const [hours, minutes, seconds] = timePart.split(":").map(Number);
	const milliseconds = Number((seconds % 1).toFixed(3).substring(2)) || 0; // Extract milliseconds if present
	return new Date(
		Date.UTC(
			year,
			month - 1,
			day,
			hours,
			minutes,
			Math.floor(seconds),
			milliseconds
		)
	);
}

module.exports = dateTimeScalar;
