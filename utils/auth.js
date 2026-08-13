// auth.js
function requireAuth(resolver) {
    // console.log("value of resolver: ", resolver);
    return (parent, args, ctx, info) => {
        if (!ctx.user) throw new Error("Unauthorized");
        return resolver(parent, args, ctx, info);
    };
}
module.exports = { requireAuth };