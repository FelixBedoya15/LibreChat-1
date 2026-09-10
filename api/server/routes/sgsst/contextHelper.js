const CompanyInfo = require('~/models/CompanyInfo');
const mongoose = require('mongoose');

/**
 * Resolves active company ID for either regular users or sub-users.
 * Handles user objects (req.user) and user ID strings.
 */
async function getActiveCompanyId(userOrId, subUserAssignedCompany = null) {
    if (subUserAssignedCompany) return subUserAssignedCompany;
    if (!userOrId) return null;

    let targetUserId = userOrId;
    if (typeof userOrId === 'object') {
        if (userOrId.isSubUser && userOrId.assignedCompany) {
            return userOrId.assignedCompany;
        }
        targetUserId = (userOrId.isSubUser && userOrId.parentUser) ? userOrId.parentUser : (userOrId._id || userOrId.id);
    } else {
        const User = mongoose.models.User || mongoose.model('User');
        if (User) {
            try {
                const userDoc = await User.findById(userOrId).select('isSubUser parentUser assignedCompany').lean();
                if (userDoc && userDoc.isSubUser) {
                    if (userDoc.assignedCompany) return userDoc.assignedCompany;
                    if (userDoc.parentUser) targetUserId = userDoc.parentUser;
                }
            } catch (err) {
                // Ignore query error, treat as raw ID
            }
        }
    }

    let active = await CompanyInfo.findOne({ user: targetUserId, isActive: true }).lean();
    if (!active) active = await CompanyInfo.findOne({ user: targetUserId }).lean();
    return active ? active._id : null;
}

/**
 * Resolves the effective target user ID and company ID for SGSST operations.
 * If the authenticated user is a sub-user, returns the parent user ID and assigned company ID.
 * Otherwise returns the user's own ID and active company ID.
 * 
 * @param {Object} req Express request with authenticated req.user
 * @returns {Promise<{targetUserId: string, companyId: Object|null, isSubUser: boolean, workerDoc: string|null, permissions: string[]}>}
 */
async function getRequestContext(req) {
    const isSub = !!req.user?.isSubUser;
    const targetUserId = (isSub && req.user?.parentUser) ? String(req.user.parentUser) : String(req.user?.id || req.user?._id);
    
    let companyId = null;
    if (isSub && req.user?.assignedCompany) {
        companyId = req.user.assignedCompany;
    } else {
        const activeCompany = await CompanyInfo.findOne({ user: targetUserId, isActive: true }).lean()
            || await CompanyInfo.findOne({ user: targetUserId }).lean();
        companyId = activeCompany ? activeCompany._id : null;
    }

    return {
        targetUserId,
        companyId,
        isSubUser: isSub,
        workerDoc: req.user?.workerDocument || null,
        permissions: req.user?.subUserPermissions || []
    };
}

module.exports = {
    getRequestContext,
    getActiveCompanyId,
};
