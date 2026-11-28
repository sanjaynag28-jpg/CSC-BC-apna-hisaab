const { AsyncLocalStorage } = require('async_hooks');

const actorStorage = new AsyncLocalStorage();

/**
 * Normalize a database or JWT user record into canonical Shop Scope + Actor Identity.
 * - For Staff users (Role === 'Staff' with ParentUserID), all operational shop data
 *   queries scope to ParentUserID (`UserID`), while `ActualUserID` & `ActorName`
 *   preserve who performed the action.
 * - For SuperAdmin / ShopOwner / ShopAdmin, `UserID === ActualUserID`.
 */
function resolveShopScope(user) {
    if (!user) return null;
    const rawUserId = Number(user.ActualUserID || user.UserID || 0);
    const role = user.Role || 'User';
    const parentUserId = user.ParentUserID ? Number(user.ParentUserID) : (role === 'Staff' ? 1 : null);
    const isStaff = role === 'Staff' && Boolean(parentUserId);
    const shopUserId = isStaff ? parentUserId : Number(user.UserID || rawUserId);
    const actorName = String(
        user.ActorName || user.OwnerName || user.Username || (rawUserId === 1 ? 'Admin' : 'Staff')
    ).trim();

    return {
        UserID: shopUserId,
        ActualUserID: rawUserId || shopUserId,
        ParentUserID: parentUserId,
        Username: user.Username || '',
        ActorUsername: user.ActorUsername || user.Username || '',
        ShopName: user.ShopName || '',
        OwnerName: user.OwnerName || actorName,
        ActorName: actorName,
        MobileNumber: user.MobileNumber || null,
        Role: role,
        IsStaff: isStaff,
        sessionToken: user.sessionToken || null
    };
}

function buildActorFromUser(user) {
    const scoped = resolveShopScope(user);
    if (!scoped) return null;
    return {
        shopUserId: scoped.UserID,
        actorUserId: scoped.ActualUserID,
        actorName: scoped.ActorName,
        actorUsername: scoped.ActorUsername || scoped.Username,
        role: scoped.Role,
        isStaff: scoped.IsStaff
    };
}

function runWithActor(userOrActor, fn) {
    if (!userOrActor) return fn();
    const actor = ('shopUserId' in userOrActor)
        ? userOrActor
        : buildActorFromUser(userOrActor);
    if (!actor) return fn();
    return actorStorage.run(actor, fn);
}

function getCurrentActor() {
    return actorStorage.getStore() || null;
}

module.exports = {
    resolveShopScope,
    buildActorFromUser,
    runWithActor,
    getCurrentActor
};
