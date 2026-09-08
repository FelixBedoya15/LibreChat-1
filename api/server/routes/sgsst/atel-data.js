const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { logger } = require('~/config');
const CompanyInfo = require('~/models/CompanyInfo');

// ─── Helper: Obtener Empresa Activa ──────────────────────────────────────────
async function getActiveCompanyId(userId) {
    let active = await CompanyInfo.findOne({ user: userId, isActive: true });
    if (!active) active = await CompanyInfo.findOne({ user: userId });
    return active ? active._id : null;
}

// ─── Mongoose Schema ─────────────────────────────────────────────────
// We use a flexible schema for MonthData to avoid strict validation issues with dynamic fields
const MonthDataSchema = new mongoose.Schema({
    numTrabajadores: { type: mongoose.Schema.Types.Mixed, default: '' }, // number or empty string
    diasProgramados: { type: mongoose.Schema.Types.Mixed, default: '' },
    events: [{
        id: String,
        fecha: String,
        tipo: String, // 'AT', 'EL', 'Ausentismo'
        causaInmediata: String,
        peligro: String,
        consecuencia: String,
        diasIncapacidad: Number,
        diasCargados: Number,
        parteCuerpo: String,
    }]
}, { _id: false });

const ATELAnnualDataSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    companyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CompanyInfo', 
        required: false 
    },
    year: {
        type: Number,
        required: true
    },
    months: {
        type: Map,
        of: MonthDataSchema,
        default: {}
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});
ATELAnnualDataSchema.index({ user: 1, companyId: 1, year: 1 }, { unique: true });

// Create model (or retrieve if exists to avoid overwrite error in HMR)
const ATELAnnualData = mongoose.models.ATELAnnualData || mongoose.model('ATELAnnualData', ATELAnnualDataSchema);

// ─── Routes ──────────────────────────────────────────────────────────

// GET /api/sgsst/atel-data/years/list
router.get('/years/list', requireJwtAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const companyId = await getActiveCompanyId(userId);
        const query = { user: userId };
        if (companyId) query.companyId = companyId;
        const recordedYears = await ATELAnnualData.distinct('year', query);
        res.json({ years: (recordedYears || []).map(Number).sort((a, b) => b - a) });
    } catch (error) {
        logger.error('[SGSST ATEL Data] Error fetching years list:', error);
        res.status(500).json({ error: 'Error al listar años con registros' });
    }
});

// GET /api/sgsst/atel-data/:year
router.get('/:year', requireJwtAuth, async (req, res) => {
    try {
        const { year } = req.params;
        const userId = req.user.id;
        const companyId = await getActiveCompanyId(userId);

        const data = await ATELAnnualData.findOne({ user: userId, companyId: companyId, year: Number(year) });

        if (!data) {
            // Return empty structure if not found
            return res.json({ months: {} });
        }

        res.json(data);
    } catch (error) {
        logger.error('[SGSST ATEL Data] Error fetching data:', error);
        res.status(500).json({ error: 'Error al cargar datos anuales' });
    }
});

// POST /api/sgsst/atel-data/save
router.post('/save', requireJwtAuth, async (req, res) => {
    try {
        const { year, annualData } = req.body;
        const userId = req.user.id;

        if (!year || !annualData) {
            return res.status(400).json({ error: 'Año y datos requeridos' });
        }
        
        const companyId = await getActiveCompanyId(userId);

        // Upsert
        const result = await ATELAnnualData.findOneAndUpdate(
            { user: userId, companyId: companyId, year: Number(year) },
            {
                $set: {
                    months: annualData,
                    companyId,
                    updatedAt: new Date()
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // ─── LÓGICA DE INTEGRALIDAD AVANZADA (SST 360) ───────────────────────────
        const feedWorkerEvent = require('./feedWorkerHelper');
        if (annualData) {
            for (const monthKey of Object.keys(annualData)) {
                const monthInfo = annualData[monthKey];
                if (monthInfo && monthInfo.events && Array.isArray(monthInfo.events)) {
                    for (const ev of monthInfo.events) {
                        // Sincronizar si tiene un documento, workerId o id del trabajador asociado
                        const docIdentificacion = ev.documento || ev.workerId || ev.id;
                        if (docIdentificacion && String(docIdentificacion).trim().length > 3) {
                            const descSiniestro = `[Siniestro ${ev.tipo}] Peligro: ${ev.peligro || 'N/A'}. Causa: ${ev.causaInmediata || 'N/A'}. Incap: ${ev.diasIncapacidad || 0} días.`;
                            
                            await feedWorkerEvent(
                                userId,
                                docIdentificacion,
                                'atel',
                                descSiniestro,
                                -50, // Penalización de gamificación preventiva
                                ev.id,
                                {
                                    tipo: ev.tipo === 'AT' ? 'Accidente de Trabajo' : (ev.tipo === 'EL' ? 'Enfermedad Laboral' : 'Ausentismo Médico'),
                                    diasIncapacidad: ev.diasIncapacidad || 0,
                                    diasCargados: ev.diasCargados || 0,
                                    parteCuerpo: ev.parteCuerpo || '',
                                    peligro: ev.peligro || '',
                                    consecuencia: ev.consecuencia || ''
                                }
                            );
                        }

                        // Si es un Accidente de Trabajo (AT), iniciar/crear una investigación
                        if (ev.tipo === 'AT') {
                            try {
                                const InvestigacionAtel = require('../../../models/InvestigacionAtelData');
                                const existingInvest = await InvestigacionAtel.findOne({
                                    user: userId,
                                    companyId,
                                    id: ev.id
                                });
                                if (!existingInvest) {
                                    const initialFormData = {
                                        tipoEvento: 'Accidente Leve',
                                        fechaEvento: ev.fecha || new Date().toISOString().split('T')[0],
                                        horaEvento: '08:00',
                                        lugarEvento: '',
                                        departamento: '',
                                        municipio: '',
                                        afectadoNombre: '',
                                        afectadoCedula: '',
                                        afectadoCargo: '',
                                        afectadoEps: '',
                                        afectadoArl: '',
                                        tipoContrato: 'Indefinido',
                                        jornadaLaboral: 'Diurna',
                                        experienciaLaboral: '',
                                        tiempoEnCargo: '',
                                        actividadMomento: ev.peligro || '',
                                        descripcionHechos: ev.causaInmediata ? `Causa inmediata reportada: ${ev.causaInmediata}.` : '',
                                        consecuencias: ev.consecuencia || '',
                                        diasIncapacidad: String(ev.diasIncapacidad || '0'),
                                        naturalezaLesion: ev.consecuencia || '',
                                        agenteCausal: ev.causaInmediata || '',
                                        parteCuerpo: ev.parteCuerpo || '',
                                    };

                                    await InvestigacionAtel.create({
                                        id: ev.id,
                                        user: userId,
                                        companyId,
                                        formData: initialFormData,
                                        equipoList: [
                                            { nombre: '', cedula: '', rol: 'Jefe Inmediato / Supervisor' },
                                            { nombre: '', cedula: '', rol: 'Representante COPASST / Vigía' },
                                            { nombre: '', cedula: '', rol: 'Encargado SST / HSEQ' },
                                        ],
                                        testigosList: [
                                            { nombre: '', cedula: '', cargo: '', testimonio: '' }
                                        ],
                                        images: {
                                            foto1: null,
                                            foto2: null,
                                            foto3: null,
                                            foto4: null
                                        },
                                        video: null,
                                        inboxTestimonios: [],
                                        updatedAt: new Date()
                                    });
                                    logger.info(`[SGSST ATEL] Creada investigación automática para accidente con ID: ${ev.id}`);
                                }
                            } catch (atelErr) {
                                logger.error('[SGSST ATEL] Error al crear investigación automática:', atelErr);
                            }
                        }

                    }
                }
            }
        }

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('[SGSST ATEL Data] Error saving data:', error);
        res.status(500).json({ error: 'Error al guardar datos anuales' });
    }
});

module.exports = router;
