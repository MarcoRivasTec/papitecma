const returnValue = (value) => {
	return value === null || value === "" ? "No definido" : value;
};

const returnZero = (value) => {
	return value === null || value === "" ? 0 : value;
};

const returnSex = (value) => {
	switch (value) {
		case null:
			return "No definido";
		case "":
			return "No definido";
		case "M":
			return "Masculino";
		case "F":
			return "Femenino";
	}
};

const returnCredStatus = (value) => {
	switch (value) {
		case null:
			return "No definido";
		case "":
			return "No definido";
		case "S":
			return "Activo";
		case "N":
			return "Inactivo";
	}
};

const returnCredType = (value) => {
	switch (value) {
		case null:
			return "No definido";
		case "":
			return "No definido";
		case "0":
			return "No definido";
		case 0:
			return "No definido";
		case "1":
			return "Porcentaje";
		case 1:
			return "Porcentaje";
		case "2":
			return "Cuota Fija";
		case 2:
			return "Cuota Fija";
		case "3":
			return "VSMG";
		case 3:
			return "VSMG";
	}
};

module.exports = { returnValue, returnZero, returnSex, returnCredStatus, returnCredType };
