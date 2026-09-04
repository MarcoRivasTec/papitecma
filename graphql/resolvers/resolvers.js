const {
	executeQuery,
	executeParameterizedQuery,
	executeParameterizedQueryParam7,
	executeQueryNew,
	executeParameterizedQueryTx,
} = require("../../utils/dbUtils");
const jwt = require("jsonwebtoken");
const { decryptOld, encryptOld, encrypt } = require("../../utils/decryption");
require("dotenv").config();
const dateTimeScalar = require("./dateTimeScalar");
const dateScalar = require("./dateScalar");
const telScalar = require("./telScalar");
const blobScalar = require("./blobScalar");
const {
	returnValue,
	returnZero,
	returnSex,
	returnCredStatus,
	returnCredType,
} = require("../../utils/returners");
// const { json } = require("express");
const {
	generateLetterPDF,
	generatePayrollPDF,
	generateIMSSPDF,
	generateSavingsLoanPDF,
	generateSavingWithdrawPDF,
	generateAdjustmentPDF,
	generateVacationsPDF,
	generatePermitPDF,
	generateVacationCertificatePDF,
} = require("../../utils/generatePDF");
const oldKey = process.env.OLD_KEY;
const newKey = process.env.NEW_KEY;
const notifKey = process.env.NOTIF_KEY;
const fileKey = process.env.FILE_DOWNLOAD_SECRET;
const path = require("path");
const fs = require("fs");
const Numalet = require("numalet");
const { DateTime } = require("luxon");
const { enc } = require("crypto-js");
const { requireAuth } = require("../../utils/auth");
const { poolPromises, sql } = require("../../config/dbConfig");
const { requireServiceAuth } = require("../../utils/serviceAuth");

// const secretKey = process.env.NEW_KEY;

const selectRegion = async (region) => {
	switch (region) {
		case "JRZ":
		case "MTY": {
			return {
				kioskotek: "kioskocentral",
				colabora: "tecmacentral",
				tecmamovil: "tecmamovilcentral",
				comparte: "compartecentral",
			};
		}
		case "AMX": {
			return {
				kioskotek: "kioskoamx",
				colabora: "amxpro",
				tecmamovil: "tecmamovilcentral",
				tecma_csa: "tecma_csa",
				comparte: "compartecentral",
			};
		}
		case "SAL":
		case "TIJ": {
			return {
				kioskotek: "kioskowest",
				colabora: "tecmawest",
				tecmamovil: "tecmamovilwest",
				comparte: "compartewest",
			};
		}
		default:
			throw new Error("La región especificada no existe");
	}
};

function getBusinessTimezoneByRegion(region) {
	const normalizedRegion = String(region || "")
		.trim()
		.toUpperCase();

	switch (normalizedRegion) {
		case "SAL":
		case "TIJ":
			return "America/Tijuana";

		case "AMX":
		case "CENTRAL":
		case "MTY":
		case "JRZ":
		default:
			return "America/Denver";
	}
}

const resolvers = {
	Blob: blobScalar,
	Date: dateScalar,
	DateTime: dateTimeScalar,
	Tel: telScalar,

	Query: {
		Alive: async () => {
			return { success: true, message: "El servidor se encuentra en linea." };
		},
		Healthy: async () => {
			const numEmp = "999991110";
			const nip = "121212";

			const queryNip = await executeQuery(
				`SELECT CB_CODIGO, NIP FROM Empleados WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				"kioskocentral",
			);
			const userData = queryNip[0];

			const decryptedPassword = decryptOld(userData.NIP, oldKey);

			if (!userData || nip !== decryptedPassword) {
				throw new Error(
					"El usuario no existe o las credenciales son inválidas",
				);
			}

			const queryName = await executeQuery(
				`SELECT CB_NOMBRES FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.colabora,
			);
			const name = queryName[0];

			// return { token, name: name.CB_NOMBRES };
			return {
				success: true,
				message: `Se inicio sesión correctamente para ${name.CB_NOMBRES}`,
			};
		},
		Version: async (_, { input }) => {
			const parseVersion = (value) => {
				if (typeof value !== "string") return null;

				const raw = value.trim().toLowerCase();

				// Allows: 1.1.5 or 1.1.5dev
				if (!/^\d+\.\d+\.\d+(dev)?$/.test(raw)) {
					return null;
				}

				const isDev = raw.endsWith("dev");
				const numericPart = isDev ? raw.slice(0, -3) : raw;

				const [major, minor, patch] = numericPart.split(".").map(Number);

				return {
					raw,
					isDev,
					numericPart,
					major,
					minor,
					patch,
				};
			};

			const compareVersions = (a, b) => {
				if (a.major !== b.major) return a.major - b.major;
				if (a.minor !== b.minor) return a.minor - b.minor;
				if (a.patch !== b.patch) return a.patch - b.patch;

				// Same numeric version:
				// treat 1.1.5 and 1.1.5dev as equivalent for update checks
				return 0;
			};

			try {
				console.log("Input is:", input);

				if (!input || typeof input !== "object") {
					throw new Error("Invalid input.");
				}

				let { currVer, platform } = input;

				platform = String(platform || "")
					.trim()
					.toLowerCase();
				currVer = String(currVer || "").trim();

				if (!["ios", "android"].includes(platform)) {
					throw new Error("Invalid platform.");
				}

				const parsedCurrent = parseVersion(currVer);
				if (!parsedCurrent) {
					throw new Error(
						"Invalid currVer format. Expected values like 1.1.5 or 1.1.5dev.",
					);
				}

				const versiones = await executeParameterizedQuery(
					`
					SELECT id_version, relevancia, fecha, notas, platform
					FROM Versiones
					WHERE platform IN (@param1, 'all')
					ORDER BY fecha DESC
			`,
					[platform],
					"Error fetching version information",
					"tecmamovilcentral",
				);

				// console.log("Result is: ", versiones)

				if (!versiones.length) {
					return { upToDate: true, critical: false };
				}

				const newerVersions = versiones.filter((row) => {
					const parsedDbVersion = parseVersion(
						String(row.id_version || "").trim(),
					);

					// Ignore malformed DB rows instead of crashing
					if (!parsedDbVersion) return false;

					return compareVersions(parsedDbVersion, parsedCurrent) > 0;
				});

				if (newerVersions.length > 0) {
					const important = newerVersions.some(
						(version) => Number(version.relevancia) >= 3,
					);

					return {
						upToDate: false,
						critical: important,
					};
				}

				return {
					upToDate: true,
					critical: false,
				};
			} catch (error) {
				console.error("Version resolver error:", error);
				throw error;
			}
		},
		Versions: async (_, { currVer }) => {
			const versiones = await executeQuery(
				`SELECT * FROM Versiones
					WHERE fecha > (SELECT fecha FROM Versiones WHERE id_version = '${currVer}')`,
				"Error fetching version information",
				"tecmamovilcentral",
			);
			// console.log("Versiones: ", versiones);
			if (versiones.length > 0) {
				const important = versiones.some((version) => version.relevancia >= 3);
				// console.log("Relevance status: ", important);
				return { upToDate: false, critical: important };
			}
			return { upToDate: true, critical: false };
		},
		UserFind: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);

			const query = await executeQuery(
				`Select NIP As nip
				From Empleados
				Where CB_CODIGO = '${numEmp}'`,
				"Error fetching user information",
				dbs.kioskotek,
			);
			const decrypted = decryptOld(query[0].nip, oldKey);
			console.log("NIP is: ", decrypted);
			return { nip: decrypted };
		},
		ImageBlob: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);

			const query = await executeQuery(
				`Select IM_BLOB as image						
						from IMAGEN
				where CB_CODIGO = '${numEmp}' 
				And IM_TIPO = 'FOTO' `,
				"Error fetching image blob information",
				dbs.colabora,
			);
			// console.log("Blob: ", query);
			return query[0];
		},
		UserInfo: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			let code = {};
			const setCodes = async () => {
				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX": {
						code.supervisor = "3";
						code.area = "5";
						code.proyecto = "0";
						code.planta = "7";
						break;
					}
					case "SAL":
					case "TIJ": {
						code.supervisor = "8";
						code.proyecto = "5";
						code.area = "6";
						code.planta = "1";
						break;
					}
				}
			};

			await setCodes();

			const userInfo = await executeQuery(
				`Select CB.CB_APE_PAT As apellido_pat,
						CB.CB_APE_MAT As apellido_mat,
						CB.CB_SEXO As sexo,
						R.TB_ELEMENT As razon,						
						PLANTA.TB_ELEMENT As planta,
						CB.CB_NIVEL${code.planta} As planta_id,
						AREA.TB_ELEMENT As area,
						CB.CB_NIVEL${code.area} As area_id,
						CB.CB_NIVEL${code.proyecto} As proyecto,
						SUPERV.TB_ELEMENT As supervisor,
						T.TP_DESCRIP As nomina,
						P.PU_DESCRIP As puesto,
						CB.CB_PUESTO As puesto_id,
						CB.CB_TURNO As turno,
						CB.CB_CLASIFI As clasificacion
				from COLABORA as CB
				inner join PUESTO as P on CB.CB_PUESTO = P.PU_CODIGO 
				inner join RPATRON as R on CB.CB_PATRON = R.TB_CODIGO
				left join NIVEL${code.supervisor} as SUPERV on CB.CB_NIVEL${code.supervisor} = SUPERV.TB_CODIGO
				left join NIVEL${code.area} as AREA on CB.CB_NIVEL${code.area} = AREA.TB_CODIGO
				left join NIVEL${code.planta} as PLANTA on CB.CB_NIVEL${code.planta} = PLANTA.TB_CODIGO
				left join TPERIODO as T on CB.CB_NOMINA = T.TP_TIPO
				where CB.CB_CODIGO = '${numEmp}'`,
				"Error fetching user info",
				dbs.colabora,
			);

			let restrictedSections = [];
			if (numEmp !== "900874"
				&& numEmp !== "900338"
				&& numEmp !== "900368"
				&& numEmp !== "900372"
				&& numEmp !== "900428"
				&& numEmp !== "900485"
				&& numEmp !== "900617"
				&& numEmp !== "900735"
				&& numEmp !== "900748"
				&& numEmp !== "900770"
				&& numEmp !== "900783"
				&& numEmp !== "900827"
				&& numEmp !== "900869"
				&& numEmp !== "900950"
				&& numEmp !== "900951"
			) {


				restrictedSections = await executeQuery(
					`
				SELECT DISTINCT s.section_name
				FROM MenuAccessRestrictions AS mar
				INNER JOIN Sections AS s ON mar.section_id = s.section_id
				LEFT JOIN Regions AS r ON mar.region_id = r.region_id
				WHERE 
					mar.is_active = 1
					AND (mar.employee_id IS NULL OR mar.employee_id = '${numEmp}')
					AND (mar.region_id IS NULL OR r.region_code = '${region}')
					AND (mar.plant IS NULL OR mar.plant = '${userInfo[0].planta_id.trim()}')
					AND (mar.project IS NULL OR mar.project = '${userInfo[0].proyecto.trim()}')
					AND (mar.area IS NULL OR mar.area = '${userInfo[0].area_id.trim()}')
					AND (mar.expires_at IS NULL OR mar.expires_at > GETDATE());`,
					"Error fetching restricted sections for user",
					"tecmamovilcentral",
				);
			}

			// console.log("Restricted sections: ", restrictedSections);

			// Register log in to K_Log
			// await executeQuery(
			// 	`DECLARE @currentDate DATETIME = GETDATE();
			// 	INSERT INTO K_Log (No, Fecha, Planta, Proyecto, Tipo)
			// 	Values (
			// 		'${numEmp}',
			// 		@currentDate,
			// 		'${userInfo[0].planta_id.trim()}',
			// 		'${(region === "TIJ" || region === "SAL") ? userInfo[0].planta_id.charAt(0) : userInfo[0].proyecto.trim()}',
			// 		'Login'
			// 		)`,
			// 	"Error registering log in",
			// 	dbs.kioskotek
			// );
			// console.log("Info: ", JSON.stringify(userInfo, null, 1));
			// return userInfo[0];
			return {
				...userInfo[0],
				restricted_sections: restrictedSections.map(
					(section) => section.section_name,
				),
			};
			// return {
			// 	apellido_mat: returnValue(query[0].CB_APE_MAT),
			// 	apellido_pat: returnValue(query[0].CB_APE_PAT),
			// 	razon: returnValue(query[0].TB_ELEMENT),
			// 	puesto: returnValue(query[0].PU_DESCRIP),
			// 	proyecto: returnValue(query[0].CB_NIVEL0),
			// };
		},
		// RFC: async (_, { numEmp, region }) => {
		// 	const query = await executeQuery(
		// 		`Select C.CB_RFC from COLABORA as C
		// 		where C.CB_CODIGO = '${numEmp}'`,
		// 		"Error fetching personal information",
		// 		dbs.colabora
		// 	);
		// 	console.log(query);
		// 	const RFC = query[0];
		// 	console.log(RFC);
		// 	return {
		// 		RFC: RFC.CB_RFC,
		// 	};
		// },
		InfoPers: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			const generalQuery = await executeQuery(
				`Select C.CB_RFC as RFC, 
						C.CB_CURP as CURP, 
						C.CB_SEGSOC as IMSS, 
						C.CB_SEXO as SEXO, 
						E.TB_ELEMENT as EDOCIVIL, 
						C.CB_BAN_ELE as CUENTA,
						C.CB_CALLE as CALLE, 
						C.CB_NUM_EXT as NUMEXT,
						C.CB_COLONIA as COLONIA,
						C.CB_TEL as TEL,
						C.CB_INFCRED as CREDITO, 
						C.CB_INFTIPO as TIPO, 
						C.CB_INFTASA as TASA,
						C.CB_INFACT as ESTATUS 
						from COLABORA as C 
				left join EDOCIVIL as E on C.CB_EDO_CIV = E.TB_CODIGO
				where C.CB_CODIGO = '${numEmp}'`,
				"Error fetching personal information",
				dbs.colabora,
			);
			const familiaresQuery = await executeQuery(
				`SELECT Nombre
				,Parentesco
				,FecNacimiento
				,Sexo
				,FecActualiza
				FROM K_Parientes
				Where No = '${numEmp}'
				And Borrado = 0`,
				"Error fetching familiares information",
				dbs.kioskotek,
			);
			const tallasQuery = await executeQuery(
				`WITH RankedEntries AS (
					SELECT 
						[No],
						[Tipo],
						[Talla],
						[FecActualiza],
						ROW_NUMBER() OVER (PARTITION BY [Tipo] ORDER BY [FecActualiza] DESC) AS rn
					FROM K_Tallas
					WHERE [No] = '${numEmp}'
				)
				SELECT 
					[No],
					[Tipo],
					[Talla],
					[FecActualiza]
				FROM RankedEntries
				WHERE rn = 1`,
				"Error fetching tallas information",
				dbs.kioskotek,
			);

			const availableTallasQuery = await executeQuery(
				`SELECT Tipo,
						Medida,
						EU_medida					
				FROM TMedidas
				Where Genero = '${generalQuery[0].SEXO}' OR Genero = 'G'`,
				"Error fetching available tallas information",
				dbs.kioskotek,
			);

			const familiaresArray = familiaresQuery.map((row) => ({
				nombre: row.Nombre,
				parentesco: row.Parentesco,
				fec_nac: row.FecNacimiento,
				sexo: row.Sexo,
				fec_act: row.FecActualiza,
			}));

			const tallasArray = tallasQuery.map((row) => ({
				tipo: returnValue(row.Tipo),
				talla: returnValue(row.Talla),
			}));

			const availableTallasArray = availableTallasQuery.map((row) => ({
				tipo: row.Tipo,
				medida: row.Medida,
				eu_medida: row.EU_medida,
			}));

			return {
				identificacion: {
					rfc: returnValue(generalQuery[0].RFC),
					curp: returnValue(generalQuery[0].CURP),
					imss: returnValue(generalQuery[0].IMSS),
					genero: returnSex(generalQuery[0].SEXO),
					edocivil: returnValue(generalQuery[0].EDOCIVIL),
					cuenta: returnValue(generalQuery[0].CUENTA),
				},
				domicilio: {
					calle: returnValue(generalQuery[0].CALLE),
					numext: generalQuery[0].NUMEXT,
					col: returnValue(generalQuery[0].COLONIA),
					tel: generalQuery[0].TEL,
				},
				infonavit: {
					credito: returnValue(generalQuery[0].CREDITO),
					tipo: returnCredType(generalQuery[0].TIPO),
					tasa: returnValue(generalQuery[0].TASA),
					estatus: returnCredStatus(generalQuery[0].ESTATUS),
				},
				familiares: familiaresArray,
				tallas: tallasArray,
				availableTallas: availableTallasArray,
			};
		},
		Area: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			let code = {};
			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX": {
					code.supervisor = "3";
					code.area = "5";
					code.planta = "7";
					break;
				}
				case "SAL":
				case "TIJ": {
					code.supervisor = "8";
					code.area = "6";
					code.planta = "1";
					break;
				}
			}
			const query = await executeQuery(
				`Select P.PU_DESCRIP as PUESTO, 

						TURNO.TU_DESCRIP as TURNO, 

						CB.CB_FEC_ANT as INGRESO, 

						T.TP_DESCRIP as NOMINA,
						SUPERV.TB_ELEMENT as SUPERVISOR,
						AREA.TB_ELEMENT as AREA,
						PLANTA.TB_ELEMENT as PLANTA,

						CL.TB_ELEMENT as CLASIFICACION
				from COLABORA as CB 
				left join NIVEL${code.supervisor} as SUPERV on CB.CB_NIVEL${code.supervisor} = SUPERV.TB_CODIGO
				left join NIVEL${code.area} as AREA on CB.CB_NIVEL${code.area} = AREA.TB_CODIGO
				left join NIVEL${code.planta} as PLANTA on CB.CB_NIVEL${code.planta} = PLANTA.TB_CODIGO
				left join PUESTO as P on CB.CB_PUESTO = P.PU_CODIGO 
				left join TPERIODO as T on CB.CB_NOMINA = T.TP_TIPO
				Left Join TURNO on CB.CB_TURNO = TURNO.TU_CODIGO
				left join CLASIFI as CL on CB.CB_CLASIFI = CL.TB_CODIGO
				where CB.CB_CODIGO = '${numEmp}'`,
				"Error fetching area information",
				dbs.colabora,
			);
			return {
				puesto: returnValue(query[0].PUESTO),
				turno: returnValue(query[0].TURNO),
				ingreso: returnValue(query[0].INGRESO),
				nomina: returnValue(query[0].NOMINA),
				supervisor: returnValue(query[0].SUPERVISOR),
				area: returnValue(query[0].AREA),
				planta: returnValue(query[0].PLANTA),
				clasificacion: returnValue(query[0].CLASIFICACION),
			};
		},
		Vacaciones: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			// const query = await executeQuery(
			// 	`Select CB_FEC_ANT as INGRESO,
			// 			DATEDIFF(yy,CB_FEC_ANT, GETDATE()) as ANTIGUEDAD,
			// 			DATEDIFF(
			// 				DAY,
			// 				GETDATE(),
			// 				DATEADD(YEAR, DATEDIFF(YEAR, CB_FEC_ANT, GETDATE()) + 1, CB_FEC_ANT)
			// 			) AS DIASANIV,
			// 			CB_DER_PAG as GANADOS,
			// 			CB_V_GOZO as TOMADOS
			// 	From COLABORA Where CB_CODIGO = '${numEmp}'`,
			// 	"Error fetching vacaciones information",
			// 	dbs.colabora
			// );
			const query = await executeQuery(
				`Select CB_FEC_ANT as INGRESO,
						DATEDIFF(yy,CB_FEC_ANT, GETDATE()) as ANTIGUEDAD, 
						CB_FEC_ANT As DIASANIV,
						CB_DER_PAG as GANADOS, 
						CB_V_GOZO as TOMADOS,
						CASE
							WHEN CB_NIVEL0 IN ('H75') THEN
								CB_DER_PAG - CB_V_PAGO
								+
								(
									DBO.SP_IMSS(
										CB_TABLASS,
										CB_FEC_ANT,
										GETDATE(),
										1
									)
									* DATEDIFF(DAY, CB_DER_FEC, GETDATE())
									/ DATEDIFF(
										DAY,
										DATEFROMPARTS(YEAR(GETDATE()), 1, 1),
										DATEFROMPARTS(YEAR(GETDATE()) + 1, 1, 1)
									)
								)
							ELSE
								CB_DER_PAG - CB_V_PAGO
							END AS SALDO
				From COLABORA Where CB_CODIGO = '${numEmp}'`,
				"Error fetching vacaciones information",
				dbs.colabora,
			);

			let ingreso = new Date(query[0].DIASANIV);
			let today = new Date();

			let anniversary = new Date(
				today.getFullYear(),
				ingreso.getMonth(),
				ingreso.getDate(),
			);

			if (today > anniversary) {
				anniversary.setFullYear(today.getFullYear() + 1);
			}

			let remainingDays = Math.ceil(
				(anniversary - today) / (1000 * 60 * 60 * 24),
			);
			console.log("Data retrieved: ", query[0]);
			// console.log("Remaining days: ", remainingDays);
			// return;
			// (DATEDIFF(yy,CB_FEC_ANT, GETDATE()) * 365) - DATEDIFF(dd,CB_FEC_ANT, GETDATE()) as DIASANIV,
			return {
				antiguedad: {
					ingreso: returnValue(query[0].INGRESO),
					antiguedad: returnValue(query[0].ANTIGUEDAD),
					diasaniv: returnValue(remainingDays),
				},
				diasvacs: {
					ganados: returnValue(parseFloat(query[0].GANADOS).toFixed(2)),
					tomados: returnValue(parseFloat(query[0].TOMADOS).toFixed(2)),
					disponibles: returnValue(parseFloat(query[0].SALDO).toFixed(2)),
				},
			};
		},
		HistorialVacaciones: async (_, { numEmp, region, year }) => {
			const dbs = await selectRegion(region);
			const query = await executeQuery(
				`Select 
					VA_FEC_INI as FECHA, 
					VA_PAGO as DIAS, 
					VA_COMENTA as OBSERVACIONES 
				From 
					VACACION 
				Where 
					CB_CODIGO = '${numEmp}' 
				and 
					VA_TIPO = 1
				and 
					YEAR(VA_FEC_INI) = '${year}'
				Order by 
					VA_FEC_INI Desc`,
				"Error fetching historial vacaciones information",
				dbs.colabora,
			);

			const yearly = query.map((row, index) => ({
				id: `${year}-${index + 1}`,
				fecha: returnValue(row.FECHA),
				dias: returnValue(row.DIAS),
				observaciones: returnValue(row.OBSERVACIONES),
			}));

			return { yearly };
		},
		HistorialYears: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			const query = await executeQuery(
				`Select 
					Distinct Year(VA_FEC_INI) as YEAR
				From 
					VACACION 
				Where 
					CB_CODIGO = '${numEmp}' 
				and 
					VA_TIPO = 1
				Order by 
					YEAR Desc`,
				"Error fetching historial years information",
				dbs.colabora,
			);

			const years = query.map((row, index) => ({
				id: `year-${index + 1}`,
				year: row.YEAR,
			}));

			return { years };
		},
		FondoAhorro: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			const query = await executeQuery(
				`Select 
					MAX(CASE WHEN AH_TIPO = '${region === "TIJ" ? "1" : "3"
				}' THEN AH_SALDO END) AS SaldoCA,
					MAX(CASE WHEN AH_TIPO = '2' THEN AH_SALDO * 2 END) AS SaldoFA,
					MAX(PR.PR_SALDO) As SaldoPrestamo
				From 
					AHORRO As AH
				Left Join 
					PRESTAMO As PR
				On 
					AH.CB_CODIGO = PR.CB_CODIGO
				And 
					PR.PR_TIPO = '4'
				And 
					PR.PR_STATUS = 0
				Where 
					AH.CB_CODIGO = '${numEmp}'`,
				"Error fetching fondo de ahorro information",
				dbs.colabora,
			);

			return {
				saldo_fa: returnZero(query[0].SaldoFA),
				saldo_ca: returnZero(query[0].SaldoCA),
				saldo_pr: returnZero(query[0].SaldoPrestamo),
			};
		},
		Recibos: async (_, { year, region, proy, numEmp }) => {
			const PAYROLL_REGION_CONFIG = {
				JRZ: {
					csaRegion: "Central",
					plantLevel: "7",
					areaLevel: "5",
				},
				MTY: {
					csaRegion: "Central",
					plantLevel: "7",
					areaLevel: "5",
				},
				AMX: {
					csaRegion: "AMX",
					plantLevel: "7",
					areaLevel: "5",
				},
				SAL: {
					csaRegion: "West",
					plantLevel: "1",
					areaLevel: "6",
				},
				TIJ: {
					csaRegion: "West",
					plantLevel: "1",
					areaLevel: "6",
				},
			};

			const escapeSqlString = (value) =>
				String(value ?? "")
					.trim()
					.replace(/'/g, "''");

			const getPayrollRegionConfig = (region) => {
				const normalizedRegion = String(region)
					.trim()
					.toUpperCase();

				const config = PAYROLL_REGION_CONFIG[normalizedRegion];

				if (!config) {
					throw new Error(
						`Unsupported TMC region: ${region}`,
					);
				}

				return {
					...config,
					tmcRegion: normalizedRegion,
				};
			};

			const getUniquePeriods = (...sources) => {
				const periods = sources
					.flat()
					.map((row) => Number(row.Periodo))
					.filter((period) => Number.isInteger(period));

				return [...new Set(periods)].sort(
					(a, b) => a - b,
				);
			};
			console.log("[Recibos] Query parameters:", {
				year,
				region,
				proy,
				numEmp,
			});

			/*
			 * 1. Normalize input / resolve region configuration
			 */
			const config = getPayrollRegionConfig(region);

			const parsedYear = Number(year);

			if (!Number.isInteger(parsedYear)) {
				throw new Error("Invalid year.");
			}

			const safeProject = escapeSqlString(proy);
			const safeEmployee = escapeSqlString(numEmp);

			if (!safeEmployee) {
				throw new Error("Employee number is required.");
			}

			const dbs = await selectRegion(
				config.tmcRegion,
			);

			/*
			 * 2. Legacy payroll restrictions
			 *
			 * Keep the existing K_NomBloqueo behavior.
			 */
			const legacyRestrictionRows =
				await executeQuery(
					`
            SELECT DISTINCT
                Periodo
            FROM K_NomBloqueo
            WHERE Proyecto = '${safeProject}'
              AND Anio = ${parsedYear}
              AND Fecha >= GETDATE()
            `,
					"Error fetching legacy payroll restrictions",
					dbs.kioskotek,
				);

			console.log(
				"[Recibos] Legacy restrictions:",
				legacyRestrictionRows,
			);

			/*
			 * 3. Resolve employee scope from COLABORA
			 *
			 * Central / AMX:
			 *   plant -> CB_NIVEL7
			 *   area  -> CB_NIVEL5
			 *
			 * West:
			 *   plant -> CB_NIVEL1
			 *   area  -> CB_NIVEL6
			 */
			const employeeScopeRows =
				await executeQuery(
					`
            SELECT TOP 1
                LTRIM(RTRIM(
                    CAST(
                        CB_NIVEL${config.plantLevel}
                        AS VARCHAR(50)
                    )
                )) AS plantCode,

                LTRIM(RTRIM(
                    CAST(
                        CB_NIVEL${config.areaLevel}
                        AS VARCHAR(50)
                    )
                )) AS areaCode

            FROM COLABORA
            WHERE CB_CODIGO = '${safeEmployee}'
            `,
					"Error fetching employee payroll scope",
					dbs.colabora,
				);

			const employeeScope =
				employeeScopeRows[0] ?? {};

			const plantCode = escapeSqlString(
				employeeScope.plantCode,
			);

			/*
			 * IMPORTANT:
			 * Area is a code/string, NOT necessarily INT.
			 *
			 * Example:
			 * 10-8
			 */
			const areaCode = escapeSqlString(
				employeeScope.areaCode,
			);

			console.log("[Recibos] Employee scope:", {
				employee: safeEmployee,
				csaRegion: config.csaRegion,
				projectCode: safeProject || null,
				plantCode: plantCode || null,
				areaCode: areaCode || null,
			});

			/*
			 * 4. Build scope conditions for the new CSA system
			 */

			const projectCondition = safeProject
				? `
            OR (
                pr.restriction_type = 'PROJECT'
                AND LTRIM(RTRIM(
                    CAST(
                        pr.project_code
                        AS VARCHAR(50)
                    )
                )) = '${safeProject}'
            )
        `
				: "";

			const plantCondition = plantCode
				? `
            OR (
                pr.restriction_type = 'PLANT'
                AND LTRIM(RTRIM(
                    CAST(
                        pr.plant_code
                        AS VARCHAR(50)
                    )
                )) = '${plantCode}'
            )
        `
				: "";

			const employeeCondition = safeEmployee
				? `
            OR (
                pr.restriction_type = 'EMPLOYEE'
                AND LTRIM(RTRIM(
                    CAST(
                        pr.employee_id
                        AS VARCHAR(50)
                    )
                )) = '${safeEmployee}'
            )
        `
				: "";

			/*
			 * Area can contain values such as:
			 *
			 * 10-8
			 * A-2
			 * ABC
			 *
			 * so compare it as VARCHAR.
			 */
			const areaCondition = areaCode
				? `
            OR (
                pr.restriction_type = 'AREA'
                AND LTRIM(RTRIM(
                    CAST(
                        pr.area_id
                        AS VARCHAR(50)
                    )
                )) = '${areaCode}'
            )
        `
				: "";

			/*
			 * CONFIDENTIALITY behaves differently by CSA region:
			 *
			 * West:
			 *     confidentiality -> plant_code
			 *
			 * Central / AMX:
			 *     confidentiality -> project_code
			 */
			let confidentialityCondition = "";

			if (
				config.csaRegion === "West" &&
				plantCode
			) {
				confidentialityCondition = `
            OR (
                pr.restriction_type =
                    'CONFIDENTIALITY'

                AND LTRIM(RTRIM(
                    CAST(
                        pr.plant_code
                        AS VARCHAR(50)
                    )
                )) = '${plantCode}'
            )
        `;
			} else if (
				config.csaRegion !== "West" &&
				safeProject
			) {
				confidentialityCondition = `
            OR (
                pr.restriction_type =
                    'CONFIDENTIALITY'

                AND LTRIM(RTRIM(
                    CAST(
                        pr.project_code
                        AS VARCHAR(50)
                    )
                )) = '${safeProject}'
            )
        `;
			}

			/*
			 * 5. New CSA payroll restrictions
			 *
			 * executeQuery understands "csa" directly,
			 * so this database does NOT depend on
			 * selectRegion().
			 */
			const newRestrictionRows =
				await executeQuery(
					`
            SELECT DISTINCT
                pr.period AS Periodo

            FROM dbo.payroll_period_restrictions pr

            INNER JOIN dbo.regions r
                ON r.region_id = pr.region_id

            WHERE
                r.region_name =
                    '${escapeSqlString(
						config.csaRegion,
					)}'

                AND pr.is_active = 1
                AND pr.is_deleted = 0

                AND pr.effective_start_date
                    <= CAST(GETDATE() AS DATE)

                AND (
                    pr.effective_end_date IS NULL
                    OR pr.effective_end_date
                        >= CAST(GETDATE() AS DATE)
                )

                AND (
                    /*
                     * Entire CSA region
                     */
                    pr.restriction_type = 'REGION'

                    ${projectCondition}

                    ${plantCondition}

                    ${employeeCondition}

                    ${areaCondition}

                    ${confidentialityCondition}
                )
            `,
					"Error fetching CSA payroll restrictions",
					"csa",
				);

			console.log(
				"[Recibos] New restrictions:",
				newRestrictionRows,
			);

			/*
			 * 6. Merge old + new restrictions
			 */
			const blockedPeriods = getUniquePeriods(
				legacyRestrictionRows,
				newRestrictionRows,
			);

			console.log("[Recibos] Restriction result:", {
				tmcRegion: config.tmcRegion,
				csaRegion: config.csaRegion,
				employee: safeEmployee,
				projectCode: safeProject || null,
				plantCode: plantCode || null,
				areaCode: areaCode || null,
				legacyPeriods:
					legacyRestrictionRows.map(
						(row) => row.Periodo,
					),
				newPeriods:
					newRestrictionRows.map(
						(row) => row.Periodo,
					),
				blockedPeriods,
			});

			const blockedPeriodsSql =
				blockedPeriods.length > 0
					? `
                AND NOM.PE_NUMERO NOT IN (
                    ${blockedPeriods.join(", ")}
                )
            `
					: "";

			/*
			 * 7. Get payroll receipts
			 */
			const recibos = await executeQuery(
				`
        SELECT
            NOM.PE_NUMERO AS nomina,
            NOM.NO_PERCEPC AS percepciones,
            NOM.NO_DEDUCCI AS deducciones,
            NOM.NO_NETO AS neto,
            PER.PE_FEC_FIN AS fecha

        FROM NOMINA AS NOM

        INNER JOIN PERIODO AS PER
            ON NOM.PE_YEAR = PER.PE_YEAR
            AND NOM.PE_TIPO = PER.PE_TIPO
            AND NOM.PE_NUMERO = PER.PE_NUMERO

        WHERE
            NOM.PE_YEAR = ${parsedYear}

            AND NOM.CB_CODIGO =
                '${safeEmployee}'

            AND NOM.PE_NUMERO < 950

            AND NOM.NO_STATUS >= 5

            AND GETDATE() >
                DATEADD(
                    DAY,
                    5,
                    PER.PE_FEC_FIN
                )

            ${blockedPeriodsSql}

        ORDER BY
            NOM.PE_NUMERO DESC
        `,
				"Error fetching recibos",
				dbs.colabora,
			);

			return recibos;
		},
		RecibosYears: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			const query = await executeQuery(
				`Select Distinct PE_YEAR As year
				From NOMINA
				Where CB_CODIGO = '${numEmp}'
				Order by Year Desc`,
				"Error fetching bloqueo information",
				dbs.colabora,
			);
			return query;
		},
		PrenominaSemanal: async (_, { year, region, numEmp }) => {
			const dbs = await selectRegion(region);
			const semanal = await executeQuery(
				`DECLARE @currentDate DATE = CONVERT(DATE, GETDATE());

				Select
					NOM.PE_NUMERO As nomina,
					PER.PE_FEC_INI As fecha_inicio,
					PER.PE_FEC_FIN As fecha_fin,
					NOM.NO_HORAS As horas,
					NOM.NO_EXTRAS As extras,
					(
						Select
							Count(*)
						From
							AUSENCIA as AUS
						Where
							AUS.AU_TIPO <> ''
							And AUS.CB_CODIGO = NOM.CB_CODIGO
							And AUS.PE_YEAR = NOM.PE_YEAR
							And AUS.PE_NUMERO = NOM.PE_NUMERO
							And AUS.AU_FECHA < @currentDate
					) As incidencia
				From
					NOMINA As NOM
					Inner Join PERIODO As PER On NOM.PE_YEAR = PER.PE_YEAR
					And NOM.PE_TIPO = PER.PE_TIPO
					And NOM.PE_NUMERO = PER.PE_NUMERO
				Where
					NOM.PE_YEAR = '${year}'
					And NOM.CB_CODIGO = '${numEmp}'
					And NOM.PE_NUMERO < 54
					And NOM.NO_STATUS >= 1
					And @currentDate > PER.PE_FEC_INI
				Order by
					NOM.PE_NUMERO Desc`,
				"Error fetching prenomina week information",
				dbs.colabora,
			);
			// console.log("Statement: ", periodos);
			// const recibos = recibosQuery.recordset;
			// console.log("Recibos: ", recibosQuery);
			return semanal;
		},
		PrenominaYears: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			const years = await executeQuery(
				`DECLARE @currentDate DATE = CONVERT(DATE, GETDATE());

				Select Distinct NOM.PE_YEAR As year
				From
					NOMINA As NOM
					Inner Join PERIODO As PER On NOM.PE_YEAR = PER.PE_YEAR
					And NOM.PE_TIPO = PER.PE_TIPO
					And NOM.PE_NUMERO = PER.PE_NUMERO
				Where
					NOM.CB_CODIGO = '${numEmp}'
					And NOM.PE_NUMERO < 54
					And NOM.NO_STATUS >= 1
					And @currentDate > PER.PE_FEC_INI
				Order by
					NOM.PE_YEAR Desc`,
				"Error fetching prenominas years information",
				dbs.colabora,
			);
			// console.log("Years: ", typeof years.);
			return years;
		},
		PrenominaDias: async (_, { week, year, numEmp, region }) => {
			const dbs = await selectRegion(region);
			const dias = await executeQuery(
				`Select
					NOM.PE_NUMERO as nomina,
					AUS.AU_POSICIO As dia,
					AUS.AU_FECHA As fec_dia,
					AUS.AU_HORAS As horas,
					AUS.AU_EXTRAS As extras,
					INC.TB_ELEMENT As incidencia,
					AUS.AU_STATUS As dia_tipo, -- 0 habil  1 y 2 descanso
					CH.entrada_1,
					CH.salida_1,
					CH.entrada_2,
					CH.salida_2,
					NOM.NO_STATUS As nomina_tipo -- 6 pagada? 1 en proceso ( semana en curso )
				From
					AUSENCIA As AUS
					Inner Join NOMINA As NOM On AUS.PE_YEAR = NOM.PE_YEAR
						And AUS.PE_TIPO = NOM.PE_TIPO
						And AUS.PE_NUMERO = NOM.PE_NUMERO
						And AUS.CB_CODIGO = NOM.CB_CODIGO
					Left Join INCIDEN As INC on AUS.AU_TIPO = INC.TB_CODIGO
					Outer Apply (
						Select 
							Max(Case When CH.CH_TIPO = 1 And CH.CH_POSICIO = 1 Then CH.CH_H_REAL End) As entrada_1,
							Max(Case When CH.CH_TIPO = 2 And CH.CH_POSICIO = 1 Then CH.CH_H_REAL End) As salida_1,
							Max(Case When CH.CH_TIPO = 1 And CH.CH_POSICIO = 2 Then CH.CH_H_REAL End) As entrada_2,
							Max(Case When CH.CH_TIPO = 2 AND CH.CH_POSICIO = 2 Then CH.CH_H_REAL End) As salida_2
						From CHECADAS AS CH
						Where CH.CB_CODIGO = AUS.CB_CODIGO
						And CH.AU_FECHA = AUS.AU_FECHA
					) As CH
				Where
					AUS.PE_YEAR = '${year}'
					And AUS.PE_NUMERO = '${week}'
					And AUS.CB_CODIGO = '${numEmp}'
				Order By
					dia;`,
				"Error fetching prenomina days information",
				dbs.colabora,
			);
			return dias;
		},
		Prestamo: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);

			const code = {};
			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX":
					code.supervisor = "3";
					code.area = "5";
					code.proyecto = "0";
					code.planta = "7";
					break;
				case "SAL":
				case "TIJ":
					code.supervisor = "8";
					code.proyecto = "5";
					code.area = "6";
					code.planta = "1";
					break;
				default:
					return { success: false, message: "Región no soportada." };
			}

			// 2) Employee details (PARAMETERIZED)
			const userDetails = await executeParameterizedQuery(
				`
					SELECT
						C.CB_NIVEL${code.proyecto}   	AS project_code
					FROM COLABORA AS C
					WHERE C.CB_CODIGO = @param1
					`,
				[numEmp],
				"Error fetching user details",
				dbs.colabora,
			);

			const prestamo = await executeQuery(
				`Declare @CurrentYear INT = YEAR(GETDATE());
				Declare @Exists NVARCHAR(5);

				Set @Exists = (
					Select Case 
						When Exists (
							Select 1
							From PRESTAMO
							Where YEAR(PR_FECHA) = @CurrentYear
							And CB_CODIGO = ${numEmp}
							And PR_TIPO = '4'
						) Then 'true'
						Else 'false'
					End
				);

				Select 
					SUM(AH.AH_SALDO) * 2 As SaldoFA,
					@Exists As PrestamoExists

					From AHORRO As AH
						Where AH.CB_CODIGO = ${numEmp}
						And AH.AH_TIPO = '2' 
						And AH.AH_STATUS = 0
						And AH.AH_FECHA = (SELECT MAX(AH_FECHA) 
											FROM Ahorro 
											WHERE CB_CODIGO = '${numEmp}' 
												AND AH_STATUS = 0 
												AND AH_TIPO = '2');`,
				"Error fetching balance and existing loan",
				dbs.colabora,
			);

			// const prestamoKiosko = await executeQuery(
			// 	`Declare @CurrentYear INT = YEAR(GETDATE());
			// 	Declare @Exists NVARCHAR(5);

			// 	Set @Exists = (
			// 		Select Case
			// 			When Exists (
			// 				Select 1
			// 				From K_Solicitudes
			// 				Where YEAR(Fecha) = @CurrentYear
			// 				And No = ${numEmp}
			// 			) Then 'true'
			// 			Else 'false'
			// 		End
			// 	);

			// 	Select
			// 		@Exists As prestamoExists`,
			// 	"Error fetching existing loan k",
			// 	dbs.kioskotek
			// );

			const prestamo_weeks = await executeQuery(
				`SELECT TOP 1 
					semana_inicial AS initial_week,
					semana_final AS final_week
				FROM Prestamos
				ORDER BY fecha DESC;`,
				"Error fetching prestamo weeks information",
				"tecmamovilcentral",
			);

			const now = DateTime.now().setZone("America/Denver");

			function calculateMaxWeeks() {
				const initial_week = 6; // Fixed throughout the year
				const final_week = 41; // End of loan period

				// Get the current date/time in America/Denver timezone
				const now = DateTime.now().setZone("America/Denver");

				console.log("Now's date is: ", now.toISO());

				function getFirstSaturdayOfYear(year, zone = "America/Denver") {
					// Start from January 1st
					let first_day = DateTime.fromObject(
						{ year, month: 1, day: 1 },
						{ zone },
					);

					// Find the first Saturday
					while (first_day.weekday !== 6) {
						first_day = first_day.plus({ days: 1 });
					}

					return first_day.startOf("day");
				}

				const first_saturday = getFirstSaturdayOfYear(now.year);
				console.log("First Saturday of the Year: ", first_saturday.toISO());

				// Find the start of week 6 (loan period start) — Adjust to start at week 6
				const loan_start = first_saturday.plus({ weeks: initial_week - 1 });
				console.log("Loan Start (Start of Week 6): ", loan_start.toISO());

				// Calculate the current week based on Saturdays
				let current_week =
					Math.floor(now.diff(loan_start, "weeks").weeks) + initial_week;

				// Correct for boundary cases (ensure week shifts on Saturday)
				const current_saturday = now.startOf("week").plus({ days: 6 }); // This week's Saturday
				if (now < current_saturday) {
					current_week -= 1;
				}

				console.log("Current Week: ", current_week);

				// Ensure current_week doesn't exceed final_week
				if (current_week > final_week) {
					current_week = final_week;
				}

				// Calculate max weeks
				let max_weeks;
				console.log(
					"User's project code: ",
					userDetails[0].project_code.trim(),
				);
				if (userDetails[0].project_code.trim() === "H79") {
					max_weeks = 10;
				} else {
					max_weeks = final_week - current_week + 1;
				}

				return max_weeks;
			}

			// Example usage
			console.log("Max Weeks:", calculateMaxWeeks());

			return {
				saldo_fa: returnZero(prestamo[0].SaldoFA),
				prestamo: prestamo[0].PrestamoExists === "true" ? true : false,
				initial_week: prestamo_weeks[0].initial_week,
				final_week: prestamo_weeks[0].final_week,
				max_weeks: 30,
			};
		},
		Encuestas: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);
			const encuestas = await executeQuery(
				`Select
					KEnc.Encuesta As encuesta,
					Titulo As titulo,
					(
						Select
							Count(*)
						From
							CSC_EncPreguntas
						Where
							Encuesta = KEnc.Encuesta
					) As preguntas
				From
					K_Encuestas As KEnc
					Inner Join CSC_Encuestas As CEnc On CEnc.Codigo = KEnc.Encuesta
					And CEnc.Estatus = 1
				Where
					No = '${numEmp}'
					and KEnc.Estatus <> 'T'
				Order By
					KEnc.Encuesta`,
				"Error fetching encuestas information",
				dbs.kioskotek,
			);
			// return encuestas;
			// const encuestas1 = [{}, {}, {}, {}];
			return encuestas;
		},
		Encuesta: async (_, { encuesta, region }) => {
			const dbs = await selectRegion(region);

			const answers = await executeQuery(
				`Select *
				From
					CSC_TRespuesta`,
				"Error fetching respuestas information",
				dbs.kioskotek,
			);

			const questions = await executeQuery(
				`Select
					Pregunta As pregunta,
					Codigo as codigo,
					TipoResp As tipo,
					Instrucciones As notas
				From
					CSC_EncPreguntas
				Where
					Encuesta = '${encuesta}'
				Order By
					Codigo Asc`,
				"Error fetching preguntas information",
				dbs.kioskotek,
			);

			// console.log("Respuestas: ", answers);
			// Transform the questions array
			const updatedQuestions = questions.map((question) => {
				// Find the matching answer by tipo
				const matchingAnswer = answers.find(
					(answer) => answer.Tipo === question.tipo,
				);

				// console.log("Matching is ", matchingAnswer);

				// Extract values from keys that match "V<number>" and are not empty
				const respuestas = Object.keys(matchingAnswer || {})
					.filter((key) => /^V\d+$/.test(key)) // Match keys that start with "V" followed by a number
					.map((key) => matchingAnswer[key]) // Get the values of those keys
					.filter((value) => typeof value === "string" && value.trim() !== ""); // Keep non-empty strings

				// Remove 'tipo' key and add 'respuestas'
				const { tipo, ...rest } = question;
				return {
					...rest,
					respuestas,
				};
			});

			console.log(updatedQuestions);
			return updatedQuestions;

			// console.log("Preguntas: ", preguntas);
		},
		Policies: async (_, { region }) => {
			const dbs = await selectRegion(region);

			try {
				const policies = await executeQuery(
					`Select id, 
						status, 
						poliza as policy, 
						icono as icon, 
						linea_1 as line_1, 
						linea_2 as line_2, 
						linea_3 as line_3,
						ref_1,
						ref_2,
						ref_3,
						ref_4,
						icono_ref_1 as icon_ref_1,
						icono_ref_2 as icon_ref_2,
						icono_ref_3 as icon_ref_3,
						icono_ref_4 as icon_ref_4
					From Polizas
					WHERE id <> 4`,
					"Error querying policies",
					dbs.tecmamovil,
				);

				console.log("Polizas: ", policies);

				return { success: true, message: "Success", data: policies };
			} catch (error) {
				console.log("Error getting policies", JSON.stringify(error, null, 1));
				return { success: false, message: "Error ocurred" };
			}

			return;
			// return updatedQuestions;
		},
		TestQuery: async () => {
			const projects = [
				"007",
				"04",
				"05",
				"06",
				"10",
				"11",
				"12",
				"13",
				"14",
				"15",
				"16",
				"17",
				"18",
				"2",
				"21",
				"22",
				"23",
				"24",
				"25",
				"26",
				"27",
				"28",
				"29",
				"3",
				"30",
				"31",
				"32",
				"33",
				"34",
				"35",
				"36",
				"37",
				"38",
				"39",
				"40",
				"41",
				"42",
				"42A",
				"43",
				"44",
				"45",
				"5",
				"53",
				"6",
				"6A",
				"7",
				"77",
				"78",
				"78A",
				"79",
				"8",
				"82",
				"83",
				"84",
				"89",
				"9",
				"91",
				"ELP",
				"H01",
				"H02",
				"H03",
				"H04",
				"H05",
				"H06",
				"H07",
				"H08",
				"H09",
				"H10",
				"H11",
				"H12",
				"H13",
				"H14",
				"H15",
				"H16",
				"H17",
				"H18",
				"H19",
				"H20",
				"H21",
				"H22",
				"H23",
				"H24",
				"H25",
				"H26",
				"H27",
				"H28",
				"H29",
				"H30",
				"H32",
				"H33",
				"H34",
				"H35",
				"H36",
				"H38",
				"H39",
				"H41",
				"H42",
				"H43",
				"H44",
				"H45",
				"H46",
				"H47",
				"H48",
				"H49",
				"H50",
				"H51",
				"H52",
				"H53",
				"H54",
				"H55",
				"H56",
				"H57",
				"H58",
				"H59",
				"H60",
				"H61",
				"H62",
				"H63",
				"H64",
				"H65",
				"H66",
				"H67",
				"H68",
				"H69",
				"H70",
				"H71",
				"H72",
				"H73",
				"H74",
				"H86",
				"H90",
				"H91",
				"H92",
				"H99",
				"IOS01",
				"IOS02",
				"IOS03",
				"IOS04",
				"IOS05",
				"IOS06",
			];

			// Create an array of promises for the queries
			const queryPromises = projects.map((project) =>
				executeQuery(
					`Select
						TB_ELEMENT
					From
						NIVEL5
					Where
						TB_CODIGO = '${project}'`,
					"Error",
					dbs.colabora,
				),
			);

			// Wait for all queries to complete
			// try {
			// 	const results = await Promise.all(queryPromises);
			// 	results.forEach((result, index) => {
			// 		console.log(`Proyecto ${projects[index]}:`, result);
			// 	});
			// } catch (error) {
			// 	console.error("An error occurred while executing the queries:", error);
			// }
		},
		IsSupervisor: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);

			const isSupervisor = await executeQuery(
				`SELECT
					CASE 
						WHEN EXISTS (
							SELECT 1 
							FROM NIVEL3
							WHERE TB_NUMERO = ${numEmp}
						)
						THEN CAST(1 AS BIT)
						ELSE CAST(0 AS BIT)
					END AS match;`,
				"Error fetching supervisor information",
				dbs.colabora,
			);

			if (isSupervisor && isSupervisor[0].match) {
				return { success: true, message: "User is a superior" };
			} else {
				return { success: false, message: "User is not a superior" };
			}

			// const isSupervisor = await executeQuery(
			// 	`SELECT
			// 		CASE
			// 			WHEN EXISTS (
			// 				SELECT 1
			// 				FROM NIVEL3
			// 				WHERE TB_NUMERO = ${numEmp}
			// 			)
			// 			THEN (
			// 				SELECT TOP 1 TB_CODIGO
			// 				FROM NIVEL3
			// 				WHERE TB_NUMERO = ${numEmp}
			// 			)
			// 			ELSE 'FALSE'
			// 		END AS result;`,
			// 	"Error fetching supervisor information",
			// 	dbs.colabora
			// );

			// console.log("is supervisor data: ", isSupervisor[0])

			// if (isSupervisor[0].result && numEmp !== 0 && numEmp !== '0') {
			// 	const activeEmployees = await executeQuery(
			// 		`SELECT CB_CODIGO as employeeNum
			// 			FROM COLABORA
			// 			WHERE CB_NIVEL3 = '${isSupervisor[0].result.trim()}'
			// 			AND CB_ACTIVO = 'S'`,
			// 		"Error fetching employees information",
			// 		dbs.colabora
			// 	);

			// 	if (activeEmployees && activeEmployees.length > 0) {
			// 		console.log("Active employees under supervisor: ", activeEmployees)
			// 		const employeeNums = activeEmployees
			// 			.map(emp => `'${emp.employeeNum}'`) // wrap each number in single quotes
			// 			.join(', ');

			// 		console.log("Employee numbers: ", employeeNums);

			// 		const employeeRequests = await executeQuery(
			// 			`SELECT No as numEmp, Nombre as name, Carta as type
			// 				FROM K_Solicitudes
			// 				WHERE No IN (${employeeNums})
			// 				AND Pendiente = '0'
			// 				AND (Carta = 'Vacaciones'
			// 				or Carta = 'Permiso')`,
			// 			"Error fetching employee requests information",
			// 			dbs.kioskotek
			// 		);
			// 		if (employeeRequests && employeeRequests.length > 0) {

			// 			return { success: true, message: "Available requests", data: employeeRequests }
			// 		} else {
			// 			return { success: true, message: "No requests" }
			// 		}
			// 		console.log("Employee requests: ", employeeRequests)
			// 	}
			// 	return { success: true, message: "Done", }
			// } else {
			// 	return { success: false, message: "Done" }
			// }
		},
		ComplaintInfo: async (_, { region }) => {
			// const dbs = await selectRegion(region);

			const email = "t.escuchamos@tecma.com";
			const phone =
				region === "TIJ"
					? "8116010519"
					: region === "MTY" || region === "SAL"
						? "6647983328"
						: "6563755037"; // Telefono central

			return { success: true, message: "Done", data: { email, phone } };
		},
		Notifications: requireAuth(async (_, __, { user }) => {
			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				console.log("User is: ", user);
				// return { id: true };
				// 1. Select correct DB
				const dbs = await selectRegion(user.region);

				let code = {};
				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX": {
						code.supervisor = "3";
						code.area = "5";
						code.planta = "7";
						break;
					}
					case "SAL":
					case "TIJ": {
						code.supervisor = "8";
						code.area = "6";
						code.planta = "1";
						break;
					}
				}

				const userDetails = await executeQuery(
					`SELECT CB_CODIGO as employee_id,
						CB_NIVEL${code.area} AS area,
						CB_NIVEL${code.supervisor} AS project,
						CB_NIVEL${code.planta} AS plant
					FROM COLABORA
					WHERE CB_CODIGO = '${user.empId}'`,
					"Error fetching user details",
					dbs.colabora,
				);

				// console.log("User details are: ", userDetails[0])
				// console.log("User area is: ", userDetails[0].area.trim())

				const notificationsQuery = `SELECT DISTINCT n.id, n.title, n.message, n.created_at
						FROM notifications n
						JOIN notificationTargets t ON n.id = t.notification_id
						WHERE n.is_active = 1 AND t.is_active = 1
							AND (t.region_id IS NULL OR t.region_id = (
								SELECT region_id FROM Regions WHERE region_code = '${region}'
							))
							AND (t.area_id IS NULL OR t.area_id = '${userDetails[0].area.trim()}')
							AND (t.project_id IS NULL OR t.project_id = '${userDetails[0].project.trim()}')
							AND (t.plant_id IS NULL OR t.plant_id = '${userDetails[0].plant.trim()}')
							AND (t.employee_id IS NULL OR t.employee_id = '${empId}')
							AND NOT EXISTS (
								SELECT 1 FROM notificationsRead r
								WHERE r.notification_id = n.id AND r.employee_id = '${empId}'
							)
						ORDER BY n.created_at DESC`;

				// console.log("Notifications query is: ", notificationsQuery)
				const notifications = await executeQuery(
					notificationsQuery,
					"Error fetching notifications",
					"tecmamovilcentral",
				);

				// For each notification, fetch file names (NOT URLs)
				const enriched = await Promise.all(
					notifications.map(async (n) => {
						const files = await executeQuery(
							`SELECT id, file_name
								FROM notificationFiles
								WHERE notification_id = ${n.id}
							`,
							"Error fetching file names",
							"tecmamovilcentral",
						);

						return {
							...n,
							files,
						};
					}),
				);

				console.log("Returning: ", enriched);

				return enriched;
			} catch (error) {
				console.error("Error in notifications resolver:", error);
				throw new Error("Failed to load notifications");
			}
		}),
		NotificationFileUrl: requireAuth(
			async (_, { notificationId, fileId }, { user }) => {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				// 1) Select correct DBs for this region
				const dbs = await selectRegion(region);

				// 2) Map NIVEL indices based on region (same logic you use in Notifications)
				let code = {};
				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX":
						code.supervisor = "3";
						code.area = "5";
						code.planta = "7";
						break;
					case "SAL":
					case "TIJ":
						code.supervisor = "8";
						code.area = "6";
						code.planta = "1";
						break;
					default:
						throw new Error(`Unsupported region: ${region}`);
				}

				// 3) Get user details (area/project/plant)
				const userDetails = await executeQuery(
					`SELECT CB_CODIGO as employee_id,
						CB_NIVEL${code.area}       AS area,
						CB_NIVEL${code.supervisor} AS project,
						CB_NIVEL${code.planta}     AS plant
				FROM COLABORA
				WHERE CB_CODIGO = '${empId}'`,
					"Error fetching user details",
					dbs.colabora,
				);

				if (!userDetails?.length)
					throw new Error("Employee not found for region");

				const area = String(userDetails[0].area || "").trim();
				const project = String(userDetails[0].project || "").trim();
				const plant = String(userDetails[0].plant || "").trim();

				// 4) Verify the notification is visible to this user (same targeting logic)
				const visibilityQuery = `
				SELECT TOP 1 n.id
				FROM notifications n
				JOIN notificationTargets t ON n.id = t.notification_id
				WHERE n.is_active = 1 AND t.is_active = 1
				AND n.id = ${Number(notificationId)}
				AND (t.region_id   IS NULL OR t.region_id   = (SELECT region_id FROM Regions WHERE region_code = '${region}'))
				AND (t.area_id     IS NULL OR t.area_id     = '${area}')
				AND (t.project_id  IS NULL OR t.project_id  = '${project}')
				AND (t.plant_id    IS NULL OR t.plant_id    = '${plant}')
				AND (t.employee_id IS NULL OR t.employee_id = '${empId}')
			`;

				const visibility = await executeQuery(
					visibilityQuery,
					"Error verifying notification visibility",
					"tecmamovilcentral",
				);

				if (!visibility?.length)
					throw new Error("Notification not found or not authorized");

				// 5) Ensure the file belongs to this notification
				const fileRow = await executeQuery(
					`SELECT TOP 1 id, file_name
				FROM notificationFiles
				WHERE id = ${Number(fileId)}
				AND notification_id = ${Number(notificationId)}`,
					"Error verifying notification file",
					"tecmamovilcentral",
				);

				if (!fileRow?.length)
					throw new Error("File not found for this notification");

				const fileName = fileRow[0].file_name;
				// basic allowlist to avoid traversal
				if (!/^[a-zA-Z0-9._-]+$/.test(fileName))
					throw new Error("Invalid filename");

				// 6) Sign a short-lived (2 min) download token
				const token = jwt.sign(
					{ typ: "download", file: fileName, empId, region },
					notifKey,
					{ expiresIn: "2m" },
				);

				// 7) Build absolute URL to your download route
				const base =
					process.env.HOST === "PRODUCTION"
						? "https://api.tecmamovilconnect.com"
						: process.env.LOCAL_IP_ADDRESS;

				return {
					success: true,
					message: "File URL generated",
					url: `${base}/download/notification?token=${encodeURIComponent(token)}`,
				};
			},
		),
		LoanData: requireAuth(async (_, __, { user }) => {
			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				const BUSINESS_TZ = "America/Denver";
				const now = DateTime.now().setZone(BUSINESS_TZ);

				const dbs = await selectRegion(region);

				const code = {};

				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX":
						code.supervisor = "3";
						code.area = "5";
						code.proyecto = "0";
						code.planta = "7";
						break;

					case "SAL":
					case "TIJ":
						code.supervisor = "8";
						code.proyecto = "5";
						code.area = "6";
						code.planta = "1";
						break;

					default:
						return {
							success: false,
							message: "Región no soportada.",
						};
				}

				// 1) Fetch employee details
				const userDetails = await executeParameterizedQuery(
					`
					SELECT
						C.CB_CODIGO AS employee_id,
						C.CB_CLASIFI AS classification,
						C.CB_NIVEL${code.proyecto} AS project_code
					FROM COLABORA AS C
					WHERE C.CB_CODIGO = @param1
					`,
					[empId],
					"Error fetching user details",
					dbs.colabora,
				);

				if (!userDetails?.length) {
					return {
						success: false,
						message: "Empleado no encontrado.",
					};
				}

				const employee = userDetails[0];

				const projectCode = String(employee.project_code || "")
					.trim()
					.toUpperCase();

				const isH79 = projectCode === "H79";

				const H79_RULES = {
					weeks: 10,

					/*
					 * The existing frontend receives a weekly percentage and multiplies it
					 * by the selected number of weeks.
					 *
					 * 0.3% x 10 weeks = 3% total interest.
					 */
					weeklyInterestRate: 0.3,
					totalInterestRate: 3,

					/*
					 * Principal + 3% interest may not exceed 80% of the available balance.
					 */
					maxTotalRatio: 0.8,

					/*
					 * Last day on which H79 users can request a loan.
					 */
					requestDeadline: "2026-09-06",
				};

				console.log("User details are: ", employee);

				// 2) Fetch savings balance
				const balanceResult = await executeParameterizedQuery(
					`
			SELECT
				SUM(AH.AH_SALDO) * 2 AS SaldoFA
			FROM AHORRO AS AH
			WHERE AH.CB_CODIGO = @param1
				AND AH.AH_TIPO = '2'
				AND AH.AH_STATUS = 0
				AND AH.AH_FECHA = (
					SELECT MAX(AH_FECHA)
					FROM AHORRO
					WHERE CB_CODIGO = @param1
						AND AH_STATUS = 0
						AND AH_TIPO = '2'
				)
			`,
					[empId],
					"Error fetching balance",
					dbs.colabora,
				);

				console.log("Balance result: ", balanceResult?.[0]);

				const balance = Number.parseFloat(balanceResult?.[0]?.SaldoFA || 0);

				// if (!Number.isFinite(balance) || balance <= 0) {
				// 	return {
				// 		success: false,
				// 		message: "No fue posible obtener el saldo disponible.",
				// 	};
				// }

				let isAllowed = false;
				let reason = null;
				let maxWeeks = 0;

				// 3) Check existing loan in the new system
				const existingLoan = await executeParameterizedQuery(
					`
			SELECT TOP 1 status
			FROM Loans
			WHERE employee_id = @param1
				AND YEAR(requested_at) = YEAR(GETDATE())
			ORDER BY requested_at DESC
			`,
					[empId],
					"Error checking existing loan",
					"tecmamovilcentral",
				);

				// Check pending request in the old Kioskotek system
				const oldRequestedLoan = await executeParameterizedQuery(
					`
			DECLARE @CurrentYear INT = YEAR(GETDATE());
			DECLARE @StartDate DATE = DATEFROMPARTS(@CurrentYear, 1, 1);
			DECLARE @EndDate DATE = DATEFROMPARTS(@CurrentYear + 1, 1, 1);

			SELECT
				CASE
					WHEN EXISTS (
						SELECT 1
						FROM K_Solicitudes
						WHERE Fecha >= @StartDate
							AND Fecha < @EndDate
							AND Carta = 'PtmoFA'
							AND No = @param1
					)
					THEN 'true'
					ELSE 'false'
				END AS status;
			`,
					[empId],
					"Error fetching existing loan request from Kioskotek",
					dbs.kioskotek,
				);

				// Check delivered loan in the old Colabora system
				const oldExistingLoan = await executeParameterizedQuery(
					`
			DECLARE @CurrentYear INT = YEAR(GETDATE());

			SELECT
				CASE
					WHEN EXISTS (
						SELECT 1
						FROM PRESTAMO
						WHERE YEAR(PR_FECHA) = @CurrentYear
							AND CB_CODIGO = @param1
							AND PR_TIPO = '4'
					)
					THEN 'true'
					ELSE 'false'
				END AS status;
			`,
					[empId],
					"Error fetching existing loan from Colabora",
					dbs.colabora,
				);

				let loanStatus = existingLoan?.[0]?.status || null;

				const oldLoanRequested = oldRequestedLoan?.[0]?.status === "true";

				const oldLoanExists = oldExistingLoan?.[0]?.status === "true";

				if (oldLoanRequested) {
					isAllowed = false;
					loanStatus = "PENDING";
				}

				if (oldLoanExists) {
					isAllowed = false;
					loanStatus = "COMPLETED";
				}

				console.log(
					"Existing loan status: ",
					loanStatus,
					"Old loan exists: ",
					oldLoanExists,
					"Old loan requested: ",
					oldLoanRequested,
				);

				if (loanStatus) {
					switch (loanStatus) {
						case "PENDING":
							isAllowed = false;
							reason =
								"Tienes una solicitud de préstamo pendiente de aprobación.";
							break;

						case "APPROVED":
							isAllowed = false;
							reason = "Tienes una solicitud de préstamo aprobada.";
							break;

						case "ACTIVE":
							isAllowed = false;
							reason = "Tienes un préstamo activo.";
							break;

						case "REJECTED":
							isAllowed = false;
							reason = "Tienes una solicitud de préstamo rechazada.";
							break;

						case "COMPLETED":
							isAllowed = false;
							reason = "Has solicitado un préstamo y ha sido entregado.";
							break;

						default:
							isAllowed = false;
							reason = "Ya existe una solicitud de préstamo registrada.";
							break;
					}
				} else {
					isAllowed = true;
					reason = "No tienes solicitudes de préstamo activas.";
				}

				// 4) Fetch loan cycle config
				const cycleResult = await executeParameterizedQuery(
					`
			SELECT TOP 1
				semana_inicial,
				semana_final
			FROM Prestamos
			ORDER BY fecha DESC
			`,
					[],
					"Error fetching loan cycle",
					"tecmamovilcentral",
				);

				console.log("Loan cycle config: ", cycleResult?.[0]);

				const initialWeek = Number(cycleResult?.[0]?.semana_inicial);
				const finalWeek = Number(cycleResult?.[0]?.semana_final);

				if (
					!Number.isInteger(initialWeek) ||
					!Number.isInteger(finalWeek) ||
					initialWeek <= 0 ||
					finalWeek < initialWeek
				) {
					return {
						success: false,
						message:
							"No hay un periodo de préstamos configurado correctamente.",
					};
				}

				function getFirstSaturday(year) {
					let first = DateTime.fromObject(
						{
							year,
							month: 1,
							day: 1,
						},
						{
							zone: BUSINESS_TZ,
						},
					);

					while (first.weekday !== 6) {
						first = first.plus({ days: 1 });
					}

					return first.startOf("day");
				}

				const firstSaturday = getFirstSaturday(now.year);

				const loanStart = firstSaturday.plus({
					weeks: initialWeek - 1,
				});

				const configuredLoanEnd = firstSaturday
					.plus({
						weeks: finalWeek - 1,
					})
					.endOf("week");

				const h79LoanEnd = DateTime.fromISO(H79_RULES.requestDeadline, {
					zone: BUSINESS_TZ,
				}).endOf("day");

				const effectiveLoanEnd = isH79 ? h79LoanEnd : configuredLoanEnd;

				if (isAllowed && (now < loanStart || now > effectiveLoanEnd)) {
					isAllowed = false;

					reason = isH79
						? "El periodo para solicitar el préstamo H79 finalizó el 6 de septiembre de 2026."
						: "No se encuentra dentro del periodo permitido para préstamos.";
				}

				if (isAllowed) {
					if (isH79) {
						/*
						 * H79 always receives a fixed 10-week term. It does not decrease
						 * according to the number of weeks remaining in the regular cycle.
						 */
						maxWeeks = H79_RULES.weeks;
					} else {
						console.log(
							`Current week of the year: ${now.weekNumber}, Loan start week: ${loanStart.weekNumber}, Loan end week: ${configuredLoanEnd.weekNumber}`,
						);

						const currentWeek =
							Math.floor(now.diff(loanStart, "weeks").weeks) + initialWeek;

						maxWeeks = finalWeek - currentWeek + 1;

						if (maxWeeks < 2) {
							isAllowed = false;
							maxWeeks = 0;
							reason = "El periodo restante no permite un mínimo de 2 semanas.";
						}
					}
				}

				/*
				 * The normal project rate remains 0.159% per week.
				 *
				 * H79 uses 0.3% per week because its term is fixed at 10 weeks:
				 * 0.3% x 10 = 3% total.
				 */
				const interestRate = isH79 ? H79_RULES.weeklyInterestRate : 0.159;

				const minAmount = Number((balance * 0.1).toFixed(2));

				const floorToCents = (value) =>
					Math.floor((value + Number.EPSILON) * 100) / 100;

				/*
				 * For H79:
				 *
				 * principal + 3% interest <= 80% of balance
				 *
				 * principal <= (balance x 80%) / 1.03
				 */
				const maxAmount = isH79
					? floorToCents(
						(balance * H79_RULES.maxTotalRatio) /
						(1 + H79_RULES.totalInterestRate / 100),
					)
					: Number((balance * 0.9).toFixed(2));

				console.log("Loan eligibility data: ", {
					isAllowed,
					reason,
					projectCode,
					isH79,
					balance,
					minAmount,
					maxAmount,
					maxWeeks,
					interestRate,
					totalInterestRate: isH79 ? H79_RULES.totalInterestRate : null,
					loanStatus,
					loanStart: loanStart.toISO(),
					configuredLoanEnd: configuredLoanEnd.toISO(),
					effectiveLoanEnd: effectiveLoanEnd.toISO(),
					now: now.toISO(),
				});

				return {
					success: true,
					message: "Información de préstamo obtenida exitosamente.",
					data: {
						isAllowed,
						reason,
						balance,
						minAmount,
						maxAmount,
						maxWeeks: isAllowed ? maxWeeks : 0,

						/*
						 * This remains a weekly percentage for compatibility with the
						 * current frontend calculation:
						 *
						 * interest = amount x interestRate x weeks / 100
						 */
						interestRate,

						loanStatus,
						cycle: {
							startDate: loanStart.toISO(),
							endDate: effectiveLoanEnd.toISO(),
						},
						serverNow: now.toISO(),
					},
				};
			} catch (error) {
				console.error("LoanData resolver error:", error);

				return {
					success: false,
					message: "Hubo un error al obtener la información del préstamo.",
				};
			}
		}),
		BadgeData: requireAuth(async (_, __, { user }) => {
			try {
				if (!user) throw new Error("Unauthorized");

				// const { empId, region } = user;

				return { success: true, message: "Done", data: { format: "CODE128" } };
			} catch (error) {
				console.error("Error in badge data resolver:", error);
				throw new Error("Failed to load badge data");
			}
		}),
		downloadLoanFileInternal: requireServiceAuth("loans:read")(
			async (_, { loan_id }) => {
				try {
					if (!loan_id) throw new Error("loan_id required");

					const result = await executeParameterizedQuery(
						`
        SELECT 
            pdf_relative_path,
            employee_id,
            requested_at
        FROM Loans
        WHERE loan_id = @loan_id
        `,
						[{ name: "loan_id", type: sql.Int, value: loan_id }],
					);

					if (!result.length) throw new Error("Loan not found");

					const loan = result[0];

					const filePath = path.join(process.cwd(), loan.pdf_relative_path);

					if (!fs.existsSync(filePath)) throw new Error("Loan file not found");

					const fileBuffer = fs.readFileSync(filePath);

					/* -----------------------------
					   Generate better filename
					----------------------------- */

					const timestamp = DateTime.fromJSDate(loan.requested_at).toFormat(
						"yyyyLLddHHmm",
					);

					const filename = `Prestamo_${loan.employee_id}_${timestamp}.pdf`;

					return {
						success: true,
						filename,
						file: fileBuffer.toString("base64"),
					};
				} catch (error) {
					console.error("Loan file download error:", error);
					throw new Error("Failed to download loan file");
				}
			},
		),
		RequestLoanDownloadURL: requireServiceAuth("loans:read")(
			async (_, { loan_id }) => {
				console.log("Requesting download URL for loan_id: ", loan_id);

				try {
					const result = await executeParameterizedQuery(
						`
						SELECT pdf_relative_path
						FROM Loans
						WHERE loan_id = @param1
					`,
						[loan_id],
						"Error fetching Loan relative path",
						"tecmamovilcentral",
					);

					console.log("Result is: ", result);

					if (!result.length)
						return {
							success: false,
							message: "Loan not found",
						};
					const token = jwt.sign(
						{
							loan_id,
							scope: "loan_download",
						},
						process.env.FILE_DOWNLOAD_SECRET,
						{
							expiresIn: "60s",
						},
					);

					const download_url = `${process.env.TMC_API_BASE}/download/loan?token=${token}`;
					console.log("Download URL is: ", download_url);
					return {
						success: true,
						message: "File found and URL retrieved",
						download_url,
					};
				} catch (error) {
					console.log("Error generating loan download URL: ", error);
					return {
						success: false,
						message: "Error generating download URL",
					};
				}
			},
		),
		PrivacyNoticeEligibility: requireAuth(async (_, __, { user }) => {
			if (!user)
				return {
					success: false,
					message: "No autorizado",
				};

			const { empId, region } = user;

			const dbs = await selectRegion(region);

			let code = {};

			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX":
					code.supervisor = "3";
					code.area = "5";
					code.planta = "7";
					break;

				case "SAL":
				case "TIJ":
					code.supervisor = "8";
					code.area = "6";
					code.planta = "1";
					break;

				default:
					return {
						success: false,
						message: `Región no soportada`,
					};
			}

			const userDetails = await executeQuery(
				`
					SELECT CB_NIVEL${code.supervisor} AS project_id,
						CB_NIVEL${code.area} AS area_id
						FROM COLABORA
						WHERE CB_CODIGO = '${empId}'
					`,
				"Error fetching user project",
				dbs.colabora,
			);

			if (!userDetails?.length) {
				return {
					success: false,
					message: "Empleado no encontrado para esta región",
				};
			}

			const projectId = String(userDetails[0].project_id || "").trim();
			const areaId = String(userDetails[0].area_id || "").trim();

			const allowedProjectIds = ["H66"];

			if (empId === "900874") {
				return {
					success: true,
					message: "Empleado elegible para aviso de privacidad",
				};
			} else {
				if (!allowedProjectIds.includes(projectId)) {
					return {
						success: false,
						message: "Empleado no autorizado para este proyecto",
					};
				}

				const allowedAreaIds = ["66-002", "02-004", "02-003"];

				if (!allowedAreaIds.includes(areaId)) {
					return {
						success: false,
						message: "Empleado no autorizado para esta área",
					};
				}

				return {
					success: true,
					message: "Empleado elegible para aviso de privacidad",
				};
			}
		}),
		PrivacyNoticeURL: requireAuth(async (_, __, { user }) => {
			if (!user)
				return {
					success: false,
					message: "No autorizado",
				};

			const { empId, region } = user;

			const dbs = await selectRegion(region);

			let code = {};

			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX":
					code.supervisor = "3";
					code.area = "5";
					code.planta = "7";
					break;

				case "SAL":
				case "TIJ":
					code.supervisor = "8";
					code.area = "6";
					code.planta = "1";
					break;

				default:
					return {
						success: false,
						message: `Región no soportada`,
					};
			}

			const userDetails = await executeQuery(
				`
					SELECT CB_NIVEL${code.supervisor} AS project_id,
						CB_NIVEL${code.area} AS area_id
						FROM COLABORA
						WHERE CB_CODIGO = '${empId}'
					`,
				"Error fetching user project",
				dbs.colabora,
			);

			if (!userDetails?.length) {
				return {
					success: false,
					message: "Empleado no encontrado para esta región",
				};
			}

			const projectId = String(userDetails[0].project_id || "").trim();
			const areaId = String(userDetails[0].area_id || "").trim();

			const allowedProjectIds = ["H66"];

			if (empId === "900874") {
				console.log("Allowed");
			} else {
				if (!allowedProjectIds.includes(projectId)) {
					return {
						success: false,
						message: "Empleado no autorizado para este proyecto",
					};
				}

				const allowedAreaIds = ["66-002", "02-004", "02-003"];

				if (!allowedAreaIds.includes(areaId)) {
					return {
						success: false,
						message: "Empleado no autorizado para esta área",
					};
				}
			}

			const fileName = "politica_de_calidad_dynamco.pdf";

			if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
				return {
					success: false,
					message: "Nombre de archivo inválido",
				};
			}

			const token = jwt.sign(
				{
					typ: "privacy_notice_download",
					file: fileName,
					empId,
					region,
					projectId,
					areaId,
				},
				fileKey,
				{ expiresIn: "2m" },
			);

			const base =
				process.env.HOST === "PRODUCTION"
					? "https://api.tecmamovilconnect.com"
					: process.env.LOCAL_IP_ADDRESS;

			return {
				success: true,
				message: "URL de política de privacidad generada",
				file_url: `${base}/download/privacy-notice?token=${encodeURIComponent(token)}`,
			};
		}),
		TodayCheckIns: requireAuth(async (_, __, { user }) => {
			// await new Promise((resolve) => setTimeout(resolve, 5000));

			function formatCheckTime(value) {
				if (value === null || value === undefined) return null;

				const raw = String(value).trim();

				if (!raw) return null;

				const padded = raw.padStart(4, "0");

				if (!/^\d{4}$/.test(padded)) return raw;

				const hours = padded.slice(0, 2);
				const minutes = padded.slice(2, 4);

				return `${hours}:${minutes}`;
			}

			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				if (!empId) {
					return {
						success: false,
						message: "No se pudo identificar al empleado desde el token.",
						data: null,
					};
				}

				if (!region) {
					return {
						success: false,
						message: "No se pudo identificar la región desde el token.",
						data: null,
					};
				}

				const dbs = await selectRegion(region);

				const timezone = getBusinessTimezoneByRegion(region);
				const now = DateTime.now().setZone(timezone);

				const startOfDay = now.startOf("day");
				const endOfDay = startOfDay.plus({ days: 1 });

				console.log("todayCheckIns days: ", {
					now: now.toISO(),
					startOfDay: startOfDay.toISO(),
					endOfDay: endOfDay.toISO(),
					timezone,
				});

				// IMPORTANT:
				// Do not use .toJSDate() here.
				// SQL Server DATETIME has no timezone, and AU_FECHA is stored as local 00:00:00.
				const sqlStartOfDay = startOfDay.toFormat("yyyy-LL-dd HH:mm:ss");
				const sqlEndOfDay = endOfDay.toFormat("yyyy-LL-dd HH:mm:ss");


				const result = await executeParameterizedQuery(
					`
					DECLARE @StartOfDay DATETIME2 = CONVERT(DATETIME2, @param2, 120);
					DECLARE @EndOfDay DATETIME2 = CONVERT(DATETIME2, @param3, 120);

					SELECT
						TRY_CONVERT(INT, CH.CH_POSICIO) AS horario,

						MAX(CASE
							WHEN TRY_CONVERT(INT, CH.CH_TIPO) = 1
							THEN CH.CH_H_REAL
						END) AS entrada_raw,

						MAX(CASE
							WHEN TRY_CONVERT(INT, CH.CH_TIPO) = 2
							THEN CH.CH_H_REAL
						END) AS salida_raw
					FROM CHECADAS AS CH
					WHERE CH.CB_CODIGO = @param1
						AND CH.AU_FECHA >= @StartOfDay
						AND CH.AU_FECHA < @EndOfDay
						AND TRY_CONVERT(INT, CH.CH_TIPO) IN (1, 2)
						AND TRY_CONVERT(INT, CH.CH_POSICIO) IS NOT NULL
						AND ISNULL(CH.CH_IGNORAR, 'N') <> 'S'
					GROUP BY TRY_CONVERT(INT, CH.CH_POSICIO)
					ORDER BY TRY_CONVERT(INT, CH.CH_POSICIO);
					`,
					[
						empId,
						sqlStartOfDay,
						sqlEndOfDay,
					],
					"Error fetching today's check-ins",
					dbs.colabora,
				);

				// console.log("todayCheckIns params:", {
				// 	empId,
				// 	timezone,
				// 	sqlStartOfDay,
				// 	sqlEndOfDay,
				// 	rawResult: result,
				// });

				const punches = (result || []).map((row) => ({
					horario: Number(row.horario),

					entrada: formatCheckTime(row.entrada_raw),
					salida: formatCheckTime(row.salida_raw),

					entrada_raw:
						row.entrada_raw !== null && row.entrada_raw !== undefined
							? String(row.entrada_raw).trim()
							: null,

					salida_raw:
						row.salida_raw !== null && row.salida_raw !== undefined
							? String(row.salida_raw).trim()
							: null,
				}));

				return {
					success: true,
					message: "Checadas obtenidas correctamente.",
					data: {
						date: startOfDay.toISODate(),
						timezone,
						punches,
						serverNow: now.toISO(),
					},
				};
			} catch (err) {
				console.error("todayCheckIns error:", err);

				return {
					success: false,
					message: "Error al obtener las checadas del día.",
					data: null,
				};
			}
		}),
		getEmployeeAbsenceRequests: requireAuth(
			async (_, { input = {} }, { user }) => {
				console.log("getEmployeeAbsenceRequests called with input:", input);
				const ABSENCE_REQUEST_SELECT = `
					SELECT
						AR.AbsenceRequestId AS id,

						AR.EmployeeId AS employeeId,
						AR.EmployeeName AS employeeName,

						AR.RegionId AS regionId,
						RG.region_code AS regionCode,
						RG.region_name AS regionName,

						AR.RequestTypeId AS requestTypeId,
						RT.Description AS requestType,

						AR.StatusId AS statusId,
						RS.Description AS status,

						AR.ReasonId AS reasonId,
						RR.Description AS reason,

						AR.StartDate AS startDate,
						AR.EndDate AS endDate,
						AR.RequestedAt AS requestedAt,

						AR.TotalDays AS totalDays,

						AR.EmployeeComment AS employeeComment,

						AR.CancelledAt AS cancelledAt,
						AR.CancellationComment AS cancellationComment,

						AR.SupervisorPayrollId AS supervisorPayrollId,
						AR.SupervisorAppId AS supervisorAppId,

						AR.PreApprovedBySupervisorAppId AS preApprovedBySupervisorAppId,
						AR.PreApprovedAt AS preApprovedAt,

						AR.ApprovedByHRId AS approvedByHRId,
						AR.ApprovedAt AS approvedAt,

						AR.RejectedBySupervisorAppId AS rejectedBySupervisorAppId,
						AR.RejectedByHRId AS rejectedByHRId,
						AR.RejectedAt AS rejectedAt,

						AR.ModifiedByHRId AS modifiedByHRId,
						AR.ModifiedAt AS modifiedAt,

						AR.SupervisorComment AS supervisorComment,
						AR.HRComment AS hrComment,

						AR.PlantId AS plantId,
						AR.ProjectId AS projectId,
						AR.AreaId AS areaId,
						AR.TurnId AS turnId,
						AR.JobTitleId AS jobTitleId,
						AR.ClassificationId AS classificationId
					FROM dbo.AbsenceRequests AS AR
					INNER JOIN dbo.Regions AS RG
						ON AR.RegionId = RG.region_id
					INNER JOIN dbo.AbsenceRequestTypes AS RT
						ON AR.RequestTypeId = RT.RequestTypeId
					INNER JOIN dbo.AbsenceRequestStatuses AS RS
						ON AR.StatusId = RS.StatusId
					LEFT JOIN dbo.AbsenceRequestReasons AS RR
						ON AR.ReasonId = RR.ReasonId
				`;
				const ABSENCE_STATUS = {
					PENDING: 1,
					PRE_APPROVED: 2,
					APPROVED: 3,
					REJECTED: 4,
					CANCELLED: 5,
				};

				const toSqlDate = (value) => {
					if (!value) return null;

					const date = new Date(value);

					if (Number.isNaN(date.getTime())) {
						throw new Error(`Invalid date value: ${value}`);
					}

					return date.toISOString().split("T")[0];
				};

				const normalizeId = (value) => {
					if (value === undefined || value === null) return null;

					const trimmed = value.toString().trim();

					return trimmed === "" ? null : trimmed;
				};

				const addSqlParam = (params, value) => {
					params.push(value);
					return `@param${params.length}`;
				};

				const getRegionIdByCode = async ({ dbs, region }) => {
					const regionData = await executeParameterizedQuery(
						`
		SELECT TOP 1
			region_id AS RegionId
		FROM dbo.Regions
		WHERE region_code = @param1
		`,
						[region],
						"Error fetching region information",
						dbs.tecmamovil,
					);

					if (!regionData || regionData.length === 0) {
						return null;
					}

					return regionData[0].RegionId;
				};
				try {
					if (!user) throw new Error("Unauthorized");

					const { empId, region } = user;

					if (!empId) {
						return [];
					}

					if (!region) {
						return [];
					}

					const dbs = await selectRegion(region);

					const regionId = await getRegionIdByCode({
						dbs,
						region: region.toString().trim().toUpperCase(),
					});

					if (!regionId) {
						console.warn("Region not found for user:", region);
						return [];
					}

					const { statusId, dateFrom, dateTo } = input || {};

					const params = [];
					const where = [];

					where.push(
						`AR.EmployeeId = ${addSqlParam(params, normalizeId(empId))}`,
					);
					where.push(`AR.RegionId = ${addSqlParam(params, regionId)}`);

					if (statusId != null) {
						where.push(`AR.StatusId = ${addSqlParam(params, statusId)}`);
					}

					if (dateFrom) {
						where.push(
							`AR.EndDate >= ${addSqlParam(params, toSqlDate(dateFrom))}`,
						);
					}

					if (dateTo) {
						where.push(
							`AR.StartDate <= ${addSqlParam(params, toSqlDate(dateTo))}`,
						);
					}

					const query = `
			${ABSENCE_REQUEST_SELECT}
			WHERE ${where.join("\nAND ")}
			ORDER BY AR.RequestedAt DESC, AR.AbsenceRequestId DESC
		`;

					const requests = await executeParameterizedQuery(
						query,
						params,
						"Error fetching employee absence requests",
						dbs.tecmamovil,
					);

					return requests;
				} catch (error) {
					console.error("Error fetching employee absence requests:", error);
					return [];
				}
			},
		),
		getSupervisorAbsenceRequests: requireAuth(
			async (_, { input = {} }, { user }) => {
				console.log("getSupervisorAbsenceRequests called with input:", input);
				const ABSENCE_REQUEST_SELECT = `
					SELECT
						AR.AbsenceRequestId AS id,

						AR.EmployeeId AS employeeId,
						AR.EmployeeName AS employeeName,

						AR.RegionId AS regionId,
						RG.region_code AS regionCode,
						RG.region_name AS regionName,

						AR.RequestTypeId AS requestTypeId,
						RT.Description AS requestType,

						AR.StatusId AS statusId,
						RS.Description AS status,

						AR.ReasonId AS reasonId,
						RR.Description AS reason,

						AR.StartDate AS startDate,
						AR.EndDate AS endDate,
						AR.RequestedAt AS requestedAt,

						AR.TotalDays AS totalDays,

						AR.EmployeeComment AS employeeComment,

						AR.CancelledAt AS cancelledAt,
						AR.CancellationComment AS cancellationComment,

						AR.SupervisorPayrollId AS supervisorPayrollId,
						AR.SupervisorAppId AS supervisorAppId,

						AR.PreApprovedBySupervisorAppId AS preApprovedBySupervisorAppId,
						AR.PreApprovedAt AS preApprovedAt,

						AR.ApprovedByHRId AS approvedByHRId,
						AR.ApprovedAt AS approvedAt,

						AR.RejectedBySupervisorAppId AS rejectedBySupervisorAppId,
						AR.RejectedByHRId AS rejectedByHRId,
						AR.RejectedAt AS rejectedAt,

						AR.ModifiedByHRId AS modifiedByHRId,
						AR.ModifiedAt AS modifiedAt,

						AR.SupervisorComment AS supervisorComment,
						AR.HRComment AS hrComment,

						AR.PlantId AS plantId,
						AR.ProjectId AS projectId,
						AR.AreaId AS areaId,
						AR.TurnId AS turnId,
						AR.JobTitleId AS jobTitleId,
						AR.ClassificationId AS classificationId
					FROM dbo.AbsenceRequests AS AR
					INNER JOIN dbo.Regions AS RG
						ON AR.RegionId = RG.region_id
					INNER JOIN dbo.AbsenceRequestTypes AS RT
						ON AR.RequestTypeId = RT.RequestTypeId
					INNER JOIN dbo.AbsenceRequestStatuses AS RS
						ON AR.StatusId = RS.StatusId
					LEFT JOIN dbo.AbsenceRequestReasons AS RR
						ON AR.ReasonId = RR.ReasonId
				`;

				const ABSENCE_STATUS = {
					PENDING: 1,
					PRE_APPROVED: 2,
					APPROVED: 3,
					REJECTED: 4,
					CANCELLED: 5,
				};

				const toSqlDate = (value) => {
					if (!value) return null;

					const date = new Date(value);

					if (Number.isNaN(date.getTime())) {
						throw new Error(`Invalid date value: ${value}`);
					}

					return date.toISOString().split("T")[0];
				};

				const normalizeId = (value) => {
					if (value === undefined || value === null) return null;

					const trimmed = value.toString().trim();

					return trimmed === "" ? null : trimmed;
				};

				const addSqlParam = (params, value) => {
					params.push(value);
					return `@param${params.length}`;
				};

				const getRegionIdByCode = async ({ dbs, region }) => {
					const regionData = await executeParameterizedQuery(
						`
		SELECT TOP 1
			region_id AS RegionId
		FROM dbo.Regions
		WHERE region_code = @param1
		`,
						[region],
						"Error fetching region information",
						dbs.tecmamovil,
					);

					if (!regionData || regionData.length === 0) {
						return null;
					}

					return regionData[0].RegionId;
				};
				try {
					if (!user) throw new Error("Unauthorized");

					const { empId, region } = user;

					if (!empId) {
						return [];
					}

					if (!region) {
						return [];
					}

					const dbs = await selectRegion(region);

					const regionId = await getRegionIdByCode({
						dbs,
						region: region.toString().trim().toUpperCase(),
					});

					if (!regionId) {
						console.warn("Region not found for supervisor:", region);
						return [];
					}

					const { statusId, dateFrom, dateTo } = input || {};

					const params = [];
					const where = [];

					where.push(
						`AR.SupervisorAppId = ${addSqlParam(params, normalizeId(empId))}`,
					);
					where.push(`AR.RegionId = ${addSqlParam(params, regionId)}`);

					// Default supervisor view: only pending requests.
					where.push(
						`AR.StatusId = ${addSqlParam(
							params,
							statusId ?? ABSENCE_STATUS.PENDING,
						)}`,
					);

					if (dateFrom) {
						where.push(
							`AR.EndDate >= ${addSqlParam(params, toSqlDate(dateFrom))}`,
						);
					}

					if (dateTo) {
						where.push(
							`AR.StartDate <= ${addSqlParam(params, toSqlDate(dateTo))}`,
						);
					}

					const query = `
			${ABSENCE_REQUEST_SELECT}
			WHERE ${where.join("\nAND ")}
			ORDER BY AR.RequestedAt ASC, AR.AbsenceRequestId ASC
		`;

					const requests = await executeParameterizedQuery(
						query,
						params,
						"Error fetching supervisor absence requests",
						dbs.tecmamovil,
					);

					return requests;
				} catch (error) {
					console.error("Error fetching supervisor absence requests:", error);
					return [];
				}
			},
		),
		CheckInZoneStatus: requireAuth(async (_, { input }, { user }) => {
			console.log("CheckInZoneStatus called with input:", input);
			const CHECK_IN_MARGIN_METERS = 18;
			const MAX_LOCATION_ACCURACY_METERS = 75;

			const GEO_BYPASS_EMP_IDS = new Set([
				"900874",
				"900683",
				"900209",
				"900951",
			]);

			function expandBoxByMeters(box, marginMeters) {
				const centerLatitude = (box.minLatitude + box.maxLatitude) / 2;

				const latDelta = marginMeters / 111320;
				const lonDelta =
					marginMeters / (111320 * Math.cos((centerLatitude * Math.PI) / 180));

				return {
					...box,
					minLatitude: box.minLatitude - latDelta,
					maxLatitude: box.maxLatitude + latDelta,
					minLongitude: box.minLongitude - lonDelta,
					maxLongitude: box.maxLongitude + lonDelta,
				};
			}

			const CHECK_IN_AREAS = [
				{
					name: "Pasillo Aduanas",
					cornerA: {
						latitude: 31.6216944444,
						longitude: -106.4482222222,
					},
					cornerB: {
						latitude: 31.6217222222,
						longitude: -106.4482222222,
					},
				},
				{
					name: "Pasillo Recepcion",
					cornerA: {
						latitude: 31.6216944444,
						longitude: -106.4482222222,
					},
					cornerB: {
						latitude: 31.6216944444,
						longitude: -106.4481666667,
					},
				},
				{
					name: "Pasillo Cafeteria",
					cornerA: {
						latitude: 31.621418,
						longitude: -106.448181,
					},
					cornerB: {
						latitude: 31.621449,
						longitude: -106.448125,
					},
				},
			]
				.map((area) => ({
					name: area.name,
					minLatitude: Math.min(area.cornerA.latitude, area.cornerB.latitude),
					maxLatitude: Math.max(area.cornerA.latitude, area.cornerB.latitude),
					minLongitude: Math.min(area.cornerA.longitude, area.cornerB.longitude),
					maxLongitude: Math.max(area.cornerA.longitude, area.cornerB.longitude),
				}))
				.map((area) => expandBoxByMeters(area, CHECK_IN_MARGIN_METERS));

			function isValidNumber(value) {
				return typeof value === "number" && Number.isFinite(value);
			}

			function isInsideBoxRange({ latitude, longitude, box }) {
				return (
					latitude >= box.minLatitude &&
					latitude <= box.maxLatitude &&
					longitude >= box.minLongitude &&
					longitude <= box.maxLongitude
				);
			}

			function findMatchingCheckInArea({ latitude, longitude, areas }) {
				return areas.find((area) =>
					isInsideBoxRange({
						latitude,
						longitude,
						box: area,
					}),
				);
			}

			function normalizeCheckInLocationInput(input) {
				return {
					latitude: Number(input.latitude),
					longitude: Number(input.longitude),
					accuracy:
						input.accuracy === null || input.accuracy === undefined
							? null
							: Number(input.accuracy),
				};
			}

			function validateCheckInLocationInput(input) {
				if (!isValidNumber(input.latitude) || !isValidNumber(input.longitude)) {
					return {
						isValid: false,
						status: "INVALID_COORDINATES",
						message: "Coordenadas inválidas.",
					};
				}

				if (
					input.latitude < -90 ||
					input.latitude > 90 ||
					input.longitude < -180 ||
					input.longitude > 180
				) {
					return {
						isValid: false,
						status: "INVALID_COORDINATES",
						message: "Las coordenadas están fuera del rango válido.",
					};
				}

				if (
					input.accuracy !== null &&
					(!Number.isFinite(input.accuracy) || input.accuracy < 0)
				) {
					return {
						isValid: false,
						status: "INVALID_ACCURACY",
						message: "Precisión de ubicación inválida.",
					};
				}

				if (
					input.accuracy !== null &&
					input.accuracy > MAX_LOCATION_ACCURACY_METERS
				) {
					return {
						isValid: false,
						status: "LOW_ACCURACY",
						message:
							"La precisión de la ubicación es muy baja. Intenta nuevamente en un área más abierta.",
					};
				}

				return {
					isValid: true,
					status: "VALID",
					message: "Ubicación válida.",
				};
			}

			function evaluateCheckInZone({ empId, input }) {
				const normalizedInput = normalizeCheckInLocationInput(input);
				const validation = validateCheckInLocationInput(normalizedInput);

				if (!validation.isValid) {
					return {
						canCheckIn: false,
						isInsideAllowedZone: false,
						isBypass: false,
						status: validation.status,
						message: validation.message,
						geofenceName: null,
						latitude: isValidNumber(normalizedInput.latitude)
							? normalizedInput.latitude
							: null,
						longitude: isValidNumber(normalizedInput.longitude)
							? normalizedInput.longitude
							: null,
						accuracy:
							normalizedInput.accuracy !== null &&
								Number.isFinite(normalizedInput.accuracy)
								? normalizedInput.accuracy
								: null,
						maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
					};
				}

				const shouldBypassGeofence = GEO_BYPASS_EMP_IDS.has(String(empId).trim());

				if (shouldBypassGeofence) {
					return {
						canCheckIn: true,
						isInsideAllowedZone: true,
						isBypass: true,
						status: "BYPASS_ALLOWED",
						message: "Ubicación autorizada.",
						geofenceName: "BYPASS",
						latitude: normalizedInput.latitude,
						longitude: normalizedInput.longitude,
						accuracy: normalizedInput.accuracy,
						maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
					};
				}

				const matchedCheckInArea = findMatchingCheckInArea({
					latitude: normalizedInput.latitude,
					longitude: normalizedInput.longitude,
					areas: CHECK_IN_AREAS,
				});

				if (!matchedCheckInArea) {
					return {
						canCheckIn: false,
						isInsideAllowedZone: false,
						isBypass: false,
						status: "OUTSIDE_GEOFENCE",
						message: "No estás dentro de una zona permitida para hacer check-in.",
						geofenceName: null,
						latitude: normalizedInput.latitude,
						longitude: normalizedInput.longitude,
						accuracy: normalizedInput.accuracy,
						maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
					};
				}

				return {
					canCheckIn: true,
					isInsideAllowedZone: true,
					isBypass: false,
					status: "INSIDE_GEOFENCE",
					message: `Ubicación permitida: ${matchedCheckInArea.name}.`,
					geofenceName: matchedCheckInArea.name,
					latitude: normalizedInput.latitude,
					longitude: normalizedInput.longitude,
					accuracy: normalizedInput.accuracy,
					maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
				};
			}

			async function getPendingPollStatus({ empId, dbs }) {
				const result = await executeParameterizedQuery(
					`
					SELECT COUNT(1) AS pending_count
					FROM POLL
					WHERE LTRIM(RTRIM(CAST(PO_NUMERO AS VARCHAR(30)))) = @param1
					`,
					[String(empId).trim()],
					"Error checking pending POLL records",
					dbs.comparte,
				);

				const pendingPollCount = Number(result?.[0]?.pending_count || 0);

				return {
					hasPendingPoll: pendingPollCount > 0,
					pendingPollCount,
				};
			}
			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				if (!empId) {
					return {
						success: false,
						message: "No se pudo identificar al empleado desde el token.",
						data: null,
					};
				}

				if (!region) {
					return {
						success: false,
						message: "No se pudo identificar la región desde el token.",
						data: null,
					};
				}

				const timezone = getBusinessTimezoneByRegion(region);
				const now = DateTime.now().setZone(timezone);

				const dbs = await selectRegion(region);

				const pendingPoll = await getPendingPollStatus({ empId, dbs });

				if (pendingPoll.hasPendingPoll) {
					const normalizedInput = normalizeCheckInLocationInput(input);

					return {
						success: true,
						message: "Tu última checada aún se está procesando.",
						data: {
							canCheckIn: false,
							isInsideAllowedZone: false,
							isBypass: false,
							hasPendingPoll: true,
							pendingPollCount: pendingPoll.pendingPollCount,
							status: "PENDING_POLL",
							message:
								"Tu última checada aún se está procesando. Espera aproximadamente 1 minuto y actualiza tus checadas.",
							geofenceName: null,
							latitude: Number.isFinite(normalizedInput.latitude)
								? normalizedInput.latitude
								: null,
							longitude: Number.isFinite(normalizedInput.longitude)
								? normalizedInput.longitude
								: null,
							accuracy:
								normalizedInput.accuracy !== null &&
									Number.isFinite(normalizedInput.accuracy)
									? normalizedInput.accuracy
									: null,
							maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
							checkedAt: now.toISO(),
						},
					};
				}

				const zoneStatus = evaluateCheckInZone({
					empId,
					input,
				});

				return {
					success: true,
					message: zoneStatus.message,
					data: {
						...zoneStatus,
						hasPendingPoll: false,
						pendingPollCount: 0,
						checkedAt: now.toISO(),
					},
				};
			} catch (err) {
				console.error("CheckInZoneStatus error:", err);

				return {
					success: false,
					message: "Error al validar la zona de check-in.",
					data: null,
				};
			}
		}),
		CheckInPendingPollStatus: requireAuth(async (_, __, { user }) => {
			async function getPendingPollStatus({ empId, dbs }) {
				const result = await executeParameterizedQuery(
					`
					SELECT COUNT(1) AS pending_count
					FROM POLL
					WHERE LTRIM(RTRIM(CAST(PO_NUMERO AS VARCHAR(30)))) = @param1
					`,
					[String(empId).trim()],
					"Error checking pending POLL records",
					dbs.comparte,
				);

				const pendingPollCount = Number(result?.[0]?.pending_count || 0);

				return {
					hasPendingPoll: pendingPollCount > 0,
					pendingPollCount,
				};
			}

			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				if (!empId) {
					return {
						success: false,
						message: "No se pudo identificar al empleado desde el token.",
						data: null,
					};
				}

				if (!region) {
					return {
						success: false,
						message: "No se pudo identificar la región desde el token.",
						data: null,
					};
				}

				console.log("CheckInPendingPollStatus for empId:", empId, "region:", region);

				const dbs = await selectRegion(region);
				const timezone = getBusinessTimezoneByRegion(region);
				const now = DateTime.now().setZone(timezone);

				const pendingPoll = await getPendingPollStatus({ empId, dbs });

				return {
					success: true,
					message: pendingPoll.hasPendingPoll
						? "Tu última checada aún se está procesando."
						: "Ya puedes registrar una nueva checada.",
					data: {
						hasPendingPoll: pendingPoll.hasPendingPoll,
						pendingPollCount: pendingPoll.pendingPollCount,
						status: pendingPoll.hasPendingPoll ? "PENDING_POLL" : "READY",
						message: pendingPoll.hasPendingPoll
							? "Tu última checada aún se está procesando. Espera aproximadamente 1 minuto."
							: "Ya puedes registrar una nueva checada.",
						checkedAt: now.toISO(),
					},
				};
			} catch (err) {
				console.error("CheckInPendingPollStatus error:", err);

				return {
					success: false,
					message: "Error al validar si hay checadas pendientes.",
					data: null,
				};
			}
		}),
	},
	Mutation: {
		login: async (_, { numEmp, nip, region }) => {
			if (+numEmp > 2147483647 || +numEmp < 0) {
				return {
					success: false,
					message: "Número de empleado inválido.",
				};
			}
			const dbs = await selectRegion(region);
			console.log("Selected DBs for region:", region, dbs);

			let code = {};
			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX": {
					code.supervisor = "3";
					code.area = "5";
					code.proyecto = "0";
					code.planta = "7";
					break;
				}
				case "SAL":
				case "TIJ": {
					code.supervisor = "8";
					code.proyecto = "5";
					code.area = "6";
					code.planta = "1";
					break;
				}
			}

			const inactiveEmployees = new Set([
				"26931",
				"35485",
				"26837",
				"31689",
				"41900",
				"26831",
				"27200",
				"33457",
				"33544",
				"33841",
				"34019",
				"41922",
				"14884",
				"35620",
				"40361",
				"40394",
				"23815",
				"28916",
				"42104",
				"41045",
				"42099",

				"2580",
				"32254",
				"33712",
				"38942",
				"39986",
				"40665",
				"41142",
				"41159",
				"41509",
				"41733",
				"41746",
				"41799",
				"42337",
				"42351",
				"42452",
				"42436",
				"42680",
				"42697",
				"43379",
				"43695",
				"43744",
				"43881",

				"42737",
				"42115",
				"43660",
				"43669",

				"16108",
				"43549",
				"43748",
				"43868",
				"43930",

				"27529",
				"43775",

				"30903",
				"32739",
				"34993",
				"35181",
				"37186",
				"37839",
				"38380",

				"22102",
				"36260",

				"42359",
				"42710",
				"42616",
				"4302",
				"42360",
				"42398",
				"43882",
				"43743",
				"40447",
				"38724",
				"9320",
				"43662",
				"41682",
				"42202",
				"41554",
				"42682",
				"38909",
				"35517",
				"40651",
				"37818",
				"43378",
				"43870",
				"37406",
				"41687",
				"43083",
				"43604",
				"40352",
				"42852",
				"43745",
				"41794",
				"42364",
				"42803",
				"43791",
				"42358",
				"2145"
			]);

			const normalizedNumEmp = String(numEmp).trim();
			const normalizedRegion = String(region || "")
				.trim()
				.toUpperCase();

			if (
				// inactiveRegions.has(normalizedRegion) &&
				inactiveEmployees.has(normalizedNumEmp) &&
				(region === "TIJ" || region === "SAL")
			) {
				console.log("Inactive employee login attempt:", {
					numEmp: normalizedNumEmp,
					region: normalizedRegion
				});
				return {
					success: false,
					message:
						"Tu usuario se encuentra inactivo, contacta con tu departamento de Recursos Humanos.",
				};
			}

			const isActiveQuery = `SELECT CB_ACTIVO As active, CB_NIVEL${code.proyecto} As project, CB_NIVEL${code.planta} as plant  FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`;

			const isActive = await executeQuery(
				isActiveQuery,
				"Error fetching user status",
				dbs.colabora,
			);

			console.log("isActive query result: ", JSON.stringify(isActive, null, 1));
			// if (isActive[0].plant.trim() === "T-TSC" || isActive[0].plant.trim() === "2-TSC") {
			// 	return {
			// 		success: false,
			// 		message:
			// 			"Tu usuario se encuentra inactivo, contacta con tu departamento de Recursos Humanos.",
			// 	};
			// }

			if (isActive.length === 0 || isActive[0].active === "N") {
				return {
					success: false,
					message:
						"Tu usuario se encuentra inactivo, contacta con tu departamento de Recursos Humanos.",
				};
			}

			// if (isActive[0].project.trim() === "H75") {
			// 	return {
			// 		success: false,
			// 		message:
			// 			"Por el momento el sistema se encuentra en mantenimiento, por favor intenta más tarde.",
			// 	};
			// }

			const queryNip = await executeQuery(
				`SELECT CB_CODIGO, NIP, ENCRIPTADA FROM Empleados WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.kioskotek,
			);

			const userData = queryNip[0];

			console.log("User data is: ", JSON.stringify(userData, null, 1));
			if (!userData) {
				return {
					success: false,
					message: "Hubo un problema al solicitar acceso, intenta de nuevo.",
				};
			}
			if (!userData.CB_CODIGO || userData.CB_CODIGO === "") {
				return {
					success: false,
					message:
						"No tienes registradas credenciales en la plataforma. Si crees que esto es un error, contacta con tu departamento de RH.",
				};
			}

			let isAuthorized = false;

			if (userData.ENCRIPTADA) {
				// console.log("Encriptada is true");
				const decryptedPassword = decryptOld(userData.NIP, oldKey);

				if (nip === decryptedPassword) {
					// console.log("Encrypted nip matches ");
					isAuthorized = true;
				}
			} else {
				console.log("Encriptada is FALSE");
				if (nip === userData.NIP) {
					console.log("Unencrypted nip matches");
					isAuthorized = true;
					const encryptedPasswordOld = encryptOld(nip, oldKey);
					console.log(
						`Updating password for ${numEmp} to: ${encryptedPasswordOld}`,
					);

					await executeQuery(
						`Update Empleados
						Set NIP = '${encryptedPasswordOld}',
					ENCRIPTADA = 1
				Where
				CB_CODIGO = '${numEmp}'`,
						"Error updating NIP",
						dbs.kioskotek,
					);
				}
			}

			if (!isAuthorized) {
				return {
					success: false,
					message: "El usuario no existe o las credenciales son inválidas.",
				};
			}

			// const name = queryName[0];
			const queryName = await executeQuery(
				`SELECT CB_NOMBRES FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.colabora,
			);

			await executeQuery(
				`INSERT INTO K_log(No, Fecha, Planta, Proyecto, Tipo)
				Values('${numEmp}', GETDATE(), '${queryName[0].plant}', '${queryName[0].project}', 'Login')
				`,
				"Error logging user access",
				dbs.kioskotek,
			);

			await executeQuery(
				`UPDATE Empleados
				SET FEC_LOGIN = GETDATE()
				WHERE CB_CODIGO = '${numEmp}'
					`,
				"Error logging user access",
				dbs.kioskotek,
			);

			const token = jwt.sign(
				{
					empId: userData.CB_CODIGO.toString(),
					region: region,
				},
				process.env.JWT_KEY,
				{
					expiresIn: "2h",
				},
			);

			console.log("User: ", numEmp, " logged in to region: ", region);
			return {
				success: true,
				message: "Login successful",
				data: { token, name: queryName[0].CB_NOMBRES },
			};
		},
		mockLogin: async (_, { numEmpList, region }) => {
			const dbs = await selectRegion(region);

			const code = {};
			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX":
					code.supervisor = "3";
					code.area = "5";
					code.proyecto = "0";
					code.planta = "7";
					break;
				case "SAL":
				case "TIJ":
					code.supervisor = "8";
					code.proyecto = "5";
					code.area = "6";
					code.planta = "1";
					break;
			}

			const results = [];

			for (const rawId of numEmpList) {
				const id = rawId.toString().trim();

				// Case: invalid number
				if (+id > 2147483647 || +id < 0 || isNaN(+id)) {
					results.push({
						id,
						status: "Número de empleado inválido.",
						nip: null,
						encrypted: false,
					});
					continue;
				}

				// Case: hardcoded inactive users for TIJ/SAL
				const hardcodedInactive = ["14884", "35620", "40361", "40394", "23815"];
				if (hardcodedInactive.includes(id) && ["TIJ", "SAL"].includes(region)) {
					results.push({
						id,
						status: "Usuario inactivo. Contacte a Recursos Humanos.",
						nip: null,
						encrypted: false,
					});
					continue;
				}

				// Case: inactivo en tabla COLABORA
				const activeQuery = `SELECT CB_ACTIVO AS active FROM COLABORA WHERE CB_CODIGO = '${id}'`;
				const activeResult = await executeQuery(
					activeQuery,
					"Error checking user status",
					dbs.colabora,
				);

				if (!activeResult.length) {
					results.push({
						id,
						status: "Usuario no encontrado en COLABORA.",
						nip: null,
						encrypted: false,
					});
					continue;
				}

				if (activeResult[0].active === "N") {
					results.push({
						id,
						status:
							"Usuario inactivo en COLABORA. Contacte a Recursos Humanos.",
						nip: null,
						encrypted: false,
					});
					continue;
				}

				// Case: try to get NIP from Empleados
				const queryNip = await executeQuery(
					`SELECT NIP, ENCRIPTADA FROM Empleados WHERE CB_CODIGO = '${id}'`,
					"Error fetching NIP",
					dbs.kioskotek,
				);

				const userData = queryNip[0];

				if (!userData) {
					results.push({
						id,
						status: "Usuario no encontrado en Empleados (Kioskotek).",
						nip: null,
						encrypted: false,
					});
					continue;
				}

				if (!userData.NIP || userData.NIP === "") {
					results.push({
						id,
						status: "Usuario sin NIP asignado.",
						nip: null,
						encrypted: false,
					});
					continue;
				}

				let nip = null;
				let encrypted = false;

				if (userData.ENCRIPTADA) {
					try {
						nip = decryptOld(userData.NIP, oldKey);
						encrypted = true;
					} catch {
						results.push({
							id,
							status: `Error al desencriptar el NIP.Encriptada: ${userData.ENCRIPTADA} `,
							nip: userData.NIP,
							encrypted: true,
						});
						continue;
					}
				} else {
					nip = userData.NIP;
				}

				// Success
				results.push({
					id,
					status: "Logged in correctly",
					nip,
					encrypted,
				});
			}

			return results;
		},
		resetNIP: async (_, { numEmp, rfc, newNIP, region }) => {
			if (+numEmp > 2147483647 || +numEmp < 0) {
				return "Not found";
			}
			const dbs = await selectRegion(region);

			const employeeData = await executeQuery(
				`Select
					FEC_LOGIN As login_date
				From
				Empleados
				Where
				CB_CODIGO = ${numEmp} `,
				"Error retrieving employee login date",
				dbs.kioskotek,
			);

			const employeeRFC = await executeQuery(
				`Select
					CB_RFC As rfc
				From
				COLABORA
				Where
				CB_CODIGO = ${numEmp} `,
				"Error retrieving employee login date",
				dbs.colabora,
			);
			console.log("Employee data: ", employeeData);

			if (!employeeRFC[0].rfc) {
				return "Not found";
			}

			const launchDate = new Date(2027, 12, 30);
			const lastLoginDate = new Date(employeeData[0].login_date);
			console.log(
				`Launch date is: ${launchDate} and last login date was: ${lastLoginDate} `,
			);

			if (lastLoginDate > launchDate) {
				console.log("Last login is after launch date, using new enc");
				if (rfc !== employeeRFC[0].rfc) {
					console.log("RFC is invalid");
					return "Invalid RFC";
				} else {
					const isValid = /^\d{6}$/.test(newNIP);
					if (!isValid) {
						return "Invalid NIP";
					}
					// console.log("isValid: ", isValid);
					const encryptedPasswordNew = encrypt(newNIP, newKey);
					// console.log("Encrypted password: ", encryptedPasswordNew);

					await executeQuery(
						`Update Empleados
						Set NIP = '${encryptedPasswordNew}'
				Where
				CB_CODIGO = ${numEmp}
						And RFC = '${rfc}'`,
						"Error updating measurement",
						dbs.kioskotek,
					);
					return "Success";
				}
			} else {
				console.log("Last login is before launch date, using old enc");
				if (rfc !== employeeRFC[0].rfc) {
					console.log("RFC is invalid");
					return "Invalid RFC";
				} else {
					const isValid = /^\d{6}$/.test(newNIP);
					if (!isValid) {
						return "Invalid NIP";
					}
					console.log("New nip is: ", newNIP);
					const encryptedPasswordOld = encryptOld(newNIP, oldKey);
					console.log("Encrypted password: ", encryptedPasswordOld);
					console.log(
						"Unencrypted new password: ",
						decryptOld(encryptedPasswordOld, oldKey),
					);

					const employeeNIPReset = await executeQuery(
						`UPDATE Empleados
						SET NIP = '${encryptedPasswordOld}',
					ENCRIPTADA = 1
						WHERE CB_CODIGO = '${numEmp}'`,
						"Error resetting employee nip",
						dbs.kioskotek,
					);

					console.log("Employee NIP reset: ", employeeNIPReset);

					// await executeQuery(
					// 	`Update Empleados
					// 	Set NIP = '${encryptedPasswordOld}'
					// 	Where
					// 		CB_CODIGO = '${numEmp}'
					// 		And RFC = '${rfc}'`,
					// 	"Error updating measurement",
					// 	dbs.kioskotek
					// );
					return "Success";
				}
			}
		},
		addFamilyMember: async (_, { numEmp, region, name, kin, sex, birth }) => {
			const dbs = await selectRegion(region);
			await executeQuery(
				`DECLARE @currentDate DATETIME = GETDATE();
				Insert Into
					K_Parientes (
						No,
						Nombre,
						Parentesco,
						Sexo,
						FecNacimiento,
						FecActualiza
					)
				Values
					(
						${numEmp},
						'${name}', 
						${kin}, 
						'${sex}', 
						'${birth}', 
						@currentDate
					)`,
				"Error adding family member",
				dbs.kioskotek,
			);

			return true;
		},
		removeFamilyMember: async (_, { numEmp, region, name, date }) => {
			const dbs = await selectRegion(region);
			await executeQuery(
				`Update K_Parientes
				Set Borrado = 1
				Where
					No = ${numEmp}
					And Nombre = '${name}'
					And FecActualiza = '${date}'`,
				"Error removing family member",
				dbs.kioskotek,
			);

			return true;
		},
		updateMeasurements: async (_, { numEmp, region, type, size }) => {
			const dbs = await selectRegion(region);
			const existing = await executeQuery(
				`Declare @Exists NVARCHAR(5);
				Set
					@Exists = (
						Select
							Case
								When Exists (
									Select
										1
									From
										K_Tallas
									Where
										No = ${numEmp}
										And Tipo = '${type}'
								) Then 'true'
								Else 'false'
							End
					)
				Select
					@Exists as [exists]`,
				"Error evaluating entry",
				dbs.kioskotek,
			);

			if (existing[0].exists === "true") {
				await executeQuery(
					`Declare @currentDate DATETIME = GETDATE();
					Update K_Tallas
					Set Talla = '${size}',
						FecActualiza = @currentDate
					Where
						No = ${numEmp}
						And Tipo = '${type}'
						And FecActualiza = (
							Select MAX(FecActualiza)
							From K_Tallas
							Where No = ${numEmp} 
							And Tipo = '${type}'
						);`,
					"Error updating measurement",
					dbs.kioskotek,
				);
			} else {
				await executeQuery(
					`Declare @currentDate DATETIME = GETDATE();
					Insert Into
						K_Tallas (No, Tipo, Talla, FecActualiza)
					Values
						('${numEmp}', 
						'${type}', 
						'${size}', 
						@currentDate)`,
					"Error adding measurement",
					dbs.kioskotek,
				);
			}

			return true;
		},
		sendRequisition: async (
			_,
			{
				numEmp,
				region,
				name,
				letter,
				plant_id,
				shift,
				project,
				position,
				clasification,
				motive = null,
				coment = null,
				fileName = null,
				file = null,
				day_to_adjust = null,
				period = null,
				start_date = null,
				end_date = null,
				days = null,
				requested_loan = null,
				loan_weeks = null,
			},
		) => {
			// console.log(`Day to adjust: ${day_to_adjust}, period: ${period}`);
			// return
			try {
				if (letter === "PtmoFA") return { pdfFile: "Error" };
				const data = {
					numEmp,
					name,
					letter,
					plant_id,
					shift,
					project,
					position,
					clasification,
					motive,
					coment,
					day_to_adjust,
					period,
					start_date,
					end_date,
					days,
					requested_loan,
					loan_weeks,
				};
				const dbs = await selectRegion(region);
				console.log("Data values: ", JSON.stringify(data, null, 1));
				if (letter === "PtmoFA") {
					console.log("Letter is PtmoFA");
					return { pdfFile: "Wait" };
				}

				if (letter !== "NIP" && letter !== "AltaIMSS") {
					let letterQuery;
					switch (letter) {
						case "CartaPrestamo":
							console.log("Caso prestamo");
							letterQuery = "Prestamo";
							break;
						case "CartaGuarderia":
						case "CartaTrabajo":
						case "CartaVisa":
						case "CartaPermiso":
							letterQuery = letter.substring(5);
							break;
						case "PermisoDias":
							letterQuery = "Permiso";
							break;
						case "AjustePrenom":
							letterQuery = "Ajuste";
							break;
						default:
							letterQuery = letter;
							break;
					}

					const existing = await executeQuery(
						`SELECT
						CASE
							WHEN EXISTS (
								SELECT 1
								FROM K_Solicitudes
								WHERE No = '${numEmp}'
									AND Carta = '${letterQuery}'
									AND Pendiente = 1
									AND Fecha >= DATEFROMPARTS(YEAR(GETDATE()), 1, 1)
									AND Fecha < DATEFROMPARTS(YEAR(GETDATE()) + 1, 1, 1)
							)
							THEN CAST(1 AS BIT)
							ELSE CAST(0 AS BIT)
						END AS existing_requisition;`,
						"Error retrieving employee information",
						dbs.kioskotek,
					);
					if (existing[0].existing_requisition) {
						return { pdfFile: "Existing requisition" };
					}
				}
				// console.log("Existing: ", existing);
				// }

				// console.log(data);
				data.coment = coment;
				const defaultHRID = "001";
				const defaultCSCMail = "ruben.duron@tecma.com";
				// const defaultHRMail = "ruben.duron@tecma.com";
				const defaultHRMail = "gisela.barrios@tecma.com";
				let pending = "1";
				let fileBuffer = null;
				// let fileBuffer = Buffer.alloc(0);
				let letterType;
				let newFileName;
				let mail;
				let hr_id;

				// let response = "Done";
				// if (fileName === null) {
				// 	newFileName = "SinArchivo";
				// }

				const getFormattedDateTime = () => {
					const currentDate = new Date();

					const padZero = (num, size = 2) => String(num).padStart(size, "0");

					const year = currentDate.getFullYear();
					const month = padZero(currentDate.getMonth() + 1); // Months are zero-indexed
					const day = padZero(currentDate.getDate());

					const hours24 = currentDate.getHours();
					const minutes = padZero(currentDate.getMinutes());
					const seconds = padZero(currentDate.getSeconds());
					const milliseconds = padZero(currentDate.getMilliseconds(), 3); // Milliseconds need 3 digits

					// Generate original format (YYYY-MM-DD HH:MM:SS.mmm)
					const formattedDateTime = `${year}-${month}-${day} ${padZero(
						hours24,
					)}:${minutes}:${seconds}.${milliseconds}`;

					// Convert hours to 12-hour format and create custom format (YYYYMMDDhhmm)
					let hours12 = hours24 % 12 || 12; // Convert 24-hour to 12-hour format
					const formattedCustom = `${year}${month}${day}${padZero(
						hours12,
					)}${minutes}`;

					// Return both formats
					return { formattedDateTime, formattedCustom };
				};

				const getFormattedSalario = (amount) => {
					const numalet = Numalet();
					const amountInWords = numalet(amount);
					const centavos = Math.round((amount % 1) * 100);
					const formattedAmountInWords = `${amountInWords.toUpperCase()} CON ${centavos}/100 PESOS M.N.`;

					return formattedAmountInWords;
				};

				function getFormattedFolioFromDate() {
					const date = new Date();
					const year = date.getFullYear();
					const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
					const day = String(date.getDate()).padStart(2, "0");
					const hours = String(date.getHours()).padStart(2, "0");
					const minutes = String(date.getMinutes()).padStart(2, "0");
					const seconds = String(date.getSeconds()).padStart(2, "0");

					return `${year}${month}${day}${hours}${minutes}${seconds}`;
				}

				const { formattedDateTime, formattedCustom } = getFormattedDateTime();

				const directory = await executeQuery(
					`Select
					CSC_RH.Nombre As nombre_rh,
					CSC_RH.email As hr_advisor_email,
					CSC_Asesor.email As csc_advisor_email,
					DIR.RH As hr_id_number
				from
					CSC_Directorio As DIR
					Inner Join CSC_RH on CSC_RH.Codigo = DIR.RH
					Inner Join CSC_Asesor on CSC_Asesor.Codigo = DIR.Asesor
				Where
					Planta = '${plant_id}'
					and Proyecto = '${region === "TIJ" || region === "SAL" ? project[0] : project
					}'`,
					"Error obtaining CSC Data",
					dbs.kioskotek,
				);
				// console.log("Directory: ", directory);

				if (directory[0]) {
					hr_id = directory[0].hr_id_number;
				} else {
					hr_id = defaultHRID;
				}

				function formatDateToSpanish(dateString) {
					// Parse the date and convert it to local time
					const localDate = new Date(dateString);
					// console.log("Date string is: ", dateString);
					// console.log("Local date string is: ", localDate);

					const options = {
						year: "numeric",
						month: "long",
						day: "numeric",
						timeZone: "UTC",
					};

					// Get the formatted date string in Spanish (long format for months)
					return localDate.toLocaleDateString("es-ES", options);
				}

				switch (letter) {
					case "CartaGuarderia":
					case "CartaPrestamo":
					case "CartaTrabajo":
					case "CartaVisa":
					case "CartaPermiso": {
						if (letter === "CartaPrestamo") {
							letterType = "Prestamo";
						} else {
							letterType = letter.substring(5);
						}
						newFileName = `${letter === "CartaPrestamo"
							? "CartaSalario"
							: letter === "CartaPermiso"
								? "CartaViaje"
								: letter
							}_${numEmp} - ${formattedCustom}.pdf`;

						let code = {};
						switch (region) {
							case "JRZ":
							case "MTY":
							case "AMX": {
								code.supervisor = "3";
								code.area = "5";
								code.proyecto = "0";
								code.planta = "7";
								break;
							}
							case "SAL":
							case "TIJ": {
								code.supervisor = "8";
								code.proyecto = "5";
								code.area = "6";
								code.planta = "1";
								break;
							}
						}

						const employeeData = await executeQuery(
							`Select
							CB_NOMBRES As nombres,
							CB_APE_PAT As ape_paterno,
							CB_APE_MAT As ape_materno,
							CB_SEXO As sexo,
							CB_RFC As rfc_emp,
							PU_DESCRIP As puesto,
							TU_DESCRIP As jornada,
							CB_FEC_ANT As antiguedad,
							CB_SEGSOC As seguro_social,
							CB_SALARIO As salario,
							CB_NIVEL${code.proyecto} As id_proyecto,
							PLANTA.TB_ELEMENT AS nombre_planta
						From
							COLABORA
							INNER JOIN PUESTO ON PUESTO.PU_CODIGO = COLABORA.CB_PUESTO
							INNER JOIN RPATRON ON RPATRON.TB_CODIGO = COLABORA.CB_PATRON
							INNER JOIN TURNO ON TURNO.TU_CODIGO = COLABORA.CB_TURNO
							INNER JOIN NIVEL${code.planta} AS PLANTA ON PLANTA.TB_CODIGO = COLABORA.CB_NIVEL${code.planta}
						Where
							CB_CODIGO = '${numEmp}'`,
							"Error retrieving employee information",
							dbs.colabora,
						);

						console.log("Employee data: ", employeeData[0]);

						const companyData = await executeQuery(
							`SELECT
							RS_NOMBRE As razon_social,
							RS_RFC As rfc_razon,
							RP.TB_NUMREG as registro_patronal,
							RS_CALLE As calle,
							RS_NUMEXT As num_ext,
							RS_COLONIA As colonia,
							RS_CODPOST As codigo_postal,
							RS_CIUDAD As ciudad,
							EN.TB_ELEMENT As entidad
						FROM
							COLABORA As C
							Inner Join RPATRON As RP On RP.TB_CODIGO = C.CB_PATRON
							Inner Join RSOCIAL As RS On RS.RS_CODIGO = RP.RS_CODIGO
							Inner Join ENTIDAD As EN On EN.TB_CODIGO = RS.RS_ENTIDAD
						WHERE
							C.CB_CODIGO = '${numEmp}'`,
							"Error retrieving employee information",
							dbs.colabora,
						);
						employeeData[0].id_proyecto = employeeData[0].id_proyecto.trim();
						if (employeeData[0].id_proyecto === "H09") {
							switch (employeeData[0].nombre_planta) {
								case "PLANTA 18-1":
									companyData[0].calle = "Boulevard Independencia";
									companyData[0].num_ext = "1568";
									companyData[0].colonia = "Col. Zaragoza";
									companyData[0].codigo_postal = "32590";
									companyData[0].ciudad = "Ciudad Juárez";
									companyData[0].entidad = "Chihuahua";
									break;

								case "PLANTA 18-2":
									companyData[0].calle = "Blvd. Manuel Talamás Camandari";
									companyData[0].num_ext = "8610";
									companyData[0].colonia = "Col. Lote Bravo";
									companyData[0].codigo_postal = "32695";
									companyData[0].ciudad = "Ciudad Juárez";
									companyData[0].entidad = "Chihuahua";
									break;

								case "PLANTA 18-3":
									companyData[0].calle = "Blvd. Manuel Talamás Camandari";
									companyData[0].num_ext = "9020 Int. A";
									companyData[0].colonia = "Col. Los Arcos";
									companyData[0].codigo_postal = "32695";
									companyData[0].ciudad = "Ciudad Juárez";
									companyData[0].entidad = "Chihuahua";
									break;
							}
						} else if (employeeData[0].id_proyecto === "H79") {
							Object.assign(companyData[0], {
								razon_social: "COORDINADORA PLUS DE TIJUANA",
								rfc_razon: "CPT950117128",
								registro_patronal: "A8385218103",
								calle: "AV. ROSA MARIA Y. FUENTES",
								num_ext: "7451 INT 1",
								colonia: "COMPLEJO INDUSTRIAL LOS FUENTES",
								codigo_postal: "32437",
								ciudad: "CD JUAREZ",
								entidad: "CHIHUAHUA",
							});
						}
						// console.log("Employee data: ", employeeData);
						// console.log("Company data: ", companyData);
						// console.log("Directory data: ", directory);
						const formattedDate = formatDateToSpanish(new Date());

						const pdfData = {
							...directory[0],
							...employeeData[0],
							...companyData[0],
							fecha: formattedDate,
						};

						const antiguedadDate = new Date(pdfData.antiguedad); // Convert the ISO string to a Date object

						pdfData.salario_mensual = (pdfData.salario * 30.4).toFixed(2);
						pdfData.salario_mensual_letra = getFormattedSalario(
							pdfData.salario_mensual,
						);

						pdfData.antiguedad = formatDateToSpanish(antiguedadDate);
						pdfData.tipo = letter;

						let logoName;
						// console.log("Project is: ", data.project.trim());
						if (data.project.trim() === "H09") {
							logoName = "FLEXSTEEL.png";
						} else if (data.project.trim() === "H75") {
							logoName = "CLEAR.png";
						} else {
							logoName = "LOGOTECMA.png";
						}

						const imageBase64 = fs
							.readFileSync(
								path.join(__dirname, `../../public/assets/images/${logoName}`),
							)
							.toString("base64");

						pdfData.imageBase64 = imageBase64;
						// console.log("pdfData: ", pdfData);
						// return;

						console.log("Generating letter pdf...");
						try {
							fileBuffer = await generateLetterPDF({ data: pdfData });
							// console.log(Buffer.isBuffer(fileBuffer));
							// console.log("After checking buffer again");
							// fileBuffer = Buffer.from(file, "base64");
							// return { pdfFile: fileBuffer };
						} catch (err) {
							console.error("Error generating letter PDF:", err);
							throw new Error("Failed to create letter PDF.");
						}
						// return;
						break;
					}
					// return "Done";

					case "AjustePrenom":
					case "PermisoDias":
					case "Vacaciones": {
						const companyData = await executeQuery(
							`SELECT
							RS_NOMBRE As razon_social
						FROM
							COLABORA As C
							Inner Join RPATRON As RP On RP.TB_CODIGO = C.CB_PATRON
							Inner Join RSOCIAL As RS On RS.RS_CODIGO = RP.RS_CODIGO
						WHERE
							C.CB_CODIGO = '${numEmp}'`,
							"Error retrieving company information",
							dbs.colabora,
						);

						const formattedDate = formatDateToSpanish(new Date());

						const pdfData = {
							...data,
							...companyData[0],
							...directory[0],
							fecha: formattedDate,
						};
						pdfData.folio = getFormattedFolioFromDate();

						console.log("pdfData values: ", JSON.stringify(pdfData, null, 1));

						let logoName;

						if (data.project.trim() === "H09") {
							logoName = "FLEXSTEEL.png";
						} else if (data.project.trim() === "H75") {
							logoName = "CLEAR.png";
						} else {
							logoName = "LOGOTECMA.png";
						}

						const imageBase64 = fs
							.readFileSync(
								path.join(__dirname, `../../public/assets/images/${logoName}`),
							)
							.toString("base64");

						pdfData.imageBase64 = imageBase64;

						if (letter === "AjustePrenom") {
							letterType = "Ajuste";
							pdfData.dia_ajuste = formatDateToSpanish(data.day_to_adjust);
							// console.log("Day to adjust: ", day_to_adjust, ", period: ", period);

							console.log(`Generating ${letterType} pdf...`);
							try {
								fileBuffer = await generateAdjustmentPDF({ data: pdfData });
							} catch (err) {
								console.error(`Error generating ${letterType} PDF:`, err);
								throw new Error(`Failed to create ${letterType} PDF.`);
							}
						} else if (letter === "PermisoDias") {
							letterType = "Permiso";
							pdfData.fecha_inicio = formatDateToSpanish(data.start_date);
							pdfData.fecha_fin = formatDateToSpanish(data.end_date);
							console.log(`Generating ${letterType} pdf...`);
							try {
								fileBuffer = await generatePermitPDF({ data: pdfData });
							} catch (err) {
								console.error(`Error generating ${letterType} PDF:`, err);
								throw new Error(`Failed to create ${letterType} PDF.`);
							}
						} else if (letter === "Vacaciones") {
							letterType = letter;
							pdfData.fecha_inicio = formatDateToSpanish(data.start_date);
							pdfData.fecha_fin = formatDateToSpanish(data.end_date);

							// console.log("pdfData again is: ", pdfData);
							console.log(`Generating ${letterType} pdf...`);
							// return { pdfFile: "Done" };
							try {
								fileBuffer = await generateVacationsPDF({ data: pdfData });
							} catch (err) {
								console.error(`Error generating ${letterType} PDF:`, err);
								throw new Error(`Failed to create ${letterType} PDF.`);
							}
						}

						newFileName = `${letter}_${numEmp} - ${formattedCustom}.pdf`;

						// return { pdfFile: "Done" };
						break;
					}
					case "Banorte": {
						letterType = letter;
						if (fileName !== null) {
							newFileName = `Motivo: ${motive}, Código: ${fileName}`;
						} else {
							newFileName = motive;
						}
						break;
					}
					// fileBuffer = ""
					case "Gafete": {
						letterType = letter;
						newFileName = "ParaImpresion";
						break;
					}
					case "Despensa": {
						letterType = letter;
						newFileName = `Motivo: ${motive}`;
						break;
					}
					case "NIP": {
						pending = "0";
						letterType = letter;
						newFileName = "ResetNIP";
						break;
					}

					case "AltaIMSS": {
						// const folio = await executeQuery(
						// 	`Select
						// 		CB_CODIGO as Empl,
						// 		CB_TIPO as Tipo,
						// 		CB_FECHA as Fecha,
						// 		CB_LOT_IDS as Lote
						// 	From
						// 		KARDEX
						// 	Where
						// 		CB_CODIGO = '${numEmp}'
						// 		and CB_TIPO = 'ALTA'
						// 		and CB_FECHA = (
						// 			Select
						// 				MAX(CB_FECHA)
						// 			From
						// 				KARDEX
						// 			Where
						// 				CB_TIPO = 'ALTA'
						// 				and CB_CODIGO = '${numEmp}'
						// 		)`,
						// 	"Error retrieving folio",
						// 	dbs.colabora
						// );
						pending = "0";
						letterType = letter;
						newFileName = "NoArchivo";

						// try {
						// 	const pdfBuffer = await generateIMSSPDF({ data });

						// 	fileBuffer = pdfBuffer.toString("base64");

						// 	// return { pdfFile: fileBuffer };
						// } catch (err) {
						// 	console.error("Error generating PDF:", err);
						// 	throw new Error("Failed to create PDF.");
						// }
						console.log("Generating IMSS pdf...");

						break;
					}

					case "Domicilio": {
						letterType = letter;
						let fileExtension;

						if (fileName === "image.jpg") {
							fileExtension = "jpg";
						} else if (fileName === "document.pdf") {
							fileExtension = "pdf";
						} else {
							throw new Error(
								"Invalid file type. Only JPG and PDF are allowed.",
							);
						}

						newFileName = `Domicilio_${numEmp} - ${formattedCustom}.${fileExtension}`;
						// Imagen o pdf

						console.log("Reading file...");

						fileBuffer = Buffer.from(file, "base64");
						break;
					}
					case "PtmoFA": {
						letterType = letter;
						// const blockedEmployees = new Set([
						// 	"1301473", "1302017", "1301572", "1301845", "1301349", "130469", "1302146",
						// 	"1301257", "130391", "1301815", "1301835", "1301258", "1302155", "1309013",
						// 	"1301914", "1302004", "1301622", "1301483", "1301968", "1301579", "1301706",
						// 	"1301728", "1301661", "1301831", "1301850", "1302016", "1301905", "1301276",
						// 	"1301786"
						// ]);

						if (
							data.plant_id.trim() === "8-41" ||
							data.plant_id.trim() === "V-D"
						) {
							return { pdfFile: "Exists" };
						}

						const interestRate = 0.159;
						const prestamo = await executeQuery(
							`Declare @CurrentYear INT = YEAR(GETDATE());
						Declare @Exists NVARCHAR(5);
		
						Set @Exists = (
							Select Case 
								When Exists (
									Select 1
									From PRESTAMO
									Where YEAR(PR_FECHA) = @CurrentYear
									And CB_CODIGO = ${numEmp}
									And PR_TIPO = '4'
								) Then 'true'
								Else 'false'
							End
						);
		
						Select 
							SUM(AH.AH_SALDO) * 2 As balance,
							@Exists As prestamoExists
		
							From AHORRO As AH
							Where AH.CB_CODIGO = ${numEmp}
							And AH.AH_TIPO = '2' 
							And AH.AH_STATUS = 0
							And AH.AH_FECHA = (SELECT MAX(AH_FECHA) 
												FROM Ahorro 
												WHERE CB_CODIGO = '${numEmp}' 
													AND AH_STATUS = 0 
													AND AH_TIPO = '2');`,
							"Error fetching prenomina days information",
							dbs.colabora,
						);

						const prestamoKiosko = await executeQuery(
							`Declare @CurrentYear INT = YEAR(GETDATE());
						Declare @Exists NVARCHAR(5);
		
						Set @Exists = (
							Select Case 
								When Exists (
									Select 1
									From K_Solicitudes
									Where YEAR(Fecha) = YEAR(@CurrentYear)
									And No = ${numEmp}
								) Then 'true'
								Else 'false'
							End
						);
		
						Select 
							@Exists As prestamoExists`,
							"Error fetching existing loan k",
							dbs.kioskotek,
						);

						const isLoanAllowed =
							prestamo[0].prestamoExists === "true" ? true : false;

						const isLoanRequested =
							prestamoKiosko[0].prestamoExists === "true" ? true : false;
						console.log("isLoanAllowed: ", isLoanAllowed);

						if (isLoanAllowed) {
							console.log("Loan exists, denying.");
							return { pdfFile: "Exists" };
						}

						if (isLoanRequested) {
							console.log("Already requested loan, denying.");
							return { pdfFile: "Existing requisition" };
						}

						const balance = returnZero(prestamo[0].balance);
						if (
							requested_loan > balance * 0.9 ||
							requested_loan < balance * 0.1
						)
							return { pdfFile: "Limit" };
						console.log("Balance is: ", balance);

						const prestamo_weeks = await executeQuery(
							`SELECT TOP 1 
						semana_inicial AS initial_week,
							semana_final AS final_week
							FROM Prestamos
							ORDER BY fecha DESC;`,
							"Error fetching prestamo weeks information",
							"tecmamovilcentral",
						);

						const initial_week = prestamo_weeks[0].initial_week;
						const final_week = prestamo_weeks[0].final_week;

						const getWeekDates = async (year, weekNumber) => {
							console.log("Week number: ", weekNumber);
							// Get the first day of the year
							const firstDayOfYear = new Date(year, 0, 1);
							const firstSaturdayOfYear = new Date(firstDayOfYear);

							// Find the first Saturday of the year
							while (firstSaturdayOfYear.getDay() !== 6) {
								firstSaturdayOfYear.setDate(firstSaturdayOfYear.getDate() + 1);
							}

							// Calculate the offset for the desired week number
							const daysOffset = (weekNumber - 1) * 7;
							const startOfWeek = new Date(
								firstSaturdayOfYear.setDate(
									firstSaturdayOfYear.getDate() + daysOffset,
								),
							);
							const endOfWeek = new Date(startOfWeek);
							endOfWeek.setDate(startOfWeek.getDate() + 6); // Last day of the week

							console.log(
								"Start of week: ",
								startOfWeek,
								" end of week: ",
								endOfWeek,
							);
							return {
								firstDay: startOfWeek,
								lastDay: endOfWeek,
							};
						};

						const currentYear = new Date().getFullYear();

						const startDate = await getWeekDates(currentYear, initial_week);

						const endDate = await getWeekDates(currentYear, final_week);

						let availableWeeks;
						const today = new Date();
						if (today >= startDate.firstDay && today <= endDate.lastDay) {
							const diffInTime = endDate.lastDay - today;
							const diffInWeeks = Math.ceil(
								diffInTime / (1000 * 60 * 60 * 24 * 7),
							);

							availableWeeks = diffInWeeks;
						} else {
							console.log("Out of range");
							return { pdfFile: "OutOfRange" };
						}

						if (loan_weeks > availableWeeks)
							return { pdfFile: "ExceedsPeriod" };

						const interest = parseFloat(
							((interestRate * loan_weeks * requested_loan) / 100).toFixed(2),
						);

						const totalToPay = parseFloat(
							(requested_loan + interest).toFixed(2),
						);

						const weekly_discount = parseFloat(
							(totalToPay / loan_weeks).toFixed(2),
						);

						const companyData = await executeQuery(
							`SELECT
							RS_NOMBRE As razon_social
						FROM
							COLABORA As C
							Inner Join RPATRON As RP On RP.TB_CODIGO = C.CB_PATRON
							Inner Join RSOCIAL As RS On RS.RS_CODIGO = RP.RS_CODIGO
						WHERE
							C.CB_CODIGO = '${numEmp}'`,
							"Error retrieving company information",
							dbs.colabora,
						);

						const formattedDate = formatDateToSpanish(new Date());

						const pdfData = {
							...data,
							...companyData[0],
							...directory[0],
							fecha: formattedDate,
						};

						pdfData.requested_loan = requested_loan.toFixed(2);
						pdfData.loan_weeks = loan_weeks.toFixed(2);
						pdfData.interest = interest.toFixed(2);
						pdfData.total = totalToPay.toFixed(2);
						pdfData.weekly_discount = weekly_discount.toFixed(2);

						console.log("pdfData values: ", JSON.stringify(pdfData, null, 1));

						let logoName;

						if (data.project.trim() === "H09") {
							logoName = "FLEXSTEEL.png";
						} else if (data.project.trim() === "H75") {
							logoName = "CLEAR.png";
						} else {
							logoName = "LOGOTECMA.png";
						}

						const imageBase64 = fs
							.readFileSync(
								path.join(__dirname, `../../public/assets/images/${logoName}`),
							)
							.toString("base64");

						pdfData.imageBase64 = imageBase64;

						console.log(`Generating ${letterType} pdf...`);
						try {
							fileBuffer = await generateSavingsLoanPDF({ data: pdfData });
						} catch (err) {
							console.error(`Error generating ${letterType} PDF:`, err);
							return { pdfFile: "Error" };
						}

						newFileName = `PtmoFA_${numEmp} - ${formattedCustom}.pdf`;
						// try {
						// 	const pdfBuffer = await generateSavingsLoanPDF({ data });

						// 	// return { pdfFile: fileBuffer };
						// } catch (err) {
						// 	console.error("Error generating PDF:", err);
						// 	throw new Error("Failed to create PDF.");
						// }
						console.log("Generating savings loan pdf...");
						break;
					}
					case "RetiroFA": {
						letterType = letter;

						const formatDateToSpanish = () => {
							const localDate = new Date();

							const options = {
								year: "numeric",
								month: "long",
								day: "numeric",
								timeZone: "UTC",
							};

							return localDate.toLocaleDateString("es-ES", options);
						};

						const getFormattedDateTime = () => {
							const currentDate = new Date();

							const padZero = (num, size = 2) =>
								String(num).padStart(size, "0");

							const year = currentDate.getFullYear();
							const month = padZero(currentDate.getMonth() + 1);
							const day = padZero(currentDate.getDate());

							const hours24 = currentDate.getHours();
							const minutes = padZero(currentDate.getMinutes());
							const seconds = padZero(currentDate.getSeconds());

							return `${day}-${month}-${year} ${padZero(
								hours24,
							)}:${minutes}:${seconds}`;
						};

						const companyData = await executeQuery(
							`SELECT
							RS_NOMBRE As razon_social,
							RS_CALLE As calle,
							RS_NUMEXT As num_ext,
							RS_COLONIA As colonia,
							RS_CODPOST As codigo_postal,
							RS_CIUDAD As ciudad,
							EN.TB_ELEMENT As entidad
						FROM
							COLABORA As C
							Inner Join RPATRON As RP On RP.TB_CODIGO = C.CB_PATRON
							Inner Join RSOCIAL As RS On RS.RS_CODIGO = RP.RS_CODIGO
							Inner Join ENTIDAD As EN On EN.TB_CODIGO = RS.RS_ENTIDAD
						WHERE
							C.CB_CODIGO = ${numEmp}`,
							"Error retrieving employee information",
							dbs.colabora,
						);

						const formattedDate = formatDateToSpanish();
						const detailedDate = getFormattedDateTime();
						console.log("Date is: ", detailedDate);

						const tel_empresa = "(656) 649-1000";

						const pdfData = {
							numEmp,
							name,
							project,
							plant_id,
							...companyData[0],
							fecha: formattedDate,
							fecha_det: detailedDate,
							tel_empresa,
						};

						console.log("pdfData values: ", JSON.stringify(pdfData, null, 1));

						let logoName;

						if (data.project.trim() === "H09") {
							logoName = "FLEXSTEEL.png";
						} else if (data.project.trim() === "H75") {
							logoName = "CLEAR.png";
						} else {
							logoName = "LOGOTECMA.png";
						}

						const imageBase64 = fs
							.readFileSync(
								path.join(__dirname, `../../public/assets/images/${logoName}`),
							)
							.toString("base64");

						pdfData.imageBase64 = imageBase64;

						console.log(`Generating ${letterType} pdf...`);
						try {
							fileBuffer = await generateSavingWithdrawPDF({ data: pdfData });
						} catch (err) {
							console.error(`Error generating ${letterType} PDF:`, err);
							throw new Error(`Failed to create ${letterType} PDF.`);
						}

						newFileName = `RetiroFA_${numEmp} - ${formattedCustom}.pdf`;
						console.log("Generated savings withdraw pdf...");

						break;
					}

					default:
						break;
				}

				switch (letter) {
					// RH
					case "CartaGuarderia":
					case "CartaPrestamo":
					case "CartaTrabajo":
					case "CartaVisa":
					case "CartaPermiso":
					case "PermisoDias":
					case "Vacaciones":
					case "Despensa":
					case "Domicilio":
					case "RetiroFA":
						if (project.trim() === "H63") {
							mail = directory[0]
								? directory[0].csc_advisor_email
								: defaultCSCMail;
						} else {
							mail = directory[0]
								? directory[0].hr_advisor_email
								: defaultHRMail;
						}
						break;

					// Asesor CSC
					case "PtmoFA":
					case "AjustePrenom":
					case "Banorte":
					case "Gafete":
					case "AltaIMSS":
						console.log(
							"Datos en directorio de asesor asignado: ",
							directory[0],
						);
						mail = directory[0]
							? directory[0].csc_advisor_email
							: defaultCSCMail;
						console.log("Correo asignado: ", mail);
						break;

					// Especial
					case "NIP":
						hr_id = "0000";
						mail = "albino.ramirez@tecma.com";
						break;
					default:
						break;
				}
				// console.log(`numEmp: ${numEmp}, name: ${name},
				// 	formattedDateTime: ${formattedDateTime},
				// 	letter: ${letter},
				// 	hr_id: ${hr_id},
				// 	mail: ${mail},
				// 	newFileName: ${newFileName},
				// 	plant_id: ${letterType === "NIP" ? "" : plant_id},
				// 	shift: ${letterType === "NIP" ? "" : shift},
				// 	project: ${letterType === "NIP" ? "" : project},
				// 	position: ${letterType === "NIP" ? "" : position},
				// 	clasification: ${clasification},
				// 	motive: ${motive},
				// 	coment: ${coment},
				// 	period: ${period},
				// 	start_date: ${start_date},
				// 	end_date: ${end_date},
				// 	days: ${days}`);

				await executeParameterizedQueryParam7(
					`Insert Into
					K_Solicitudes (
						No,
						Nombre,
						Fecha,
						Carta,
						RH,
						Asesor,
						NomArchivo,
						Archivo,
						Pendiente,
						Planta,
						Turno,
						Proyecto,
						Puesto,
						Clasificacion,
						Motivo,
						Comentario
					)
					Values
					(@param1, @param2, @param3, @param4, @param5, @param6, @param7,
					@param8, @param9, @param10, @param11, @param12, @param13,
					@param14, @param15, @param16)`,
					[
						numEmp,
						name,
						formattedDateTime,
						letterType,
						hr_id,
						mail,
						newFileName,
						fileBuffer,
						pending,
						letterType === "NIP" ? "" : plant_id,
						letterType === "NIP" ? "" : shift,
						letterType === "NIP" ? "" : project,
						letterType === "NIP" ? "" : position,
						clasification,
						motive ? motive : null,
						coment ? coment : null,
					],
					"Error while sending requisition",
					dbs.kioskotek,
				);
				console.log("Done");
				return { pdfFile: "Done" };
			} catch (err) {
				console.error(
					`Error at sendRequisition for user: ${numEmp}, error: ${err}`,
				);
				// throw new Error("Error processing request");
				return { pdfFile: "Error" };
			}
		},
		generatePayroll: async (_, { numEmp, region, period, year }) => {
			console.log("Received Payroll Gen request from: ", numEmp);
			const dbs = await selectRegion(region);
			let code = {};
			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX": {
					code.supervisor = "3";
					code.area = "5";
					code.proyecto = "0";
					code.planta = "7";
					break;
				}
				case "SAL":
				case "TIJ": {
					code.supervisor = "8";
					code.proyecto = "5";
					code.area = "6";
					code.planta = "1";
					break;
				}
			}

			let success = false;
			let pdfData = null;
			let pdfName = null;
			// const directory = await executeQuery(
			// 	`Select
			// 		CSC_RH.Nombre As nombre_rh,
			// 		CSC_RH.email As hr_advisor_email,
			// 		CSC_Asesor.email As csc_advisor_email,
			// 		DIR.RH As hr_id_number
			// 	from
			// 		CSC_Directorio As DIR
			// 		Inner Join CSC_RH on CSC_RH.Codigo = DIR.RH
			// 		Inner Join CSC_Asesor on CSC_Asesor.Codigo = DIR.Asesor
			// 	Where
			// 		Planta = '${plant_id}'
			// 		and Proyecto = '${project}'`,
			// 	"Error obtaining CSC Data",
			// 	"kioskocentral"
			// );

			const employeeData = await executeQuery(
				`Select
					PRETTYNAME As nombre,
					CB_RFC As rfc,					
					CB_SEGSOC As seguro_social,
					PE_FEC_INI As fecha_inicial,
					PE_FEC_FIN As fecha_final,
					PE_FEC_PAG As fecha_pago,
					CB_FEC_ANT As fecha_ingreso,
					PLANTA.TB_ELEMENT As planta,
					CB_CURP As curp,
					PUESTO.PU_DESCRIP As puesto,
					NOM.CB_SALARIO As salario,
					TU_DESCRIP As turno,
					NOM.CB_TURNO,
					NO_PERCEPC As total_percepciones,
					NO_DEDUCCI As total_deducciones,
					NO_NETO As total_neto,
					IsNull (
						(
							Select
								Sum(Mo_Percepc + Mo_Deducci)
							From
								Movimien
							Where
								Pe_Tipo = NOM.Pe_Tipo
								And Pe_Year = NOM.Pe_Year
								And Pe_Numero = NOM.Pe_Numero
								And Cb_Codigo = NOM.Cb_Codigo
								And Co_Numero In (62, 210)
						),
						0.00
					) As ahorro,
					IsNull (
						(
							Select
								AH_SALDO
							FROM
								AHORRO
							WHERE
								AH_TIPO = '3'
								AND AH_STATUS = 0
								AND CB_CODIGO = NOM.CB_CODIGO
						),
						0.00
					) As acumulado_ahorro,
					NO_HORAS As horas_ordinarias,
					NO_EXTRAS As horas_extras,
					NO_FES_PAG As horas_festivo
				From
					NOMINA As NOM
					Inner Join COLABORA on NOM.CB_CODIGO = COLABORA.CB_CODIGO
					Inner Join PUESTO on NOM.CB_PUESTO = PUESTO.PU_CODIGO
					Inner Join NIVEL${code.planta} As PLANTA on NOM.CB_NIVEL${code.planta} = PLANTA.TB_CODIGO
					Inner Join PERIODO on NOM.PE_YEAR = PERIODO.PE_YEAR
					Inner Join TURNO on NOM.CB_TURNO = TURNO.TU_CODIGO
					and NOM.PE_TIPO = PERIODO.PE_TIPO
					and NOM.PE_NUMERO = PERIODO.PE_NUMERO
				Where
					NOM.PE_YEAR = ${year}
					And NOM.PE_NUMERO = ${period}
					And NOM.CB_CODIGO = ${numEmp}`,
				"Error retrieving employee information",
				dbs.colabora,
			);

			const companyData = await executeQuery(
				`SELECT
					RS_NOMBRE As razon_social,
					CB_NIVEL${code.proyecto} As proyecto,
					RS_RFC As rfc_razon,
					RP.TB_NUMREG as registro_patronal,
					RS_CALLE As calle,
					RS_NUMEXT As num_ext,
					RS_COLONIA As colonia,
					RS_CODPOST As codigo_postal,
					RS_CIUDAD As ciudad,
					EN.TB_ELEMENT As entidad
				FROM
					COLABORA As C
					Inner Join RPATRON As RP On RP.TB_CODIGO = C.CB_PATRON
					Inner Join RSOCIAL As RS On RS.RS_CODIGO = RP.RS_CODIGO
					Inner Join ENTIDAD As EN On EN.TB_CODIGO = RS.RS_ENTIDAD
				WHERE
					C.CB_CODIGO = ${numEmp}`,
				"Error retrieving employee information",
				dbs.colabora,
			);

			// console.log("Employee data: ", employeeData[0]);
			// console.log("Company data: ", companyData[0]);

			// return { pdfFile: "Done" };

			const payrollConceptData = await executeQuery(
				`Select
					CO_DESCRIP as concepto,
					CASE 
						WHEN CO_TIPO = 1 THEN MO_PERCEPC
						WHEN CO_TIPO = 2 THEN MO_DEDUCCI
					END as importe,
					CO_TIPO as tipo
				From
					MOVIMIEN As Mov
					Inner Join CONCEPTO on Mov.CO_NUMERO = CONCEPTO.CO_NUMERO
				Where
					PE_YEAR = ${year}
					And Pe_NUMERO = ${period}
					And CB_CODIGO = ${numEmp}
					And CO_TIPO IN (1, 2)
				Order By
					Mov.CO_NUMERO;`,
				"Error retrieving employee information",
				dbs.colabora,
			);

			// console.log("Employee data: ", JSON.stringify(employeeData[0], null, 1));
			// console.log("Company data: ", JSON.stringify(companyData[0], null, 1));
			// console.log(
			// 	"Payroll conceptos data: ",
			// 	JSON.stringify(payrollData, null, 1)
			// );

			const payrollData = {
				...employeeData[0],
				...companyData[0],
				numEmp,
				week: period,
			};

			function formatDateToSpanish(dateString) {
				// Parse the date and convert it to local time
				const localDate = new Date(dateString);
				// console.log("Date string is: ", dateString);
				// console.log("Local date string is: ", localDate);

				const options = {
					year: "numeric",
					month: "short",
					day: "numeric",
					timeZone: "UTC",
				};

				// Get the formatted date string in Spanish (long format for months)
				return localDate.toLocaleDateString("es-ES", options).toUpperCase();
			}

			const getFormattedDateTime = () => {
				const currentDate = new Date();

				const padZero = (num, size = 2) => String(num).padStart(size, "0");

				const year = currentDate.getFullYear();
				const month = padZero(currentDate.getMonth() + 1); // Months are zero-indexed
				const day = padZero(currentDate.getDate());

				const hours24 = currentDate.getHours();
				const minutes = padZero(currentDate.getMinutes()); // Milliseconds need 3 digits

				// Generate original format (YYYY-MM-DD HH:MM:SS.mmm)
				return `${year}-${month}-${day}-${padZero(hours24)}-${minutes}`;
			};

			payrollData.periodo = `${formatDateToSpanish(
				payrollData.fecha_inicial,
			)} A ${formatDateToSpanish(payrollData.fecha_final)}`;
			payrollData.fecha_pago = formatDateToSpanish(payrollData.fecha_pago);
			payrollData.fecha_ingreso = formatDateToSpanish(
				payrollData.fecha_ingreso,
			);
			payrollData.ahorro_total = payrollData.ahorro * 2;

			payrollData.salario = payrollData.salario.toFixed(2);
			payrollData.total_percepciones =
				payrollData.total_percepciones.toFixed(2);
			payrollData.total_deducciones = payrollData.total_deducciones.toFixed(2);
			payrollData.total_neto = payrollData.total_neto.toFixed(2);
			payrollData.ahorro = payrollData.ahorro.toFixed(2);
			payrollData.acumulado_ahorro = payrollData.acumulado_ahorro.toFixed(2);

			let logoName;

			if (companyData[0].proyecto.trim() === "H09") {
				logoName = "FLEXSTEEL.png";
			} else {
				logoName = "LOGOTECMA.png";
			}

			const imageBase64 = fs
				.readFileSync(
					path.join(__dirname, `../../public/assets/images/${logoName}`),
				)
				.toString("base64");

			payrollData.imageBase64 = imageBase64;

			console.log("Generating payroll pdf...");
			try {
				fileBuffer = await generatePayrollPDF({
					data: payrollData,
					payroll: payrollConceptData,
				});
				if (!Buffer.isBuffer(fileBuffer)) {
					throw new Error("Generated file is not a buffer");
				}
				pdfData = fileBuffer.toString("base64");
				pdfName = `Recibo_${numEmp} - ${getFormattedDateTime()}.pdf`;
				console.log("Generated payroll pdf: ", pdfName);
				success = true;

				// console.log(Buffer.isBuffer(fileBuffer));
				// console.log("After checking buffer again");
				// fileBuffer = Buffer.from(file, "base64");
				// return { pdfFile: fileBuffer };
			} catch (err) {
				console.error("Error generating letter PDF:", err);
				throw new Error("Failed to create letter PDF.");
			}
			// return { success: true, pdfName };
			console.log("Data is: ", success, pdfName);
			return { success, pdfData, pdfName };
		},
		submitSurvey: async (_, { input }) => {
			const { encuesta, region, numEmp, data } = input;
			const dbs = await selectRegion(region);
			console.log("Input is: ", JSON.stringify(input, null, 1));

			// Validate the input
			if (!encuesta || !numEmp || !region || !data || !data.length) {
				return {
					success: false,
					message: "Input is invalid. Please provide all required fields.",
				};
			}

			try {
				// Process the survey data
				for (const item of data) {
					const { pregunta, respuesta } = item;

					if (!pregunta || !respuesta) {
						return {
							success: false,
							message: `Incomplete data for question ${pregunta}.`,
						};
					} else {
					}
				}

				try {
					// Build the VALUES clause dynamically
					const values = data
						.map(
							(item) =>
								`(${encuesta}, '${numEmp}', ${item.pregunta}, '${item.respuesta}')`,
						)
						.join(", ");

					// Construct the SQL query
					const query = `INSERT INTO K_EncResp (Encuesta,	No, Pregunta, Respuesta)
							VALUES ${values};
						`;

					console.log("Query is: ", JSON.stringify(query, null, 1));

					// Execute the query
					await executeQuery(
						query,
						"Error registering survey responses",
						dbs.kioskotek,
					);

					await executeQuery(
						`Update K_Encuestas Set Estatus = 'T' Where Encuesta = ${encuesta} And No = ${numEmp}`,
						"Error updating survey status",
						dbs.kioskotek,
					);

					console.log("Survey responses successfully inserted.");
				} catch (error) {
					console.error("Error while submitting survey responses:", error);
					return {
						success: false,
						message: "An error occurred while submitting the survey.",
					};
				}

				return {
					success: true,
					message: "Survey answers registered correctly",
				};
			} catch (error) {
				console.error("Error submitting survey:", error);
				return {
					success: false,
					message: "An error occurred while submitting the survey.",
				};
			}
		},
		submitOpinion: async (_, { input }) => {
			const { numEmp, region, opinion } = input;
			const dbs = await selectRegion(region);
			console.log("Input is: ", JSON.stringify(input, null, 1));

			// Validate the input
			if (!numEmp || !region || !opinion) {
				return {
					success: false,
					message: "Input is invalid. Please provide all required fields.",
				};
			}

			try {
				// Construct the SQL query
				const query = `INSERT INTO Opiniones (no_reloj, opinion) VALUES (${numEmp}, '${opinion}');`;

				console.log("Query is: ", JSON.stringify(query, null, 1));

				// Execute the query
				await executeQuery(query, "Error registering opinion", dbs.tecmamovil);

				console.log("Opinion successfully inserted.");
			} catch (error) {
				console.error("Error while submitting opinion:", error);
				return {
					success: false,
					message: "An error occurred while submitting the opinion.",
				};
			}

			return {
				success: true,
				message: "Opinion registered correctly",
			};
		},
		requestQRData: async (_, { input }) => {
			console.log("Received request");
			const { numEmp, region } = input;
			const dbs = await selectRegion(region);

			// Validate the input
			if (!numEmp || !region) {
				return {
					success: false,
					message: "Input is invalid. Please provide all required fields.",
				};
			}

			try {
				// Construct the SQL query
				const query = `SELECT 
									CB_SEGSOC As imss, 
									CB_FEC_ANT As ingreso
								FROM COLABORA
								WHERE CB_CODIGO = '${numEmp}'`;

				// console.log("Query is: ", JSON.stringify(query, null, 1));

				// Execute the query
				const data = await executeQuery(
					query,
					"Error querying employee info",
					dbs.colabora,
				);

				// console.log("Obtained data is: ", data);
				return {
					success: true,
					message: "Information sent",
					// data: { ...data[0], qr: "https://tecmamovil.com" },
					data: { ...data[0], qr: "https://tecmamovil.com/redirect.html" },
				};
			} catch (error) {
				console.error("Error while querying employee info:", error);
				return {
					success: false,
					message: "An error occurred while obtaining information.",
				};
			}
		},
		generateVacationCertificate: async (_, { input }) => {
			const { numEmp, region, signature } = input;
			// console.log("Input is: ", JSON.stringify(input, null, 1));

			if (!numEmp || !region || !signature) {
				return {
					success: false,
					message: "Missing required input fields.",
				};
			}

			try {
				const dbs = await selectRegion(region);

				let code = {};
				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX": {
						code.supervisor = "3";
						code.area = "5";
						code.proyecto = "0";
						code.planta = "7";
						break;
					}
					case "SAL":
					case "TIJ": {
						code.supervisor = "8";
						code.proyecto = "5";
						code.area = "6";
						code.planta = "1";
						break;
					}
				}

				const employeeData = await executeQuery(
					`SELECT
						CB_FEC_ANT AS start_date,
						CONCAT(CB_NOMBRES, ' ', CB_APE_PAT, ' ', CB_APE_MAT) AS full_name,
						PU_DESCRIP AS position,
						AREA.TB_ELEMENT As department,
						CB_NIVEL${code.proyecto} As project_id,
						CB_FEC_ANT as fecha_ingreso,
						CB_DER_PAG as days_granted
					FROM
						COLABORA
						INNER JOIN PUESTO ON PUESTO.PU_CODIGO = COLABORA.CB_PUESTO
						LEFT JOIN NIVEL${code.area} as AREA on CB_NIVEL${code.area} = AREA.TB_CODIGO
					WHERE
						CB_CODIGO = '${numEmp}'`,
					"Error retrieving employee information",
					dbs.colabora,
				);

				if (!employeeData || employeeData.length === 0) {
					return {
						success: false,
						message: "Empleado no encontrado",
					};
				}

				console.log("Employee exists");

				const now = new Date();
				const ingreso = new Date(employeeData[0].fecha_ingreso);

				// 2. Block if user hasn't passed first anniversary
				const firstAnniversary = new Date(ingreso);
				firstAnniversary.setFullYear(ingreso.getFullYear() + 1);

				if (now < firstAnniversary) {
					console.log("User is not eligible for vacation certificate yet");
					return {
						success: false,
						message:
							"Aún no eres elegible para generar una constancia de vacaciones, debe pasar un año desde tu fecha de ingreso.",
					};
				}

				// 3. Determine current work-cycle window
				let anniversary = new Date(
					now.getFullYear(),
					ingreso.getMonth(),
					ingreso.getDate(),
				);
				if (now < anniversary)
					anniversary.setFullYear(anniversary.getFullYear() - 1);

				const nextAnniversary = new Date(anniversary);
				nextAnniversary.setFullYear(anniversary.getFullYear() + 1);

				const windowStart = anniversary.toISOString();
				const windowEnd = nextAnniversary.toISOString();

				// 4. Check if certificate already exists for this cycle
				console.log("Checking for existing vacation certificate...");
				const [existing] = await executeQuery(
					`SELECT TOP 1 file_name 
					FROM VacationCertificates
					WHERE employee_id = '${numEmp}'
					AND generated_at >= '${windowStart}' AND generated_at < '${windowEnd}'`,
					"Error checking existing vacation certificate",
					dbs.tecmamovil,
				);

				if (existing) {
					console.log(
						"Existing vacation certificate found: ",
						existing.file_name,
					);
					// const publicUrl = `https://api.tecmamovilconnect.com/vacation-certificates/${existing.file_name}`;
					const publicUrl = `http://10.3.1.180:8083/vacation-certificates/${existing.file_name}`;
					return {
						success: false,
						message:
							"El certificado de vacaciones ya existe para este año laboral.",
						pdfUrl: publicUrl,
					};
				}

				// console.log("Employee data: ", employeeData[0]);

				const companyData = await executeQuery(
					`SELECT
							RS_NOMBRE As company_name,
							RS_CIUDAD As city,
							EN.TB_ELEMENT As state
						FROM
							COLABORA As C
							Inner Join RPATRON As RP On RP.TB_CODIGO = C.CB_PATRON
							Inner Join RSOCIAL As RS On RS.RS_CODIGO = RP.RS_CODIGO
							Inner Join ENTIDAD As EN On EN.TB_CODIGO = RS.RS_ENTIDAD
						WHERE
							C.CB_CODIGO = '${numEmp}'`,
					"Error retrieving employee information",
					dbs.colabora,
				);

				function formatDateToSpanish(dateString) {
					const localDate = new Date(dateString);

					const options = {
						year: "numeric",
						month: "long",
						day: "numeric",
						timeZone: "UTC",
					};

					let formatted = localDate.toLocaleDateString("es-ES", options);
					formatted = formatted.replace(/ de (\d{4})$/, " del $1");

					// Capitalize the first letter of the month
					return formatted.replace(
						/\b(de )([a-z])/,
						(_, prefix, char) => prefix + char.toUpperCase(),
					);
				}

				const today = formatDateToSpanish(now);

				const pdfData = {
					...employeeData[0],
					...companyData[0],
					today,
				};

				const fechaIngreso = new Date(employeeData[0].fecha_ingreso);

				const currentYear = now.getFullYear();
				const nextYear = currentYear + 1;

				const day = fechaIngreso.getDate();
				const month = fechaIngreso.getMonth();

				const startVacationDate = new Date(
					Date.UTC(currentYear, month, day + 1),
				);
				const endVacationDate = new Date(Date.UTC(nextYear, month, day + 1));

				pdfData.start_vacation = formatDateToSpanish(
					startVacationDate.toISOString(),
				);
				pdfData.end_vacation = formatDateToSpanish(
					endVacationDate.toISOString(),
				);

				let seniority = now.getFullYear() - fechaIngreso.getFullYear();

				// Adjust if the current date is before the anniversary in the current year
				const monthDiff = now.getMonth() - fechaIngreso.getMonth();
				const dayDiff = now.getDate() - fechaIngreso.getDate();

				if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
					seniority--;
				}

				pdfData.seniority_date = formatDateToSpanish(
					employeeData[0].fecha_ingreso,
				);
				pdfData.seniority_years = seniority;

				let logoName;
				// console.log("Project is: ", data.project.trim());
				if (employeeData[0].project_id.trim() === "H09") {
					logoName = "FLEXSTEEL.png";
				} else if (employeeData[0].project_id.trim() === "H75") {
					logoName = "CLEAR.png";
				} else {
					logoName = "LOGOTECMA.png";
				}

				const imageBase64 = fs
					.readFileSync(
						path.join(__dirname, `../../public/assets/images/${logoName}`),
					)
					.toString("base64");

				pdfData.company_logo = imageBase64;

				pdfData.signature = signature;
				// console.log("pdfData: ", pdfData);
				// return;

				console.log("Generating vacation cert pdf...");

				function getFileSuffixUTCMinus7() {
					const now = new Date();

					// Offset in minutes for UTC-6
					const offsetMinutes = -6 * 60;
					const local = new Date(now.getTime() + offsetMinutes * 60 * 1000);

					const pad = (n) => String(n).padStart(2, "0");

					const year = local.getUTCFullYear();
					const month = pad(local.getUTCMonth() + 1);
					const day = pad(local.getUTCDate());
					const hour = pad(local.getUTCHours());
					const min = pad(local.getUTCMinutes());

					return `${year}${month}${day}${hour}${min}`;
				}

				const fileSuffix = getFileSuffixUTCMinus7();
				const file_name = `Constancia_de_Vacaciones_${numEmp}_${fileSuffix}.pdf`;
				pdfData.file_name = file_name;
				await generateVacationCertificatePDF({ data: pdfData });
				// console.log(Buffer.isBuffer(fileBuffer));
				// console.log("After checking buffer again");
				// fileBuffer = Buffer.from(file, "base64");
				// return { pdfFile: fileBuffer };

				console.log("File name is: ", file_name);
				// 6. Store metadata
				// await executeQuery(
				// 	`INSERT INTO VacationCertificates (employee_id, file_name) VALUES (${numEmp}, ${fileName})`,
				// 	"Error storing vacation certificate metadata",
				// 	dbs.tecmamovil
				// );
				console.log("After storing metadata");

				const publicUrl = `https://api.tecmamovilconnect.com/vacation-certificates/${file_name}`;
				// const publicUrl = `http://10.3.1.180:8083/vacation-certificates/${file_name}`;
				console.log("Public URL is: ", publicUrl);

				await executeQuery(
					`INSERT INTO VacationCertificates(employee_id, file_name, generated_at)
				Values('${numEmp}', '${file_name}', GETDATE())
				`,
					"Error storing vacation certificate metadata",
					dbs.tecmamovil,
				);

				return {
					success: true,
					message: "Constancia de Vacaciones generada exitosamente.",
					pdfUrl: publicUrl,
				};
			} catch (error) {
				console.error("Error generating vacation cert:", error);
				return {
					success: false,
					message: "Failed to generate vacation cert.",
				};
			}
		},
		handleCheckIn: requireAuth(async (_, { input }, { user }) => {
			console.log("Received check-in request: ", JSON.stringify(input, null, 1));

			const CHECK_IN_MARGIN_METERS = 18;

			function expandBoxByMeters(box, marginMeters) {
				const centerLatitude = (box.minLatitude + box.maxLatitude) / 2;

				const latDelta = marginMeters / 111320;
				const lonDelta =
					marginMeters / (111320 * Math.cos((centerLatitude * Math.PI) / 180));

				return {
					...box,
					minLatitude: box.minLatitude - latDelta,
					maxLatitude: box.maxLatitude + latDelta,
					minLongitude: box.minLongitude - lonDelta,
					maxLongitude: box.maxLongitude + lonDelta,
				};
			}

			async function getPendingPollStatus({ empId, dbs }) {
				const result = await executeParameterizedQuery(
					`
					SELECT COUNT(1) AS pending_count
					FROM POLL
					WHERE LTRIM(RTRIM(CAST(PO_NUMERO AS VARCHAR(30)))) = @param1
					`,
					[String(empId).trim()],
					"Error checking pending POLL records",
					dbs.comparte,
				);

				const pendingPollCount = Number(result?.[0]?.pending_count || 0);

				return {
					hasPendingPoll: pendingPollCount > 0,
					pendingPollCount,
				};
			}

			const CHECK_IN_AREAS = [
				{
					name: "Pasillo Aduanas",
					cornerA: {
						latitude: 31.6216944444, 	// 31°37'18.1"N
						longitude: -106.4482222222, // 106°26'53.6"W
					},
					cornerB: {
						latitude: 31.6217222222, 	// 31°37'18.2"N
						longitude: -106.4482222222, // 106°26'53.6"W
					},
				},
				{
					name: "Pasillo Recepcion",
					cornerA: {
						latitude: 31.6216944444,
						longitude: -106.4482222222,
					},
					cornerB: {
						latitude: 31.6216944444,
						longitude: -106.4481666667,
					},
				},
				{
					name: "Pasillo Cafeteria",
					// cornerA: {
					// 	latitude: 31.621418,
					// 	longitude: -106.448181,
					// },
					// cornerB: {
					// 	latitude: 31.621449,
					// 	longitude: -106.448125,
					// },
					cornerA: {
						latitude: 31.621539,
						longitude: -106.448143,
					},
					cornerB: {
						latitude: 31.6215320,
						longitude: -106.448161,
					},
				},
				// {
				// 	name: "Pasillo Cafeteria",
				// 	cornerA: {
				// 		latitude: 31.6214722222, // 31°37'17.3"N
				// 		longitude: -106.4481111111, // 106°26'53.2"W
				// 	},
				// 	cornerB: {
				// 		latitude: 31.6215, // 31°37'17.4"N
				// 		longitude: -106.4481111111, // 106°26'53.2"W
				// 	},
				// },
			]
				.map((area) => ({
					name: area.name,
					minLatitude: Math.min(area.cornerA.latitude, area.cornerB.latitude),
					maxLatitude: Math.max(area.cornerA.latitude, area.cornerB.latitude),
					minLongitude: Math.min(area.cornerA.longitude, area.cornerB.longitude),
					maxLongitude: Math.max(area.cornerA.longitude, area.cornerB.longitude),
				}))
				.map((area) => expandBoxByMeters(area, CHECK_IN_MARGIN_METERS));

			const GEO_BYPASS_EMP_IDS = new Set([
				"900874",
				"900683",
				"900209",
				"900951",
			]);

			function findMatchingCheckInArea({ latitude, longitude, areas }) {
				return areas.find((area) =>
					isInsideBoxRange({
						latitude,
						longitude,
						box: area,
					}),
				);
			}

			const MAX_LOCATION_ACCURACY_METERS = 75;

			function isValidNumber(value) {
				return typeof value === "number" && Number.isFinite(value);
			}

			function isInsideBoxRange({ latitude, longitude, box }) {
				return (
					latitude >= box.minLatitude &&
					latitude <= box.maxLatitude &&
					longitude >= box.minLongitude &&
					longitude <= box.maxLongitude
				);
			}

			function normalizeCheckInInput(input) {
				return {
					type: input.type,
					latitude: Number(input.latitude),
					longitude: Number(input.longitude),
					accuracy:
						input.accuracy === null || input.accuracy === undefined
							? null
							: Number(input.accuracy),
					clientTimestamp: input.clientTimestamp || null,
					clientTimezone: input.clientTimezone || null,
					deviceId: input.deviceId || null,
					platform: input.platform || null,
					appVersion: input.appVersion || null,
					idempotencyKey: input.idempotencyKey,
				};
			}

			function validateCheckInInput(input) {
				if (!["CHECK_IN", "CHECK_OUT"].includes(input.type)) {
					return {
						isValid: false,
						status: "INVALID_TYPE",
						message: "Tipo de registro inválido.",
					};
				}

				if (!input.idempotencyKey) {
					return {
						isValid: false,
						status: "MISSING_IDEMPOTENCY_KEY",
						message: "No se recibió el identificador único del intento.",
					};
				}

				if (!isValidNumber(input.latitude) || !isValidNumber(input.longitude)) {
					return {
						isValid: false,
						status: "INVALID_COORDINATES",
						message: "Coordenadas inválidas.",
					};
				}

				if (
					input.latitude < -90 ||
					input.latitude > 90 ||
					input.longitude < -180 ||
					input.longitude > 180
				) {
					return {
						isValid: false,
						status: "INVALID_COORDINATES",
						message: "Las coordenadas están fuera del rango válido.",
					};
				}

				if (
					input.accuracy !== null &&
					(!Number.isFinite(input.accuracy) || input.accuracy < 0)
				) {
					return {
						isValid: false,
						status: "INVALID_ACCURACY",
						message: "Precisión de ubicación inválida.",
					};
				}

				if (
					input.accuracy !== null &&
					input.accuracy > MAX_LOCATION_ACCURACY_METERS
				) {
					return {
						isValid: false,
						status: "LOW_ACCURACY",
						message:
							"La precisión de la ubicación es muy baja. Intenta nuevamente en un área más abierta.",
					};
				}

				return {
					isValid: true,
					status: "VALID",
					message: "Validación correcta.",
				};
			}

			function getLinxIdByRegion(region) {
				switch (region) {
					case "JRZ":
					case "MTY":
						return "TMC";
					case "AMX":
						return "TMA";
					case "SAL":
					case "TIJ":
						return "TMW";
				}
			}

			function normalizeCheckInLocationInput(input) {
				return {
					latitude: Number(input.latitude),
					longitude: Number(input.longitude),
					accuracy:
						input.accuracy === null || input.accuracy === undefined
							? null
							: Number(input.accuracy),
				};
			}

			function validateCheckInLocationInput(input) {
				if (!isValidNumber(input.latitude) || !isValidNumber(input.longitude)) {
					return {
						isValid: false,
						status: "INVALID_COORDINATES",
						message: "Coordenadas inválidas.",
					};
				}

				if (
					input.latitude < -90 ||
					input.latitude > 90 ||
					input.longitude < -180 ||
					input.longitude > 180
				) {
					return {
						isValid: false,
						status: "INVALID_COORDINATES",
						message: "Las coordenadas están fuera del rango válido.",
					};
				}

				if (
					input.accuracy !== null &&
					(!Number.isFinite(input.accuracy) || input.accuracy < 0)
				) {
					return {
						isValid: false,
						status: "INVALID_ACCURACY",
						message: "Precisión de ubicación inválida.",
					};
				}

				if (
					input.accuracy !== null &&
					input.accuracy > MAX_LOCATION_ACCURACY_METERS
				) {
					return {
						isValid: false,
						status: "LOW_ACCURACY",
						message:
							"La precisión de la ubicación es muy baja. Intenta nuevamente en un área más abierta.",
					};
				}

				return {
					isValid: true,
					status: "VALID",
					message: "Ubicación válida.",
				};
			}

			function evaluateCheckInZone({ empId, input }) {
				const normalizedInput = normalizeCheckInLocationInput(input);
				const validation = validateCheckInLocationInput(normalizedInput);

				if (!validation.isValid) {
					return {
						canCheckIn: false,
						isInsideAllowedZone: false,
						isBypass: false,
						status: validation.status,
						message: validation.message,
						geofenceName: null,
						latitude: isValidNumber(normalizedInput.latitude)
							? normalizedInput.latitude
							: null,
						longitude: isValidNumber(normalizedInput.longitude)
							? normalizedInput.longitude
							: null,
						accuracy:
							normalizedInput.accuracy !== null &&
								Number.isFinite(normalizedInput.accuracy)
								? normalizedInput.accuracy
								: null,
						maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
					};
				}

				const shouldBypassGeofence = GEO_BYPASS_EMP_IDS.has(String(empId).trim());

				if (shouldBypassGeofence) {
					return {
						canCheckIn: true,
						isInsideAllowedZone: true,
						isBypass: true,
						status: "BYPASS_ALLOWED",
						message: "Ubicación autorizada.",
						geofenceName: "BYPASS",
						latitude: normalizedInput.latitude,
						longitude: normalizedInput.longitude,
						accuracy: normalizedInput.accuracy,
						maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
					};
				}

				const matchedCheckInArea = findMatchingCheckInArea({
					latitude: normalizedInput.latitude,
					longitude: normalizedInput.longitude,
					areas: CHECK_IN_AREAS,
				});

				if (!matchedCheckInArea) {
					return {
						canCheckIn: false,
						isInsideAllowedZone: false,
						isBypass: false,
						status: "OUTSIDE_GEOFENCE",
						message: "No estás dentro de una zona permitida para hacer check-in.",
						geofenceName: null,
						latitude: normalizedInput.latitude,
						longitude: normalizedInput.longitude,
						accuracy: normalizedInput.accuracy,
						maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
					};
				}

				return {
					canCheckIn: true,
					isInsideAllowedZone: true,
					isBypass: false,
					status: "INSIDE_GEOFENCE",
					message: `Ubicación permitida: ${matchedCheckInArea.name}.`,
					geofenceName: matchedCheckInArea.name,
					latitude: normalizedInput.latitude,
					longitude: normalizedInput.longitude,
					accuracy: normalizedInput.accuracy,
					maxAccuracy: MAX_LOCATION_ACCURACY_METERS,
				};
			}

			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				if (!empId) {
					return {
						success: false,
						status: "EMPLOYEE_NOT_FOUND",
						message: "No se pudo identificar al empleado desde el token.",
						checkIn: null,
					};
				}

				if (!region) {
					return {
						success: false,
						status: "REGION_NOT_FOUND",
						message: "No se pudo identificar la región desde el token.",
						checkIn: null,
					};
				}

				const dbs = await selectRegion(region);

				let code = {};
				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX": {
						code.supervisor = "3";
						code.area = "5";
						code.proyecto = "0";
						code.planta = "7";
						break;
					}
					case "SAL":
					case "TIJ": {
						code.supervisor = "8";
						code.proyecto = "5";
						code.area = "6";
						code.planta = "1";
						break;
					}
				}

				const timezone = getBusinessTimezoneByRegion(region);
				const now = DateTime.now().setZone(timezone);

				const employeeResult = await executeParameterizedQuery(
					`
					SELECT TOP 1
						CB_CODIGO AS employee_id,
						CB_ACTIVO AS active,
						CB_NIVEL${code.proyecto} As project_id,
						CB_NIVEL${code.planta} As plant_id
					FROM COLABORA
					WHERE CB_CODIGO = @param1
					`,
					[empId],
					"Error fetching employee for check-in",
					dbs.colabora,
				);

				if (!employeeResult?.length) {
					return {
						success: false,
						status: "EMPLOYEE_NOT_FOUND",
						message: "Empleado no encontrado para esta región.",
						checkIn: null,
					};
				}

				const employee = employeeResult[0];

				if (String(employee.active || "").trim() !== "S") {
					return {
						success: false,
						status: "EMPLOYEE_NOT_ACTIVE",
						message: "El empleado no se encuentra activo.",
						checkIn: null,
					};
				}

				const normalizedInput = normalizeCheckInInput(input);
				const validation = validateCheckInInput(normalizedInput);

				const shouldBypassGeofence = GEO_BYPASS_EMP_IDS.has(String(empId).trim());

				if (!validation.isValid) {
					return {
						success: false,
						status: validation.status,
						message: validation.message,
						checkIn: {
							type: normalizedInput.type || null,
							registeredAt: now.toISO(),
						},
					};
				}

				const zoneStatus = evaluateCheckInZone({
					empId,
					input: normalizedInput,
				});

				if (!zoneStatus.canCheckIn) {
					return {
						success: false,
						status: zoneStatus.status,
						message: zoneStatus.message,
						checkIn: {
							type: normalizedInput.type,
							registeredAt: now.toISO(),
							geofenceName: zoneStatus.geofenceName,
						},
					};
				}

				let confidentiality;

				if (region === "JRZ" || region === "MTY" || region === "AMX") {
					confidentiality = employee.project_id.trim();
				} else if (region === "SAL" || region === "TIJ") {
					confidentiality = employee.plant_id.trim();
				}

				console.log("Confidentiality is: ", confidentiality);

				const companyResult = await executeParameterizedQuery(
					`
					SELECT TOP 1
						CM_DIGITO AS code
					FROM COMPANY
					WHERE CM_NIVEL0 LIKE @param1
					`,
					[`%${confidentiality}%`],
					"Error fetching company information",
					dbs.comparte,
				);

				console.log("Company result query: ", companyResult);
				const company = companyResult[0];
				if (
					company.code === null ||
					company.code === undefined ||
					company.code.trim() === ""
				) {
					return {
						success: false,
						status: "Información interna incompleta",
						message:
							"No se pudo determinar la información interna del empleado, contactar a soporte.",
						checkIn: {
							type: normalizedInput.type,
							registeredAt: now.toISO(),
						},
					};
				}

				const linxId = getLinxIdByRegion(region);

				// const registerCheckInMock = await executeParameterizedQuery(
				// 	`
				// 	DECLARE @now DATETIME = GETDATE();
				// 	DECLARE @nowclock CHAR(4) = REPLACE(CONVERT(CHAR(5), @now, 108), ':', '');

				// 	SELECT @param1 as PO_LINX,
				// 			@param2 as PO_EMPRESA,
				// 			@param3 as PO_NUMERO,
				// 			@now as PO_FECHA,
				// 			@nowclock as PO_HORA,
				// 			@param4 as PO_LETRA
				// 	`,
				// 	[linxId, company.code, empId.toString().trim(), company.code],
				// 	"Error registering employee check-in",
				// 	dbs.comparte,
				// );

				// console.log("Check-in registration result: ", registerCheckInMock);

				const pendingPoll = await getPendingPollStatus({ empId, dbs });

				if (pendingPoll.hasPendingPoll) {
					return {
						success: false,
						status: "PENDING_POLL",
						message:
							"Tu última checada aún se está procesando. Espera aproximadamente 1 minuto y actualiza tus checadas.",
						checkIn: {
							type: normalizedInput.type,
							registeredAt: now.toISO(),
							geofenceName: null,
						},
					};
				}

				const registerCheckIn = await executeParameterizedQuery(
					`
						DECLARE @now DATETIME = GETDATE();
						DECLARE @startofday DATETIME = CAST(CAST(GETDATE() AS DATE) AS DATETIME);
						DECLARE @nowclock CHAR(4) = REPLACE(CONVERT(CHAR(5), @now, 108), ':', '');

						INSERT INTO POLL(PO_LINX, PO_EMPRESA, PO_NUMERO, PO_FECHA, PO_HORA, PO_LETRA) 
						VALUES(@param1, @param2, @param3, @startofday, @nowclock, @param4)
						`,
					// [linxId, company.code, empId.toString().trim(), company.code],
					[linxId, "W", empId.toString().trim(), "A"],
					"Error registering employee check-in",
					dbs.comparte,
				);

				// get_date					sys_time
				// 2026-07-09 03:48:10.170	2026-07-09 03:48:10.1708139

				return {
					success: true,
					status: "REGISTERED",
					message: shouldBypassGeofence
						? "Check-in validado correctamente."
						: `Check-in validado correctamente en ${zoneStatus.geofenceName}.`,
					checkIn: {
						type: normalizedInput.type,
						registeredAt: now.toISO(),
						geofenceName: shouldBypassGeofence ? "BYPASS" : zoneStatus.geofenceName,
					},
				};
			} catch (err) {
				console.error("handleCheckIn error:", err);

				return {
					success: false,
					status: "ERROR",
					message: "Error al procesar el check-in.",
					checkIn: null,
				};
			}
		}),
		assignSurveys: async (_, { input }) => {
			const { employeeId, surveyId, region } = input;

			if (!employeeId || !surveyId || !region) {
				return {
					success: false,
					message:
						"Invalid input. Please provide employeeId, surveyId, and region.",
				};
			}

			const dbs = await selectRegion(region);

			const code = {};
			switch (region) {
				case "JRZ":
				case "MTY":
				case "AMX":
					code.supervisor = "3";
					code.area = "5";
					code.proyecto = "0";
					code.planta = "7";
					break;
				case "SAL":
				case "TIJ":
					code.supervisor = "8";
					code.proyecto = "5";
					code.area = "6";
					code.planta = "1";
					break;
			}

			try {
				// Logic to assign the survey to the employee
				// This could involve updating a database record, etc.

				return {
					success: true,
					message: "Survey assigned successfully.",
				};
			} catch (error) {
				console.error("Error assigning survey:", error);
				return {
					success: false,
					message: "Failed to assign survey.",
				};
			}
		},
		requestLoan: requireAuth(async (_, { input }, { user }) => {
			// helper: save pdf into /public/loans
			const shardPathFromLoanId = (loanId) => {
				const s = String(loanId).padStart(6, "0");
				return { shard1: s.slice(0, 3), shard2: s.slice(3, 6) };
			};

			const saveLoanPdf = async ({ buffer, loanId }) => {
				const { shard1, shard2 } = shardPathFromLoanId(loanId);

				const relDir = path.join("loans", shard1, shard2);
				const absDir = path.join(__dirname, "../../public", relDir);

				await fs.promises.mkdir(absDir, { recursive: true });

				const fileName = `PrestamoFA_${loanId}.pdf`;
				const absPath = path.join(absDir, fileName);

				const tmpPath = absPath + ".tmp";

				await fs.promises.writeFile(tmpPath, buffer);
				await fs.promises.rename(tmpPath, absPath);

				return {
					pdf_file_name: fileName,
					pdf_relative_path: path.join(relDir, fileName).replaceAll("\\", "/"),
				};
			};

			try {
				if (!user) throw new Error("Unauthorized");

				const { amount, weeks } = input;
				const parsedAmount = Number(amount);
				const parsedWeeks = Number(weeks);

				if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
					return { success: false, message: "Monto inválido." };

				const safeAmount = Number(parsedAmount.toFixed(2));

				const { empId, region } = user;
				const BUSINESS_TZ = "America/Denver";
				const now = DateTime.now().setZone(BUSINESS_TZ);

				// Standard loan rules
				const STANDARD_WEEKLY_INTEREST_RATE = 0.159;

				// H79 special loan rules
				const H79_FIXED_WEEKS = 10;
				const H79_TOTAL_INTEREST_RATE = 3;
				const H79_MAX_TOTAL_RATIO = 0.8;
				const H79_REQUEST_DEADLINE = "2026-09-06";

				const dbs = await selectRegion(region);

				/* ===========================
				   PHASE 1: READ + VALIDATE (NO TX)
				   =========================== */

				// 1) Map NIVEL indices by region
				const code = {};
				switch (region) {
					case "JRZ":
					case "MTY":
					case "AMX":
						code.supervisor = "3";
						code.area = "5";
						code.proyecto = "0";
						code.planta = "7";
						break;
					case "SAL":
					case "TIJ":
						code.supervisor = "8";
						code.proyecto = "5";
						code.area = "6";
						code.planta = "1";
						break;
					default:
						return { success: false, message: "Región no soportada." };
				}

				// 2) Employee details (PARAMETERIZED)
				const userDetails = await executeParameterizedQuery(
					`
					SELECT
						C.CB_CODIGO as employee_id,
						C.CB_NIVEL${code.area}       	AS area_code,
						C.CB_NIVEL${code.supervisor} 	AS supervisor_code,
						C.CB_NIVEL${code.planta}     	AS plant_code,
						C.CB_NIVEL${code.proyecto}   	AS project_code,
						C.CB_TURNO 					AS turn_code,
						C.CB_PUESTO 					AS job_title_code,
						C.CB_CLASIFI 					AS classification,
						C.CB_NOMBRES 					AS first_name,
						C.CB_APE_PAT 					AS last_name_pat,
						C.CB_APE_MAT 					AS last_name_mat,
						RS.RS_NOMBRE 					AS company_name
					FROM COLABORA AS C
					INNER JOIN RPATRON AS RP ON RP.TB_CODIGO = C.CB_PATRON
					INNER JOIN RSOCIAL AS RS ON RS.RS_CODIGO = RP.RS_CODIGO
					WHERE C.CB_CODIGO = @param1
					`,
					[empId],
					"Error fetching user details",
					dbs.colabora,
				);

				if (!userDetails?.length) {
					return {
						success: false,
						message: "Empleado no encontrado para esta región.",
					};
				}

				const u = userDetails[0];
				const projectCode = String(u.project_code || "")
					.trim()
					.toUpperCase();
				const isH79 = projectCode === "H79";

				// H79 always uses 10 weeks. Other projects keep the requested term.
				let safeWeeks;
				if (isH79) {
					safeWeeks = H79_FIXED_WEEKS;
				} else {
					if (!Number.isFinite(parsedWeeks) || !Number.isInteger(parsedWeeks))
						return { success: false, message: "Semanas inválidas." };

					if (parsedWeeks < 2)
						return {
							success: false,
							message: "El plazo mínimo es de 2 semanas.",
						};

					safeWeeks = parsedWeeks;
				}

				// 3) Balance (outside TX)
				const balanceResult = await executeParameterizedQuery(
					`
					SELECT
						SUM(AH.AH_SALDO) * 2 AS SaldoFA
					FROM AHORRO AH
					WHERE AH.CB_CODIGO = @param1
						AND AH.AH_TIPO = '2'
						AND AH.AH_STATUS = 0
						AND AH.AH_FECHA = (
							SELECT MAX(AH_FECHA)
							FROM AHORRO
							WHERE CB_CODIGO = @param1
								AND AH_STATUS = 0
								AND AH_TIPO = '2'
						)
					`,
					[empId],
					"Error fetching balance",
					dbs.colabora,
				);

				const balance = parseFloat(balanceResult?.[0]?.SaldoFA || 0);
				if (!Number.isFinite(balance) || balance <= 0)
					return {
						success: false,
						message: "No fue posible obtener el saldo.",
					};

				const floorToCents = (value) =>
					Math.floor((value + Number.EPSILON) * 100) / 100;

				const minAmount = Number((balance * 0.1).toFixed(2));

				// For H79, principal + 3% interest may not exceed 80% of the balance.
				const maxTotalAllowed = isH79
					? floorToCents(balance * H79_MAX_TOTAL_RATIO)
					: null;

				const maxAmount = isH79
					? floorToCents(maxTotalAllowed / (1 + H79_TOTAL_INTEREST_RATE / 100))
					: Number((balance * 0.9).toFixed(2));

				if (safeAmount < minAmount || safeAmount > maxAmount) {
					return {
						success: false,
						message: `El monto permitido debe estar entre $${minAmount.toFixed(
							2,
						)} y $${maxAmount.toFixed(2)}.`,
					};
				}

				// 4) Cycle config
				const cycleResult = await executeParameterizedQuery(
					`
					SELECT TOP 1 semana_inicial, semana_final
					FROM Prestamos
					ORDER BY fecha DESC
					`,
					[],
					"Error fetching cycle",
					"tecmamovilcentral",
				);

				const initialWeek = Number(cycleResult?.[0]?.semana_inicial);
				const finalWeek = Number(cycleResult?.[0]?.semana_final);

				if (!initialWeek || (!isH79 && !finalWeek))
					return { success: false, message: "No hay periodo configurado." };

				const getFirstSaturday = (year) => {
					let first = DateTime.fromObject(
						{ year, month: 1, day: 1 },
						{ zone: BUSINESS_TZ },
					);
					while (first.weekday !== 6) first = first.plus({ days: 1 });
					return first.startOf("day");
				};

				const firstSaturday = getFirstSaturday(now.year);
				const loanStart = firstSaturday.plus({ weeks: initialWeek - 1 });

				if (isH79) {
					const h79RequestDeadline = DateTime.fromISO(H79_REQUEST_DEADLINE, {
						zone: BUSINESS_TZ,
					}).endOf("day");

					if (now < loanStart || now > h79RequestDeadline) {
						return {
							success: false,
							message:
								"El periodo para solicitar el préstamo H79 finalizó el 6 de septiembre de 2026.",
						};
					}
				} else {
					const loanEnd = firstSaturday
						.plus({ weeks: finalWeek - 1 })
						.endOf("week");

					if (now < loanStart || now > loanEnd)
						return { success: false, message: "Fuera del periodo permitido." };

					const currentWeek =
						Math.floor(now.diff(loanStart, "weeks").weeks) + initialWeek;
					const maxWeeks = finalWeek - currentWeek + 1;

					if (safeWeeks > maxWeeks)
						return { success: false, message: "Semanas exceden el límite." };
				}

				// 5) Old system checks (done OUTSIDE TX)
				const oldRequestedLoan = await executeParameterizedQuery(
					`
					DECLARE @CurrentYear INT = YEAR(GETDATE());
					DECLARE @StartDate DATE = DATEFROMPARTS(@CurrentYear,1,1);
					DECLARE @EndDate DATE = DATEFROMPARTS(@CurrentYear+1,1,1);

					SELECT CASE WHEN EXISTS (
						SELECT 1
						FROM K_Solicitudes
						WHERE Fecha >= @StartDate
							AND Fecha < @EndDate
							AND No = @param1
							AND Carta = 'PtmoFA'
					)
					THEN 'true' ELSE 'false' END AS status;
					`,
					[empId],
					"Error fetching existing loan request (old kioskotek)",
					dbs.kioskotek,
				);

				const oldExistingLoan = await executeParameterizedQuery(
					`
					DECLARE @CurrentYear INT = YEAR(GETDATE());

					SELECT CASE WHEN EXISTS (
						SELECT 1
						FROM PRESTAMO
						WHERE YEAR(PR_FECHA) = @CurrentYear
							AND CB_CODIGO = @param1
							AND PR_TIPO = '4'
					)
					THEN 'true' ELSE 'false' END AS status;
					`,
					[empId],
					"Error fetching existing loan (old colabora)",
					dbs.colabora,
				);

				const oldLoanRequested = oldRequestedLoan?.[0]?.status === "true";
				const oldLoanExists = oldExistingLoan?.[0]?.status === "true";

				if (oldLoanRequested) {
					return {
						success: false,
						message:
							"Tienes una solicitud de préstamo pendiente de aprobación.",
					};
				}
				if (oldLoanExists) {
					return {
						success: false,
						message: "Has solicitado un préstamo y ha sido entregado.",
					};
				}

				// 6) Financial calculations
				// H79 uses a fixed total interest of 3%. Other projects retain
				// the existing weekly rate calculation of 0.159% per week.
				const interestRate = isH79
					? H79_TOTAL_INTEREST_RATE
					: STANDARD_WEEKLY_INTEREST_RATE;

				const interestTotal = Number(
					(isH79
						? (safeAmount * interestRate) / 100
						: (interestRate * safeWeeks * safeAmount) / 100
					).toFixed(2),
				);

				const totalToPay = Number((safeAmount + interestTotal).toFixed(2));

				// Defensive check to guarantee that the rounded H79 total remains
				// at or below 80% of the employee's available balance.
				if (isH79 && totalToPay > maxTotalAllowed) {
					return {
						success: false,
						message: `El total del préstamo con intereses no puede exceder $${maxTotalAllowed.toFixed(
							2,
						)}.`,
					};
				}

				const weeklyDiscount = Number((totalToPay / safeWeeks).toFixed(2));

				/* ===========================
				   PHASE 2: TX (Loans only)
				   - check duplicate
				   - insert + OUTPUT loan_id
				   =========================== */

				const pool = await poolPromises["tecmamovilcentral"];
				const tx = new sql.Transaction(pool);

				let loanId;

				await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
				try {
					// Duplicate check (only NEW Loans)
					const existingLoan = await executeParameterizedQueryTx(
						`
						SELECT TOP 1 loan_id
						FROM Loans WITH (UPDLOCK, HOLDLOCK)
						WHERE employee_id = @param1
							AND YEAR(requested_at) = YEAR(GETDATE())
							AND status IN ('PENDING','APPROVED','ACTIVE')
						ORDER BY requested_at DESC
						`,
						[empId],
						"Error checking existing loan",
						tx,
					);

					if (existingLoan.length > 0) {
						await tx.rollback();
						return {
							success: false,
							message: "Ya existe un préstamo activo este año.",
						};
					}

					// Insert and get loan_id
					const insertResult = await executeParameterizedQueryTx(
						`
						INSERT INTO Loans (
							employee_id,
							employee_name,
							region_id,
							plant_code,
							project_code,
							area_code,
							supervisor_code,
							turn_code,
							job_title_code,
							classification,
							amount,
							weeks,
							interest_rate,
							interest_total,
							total_to_pay,
							weekly_discount,
							status
						)
						OUTPUT INSERTED.loan_id
						VALUES (
							@param1, @param2, @param3, @param4, @param5,
							@param6, @param7, @param8, @param9, @param10,
							@param11, @param12, @param13,
							@param14, @param15, @param16,
							'PENDING'
						)
						`,
						[
							empId,
							`${u.first_name}${u.last_name_pat ? ` ${u.last_name_pat}` : ""}${u.last_name_mat ? ` ${u.last_name_mat}` : ""}`.trim(),
							region === "JRZ"
								? 1
								: region === "SAL"
									? 2
									: region === "MTY"
										? 3
										: region === "TIJ"
											? 4
											: 0,
							u.plant_code,
							u.project_code,
							u.area_code,
							u.supervisor_code,
							u.turn_code,
							u.job_title_code,
							u.classification,
							safeAmount,
							safeWeeks,
							interestRate,
							interestTotal,
							totalToPay,
							weeklyDiscount,
						],
						"Error inserting loan",
						tx,
					);

					loanId = insertResult?.[0]?.loan_id;

					if (!loanId) {
						throw new Error("No loan_id returned from insert.");
					}

					await tx.commit();
				} catch (txErr) {
					try {
						await tx.rollback();
					} catch (_) { }
					console.error("requestLoan TX error:", txErr);
					return { success: false, message: "Error al procesar la solicitud." };
				}

				/* ===========================
				   PHASE 3: PDF (no TX)
				   - generate buffer
				   - save under public/loans
				   - update loan row with pdf metadata
				   =========================== */

				try {
					function formatDateToSpanish(dateString) {
						// Parse the date and convert it to local time
						const localDate = new Date(dateString);
						// console.log("Date string is: ", dateString);
						// console.log("Local date string is: ", localDate);

						const options = {
							year: "numeric",
							month: "long",
							day: "numeric",
							timeZone: "UTC",
						};

						// Get the formatted date string in Spanish (long format for months)
						return localDate.toLocaleDateString("es-ES", options);
					}

					const formattedDate = formatDateToSpanish(new Date());
					const full_name =
						`${u.last_name_pat ? `${u.last_name_pat} ` : ""}${u.last_name_mat ? `${u.last_name_mat}` : ""}${u.last_name_pat || u.last_name_mat ? ", " : ""}${u.first_name}`.trim();

					const pdfData = {
						...u,
						date: formattedDate,
						full_name,
						requested_loan: safeAmount.toFixed(2),
						loan_weeks: safeWeeks.toFixed(2),
						interest: interestTotal.toFixed(2),
						total: totalToPay.toFixed(2),
						weekly_discount: weeklyDiscount.toFixed(2),
					};

					// Logo pick (same as you had it)
					let logoName;
					if ((u.project_code || "").trim() === "H09")
						logoName = "FLEXSTEEL.png";
					else if ((u.project_code || "").trim() === "H75")
						logoName = "CLEAR.png";
					else logoName = "LOGOTECMA.png";

					const imageBase64 = fs
						.readFileSync(
							path.join(__dirname, `../../public/assets/images/${logoName}`),
						)
						.toString("base64");

					pdfData.imageBase64 = imageBase64;

					const fileBuffer = await generateSavingsLoanPDF({ data: pdfData });

					const { pdf_file_name, pdf_relative_path } = await saveLoanPdf({
						buffer: fileBuffer,
						loanId,
					});

					// Update row with PDF metadata (separate query)
					await executeParameterizedQuery(
						`
						UPDATE Loans
						SET pdf_file_name = @param1,
							pdf_relative_path = @param2,
							updated_at = SYSDATETIME()
						WHERE loan_id = @param3
						`,
						[pdf_file_name, pdf_relative_path, loanId],
						"Error updating loan PDF metadata",
						"tecmamovilcentral",
					);
				} catch (pdfErr) {
					console.error("PDF generation/save error:", pdfErr);

					// Optional: store note so admin can re-generate later
					await executeParameterizedQuery(
						`
						UPDATE Loans
						SET notes = LEFT(CONCAT(ISNULL(notes,''), ' | PDF_ERROR: ', @param1), 250),
							updated_at = SYSDATETIME()
						WHERE loan_id = @param2
						`,
						[String(pdfErr?.message || "PDF error"), loanId],
						"Error updating loan note",
						"tecmamovilcentral",
					);

					// Still treat the loan request as created; PDF can be regenerated later
				}

				return {
					success: true,
					message: "Solicitud registrada correctamente.",
				};
			} catch (err) {
				console.error("requestLoan error:", err);
				return { success: false, message: "Error al procesar la solicitud." };
			}
		}),
		testMutation: async () => {
			return "Done";
		},
		requestAbsence: requireAuth(async (_, { input }, { user }) => {
			const REQUEST_TYPE = {
				PERMISO: 1,
				VACACIONES: 2,
			};

			const ABSENCE_STATUS = {
				PENDING: 1,
				PRE_APPROVED: 2,
				APPROVED: 3,
				REJECTED: 4,
				CANCELLED: 5,
			};

			const SUPERVISOR_ACTION = {
				APPROVE: "approve",
				REJECT: "reject",
			};

			const toSqlDate = (value) => {
				if (!value) return null;

				const date = new Date(value);

				if (Number.isNaN(date.getTime())) {
					throw new Error(`Invalid date value: ${value}`);
				}

				return date.toISOString().split("T")[0];
			};

			const normalizeOptionalString = (value) => {
				if (value === undefined || value === null) return null;

				const trimmed = value.toString().trim();

				return trimmed === "" ? null : trimmed;
			};

			const normalizeId = (value) => {
				if (value === undefined || value === null) return null;

				const trimmed = value.toString().trim();

				return trimmed === "" ? null : trimmed;
			};

			const getRegionLevelConfig = (region) => {
				switch (region?.toUpperCase()) {
					case "JRZ":
					case "MTY":
					case "AMX":
						return {
							supervisor: "3",
							area: "5",
							project: "0",
							plant: "7",
						};

					case "SAL":
					case "TIJ":
						return {
							supervisor: "8",
							project: "5",
							area: "6",
							plant: "1",
						};

					default:
						throw new Error(`Unsupported region: ${region}`);
				}
			};

			const getRegionIdByCode = async ({ dbs, region }) => {
				const regionData = await executeParameterizedQuery(
					`
		SELECT TOP 1
			region_id AS RegionId
		FROM dbo.Regions
		WHERE region_code = @param1
		`,
					[region],
					"Error fetching region information",
					dbs.tecmamovil,
				);

				if (!regionData || regionData.length === 0) {
					return null;
				}

				return regionData[0].RegionId;
			};
			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;

				if (!empId) {
					return {
						success: false,
						message: "No se pudo identificar al empleado desde el token.",
					};
				}

				if (!region) {
					return {
						success: false,
						message: "No se pudo identificar la región desde el token.",
					};
				}

				const { type, start_date, end_date, days, motive, comment } = input;

				console.log("RequestAbsence input:", JSON.stringify(input, null, 1));

				if (type == null || !start_date || days == null) {
					return {
						success: false,
						message: "Input is invalid. Please provide all required fields.",
					};
				}

				if (days <= 0) {
					return {
						success: false,
						message: "Los días solicitados deben ser mayores a cero.",
					};
				}

				if (type === REQUEST_TYPE.PERMISO && !motive) {
					return {
						success: false,
						message: "Las solicitudes de permiso requieren motivo.",
					};
				}

				if (type === REQUEST_TYPE.VACACIONES && motive != null) {
					return {
						success: false,
						message: "Las solicitudes de vacaciones no deben incluir motivo.",
					};
				}

				const dbs = await selectRegion(region);
				const normalizedRegion = region.toString().trim().toUpperCase();

				const regionId = await getRegionIdByCode({
					dbs,
					region: normalizedRegion,
				});

				if (!regionId) {
					return {
						success: false,
						message: "No se encontró la región del empleado.",
					};
				}

				const code = getRegionLevelConfig(normalizedRegion);

				const startDateSQL = toSqlDate(start_date);
				const endDateSQL = toSqlDate(end_date || start_date);

				const requestTypeData = await executeParameterizedQuery(
					`
			SELECT TOP 1
				RequestTypeId
			FROM dbo.AbsenceRequestTypes
			WHERE RequestTypeId = @param1
			  AND IsActive = 1
			`,
					[type],
					"Error validating absence request type",
					dbs.tecmamovil,
				);

				if (!requestTypeData || requestTypeData.length === 0) {
					return {
						success: false,
						message: "El tipo de solicitud no es válido.",
					};
				}

				if (type === REQUEST_TYPE.PERMISO) {
					const reasonData = await executeParameterizedQuery(
						`
				SELECT TOP 1
					ReasonId
				FROM dbo.AbsenceRequestReasons
				WHERE ReasonId = @param1
				  AND RequestTypeId = @param2
				  AND IsActive = 1
				`,
						[motive, type],
						"Error validating absence request reason",
						dbs.tecmamovil,
					);

					if (!reasonData || reasonData.length === 0) {
						return {
							success: false,
							message: "El motivo de la solicitud no es válido.",
						};
					}
				}

				const employeeData = await executeParameterizedQuery(
					`
			SELECT TOP 1
				C.CB_CODIGO AS EmployeeId,

				LTRIM(RTRIM(CONCAT(
					ISNULL(C.CB_APE_PAT, ''),
					' ',
					ISNULL(C.CB_APE_MAT, ''),
					', ',
					ISNULL(C.CB_NOMBRES, '')
				))) AS EmployeeName,

				C.CB_NIVEL${code.plant} AS PlantId,
				C.CB_NIVEL${code.project} AS ProjectId,
				C.CB_NIVEL${code.area} AS AreaId,

				C.CB_NIVEL${code.supervisor} AS SupervisorPayrollId,
				N3.TB_NUMERO AS SupervisorAppId,

				C.CB_TURNO AS TurnId,
				C.CB_PUESTO AS JobTitleId,
				C.CB_CLASIFI AS ClassificationId
			FROM COLABORA AS C
			LEFT JOIN NIVEL3 AS N3
				ON C.CB_NIVEL${code.supervisor} = N3.TB_CODIGO
			WHERE C.CB_CODIGO = @param1
			`,
					[empId],
					"Error fetching employee information",
					dbs.colabora,
				);

				if (!employeeData || employeeData.length === 0) {
					return {
						success: false,
						message: "No se encontró información del empleado.",
					};
				}

				const employee = employeeData[0];

				await executeParameterizedQuery(
					`
			INSERT INTO dbo.AbsenceRequests (
				EmployeeId,
				EmployeeName,
				RegionId,
				RequestTypeId,
				StatusId,
				ReasonId,
				StartDate,
				EndDate,
				TotalDays,
				EmployeeComment,
				SupervisorPayrollId,
				SupervisorAppId,
				PlantId,
				ProjectId,
				AreaId,
				TurnId,
				JobTitleId,
				ClassificationId
			)
			VALUES (
				@param1,
				@param2,
				@param3,
				@param4,
				@param5,
				@param6,
				@param7,
				@param8,
				@param9,
				@param10,
				@param11,
				@param12,
				@param13,
				@param14,
				@param15,
				@param16,
				@param17,
				@param18
			);
			`,
					[
						normalizeId(employee.EmployeeId),
						employee.EmployeeName?.toString().trim() || "",
						regionId,
						type,
						ABSENCE_STATUS.PENDING,
						type === REQUEST_TYPE.PERMISO ? motive : null,
						startDateSQL,
						endDateSQL,
						days,
						normalizeOptionalString(comment),
						normalizeId(employee.SupervisorPayrollId),
						normalizeId(employee.SupervisorAppId),
						normalizeId(employee.PlantId),
						normalizeId(employee.ProjectId),
						normalizeId(employee.AreaId),
						normalizeId(employee.TurnId),
						normalizeId(employee.JobTitleId),
						normalizeId(employee.ClassificationId),
					],
					"Error registering absence request",
					dbs.tecmamovil,
				);

				return {
					success: true,
					message: "Se registró la solicitud correctamente.",
				};
			} catch (error) {
				console.error("Request absence caught error:", error);

				return {
					success: false,
					message: "Ocurrió un error al registrar la solicitud.",
				};
			}
		}),
		cancelAbsenceRequest: requireAuth(async (_, { input }, { user }) => {
			const REQUEST_TYPE = {
				PERMISO: 1,
				VACACIONES: 2,
			};

			const ABSENCE_STATUS = {
				PENDING: 1,
				PRE_APPROVED: 2,
				APPROVED: 3,
				REJECTED: 4,
				CANCELLED: 5,
			};

			const SUPERVISOR_ACTION = {
				APPROVE: "approve",
				REJECT: "reject",
			};

			const toSqlDate = (value) => {
				if (!value) return null;

				const date = new Date(value);

				if (Number.isNaN(date.getTime())) {
					throw new Error(`Invalid date value: ${value}`);
				}

				return date.toISOString().split("T")[0];
			};

			const normalizeOptionalString = (value) => {
				if (value === undefined || value === null) return null;

				const trimmed = value.toString().trim();

				return trimmed === "" ? null : trimmed;
			};

			const normalizeId = (value) => {
				if (value === undefined || value === null) return null;

				const trimmed = value.toString().trim();

				return trimmed === "" ? null : trimmed;
			};

			const getRegionLevelConfig = (region) => {
				switch (region?.toUpperCase()) {
					case "JRZ":
					case "MTY":
					case "AMX":
						return {
							supervisor: "3",
							area: "5",
							project: "0",
							plant: "7",
						};

					case "SAL":
					case "TIJ":
						return {
							supervisor: "8",
							project: "5",
							area: "6",
							plant: "1",
						};

					default:
						throw new Error(`Unsupported region: ${region}`);
				}
			};

			const getRegionIdByCode = async ({ dbs, region }) => {
				const regionData = await executeParameterizedQuery(
					`
		SELECT TOP 1
			region_id AS RegionId
		FROM dbo.Regions
		WHERE region_code = @param1
		`,
					[region],
					"Error fetching region information",
					dbs.tecmamovil,
				);

				if (!regionData || regionData.length === 0) {
					return null;
				}

				return regionData[0].RegionId;
			};
			try {
				if (!user) throw new Error("Unauthorized");

				const { empId, region } = user;
				const { request_id, comment } = input;

				if (!empId) {
					return {
						success: false,
						message: "No se pudo identificar al empleado desde el token.",
					};
				}

				if (!region) {
					return {
						success: false,
						message: "No se pudo identificar la región desde el token.",
					};
				}

				if (!request_id) {
					return {
						success: false,
						message: "No se recibió la solicitud a cancelar.",
					};
				}

				const dbs = await selectRegion(region);
				const normalizedRegion = region.toString().trim().toUpperCase();

				const regionId = await getRegionIdByCode({
					dbs,
					region: normalizedRegion,
				});

				if (!regionId) {
					return {
						success: false,
						message: "No se encontró la región del empleado.",
					};
				}

				const requestData = await executeParameterizedQuery(
					`
			SELECT TOP 1
				AbsenceRequestId,
				EmployeeId,
				StatusId
			FROM dbo.AbsenceRequests
			WHERE AbsenceRequestId = @param1
			  AND RegionId = @param2
			`,
					[request_id, regionId],
					"Error fetching absence request",
					dbs.tecmamovil,
				);

				if (!requestData || requestData.length === 0) {
					return {
						success: false,
						message: "No se encontró la solicitud.",
					};
				}

				const request = requestData[0];

				if (normalizeId(request.EmployeeId) !== normalizeId(empId)) {
					return {
						success: false,
						message: "Solo el empleado que creó la solicitud puede cancelarla.",
					};
				}

				if (
					request.StatusId === ABSENCE_STATUS.APPROVED ||
					request.StatusId === ABSENCE_STATUS.REJECTED ||
					request.StatusId === ABSENCE_STATUS.CANCELLED
				) {
					return {
						success: false,
						message: "La solicitud ya fue finalizada y no puede cancelarse.",
					};
				}

				await executeParameterizedQuery(
					`
			UPDATE dbo.AbsenceRequests
			SET
				StatusId = @param1,
				CancelledAt = SYSDATETIME(),
				CancellationComment = @param2
			WHERE AbsenceRequestId = @param3
			  AND EmployeeId = @param4
			  AND RegionId = @param5
			  AND StatusId IN (@param6, @param7)
			`,
					[
						ABSENCE_STATUS.CANCELLED,
						normalizeOptionalString(comment),
						request_id,
						normalizeId(empId),
						regionId,
						ABSENCE_STATUS.PENDING,
						ABSENCE_STATUS.PRE_APPROVED,
					],
					"Error cancelling absence request",
					dbs.tecmamovil,
				);

				return {
					success: true,
					message: "La solicitud fue cancelada correctamente.",
				};
			} catch (error) {
				console.error("Error cancelling absence request:", error);

				return {
					success: false,
					message: "Ocurrió un error al cancelar la solicitud.",
				};
			}
		}),
		handleSupervisorAbsenceRequest: requireAuth(
			async (_, { input }, { user }) => {
				const REQUEST_TYPE = {
					PERMISO: 1,
					VACACIONES: 2,
				};

				const ABSENCE_STATUS = {
					PENDING: 1,
					PRE_APPROVED: 2,
					APPROVED: 3,
					REJECTED: 4,
					CANCELLED: 5,
				};

				const SUPERVISOR_ACTION = {
					APPROVE: "approve",
					REJECT: "reject",
				};

				const toSqlDate = (value) => {
					if (!value) return null;

					const date = new Date(value);

					if (Number.isNaN(date.getTime())) {
						throw new Error(`Invalid date value: ${value}`);
					}

					return date.toISOString().split("T")[0];
				};

				const normalizeOptionalString = (value) => {
					if (value === undefined || value === null) return null;

					const trimmed = value.toString().trim();

					return trimmed === "" ? null : trimmed;
				};

				const normalizeId = (value) => {
					if (value === undefined || value === null) return null;

					const trimmed = value.toString().trim();

					return trimmed === "" ? null : trimmed;
				};

				const getRegionLevelConfig = (region) => {
					switch (region?.toUpperCase()) {
						case "JRZ":
						case "MTY":
						case "AMX":
							return {
								supervisor: "3",
								area: "5",
								project: "0",
								plant: "7",
							};

						case "SAL":
						case "TIJ":
							return {
								supervisor: "8",
								project: "5",
								area: "6",
								plant: "1",
							};

						default:
							throw new Error(`Unsupported region: ${region}`);
					}
				};

				const getRegionIdByCode = async ({ dbs, region }) => {
					const regionData = await executeParameterizedQuery(
						`
		SELECT TOP 1
			region_id AS RegionId
		FROM dbo.Regions
		WHERE region_code = @param1
		`,
						[region],
						"Error fetching region information",
						dbs.tecmamovil,
					);

					if (!regionData || regionData.length === 0) {
						return null;
					}

					return regionData[0].RegionId;
				};
				try {
					if (!user) throw new Error("Unauthorized");

					const { empId, region } = user;
					const { request_id, action, comment } = input;

					if (!empId) {
						return {
							success: false,
							message: "No se pudo identificar al supervisor desde el token.",
						};
					}

					if (!region) {
						return {
							success: false,
							message: "No se pudo identificar la región desde el token.",
						};
					}

					if (!request_id || !action) {
						return {
							success: false,
							message: "Input is invalid. Please provide all required fields.",
						};
					}

					const dbs = await selectRegion(region);
					const normalizedRegion = region.toString().trim().toUpperCase();
					const normalizedAction = action.toString().trim().toLowerCase();
					const normalizedComment = normalizeOptionalString(comment);

					const regionId = await getRegionIdByCode({
						dbs,
						region: normalizedRegion,
					});

					if (!regionId) {
						return {
							success: false,
							message: "No se encontró la región del supervisor.",
						};
					}

					if (
						normalizedAction !== SUPERVISOR_ACTION.APPROVE &&
						normalizedAction !== SUPERVISOR_ACTION.REJECT
					) {
						return {
							success: false,
							message: "Acción de supervisor no válida.",
						};
					}

					const requestData = await executeParameterizedQuery(
						`
			SELECT TOP 1
				AbsenceRequestId,
				EmployeeId,
				StatusId,
				SupervisorAppId
			FROM dbo.AbsenceRequests
			WHERE AbsenceRequestId = @param1
			  AND RegionId = @param2
			`,
						[request_id, regionId],
						"Error fetching absence request",
						dbs.tecmamovil,
					);

					if (!requestData || requestData.length === 0) {
						return {
							success: false,
							message: "No se encontró la solicitud.",
						};
					}

					const request = requestData[0];

					if (!request.SupervisorAppId) {
						return {
							success: false,
							message: "Esta solicitud no tiene supervisor asignado en la app.",
						};
					}

					if (normalizeId(request.SupervisorAppId) !== normalizeId(empId)) {
						return {
							success: false,
							message: "No tienes autorización para procesar esta solicitud.",
						};
					}

					if (request.StatusId !== ABSENCE_STATUS.PENDING) {
						return {
							success: false,
							message: "Solo se pueden procesar solicitudes pendientes.",
						};
					}

					if (normalizedAction === SUPERVISOR_ACTION.APPROVE) {
						await executeParameterizedQuery(
							`
				UPDATE dbo.AbsenceRequests
				SET
					StatusId = @param1,
					PreApprovedBySupervisorAppId = @param2,
					PreApprovedAt = SYSDATETIME(),
					SupervisorComment = @param3
				WHERE AbsenceRequestId = @param4
				  AND RegionId = @param5
				  AND SupervisorAppId = @param6
				  AND StatusId = @param7
				`,
							[
								ABSENCE_STATUS.PRE_APPROVED,
								normalizeId(empId),
								normalizedComment,
								request_id,
								regionId,
								normalizeId(empId),
								ABSENCE_STATUS.PENDING,
							],
							"Error pre-approving absence request",
							dbs.tecmamovil,
						);

						return {
							success: true,
							message: "La solicitud fue pre-aprobada correctamente.",
						};
					}

					if (normalizedAction === SUPERVISOR_ACTION.REJECT) {
						await executeParameterizedQuery(
							`
				UPDATE dbo.AbsenceRequests
				SET
					StatusId = @param1,
					RejectedBySupervisorAppId = @param2,
					RejectedAt = SYSDATETIME(),
					SupervisorComment = @param3
				WHERE AbsenceRequestId = @param4
				  AND RegionId = @param5
				  AND SupervisorAppId = @param6
				  AND StatusId = @param7
				`,
							[
								ABSENCE_STATUS.REJECTED,
								normalizeId(empId),
								normalizedComment,
								request_id,
								regionId,
								normalizeId(empId),
								ABSENCE_STATUS.PENDING,
							],
							"Error rejecting absence request",
							dbs.tecmamovil,
						);

						return {
							success: true,
							message: "La solicitud fue rechazada correctamente.",
						};
					}

					return {
						success: false,
						message: "No se definió una acción válida.",
					};
				} catch (error) {
					console.error("Error handling supervisor absence request:", error);

					return {
						success: false,
						message: "Ocurrió un error al procesar la solicitud.",
					};
				}
			},
		),
	},
};

module.exports = resolvers;
