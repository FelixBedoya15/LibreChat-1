const express = require('express');
const router = express.Router();
const { logger } = require('~/config');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const CompanyInfo = require('~/models/CompanyInfo');
const { setMemory } = require('~/models');
const { Tokenizer } = require('@librechat/api');
const mongoose = require('mongoose');
const UserPlan = require('~/db/models/UserPlan');

/**
 * Helper to migrate legacy data (companyId: null) to the user's oldest company.
 * This runs automatically in the background when companies are loaded.
 */
async function migrateLegacyData(userId, firstCompanyId) {
    const models = [
        mongoose.models.PerfilCargoData,
        mongoose.models.PerfilSociodemograficoData,
        mongoose.models.ProgramaCapacitacionesData,
        mongoose.models.MatrizLegalData,
        mongoose.models.ReporteActosData,
        mongoose.models.AnalisisVulnerabilidadData,
        mongoose.models.ParticipacionIpevarData,
        mongoose.models.AnalisisTrabajoSeguroData,
        mongoose.models.MetodoOwasData,
        mongoose.models.PermisoAlturasData,
        mongoose.models.MatrizPeligrosData,
        mongoose.models.AltaDireccionData,
        mongoose.models.ATELAnnualData,
        mongoose.models.InvestigacionAtelData,
        mongoose.models.LiveEditorSession,
        mongoose.models.GTC45WorkspaceSession,
        mongoose.models.SgsstWorker
    ];
    
    for (const model of models) {
        if (model) {
            try {
                await model.updateMany(
                    { user: userId, $or: [{ companyId: null }, { companyId: { $exists: false } }] },
                    { $set: { companyId: firstCompanyId } }
                );
            } catch (err) {
                // Ignore errors if model is not yet initialized or collection missing
            }
        }
    }
    
    // Migrate legacy report conversations
    try {
        const ConversationModel = mongoose.models.Conversation || require('~/db/models').Conversation;
        if (ConversationModel) {
            const internalTagsRegex = /^sgsst-/;
            const companyTagRegex = /^company-/;
            
            const legacyReports = await ConversationModel.find({
                user: userId,
                tags: { $regex: internalTagsRegex, $not: companyTagRegex }
            });
            
            for (const report of legacyReports) {
                if (report.tags && !report.tags.some(t => t.startsWith('company-'))) {
                    report.tags.push(`company-${firstCompanyId}`);
                    await report.save();
                }
            }
        }
    } catch (err) {
        // Ignore errors if Conversation model fails to load or update
    }
}

/**
 * Syncs the AI automated memory for a given company data.
 * ALWAYS uses agentId='global' so the memory is visible to ALL agents.
 * Uses a single atomic setMemory (upsert) to prevent duplicate empresa_sgsst entries.
 */
async function syncCompanyMemory(userId, companyData) {
    try {
        const memoryContent = `Razón Social / Nombre: ${companyData.companyName || 'N/A'}
Tipo de Empresa: ${companyData.companyType || 'Persona Jurídica'}
Documento de Identidad (NIT / CC): ${companyData.nit || 'N/A'}
Representante Legal: ${companyData.legalRepresentative || 'N/A'}
Cédula del Representante Legal: ${companyData.legalRepresentativeId || 'N/A'}
Número de Trabajadores: ${companyData.workerCount || 'N/A'}
ARL: ${companyData.arl || 'N/A'}
Nivel de Riesgo (ARL): ${companyData.riskLevel || 'N/A'}
Actividad Económica: ${companyData.economicActivity || 'N/A'}
Código CIIU: ${companyData.ciiu || 'N/A'}
Sector: ${companyData.sector || 'N/A'}
Dirección: ${companyData.address || 'N/A'} (Ciudad: ${companyData.city || 'N/A'}, Departamento: ${companyData.departamento || 'N/A'})
Responsable SG-SST: ${companyData.responsibleSST || 'N/A'}
Nivel de Formación SST: ${companyData.formationLevel || 'N/A'}
Número de Licencia SST: ${companyData.licenseNumber || 'N/A'}
Vigencia de Licencia: ${companyData.licenseExpiry || 'N/A'}
Actualización Curso 50/20H: ${companyData.courseStatus || 'N/A'}
Descripción General de Actividades (Sede Principal): ${companyData.generalActivities || 'N/A'}`;

        let sedesStr = '';
        if (companyData.sedes && Array.isArray(companyData.sedes) && companyData.sedes.length > 0) {
            sedesStr = '\n\nOtras Sedes:\n' + companyData.sedes.map(s => `- Sede: ${s.nombre || 'N/A'}
  Dirección: ${s.address || 'N/A'} (Ciudad: ${s.city || 'N/A'}, Departamento: ${s.departamento || 'N/A'})
  Teléfono: ${s.phone || 'N/A'} - Correo: ${s.email || 'N/A'}
  Actividades de Sede: ${s.generalActivities || 'N/A'}`).join('\n');
        }
        
        const memoryContentFinal = memoryContent + sedesStr;
        const memoryKey = 'empresa_sgsst';
        const tokenCount = Tokenizer.getTokenCount(memoryContentFinal, 'o200k_base') || 0;
        
        // Wipe ALL previous empresa_sgsst entries for this user (regardless of agentId)
        // to guarantee there is ONLY EVER ONE active company memory entry.
        const MemoryEntry = mongoose.models.MemoryEntry;
        if (MemoryEntry) {
            await MemoryEntry.deleteMany({ userId, key: memoryKey });
        }
        
        await setMemory({ userId, agentId: 'global', key: memoryKey, value: memoryContentFinal, tokenCount });

        logger.debug(`[SGSST CompanyInfo] Synced single empresa_sgsst memory for user ${userId} (agentId=global)`);
    } catch (memError) {
        logger.error('[SGSST CompanyInfo] Error syncing automatic memory:', memError);
    }
}

/**
 * GET /api/sgsst/company-info
 * Returns the currently ACTIVE company info. Falls back to first if none active.
 */
router.get('/', requireJwtAuth, async (req, res) => {
    try {
        const targetUserId = (req.user.isSubUser && req.user.parentUser) ? req.user.parentUser : req.user.id;
        let info = null;

        if (req.user.isSubUser && req.user.assignedCompany) {
            info = await CompanyInfo.findOne({ _id: req.user.assignedCompany, user: targetUserId }).lean();
        }

        if (!info) {
            info = await CompanyInfo.findOne({ user: targetUserId, isActive: true }).lean();
        }
        if (!info) {
            info = await CompanyInfo.findOne({ user: targetUserId }).lean();
            if (info && !req.user.isSubUser) {
                // Auto-activate the first one found for legacy support
                await CompanyInfo.updateOne({ _id: info._id }, { isActive: true });
                info.isActive = true;
            }
        }
        
        if (info && !req.user.isSubUser) {
            // Auto-purge any legacy/duplicate company memories and ensure only active company memory exists
            syncCompanyMemory(targetUserId, info).catch(e => logger.error('[SGSST] Memory auto-purge error:', e));
            // Background migration for backward compatibility
            migrateLegacyData(targetUserId, info._id).catch(e => logger.error('[SGSST] Migration error:', e));
        }
        
        res.json(info || {});
    } catch (error) {
        logger.error('[SGSST CompanyInfo] GET error:', error);
        res.status(500).json({ error: 'Error loading company info' });
    }
});

/**
 * GET /api/sgsst/company-info/all
 * Returns all companies for the authenticated user.
 */
router.get('/all', requireJwtAuth, async (req, res) => {
    try {
        const targetUserId = (req.user.isSubUser && req.user.parentUser) ? req.user.parentUser : req.user.id;
        
        let companies = [];
        if (req.user.isSubUser && req.user.assignedCompany) {
            // Sub-users only get their assigned company
            companies = await CompanyInfo.find({ _id: req.user.assignedCompany, user: targetUserId }).lean();
        } else {
            companies = await CompanyInfo.find({ user: targetUserId }).sort({ createdAt: 1 }).lean();
        }
        
        // Auto-fix: Ensure at most one company is active to prevent duplicates
        if (!req.user.isSubUser) {
            const activeCompanies = companies.filter(c => c.isActive);
            if (activeCompanies.length > 1) {
                const keepActiveId = activeCompanies[0]._id;
                await CompanyInfo.updateMany(
                    { user: targetUserId, _id: { $ne: keepActiveId } },
                    { $set: { isActive: false } }
                );
                // Reload the list
                companies = await CompanyInfo.find({ user: targetUserId }).sort({ createdAt: 1 }).lean();
            }
            
            if (companies && companies.length > 0) {
                // Background migration: assign any null companyId data to the oldest company
                migrateLegacyData(targetUserId, companies[0]._id).catch(e => logger.error('[SGSST] Migration error:', e));
            }
        }

        res.json(companies);
    } catch (error) {
        logger.error('[SGSST CompanyInfo] GET /all error:', error);
        res.status(500).json({ error: 'Error loading all companies' });
    }
});

/**
 * POST /api/sgsst/company-info
 * Creates a new company profile (Max 3).
 */
router.post('/', requireJwtAuth, async (req, res) => {
    try {
        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'Los sub-usuarios no tienen permisos para crear empresas' });
        }
        const userId = req.user.id;
        
        // Obtener la fecha de creación del usuario de manera segura
        const User = mongoose.models.User || mongoose.model('User');
        const userDoc = await User.findById(userId).select('createdAt').lean();
        const userCreatedAt = userDoc?.createdAt ? new Date(userDoc.createdAt) : new Date();

        // Consultar el plan del usuario
        const userPlanDoc = await UserPlan.findOne({ userId }).lean();
        const planKey = userPlanDoc?.plan || 'free';

        // Calcular el límite dinámico
        let limit = 1;
        
        if (userPlanDoc && userPlanDoc.companyLimit !== undefined && userPlanDoc.companyLimit !== null) {
            limit = userPlanDoc.companyLimit;
        } else {
            if (planKey === 'pro') {
                // Regla del abuelo: usuarios pro registrados antes del cambio (23 de Junio de 2026 13:00 COT)
                const CUTOFF_DATE = new Date('2026-06-23T13:00:00-05:00');
                if (userCreatedAt < CUTOFF_DATE) {
                    limit = 3;
                } else {
                    limit = 1;
                }
            } else if (['admin', 'custom'].includes(planKey)) {
                limit = 999;
            } else {
                limit = 1; // free, go, plus, ipevar base
            }
        }

        const count = await CompanyInfo.countDocuments({ user: userId });
        if (count >= limit) {
            return res.status(400).json({ 
                error: `Límite máximo de ${limit} empresa(s) alcanzado para tu plan actual. Para gestionar más empresas, comunícate con soporte.` 
            });
        }

        // Deactivate others
        await CompanyInfo.updateMany({ user: userId }, { isActive: false });

        const newCompany = new CompanyInfo({
            ...req.body,
            user: userId,
            isActive: true,
        });

        await newCompany.save();
        await syncCompanyMemory(userId, newCompany);

        res.json(newCompany);
    } catch (error) {
        logger.error('[SGSST CompanyInfo] POST error:', error);
        res.status(500).json({ error: 'Error creating company info' });
    }
});

/**
 * PUT /api/sgsst/company-info/:id
 * Updates a specific company info.
 */
router.put('/:id', requireJwtAuth, async (req, res) => {
    try {
        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'Los sub-usuarios no tienen permisos para modificar la configuración de empresas' });
        }
        // Enforce single active company on update
        if (req.body.isActive === true) {
            await CompanyInfo.updateMany(
                { user: req.user.id, _id: { $ne: req.params.id } },
                { $set: { isActive: false } }
            );
        }

        // Enforce user ownership
        const info = await CompanyInfo.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            req.body,
            { new: true }
        );

        if (!info) return res.status(404).json({ error: 'Company not found' });

        if (info.isActive) {
            await syncCompanyMemory(req.user.id, info);
        }

        res.json(info);
    } catch (error) {
        logger.error('[SGSST CompanyInfo] PUT /:id error:', error);
        res.status(500).json({ error: 'Error saving company info' });
    }
});

/**
 * PUT /api/sgsst/company-info
 * Legacy fallback for updating the active company (Backwards compatibility).
 */
router.put('/', requireJwtAuth, async (req, res) => {
    try {
        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'Los sub-usuarios no tienen permisos para modificar la configuración de empresas' });
        }
        let active = await CompanyInfo.findOne({ user: req.user.id, isActive: true });
        if (!active) active = await CompanyInfo.findOne({ user: req.user.id });

        if (!active) {
            // Forward to POST if none exists
            req.url = '/';
            return router.handle(req, res);
        }

        if (req.body.isActive === true) {
            await CompanyInfo.updateMany(
                { user: req.user.id, _id: { $ne: active._id } },
                { $set: { isActive: false } }
            );
        }

        const info = await CompanyInfo.findOneAndUpdate(
            { _id: active._id },
            req.body,
            { new: true }
        );

        await syncCompanyMemory(req.user.id, info);
        res.json(info);
    } catch (error) {
        logger.error('[SGSST CompanyInfo] PUT (Legacy) error:', error);
        res.status(500).json({ error: 'Error saving company info' });
    }
});

/**
 * PUT /api/sgsst/company-info/:id/activate
 * Switches the active context.
 */
router.put('/:id/activate', requireJwtAuth, async (req, res) => {
    try {
        if (req.user.isSubUser) {
            return res.status(403).json({ error: 'Los sub-usuarios no pueden cambiar la empresa activa global' });
        }
        const target = await CompanyInfo.findOne({ _id: req.params.id, user: req.user.id });
        if (!target) return res.status(404).json({ error: 'Company not found' });

        await CompanyInfo.updateMany({ user: req.user.id }, { isActive: false });
        target.isActive = true;
        await target.save();

        await syncCompanyMemory(req.user.id, target);

        res.json(target);
    } catch (error) {
        logger.error('[SGSST CompanyInfo] PUT activate error:', error);
        res.status(500).json({ error: 'Error activating company' });
    }
});

module.exports = router;
