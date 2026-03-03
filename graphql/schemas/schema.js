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
		restricted_sections: [String!]
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
		ganados: Float!
		tomados: Float!
		disponibles: Float!
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
		initial_week: Int!
		final_week: Int!
		max_weeks: Int!
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

	type policy {
		id: Int!
		status: Boolean!
		policy: String!
		icon: String!
		line_1: String!
		line_2: String
		line_3: String
		ref_1: String!
		ref_2: String
		ref_3: String
		ref_4: String
		icon_ref_1: String!
		icon_ref_2: String
		icon_ref_3: String
		icon_ref_4: String
	}

	input SubmitSurveyInput {
		encuesta: Int! # Survey ID
		numEmp: String! # Employee number
		region: String! # Employee region
		data: [QuestionInput!] # Array of questions and answers
	}

	input OpinionInput {
		numEmp: String!
		region: String!
		opinion: String!
	}

	input QuestionInput {
		pregunta: Int! # Question code
		respuesta: String! # Answer value
	}

	input QRInput {
		numEmp: String!
		region: String!
	}

	type Response {
		success: Boolean! #
		message: String! #
	}

	type ResponseData {
		success: Boolean! #
		message: String! #
		data: EmployeeData
	}

	type ResponseRequests {
		success: Boolean!
		message: String!
		data: [Request]
	}

	type ResponseLogin {
		success: Boolean!
		message: String!
		data: Token
	}

	type Policies {
		success: Boolean!
		message: String!
		data: [policy]
	}

	type EmployeeData {
		ingreso: Date!
		imss: String!
		qr: String!
	}

	type Request {
		id: Int!
		numEmp: String!
		name: String!
		type: String!
		status: String!
		start_date: Date!
		end_date: Date
		request_date: DateTime!
		total_days: Int!
		motive: String
		comment: String
		pre_approved_by: String
		pre_approval_date: DateTime
		approved_by: String
		approval_date: DateTime
		approver_comment: String
		rejected_by: String
		rejection_date: DateTime
		cancelled_by: String
		cancellation_date: DateTime
	}

	input RequestAbsenceInput {
		numEmp: String! # ID employee
		region: String! # Employee region
		type: String! # Request type
		start_date: Date! # Initial day date
		end_date: Date # Last day date
		days: Int! # Number of days
		motive: Int # Permission motive
		comment: String # Employee comment
	}

	input HandleAbsenceRequestInput {
		numEmp: String! # ID employee
		region: String! # Employee region
		request_id: Int! # Request ID
		action: String! # Request action
		motive: Int # Motive id
		comment: String # Superior comment
	}

	input GenerateVacationCertificateInput {
		numEmp: String!
		region: String!
		signature: String! # base64-encoded PNG
	}

	type GenerateVacationCertificateResponse {
		success: Boolean!
		message: String!
		pdfUrl: String
	}

	type LoginStatus {
		id: String!
		status: String!
		encrypted: Boolean!
		nip: String
	}

	type ResponseComplaintData {
		success: Boolean!
		message: String!
		data: ComplaintInfo!
	}

	type ComplaintInfo {
		email: String!
		phone: String!
	}

	type Notification {
		id: ID!
		title: String!
		message: String!
		created_at: DateTime!
		files: [NotificationFile]
	}

	type NotificationFile {
		id: ID!
		file_name: String
	}

	type NotificationFileUrl {
		success: Boolean!
		message: String!
		url: String
	}

	input HandleCheckInInput {
		numEmp: String!
		region: String!
	}

	type HandleCheckInResponse {
		success: Boolean!
		message: String!
	}

	input AssignSurveysInput {
		numEmpList: [String!]!
		region: String!
		surveyId: Int!
	}

	type AssignSurveysResponse {
		success: Boolean!
		message: String!
	}

	type LoanDataResponse {
		success: Boolean!
		message: String!
		data: LoanData
	}

	type LoanData {
		isAllowed: Boolean!
		reason: String
		balance: Float!
		minAmount: Float!
		maxAmount: Float!
		maxWeeks: Int!
		interestRate: Float!
		existingLoanStatus: Boolean!
		cycle: LoanCycle
		serverNow: String!
	}

	type LoanCycle {
		startDate: String!
		endDate: String!
	}

	input RequestLoanInput {
		amount: Float!
		weeks: Int!
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
		Policies(region: String!): Policies!
		TestQuery: String
		IsSupervisor(numEmp: String!, region: String!): Response!
		SuperiorRequests(numEmp: String!, region: String!): ResponseRequests!
		ComplaintInfo(region: String!): ResponseComplaintData!
		Notifications: [Notification]
		NotificationFileUrl(notificationId: ID!, fileId: ID!): NotificationFileUrl!
		LoanData: LoanDataResponse!
	}

	type Mutation {
		login(numEmp: String!, nip: String!, region: String!): ResponseLogin!
		mockLogin(numEmpList: [String!]!, region: String!): [LoginStatus!]!
		resetNIP(
			numEmp: String!
			rfc: String!
			newNIP: String!
			region: String!
		): String!
		addFamilyMember(
			numEmp: String!
			region: String!
			name: String!
			kin: Int!
			sex: String!
			birth: String!
		): Boolean
		removeFamilyMember(
			numEmp: String!
			region: String!
			name: String!
			date: String!
		): Boolean
		updateMeasurements(
			numEmp: String!
			region: String!
			type: String!
			size: String!
		): Boolean
		sendRequisition(
			numEmp: String!
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
			requested_loan: Float
			loan_weeks: Int
		): sendRequisition!
		generatePayroll(
			numEmp: String!
			region: String!
			period: Int!
			year: Int!
		): payrollPDF!
		submitSurvey(input: SubmitSurveyInput!): Response!
		submitOpinion(input: OpinionInput!): Response!
		requestQRData(input: QRInput!): ResponseData!
		requestAbsence(input: RequestAbsenceInput!): Response!
		handleAbsenceRequest(input: HandleAbsenceRequestInput!): Response!
		generateVacationCertificate(
			input: GenerateVacationCertificateInput!
		): GenerateVacationCertificateResponse!
		handleCheckIn(input: HandleCheckInInput!): HandleCheckInResponse!
		assignSurveys(input: AssignSurveysInput!): AssignSurveysResponse!
		requestLoan(input: RequestLoanInput!): Response!
		testMutation: String
	}
`;

module.exports = typeDefs;
