const {
	executeQuery,
	executeParameterizedQuery,
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
			};
		}
		case "AMX": {
			return {
				kioskotek: "kioskoamx",
				colabora: "amxpro",
				tecmamovil: "tecmamovilcentral",
				tecma_csa: "tecma_csa",
			};
		}
		case "SAL":
		case "TIJ": {
			return {
				kioskotek: "kioskowest",
				colabora: "tecmawest",
				tecmamovil: "tecmamovilwest",
			};
		}
		default:
			throw new Error("La región especificada no existe");
	}
};

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

				platform = String(platform || "").trim().toLowerCase();
				currVer = String(currVer || "").trim();

				if (!["ios", "android"].includes(platform)) {
					throw new Error("Invalid platform.");
				}

				const parsedCurrent = parseVersion(currVer);
				if (!parsedCurrent) {
					throw new Error(
						"Invalid currVer format. Expected values like 1.1.5 or 1.1.5dev."
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
					const parsedDbVersion = parseVersion(String(row.id_version || "").trim());

					// Ignore malformed DB rows instead of crashing
					if (!parsedDbVersion) return false;

					return compareVersions(parsedDbVersion, parsedCurrent) > 0;
				});

				if (newerVersions.length > 0) {
					const important = newerVersions.some(
						(version) => Number(version.relevancia) >= 3
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
			if (numEmp !== "900874") {
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
						CB_V_GOZO as TOMADOS
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
					disponibles: returnValue(
						(
							parseFloat(query[0].GANADOS) - parseFloat(query[0].TOMADOS)
						).toFixed(2),
					),
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
			const dbs = await selectRegion(region);
			const queryPeriodosBloqueo = await executeQuery(
				`Select Periodo
				From K_NomBloqueo 
				Where Proyecto = '${proy}' 
				And Anio = '${year}'
				And Fecha >= GetDate()`,
				"Error fetching bloqueo information",
				dbs.kioskotek,
			);
			const periodosBloqueoArray = queryPeriodosBloqueo.map(
				(row) => row.Periodo,
			);
			const periodosBloqueo = periodosBloqueoArray.join(", ");

			const recibos = await executeQuery(
				`Select	NOM.PE_NUMERO As nomina,
						NOM.NO_PERCEPC As percepciones,
						NOM.NO_DEDUCCI  As deducciones,
						NOM.NO_NETO As neto,
						PER.PE_FEC_FIN As fecha
				From NOMINA As NOM
				Inner Join PERIODO As PER
				On NOM.PE_YEAR = PER.PE_YEAR
				And NOM.PE_TIPO = PER.PE_TIPO
				And NOM.PE_NUMERO = PER.PE_NUMERO
				Where NOM.PE_YEAR = '${year}' 
				And CB_CODIGO = '${numEmp}' 
				And NOM.PE_NUMERO < 950
				And NO_STATUS>= 5
				And GETDATE() > PE_FEC_FIN + 5
				${periodosBloqueo !== "" ? `And NOM.PE_NUMERO Not In (${periodosBloqueo})` : ""}
				Order by NOM.PE_NUMERO Desc`,
				"Error fetching bloqueo information",
				dbs.colabora,
			);
			// console.log("Recibos a retornar: ", recibos);
			// const recibos = recibosQuery.recordset;
			// console.log("Recibos: ", recibosQuery);
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
				const max_weeks = final_week - current_week + 1;

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
					From Polizas`,
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
		SuperiorRequests: async (_, { numEmp, region }) => {
			const dbs = await selectRegion(region);

			// const supervisorData = await executeQuery(
			// 	`SELECT TB_CODIGO as supervisor_id,
			// 			TB_TEXTO as superior_id
			// 	FROM NIVEL3
			// 	WHERE TB_NUMERO = '${numEmp}'`,
			// 	"Error fetching supervisor information",
			// 	dbs.colabora
			// );

			// console.log("Supervisor data: ", supervisorData[0])

			const motives = await executeQuery(
				`SELECT * FROM motivos_solicitud`,
				"Error fetching motives information",
				dbs.tecmamovil,
			);

			// console.log("\nMotives: ", motives)

			const statuses = await executeQuery(
				`SELECT * FROM estados_solicitud`,
				"Error fetching statuses information",
				dbs.tecmamovil,
			);

			// console.log("\Statuses: ", statuses)

			const supervisorRequests = await executeQuery(
				`SELECT [id_solicitud] as id
						,[id_empleado] as numEmp
						,[tipo_solicitud] as type
						,[estado] as status
						,[fecha_inicio] as start_date
						,[fecha_fin] as end_date
						,[fecha_solicitud] as request_date
						,[dias_totales] as total_days
						,[id_motivo] as motive
						,[comentario_empleado] as comment
						,[pre_aprobado_por] as pre_approved_by
						,[fecha_pre_aprobacion] as pre_approval_date
						,[aprobado_por] as approved_by
						,[fecha_aprobacion] as approval_date
						,[comentario_aprobador] as approver_comment
						,[rechazada_por] as rejected_by
						,[fecha_rechazo] as rejection_date
						,[cancelada_por] as  cancelled_by
						,[fecha_cancelacion] as cancellation_date
					FROM solicitudes_ausencia
					WHERE autoriza = '${numEmp}'`,
				"Error fetching supervisor information",
				dbs.tecmamovil,
			);

			console.warn("\n\nSupervisor requests: ", supervisorRequests);

			// Create maps for fast lookup
			const motiveMap = {};
			const statusMap = {};

			motives.forEach((m) => (motiveMap[m.id_motivo] = m.descripcion));
			statuses.forEach((s) => (statusMap[s.id_estado] = s.descripcion));

			// Replace codes with descriptions
			const formattedRequests = supervisorRequests.map((request) => ({
				...request,
				motive:
					request.motive_id !== null ? motiveMap[request.motive_id] : null,
				status: statusMap[request.status],
			}));

			// Create a cache for employee names to avoid repeated queries
			const employeeNameCache = {};

			// For each request, fetch the full name based on numEmp, using the cache if available.
			for (let request of formattedRequests) {
				if (!employeeNameCache[request.numEmp]) {
					const userFullName = await executeQuery(
						`SELECT CB_NOMBRES as names,
								CB_APE_PAT as surname_1,
								CB_APE_MAT as surname_2
						FROM COLABORA 
						WHERE CB_CODIGO = '${request.numEmp}'`,
						"Error fetching user name info",
						dbs.colabora,
					);

					if (userFullName && userFullName.length > 0) {
						const { names, surname_1, surname_2 } = userFullName[0];
						employeeNameCache[request.numEmp] =
							`${names} ${surname_1} ${surname_2}`;
					} else {
						employeeNameCache[request.numEmp] = null;
					}
				}
				// Append the full name to the request entry
				request.name = employeeNameCache[request.numEmp];
			}

			return { success: true, message: "Done", data: formattedRequests };
			if (isSupervisor[0].result && numEmp !== 0 && numEmp !== "0") {
				const activeEmployees = await executeQuery(
					`SELECT CB_CODIGO as employeeNum
						FROM COLABORA
						WHERE CB_NIVEL3 = '${isSupervisor[0].result.trim()}'
						AND CB_ACTIVO = 'S'`,
					"Error fetching employees information",
					dbs.colabora,
				);

				if (activeEmployees && activeEmployees.length > 0) {
					console.log("Active employees under supervisor: ", activeEmployees);
					const employeeNums = activeEmployees
						.map((emp) => `'${emp.employeeNum}'`) // wrap each number in single quotes
						.join(", ");

					console.log("Employee numbers: ", employeeNums);

					const employeeRequests = await executeQuery(
						`SELECT No as numEmp, Nombre as name, Carta as type
							FROM K_Solicitudes
							WHERE No IN (${employeeNums})
							AND Pendiente = '0'
							AND (Carta = 'Vacaciones'
							or Carta = 'Permiso')`,
						"Error fetching employee requests information",
						dbs.kioskotek,
					);
					if (employeeRequests && employeeRequests.length > 0) {
						return {
							success: true,
							message: "Available requests",
							data: employeeRequests,
						};
					} else {
						return { success: true, message: "No requests" };
					}
					console.log("Employee requests: ", employeeRequests);
				}
				return { success: true, message: "Done" };
			} else {
				return { success: false, message: "Done" };
			}
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
						: "http://10.3.3.218:8083";

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

				// 1️⃣ Fetch employee details
				const userDetails = await executeParameterizedQuery(
					`
					SELECT 
						CB_CODIGO AS employee_id,
						CB_CLASIFI AS classification
					FROM COLABORA
					WHERE CB_CODIGO = @param1
					`,
					[empId],
					"Error fetching user details",
					dbs.colabora,
				);

				console.log("User details are: ", userDetails[0]);

				if (!userDetails || userDetails.length === 0) {
					return {
						success: false,
						message: "Empleado no encontrado.",
					};
				}

				// 2️⃣ Fetch savings balance
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

				console.log("Balance result: ", balanceResult[0]);

				const balance = parseFloat(balanceResult?.[0]?.SaldoFA || 0);

				let isAllowed = false;
				let reason = null;
				let maxWeeks = 0;

				// 3️⃣ Check existing loan
				const existingLoan = await executeParameterizedQuery(
					`
					SELECT TOP 1 status
					FROM Loans
					WHERE employee_id = @param1
						AND YEAR(requested_at) = YEAR(GETDATE())
						-- AND status IN ('PENDING','APPROVED','ACTIVE', 'REJECTED', 'COMPLETED')
					ORDER BY requested_at DESC
					`,
					[empId],
					"Error checking existing loan",
					"tecmamovilcentral",
				);

				const oldRequestedLoan = await executeQuery(
					`DECLARE @CurrentYear INT = YEAR(GETDATE());
					DECLARE @StartDate DATE = DATEFROMPARTS(@CurrentYear,1,1);
					DECLARE @EndDate DATE = DATEFROMPARTS(@CurrentYear+1,1,1);

					DECLARE @Exists NVARCHAR(5);

					SET @Exists = (
						SELECT CASE 
							WHEN EXISTS (
								SELECT 1
								FROM K_Solicitudes
								WHERE Fecha >= @StartDate
								AND Fecha < @EndDate
								AND Carta = 'PtmoFA'
								AND No = ${empId}
							)
							THEN 'true'
							ELSE 'false'
						END
					);

					SELECT @Exists AS status;`,
					"Error fetching existing loan k",
					dbs.kioskotek,
				);

				const oldExistingLoan = await executeQuery(
					`Declare @CurrentYear INT = YEAR(GETDATE());
						Declare @Exists NVARCHAR(5);
		
						Set @Exists = (
							Select Case 
								When Exists (
									Select 1
									From PRESTAMO
									Where YEAR(PR_FECHA) = @CurrentYear
									And CB_CODIGO = ${empId}
									And PR_TIPO = '4'
								) Then 'true'
								Else 'false'
							End
						);
		
						Select 
							@Exists As status`,
					"Error fetching prenomina days information",
					dbs.colabora,
				);

				let loanStatus = existingLoan?.[0]?.status || null;

				const oldLoanRequested =
					oldRequestedLoan[0].status === "true" ? true : false;

				if (oldLoanRequested) {
					isAllowed = false;
					loanStatus = "PENDING";
					// reason = "Tienes una solicitud de préstamo pendiente de aprobación.";
				}

				const oldLoanExists =
					oldExistingLoan[0].status === "true" ? true : false;

				if (oldLoanExists) {
					isAllowed = false;
					loanStatus = "COMPLETED";
					// reason = "Has solicitado un préstamo y ha sido entregado.";
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
					// console.log("Evaluating loan status: ", loanStatus);
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
						case "REJECTED":
							isAllowed = false;
							reason = "Tienes una solicitud de préstamo rechazada.";
							break;
						case "COMPLETED":
							isAllowed = false;
							reason = "Has solicitado un préstamo y ha sido entregado.";
							break;
						default:
							break;
					}
				} else {
					isAllowed = true;
					reason = "No tienes solicitudes de préstamo activas.";
				}

				// 4️⃣ Fetch loan cycle config
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

				console.log("Loan cycle config: ", cycleResult[0]);

				const initialWeek = cycleResult[0]?.semana_inicial;
				const finalWeek = cycleResult[0]?.semana_final;

				function getFirstSaturday(year) {
					let first = DateTime.fromObject(
						{ year, month: 1, day: 1 },
						{ zone: BUSINESS_TZ },
					);
					while (first.weekday !== 6) {
						first = first.plus({ days: 1 });
					}
					return first.startOf("day");
				}

				const firstSaturday = getFirstSaturday(now.year);
				const loanStart = firstSaturday.plus({ weeks: initialWeek - 1 });
				const loanEnd = firstSaturday
					.plus({ weeks: finalWeek - 1 })
					.endOf("week");

				if (isAllowed && (now < loanStart || now > loanEnd)) {
					isAllowed = false;
					reason =
						"No se encuentra dentro del periodo permitido para préstamos.";
				}

				if (isAllowed) {
					console.log(
						`Current week of the year: ${now.weekNumber}, Loan start week: ${loanStart.weekNumber}, Loan end week: ${loanEnd.weekNumber}`,
					);
					const currentWeek =
						Math.floor(now.diff(loanStart, "weeks").weeks) + initialWeek;

					maxWeeks = finalWeek - currentWeek + 1;

					if (maxWeeks < 2) {
						isAllowed = false;
						reason = "El periodo restante no permite un mínimo de 2 semanas.";
					}
				}

				const interestRate = 0.159; // Replace later with config table

				const minAmount = parseFloat((balance * 0.1).toFixed(2));
				const maxAmount = parseFloat((balance * 0.9).toFixed(2));

				console.log("Loan eligibility data: ", {
					isAllowed,
					reason,
					balance,
					minAmount,
					maxAmount,
					maxWeeks,
					interestRate,
					loanStatus,
					loanStart: loanStart.toISO(),
					loanEnd: loanEnd.toISO(),
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
						interestRate,
						loanStatus,
						cycle: {
							startDate: loanStart.toISO(),
							endDate: loanEnd.toISO(),
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

					if (!loan_id)
						throw new Error("loan_id required");

					const result = await executeParameterizedQuery(
						`
        SELECT 
            pdf_relative_path,
            employee_id,
            requested_at
        FROM Loans
        WHERE loan_id = @loan_id
        `,
						[
							{ name: "loan_id", type: sql.Int, value: loan_id }
						]
					);

					if (!result.length)
						throw new Error("Loan not found");

					const loan = result[0];

					const filePath = path.join(
						process.cwd(),
						loan.pdf_relative_path
					);

					if (!fs.existsSync(filePath))
						throw new Error("Loan file not found");

					const fileBuffer = fs.readFileSync(filePath);

					/* -----------------------------
					   Generate better filename
					----------------------------- */

					const timestamp = DateTime.fromJSDate(loan.requested_at)
						.toFormat("yyyyLLddHHmm");

					const filename = `Prestamo_${loan.employee_id}_${timestamp}.pdf`;

					return {
						success: true,
						filename,
						file: fileBuffer.toString("base64")
					};

				} catch (error) {

					console.error("Loan file download error:", error);
					throw new Error("Failed to download loan file");

				}
			}
		),
		RequestLoanDownloadURL: requireServiceAuth("loans:read")(
			async (_, { loan_id }) => {
				console.log("Requesting download URL for loan_id: ", loan_id);

				try {
					const result = await executeParameterizedQuery(`
						SELECT pdf_relative_path
						FROM Loans
						WHERE loan_id = @param1
					`, [loan_id], "Error fetching Loan relative path", "tecmamovilcentral");

					console.log("Result is: ", result)

					if (!result.length)
						return {
							success: false,
							message: "Loan not found"
						};
					const token = jwt.sign(
						{
							loan_id,
							scope: "loan_download"
						},
						process.env.FILE_DOWNLOAD_SECRET,
						{
							expiresIn: "60s"
						}
					);

					const download_url = `${process.env.TMC_API_BASE}/download/loan?token=${token}`
					console.log("Download URL is: ", download_url)
					return {
						success: true,
						message: "File found and URL retrieved",
						download_url
					};
				} catch (error) {
					console.log("Error generating loan download URL: ", error);
					return {
						success: false,
						message: "Error generating download URL"
					};
				}

			}
		),
		PrivacyNoticeEligibility: requireAuth(
			async (_, __, { user }) => {
				if (!user) return {
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
					dbs.colabora
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

					const allowedAreaIds = [
						"66-002",
						"02-004",
						"02-003",
					];

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
			}
		),
		PrivacyNoticeURL: requireAuth(
			async (_, __, { user }) => {
				if (!user) return {
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
					dbs.colabora
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
					console.log("Allowed")
				} else {
					if (!allowedProjectIds.includes(projectId)) {
						return {
							success: false,
							message: "Empleado no autorizado para este proyecto",
						};
					}

					const allowedAreaIds = [
						"66-002",
						"02-004",
						"02-003",
					];

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
						areaId
					},
					fileKey,
					{ expiresIn: "2m" }
				);

				const base =
					process.env.HOST === "PRODUCTION"
						? "https://api.tecmamovilconnect.com"
						: "http://10.3.3.218:8083";

				return {
					success: true,
					message: "URL de política de privacidad generada",
					file_url: `${base}/download/privacy-notice?token=${encodeURIComponent(token)}`,
				};
			}
		),
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

			if (
				numEmp === "26931" ||
				numEmp === "35485" ||
				numEmp === "26837" ||
				numEmp === "31689" ||
				numEmp === "41900" ||
				numEmp === "26831" ||
				numEmp === "27200" ||
				numEmp === "33457" ||
				numEmp === "33544" ||
				numEmp === "33841" ||
				numEmp === "34019" ||
				numEmp === "41922" ||
				numEmp === "14884" ||
				numEmp === "35620" ||
				numEmp === "40361" ||
				numEmp === "40394" ||
				numEmp === "23815" ||
				numEmp === "28916" ||
				numEmp === "42104" ||
				(numEmp === "42099" && (region === "TIJ" || region === "SAL"))
			) {
				return {
					success: false,
					message:
						"Tu usuario se encuentra inactivo, contacta con tu departamento de Recursos Humanos.",
				};
			}

			const isActiveQuery = `SELECT CB_ACTIVO As active, CB_NIVEL${code.proyecto} As project  FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`;

			const isActive = await executeQuery(
				isActiveQuery,
				"Error fetching user status",
				dbs.colabora,
			);

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

			// console.log("User data is: ", JSON.stringify(userData, null, 1));
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
					expiresIn: "1h",
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

			const launchDate = new Date(2026, 4, 24);
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
				if (letter === "PtmoFA") {
					if (loan_weeks < 2) return "LessThan2Weeks";
				}
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
				// console.log("Data values: ", JSON.stringify(data, null, 1));
				// if (letter === "PtmoFA") {
				// 	console.log("Letter is PtmoFA");
				// 	return { pdfFile: "Wait" };
				// }

				// if (letter !== "NIP" && letter !== "AltaIMSS") {
				// 	let letterQuery;
				// 	switch (letter) {
				// 		case "CartaPrestamo":
				// 			console.log("Caso prestamo");
				// 			letterQuery = "Prestamo";
				// 			break;
				// 		case "CartaGuarderia":
				// 		case "CartaTrabajo":
				// 		case "CartaVisa":
				// 		case "CartaPermiso":
				// 			letterQuery = letter.substring(5);
				// 			break;
				// 		case "PermisoDias":
				// 			letterQuery = "Permiso";
				// 			break;
				// 		case "AjustePrenom":
				// 			letterQuery = "Ajuste";
				// 			break;
				// 		default:
				// 			letterQuery = letter;
				// 			break;
				// 	}
				// 	const existing = await executeQuery(
				// 		`SELECT
				// 			CASE
				// 				WHEN EXISTS (
				// 					SELECT 1
				// 					FROM K_Solicitudes
				// 					WHERE No = '${numEmp}'
				// 					And Carta = '${letterQuery}'
				// 					And Pendiente = 1
				// 				)
				// 				THEN CAST(1 AS BIT)
				// 				ELSE CAST(0 AS BIT)
				// 			END AS existing_requisition;`,
				// 		"Error retrieving employee information",
				// 		dbs.kioskotek
				// 	);
				// 	// console.log("Existing: ", existing);
				// 	if (existing[0].existing_requisition) {
				// 		return { pdfFile: "Existing requisition" };
				// 	}
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

						if (data.plant_id.trim() === "8-41" || data.plant_id.trim() === "V-D") {
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
						spoti
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

				await executeParameterizedQuery(
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
		requestAbsence: async (_, { input }) => {
			try {
				const {
					numEmp,
					region,
					type,
					start_date,
					end_date,
					days,
					motive,
					comment,
				} = input;
				const dbs = await selectRegion(region);
				console.log("Input is: ", JSON.stringify(input, null, 1));

				// Validate the input
				if (!numEmp || !region || !type || !start_date || !days) {
					return {
						success: false,
						message: "Input is invalid. Please provide all required fields.",
					};
				}

				const startDateSQL = `'${new Date(start_date).toISOString().split("T")[0]}'`;
				const endDateSQL = end_date
					? `'${new Date(end_date).toISOString().split("T")[0]}'`
					: "NULL";

				// const approverData = await executeQuery(
				// 	`SELECT CB_NIVEL3 as approver FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`,
				// 	"Error fetching approver",
				// 	dbs.colabora
				// );

				const approverData = await executeQuery(
					`SELECT N3.TB_NUMERO As approver
					FROM COLABORA As C 
					INNER JOIN NIVEL3 As N3 ON C.CB_NIVEL3 = N3.TB_CODIGO
					WHERE CB_CODIGO = '${numEmp}'`,
					"Error fetching approver",
					dbs.colabora,
				);

				// console.warn("Approver data: ", approverData[0])

				// console.warn("Employee authorizer: ", authorizerData[0].authorizer)
				// console.log("Start date: ", startDateSQL, "End date: ", endDateSQL)

				const query = `INSERT INTO solicitudes_ausencia (
								id_empleado,
								tipo_solicitud,
								fecha_inicio,
								fecha_fin,
								fecha_solicitud,
								autoriza,
								estado,
								id_motivo,
								comentario_empleado,
								dias_totales
							)
							VALUES (
								'${numEmp}', 
								'${type}',
								${startDateSQL},
								${endDateSQL},
								GETDATE(),
								'${approverData[0].approver.toString().trim()}',
								1,
								${motive ? `'${motive}'` : null},
								${comment ? `'${comment}'` : null},
								${days});`;
				// console.warn("Query is: ", query)

				await executeQuery(query, "Error registering request", dbs.tecmamovil);
				return {
					success: true,
					message: "Se registró la solicitud correctamente.",
				};
			} catch (error) {
				console.error("Request absence caught error: ", error);
				return {
					success: false,
					message: "Ocurrió un error al registrar la solicitud.",
				};
			}
		},
		handleAbsenceRequest: async (_, { input }) => {
			try {
				const { numEmp, region, request_id, action, comment, motive } = input;
				const dbs = await selectRegion(region);
				console.log("Input is: ", JSON.stringify(input, null, 1));

				// Validate the input
				if (!numEmp || !region || !request_id || !action) {
					return {
						success: false,
						message: "Input is invalid. Please provide all required fields.",
					};
				}

				const approverData = await executeQuery(
					`SELECT TB_CODIGO as supervisor_id,
							TB_TEXTO as superior_id
					FROM NIVEL3
					WHERE TB_NUMERO = '${numEmp}'`,
					"Error fetching supervisor information",
					dbs.colabora,
				);

				console.warn("Employee authorizer: ", approverData[0]);

				switch (action) {
					case "approve":
						const formatISOToUTCDateTime = (isoString) => {
							const date = new Date(isoString);

							const pad = (n) => n.toString().padStart(2, "0");
							const padMs = (n) => n.toString().padStart(3, "0");

							return (
								`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
								`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${padMs(date.getUTCMilliseconds())}`
							);
						};

						const requestData = await executeQuery(
							`SELECT * FROM solicitudes_ausencia
														WHERE id_solicitud = ${request_id}`,
							"Error fetching request data",
							dbs.tecmamovil,
						);

						console.warn("Request data is: ", requestData);

						if (
							!approverData[0].superior_id ||
							approverData[0].superior_id.trim === ""
						) {
							console.warn("\n\nUser doesn't have superior, approving...\n");
							await executeQuery(
								`UPDATE solicitudes_ausencia
											SET estado = 3,
												aprobado_por = '${numEmp}',
												fecha_aprobacion = GETDATE()
											WHERE id_solicitud = ${request_id}`,
								"Error approving request",
								dbs.tecmamovil,
							);

							// await executeQuery(`INSERT INTO VACAPLAN (CB_CODIGO, VP_FEC_INI, VP_FEC_FIN, VP_DIAS, VP_SOL_COM, VP_SOL_USR, VP_SOL_FEC)
							const insertQuery = `SET IDENTITY_INSERT VACAPLAN ON;
									INSERT INTO VACAPLAN (CB_CODIGO, VP_FEC_INI, VP_FEC_FIN, VP_DIAS, VP_SOL_COM, VP_SOL_USR, VP_SOL_FEC, VP_STATUS, VP_AUT_COM, VP_AUT_USR, VP_AUT_FEC, VP_NOMYEAR, VP_NOMTIPO, VP_NOMNUME, VP_SAL_ANT, VP_SAL_PRO, VP_PAGO_US, LLAVE)
									VALUES(
										${+requestData[0].id_empleado},
										'${formatISOToUTCDateTime(requestData[0].fecha_inicio)}',
										'${formatISOToUTCDateTime(requestData[0].fecha_fin)}',
										${requestData[0].dias_totales},
										'${requestData[0].comentario_empleado || ""}',
										624,
										GETDATE(),
										0,
										'',
										0,
										GETDATE(),
										0,
										0,
										0,
										0,
										0,
										1,
										1111
									)
									SET IDENTITY_INSERT VACAPLAN OFF;`;
							console.log("Query is: ", insertQuery);
							await executeQuery(
								insertQuery,
								"Error approving request",
								dbs.colabora,
							);

							return {
								success: true,
								message: "Se registró la solicitud correctamente.",
							};
						}

						if (
							requestData[0].pre_aprobado_por &&
							requestData[0].pre_aprobado_por.trim() !== ""
						) {
							console.warn("\n\nRequest has been pre-approved, approving...\n");
							await executeQuery(
								`UPDATE solicitudes_ausencia
								SET estado = 3,
								aprobado_por = '${numEmp}',
								fecha_aprobacion = GETDATE()
								WHERE id_solicitud = ${request_id}`,
								"Error registering request",
								dbs.tecmamovil,
							);

							await executeQuery(
								`INSERT INTO VACAPLAN
									VALUES(
										'${requestData[0].id_empleado}',
										${requestData[0].fecha_inicio},
										${requestData[0].fecha_fin},
										${requestData[0].dias_totales},
										${requestData[0].comentario_empleado || null},
										'Test Form',
										624,
										GETDATE(),
										0,
										'',
										0,
										GETDATE(),
										0,
										0,
										0,
										0,
										0,
										1,
										1111
									)`,
								"Error approving request",
								dbs.colabora,
							);
						} else {
							console.warn("\n\nRequest is pending, pre-approving...\n");
							await executeQuery(
								`UPDATE solicitudes_ausencia
												SET estado = 2,
													autoriza = '${approverData[0].superior_id}',
													pre_aprobado_por = '${numEmp}',
													fecha_pre_aprobacion = GETDATE()
												WHERE id_solicitud = ${request_id}`,
								"Error registering request",
								dbs.tecmamovil,
							);
						}

						return {
							success: true,
							message: "Se registró la solicitud correctamente.",
						};
					case "reject":
						return { success: false, message: "Reject" };
					case "cancel":
						return { success: false, message: "Cancel" };
					default:
						console.log("No action given, cancelling...");
						return { success: false, message: "No se definió una acción" };
				}
			} catch (error) {
				console.log("Error handling absence request: ", error);
				return {
					success: false,
					message: "Ocurrió un error al registrar la solicitud.",
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

				// const publicUrl = `https://api.tecmamovilconnect.com/vacation-certificates/${file_name}`;
				const publicUrl = `http://10.3.1.180:8083/vacation-certificates/${file_name}`;
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
		handleCheckIn: async (_, { input }) => {
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
				const query = `FROM COLABORA
								WHERE CB_CODIGO = '${numEmp}'`;

				// console.log("Query is: ", JSON.stringify(query, null, 1));

				// Execute the query
				const data = await executeQuery(
					query,
					"Error updating info for check in",
					dbs.colabora,
				);

				// console.log("Obtained data is: ", data);
				return {
					success: true,
					message: "Employee check-in successful",
				};
			} catch (error) {
				console.error("Error while querying employee info:", error);
				return {
					success: false,
					message: "An error occurred while checking in.",
				};
			}
		},
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

				if (!Number.isFinite(parsedWeeks) || !Number.isInteger(parsedWeeks))
					return { success: false, message: "Semanas inválidas." };

				if (parsedWeeks < 2)
					return { success: false, message: "El plazo mínimo es de 2 semanas." };

				const safeAmount = parseFloat(parsedAmount.toFixed(2));
				const safeWeeks = parsedWeeks;

				const { empId, region } = user;
				const BUSINESS_TZ = "America/Denver";
				const now = DateTime.now().setZone(BUSINESS_TZ);

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
					dbs.colabora
				);

				if (!userDetails?.length) {
					return {
						success: false,
						message: "Empleado no encontrado para esta región.",
					};
				}

				const u = userDetails[0];

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
					dbs.colabora
				);

				const balance = parseFloat(balanceResult?.[0]?.SaldoFA || 0);
				if (!Number.isFinite(balance) || balance <= 0)
					return { success: false, message: "No fue posible obtener el saldo." };

				const minAmount = parseFloat((balance * 0.1).toFixed(2));
				const maxAmount = parseFloat((balance * 0.9).toFixed(2));

				if (safeAmount < minAmount || safeAmount > maxAmount)
					return { success: false, message: "Monto fuera de límites permitidos." };

				// 4) Cycle config
				const cycleResult = await executeParameterizedQuery(
					`
					SELECT TOP 1 semana_inicial, semana_final
					FROM Prestamos
					ORDER BY fecha DESC
					`,
					[],
					"Error fetching cycle",
					"tecmamovilcentral"
				);

				const initialWeek = cycleResult?.[0]?.semana_inicial;
				const finalWeek = cycleResult?.[0]?.semana_final;

				if (!initialWeek || !finalWeek)
					return { success: false, message: "No hay periodo configurado." };

				const getFirstSaturday = (year) => {
					let first = DateTime.fromObject(
						{ year, month: 1, day: 1 },
						{ zone: BUSINESS_TZ }
					);
					while (first.weekday !== 6) first = first.plus({ days: 1 });
					return first.startOf("day");
				};

				const firstSaturday = getFirstSaturday(now.year);
				const loanStart = firstSaturday.plus({ weeks: initialWeek - 1 });
				const loanEnd = firstSaturday.plus({ weeks: finalWeek - 1 }).endOf("week");

				if (now < loanStart || now > loanEnd)
					return { success: false, message: "Fuera del periodo permitido." };

				const currentWeek =
					Math.floor(now.diff(loanStart, "weeks").weeks) + initialWeek;
				const maxWeeks = finalWeek - currentWeek + 1;

				if (safeWeeks > maxWeeks)
					return { success: false, message: "Semanas exceden el límite." };

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
					dbs.kioskotek
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
					dbs.colabora
				);

				const oldLoanRequested = oldRequestedLoan?.[0]?.status === "true";
				const oldLoanExists = oldExistingLoan?.[0]?.status === "true";

				if (oldLoanRequested) {
					return {
						success: false,
						message: "Tienes una solicitud de préstamo pendiente de aprobación.",
					};
				}
				if (oldLoanExists) {
					return {
						success: false,
						message: "Has solicitado un préstamo y ha sido entregado.",
					};
				}

				// 6) Financial calcs (kept as you had them — NOT FIXED)
				const interestRate = 0.159;
				const interestTotal = parseFloat(
					((interestRate * safeWeeks * safeAmount) / 100).toFixed(2)
				);
				const totalToPay = parseFloat((safeAmount + interestTotal).toFixed(2));
				const weeklyDiscount = parseFloat((totalToPay / safeWeeks).toFixed(2));

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
						tx
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
							region === "JRZ" ? 1 : region === "SAL" ? 2 : region === "MTY" ? 3 : region === "TIJ" ? 4 : 0,
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
						tx
					);

					loanId = insertResult?.[0]?.loan_id;

					if (!loanId) {
						throw new Error("No loan_id returned from insert.");
					}

					await tx.commit();
				} catch (txErr) {
					try { await tx.rollback(); } catch (_) { }
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
					const full_name = `${u.last_name_pat ? `${u.last_name_pat} ` : ""}${u.last_name_mat ? `${u.last_name_mat}` : ""}${(u.last_name_pat || u.last_name_mat) ? ", " : ""}${u.first_name}`.trim();

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
					if ((u.project_code || "").trim() === "H09") logoName = "FLEXSTEEL.png";
					else if ((u.project_code || "").trim() === "H75") logoName = "CLEAR.png";
					else logoName = "LOGOTECMA.png";

					const imageBase64 = fs
						.readFileSync(path.join(__dirname, `../../public/assets/images/${logoName}`))
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
						"tecmamovilcentral"
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
						"tecmamovilcentral"
					);

					// Still treat the loan request as created; PDF can be regenerated later
				}

				return { success: true, message: "Solicitud registrada correctamente." };
			} catch (err) {
				console.error("requestLoan error:", err);
				return { success: false, message: "Error al procesar la solicitud." };
			}
		}),
		testMutation: async () => {
			return "Done";
		},
	},
};

module.exports = resolvers;
