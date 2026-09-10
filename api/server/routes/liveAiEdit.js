'use strict';

/**
 * liveAiEdit.js — Inline AI text editing for the Live Analysis Editor
 * POST /api/live/ai-edit-text
 * Body: { selectedText, instruction, surroundingContext?, fullReportText?, reportSourceData? }
 * Response: { editedText }
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { generateWithKeyRotation, SGSST_FALLBACK_MODELS } = require('./sgsst/sgsstGemini');
const { logger } = require('~/config');
const axios = require('axios');

router.post('/ai-edit-text', requireJwtAuth, async (req, res) => {
  const { selectedText, instruction, surroundingContext, fullReportText, reportSourceData } = req.body;
  const userId = req.user?.id;

  if (!selectedText || !instruction) {
    return res.status(400).json({ error: 'selectedText e instruction son requeridos.' });
  }

  // Sub-user access check for Live Analysis
  if (req.user?.isSubUser) {
    const perms = req.user.subUserPermissions || [];
    const hasLivePerm = perms.includes('ai:live_analysis');
    const { Key } = require('~/db/models');
    const hasOwnKey = await Key.exists({ userId: req.user.id });

    if (!hasLivePerm && !hasOwnKey) {
      return res.status(403).json({
        error: 'Tu perfil de sub-usuario no tiene permisos de Live Analysis IA de la empresa. Puedes configurar tus propias claves API en Configuración para habilitarlo de manera autónoma.'
      });
    }
  }

  // Build the source data context block if provided
  let sourceDataBlock = '';
  if (reportSourceData) {
    try {
      const dataStr = typeof reportSourceData === 'string'
        ? reportSourceData
        : JSON.stringify(reportSourceData, null, 2);
      // Limit to 4000 chars to avoid token overflow
      sourceDataBlock = `
DATOS DE ORIGEN DEL INFORME (base de datos utilizada para generar el informe):
\`\`\`json
${dataStr.slice(0, 4000)}${dataStr.length > 4000 ? '\n...(truncado)' : ''}
\`\`\`
`;
    } catch (e) {
      // ignore serialization errors
    }
  }

  // Use the entire report text if available, otherwise fall back to surroundingContext
  const reportContext = fullReportText || surroundingContext || '';

  // 1. WEB SEARCH (SearXNG) Integration
  let webContext = '';
  try {
      const searxngUrl = process.env.SEARXNG_INSTANCE_URL || 'https://searxng.wappy.club/search';
      
      // Perform a search based on the instruction provided by the user
      const searchResponse = await axios.get(searxngUrl, {
          params: { q: instruction, format: 'json', language: 'es' },
          timeout: 5000
      });

      if (searchResponse.data && searchResponse.data.results && searchResponse.data.results.length > 0) {
          const topResults = searchResponse.data.results.slice(0, 3);
          const formattedResults = topResults.map(r => `- ${r.title}: ${r.content}`).join('\n');
          webContext = `\nCONTEXTO ENCONTRADO EN INTERNET (SearXNG):\n${formattedResults}\n`;
      }
  } catch (searchError) {
      logger.warn(`[LiveAiEdit] SearXNG Web Search failed: ${searchError.message}`);
  }

  let fieldSpecificPrompt = '';
  if (reportSourceData && reportSourceData.field) {
    const field = reportSourceData.field;

    if (field === 'Factores de Reducción (Anexo E)') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Factores de Reducción (Anexo E)" de la matriz GTC-45.
TERMINANTEMENTE PROHIBIDO: No uses frases cortas como "Seguimiento a pausas activas. (Responsable: X, Mensual)".
OBLIGATORIO — Redacta un párrafo analítico de MÍNIMO 3 oraciones completas que:
1. Explique TÉCNICA y ESPECÍFICAMENTE por qué el control propuesto reduce el riesgo (mecanismo biomecánico, epidemiológico, toxicológico o conductual según aplique).
2. Sustente la VIABILIDAD TÉCNICA y FINANCIERA de la implementación, comparando el costo de la medida vs. el costo de la enfermedad laboral, el ausentismo o las compensaciones futuras.
3. Justifique la RELACIÓN COSTO-BENEFICIO: demuestra cómo la combinación de controles mejora la productividad operativa, reduce la siniestralidad y garantiza el cumplimiento normativo colombiano (Decreto 1072/2015, GTC-45).
Redacta con lenguaje técnico SST profesional. Basa tu análisis en los controles existentes y propuestos que aparecen en el contexto (datos de origen).`;

    } else if (field === 'Controles en la Fuente') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Controles en la Fuente" de la matriz GTC-45.
OBLIGATORIO — No te limites a nombrar el control. Analiza técnicamente:
1. Si los controles existentes actúan directamente sobre el origen del peligro (fuente generadora).
2. Su nivel de eficacia real frente al Nivel de Deficiencia (ND) calificado en la fila.
3. Qué tan robusto y suficiente es el control para el tipo de peligro y la clasificación del riesgo.
Usa lenguaje técnico propio de un higienista industrial o especialista SST.`;

    } else if (field === 'Controles en el Medio') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Controles en el Medio" de la matriz GTC-45.
OBLIGATORIO — Analiza técnicamente:
1. Si los controles en el medio de transmisión interrumpen o atenúan el peligro entre la fuente y el trabajador.
2. Su eficacia técnica específica para este tipo de peligro (barreras físicas, distancias, aislamientos, ventilación, etc.).
3. Si son suficientes para el ND y NE calificados, o qué complemento requieren.`;

    } else if (field === 'Controles en el Individuo') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Controles en el Individuo" de la matriz GTC-45.
OBLIGATORIO — Analiza técnicamente:
1. Las medidas de protección aplicadas directamente al trabajador (EPP, capacitación, vigilancia médica).
2. Su nivel de protección real y las limitaciones inherentes frente a los controles de ingeniería.
3. Si son suficientes para el nivel de riesgo calificado o qué complemento se requiere según la jerarquía GTC-45.`;

    } else if (field === 'Medida: Ingeniería') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Controles de Ingeniería" (medida propuesta) de la matriz GTC-45.
OBLIGATORIO — Sé técnico y específico:
1. Nombra el tipo EXACTO de control de ingeniería (rediseño ergonómico, guardas de seguridad, sistemas de extracción local, automatización, aislamiento acústico, etc.).
2. Explica el PRINCIPIO TÉCNICO por el cual este control elimina o reduce el peligro desde la fuente o el medio de transmisión.
3. Sustenta por qué tiene mayor efectividad permanente y es preferible a los controles administrativos o el EPP según la jerarquía de controles.`;

    } else if (field === 'Medida: Administrativos') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Controles Administrativos" (medida propuesta) de la matriz GTC-45.
OBLIGATORIO — Sé específico y sustancial:
1. Detalla los procedimientos documentados, programas de capacitación, sistemas de rotación, señalización o políticas concretas.
2. Explica CÓMO cada medida impactará directamente en la reducción del Nivel de Exposición (NE) o del Nivel de Deficiencia (ND).
3. Justifica por qué son necesarias como complemento a los controles de ingeniería para garantizar adherencia y sostenibilidad del programa de seguridad.`;

    } else if (field === 'Medida: Sustitución') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Sustitución" (medida propuesta) de la matriz GTC-45.
OBLIGATORIO — Sustenta analíticamente:
1. Por qué la sustitución propuesta es técnicamente viable para este peligro específico.
2. Qué nivel de riesgo residual (NR esperado) quedaría después de aplicarla.
3. Cómo se compara en términos de costo-beneficio frente a mantener el peligro actual o aplicar solo controles administrativos.`;

    } else if (field === 'Medida: Eliminación') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "Eliminación" (medida propuesta) de la matriz GTC-45.
Es el control de mayor jerarquía. OBLIGATORIO — Sustenta técnicamente:
1. Si la eliminación es viable, explica cómo se lograría desde el diseño del proceso, la actividad o la tarea.
2. Si NO aplica, argumenta técnicamente por qué no es factible para este peligro y qué controles sustitutos (ingeniería o administrativos) son los más efectivos como alternativa.`;

    } else if (field === 'Medida: EPP') {
      fieldSpecificPrompt = `ATENCIÓN: Estás editando el campo "EPP" (Equipos de Protección Personal) de la matriz GTC-45.
Recuerda: el EPP es el ÚLTIMO recurso en la jerarquía de controles.
OBLIGATORIO:
1. Especifica con referencia técnica exacta el EPP apropiado: norma de certificación (NTC, ANSI, EN), clase, material, nivel de protección requerido.
2. Explica para qué riesgo específico o parte del cuerpo protege, y bajo qué condiciones de uso es efectivo.
3. Si el peligro es Psicosocial, indica explícitamente: "No aplica — el riesgo psicosocial no se atenúa con EPP. La intervención debe ser organizacional.".`;
    }
  }

  const prompt = `
Eres un asistente experto en redacción de informes técnicos de Seguridad y Salud en el Trabajo (SST/HSE).

TAREA: Editar el fragmento de texto indicado según la instrucción del usuario, usando como contexto el informe completo y los datos de origen.
${fieldSpecificPrompt}
${sourceDataBlock}
INFORME COMPLETO (para coherencia y contexto):
"""
${reportContext.slice(0, 6000)}${reportContext.length > 6000 ? '\n...(fragmento truncado)' : ''}
"""

TEXTO SELECCIONADO A EDITAR:
"""
${selectedText}
"""

INSTRUCCIÓN DEL USUARIO:
"""
${instruction}
"""
${webContext}
REGLAS CRÍTICAS:
1. Si se te provee el "CONTEXTO ENCONTRADO EN INTERNET (SearXNG)", utilízalo para fundamentar tu respuesta aportando datos precisos y actualizados.
2. Devuelve ÚNICAMENTE el texto editado, sin explicaciones, sin comillas envolventes, sin prefijos.
3. Mantén el mismo formato HTML si el texto lo tiene (p, li, h3, strong, etc.).
4. Mantén coherencia con el informe completo y con los datos de origen.
5. Escribe en el mismo idioma del texto original (normalmente español).
6. NO inventes datos; básate fuertemente en el CONTEXTO ENCONTRADO EN INTERNET o en los DATOS DE ORIGEN provistos.
`;

  try {
    const modelName = req.body.modelName || SGSST_FALLBACK_MODELS[0];
    logger.info(`[LiveAiEdit] Editing text for user ${userId}, model: ${modelName}, reportLen: ${reportContext.length}, hasSourceData: ${!!reportSourceData}, usingSearXNG: ${webContext.length > 0}`);

    const result = await generateWithKeyRotation(modelName, userId, prompt, { useWebSearch: false });
    let editedText = result.response.text().trim();

    logger.info(`[LiveAiEdit] Done — original: ${selectedText.length} chars → edited: ${editedText.length} chars`);
    return res.json({ editedText });

  } catch (err) {
    logger.error('[LiveAiEdit] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
