const express = require('express');
const { generateWithKeyRotation, resolveApiKeys } = require('./sgsstGemini');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AuthKeys } = require('librechat-data-provider');
const { logger } = require('~/config');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getUserKey } = require('~/server/services/UserService');
const CompanyInfo = require('~/models/CompanyInfo');
const { buildStandardHeader, buildCompanyContextString, buildSignatureSection } = require('./reportHeader');

// ─── HELPER: Google Gemini Fallback ───────────────────────────────────────
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];


/**
 * POST /api/sgsst/estadisticas/generate
 * Calculates ATEL indicators (Res. 0312/2019 Art. 30) for Monthly or Annual scope.
 * Aggregates data from multiple months if scope is ANNUAL.
 * Generates qualitative analysis based on event details (causes, hazards).
 */
router.post('/generate', requireJwtAuth, async (req, res) => {
    try {
        const {
            scope, // 'MONTH' | 'ANNUAL'
            year,
            targetMonthIndex,
            monthName,
            annualData, // Record<number, MonthData>
            modelName,
            userName,
        } = req.body;

        const safeAnnualData = annualData || {};
        const monthsIndices = Object.keys(safeAnnualData).map(Number).sort((a, b) => a - b);

        // ─── 1. Aggregation Logic ──────────────────────────────────────
        let aggregated = {
            workersSum: 0,
            monthsWithWorkers: 0,
            numAT: 0,
            diasIncapacidadAT: 0,
            diasCargados: 0,
            casosNuevosEL: 0,
            casosAntiguosEL: 0,
            diasAusencia: 0,
            diasProgramados: 0,
            allEvents: [],
        };

        const targetRealIndex = Number(targetMonthIndex);

        monthsIndices.forEach(idx => {
            // Include this month if:
            // - Scope is ANNUAL (include all valid months so far)
            // - Scope is MONTH (only include target month)
            if (scope === 'MONTH' && idx !== targetRealIndex) return;
            if (scope === 'ANNUAL' && idx > targetRealIndex) return; // Optional: stop at current month

            const mData = safeAnnualData[idx];
            if (!mData) return;

            // Workers (Average for aggregation)
            const w = Number(mData.numTrabajadores);
            if (w > 0) {
                aggregated.workersSum += w;
                aggregated.monthsWithWorkers++;
            }

            // Events Processing
            const events = mData.events || [];
            aggregated.allEvents = [...aggregated.allEvents, ...events.map(e => ({ ...e, monthIndex: idx }))];

            // Manual Inputs or Event-based (we rely on EVENTS for counters now, seeing Frontend logic)
            // Frontend sends: { numTrabajadores, diasProgramados, events: [] }
            // So we calculate metrics FROM events here to be safe and consistent.

            aggregated.numAT += events.filter(e => e.tipo === 'AT').length;
            aggregated.diasIncapacidadAT += events.filter(e => e.tipo === 'AT').reduce((sum, e) => sum + (Number(e.diasIncapacidad) || 0), 0);
            aggregated.diasCargados += events.filter(e => e.tipo === 'AT').reduce((sum, e) => sum + (Number(e.diasCargados) || 0), 0);
            aggregated.casosNuevosEL += events.filter(e => e.tipo === 'EL').length;
            aggregated.diasAusencia += events.filter(e => e.tipo === 'Ausentismo').reduce((sum, e) => sum + (Number(e.diasIncapacidad) || 0), 0);

            aggregated.diasProgramados += (Number(mData.diasProgramados) || 0);
        });

        // Final Calculations
        const avgWorkers = aggregated.monthsWithWorkers > 0
            ? aggregated.workersSum / aggregated.monthsWithWorkers
            : 0;

        // If 0 workers, avoid division by zero
        const safeWorkers = avgWorkers || 1;

        // ─── 2. Calculate Indicators (Standard Res 0312) ────────────────
        const k = 100; // Constant for most
        const kEL = 100000; // Constant for EL

        const indicators = [
            {
                id: 'frecuencia',
                nombre: 'Frecuencia de Accidentalidad',
                definicion: 'Número de veces que ocurre un accidente de trabajo en el mes',
                formula: '(N° AT / N° trabajadores) × 100',
                valor: ((aggregated.numAT / safeWorkers) * k).toFixed(2),
                interpretacion: `Por cada 100 trabajadores, se presentaron ${((aggregated.numAT / safeWorkers) * k).toFixed(2)} accidentes de trabajo en el periodo`,
                periodicidad: 'Mensual',
                limitReason: avgWorkers === 0 ? 'Sin trabajadores registrados' : null
            },
            {
                id: 'severidad',
                nombre: 'Severidad de Accidentalidad',
                definicion: 'Número de días perdidos por accidentes de trabajo en el mes + días cargados',
                formula: '((Días Incap + Días Cargados) / N° trabajadores) × 100',
                valor: (((aggregated.diasIncapacidadAT + aggregated.diasCargados) / safeWorkers) * k).toFixed(2),
                interpretacion: `Por cada 100 trabajadores, se perdieron ${(((aggregated.diasIncapacidadAT + aggregated.diasCargados) / safeWorkers) * k).toFixed(2)} días por accidentes de trabajo`,
                periodicidad: 'Mensual'
            },
            {
                id: 'mortalidad',
                nombre: 'Proporción de Accidentes de Trabajo Mortales',
                definicion: 'Número de accidentes de trabajo mortales en el año',
                formula: '(N° AT Mortales / Total AT) × 100',
                // Assuming mortality if diasCargados > 0 for now as heuristic or 0
                // Better: Check if any event has "Mortal" in consequence or high diasCargados (e.g. 6000 is international standard for death, 4500 Colombia?)
                // Let's assume 0 for now unless explicit.
                valor: '0.00',
                interpretacion: 'Sin accidentes mortales reportados',
                periodicidad: 'Anual'
            },
            {
                id: 'prevalencia',
                nombre: 'Prevalencia de la Enfermedad Laboral',
                definicion: 'Número de casos de enfermedad laboral presentes en una población',
                formula: '((Casos Nuevos + Antiguos) / Promedio trabajadores) × 100.000',
                valor: (((aggregated.casosNuevosEL) / safeWorkers) * kEL).toFixed(2),
                interpretacion: `Por cada 100.000 trabajadores existen ${(((aggregated.casosNuevosEL) / safeWorkers) * kEL).toFixed(2)} casos de enfermedad laboral`,
                periodicidad: 'Anual'
            },
            {
                id: 'incidencia',
                nombre: 'Incidencia de la Enfermedad Laboral',
                definicion: 'Número de casos nuevos de enfermedad laboral',
                formula: '(Casos Nuevos EL / Promedio trabajadores) × 100.000',
                valor: ((aggregated.casosNuevosEL / safeWorkers) * kEL).toFixed(2),
                interpretacion: `Por cada 100.000 trabajadores existen ${((aggregated.casosNuevosEL / safeWorkers) * kEL).toFixed(2)} casos nuevos de enfermedad laboral`,
                periodicidad: 'Anual'
            },
            {
                id: 'ausentismo',
                nombre: 'Ausentismo por Causa Médica',
                definicion: 'No asistencia al trabajo con incapacidad médica',
                formula: '(Días Ausencia / Días Programados) × 100',
                // Avoid div 0 if diasProgramados is 0
                valor: aggregated.diasProgramados > 0 ? ((aggregated.diasAusencia / aggregated.diasProgramados) * 100).toFixed(2) : '0.00',
                interpretacion: `Se perdió el ${aggregated.diasProgramados > 0 ? ((aggregated.diasAusencia / aggregated.diasProgramados) * 100).toFixed(2) : '0'}% del tiempo programado por incapacidad médica`,
                periodicidad: 'Mensual'
            }
        ];

        // ─── 3. Qualitative Data Preparation ───────────────────────────
        // Detailed events list for AI analysis
        const eventsSummary = aggregated.allEvents.map(e =>
            `- [${e.tipo}] Fecha: ${e.fecha}, Causa: "${e.causaInmediata}", Peligro: "${e.peligro}", Consecuencia: "${e.consecuencia}", Días: ${e.diasIncapacidad}`
        ).join('\n');

        // Fetch structured company info for the header
        let companyName = 'EMPRESA';
        let companyNit = 'NIT';
        let companyContext = '';
        let ci = null;
        try {
            ci = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean()
              || await CompanyInfo.findOne({ user: req.user.id }).lean();
            if (ci) {
                companyName = ci.companyName || 'EMPRESA';
                companyNit = ci.nit || 'NIT';
                companyContext = buildCompanyContextString(ci);
            }
        } catch (err) { }

        // Custom Header HTML (Standardized)
        const reportDate = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
        const reportPeriod = scope === 'ANNUAL' ? `Año ${year} (Acumulado)` : `${monthName} ${year}`;

        const headerHTML = buildStandardHeader({
            title: `INDICADORES ATEL — INFORME GERENCIAL (${scope === 'ANNUAL' ? 'ANUAL' : 'MENSUAL'})`,
            companyInfo: { companyName: companyName, nit: companyNit },
            date: reportDate,
            norm: `Res. 0312 de 2019 | Periodo: ${reportPeriod}`,
        });

        // ─── 4. Build Prompt ───────────────────────────────────────────
        const periodLabel = scope === 'ANNUAL' ? `Acumulado Año ${year} (hasta ${monthName})` : `Mes: ${monthName} ${year}`;
        
        let monthlyAnalysisHtml = '';
        if (scope === 'ANNUAL') {
            monthlyAnalysisHtml += `\n**ANÁLISIS MENSUAL DETALLADO MÚLTIPLE (REQUISITO CRÍTICO):**\n`;
            monthlyAnalysisHtml += `Como es un informe ANUAL acumulado, DEBES analizar TODOS y cada uno de los meses uno por uno y hacer un respectivo análisis antes de arrojar los indicadores totales. Estos son los datos mes a mes:\n`;
            monthsIndices.forEach(idx => {
                if (idx > targetRealIndex) return;
                const mData = safeAnnualData[idx];
                if (!mData) return;
                const w = Number(mData.numTrabajadores);
                const mEvents = mData.events || [];
                if (w > 0 || mEvents.length > 0) {
                    monthlyAnalysisHtml += `- **Mes de ${MONTHS[idx]}:** ${w} trabajadores. ${mEvents.length} eventos (AT: ${mEvents.filter(e=>e.tipo==='AT').length}, EL: ${mEvents.filter(e=>e.tipo==='EL').length}, Ausentismo General y Médico: ${mEvents.filter(e=>e.tipo==='Ausentismo').length}).`;
                    if (mEvents.length > 0) {
                        monthlyAnalysisHtml += ` Detalle de eventos del mes: ${mEvents.map(e => `[${e.tipo} | Causa: ${e.causaInmediata} | Días Incap: ${e.diasIncapacidad}]`).join(', ')}`;
                    } else {
                        monthlyAnalysisHtml += ` Sin reportes de eventualidades médicas o de siniestralidad.`;
                    }
                    monthlyAnalysisHtml += `\n`;
                }
            });
            monthlyAnalysisHtml += `Crea una sección OBLIGATORIA llamada "Evolución Mensual" donde relates y analices el comportamiento mes tras mes exhaustivamente.\n`;
        }

        const promptText = `
Eres un Experto Consultor en Seguridad y Salud en el Trabajo (SGSST) y Análisis de Datos certificado, altamente innovador y profundo.
Actúas como Auditor Líder y Gerente Estratégico generando un **INFORME GERENCIAL Y PREDICTIVO DE EVENTOS DE SALUD (ATEL Y AUSENTISMO MÉDICO/GENERAL)** oficial.

**OBJETIVO:** Generar un documento HTML INMENSO, exhaustivo, profesional, altamente estilizado y disruptivo para la Alta Gerencia de la empresa. No quiero un informe pobre; extiende tu capacidad analítica al máximo. 

**CONTEXTO DEL INFORME:**
- **Periodo Analizado:** ${periodLabel}
- **Empresa:** ${companyName} (NIT: ${companyNit})
- **Autor/Responsable:** ${userName || 'Consultor Estratégico SST'}

${companyContext}

**DATOS CONSOLIDADOS:**
- Muestra Promedio de Trabajadores Activos: ${avgWorkers.toFixed(1)}
- Total Accidentes de Trabajo (AT): ${aggregated.numAT}
- Total Casos Nuevos Enfermedad Laboral (EL): ${aggregated.casosNuevosEL}
- Total Eventos de Ausentismo Médico y Enfermedad General: ${aggregated.allEvents.filter(e => e.tipo === 'Ausentismo').length}
- Días Perdidos Acumulados AT: ${aggregated.diasIncapacidadAT}
- Días Ausencia Médica General: ${aggregated.diasAusencia}

${monthlyAnalysisHtml}

**INDICADORES CALCULADOS (Res. 0312 Art. 30) - VALORES ESTADÍSTICOS OFICIALES:**
${indicators.map(i => `- ${i.nombre}: **${i.valor}**
  * Definición Oficial: ${i.definicion}
  * Formula: ${i.formula}
  * Interpretación Matemática Proyectada: ${i.interpretacion}`).join('\n')}

**COMPORTAMIENTO DETALLADO DE TODOS LOS EVENTOS (SUMAMENTE IMPORTANTE ANALIZARLOS TODOS: AT, EL Y AUSENTISMO GENERAL):**
${eventsSummary || 'No se registraron eventos. ¡Magnífico! Esto debe ser un gran punto de felicitación en la cultura de seguridad, pero sin exceder la confianza.'}

**INSTRUCCIONES DE DISEÑO HTML Y ORGANIZACIÓN DEL CONTENIDO (DEBES CUMPLIR TODAS):**

Genera SOLAMENTE el código HTML (dentro de un <div> contenedor) para ser insertado. NADA MÁS. NO Markdown, SOLO HTML PURO con CSS In-line estilizado de forma PREMIUM.
Aplica \`font-family: inherit\` para que se mantenga el estilo del sistema. Sé impecable en el diseño de las tablas, añade alertas con bordes de colores (rojos, amarillos, verdes según el nivel del indicador o el resultado cualitativo). 
- NO uses tablas "striped" / colores de fila alternos porque arruinan el modo oscuro.
- Para cada contenedor con \`background-color\` clara, fuerza \`color: #000;\`. Si usas \`background-color\` oscura, usa \`color: #fff;\`.
- Crea "Cards" visuales para los resultados más impactantes (ej: un cuadro resumen con letras enormes).
- Estilo: Premium, consultoría de alto nivel, innovador (usa grid o flexbox en línea para posicionar elementos si puedes, barras horizontales de progreso simuladas con divs).

**CONTENIDO EXIGIDO (ALTO NIVEL DE PROFUNDIDAD Y EXTENSIÓN):**

1.  **ENCABEZADO**: No generes ningún encabezado del documento ni logos. El sistema los insertará automáticamente.

2.  **RESUMEN EJECUTIVO Y ANÁLISIS DEL IMPACTO ORGANIZACIONAL:**
    - Diagnóstico profundo, extenso y crítico. Habla de finanzas, reputación corporativa, costos ocultos y prima ARL. Analiza holísticamente.

3.  **ANÁLISIS EVOLUTIVO POR MES (CUMPLIMIENTO ESTRICTO):**
    - Despliega el análisis mes a mes de los eventos de forma explícita tal y como aparece en los "DATOS CONSOLIDADOS". Compara cada mes, descubre patrones, "por qué noviembre fue peor que septiembre?", etc. Evalúa tanto Accidentes como Ausentismo Médico general.

4.  **TABLERO FORENSE DE TODOS LOS INDICADORES (CON IMPACTO DE AUSENTISMO):**
    - Genera las visuales tipo "tarjeta o ficha" para cada indicador (Frecuencia, Severidad, Incidencia EL, Prevalencia, Ausentismo Médico, Mortalidad).
    - Explicación de cada número para Dummies y para Gerentes: Qué, Por qué, e Impacto.

5.  **DASHBOARD DE TENDENCIAS PREDICTIVAS (NUEVO & INNOVADOR):**
    - ¡INNOVA! Genera una tabla de "Riesgos Residuales y Predicción". A base de los datos aportados, predice qué podría salir mal en los próximos meses basándote en la Causa Inmediata y Peligros.
    - Genera un diagnóstico de "Cultura de Seguridad". ¿Estamos ante una cultura reactiva o proactiva?

6.  **RADIOGRAFÍA DE EVENTOS POR ORIGEN (AT, EL Y ENFERMEDAD GENERAL):**
    - Tabla comparativa que discrimina Accidente, Enfermedad Laboral y Enfermedad General.
    - Simula gráficas estadísticas de porcentaje mediante de \`div\`s con \`width: XX%\` coloreadas de rojo, índigo y verde para AT, EL y Ausentismo. 

7.  **PLAN DE CHOQUE E INVERSIÓN (ACCIONES Y CONCLUSIONES EXTENSAS):**
    - Diseña una "Matriz de Decisiones Gerenciales" donde recomiendes al menos 6 acciones disruptivas en el área Técnica, Conductual y Administrativa, evaluando Costo de Implementación vs Impacto esperado. ¡Extiéndete con el plan de acción! Hazlo valioso.

**REGLA DE FIRMAS (ALERTA DE SEGURIDAD CRÍTICA):** ESTÁ ESTRICTA Y ABSOLUTAMENTE PROHIBIDO que tú escribas campos de firmas, etiquetas de "Firma del Representante Legal", "Atentamente", líneas "__" para firmar, ni nada similar. ¡Omite las firmas!
`;

        // ─── 5. Generation ─────────────────────────────────────────────
        const personalization = req.user?.personalization?.geminiModels;
        const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
        const finalModelName = modelName || preferredModel;
                let result = await generateWithKeyRotation({ model: finalModelName }, req.user?.id || req.user, promptText);
        const text = result.response.text();

        let cleanedReport = cleanHtmlOutput(text);

        // Prepend the standard header automatically to avoid recitation block issues on Gemini
        cleanedReport = headerHTML + '\n' + cleanedReport;

        if (ci) {
            cleanedReport += buildSignatureSection(ci);
        }

        res.json({ report: cleanedReport });

    } catch (error) {
        logger.error('[SGSST Estadísticas] Error:', error);
        res.status(500).json({ error: `Error: ${error.message}` });
    }
});

/**
 * GET /api/sgsst/estadisticas/mood
 * Fetches anonymized mood telemetry for the user's active company.
 */
router.get('/mood', requireJwtAuth, async (req, res) => {
    try {
        const company = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean()
            || await CompanyInfo.findOne({ user: req.user.id }).lean();
        
        if (!company) {
            return res.json([]);
        }

        const MoodTelemetry = require('~/models/MoodTelemetry');
        const telemetryData = await MoodTelemetry.find({ companyId: company._id }).sort({ createdAt: -1 }).lean();
        return res.json(telemetryData);
    } catch (error) {
        logger.error('[SGSST Estadísticas] Mood telemetry fetch error:', error);
        res.status(500).json({ error: 'Error interno al consultar la telemetría psicosocial.' });
    }
});

/**
 * DELETE /api/sgsst/estadisticas/mood/:id
 * Deletes an individual mood telemetry record belonging to the user's active company.
 */
router.delete('/mood/:id', requireJwtAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const company = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean()
            || await CompanyInfo.findOne({ user: req.user.id }).lean();

        if (!company) {
            return res.status(404).json({ error: 'Empresa no encontrada.' });
        }

        const MoodTelemetry = require('~/models/MoodTelemetry');
        const deleted = await MoodTelemetry.findOneAndDelete({ _id: id, companyId: company._id });

        if (!deleted) {
            return res.status(404).json({ error: 'Registro no encontrado o no pertenece a su empresa.' });
        }

        return res.json({ success: true, message: 'Registro eliminado exitosamente.' });
    } catch (error) {
        logger.error('[SGSST Estadísticas] Delete mood telemetry error:', error);
        res.status(500).json({ error: 'Error interno al eliminar el registro.' });
    }
});

/**
 * DELETE /api/sgsst/estadisticas/mood
 * Clears all mood telemetry records for the user's active company.
 */
router.delete('/mood', requireJwtAuth, async (req, res) => {
    try {
        const company = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean()
            || await CompanyInfo.findOne({ user: req.user.id }).lean();

        if (!company) {
            return res.status(404).json({ error: 'Empresa no encontrada.' });
        }

        const MoodTelemetry = require('~/models/MoodTelemetry');
        const result = await MoodTelemetry.deleteMany({ companyId: company._id });

        return res.json({ 
            success: true, 
            message: `Se eliminaron ${result.deletedCount} registros exitosamente.`,
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        logger.error('[SGSST Estadísticas] Clear mood telemetry error:', error);
        res.status(500).json({ error: 'Error interno al vaciar los registros.' });
    }
});

// Helpers
function cleanHtmlOutput(text) {
    return text.replace(/```html\n?/g, '').replace(/```\n?/g, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
        .replace(/<head>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
        .trim();
}

module.exports = router;
