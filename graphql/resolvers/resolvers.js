const {
	executeQuery,
	executeParameterizedQuery,
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
const { json } = require("express");
const {
	generateLetterPDF,
	generatePayrollPDF,
	generateIMSSPDF,
	generateSavingsLoanPDF,
	generateSavingWithdrawPDF,
	generateAdjustmentPDF,
	generateVacationsPDF,
	generatePermitPDF,
} = require("../../utils/generatePDF");
const oldKey = process.env.OLD_KEY;
const newKey = process.env.NEW_KEY;
const path = require("path");
const fs = require("fs");
const Numalet = require("numalet");
const { DateTime } = require("luxon");
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
				"kioskocentral"
			);
			const encNip = queryNip[0];

			const decryptedPassword = decryptOld(encNip.NIP, oldKey);

			if (!encNip || nip !== decryptedPassword) {
				throw new Error(
					"El usuario no existe o las credenciales son inválidas"
				);
			}

			const queryName = await executeQuery(
				`SELECT CB_NOMBRES FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.colabora
			);
			const name = queryName[0];

			// return { token, name: name.CB_NOMBRES };
			return {
				success: true,
				message: `Se inicio sesión correctamente para ${name.CB_NOMBRES}`,
			};
		},
		Versions: async (_, { currVer }) => {
			const versiones = await executeQuery(
				`SELECT * FROM Versiones
					WHERE fecha > (SELECT fecha FROM Versiones WHERE id_version = '${currVer}')`,
				"Error fetching version information",
				"tecmamovilcentral"
			);
			console.log("Versiones: ", versiones);
			if (versiones.length > 0) {
				const important = versiones.some((version) => version.relevancia >= 3);
				console.log("Relevance status: ", important);
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
				dbs.kioskotek
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
				dbs.colabora
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
				"Error fetching user card info",
				dbs.colabora
			);
			// console.log("Info: ", JSON.stringify(userInfo, null, 1));
			return userInfo[0];
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
				dbs.colabora
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
				dbs.kioskotek
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
				dbs.kioskotek
			);

			const availableTallasQuery = await executeQuery(
				`SELECT Tipo,
						Medida,
						EU_medida					
				FROM TMedidas
				Where Genero = '${generalQuery[0].SEXO}' OR Genero = 'G'`,
				"Error fetching available tallas information",
				dbs.kioskotek
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
				dbs.colabora
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
				dbs.colabora
			);

			let ingreso = new Date(query[0].DIASANIV);
			let today = new Date();

			let anniversary = new Date(
				today.getFullYear(),
				ingreso.getMonth(),
				ingreso.getDate()
			);

			if (today > anniversary) {
				anniversary.setFullYear(today.getFullYear() + 1);
			}

			let remainingDays = Math.ceil(
				(anniversary - today) / (1000 * 60 * 60 * 24)
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
						).toFixed(2)
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
				dbs.colabora
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
				dbs.colabora
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
					MAX(CASE WHEN AH_TIPO = '${
						region === "TIJ" ? "1" : "3"
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
				dbs.colabora
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
				dbs.kioskotek
			);
			const periodosBloqueoArray = queryPeriodosBloqueo.map(
				(row) => row.Periodo
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
				dbs.colabora
			);
			console.log("Recibos a retornar: ", recibos);
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
				dbs.colabora
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
				dbs.colabora
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
				dbs.colabora
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
				dbs.colabora
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
				dbs.colabora
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
				dbs.tecmamovil
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
						{ zone }
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
				dbs.kioskotek
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
				dbs.kioskotek
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
				dbs.kioskotek
			);

			console.log("Respuestas: ", answers);
			// Transform the questions array
			const updatedQuestions = questions.map((question) => {
				// Find the matching answer by tipo
				const matchingAnswer = answers.find(
					(answer) => answer.Tipo === question.tipo
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
					dbs.tecmamovil
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
					dbs.colabora
				)
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
	},
	Mutation: {
		login: async (_, { numEmp, nip, region }) => {
			const dbs = await selectRegion(region);

			const queryNip = await executeQuery(
				`SELECT CB_CODIGO, NIP FROM Empleados WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.kioskotek
			);
			const encNip = queryNip[0];

			const decryptedPassword = decryptOld(encNip.NIP, oldKey);

			if (!encNip || nip !== decryptedPassword) {
				return {
					success: false,
					message: "El usuario no existe o las credenciales son inválidas.",
				};
			}

			const isActive = await executeQuery(
				`SELECT CB_ACTIVO As active FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.colabora
			);

			if (isActive[0].active === "N")
				return {
					success: false,
					message:
						"Usuario inactivo, contacta con tu departamento de recursos humanos.",
				};

			const queryName = await executeQuery(
				`SELECT CB_NOMBRES FROM COLABORA WHERE CB_CODIGO = '${numEmp}'`,
				"Error fetching user credentials",
				dbs.colabora
			);
			const name = queryName[0];

			const token = jwt.sign(
				{ id: encNip.CB_CODIGO, name: name.CB_NOMBRES },
				process.env.JWT_KEY,
				{
					expiresIn: "1h",
				}
			);

			return {
				success: true,
				message: "Login successful",
				data: { token, name: name.CB_NOMBRES },
			};
		},
		resetNIP: async (_, { numEmp, rfc, newNIP, region }) => {
			const dbs = await selectRegion(region);

			const employeeData = await executeQuery(
				`Select
					FEC_LOGIN As login_date
				From
					Empleados
				Where
					CB_CODIGO = ${numEmp}`,
				"Error retrieving employee login date",
				dbs.kioskotek
			);

			const employeeRFC = await executeQuery(
				`Select
					CB_RFC As rfc
				From
					COLABORA
				Where
					CB_CODIGO = ${numEmp}`,
				"Error retrieving employee login date",
				dbs.colabora
			);
			console.log("Employee data: ", employeeData);

			if (!employeeRFC[0].rfc) {
				return "Not found";
			}

			const launchDate = new Date(2025, 3, 17);
			const lastLoginDate = new Date(employeeData[0].login_date);
			console.log(
				`Launch date is: ${launchDate} and last login date was: ${lastLoginDate}`
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
						dbs.kioskotek
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
					// console.log("isValid: ", isValid);
					const encryptedPasswordOld = encryptOld(newNIP, oldKey);
					// console.log("Encrypted password: ", encryptedPasswordOld);

					await executeQuery(
						`Update Empleados
						Set NIP = '${encryptedPasswordOld}'
						Where
							CB_CODIGO = ${numEmp}
							And RFC = '${rfc}'`,
						"Error updating measurement",
						dbs.kioskotek
					);
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
				dbs.kioskotek
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
				dbs.kioskotek
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
				dbs.kioskotek
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
					dbs.kioskotek
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
					dbs.kioskotek
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
			}
		) => {
			// console.log(`Day to adjust: ${day_to_adjust}, period: ${period}`);
			// return
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
			console.log("Data values: ", JSON.stringify(data, null, 1));
			// if (letter === "PtmoFA") {
			// 	console.log("Letter is PtmoFA");
			// 	return { pdfFile: "Wait" };
			// }

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
								And Carta = '${letterQuery}'
								And Pendiente = 1
							) 
							THEN CAST(1 AS BIT)
							ELSE CAST(0 AS BIT)
						END AS existing_requisition;`,
					"Error retrieving employee information",
					dbs.kioskotek
				);
				// console.log("Existing: ", existing);
				if (existing[0].existing_requisition) {
					return { pdfFile: "Existing requisition" };
				}
			}

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
					hours24
				)}:${minutes}:${seconds}.${milliseconds}`;

				// Convert hours to 12-hour format and create custom format (YYYYMMDDhhmm)
				let hours12 = hours24 % 12 || 12; // Convert 24-hour to 12-hour format
				const formattedCustom = `${year}${month}${day}${padZero(
					hours12
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
					and Proyecto = '${
						region === "TIJ" || region === "SAL" ? project[0] : project
					}'`,
				"Error obtaining CSC Data",
				dbs.kioskotek
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
				console.log("Date string is: ", dateString);
				console.log("Local date string is: ", localDate);

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
					newFileName = `${
						letter === "CartaPrestamo"
							? "CartaSalario"
							: letter === "CartaPermiso"
							? "CartaViaje"
							: letter
					}_${numEmp} - ${formattedCustom}.pdf`;

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
							CB_SALARIO As salario
						From
							COLABORA
							INNER JOIN PUESTO ON PUESTO.PU_CODIGO = COLABORA.CB_PUESTO
							INNER JOIN RPATRON ON RPATRON.TB_CODIGO = COLABORA.CB_PATRON
							INNER JOIN TURNO ON TURNO.TU_CODIGO = COLABORA.CB_TURNO
						Where
							CB_CODIGO = '${numEmp}'`,
						"Error retrieving employee information",
						dbs.colabora
					);

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
						dbs.colabora
					);
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
						pdfData.salario_mensual
					);

					pdfData.antiguedad = formatDateToSpanish(antiguedadDate);
					pdfData.tipo = letter;
					const imageBase64 = fs
						.readFileSync(
							path.join(__dirname, "../../public/assets/images/LOGOTECMA.png")
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
						dbs.colabora
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

					const imageBase64 = fs
						.readFileSync(
							path.join(__dirname, "../../public/assets/images/LOGOTECMA.png")
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
						throw new Error("Invalid file type. Only JPG and PDF are allowed.");
					}

					newFileName = `Domicilio_${numEmp} - ${formattedCustom}.${fileExtension}`;
					// Imagen o pdf

					console.log("Reading file...");

					fileBuffer = Buffer.from(file, "base64");
					break;
				}
				case "PtmoFA": {
					letterType = letter;
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
						dbs.colabora
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
						dbs.kioskotek
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
					if (requested_loan > balance * 0.9 || requested_loan < balance * 0.1)
						return { pdfFile: "Limit" };
					console.log("Balance is: ", balance);

					const prestamo_weeks = await executeQuery(
						`SELECT TOP 1 
						semana_inicial AS initial_week,
							semana_final AS final_week
							FROM Prestamos
							ORDER BY fecha DESC;`,
						"Error fetching prestamo weeks information",
						dbs.tecmamovil
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
								firstSaturdayOfYear.getDate() + daysOffset
							)
						);
						const endOfWeek = new Date(startOfWeek);
						endOfWeek.setDate(startOfWeek.getDate() + 6); // Last day of the week

						console.log(
							"Start of week: ",
							startOfWeek,
							" end of week: ",
							endOfWeek
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
							diffInTime / (1000 * 60 * 60 * 24 * 7)
						);

						availableWeeks = diffInWeeks;
					} else {
						console.log("Out of range");
						return { pdfFile: "OutOfRange" };
					}

					if (loan_weeks > availableWeeks) return { pdfFile: "ExceedsPeriod" };

					const interest = parseFloat(
						((interestRate * loan_weeks * requested_loan) / 100).toFixed(2)
					);

					const totalToPay = parseFloat((requested_loan + interest).toFixed(2));

					const weekly_discount = parseFloat(
						(totalToPay / loan_weeks).toFixed(2)
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
						dbs.colabora
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

					const imageBase64 = fs
						.readFileSync(
							path.join(__dirname, "../../public/assets/images/LOGOTECMA.png")
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

						const padZero = (num, size = 2) => String(num).padStart(size, "0");

						const year = currentDate.getFullYear();
						const month = padZero(currentDate.getMonth() + 1);
						const day = padZero(currentDate.getDate());

						const hours24 = currentDate.getHours();
						const minutes = padZero(currentDate.getMinutes());
						const seconds = padZero(currentDate.getSeconds());

						return `${day}-${month}-${year} ${padZero(
							hours24
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
						dbs.colabora
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

					const imageBase64 = fs
						.readFileSync(
							path.join(__dirname, "../../public/assets/images/LOGOTECMA.png")
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
					mail = directory[0] ? directory[0].hr_advisor_email : defaultHRMail;
					break;

				// Asesor CSC
				case "PtmoFA":
				case "AjustePrenom":
				case "Banorte":
				case "Gafete":
				case "AltaIMSS":
					mail = directory[0] ? directory[0].csc_advisor_email : defaultCSCMail;
					break;

				// Especial
				case "NIP":
					hr_id = "0000";
					mail = "albino.ramirez@tecma.com";
					break;
				default:
					break;
			}
			console.log(`numEmp: ${numEmp}, name: ${name},
				formattedDateTime: ${formattedDateTime},
				letter: ${letter},
				hr_id: ${hr_id},
				mail: ${mail},
				newFileName: ${newFileName},
				plant_id: ${letterType === "NIP" ? "" : plant_id},
				shift: ${letterType === "NIP" ? "" : shift},
				project: ${letterType === "NIP" ? "" : project},
				position: ${letterType === "NIP" ? "" : position},
				clasification: ${clasification},
				motive: ${motive},
				coment: ${coment},
				period: ${period},
				start_date: ${start_date},
				end_date: ${end_date},
				days: ${days}`);

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
				dbs.kioskotek
			);
			console.log("Done");
			return { pdfFile: "Done" };
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
				dbs.colabora
			);

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
					C.CB_CODIGO = ${numEmp}`,
				"Error retrieving employee information",
				dbs.colabora
			);

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
				dbs.colabora
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
				payrollData.fecha_inicial
			)} A ${formatDateToSpanish(payrollData.fecha_final)}`;
			payrollData.fecha_pago = formatDateToSpanish(payrollData.fecha_pago);
			payrollData.fecha_ingreso = formatDateToSpanish(
				payrollData.fecha_ingreso
			);
			payrollData.ahorro_total = payrollData.ahorro * 2;

			payrollData.salario = payrollData.salario.toFixed(2);
			payrollData.total_percepciones =
				payrollData.total_percepciones.toFixed(2);
			payrollData.total_deducciones = payrollData.total_deducciones.toFixed(2);
			payrollData.total_neto = payrollData.total_neto.toFixed(2);
			payrollData.ahorro = payrollData.ahorro.toFixed(2);
			payrollData.acumulado_ahorro = payrollData.acumulado_ahorro.toFixed(2);

			const imageBase64 = fs
				.readFileSync(
					path.join(__dirname, "../../public/assets/images/LOGOTECMA.png")
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
								`(${encuesta}, '${numEmp}', ${item.pregunta}, '${item.respuesta}')`
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
						dbs.kioskotek
					);

					await executeQuery(
						`Update K_Encuestas Set Estatus = 'T' Where Encuesta = ${encuesta} And No = ${numEmp}`,
						"Error updating survey status",
						dbs.kioskotek
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
									CB_FEC_ING As ingreso
								FROM COLABORA
								WHERE CB_CODIGO = '${numEmp}'`;

				// console.log("Query is: ", JSON.stringify(query, null, 1));

				// Execute the query
				const data = await executeQuery(
					query,
					"Error querying employee info",
					dbs.colabora
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
		testMutation: async () => {
			const numEmp = 99999110;
			const plant_id = "002";
			const project = "H99";
			const letter = "CartaGuarderia";

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
					hours24
				)}:${minutes}:${seconds}.${milliseconds}`;

				// Convert hours to 12-hour format and create custom format (YYYYMMDDhhmm)
				let hours12 = hours24 % 12 || 12; // Convert 24-hour to 12-hour format
				const formattedCustom = `${year}${month}${day}${padZero(
					hours12
				)}${minutes}`;

				// Return both formats
				return { formattedDateTime, formattedCustom };
			};

			// Example usage
			const { formattedDateTime, formattedCustom } = getFormattedDateTime();
			const directory = await executeQuery(
				`Select
					CSC_RH.email As hr_advisor_email,
					CSC_Asesor.email As csc_advisor_email,
					DIR.RH As hr_id_number
				From
					CSC_Directorio As DIR
					Inner Join CSC_RH on CSC_RH.Codigo = DIR.RH
					Inner Join CSC_Asesor on CSC_Asesor.Codigo = DIR.Asesor
				Where
					Planta = '${plant_id}'
					and Proyecto = '${project}'`,
				"Error obtaining CSC Data",
				"kioskocentral"
			);
			console.log("directory info: ", JSON.stringify(directory[0]));
			if (directory[0] === undefined) {
				console.log("No encontro");
			}
			return `${letter}_${numEmp} - ${formattedCustom}.pdf`;
		},
	},
};

module.exports = resolvers;
