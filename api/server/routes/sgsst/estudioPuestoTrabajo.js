const express = require('express');
const mongoose = require('mongoose');
const { generateWithKeyRotation, resolveApiKeys } = require('./sgsstGemini');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const CompanyInfo = require('~/models/CompanyInfo');
const EstudioPuestoTrabajo = require('~/models/EstudioPuestoTrabajo');
const SgsstWorker = require('~/models/SgsstWorker');
const { buildStandardHeader, buildWorkerSubHeader, buildSignatureSection, buildCompanyContextString } = require('./reportHeader');
const { logger } = require('~/config');

// Ensure PerfilSociodemograficoData schema is loaded
require('./perfilSociodemografico');
const PerfilSociodemograficoData = mongoose.models.PerfilSociodemograficoData;

const router = express.Router();

// ─── Helper: Obtener Empresa Activa ──────────────────────────────────────────
async function getActiveCompanyId(userId, subUserAssignedCompany = null) {
  if (subUserAssignedCompany) return subUserAssignedCompany;
  let active = await CompanyInfo.findOne({ user: userId, isActive: true });
  if (!active) active = await CompanyInfo.findOne({ user: userId });
  return active ? active._id : null;
}

// ─── Helper: Sincronizar Trabajador con Perfil Sociodemográfico ───────────────
async function syncWorkerWithCompanyProfile({ companyId, userId, workerName, workerId, cargo, actividad, actionLevel }) {
  if (!companyId || !workerId) return null;
  const cleanDoc = String(workerId).trim();
  const cleanName = String(workerName || '').trim();
  const cleanCargo = String(cargo || '').trim();

  try {
    let perfilDoc = await PerfilSociodemograficoData.findOne({ companyId });
    if (!perfilDoc && userId) {
      perfilDoc = new PerfilSociodemograficoData({
        user: userId,
        companyId: companyId,
        trabajadores: [],
      });
    }

    if (perfilDoc) {
      const existingIdx = perfilDoc.trabajadores.findIndex(
        (w) => w.identificacion && String(w.identificacion).trim() === cleanDoc
      );

      const currentDateStr = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      const biomechanicalNote = `EPT (${currentDateStr}): Puesto ${cleanCargo}. Nivel de Acción: ${actionLevel || 'Evaluado'}. Actividad: ${actividad || 'General'}`;

      if (existingIdx >= 0) {
        // Trabajador ya existe: asociar estudio y actualizar antecedentes biomecánicos
        const currentWorker = perfilDoc.trabajadores[existingIdx];
        if (!currentWorker.cargo && cleanCargo) currentWorker.cargo = cleanCargo;
        currentWorker.completedByAI = true;
        currentWorker.diagnosticoMedico = currentWorker.diagnosticoMedico
          ? `${currentWorker.diagnosticoMedico} | ${biomechanicalNote}`
          : biomechanicalNote;
        perfilDoc.markModified('trabajadores');
        await perfilDoc.save();
        logger.info(`[EPT Sync] Worker ${cleanDoc} updated with EPT study in company ${companyId}`);

        // Mantener también en SgsstWorker
        if (userId) {
          await SgsstWorker.findOneAndUpdate(
            { companyId, documento: cleanDoc },
            {
              $set: {
                user: userId,
                companyId,
                documento: cleanDoc,
                nombre: currentWorker.nombre || cleanName,
                perfilId: cleanDoc,
                condicionesSalud: `EPT ergonómico registrado: ${actionLevel || 'Completado'}`,
                updatedAt: new Date(),
              },
            },
            { upsert: true, new: true }
          ).catch((err) => logger.warn('[EPT Sync] SgsstWorker upsert warning:', err.message));
        }
      } else {
        // Trabajador aún no registrado en la empresa:
        // No se crea un perfil incompleto prematuramente. El estudio se conserva en EstudioPuestoTrabajo
        // y en el chat, listo para integrarse automáticamente cuando el usuario cree al trabajador desde el chat.
        logger.info(`[EPT Sync] Worker ${cleanDoc} does not exist yet in company profile. Study kept in chat/EPT collection pending integration.`);
      }
    }
  } catch (err) {
    logger.error('[EPT Sync] Error syncing worker with company profile:', err);
  }
}

// ─── GET /api/sgsst/estudio-puesto/company/:companyId ─────────────────────────
router.get('/company/:companyId', requireJwtAuth, async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!companyId) return res.status(400).json({ error: 'companyId requerido' });

    const studies = await EstudioPuestoTrabajo.find({ companyId })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate ergonomic KPIs
    const total = studies.length;
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    studies.forEach((s) => {
      const risk = s.riskLevel || 'Bajo';
      const action = s.actionLevel || '';
      if (risk === 'Crítico' || action.includes('4')) critical++;
      else if (risk === 'Alto' || action.includes('3')) high++;
      else if (risk === 'Medio' || action.includes('2')) medium++;
      else low++;
    });

    return res.json({
      success: true,
      studies,
      kpis: {
        total,
        critical,
        high,
        medium,
        low,
        criticalPct: total > 0 ? Math.round((critical / total) * 100) : 0,
        highPct: total > 0 ? Math.round((high / total) * 100) : 0,
        mediumPct: total > 0 ? Math.round((medium / total) * 100) : 0,
        lowPct: total > 0 ? Math.round((low / total) * 100) : 0,
      },
    });
  } catch (err) {
    logger.error('[EPT Routes] GET /company error:', err);
    return res.status(500).json({ error: 'Error al obtener estudios de puesto' });
  }
});

// ─── GET /api/sgsst/estudio-puesto/workers/:companyId ──────────────────────────
router.get('/workers/:companyId', requireJwtAuth, async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!companyId) return res.status(400).json({ error: 'companyId requerido' });

    const perfilDoc = await PerfilSociodemograficoData.findOne({ companyId }).lean();
    const workers = (perfilDoc?.trabajadores || []).map((w) => ({
      id: w.id || w._id,
      nombre: w.nombre || '',
      identificacion: w.identificacion || '',
      cargo: w.cargo || '',
    }));

    return res.json({ success: true, workers });
  } catch (err) {
    logger.error('[EPT Routes] GET /workers error:', err);
    return res.status(500).json({ error: 'Error al listar trabajadores' });
  }
});

// ─── GET /api/sgsst/estudio-puesto/:id ─────────────────────────────────────────
router.get('/:id', requireJwtAuth, async (req, res) => {
  try {
    const study = await EstudioPuestoTrabajo.findById(req.params.id).lean();
    if (!study) return res.status(404).json({ error: 'Estudio no encontrado' });
    return res.json({ success: true, study });
  } catch (err) {
    logger.error('[EPT Routes] GET /:id error:', err);
    return res.status(500).json({ error: 'Error al obtener estudio' });
  }
});

// ─── POST /api/sgsst/estudio-puesto ───────────────────────────────────────────
router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const {
      _id,
      companyId,
      workerId,
      workerName,
      cargo,
      actividad,
      evaluationType,
      evaluatorName,
      telemetry,
      evidences,
      rulaScore,
      rebaScore,
      actionLevel,
      riskLevel,
      reportHtml,
      notes,
      channel,
      modelUsed,
    } = req.body;

    const resolvedCompanyId = companyId || (await getActiveCompanyId(req.user.id));
    if (!resolvedCompanyId) {
      return res.status(400).json({ error: 'No se encontró empresa activa asociada.' });
    }

    if (!workerId || !workerName || !cargo) {
      return res.status(400).json({ error: 'Nombre del trabajador, cédula y cargo son obligatorios.' });
    }

    let study;
    if (_id) {
      study = await EstudioPuestoTrabajo.findByIdAndUpdate(
        _id,
        {
          companyId: resolvedCompanyId,
          user: req.user.id,
          workerId: String(workerId).trim(),
          workerName: String(workerName).trim(),
          cargo: String(cargo).trim(),
          actividad: String(actividad || '').trim(),
          evaluationType: evaluationType || 'auto',
          evaluatorName: evaluatorName || 'Auto-reporte asistido por WAPPY IA',
          telemetry: telemetry || {},
          evidences: evidences || [],
          rulaScore: rulaScore || null,
          rebaScore: rebaScore || null,
          actionLevel: actionLevel || 'Nivel 1 - Aceptable',
          riskLevel: riskLevel || 'Bajo',
          reportHtml: reportHtml || '',
          notes: notes || '',
          channel: channel || 'somos_sst',
          modelUsed: modelUsed || 'gemini-3.7-flash',
        },
        { new: true }
      );
    } else {
      study = new EstudioPuestoTrabajo({
        companyId: resolvedCompanyId,
        user: req.user.id,
        workerId: String(workerId).trim(),
        workerName: String(workerName).trim(),
        cargo: String(cargo).trim(),
        actividad: String(actividad || '').trim(),
        evaluationType: evaluationType || 'auto',
        evaluatorName: evaluatorName || 'Auto-reporte asistido por WAPPY IA',
        telemetry: telemetry || {},
        evidences: evidences || [],
        rulaScore: rulaScore || null,
        rebaScore: rebaScore || null,
        actionLevel: actionLevel || 'Nivel 1 - Aceptable',
        riskLevel: riskLevel || 'Bajo',
        reportHtml: reportHtml || '',
        notes: notes || '',
        channel: channel || 'somos_sst',
        modelUsed: modelUsed || 'gemini-3.7-flash',
      });
      await study.save();
    }

    // Auto-sincronizar trabajador con la empresa
    await syncWorkerWithCompanyProfile({
      companyId: resolvedCompanyId,
      userId: req.user.id,
      workerName,
      workerId,
      cargo,
      actividad,
      actionLevel,
    });

    return res.json({ success: true, study });
  } catch (err) {
    logger.error('[EPT Routes] POST / error:', err);
    return res.status(500).json({ error: 'Error al guardar estudio de puesto de trabajo' });
  }
});

// ─── POST /api/sgsst/estudio-puesto/generate-report ───────────────────────────
router.post('/generate-report', requireJwtAuth, async (req, res) => {
  try {
    const {
      companyId,
      studyId,
      workerName,
      workerId,
      cargo,
      actividad,
      evaluationType = 'auto',
      evaluatorName,
      telemetry = {},
      evidences = [],
      rulaScore,
      rebaScore,
      actionLevel = 'Nivel 1 - Aceptable',
      riskLevel = 'Bajo',
      model = 'gemini-3.7-flash',
    } = req.body;

    const resolvedCompanyId = companyId || (await getActiveCompanyId(req.user.id));
    const companyInfo = await CompanyInfo.findById(resolvedCompanyId).lean();

    // 1. Encabezado principal corporativo (100% intacto)
    const currentDate = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const standardHeaderHtml = buildStandardHeader({
      title: 'INFORME TÉCNICO DE EVALUACIÓN ERGONÓMICA Y BIOMECÁNICA (EPT)',
      companyInfo: companyInfo || {},
      date: currentDate,
      norm: 'Resolución 2400 de 1979 / GTC 45 / ISO 11226 / Métodos RULA y REBA',
      responsibleName: req.user?.name || companyInfo?.responsibleSST,
    });

    // 2. Sub-encabezado oficial para el trabajador y la tarea
    const workerSubHeaderHtml = buildWorkerSubHeader({
      workerName: workerName || 'Trabajador Evaluado',
      workerId: workerId || 'No registrado',
      cargo: cargo || 'Puesto de Trabajo',
      actividad: actividad || 'Evaluación de postura y ergonomía en ciclo regular',
      evaluationType: evaluationType || 'auto',
      evaluatorName: evaluatorName || req.user?.name,
    });

    // 3. Formatear bloque de evidencias fotográficas
    let evidencesHtml = '';
    if (Array.isArray(evidences) && evidences.length > 0) {
      const photosCards = evidences
        .map((ev, idx) => {
          const phaseNum = ev.phase || idx + 1;
          const phaseTitle = ev.label || `Fase ${phaseNum}`;
          const telem = ev.telemetry || {};
          const anglesSummary = [
            telem.neckAngle ? `Cuello: ${telem.neckAngle}°` : null,
            telem.trunkAngle ? `Tronco: ${telem.trunkAngle}°` : null,
            telem.armAngle ? `Brazo: ${telem.armAngle}°` : null,
            telem.elbowAngle ? `Codo: ${telem.elbowAngle}°` : null,
          ]
            .filter(Boolean)
            .join(' | ');

          return `
          <div style="flex:1; min-width:240px; max-width:320px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
            <div style="background:#0f766e; color:#ffffff; padding:6px 12px; font-size:11px; font-weight:700; text-transform:uppercase;">
              Fase ${phaseNum}: ${phaseTitle}
            </div>
            <div style="height:200px; background:#000000; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              <img src="${ev.url}" style="width:100%; height:100%; object-fit:cover;" alt="Evidencia Fase ${phaseNum}" />
            </div>
            ${
              anglesSummary
                ? `<div style="padding:6px 10px; font-size:10px; background:#f0fdfa; color:#0f766e; font-weight:600; text-align:center; border-top:1px solid #ccfbf1;">
                📐 ${anglesSummary}
               </div>`
                : ''
            }
          </div>`;
        })
        .join('');

      evidencesHtml = `
      <div style="margin:20px 0; page-break-inside:avoid;">
        <h3 style="color:#0f766e; font-size:14px; font-weight:700; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
          📸 Registro Fotográfico Multifase y Mediciones Articulares MediaPipe
        </h3>
        <div style="display:flex; flex-wrap:wrap; gap:16px; justify-content:center;">
          ${photosCards}
        </div>
      </div>`;
    }

    // 4. Prompt para generar el análisis ergonómico con el modelo IA seleccionado
    const companyContext = buildCompanyContextString(companyInfo);
    const telemetryJson = JSON.stringify(telemetry, null, 2);

    const prompt = `
Eres el Fisioterapeuta Laboral y Auditor Ergonómico Especialista de WAPPY IA.
Genera el cuerpo técnico de un INFORME OFICIAL DE EVALUACIÓN DE PUESTO DE TRABAJO (EPT) bajo normatividad colombiana (Resolución 2400 de 1979, Decreto 1072 de 2015, GTC 45, e ISO 11226).

${companyContext}

DATOS DEL ESTUDIO:
- Trabajador: ${workerName} (C.C. ${workerId})
- Cargo evaluado: ${cargo}
- Actividad laboral: ${actividad}
- Modalidad: ${evaluationType === 'auto' ? 'Auto-evaluación en línea' : 'Evaluación Asistida'}
- Puntuación RULA estimada: ${rulaScore || '4-5'}
- Puntuación REBA estimada: ${rebaScore || '4'}
- Nivel de Acción: ${actionLevel}
- Nivel de Riesgo Global: ${riskLevel}
- Telemetría MediaPipe capturada:
${telemetryJson}

REGLAS DE FORMATO Y SALIDA:
- NO incluyas encabezados de empresa ni títulos globales (ya están creados en el sub-encabezado).
- Devuelve ÚNICAMENTE código HTML limpio estructurado con etiquetas <h3>, <p>, <ul>, <li> y tablas <div class="table-responsive"><table style="width:100%; min-width:800px; border-collapse:separate; border-radius:10px; border:1px solid #cbd5e1;">...</table></div>.
- El contenido debe incluir:
  1. <h3>1. Justificación y Alcance Biomecánico del Puesto</h3>
  2. <h3>2. Análisis Postural por Segmento Corporal (Cuello, Tronco, Extremidades Superiores e Inferiores)</h3>
  3. <h3>3. Matriz de Valoración Ergonómica RULA / REBA</h3> (tabla comparativa con criterios, puntuaciones de grupo A y B, y nivel de acción).
  4. <h3>4. Factores Contribuyentes de Carga Física y Entorno (Mesa, Pantalla, Silla, Iluminación)</h3>
  5. <h3>5. Plan de Intervención y Recomendaciones de Higiene Postural (Pausas activas dirigidas, ajustes dimensionales)</h3>
  6. <h3>6. Dictamen de Aptitud Biomecánica y Seguimiento</h3>
- Utiliza tono técnico, riguroso, médico-laboral y proactivo.
`;

    const aiResponse = await generateWithKeyRotation({
      userId: req.user.id,
      model: model || 'gemini-3.7-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: 'Eres un Fisioterapeuta Laboral experto en Ergonomía, RULA, REBA e ISO 11226.',
    });

    let aiHtml = aiResponse?.text || '<p>Análisis ergonómico completado satisfactoriamente.</p>';
    // Clean code fences if returned
    aiHtml = aiHtml.replace(/```html/gi, '').replace(/```/g, '').trim();

    // 5. Firmas unificadas
    const signatureHtml = buildSignatureSection({
      companyInfo: companyInfo || {},
      responsibleName: req.user?.name || companyInfo?.responsibleSST,
      worker: { nombre: workerName, identificacion: workerId, cargo },
    });

    // 6. Ensamblado final del reporte
    const finalReportHtml = `
<div class="report-container" style="font-family:'Segoe UI',Arial,sans-serif; max-width:900px; margin:0 auto; color:#111827; line-height:1.6;">
  <style>
    .ai-report-content h3 { color: #0f766e; margin-top: 22px; margin-bottom: 10px; font-weight: 700; border-bottom: 1px solid #ccfbf1; padding-bottom: 5px; font-size: 1.15em; }
    .ai-report-content p, .ai-report-content li { color: #334155; margin-bottom: 8px; font-size: 0.95em; }
    .ai-report-content .table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0; border-radius: 10px; border: 1px solid #e2e8f0; }
    .ai-report-content table { width: 100%; min-width: 800px; table-layout: auto; border-collapse: separate; border-spacing: 0; margin: 0; font-size: 0.85em; }
    .ai-report-content th { background-color: #0f766e; color: #ffffff; padding: 9px 10px; text-align: left; }
    .ai-report-content td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
    .ai-report-content tr:nth-child(even) td { background-color: #f8fafc; }
  </style>

  ${standardHeaderHtml}
  ${workerSubHeaderHtml}
  ${evidencesHtml}

  <div class="ai-report-content" style="background:#ffffff; padding:10px 0;">
    ${aiHtml}
  </div>

  ${signatureHtml}
</div>`.trim();

    // Actualizar en el estudio si studyId fue suministrado
    if (studyId) {
      await EstudioPuestoTrabajo.findByIdAndUpdate(studyId, {
        reportHtml: finalReportHtml,
        modelUsed: model || 'gemini-3.7-flash',
      });
    }

    return res.json({
      success: true,
      reportHtml: finalReportHtml,
    });
  } catch (err) {
    logger.error('[EPT Routes] POST /generate-report error:', err);
    return res.status(500).json({ error: 'Error al generar informe técnico ergonómico' });
  }
});

// ─── DELETE /api/sgsst/estudio-puesto/:id ──────────────────────────────────────
router.delete('/:id', requireJwtAuth, async (req, res) => {
  try {
    const deleted = await EstudioPuestoTrabajo.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Estudio no encontrado' });
    return res.json({ success: true, message: 'Estudio eliminado correctamente' });
  } catch (err) {
    logger.error('[EPT Routes] DELETE /:id error:', err);
    return res.status(500).json({ error: 'Error al eliminar estudio' });
  }
});

module.exports = router;
