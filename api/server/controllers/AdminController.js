const mongoose = require('mongoose');
const User = mongoose.model('User');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const bcrypt = require('bcryptjs');
const { Conversation } = require('~/db/models');
const { getMessages } = require('~/models');

const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}, 'email name username createdAt provider role accountStatus isApproved inactiveAt activeAt phoneNumber departamento ciudad department city');

        // Get last activity (most recent conversation updatedAt) for all users in one aggregation
        const lastActivities = await Conversation.aggregate([
            { $sort: { updatedAt: -1 } },
            { $group: { _id: '$user', lastActivity: { $first: '$updatedAt' } } },
        ]);
        const activityMap = {};
        for (const item of lastActivities) {
            activityMap[item._id.toString()] = item.lastActivity;
        }

        // Map legacy isApproved to accountStatus if needed
        const mappedUsers = users.map(user => {
            const userObj = user.toObject();
            if (!userObj.accountStatus) {
                userObj.accountStatus = userObj.isApproved === false ? 'pending' : 'active';
            }
            userObj.lastActivity = activityMap[userObj._id.toString()] || null;
            return userObj;
        });
        res.status(200).json(mappedUsers);
    } catch (err) {
        logger.error('[getAllUsers]', err);
        res.status(500).json({ message: 'Error fetching users' });
    }
};

const createUser = async (req, res) => {
    try {
        const { email, password, name, username, role, accountStatus, phoneNumber, departamento, ciudad, department, city } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);

        const newUser = new User({
            email,
            password: hashedPassword,
            name,
            username,
            role: role || SystemRoles.USER,
            accountStatus: accountStatus || 'active',
            provider: 'local',
            emailVerified: true, // Admin created users are verified
            phoneNumber,
            departamento: departamento || department,
            ciudad: ciudad || city,
            department: department || departamento,
            city: city || ciudad,
        });

        await newUser.save();
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (err) {
        logger.error('[createUser]', err);
        res.status(500).json({ message: 'Error creating user' });
    }
};

const updateUser = async (req, res) => {
    try {
        const { 
            userId, role, accountStatus, name, username, password, inactiveAt, activeAt, phoneNumber,
            departamento, ciudad, department, city,
            commercialTier, partnerSlug, partnerPaymentDetails, partnerSupportContact, pointsAdjustment,
            companyLimit, automationLimit, subUserLimit, referredByPartner
        } = req.body;
        
        logger.info(`[AdminController] Updating user ${userId}:`, { 
            role, accountStatus, inactiveAt, activeAt, commercialTier, partnerSlug, pointsAdjustment, companyLimit, automationLimit, subUserLimit, referredByPartner
        });

        const updateData = {};
        if (role) updateData.role = role;
        if (accountStatus) updateData.accountStatus = accountStatus;
        if (inactiveAt !== undefined) updateData.inactiveAt = inactiveAt ? new Date(inactiveAt) : null;
        if (activeAt !== undefined) updateData.activeAt = activeAt ? new Date(activeAt) : null;
        if (name) updateData.name = name;
        if (username) updateData.username = username;
        if (password) {
            const salt = bcrypt.genSaltSync(10);
            updateData.password = bcrypt.hashSync(password, salt);
        }
        if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
        if (departamento !== undefined) updateData.departamento = departamento;
        if (department !== undefined && !updateData.departamento) updateData.departamento = department;
        if (ciudad !== undefined) updateData.ciudad = ciudad;
        if (city !== undefined && !updateData.ciudad) updateData.ciudad = city;

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // --- Handle Partner/Embajador assignment ---
        if (commercialTier !== undefined) {
            const Partner = require('~/models/Partner');
            if (commercialTier === 'none') {
                // Remove partner record entirely to return to regular user (Asociado)
                await Partner.deleteOne({ userId });
            } else if (commercialTier === 'partner' || commercialTier === 'embajador') {
                if (!partnerSlug || partnerSlug.trim() === '') {
                    return res.status(400).json({ message: 'El código personalizado (slug) es obligatorio para socios comerciales.' });
                }
                const normalizedSlug = partnerSlug.toLowerCase().trim();
                
                // Validate alphanumeric + hyphens
                if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
                    return res.status(400).json({ message: 'El código personalizado solo puede contener letras, números y guiones.' });
                }

                // Check slug unique constraints (ignoring this user's current partner)
                const existingPartnerWithSlug = await Partner.findOne({ 
                    slug: normalizedSlug, 
                    userId: { $ne: userId } 
                });
                if (existingPartnerWithSlug) {
                    return res.status(400).json({ message: 'Este código de referido ya está siendo utilizado por otro socio.' });
                }

                await Partner.findOneAndUpdate(
                    { userId },
                    {
                        slug: normalizedSlug,
                        type: commercialTier,
                        commissionRate: commercialTier === 'embajador' ? 0.30 : 0.20,
                        active: true,
                        status: 'approved',
                        paymentDetails: partnerPaymentDetails ? partnerPaymentDetails.trim() : '',
                        supportContact: partnerSupportContact ? partnerSupportContact.trim() : ''
                    },
                    { upsert: true, new: true }
                );
            }
        }

        // --- Handle Ambassador (referredByPartner) assignment ---
        if (referredByPartner !== undefined) {
            const ReferralRecord = require('~/models/ReferralRecord');
            if (!referredByPartner || referredByPartner === 'none' || referredByPartner === '') {
                const existingRecord = await ReferralRecord.findOne({ referredUserId: userId });
                if (existingRecord) {
                    if (existingRecord.referredByUser) {
                        existingRecord.referredByPartner = null;
                        await existingRecord.save();
                    } else {
                        await ReferralRecord.deleteOne({ referredUserId: userId });
                    }
                }
            } else {
                await ReferralRecord.findOneAndUpdate(
                    { referredUserId: userId },
                    { referredByPartner },
                    { upsert: true, new: true }
                );
            }
        }

        // --- Handle Points Adjustment ---
        if (pointsAdjustment !== undefined && pointsAdjustment !== 0) {
            const PointTransaction = require('~/models/PointTransaction');
            await PointTransaction.create({
                userId,
                points: pointsAdjustment,
                type: 'admin_adjustment',
                description: `Ajuste manual del administrador: ${pointsAdjustment > 0 ? '+' : ''}${pointsAdjustment} pts`
            });
        }

        // --- Handle UserPlan Synchronization (Limits, Expiration Date & Plan) ---
        const UserPlan = require('~/db/models/UserPlan');
        const planUpdates = {};
        if (companyLimit !== undefined) {
            planUpdates.companyLimit = companyLimit === '' || companyLimit === null ? null : parseInt(companyLimit, 10);
        }
        if (automationLimit !== undefined) {
            planUpdates.automationLimit = automationLimit === '' || automationLimit === null ? null : parseInt(automationLimit, 10);
        }
        if (subUserLimit !== undefined) {
            planUpdates.subUserLimit = subUserLimit === '' || subUserLimit === null ? null : parseInt(subUserLimit, 10);
        }
        if (inactiveAt !== undefined) {
            planUpdates.planExpiresAt = inactiveAt ? new Date(inactiveAt) : null;
        }
        if (role) {
            const rolePlanMap = {
                'USER_PRO': 'pro',
                'PRO': 'pro',
                'USER_PLUS': 'plus',
                'USER_GO': 'go',
                'USER_IPEVAR': 'ipevar',
                'IPEVAR': 'ipevar',
                'USER': 'free',
                'ADMIN': 'admin',
                'USER_CUSTOM': 'custom',
            };
            if (rolePlanMap[role]) {
                planUpdates.plan = rolePlanMap[role];
            }
        }

        if (Object.keys(planUpdates).length > 0) {
            await UserPlan.findOneAndUpdate(
                { userId },
                { $set: planUpdates },
                { upsert: true, new: true }
            );
        }

        res.status(200).json({ message: 'User updated successfully', user });
    } catch (err) {
        logger.error('[updateUser]', err);
        res.status(500).json({ message: err.message || 'Error updating user' });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { userId } = req.body;
        // Prevent deleting self
        if (req.user._id.toString() === userId) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(userId);
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (err) {
        logger.error('[deleteUser]', err);
        res.status(500).json({ message: 'Error deleting user' });
    }
};

const bulkUpdateUsers = async (req, res) => {
    try {
        const { userIds, activeAt, inactiveAt, accountStatus, role } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'No users provided' });
        }

        const updateData = {};
        // Allow setting to null/undefined to clear dates, or valid dates
        // If undefined in body, do not update. If null, clear.
        if (activeAt !== undefined) updateData.activeAt = activeAt ? new Date(activeAt) : null;
        if (inactiveAt !== undefined) updateData.inactiveAt = inactiveAt ? new Date(inactiveAt) : null;
        if (role !== undefined) updateData.role = role;
        if (accountStatus && ['active', 'inactive', 'pending'].includes(accountStatus)) {
            updateData.accountStatus = accountStatus;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No updates provided' });
        }

        const result = await User.updateMany(
            { _id: { $in: userIds } },
            { $set: updateData }
        );

        // Synchronize UserPlan for all affected users if inactiveAt or role were updated
        if (inactiveAt !== undefined || role !== undefined) {
            const UserPlan = require('~/db/models/UserPlan');
            const planUpdates = {};
            if (inactiveAt !== undefined) {
                planUpdates.planExpiresAt = inactiveAt ? new Date(inactiveAt) : null;
            }
            if (role !== undefined) {
                const rolePlanMap = {
                    'USER_PRO': 'pro',
                    'PRO': 'pro',
                    'USER_PLUS': 'plus',
                    'USER_GO': 'go',
                    'USER_IPEVAR': 'ipevar',
                    'IPEVAR': 'ipevar',
                    'USER': 'free',
                    'ADMIN': 'admin',
                    'USER_CUSTOM': 'custom',
                };
                if (rolePlanMap[role]) {
                    planUpdates.plan = rolePlanMap[role];
                }
            }
            if (Object.keys(planUpdates).length > 0) {
                await UserPlan.updateMany(
                    { userId: { $in: userIds } },
                    { $set: planUpdates }
                );
            }
        }

        res.status(200).json({
            message: 'Users updated successfully',
            modifiedCount: result.modifiedCount
        });
    } catch (err) {
        logger.error('[bulkUpdateUsers]', err);
        res.status(500).json({ message: 'Error updating users' });
    }
};



const getUserConversations = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const conversations = await Conversation.find({ user: userId })
            .select('conversationId title createdAt updatedAt model')
            .sort({ updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

        const total = await Conversation.countDocuments({ user: userId });

        res.status(200).json({ conversations, total, pages: Math.ceil(total / limit) });
    } catch (err) {
        logger.error('[getUserConversations]', err);
        res.status(500).json({ message: 'Error fetching user conversations' });
    }
};

const getConversationDetails = async (req, res) => {
    try {
        const { userId, conversationId } = req.params;

        const conversation = await Conversation.findOne({ user: userId, conversationId }).lean();
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        const messages = await getMessages({ conversationId }, null, { sort: { createdAt: 1 } });

        res.status(200).json({ conversation, messages });
    } catch (err) {
        logger.error('[getConversationDetails]', err);
        res.status(500).json({ message: 'Error fetching conversation details' });
    }
};

const getAllCompanyInfo = async (req, res) => {
    try {
        logger.info('[AdminController] [getAllCompanyInfo] Fetching all company info...');
        
        let CompanyInfoModel;
        try {
            CompanyInfoModel = mongoose.model('CompanyInfo');
        } catch (e) {
            logger.info('[AdminController] [getAllCompanyInfo] CompanyInfo model not registered, requiring manually...');
            CompanyInfoModel = require('~/models/CompanyInfo');
        }

        const companyInfos = await CompanyInfoModel.find({}).lean();
        logger.info(`[AdminController] [getAllCompanyInfo] Found ${companyInfos.length} company info records`);

        const users = await User.find({}, 'email name username').lean();
        logger.info(`[AdminController] [getAllCompanyInfo] Mapping against ${users.length} users`);

        const userMap = {};
        users.forEach(u => {
            if (u._id) {
                userMap[u._id.toString()] = u;
            }
        });

        const result = companyInfos.map(info => ({
            ...info,
            userEmail: userMap[info.user]?.email || 'N/A',
            userName: userMap[info.user]?.name || userMap[info.user]?.username || 'N/A',
        }));

        logger.info(`[AdminController] [getAllCompanyInfo] Successfully prepared ${result.length} records for export`);
        res.status(200).json(result);
    } catch (err) {
        logger.error('[AdminController] [getAllCompanyInfo] Error:', err);
        res.status(500).json({ message: 'Error fetching all company info', error: err.message });
    }
};

const getUserReferralDetails = async (req, res) => {
    try {
        const { userId } = req.params;
        const Partner = require('~/models/Partner');
        const PointTransaction = require('~/models/PointTransaction');
        const PayoutRequest = require('~/models/PayoutRequest');
        const PartnerCommission = require('~/models/PartnerCommission');

        // 1. Calculate points balance
        const pointsResult = await PointTransaction.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, balance: { $sum: '$points' } } }
        ]);
        const pointsBalance = pointsResult.length > 0 ? pointsResult[0].balance : 0;

        // 2. Fetch partner details if exists
        const partner = await Partner.findOne({ userId }).lean();

        // 3. If partner exists, fetch commission statistics and payout history
        let commissionsStats = { pending: 0, approved: 0, requested: 0, paid: 0 };
        let payoutRequests = [];

        if (partner) {
            const partnerId = partner._id;

            // Fetch commission aggregate sums
            const commStatsAgg = await PartnerCommission.aggregate([
                { $match: { partnerId: new mongoose.Types.ObjectId(partnerId) } },
                {
                    $group: {
                        _id: null,
                        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$commissionAmount', 0] } },
                        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$commissionAmount', 0] } },
                        requested: { $sum: { $cond: [{ $eq: ['$status', 'requested'] }, '$commissionAmount', 0] } },
                        paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$commissionAmount', 0] } }
                    }
                }
            ]);

            if (commStatsAgg.length > 0) {
                commissionsStats = {
                    pending: commStatsAgg[0].pending,
                    approved: commStatsAgg[0].approved,
                    requested: commStatsAgg[0].requested,
                    paid: commStatsAgg[0].paid
                };
            }

            // Fetch payout requests
            payoutRequests = await PayoutRequest.find({ partnerId }).sort({ createdAt: -1 }).lean();
        }
        // 4. Fetch company & automation limits and created counts
        const UserPlan = require('~/db/models/UserPlan');
        const CompanyInfo = require('~/models/CompanyInfo');
        const Automation = require('~/models/Automation');
        const ReferralRecord = require('~/models/ReferralRecord');

        const userPlanDoc = await UserPlan.findOne({ userId }).lean();
        const companyLimit = userPlanDoc ? userPlanDoc.companyLimit : null;
        const automationLimit = userPlanDoc ? userPlanDoc.automationLimit : null;
        const subUserLimit = userPlanDoc ? userPlanDoc.subUserLimit : null;

        const [createdCompaniesCount, createdAutomationsCount, createdSubUsersCount] = await Promise.all([
            CompanyInfo.countDocuments({ user: userId }),
            Automation.countDocuments({ user: userId }),
            User.countDocuments({ parentUser: userId, isSubUser: true })
        ]);

        const referralRecord = await ReferralRecord.findOne({ referredUserId: userId }).lean();
        const referredByPartner = referralRecord ? referralRecord.referredByPartner : null;

        return res.json({
            pointsBalance,
            partner,
            commissionsStats,
            payoutRequests,
            companyLimit,
            automationLimit,
            subUserLimit,
            createdCompaniesCount,
            createdAutomationsCount,
            createdSubUsersCount,
            referredByPartner
        });
    } catch (err) {
        logger.error('[getUserReferralDetails] Error:', err);
        return res.status(500).json({ message: 'Error al obtener detalles de referidos del usuario.' });
    }
};

const getAmbassadors = async (req, res) => {
    try {
        const Partner = require('~/models/Partner');
        const partners = await Partner.find({ status: 'approved' })
            .populate('userId', 'name email username')
            .lean();
        
        const result = partners.map(p => ({
            _id: p._id,
            slug: p.slug,
            type: p.type,
            name: p.userId?.name || p.userId?.username || p.slug || 'Sin nombre',
            email: p.userId?.email || 'Sin correo',
        }));
        
        res.status(200).json(result);
    } catch (err) {
        logger.error('[getAmbassadors]', err);
        res.status(500).json({ message: 'Error fetching ambassadors' });
    }
};

module.exports = { 
    getAllUsers, 
    createUser, 
    updateUser, 
    deleteUser, 
    bulkUpdateUsers, 
    getUserConversations, 
    getConversationDetails, 
    getAllCompanyInfo,
    getUserReferralDetails,
    getAmbassadors
};
