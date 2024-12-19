const { gql } = require("apollo-server-express");

// type RFC {
// 	RFC: String
// }

// RFC(numEmp: String!, region: String!): RFC

const typeDefs = gql`
	scalar Date
	scalar DateTime
	scalar Tel
	scalar Blob

	type UserFind {
		nip: String!
	}

	type Token {
		token: String!
		name: String!
	}

	type ImageBlob {
		image: Blob!
	}

	type UserInfo {
		apellido_pat: String!
		apellido_mat: String!
		sexo: String!
		razon: String!
		planta: String!
		planta_id: String!
		area: String!
		proyecto: String!
		supervisor: String!
		nomina: String!
		puesto: String!
		puesto_id: String!
		turno: String!
		clasificacion: String!
	}

	type Identificacion {
		rfc: String
		curp: String
		imss: String
		genero: String
		edocivil: String
		cuenta: String
	}

	type Domicilio {
		calle: String
		numext: String
		col: String
		tel: Tel
	}

	type Infonavit {
		credito: String
		tipo: String
		tasa: Float
		estatus: String
	}

	type Familiares {
		nombre: String!
		parentesco: String!
		fec_nac: Date!
		sexo: String!
		fec_act: DateTime!
	}

	type TallasList {
		tipo: Int!
		medida: String!
		eu_medida: String!
	}

	type Tallas {
		tipo: Int!
		talla: String!
	}

	type InfoPers {
		identificacion: Identificacion
		domicilio: Domicilio
		infonavit: Infonavit
		familiares: [Familiares]
		tallas: [Tallas]
		availableTallas: [TallasList]
	}

	type Area {
		puesto: String
		turno: String
		ingreso: Date
		nomina: String
		supervisor: String
		area: String
		planta: String
		clasificacion: String
	}

	type Antiguedad {
		ingreso: Date
		antiguedad: Int
		diasaniv: Int
	}

	type DiasVacs {
		ganados: Int
		tomados: Int
		disponibles: Int
	}

	type Vacaciones {
		antiguedad: Antiguedad
		diasvacs: DiasVacs
	}

	type HistorialVacacionesItem {
		id: ID
		fecha: Date
		dias: Int
		observaciones: String
	}

	type HistorialVacaciones {
		yearly: [HistorialVacacionesItem]
	}

	type Year {
		id: ID!
		year: Int!
	}

	type HistorialYears {
		years: [Year!]!
	}

	type FondoAhorro {
		saldo_fa: String
		saldo_ca: String
		saldo_pr: String
	}

	type Recibos {
		nomina: Int!
		percepciones: Float!
		deducciones: Float!
		neto: Float!
		fecha: Date!
	}

	type RecibosYears {
		year: Int!
	}

	type RecibosYears {
		year: Int!
	}

	type PrenominaSemanal {
		nomina: Int!
		fecha_inicio: Date!
		fecha_fin: Date!
		horas: Float!
		extras: Float!
		incidencia: Int!
	}

	type PrenominaYears {
		year: Int!
	}

	type PrenominaDias {
		nomina: Int!
		dia: Int!
		fec_dia: Date!
		horas: Float!
		extras: Float!
		incidencia: String
		dia_tipo: Int!
		entrada_1: String
		salida_1: String
		entrada_2: String
		salida_2: String
		nomina_tipo: Int!
	}

	type Prestamo {
		saldo_fa: Float!
		prestamo: Boolean!
	}

	type Encuestas {
		encuesta: String
		titulo: String
		preguntas: Int
	}

	type Encuesta {
		pregunta: String!
		codigo: Int!
		respuestas: [String!]!
		notas: String
	}

	type sendRequisition {
		pdfFile: String
	}

	type payrollPDF {
		success: Boolean!
		pdfData: String
		pdfName: String
	}

	type version {
		upToDate: Boolean!
		critical: Boolean
	}

	input SubmitSurveyInput {
		encuesta: Int! # Survey ID
		numEmp: Int! # Employee number
		region: String! # Employee region
		data: [QuestionInput!] # Array of questions and answers
	}

	input OpinionInput {
		numEmp: Int!
		region: String!
		opinion: String!
	}

	input QuestionInput {
		pregunta: Int! # Question code
		respuesta: String! # Answer value
	}

	input QRInput {
		numEmp: Int!
		region: String!
	}

	type Response {
		success: Boolean! # Indicates success or failure
		message: String! # Success or error message
	}

	type ResponseData {
		success: Boolean! # Indicates success or failure
		message: String! # Success or error message
		data: EmployeeData
	}

	type EmployeeData {
		ingreso: Date!
		imss: String!
		qr: String!
	}

	type Query {
		Alive: Response!
		Healthy: Response!
		Versions(currVer: String!): version
		UserFind(numEmp: String!, region: String!): UserFind
		ImageBlob(numEmp: String!, region: String!): ImageBlob
		UserInfo(numEmp: String!, region: String!): UserInfo
		InfoPers(numEmp: String!, region: String!): InfoPers
		Area(numEmp: String!, region: String!): Area
		Vacaciones(numEmp: String!, region: String!): Vacaciones
		HistorialVacaciones(
			numEmp: String!
			region: String!
			year: Int!
		): HistorialVacaciones
		HistorialYears(numEmp: String!, region: String!): HistorialYears
		FondoAhorro(numEmp: String!, region: String!): FondoAhorro
		Recibos(
			numEmp: String!
			region: String!
			year: String!
			proy: String!
		): [Recibos!]!
		RecibosYears(numEmp: String!, region: String!): [RecibosYears!]!
		PrenominaSemanal(
			numEmp: String!
			region: String!
			year: Int!
		): [PrenominaSemanal!]!
		PrenominaYears(numEmp: String!, region: String!): [PrenominaYears!]!
		PrenominaDias(
			numEmp: String!
			region: String!
			year: Int!
			week: Int!
		): [PrenominaDias!]!
		Prestamo(numEmp: String!, region: String!): Prestamo!
		Encuestas(numEmp: String!, region: String!): [Encuestas]
		Encuesta(encuesta: Int!, region: String!): [Encuesta!]!
		TestQuery: String
	}

	type Mutation {
		login(numEmp: String!, nip: String!, region: String!): Token
		resetNIP(numEmp: Int!, rfc: String!, newNIP: Int!): String!
		addFamilyMember(
			numEmp: Int!
			region: String!
			name: String!
			kin: Int!
			sex: String!
			birth: String!
		): Boolean
		removeFamilyMember(
			numEmp: Int!
			region: String!
			name: String!
			date: String!
		): Boolean
		updateMeasurements(
			numEmp: Int!
			region: String!
			type: String!
			size: String!
		): Boolean
		sendRequisition(
			numEmp: Int!
			region: String!
			name: String!
			letter: String!
			plant_id: String!
			shift: String!
			project: String!
			position: String!
			clasification: String!
			motive: String
			coment: String
			fileName: String
			file: String
			day_to_adjust: String
			period: Int
			start_date: String
			end_date: String
			days: Int
		): sendRequisition!
		generatePayroll(
			numEmp: Int!
			region: String!
			period: Int!
			year: Int!
		): payrollPDF!
		submitSurvey(input: SubmitSurveyInput!): Response!
		submitOpinion(input: OpinionInput!): Response!
		requestQRData(input: QRInput!): ResponseData!
		testMutation: String
	}
`;

module.exports = typeDefs;
