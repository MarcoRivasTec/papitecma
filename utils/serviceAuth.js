const jwt = require("jsonwebtoken");

function requireServiceAuth(requiredScope) {
    return (resolver) => {
        return async (parent, args, ctx, info) => {
            try {

                console.log("Service auth check")
                const authHeader = ctx.req.headers.authorization || "";

                if (!authHeader.startsWith("Bearer "))
                    throw new Error("Missing service token");

                const token = authHeader.split(" ")[1];

                const decoded = jwt.verify(token, process.env.CSA_SERVICE_SECRET, {
                    issuer: "csa-api",
                    audience: "tecma-movil-connect-api"
                });

                const scopes = decoded.scope || [];

                if (requiredScope && !scopes.includes(requiredScope))
                    throw new Error("Service token missing required scope");

                ctx.service = {
                    name: decoded.sub,
                    scopes
                };

                console.log("Service auth passed, proceeding to resolver");
                return resolver(parent, args, ctx, info);

            } catch (err) {

                console.error("Service auth error:", err.message);
                return {
                    success: false,
                    message: err.message
                }
                throw new Error("Unauthorized service request");

            }

        };

    };

}

module.exports = { requireServiceAuth };