const express = require("express");

const { executeParameterizedQuery, executeQuery } = require("../utils/dbUtils");

const router = express.Router();

router.get("/image/:region/:numEmp", async (req, res) => {
    try {
        // if (!req.user) {
        //     return res.status(401).json({
        //         success: false,
        //         message: "Unauthorized",
        //     });
        // }

        const { region, numEmp } = req.params;

        if (!/^[A-Z]{2,10}$/i.test(region)) {
            return res.status(400).json({
                success: false,
                message: "Invalid region",
            });
        }

        if (!/^\d+$/.test(numEmp)) {
            return res.status(400).json({
                success: false,
                message: "Invalid employee number",
            });
        }

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

        const dbs = await selectRegion(region);

        const result = await executeQuery(
            `Select IM_BLOB as image						
						from IMAGEN
				where CB_CODIGO = '${numEmp}' 
				And IM_TIPO = 'FOTO' `,
            "Error fetching image blob information",
            dbs.colabora,
        );


        // const result = await executeParameterizedQuery(
        //     `
		// 	SELECT IM_BLOB AS image
		// 	FROM IMAGEN
		// 	WHERE CB_CODIGO = @param1
		// 	  AND IM_TIPO = 'FOTO'
		// 	`,
        //     [numEmp],
        //     "Error fetching employee image",
        //     dbName
        // );

        if (!result.length || !result[0].image) {
            return res.status(404).json({
                success: false,
                message: "Image not found",
            });
        }

        const imageBuffer = result[0].image;

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="employee_${numEmp}.jpg"`
        );

        return res.send(imageBuffer);
    } catch (error) {
        console.error("Error downloading employee image:", error);

        return res.status(500).json({
            success: false,
            message: "Error downloading employee image",
        });
    }
});

module.exports = router;