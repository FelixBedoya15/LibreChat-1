const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { logger } = require('~/config');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const CompanyInfo = require('~/models/CompanyInfo');
const SgsstWorker = require('~/models/SgsstWorker');

// Helper to access PerfilSociodemograficoData model dynamically
const getPerfilSociodemograficoDataModel = () => {
    if (!mongoose.models.PerfilSociodemograficoData) {
        try {
            require('./perfilSociodemografico');
        } catch (e) {
            // Ignore if already loaded or on fallback
        }
    }
    return mongoose.models.PerfilSociodemograficoData;
};

// Helper to get User model safely
const getUserModel = () => {
    return mongoose.models.User || mongoose.model('User');
};

/**
 * Resolves the effective sub-user limit for a given user.
 * Pro users have 1 by default, Admin/Custom 999, others 0.
 * If userPlan.subUserLimit is explicitly configured by an Admin, that takes precedence.
 */
async function getEffectiveSubUserLimit(userId, userRole) {
    const UserPlan = mongoose.models.UserPlan || require('~/db/models/UserPlan');
    const userPlanDoc = await UserPlan.findOne({ userId }).lean();
    let plan = userPlanDoc?.plan;
    if (!plan || plan === 'free') {
        if (userRole === 'ADMIN') plan = 'admin';
        else if (userRole === 'USER_PRO') plan = 'pro';
        else if (userRole === 'USER_PLUS') plan = 'plus';
        else if (userRole === 'USER_GO') plan = 'go';
        else if (userRole === 'USER_CUSTOM') plan = 'custom';
        else if (userRole === 'USER_IPEVAR') plan = 'ipevar';
        else plan = 'free';
    }

    if (userPlanDoc?.subUserLimit !== undefined && userPlanDoc?.subUserLimit !== null) {
        return { limit: userPlanDoc.subUserLimit, plan };
    }

    if (['admin', 'custom'].includes(plan)) {
        return { limit: 999, plan };
    }
    if (plan === 'pro') {
        return { limit: 1, plan };
    }
    return { limit: 0, plan };
}

/**
 * GET /api/sgsst/subusers/limits
 * Returns current subuser limits and usage for the authenticated parent user.
 */
router.get('/limits', requireJwtAuth, async (req, res) => {
    try {
        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'Acceso no permitido para sub-usuarios' });
        }

        const User = getUserModel();
        const { limit, plan } = await getEffectiveSubUserLimit(req.user.id, req.user.role);
        const count = await User.countDocuments({ parentUser: req.user.id, isSubUser: true });

        res.json({
            limit,
            count,
            canCreate: count < limit,
            plan
        });
    } catch (error) {
        logger.error('[SGSST SubUsers] GET /limits error:', error);
        res.status(500).json({ error: 'Error al consultar límites de sub-usuarios' });
    }
});

/**
 * GET /api/sgsst/subusers/me-permissions
 * Returns current authenticated user sub-user metadata and permissions
 */
router.get('/me-permissions', requireJwtAuth, async (req, res) => {
    try {
        const User = getUserModel();
        const user = await User.findById(req.user.id)
            .select('isSubUser parentUser assignedCompany workerDocument workerId subUserPermissions subUserStatus email name role')
            .lean();

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        let assignedCompanyInfo = null;
        if (user.assignedCompany) {
            assignedCompanyInfo = await CompanyInfo.findById(user.assignedCompany).select('companyName nit').lean();
        }

        res.json({
            isSubUser: !!user.isSubUser,
            parentUser: user.parentUser || null,
            assignedCompany: user.assignedCompany || null,
            assignedCompanyInfo,
            workerDocument: user.workerDocument || null,
            workerId: user.workerId || null,
            subUserPermissions: user.subUserPermissions || [],
            subUserStatus: user.subUserStatus || 'active',
            email: user.email,
            name: user.name
        });
    } catch (error) {
        logger.error('[SGSST SubUsers] GET /me-permissions error:', error);
        res.status(500).json({ error: 'Error al consultar permisos de usuario' });
    }
});

/**
 * GET /api/sgsst/subusers
 * Returns list of all sub-users created by the authenticated parent user.
 */
router.get('/', requireJwtAuth, async (req, res) => {
    try {
        const User = getUserModel();
        
        // Prevent subusers from managing subusers
        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'No tienes permisos para administrar sub-usuarios' });
        }

        const subusers = await User.find({ parentUser: req.user.id, isSubUser: true })
            .select('name email workerDocument workerId assignedCompany subUserPermissions subUserStatus createdAt updatedAt')
            .sort({ createdAt: -1 })
            .lean();

        // Attach company names for convenience
        const companyIds = [...new Set(subusers.map(u => u.assignedCompany).filter(Boolean))];
        const companies = await CompanyInfo.find({ _id: { $in: companyIds } }).select('_id companyName nit').lean();
        const companyMap = new Map(companies.map(c => [String(c._id), c]));

        const enrichedSubusers = subusers.map(su => ({
            ...su,
            company: su.assignedCompany ? (companyMap.get(String(su.assignedCompany)) || null) : null
        }));

        res.json(enrichedSubusers);
    } catch (error) {
        logger.error('[SGSST SubUsers] GET / error:', error);
        res.status(500).json({ error: 'Error al listar sub-usuarios' });
    }
});

/**
 * GET /api/sgsst/subusers/available-workers
 * Returns all workers registered in PerfilSociodemografico / SgsstWorker for parent's companies,
 * indicating if a sub-user already exists for each.
 */
router.get('/available-workers', requireJwtAuth, async (req, res) => {
    try {
        const User = getUserModel();
        const parentUserId = req.user.id;

        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'No tienes permisos para consultar trabajadores disponibles' });
        }

        // 1. Get all companies belonging to this user
        const companies = await CompanyInfo.find({ user: parentUserId }).select('_id companyName nit').lean();
        if (!companies || companies.length === 0) {
            return res.json([]);
        }

        const companyIds = companies.map(c => c._id);
        const companyMap = new Map(companies.map(c => [String(c._id), c]));

        // 2. Get existing sub-users of this parent
        const existingSubusers = await User.find({ parentUser: parentUserId, isSubUser: true })
            .select('_id email name workerDocument assignedCompany subUserStatus')
            .lean();

        const subuserDocMap = new Map();
        existingSubusers.forEach(su => {
            if (su.workerDocument) {
                const key = `${String(su.assignedCompany || '')}_${String(su.workerDocument).trim()}`;
                subuserDocMap.set(key, su);
            }
        });

        // 3. Load workers from PerfilSociodemograficoData
        const PerfilSocioModel = getPerfilSociodemograficoDataModel();
        const workersMap = new Map(); // key: companyId_doc -> worker obj

        if (PerfilSocioModel) {
            const profiles = await PerfilSocioModel.find({ user: parentUserId }).lean();
            for (const profile of profiles) {
                const compId = profile.companyId || (companies[0]?._id);
                if (!compId) continue;

                if (Array.isArray(profile.trabajadores)) {
                    for (const w of profile.trabajadores) {
                        if (!w.identificacion) continue;
                        const doc = String(w.identificacion).trim();
                        const key = `${String(compId)}_${doc}`;
                        
                        const sub = subuserDocMap.get(key);
                        workersMap.set(key, {
                            id: w.id || w._id || doc,
                            identificacion: doc,
                            nombre: w.nombre || 'Sin Nombre',
                            email: w.correoElectronico || '',
                            cargo: w.cargo || '',
                            companyId: compId,
                            companyName: companyMap.get(String(compId))?.companyName || 'Empresa Principal',
                            hasSubUser: !!sub,
                            subUserId: sub?._id || null,
                            subUserEmail: sub?.email || null,
                            subUserStatus: sub?.subUserStatus || null
                        });
                    }
                }
            }
        }

        // 4. Also supplement from SgsstWorker in case any worker is only in SgsstWorker collection
        const sgsstWorkers = await SgsstWorker.find({ user: parentUserId }).lean();
        for (const sw of sgsstWorkers) {
            if (!sw.documento) continue;
            const doc = String(sw.documento).trim();
            const compId = sw.companyId || (companies[0]?._id);
            if (!compId) continue;

            const key = `${String(compId)}_${doc}`;
            if (!workersMap.has(key)) {
                const sub = subuserDocMap.get(key);
                workersMap.set(key, {
                    id: sw.perfilId || sw._id || doc,
                    identificacion: doc,
                    nombre: sw.nombre || 'Sin Nombre',
                    email: '',
                    cargo: '',
                    companyId: compId,
                    companyName: companyMap.get(String(compId))?.companyName || 'Empresa Principal',
                    hasSubUser: !!sub,
                    subUserId: sub?._id || null,
                    subUserEmail: sub?.email || null,
                    subUserStatus: sub?.subUserStatus || null
                });
            }
        }

        const result = Array.from(workersMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(result);
    } catch (error) {
        logger.error('[SGSST SubUsers] GET /available-workers error:', error);
        res.status(500).json({ error: 'Error al consultar trabajadores disponibles' });
    }
});

/**
 * POST /api/sgsst/subusers
 * Creates a new sub-user account linked to a worker in PerfilSociodemografico.
 */
router.post('/', requireJwtAuth, async (req, res) => {
    try {
        const User = getUserModel();
        const parentUserId = req.user.id;

        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'No tienes permisos para crear sub-usuarios' });
        }

        // Limit & Plan verification
        const { limit: effectiveLimit, plan: userPlanName } = await getEffectiveSubUserLimit(parentUserId, req.user.role);
        if (effectiveLimit <= 0) {
            return res.status(403).json({
                error: 'La creación de sub-usuarios es una función exclusiva del Plan Wappy Pro. Actualiza tu suscripción a Wappy Pro o solicita cupos al administrador.'
            });
        }

        const currentSubUsersCount = await User.countDocuments({ parentUser: parentUserId, isSubUser: true });
        if (currentSubUsersCount >= effectiveLimit) {
            return res.status(400).json({
                error: `Has alcanzado el límite de ${effectiveLimit} sub-usuario(s) permitido(s) para tu cuenta. Contacta al administrador si requieres cupos adicionales.`
            });
        }

        const {
            email,
            password,
            name,
            workerDocument,
            workerId,
            assignedCompany,
            subUserPermissions
        } = req.body;

        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'El correo electrónico es obligatorio' });
        }

        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres para cumplir las políticas de seguridad del sistema' });
        }

        if (!workerDocument || !String(workerDocument).trim()) {
            return res.status(400).json({ error: 'Debe seleccionar un trabajador registrado en el Perfil Sociodemográfico' });
        }

        if (!assignedCompany) {
            return res.status(400).json({ error: 'Debe asignar una empresa válida' });
        }

        // Verify company belongs to parent user
        const company = await CompanyInfo.findOne({ _id: assignedCompany, user: parentUserId });
        if (!company) {
            return res.status(400).json({ error: 'La empresa seleccionada no pertenece a tu cuenta' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanDoc = String(workerDocument).trim();

        // Check if email already exists
        const existingEmailUser = await User.findOne({ email: cleanEmail });
        if (existingEmailUser) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado en el sistema. Utilice otro correo.' });
        }

        // Check if a subuser already exists for this exact worker in this company
        const existingSubUserForWorker = await User.findOne({
            parentUser: parentUserId,
            assignedCompany,
            workerDocument: cleanDoc,
            isSubUser: true
        });
        if (existingSubUserForWorker) {
            return res.status(400).json({ error: `Ya existe una cuenta de sub-usuario para el trabajador con cédula ${cleanDoc} en esta empresa.` });
        }

        // Hash password
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);

        // Sanitize permissions
        const validPermissions = Array.isArray(subUserPermissions) ? subUserPermissions : [];

        const newSubUser = new User({
            name: (name || 'Colaborador SST').trim(),
            username: cleanEmail,
            email: cleanEmail,
            password: hashedPassword,
            emailVerified: true,
            provider: 'local',
            role: 'USER',
            isSubUser: true,
            parentUser: parentUserId,
            assignedCompany: company._id,
            workerDocument: cleanDoc,
            workerId: workerId || cleanDoc,
            subUserPermissions: validPermissions,
            subUserStatus: 'active',
            termsAccepted: true
        });

        await newSubUser.save();

        logger.info(`[SGSST SubUsers] Subuser created: ${cleanEmail} linked to worker ${cleanDoc} (parent: ${parentUserId})`);

        res.status(201).json({
            success: true,
            message: 'Sub-usuario creado exitosamente',
            subUser: {
                _id: newSubUser._id,
                name: newSubUser.name,
                email: newSubUser.email,
                workerDocument: newSubUser.workerDocument,
                assignedCompany: newSubUser.assignedCompany,
                subUserPermissions: newSubUser.subUserPermissions,
                subUserStatus: newSubUser.subUserStatus,
                createdAt: newSubUser.createdAt
            }
        });
    } catch (error) {
        logger.error('[SGSST SubUsers] POST / error:', error);
        res.status(500).json({ error: error.message || 'Error al crear sub-usuario' });
    }
});

/**
 * PUT /api/sgsst/subusers/:id
 * Updates permissions, assigned company, status (active/suspended) or resets password.
 */
router.put('/:id', requireJwtAuth, async (req, res) => {
    try {
        const User = getUserModel();
        const parentUserId = req.user.id;
        const subUserId = req.params.id;

        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'No tienes permisos para modificar sub-usuarios' });
        }

        const subUser = await User.findOne({ _id: subUserId, parentUser: parentUserId, isSubUser: true });
        if (!subUser) {
            return res.status(404).json({ error: 'Sub-usuario no encontrado o no pertenece a tu cuenta' });
        }

        const {
            name,
            password,
            assignedCompany,
            subUserPermissions,
            subUserStatus
        } = req.body;

        if (name && name.trim()) {
            subUser.name = name.trim();
        }

        if (assignedCompany) {
            const company = await CompanyInfo.findOne({ _id: assignedCompany, user: parentUserId });
            if (!company) {
                return res.status(400).json({ error: 'La empresa especificada no es válida' });
            }
            subUser.assignedCompany = company._id;
        }

        if (Array.isArray(subUserPermissions)) {
            subUser.subUserPermissions = subUserPermissions;
        }

        if (subUserStatus && ['active', 'suspended'].includes(subUserStatus)) {
            subUser.subUserStatus = subUserStatus;
        }

        if (password && password.trim()) {
            if (password.length < 8) {
                return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres para cumplir las políticas de seguridad del sistema' });
            }
            const salt = bcrypt.genSaltSync(10);
            subUser.password = bcrypt.hashSync(password, salt);
        }

        await subUser.save();

        logger.info(`[SGSST SubUsers] Subuser updated: ${subUser.email} (status: ${subUser.subUserStatus})`);

        res.json({
            success: true,
            message: 'Sub-usuario actualizado correctamente',
            subUser: {
                _id: subUser._id,
                name: subUser.name,
                email: subUser.email,
                workerDocument: subUser.workerDocument,
                assignedCompany: subUser.assignedCompany,
                subUserPermissions: subUser.subUserPermissions,
                subUserStatus: subUser.subUserStatus,
                updatedAt: subUser.updatedAt
            }
        });
    } catch (error) {
        logger.error('[SGSST SubUsers] PUT /:id error:', error);
        res.status(500).json({ error: 'Error al actualizar sub-usuario' });
    }
});

/**
 * DELETE /api/sgsst/subusers/:id
 * Deletes a sub-user account (revokes access, worker profile remains in sociodemográfico).
 */
router.delete('/:id', requireJwtAuth, async (req, res) => {
    try {
        const User = getUserModel();
        const parentUserId = req.user.id;
        const subUserId = req.params.id;

        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'No tienes permisos para eliminar sub-usuarios' });
        }

        const { deleteAllUserSessions } = require('~/models');
        const { deleteUserKey } = require('~/server/services/UserService');

        const result = await User.deleteOne({ _id: subUserId, parentUser: parentUserId, isSubUser: true });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Sub-usuario no encontrado o ya fue eliminado' });
        }

        // Clean up subuser sessions and API keys immediately
        try {
            await deleteAllUserSessions({ userId: subUserId });
            await deleteUserKey({ userId: subUserId, all: true });
        } catch (cleanupErr) {
            logger.error(`[SGSST SubUsers] Error cleaning up sessions/keys for deleted subuser ${subUserId}:`, cleanupErr);
        }

        logger.info(`[SGSST SubUsers] Subuser deleted with ID: ${subUserId} by parent: ${parentUserId}`);

        res.json({
            success: true,
            message: 'Acceso de sub-usuario eliminado correctamente'
        });
    } catch (error) {
        logger.error('[SGSST SubUsers] DELETE /:id error:', error);
        res.status(500).json({ error: 'Error al eliminar sub-usuario' });
    }
});

module.exports = router;
