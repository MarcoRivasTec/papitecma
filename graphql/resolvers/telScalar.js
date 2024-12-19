const { GraphQLScalarType, Kind } = require("graphql");

const telScalar = new GraphQLScalarType({
	name: "Tel",
	description:
		"Telephone number with letters and characters like parentheses and dashes removed",
	serialize(value) {
		// Ensure outgoing telephone numbers are formatted as digits only
		return formatTel(value);
	},
	parseValue(value) {
		// Convert incoming string to digits-only telephone number
		return value ? formatTel(value) : null;
	},
	parseLiteral(ast) {
		if (ast.kind === Kind.STRING) {
			// Convert hard-coded AST string to digits-only telephone number
			return ast.value ? formatTel(ast.value) : null;
		}
		return null;
	},
});

function formatTel(value) {
	// If value is null or an empty string, return "No definido"
	if (value === null || value === "") {
		return "No definido";
	}
	// Remove non-digit characters
	return value.replace(/\D/g, "");
}

module.exports = telScalar;
