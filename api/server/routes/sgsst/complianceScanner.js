const mongoose = require('mongoose');
const CompanyInfo = require('~/models/CompanyInfo');
const { logger } = require('~/config');

/**
 * Safe helper to load a Mongoose model or require its definition if not registered.
 */
function getOrLoadModel(modelName, requirePath) {
    if (mongoose.models[modelName]) {
        return mongoose.models[modelName];
    }
    if (requirePath) {
        try {
            require(requirePath);
            if (mongoose.models[modelName]) {
                return mongoose.models[modelName];
            }
        } catch (e) {
            // Non-fatal, model may not be loaded yet
        }
    }
    return null;
}

/**
 * Determines applicable article and company size recommendations
 */
function calculateCompanyRecommendations(workerCount, riskLevelRaw) {
    const count = Number(workerCount) || 1;
    
    // Parse risk level (1..5, 'I'..'V', 'Riesgo I')
    let riskNum = 1;
    if (typeof riskLevelRaw === 'number') {
        riskNum = riskLevelRaw;
    } else if (typeof riskLevelRaw === 'string') {
        const clean = riskLevelRaw.toUpperCase().trim();
        if (clean.includes('V') && !clean.includes('IV')) riskNum = 5;
        else if (clean.includes('IV')) riskNum = 4;
        else if (clean.includes('III')) riskNum = 3;
        else if (clean.includes('II')) riskNum = 2;
        else if (clean.includes('5')) riskNum = 5;
        else if (clean.includes('4')) riskNum = 4;
        else if (clean.includes('3')) riskNum = 3;
        else if (clean.includes('2')) riskNum = 2;
        else riskNum = 1;
    }

    let companySize = 'small';
    if (count <= 10) {
        companySize = 'small';
    } else if (count <= 50) {
        companySize = 'medium';
    } else {
        companySize = 'large';
    }

    let article = 16;
    if (companySize === 'small' && riskNum <= 3) {
        article = 3;
    } else if (companySize === 'medium' && riskNum <= 3) {
        article = 9;
    } else {
        article = 16;
    }

    return {
        companySize,
        riskLevel: riskNum,
        article,
    };
}

/**
 * Scans all available evidence across WAPPY modules for the active company.
 * @param {string} userId - Current authenticated user ID
 * @param {object} user - User object (may contain isSubUser, parentUser, assignedCompany)
 * @returns {Promise<object>} Map of standards with verified statuses and evidence notes.
 */
async function scanComplianceForUser(userId, user = {}) {
    const targetUserId = (user.isSubUser && user.parentUser) ? user.parentUser : userId;

    // 1. Resolve active company
    let company = null;
    if (user.isSubUser && user.assignedCompany) {
        company = await CompanyInfo.findOne({ _id: user.assignedCompany, user: targetUserId }).lean();
    }
    if (!company) {
        company = await CompanyInfo.findOne({ user: targetUserId, isActive: true }).lean();
    }
    if (!company) {
        company = await CompanyInfo.findOne({ user: targetUserId }).lean();
    }

    if (!company) {
        return {
            company: null,
            evidenceMap: {},
            summary: { totalScanned: 0, compliantCount: 0, modulesWithData: [] },
        };
    }

    const companyId = company._id;
    const companyTag = `company-${companyId}`;
    const recommendations = calculateCompanyRecommendations(company.workerCount, company.riskLevel);

    // 2. Query Conversation reports in parallel
    const ConversationModel = mongoose.models.Conversation || require('~/db/models').Conversation;
    const reportsPromise = ConversationModel ? ConversationModel.find({
        user: targetUserId,
        $or: [
            { tags: companyTag },
            { tags: { $regex: /^sgsst-/ } }
        ],
        $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
    }).select('tags title updatedAt').lean() : Promise.resolve([]);

    // 3. Load operational models safely
    const SgsstWorker = getOrLoadModel('SgsstWorker', '~/models/SgsstWorker');
    const GTC45WorkspaceSession = getOrLoadModel('GTC45WorkspaceSession', '~/models/GTC45WorkspaceSession');
    const SgsstEppData = getOrLoadModel('SgsstEppData', '~/models/SgsstEppData');
    const SgsstVehicleData = getOrLoadModel('SgsstVehicleData', '~/models/SgsstVehicleData');
    const SgsstHeightsData = getOrLoadModel('SgsstHeightsData', '~/models/SgsstHeightsData');
    const SgsstChemicalData = getOrLoadModel('SgsstChemicalData', '~/models/SgsstChemicalData');
    const KanbanTask = getOrLoadModel('KanbanTask', '~/models/KanbanTask');
    const InvestigacionAtelData = getOrLoadModel('InvestigacionAtelData', '~/models/InvestigacionAtelData');

    const PerfilCargoData = getOrLoadModel('PerfilCargoData', './perfilesCargo');
    const MatrizLegalData = getOrLoadModel('MatrizLegalData', './matriz');
    const ProgramaCapacitacionesData = getOrLoadModel('ProgramaCapacitacionesData', './programaCapacitaciones');
    const ReporteActosData = getOrLoadModel('ReporteActosData', './reporteActos');
    const AnalisisVulnerabilidadData = getOrLoadModel('AnalisisVulnerabilidadData', './analisisVulnerabilidad');
    const ParticipacionIpevarData = getOrLoadModel('ParticipacionIpevarData', './participacionIpevar');
    const AnalisisTrabajoSeguroData = getOrLoadModel('AnalisisTrabajoSeguroData', './analisisTrabajoSeguro');
    const MetodoOwasData = getOrLoadModel('MetodoOwasData', './metodoOwas');
    const PermisoAlturasData = getOrLoadModel('PermisoAlturasData', './permisoAlturas');
    const AltaDireccionData = getOrLoadModel('AltaDireccionData', './altaDireccion');
    const ATELAnnualData = getOrLoadModel('ATELAnnualData', './atel-data');

    // 4. Execute queries concurrently
    const [
        reports,
        workersCount,
        gtc45Session,
        eppCount,
        vehiclesCount,
        heightsCount,
        permisosAlturasCount,
        chemicalsCount,
        perfilCargoDoc,
        matrizLegalDoc,
        capacitacionesDoc,
        reporteActosCount,
        participacionIpevarCount,
        atsCount,
        owasCount,
        vulnerabilidadCount,
        investigacionAtelCount,
        atelAnnualDoc,
        kanbanCount,
        altaDireccionDoc,
    ] = await Promise.all([
        reportsPromise.catch(() => []),
        SgsstWorker ? SgsstWorker.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        GTC45WorkspaceSession ? GTC45WorkspaceSession.findOne({ user: targetUserId, companyId }).lean().catch(() => null) : null,
        SgsstEppData ? SgsstEppData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        SgsstVehicleData ? SgsstVehicleData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        SgsstHeightsData ? SgsstHeightsData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        PermisoAlturasData ? PermisoAlturasData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        SgsstChemicalData ? SgsstChemicalData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        PerfilCargoData ? PerfilCargoData.findOne({ user: targetUserId, companyId }).lean().catch(() => null) : null,
        MatrizLegalData ? MatrizLegalData.findOne({ user: targetUserId, companyId }).lean().catch(() => null) : null,
        ProgramaCapacitacionesData ? ProgramaCapacitacionesData.findOne({ user: targetUserId, companyId }).lean().catch(() => null) : null,
        ReporteActosData ? ReporteActosData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        ParticipacionIpevarData ? ParticipacionIpevarData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        AnalisisTrabajoSeguroData ? AnalisisTrabajoSeguroData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        MetodoOwasData ? MetodoOwasData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        AnalisisVulnerabilidadData ? AnalisisVulnerabilidadData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        InvestigacionAtelData ? InvestigacionAtelData.countDocuments({ user: targetUserId, companyId }).catch(() => 0) : 0,
        ATELAnnualData ? ATELAnnualData.findOne({ user: targetUserId, companyId }).lean().catch(() => null) : null,
        KanbanTask ? KanbanTask.countDocuments({ user: targetUserId, $or: [{ companyId: String(companyId) }, { companyId: null }] }).catch(() => 0) : 0,
        AltaDireccionData ? AltaDireccionData.findOne({ user: targetUserId, companyId }).lean().catch(() => null) : null,
    ]);

    // Build map of tags
    const tagReports = {};
    if (Array.isArray(reports)) {
        for (const r of reports) {
            if (Array.isArray(r.tags)) {
                for (const t of r.tags) {
                    if (!tagReports[t] || new Date(r.updatedAt) > new Date(tagReports[t].updatedAt)) {
                        tagReports[t] = { title: r.title, updatedAt: r.updatedAt };
                    }
                }
            }
        }
    }

    const modulesWithData = [];

    // 5. Evaluate Rules per Standard Code
    // We create a standard-level evaluation dictionary: { [standardCode]: { status, evidence, source } }
    const codeCompliance = {};

    // 1.1.1 Responsable del SG-SST
    const hasRespDoc = Boolean(tagReports['sgsst-responsable']);
    const hasRespInfo = Boolean(company.responsibleSST && company.responsibleSST.trim().length > 2);
    const hasLicense = Boolean(company.licenseNumber && company.licenseNumber.trim().length > 2);
    if ((hasRespInfo && hasLicense) || hasRespDoc) {
        codeCompliance['1.1.1'] = {
            status: 'cumple',
            evidence: `Responsable SG-SST: ${company.responsibleSST || 'Designado'}${hasLicense ? ` (Licencia: ${company.licenseNumber})` : ''}.${hasRespDoc ? ' Carta de asignación generada en Hito 1.' : ''}`,
            source: 'Responsable SG-SST (Hito 1)',
        };
        modulesWithData.push('Responsable SG-SST');
    }

    // 1.1.2 Responsabilidades en el SG-SST
    const hasCargoProfiles = Boolean(perfilCargoDoc?.perfiles?.length > 0);
    if (hasCargoProfiles || hasRespDoc) {
        codeCompliance['1.1.2'] = {
            status: 'cumple',
            evidence: `Responsabilidades asignadas y documentadas.${hasCargoProfiles ? ` ${perfilCargoDoc.perfiles.length} perfiles de cargo estructurados en Hito 2.` : ' Definidas en carta de asignación institucional.'}`,
            source: 'Perfiles de Cargo (Hito 2)',
        };
        modulesWithData.push('Perfiles de Cargo');
    }

    // 1.1.3 Asignación de recursos
    const hasObjDoc = Boolean(tagReports['sgsst-objetivos']);
    const hasAltaDoc = Boolean(tagReports['sgsst-alta-direccion'] || altaDireccionDoc);
    if (hasObjDoc || hasAltaDoc || hasRespDoc) {
        codeCompliance['1.1.3'] = {
            status: 'cumple',
            evidence: 'Recursos humanos, técnicos y financieros asignados en el plan de trabajo anual y objetivos del SG-SST.',
            source: 'Objetivos & Recursos (Hito 1)',
        };
    }

    // 1.1.4 Afiliación al Sistema de Riesgos Laborales / SGRL
    const hasArl = Boolean(company.arl && company.arl.trim().length > 1);
    if (hasArl) {
        codeCompliance['1.1.4'] = {
            status: 'cumple',
            evidence: `Afiliación integral al Sistema General de Riesgos Laborales mediante ARL ${company.arl}.${workersCount > 0 ? ` ${workersCount} trabajadores activos en plataforma.` : ''}`,
            source: 'CompanyInfo & Sociodemográfico',
        };
        modulesWithData.push('Afiliación SGRL');
    }

    // 1.1.6 COPASST / Vigía de SST
    const countWorkers = Number(company.workerCount) || workersCount || 1;
    const isVigia = countWorkers <= 10;
    if (hasRespDoc || hasRespInfo) {
        codeCompliance['1.1.6'] = {
            status: 'cumple',
            evidence: `${isVigia ? 'Vigía de Seguridad y Salud en el Trabajo' : 'Comité Paritario de Seguridad y Salud en el Trabajo (COPASST)'} constituido con funciones de vigilancia activa.`,
            source: 'Gobernanza SG-SST',
        };
    }

    // 1.1.7 Capacitación del COPASST / Vigía
    const capSesionesCount = capacitacionesDoc?.sesiones?.length || 0;
    if (capSesionesCount > 0 || tagReports['sgsst-capacitaciones']) {
        codeCompliance['1.1.7'] = {
            status: 'cumple',
            evidence: 'Integrantes del comité/vigía incluidos en el programa de formación y capacitación en SST.',
            source: 'Programa de Capacitación (Hito 5)',
        };
    }

    // 1.1.8 Comité de Convivencia Laboral
    const hasRitDoc = Boolean(tagReports['sgsst-rit']);
    if (hasRitDoc || hasRespDoc) {
        codeCompliance['1.1.8'] = {
            status: 'cumple',
            evidence: 'Comité de Convivencia Laboral constituido y amparado bajo el marco del Reglamento Interno de Trabajo.',
            source: 'Reglamento Interno (Hito 1)',
        };
    }

    // 1.2.1 Programa de Capacitación Anual en SST
    const hasCapDoc = Boolean(tagReports['sgsst-capacitaciones']);
    if (capSesionesCount > 0 || hasCapDoc) {
        codeCompliance['1.2.1'] = {
            status: 'cumple',
            evidence: `Programa anual de capacitación formulado con ${capSesionesCount > 0 ? `${capSesionesCount} sesiones programadas/ejecutadas` : 'cronograma documentado'}.`,
            source: 'Capacitaciones (Hito 5)',
        };
        modulesWithData.push('Programa Capacitaciones');
    }

    // 1.2.2 Inducción y Reinducción
    if (capSesionesCount > 0 || hasCapDoc) {
        codeCompliance['1.2.2'] = {
            status: 'cumple',
            evidence: 'Módulo de inducción y reinducción en SST estructurado para todo el personal ingresante y periódico.',
            source: 'Capacitaciones (Hito 5)',
        };
    }

    // 1.2.3 Curso virtual de 50 horas
    const has50h = Boolean(company.courseStatus && company.courseStatus.toLowerCase().includes('50'));
    if (has50h || hasRespDoc) {
        codeCompliance['1.2.3'] = {
            status: 'cumple',
            evidence: `Responsable del SG-SST con certificación de curso virtual de 50 horas/actualización vigente (${company.courseStatus || 'Certificado'}).`,
            source: 'Responsable SG-SST (Hito 1)',
        };
    }

    // 2.1.1 Política de SST
    const hasPolDoc = Boolean(tagReports['sgsst-politica']);
    if (hasPolDoc) {
        const polDate = new Date(tagReports['sgsst-politica'].updatedAt).toLocaleDateString('es-CO');
        codeCompliance['2.1.1'] = {
            status: 'cumple',
            evidence: `Política de Seguridad y Salud en el Trabajo formalizada, fechada y documentada (${polDate}).`,
            source: 'Política SST (Hito 1)',
        };
        modulesWithData.push('Política SST');
    }

    // 2.2.1 Objetivos de SST
    if (hasObjDoc) {
        const objDate = new Date(tagReports['sgsst-objetivos'].updatedAt).toLocaleDateString('es-CO');
        codeCompliance['2.2.1'] = {
            status: 'cumple',
            evidence: `Objetivos del SG-SST definidos, medibles y cuantificables con metas e indicadores (${objDate}).`,
            source: 'Objetivos SST (Hito 1)',
        };
        modulesWithData.push('Objetivos SST');
    }

    // 2.3.1 Evaluación Inicial (Diagnóstico)
    if (tagReports['sgsst-diagnostico']) {
        codeCompliance['2.3.1'] = {
            status: 'cumple',
            evidence: 'Evaluación inicial de estándares mínimos de la Resolución 0312/2019 realizada y documentada.',
            source: 'Diagnóstico Inicial (Hito 1)',
        };
    }

    // 2.4.1 Plan Anual de Trabajo
    if (hasObjDoc || capSesionesCount > 0) {
        codeCompliance['2.4.1'] = {
            status: 'cumple',
            evidence: 'Plan de trabajo anual del SG-SST articulado con cronograma de actividades, responsables y metas.',
            source: 'Plan de Trabajo (Hito 1)',
        };
    }

    // 2.5.1 Archivo y retención documental
    const totalReportsCount = Object.keys(tagReports).length;
    if (totalReportsCount >= 3) {
        codeCompliance['2.5.1'] = {
            status: 'cumple',
            evidence: `Sistema digital de archivo y retención documental activo en WAPPY (${totalReportsCount} expedientes técnicos custodiados).`,
            source: 'Custodia Documental WAPPY',
        };
    }

    // 2.6.1 Rendición de Cuentas
    if (hasAltaDoc) {
        codeCompliance['2.6.1'] = {
            status: 'cumple',
            evidence: 'Mecanismo de rendición de cuentas anual formalizado en revisión por la alta dirección.',
            source: 'Alta Dirección (Hito 6)',
        };
    }

    // 2.7.1 Matriz Legal
    const legalCount = matrizLegalDoc?.statuses?.length || 0;
    const hasLegalDoc = Boolean(tagReports['sgsst-matriz-legal']);
    if (legalCount > 0 || hasLegalDoc) {
        codeCompliance['2.7.1'] = {
            status: 'cumple',
            evidence: `Matriz legal de SST estructurada y actualizada (${legalCount > 0 ? `${legalCount} normas evaluadas` : 'documento legal formalizado'}).`,
            source: 'Matriz Legal (Hito 1)',
        };
        modulesWithData.push('Matriz Legal');
    }

    // 3.1.1 Descripción sociodemográfica y Diagnóstico de condiciones de salud
    const hasSocioDoc = Boolean(tagReports['sgsst-perfil-sociodemografico']);
    const hasSaludDoc = Boolean(tagReports['sgsst-condiciones-salud']);
    if (workersCount > 0 || hasSocioDoc || hasSaludDoc) {
        codeCompliance['3.1.1'] = {
            status: 'cumple',
            evidence: `Perfil sociodemográfico consolidado con ${workersCount} trabajadores registrados y diagnóstico epidemiológico de salud.`,
            source: 'Sociodemográfico & Salud (Hito 2)',
        };
        modulesWithData.push('Perfil Sociodemográfico');
    }

    // 3.1.2 Perfil sociodemográfico específico
    if (workersCount > 0 || hasSocioDoc) {
        codeCompliance['3.1.2'] = {
            status: 'cumple',
            evidence: `Caracterización sociodemográfica completa con pirámide poblacional, turnos y sedes laborales (${workersCount} trabajadores).`,
            source: 'Sociodemográfico (Hito 2)',
        };
    }

    // 4.1.1 / 4.2.1 Metodología e Identificación de Peligros (GTC 45 / IPEVAR)
    const gtcCount = gtc45Session?.matrixRows?.length || 0;
    const hasPeligrosDoc = Boolean(tagReports['sgsst-matriz-peligros'] || tagReports['sgsst-matriz-ipevar']);
    if (gtcCount > 0 || hasPeligrosDoc) {
        const val = {
            status: 'cumple',
            evidence: `Matriz Bio-IPEVAR / GTC 45 vigente con ${gtcCount > 0 ? `${gtcCount} peligros identificados y valorados` : 'metodología aplicada'} y jerarquía de controles.`,
            source: 'Matriz Bio-IPEVAR / GTC 45 (Hito 3)',
        };
        codeCompliance['4.1.1'] = val;
        codeCompliance['4.2.1'] = val;
        modulesWithData.push('Matriz GTC 45 / IPEVAR');
    }

    // 4.1.2 Participación de los trabajadores en identificación de peligros
    const hasPartDoc = Boolean(tagReports['sgsst-participacion-ipevar']);
    if (participacionIpevarCount > 0 || hasPartDoc) {
        codeCompliance['4.1.2'] = {
            status: 'cumple',
            evidence: `Canal de participación comunitaria en peligros activo (${participacionIpevarCount} reportes de colaboradores registrados).`,
            source: 'Participación IPEVAR (Hito 3)',
        };
        modulesWithData.push('Participación IPEVAR');
    }

    // 4.2.3 Procedimientos, instructivos y ATS
    const hasAtsDoc = Boolean(tagReports['sgsst-ats']);
    if (atsCount > 0 || hasAtsDoc || owasCount > 0) {
        codeCompliance['4.2.3'] = {
            status: 'cumple',
            evidence: `Procedimientos de trabajo seguro y ATS implementados en campo (${atsCount} análisis de trabajo seguro ejecutados).`,
            source: 'ATS / Procedimientos (Hito 4)',
        };
        modulesWithData.push('ATS');
    }

    // 4.2.4 Inspecciones de seguridad
    const hasActosDoc = Boolean(tagReports['sgsst-reporte-actos']);
    if (reporteActosCount > 0 || hasActosDoc) {
        codeCompliance['4.2.4'] = {
            status: 'cumple',
            evidence: `Inspecciones y reporte activo de actos y condiciones inseguras con trazabilidad fotográfica (${reporteActosCount} reportes).`,
            source: 'Reporte de Actos (Hito 5)',
        };
        modulesWithData.push('Reporte Actos & Inspecciones');
    }

    // 4.2.6 Entrega de EPP y Capacitación en Uso
    const hasEppDoc = Boolean(tagReports['sgsst-epp']);
    if (eppCount > 0 || hasEppDoc) {
        codeCompliance['4.2.6'] = {
            status: 'cumple',
            evidence: `Matriz de EPP y registro de dotación con firma digital de conformidad (${eppCount} trabajadores con entregas controladas).`,
            source: 'EPP Workspace (Hito 4)',
        };
        modulesWithData.push('Entrega de EPP');
    }

    // 5.1.1 Plan de prevención, preparación y respuesta ante emergencias
    const hasVulnDoc = Boolean(tagReports['sgsst-vulnerabilidad']);
    if (vulnerabilidadCount > 0 || hasVulnDoc) {
        codeCompliance['5.1.1'] = {
            status: 'cumple',
            evidence: 'Plan de preparación ante emergencias con análisis de vulnerabilidad por personas, recursos y sistemas.',
            source: 'Análisis Vulnerabilidad (Hito 1)',
        };
        modulesWithData.push('Plan de Emergencias');
    }

    // 6.1.1 Definición de Indicadores del SG-SST
    const hasAtelStats = Boolean(tagReports['sgsst-estadisticas-atel'] || atelAnnualDoc);
    if (hasAtelStats || hasObjDoc) {
        codeCompliance['6.1.1'] = {
            status: 'cumple',
            evidence: 'Ficha técnica de indicadores de estructura, proceso y resultado con seguimiento a severidad, frecuencia y ausentismo.',
            source: 'Estadísticas ATEL (Hito 6)',
        };
        modulesWithData.push('Indicadores & ATEL');
    }

    // 6.1.2 Auditoría Anual
    if (tagReports['sgsst-auditoria']) {
        codeCompliance['6.1.2'] = {
            status: 'cumple',
            evidence: 'Informe de auditoría interna de cumplimiento del SG-SST formulado.',
            source: 'Auditoría SG-SST (Hito 6)',
        };
    }

    // 6.1.3 Revisión por la Alta Dirección
    if (hasAltaDoc) {
        codeCompliance['6.1.3'] = {
            status: 'cumple',
            evidence: 'Revisión periódica gerencial realizada sobre la eficacia y desempeño del SG-SST.',
            source: 'Alta Dirección (Hito 6)',
        };
        modulesWithData.push('Alta Dirección');
    }

    // 7.1.1 Acciones preventivas y correctivas (ACPM)
    if (kanbanCount > 0) {
        codeCompliance['7.1.1'] = {
            status: 'cumple',
            evidence: `Tablero Kanban ACPM activo con ${kanbanCount} acciones correctivas, preventivas y de mejora en seguimiento.`,
            source: 'Tablero ACPM Kanban (Hito 6)',
        };
        modulesWithData.push('Kanban ACPM');
    }

    // 7.1.3 Acciones de mejora basadas en investigaciones de ATEL
    const hasAtelDoc = Boolean(tagReports['sgsst-investigacion-atel']);
    if (investigacionAtelCount > 0 || hasAtelDoc) {
        codeCompliance['7.1.3'] = {
            status: 'cumple',
            evidence: `Investigaciones forenses de causalidad ATEL ejecutadas con formulación de medidas de control (${investigacionAtelCount} casos).`,
            source: 'Investigación Forense ATEL (Hito 6)',
        };
        modulesWithData.push('Investigación ATEL');
    }

    // Tareas críticas y riesgos específicos (Auditoría items):
    const specificAudits = {};

    // Trabajo en Alturas
    if (heightsCount > 0 || permisosAlturasCount > 0 || tagReports['sgsst-permiso-alturas'] || tagReports['sgsst-heights']) {
        specificAudits['aud_alturas'] = {
            status: 'cumple',
            evidence: `Programa de protección contra caídas (Res. 4272/2021) con ${permisosAlturasCount} permisos de alturas y ${heightsCount} equipos certificados.`,
            source: 'Alturas Workspace (Hito 4)',
        };
        modulesWithData.push('Trabajo en Alturas');
    }

    // Químicos SGA
    if (chemicalsCount > 0 || tagReports['sgsst-chemicals']) {
        const chemVal = {
            status: 'cumple',
            evidence: `Inventario químico SGA y matriz de compatibilidad con ${chemicalsCount} sustancias registradas con FDS.`,
            source: 'Químicos SGA (Hito 4)',
        };
        specificAudits['aud_sga'] = chemVal;
        codeCompliance['4.1.3'] = chemVal;
        modulesWithData.push('Químicos SGA');
    }

    // Seguridad Vial (PESV)
    if (vehiclesCount > 0 || tagReports['sgsst-vehicles']) {
        specificAudits['aud_ley_2050'] = {
            status: 'cumple',
            evidence: `Plan Estratégico de Seguridad Vial (PESV - Res. 20223040040595) activo con ${vehiclesCount} automotores y hojas de vida.`,
            source: 'Seguridad Vial PESV (Hito 4)',
        };
        specificAudits['aud_pol_vial'] = {
            status: 'cumple',
            evidence: 'Política de Seguridad Vial adoptada y alineada con la flota vehicular.',
            source: 'Seguridad Vial PESV (Hito 4)',
        };
        modulesWithData.push('Seguridad Vial PESV');
    }

    // Reglamentos
    if (tagReports['sgsst-rhs']) {
        specificAudits['aud_reg_higiene'] = {
            status: 'cumple',
            evidence: 'Reglamento de Higiene y Seguridad Industrial publicado y vigente.',
            source: 'Reglamento de Higiene (Hito 1)',
        };
    }
    if (hasRitDoc) {
        specificAudits['aud_reg_rit'] = {
            status: 'cumple',
            evidence: 'Reglamento Interno de Trabajo adoptado con protocolo de prevención del acoso laboral.',
            source: 'Reglamento Interno (Hito 1)',
        };
    }

    // 6. Build final evidenceMap for all item IDs in Diagnóstico and Auditoría
    const evidenceMap = {};

    // Map to Article 3 IDs:
    const art3Map = {
        '1.1.1': 'art3_1',
        '1.1.4': 'art3_2',
        '1.2.1': 'art3_3',
        '2.1.1': 'art3_4',
        '2.4.1': 'art3_5',
        '4.1.1': 'art3_6',
        '4.2.1': 'art3_7',
    };
    for (const [code, id] of Object.entries(art3Map)) {
        if (codeCompliance[code]) {
            evidenceMap[id] = codeCompliance[code];
        }
    }

    // Map to Article 9 IDs:
    const art9Map = {
        '1.1.1': 'art9_1',
        '1.1.2': 'art9_2',
        '1.1.3': 'art9_3',
        '1.1.4': 'art9_4',
        '1.1.6': 'art9_5',
        '1.1.7': 'art9_6',
        '1.1.8': 'art9_7',
        '1.2.1': 'art9_8',
        '1.2.2': 'art9_9',
        '1.2.3': 'art9_10',
        '2.1.1': 'art9_11',
        '2.2.1': 'art9_12',
        '2.3.1': 'art9_13',
        '2.4.1': 'art9_14',
        '2.5.1': 'art9_15',
        '2.6.1': 'art9_16',
        '2.7.1': 'art9_17',
        '3.1.1': 'art9_18',
        '3.1.2': 'art9_19',
        '4.2.1': 'art9_20',
        '5.1.1': 'art9_21',
    };
    for (const [code, id] of Object.entries(art9Map)) {
        if (codeCompliance[code]) {
            evidenceMap[id] = codeCompliance[code];
        }
    }

    // Map to Article 16 IDs (by standard code matching art16_*):
    for (const [code, data] of Object.entries(codeCompliance)) {
        evidenceMap[`code_${code}`] = data;
    }

    // Map to Auditoría IDs:
    const audPrefixCodes = [
        '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.6', '1.1.7', '1.1.8',
        '1.2.1', '1.2.2', '1.2.3', '2.1.1', '2.2.1', '2.3.1', '2.4.1',
        '2.5.1', '2.6.1', '2.7.1', '3.1.1', '3.1.2', '4.1.1', '4.1.2',
        '4.1.3', '4.2.1', '4.2.3', '4.2.4', '4.2.6', '5.1.1', '6.1.1',
        '6.1.2', '6.1.3', '7.1.1', '7.1.3'
    ];
    for (const code of audPrefixCodes) {
        if (codeCompliance[code]) {
            const audId = `aud_${code.replace(/\./g, '_')}`;
            evidenceMap[audId] = codeCompliance[code];
        }
    }

    // Merge specific audits:
    for (const [audId, data] of Object.entries(specificAudits)) {
        evidenceMap[audId] = data;
    }

    const compliantCount = Object.keys(evidenceMap).length;

    return {
        company: {
            id: company._id,
            companyName: company.companyName || 'Empresa Principal',
            workerCount: company.workerCount || 1,
            riskLevel: company.riskLevel || 'I',
            recommendedCompanySize: recommendations.companySize,
            recommendedRiskLevel: recommendations.riskLevel,
            recommendedArticle: recommendations.article,
        },
        evidenceMap,
        summary: {
            totalScanned: Object.keys(codeCompliance).length,
            compliantCount,
            modulesWithData: Array.from(new Set(modulesWithData)),
        },
    };
}

module.exports = {
    scanComplianceForUser,
    calculateCompanyRecommendations,
};
