// auth.js
function requireAuth(resolver) {
    return (parent, args, ctx, info) => {
        if (!ctx.user) throw new Error("Unauthorized");
        return resolver(parent, args, ctx, info);
    };
}
module.exports = { requireAuth };