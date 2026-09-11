const express = require('express');
const { generateWithKeyRotation, resolveApiKeys } = require('./sgsstGemini');
const crypto = require('crypto');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AuthKeys } = require('librechat-data-provider');
const { logger } = require('~/config');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getUserKey } = require('~/server/services/UserService');
const { saveConvo } = require('~/models/Conversation');
const { saveMessage, updateMessageText, getMessages } = require('~/models/Message');
const { updateTagsForConversation } = require('~/models/ConversationTag');
const CompanyInfo = require('~/models/CompanyInfo');
const { buildStandardHeader, buildCompanyContextString, buildSignatureSection } = require('./reportHeader');
const { scanComplianceForUser } = require('./complianceScanner');

/**
 * GET /api/sgsst/diagnostico/compliance-scan
 * Scans active company data across all WAPPY modules and returns verified compliance evidence.
 */
router.get('/compliance-scan', requireJwtAuth, async (req, res) => {
    try {
        const result = await scanComplianceForUser(req.user.id, req.user);
        return res.json(result);
    } catch (error) {
        logger.error('[ComplianceScanner] Error scanning compliance:', error.message, error.stack);
        return res.status(500).json({ error: 'Error scanning compliance data', details: error.message });
    }
});


/**
 * POST /api/sgsst/diagnostico/analyze
 * Analyzes the SGSST checklist and generates a management report.
 * Uses the same Google API key the user configures in chat settings.
 */
router.post('/analyze', requireJwtAuth, async (req, res) => {
    try {
        const {
            companySize,
            riskLevel,
            applicableArticle,
            checklist,
            score,
            totalPoints,
            complianceLevel,
            userName,
            currentDate,
            observations,
            type = 'diagnostico', // Default to diagnostico for backward compatibility
        } = req.body;

        // Validate checklist
        if (!checklist || !Array.isArray(checklist) || checklist.length === 0) {
            return res.status(400).json({ error: 'La lista de verificación es inválida o está vacía.' });
        }

        // 1. Retrieve the user's Google API key
        let resolvedApiKey;
        try {
            const storedKey = await getUserKey({ userId: req.user.id, name: 'google' });
            try {
                const parsed = JSON.parse(storedKey);
                resolvedApiKey = parsed[AuthKeys.GOOGLE_API_KEY] || parsed.GOOGLE_API_KEY;
            } catch (parseErr) {
                resolvedApiKey = storedKey;
            }
        } catch (err) {
            logger.debug('[SGSST Diagnostico] No user Google key found, trying env vars:', err.message);
        }

        if (!resolvedApiKey) {
            resolvedApiKey = process.env.GOOGLE_KEY || process.env.GEMINI_API_KEY;
        }

        if (resolvedApiKey && typeof resolvedApiKey === 'string') {
            resolvedApiKey = resolvedApiKey.split(',')[0].trim();
        }

        if (!resolvedApiKey) {
            return res.status(400).json({
                error: 'No se ha configurado la clave API de Google. Por favor, configúrala en la opción de Google del chat.',
            });
        }

        // 2. Load company info from DB
        let companyInfoBlock = '';
        let loadedCompanyInfo = null;
        try {
            let ci = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean();
            if (!ci) ci = await CompanyInfo.findOne({ user: req.user.id }).lean();
            loadedCompanyInfo = ci;
            if (ci && ci.companyName) {
                companyInfoBlock = buildCompanyContextString(ci);
            }
        } catch (ciErr) {
            logger.warn('[SGSST Diagnostico] Error loading company info:', ciErr.message);
        }

        // 3. Initialize the Gemini SDK directly
        const genAI = new GoogleGenerativeAI(resolvedApiKey);

        // Convert numeric riskLevel to readable label
        const riskLabels = { 1: 'I (Mínimo)', 2: 'II (Bajo)', 3: 'III (Medio)', 4: 'IV (Alto)', 5: 'V (Máximo)' };
        const riskLevelLabel = riskLabels[riskLevel] || riskLevel;

        // Build checklist stats
        const completedItems = checklist.filter(item => item.status === 'cumple');
        const partialItems = checklist.filter(item => item.status === 'parcial');
        const nonCompliantItems = checklist.filter(item => item.status === 'no_cumple');
        const notApplicable = checklist.filter(item => item.status === 'no_aplica');
        const pending = checklist.filter(item => item.status === 'pendiente');

        const safeTotal = totalPoints > 0 ? totalPoints : 1; // Prevent division by zero
        const percentage = req.body.compliancePercentage !== undefined 
            ? req.body.compliancePercentage 
            : (totalPoints > 0 ? ((score / totalPoints) * 100).toFixed(1) : "0.0");

        let promptText = '';
        let headerHTML = '';

        if (type === 'auditoria') {
            const { weightedScore = 0, weightedPercentage = 0, phvaStats: clientPhvaStats } = req.body;
            console.log('[SGSST Audit Analysis] Payload:', {
                score,
                totalPoints,
                weightedScore,
                weightedPercentage,
                checklistLength: checklist?.length
            });

            // Calculate PHVA percentages from actual checklist data
            const phvaCycles = ['planear', 'hacer', 'verificar', 'actuar'];
            const phvaData = {};
            phvaCycles.forEach(cycle => {
                const cycleItems = checklist.filter(item => item.category === cycle);
                const cycleTotal = cycleItems.length;
                const cycleCumple = cycleItems.filter(i => i.status === 'cumple').length;
                const cycleNoCumple = cycleItems.filter(i => i.status === 'no_cumple').length;
                const cycleParcial = cycleItems.filter(i => i.status === 'parcial').length;
                const cycleNoAplica = cycleItems.filter(i => i.status === 'no_aplica').length;
                const applicableCount = cycleTotal - cycleNoAplica;
                const pct = applicableCount > 0 ? ((cycleCumple / applicableCount) * 100).toFixed(1) : '100.0';
                phvaData[cycle] = { total: cycleTotal, cumple: cycleCumple, noCumple: cycleNoCumple, parcial: cycleParcial, noAplica: cycleNoAplica, percentage: pct };
            });

            const phvaLabels = { planear: 'PLANEAR', hacer: 'HACER', verificar: 'VERIFICAR', actuar: 'ACTUAR' };
            const phvaSummary = phvaCycles.map(cycle => {
                const d = phvaData[cycle];
                return `- **${phvaLabels[cycle]}:** ${d.percentage}% (${d.cumple} cumplen / ${d.total} total | No cumplen: ${d.noCumple} | Parcial: ${d.parcial} | No aplica: ${d.noAplica})`;
            }).join('\n');

            headerHTML = buildStandardHeader({
                title: 'INFORME DE AUDITORÍA INTERNA SG-SST',
                companyInfo: loadedCompanyInfo,
                date: currentDate || new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
                norm: 'Decreto 1072 de 2015 / Resolución 0312 de 2019',
                responsibleName: userName || req.user?.name,
            });

            promptText = `Eres un Auditor Líder experto en Sistemas de Gestión de Seguridad y Salud en el Trabajo (SG-SST) en Colombia, certificado en ISO 45001 y Decreto 1072 de 2015.

**Fecha de Auditoría:** ${currentDate || new Date().toLocaleDateString('es-CO')}
**Auditor Líder:** ${userName || req.user?.name || 'Usuario del Sistema'}
**Criterios de Auditoría:** Decreto 1072 de 2015 (Capítulo 6), Resolución 0312 de 2019.

**REGLAS CRÍTICAS:**
1. Debes basar tu informe EXCLUSIVAMENTE en los datos proporcionados a continuación. NO inventes, supongas ni alucines hallazgos.
2. Si un estándar aparece como "cumple", NO lo reportes como No Conformidad. Si aparece como "no_cumple", SÍ repórtalo.
3. USA EXCLUSIVAMENTE los porcentajes PHVA pre-calculados proporcionados abajo. NO los recalcules ni modifiques.
4. Cuando un estándar tenga una OBSERVACIÓN/EVIDENCIA DEL AUDITOR, DEBES usar ese texto como base principal del hallazgo. NO inventes detalles diferentes.
5. En la columna "Requisito/Norma" de cada hallazgo, usa el campo CRITERIO NORMATIVO proporcionado para cada ítem (incluye Decreto 1072 Y Resolución 0312 con artículos específicos).

Analiza los hallazgos de la auditoría interna y genera un INFORME DE AUDITORÍA INTERNA EXTENSO Y PROFESIONAL en formato HTML.

## DATOS DE LA AUDITORÍA

**Información de la Empresa:**
${companyInfoBlock}

**Resumen de Resultados (Doble Calificación):**
1. **Auditoría de Cumplimiento (Dec 1072):**
   - Porcentaje de Conformidad: ${percentage}% (IMPORTANTE: Muestra textualmente en el informe que este porcentaje es "(Sobre el total de estándares del sistema)" y NO uses la frase "sobre items auditados").
   - Conformidades (Cumple): ${completedItems.length}
   - No Conformidades (No Cumple): ${nonCompliantItems.length}
   - Observaciones (Parcial/No Aplica): ${partialItems.length + notApplicable.length}

2. **Estándares Mínimos (Res 0312):**
   - Puntaje Obtenido: ${weightedScore || 'N/A'}
   - Porcentaje Ponderado: ${weightedPercentage ? parseFloat(weightedPercentage).toFixed(1) : 'N/A'}%

**PORCENTAJES POR CICLO PHVA (PRE-CALCULADOS — USAR EXACTAMENTE ESTOS VALORES):**
${phvaSummary}

**Detalle de No Conformidades y Hallazgos (TOTAL: ${nonCompliantItems.length} No Conformidades + ${partialItems.length} Observaciones = ${nonCompliantItems.length + partialItems.length} hallazgos que DEBEN aparecer en la tabla):**
**NO CONFORMIDADES (${nonCompliantItems.length} ítems — TODOS deben aparecer individualmente en la tabla):**
${nonCompliantItems.map((item, idx) => {
                const obs = observations && observations[item.id] ? `\n  → EVIDENCIA: "${observations[item.id]}"` : '';
                const criteria = item.criteria ? `\n  → CRITERIO NORMATIVO: ${item.criteria}` : '';
                return `${idx + 1}. [NC-${idx + 1}] ${item.code} - ${item.name}: ${item.description}${criteria}${obs}`;
            }).join('\n') || 'Ninguna'}

**CUMPLIMIENTO PARCIAL (${partialItems.length} ítems — TODOS deben aparecer individualmente en la tabla):**
${partialItems.map((item, idx) => {
                const obs = observations && observations[item.id] ? `\n  → EVIDENCIA: "${observations[item.id]}"` : '';
                const criteria = item.criteria ? `\n  → CRITERIO NORMATIVO: ${item.criteria}` : '';
                return `${idx + 1}. [OBS-${idx + 1}] ${item.code} - ${item.name}: ${item.description}${criteria}${obs}`;
            }).join('\n') || 'Ninguna'}

## INSTRUCCIONES - GENERACIÓN DE INFORME AUDITORÍA DETALLADO

Genera un INFORME DE AUDITORÍA INTERNA MUY DETALLADO Y EXTENSO en formato HTML RICO Y ESTILIZADO.
**IMPORTANTE:** Usa tablas, colores y "tarjetas" visuales. El diseño debe ser profesional y de alto nivel.

1. **ENCABEZADO Y CONTEXTO**:
   - No generes el encabezado del documento ni logos. El sistema los insertará automáticamente.
   - Incluye directamente el contenido inicial: Auditor Líder, Alcance, Criterios de auditoría.

2. **RESUMEN EJECUTIVO (EXTENSO)**:
   - <div style="background-color: #f8f9fa; padding: 15px; border-left: 5px solid #0f766e; margin-bottom: 20px;">
     Redacta un resumen ejecutivo profundo sobre el estado del SG-SST, mencionando explícitamente el cumplimiento del Decreto 1072 y la Resolución 0312. Incluye los puntajes generales y una síntesis de las principales fortalezas y debilidades.
     </div>

3. **ANÁLISIS DE RESULTADOS (VISUAL Y GRÁFICO)**:
   - **TARJETAS DE PUNTUACIÓN:** Genera dos recuadros (divs) visuales lado a lado para los dos puntajes (Dec 1072 y Res 0312).
   - **GRÁFICOS DE BARRAS (PHVA):** Para cada ciclo PHVA, genera una **BARRA DE PROGRESO** visual (HTML/CSS). **USA EXACTAMENTE los porcentajes pre-calculados:**
     * PLANEAR: ${phvaData['planear'].percentage}%
     * HACER: ${phvaData['hacer'].percentage}%
     * VERIFICAR: ${phvaData['verificar'].percentage}%
     * ACTUAR: ${phvaData['actuar'].percentage}%
   - **FORTALEZAS:** Lista las fortalezas encontradas basándote en los ítems que cumplen.

4. **HALLAZGOS DETALLADOS (TABLA DE NO CONFORMIDADES Y OBSERVACIONES)**:
   - **OBLIGATORIO — CONTEO EXACTO:** La tabla DEBE tener exactamente **${nonCompliantItems.length + partialItems.length} filas** (${nonCompliantItems.length} No Conformidades + ${partialItems.length} Observaciones). Cada ítem listado arriba con su código [NC-X] o [OBS-X] DEBE tener su propia fila individual. NO agrupes, resumas ni omitas ninguno.
   - **FORMATO DE REDACCIÓN DE CADA HALLAZGO (ISO 19011):**
     Cada hallazgo debe seguir esta estructura:
     "Se identificó que [DESCRIBIR LO ENCONTRADO / EVIDENCIA DEL AUDITOR], lo cual incumple lo establecido en [NORMA + ARTÍCULO ESPECÍFICO del CRITERIO NORMATIVO]."
     Ejemplo: "Se identificó que la empresa no cuenta con auditoría anual del SG-SST (evidencia: No cuenta con auditoría), incumpliendo lo establecido en el Decreto 1072 de 2015, Art. 2.2.4.6.29 y Resolución 0312 de 2019, Estándar E6.1.2."
    - **TABLA HTML con las siguientes columnas (SIN columna de Acción Correctiva ni Plazo — esas van en la sección del Plan de Acción):**
      | # (NC-X / OBS-X) | Requisito/Norma (CRITERIO) | Hallazgo (Evidencia con redacción ISO 19011) | Tipo (Clasificación) | Responsable |
    - **IMPORTANTE — ANCHO DE COLUMNAS:** El campo de **Hallazgo (Evidencia)** debe ser muy amplio (el doble que los demás) para permitir una explicación detallada.
    - **VERIFICACIÓN:** Antes de cerrar la tabla, cuenta las filas. Si tienes menos de ${nonCompliantItems.length + partialItems.length} filas, FALTA información. Incluye los que falten.
    - Clasifica como NC Mayor si afecta la eficacia del sistema, NC Menor si es puntual, Observación si cumple parcialmente.
    - **NO incluyas columnas de Acción Correctiva ni Plazo en esta tabla.** Esas columnas van SOLO en la tabla del Plan de Acción (sección 5).

5. **PLAN DE ACCIÓN Y MEJORA RECOMENDADO (TABLA SEPARADA — UNA FILA POR CADA HALLAZGO)**:
   - **IMPORTANTE: Esta es una tabla COMPLETAMENTE SEPARADA de los Hallazgos. NO la fusiones con la tabla anterior.**
   - **REGLA CRÍTICA: Cada hallazgo (NC-X u OBS-X) DEBE tener su PROPIA fila individual. Si hay ${nonCompliantItems.length + partialItems.length} hallazgos, la tabla DEBE tener exactamente ${nonCompliantItems.length + partialItems.length} filas.**
   - **TABLA HTML con las siguientes columnas:**
     | # (NC-X / OBS-X) | Acción Correctiva Detallada (específica y ejecutable) | Recurso Necesario | Evidencia de Cumplimiento | Plazo (Inmediato 0-30d / Corto 1-3m / Mediano 3-6m / Largo 6-12m) |
   - Ordena las filas por prioridad (NC Mayores primero) pero SIN agrupar. Cada fila es independiente.
   - **COLORES POR PLAZO (aplicar background-color a cada fila <tr> según el plazo):**
     * Inmediato (0-30d): fondo rojo claro (#ffe0e0)
     * Corto (1-3m): fondo naranja claro (#fff0e0)
     * Mediano (3-6m): fondo amarillo claro (#fff8e0)
     * Largo (6-12m): fondo verde claro (#e0ffe0)

6. **CONCLUSIONES DE AUDITORÍA (MUY EXTENSAS Y DETALLADAS)**:
   - Concepto final sobre la conformidad y eficacia del SG-SST (mínimo 3 párrafos extensos).
   - **Análisis de cada NC Mayor:** Para CADA No Conformidad Mayor identificada, escribe un párrafo dedicado describiendo: qué se encontró, por qué es crítico para el sistema, cuál es la norma incumplida, y cuál es el riesgo legal específico (multas según Dec 472/15 de 1 a 500 SMLMV, sanciones del Ministerio de Trabajo, cierre temporal/definitivo, responsabilidad solidaria, etc.).
   - Fortalezas encontradas en el sistema (al menos 1 párrafo).
   - Comparación con los requisitos del Decreto 1072 y la Resolución 0312.
   - Recomendación sobre si el sistema es CONFORME, CONFORME CON OBSERVACIONES o NO CONFORME, con justificación detallada.
   - Las conclusiones deben ser extensas, descriptivas y autoexplicativas. NO sean breves ni genéricas.

**ESTILOS OBLIGATORIOS (CSS INLINE) - PRECAUCIÓN MODO OSCURO:**
- **Regla Crítica:** NO uses tablas "striped" (filas intercaladas claras/oscuras) porque rompen la lectura en modo oscuro.
- Cada vez que apliques un \`background-color\` a un elemento (tr, td, div), **DEBES OBLIGATORIAMENTE** especificar \`color: #000;\` (si el fondo es claro) o \`color: #fff;\` (si el fondo es oscuro).
- Títulos (h1, h2): Color azul oscuro (#0f766e) con \`color: #0f766e;\` explícito.
- Tablas: width="100%", border-collapse="separate", border-spacing="0", border-radius="12px", overflow="hidden", border="1px solid #ddd", th con background-color="#0f766e" y color="white".
- Celdas (td): padding="10px", border-bottom="1px solid #ddd" (sin background-color predeterminado para que hereden el modo oscuro).
- NC Mayor: fondo rosa claro (\`background-color: #ffe0e0; color: #000;\`). NC Menor: fondo amarillo claro (\`background-color: #fff8e0; color: #000;\`). Observación: fondo azul claro (\`background-color: #e0f0ff; color: #000;\`).
- Plan de Acción por Plazo: Inmediato (\`background-color: #ffe0e0; color: #000;\`), Corto (\`background-color: #fff0e0; color: #000;\`), Mediano (\`background-color: #fff8e0; color: #000;\`), Largo (\`background-color: #e0ffe0; color: #000;\`).
MUY IMPORTANTE: NO incluyas tablas de firmas, espacios de aceptación, ni nombres de representantes o responsables al final del documento, ya que el sistema los añadirá automáticamente de forma estandarizada.

Genera SOLO el contenido del cuerpo (HTML body tags).`;

        } else if (type === 'alta_direccion') {
            headerHTML = buildStandardHeader({
                title: 'INFORME DE REVISIÓN POR LA ALTA DIRECCIÓN',
                companyInfo: loadedCompanyInfo,
                date: currentDate || new Date().toLocaleDateString('es-CO'),
                norm: 'Decreto 1072 de 2015 (Art. 2.2.4.6.31)',
                responsibleName: userName || 'Responsable SST',
            });

            promptText = `
Eres un Consultor Senior en Sistemas de Gestión de Seguridad y Salud en el Trabajo (SST).
Tu objetivo es generar un **INFORME DE REVISIÓN POR LA ALTA DIRECCIÓN** profesional, de alto nivel corporativo y técnicamente impecable, basado en los 24 aspectos que exige el **Decreto 1072 de 2015 (Artículo 2.2.4.6.31)**.

**CONTEXTO ORGANIZACIONAL:**
- Empresa: ${loadedCompanyInfo?.companyName || 'La Organización'}
- Responsable SST: ${userName || 'No especificado'}
- Fecha de Revisión: ${currentDate || 'Hoy'}
- Puntaje de Cumplimiento: ${score} de ${totalPoints} aspectos (${complianceLevel.percentage}%)
- Nivel de Desempeño: ${complianceLevel.level.toUpperCase()}

**RESULTADOS DE LA EVALUACIÓN (Los 24 Aspectos):**
${checklist.map((item, idx) => {
                const obs = observations && observations[item.id] ? `\n  → COMENTARIO GERENCIAL: "${observations[item.id]}"` : '';
                return `${idx + 1}. ${item.code} - ${item.name}: [${item.status.toUpperCase()}]${obs}`;
            }).join('\n')}

**INSTRUCCIONES DE ESTRUCTURA (Tu respuesta DEBE ser exclusivamente código HTML):**

1. **ENCABEZADO TÉCNICO**:
   - No generes el encabezado del documento ni logos. El sistema los insertará automáticamente.

2. **RESUMEN EJECUTIVO PARA LA GERENCIA**:
   Redacta un párrafo formal y estratégico (mínimo 150 palabras) que resuma el compromiso de la alta dirección con el SGSST. Menciona la importancia de esta revisión anual como motor de la mejora continua.

3. **ANÁLISIS POR GRUPOS TÉCNICOS**:
   Divide el análisis en 3 bloques (I. Insumos de la Revisión, II. Revisión y Decisiones, III. Seguimiento y Vigilancia). 
   - Genera una **BARRA DE PROGRESO** visual (CSS inline) para cada bloque basándote en los resultados.
   - Explica detalladamente qué áreas están sólidas y cuáles requieren atención.

4. **TABLA DE HALLAZGOS Y OBLIGACIONES PENDIENTES**:
   Crea una tabla HTML con todos los ítems calificados como 'NO CUMPLE' o 'PARCIAL'.
   - Columnas: Item ID, Aspecto Normativo, Hallazgo/Brecha Identificada, Impacto Legal/Operativo.
   - Estilo: th con background-color #0f172a y color blanco.

5. **DECISIONES Y COMPROMISOS GERENCIALES (PLAN DE MEJORA)**:
   Genera una tabla de plan de acción para cerrar las brechas identificadas.
   - Columnas: Acción de Mejora, Recurso Asignado (Humano/Técnico/Financiero), Responsable, Plazo Estimado.

6. **RIESGOS DE INCUMPLIMIENTO**:
   Enumera las posibles consecuencias (sanciones, accidentes, pérdida de continuidad) si no se atienden los hallazgos.

7. **CONCLUSIÓN Y DECLARATORIA DE REVISIÓN**:
   Un párrafo de cierre donde la alta dirección reafirma su compromiso con la seguridad de los trabajadores.

**ESTILOS OBLIGATORIOS:**
- Usa una paleta de colores corporativa (Azul Oscuro #0f172a, Marfil, Teal #0f766e).
- Tablas con border-radius, sombreado suave y espaciado generoso.
- Garantiza legibilidad en modo claro y oscuro (especifica color: #000; en fondos claros).
- NO incluyas tablas de firmas al final.

Genera SOLO el contenido del cuerpo HTML.`;

        } else {
            // Default Diagnostic Prompt (Resolución 0312)
            headerHTML = buildStandardHeader({
                title: 'INFORME GERENCIAL DE EVALUACIÓN SG-SST',
                companyInfo: loadedCompanyInfo,
                date: currentDate || new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
                riskLevel: riskLevelLabel,
                norm: `Resolución 0312 de 2019 (Art. ${applicableArticle})`,
                responsibleName: userName || req.user?.name,
            });

            promptText = `Eres un experto consultor en Sistemas de Gestión de Seguridad y Salud en el Trabajo (SG-SST) en Colombia.

**Fecha de Emisión:** ${currentDate || new Date().toLocaleDateString('es-CO')}
**Consultor Experto:** ${userName || req.user?.name || 'Usuario del Sistema'}
**Referencia Normativa:** Resolución 0312 de 2019 (Estándares Mínimos, Art. ${applicableArticle})
    
Analiza los resultados de la evaluación según la Resolución 0312 de 2019 y genera un INFORME GERENCIAL completo.

**REGLA CRÍTICA: Debes basar tu informe EXCLUSIVAMENTE en los datos proporcionados a continuación. NO inventes, supongas ni alucines hallazgos. Si un estándar aparece como "CUMPLE", NO lo reportes como incumplido. Respeta estrictamente las listas de cumplimiento/incumplimiento dadas.**

## DATOS DE LA EVALUACIÓN

**Información de la Empresa (Filtros de Evaluación Seleccionados):**
- Tamaño de Empresa: ${companySize === 'small' ? '≤10 trabajadores' : companySize === 'medium' ? '11-50 trabajadores' : '>50 trabajadores'}
- Nivel de Riesgo Seleccionado para Evaluación: ${riskLevelLabel}
- Artículo Aplicable: Artículo ${applicableArticle}
${companyInfoBlock ? `\n**Datos Registrados de la Empresa (referencia, NO usar si contradice los filtros anteriores):**\n${companyInfoBlock}` : ''}

**Resultados:**
- Puntuación Total: ${score}/${totalPoints} (${percentage}%)
- Nivel de Cumplimiento: ${complianceLevel?.level?.toUpperCase() || 'N/A'}
- Total Estándares Evaluados: ${checklist.length}
- Cumplen: ${completedItems.length}
- Cumplen Parcialmente: ${partialItems.length}
- No Cumplen: ${nonCompliantItems.length}
- No Aplican: ${notApplicable.length}
- Pendientes: ${pending.length}

**Estándares que CUMPLEN (Exitosos):**
${completedItems.map(item => {
                return `- ${item.code} - ${item.name} (${item.category.toUpperCase()})`;
            }).join('\n') || 'Ninguno'}

**Estándares que NO CUMPLEN (Críticos — ${nonCompliantItems.length} ítems, TODOS deben aparecer en el plan de acción):**
${nonCompliantItems.map((item, idx) => {
                const obs = observations && observations[item.id] ? `\n  → OBSERVACIÓN DEL EVALUADOR: "${observations[item.id]}"` : '';
                return `${idx + 1}. [NC-${idx + 1}] ${item.code} - ${item.name}: ${item.description}${obs}`;
            }).join('\n') || 'Ninguno'}

**Estándares que CUMPLEN PARCIALMENTE (${partialItems.length} ítems):**
${partialItems.map((item, idx) => {
                const obs = observations && observations[item.id] ? `\n  → OBSERVACIÓN DEL EVALUADOR: "${observations[item.id]}"` : '';
                return `${idx + 1}. [OBS-${idx + 1}] ${item.code} - ${item.name}: ${item.description}${obs}`;
            }).join('\n') || 'Ninguno'}

**Estándares que NO APLICAN:**
${notApplicable.map(item => {
                const obs = observations && observations[item.id] ? `\n  → OBSERVACIÓN DEL EVALUADOR: "${observations[item.id]}"` : '';
                return `- ${item.code} - ${item.name}${obs}`;
            }).join('\n') || 'Ninguno'}

## INSTRUCCIONES - GENERACIÓN DE INFORME EXTENSO Y VISUALMENTE PREMIUM

Genera un INFORME GERENCIAL MUY DETALLADO, EXTENSO Y PROFUNDO en formato HTML RICO Y ESTILIZADO.
**IMPORTANTE:** El informe debe verse profesional y hermoso. Usa tablas, colores y "tarjetas" visuales.

**REGLA SOBRE OBSERVACIONES:** Cuando un estándar tenga una OBSERVACIÓN DEL EVALUADOR, DEBES usar ese texto como base principal del hallazgo en el informe. NO inventes detalles diferentes. La observación del evaluador refleja la realidad encontrada en campo y debe ser citada o parafraseada con fidelidad.

1. **ENCABEZADO Y CONTEXTO**:
   - No generes el encabezado del documento ni logos. El sistema los insertará automáticamente.

2. **RESUMEN EJECUTIVO (EXTENSO)**:
   - <div style="background-color: #f8f9fa; padding: 15px; border-left: 5px solid #0f766e; margin-bottom: 20px;">
     Realiza una descripción detallada, profunda y explicativa del estado actual del SG-SST. Contextualiza el nivel de cumplimiento. NO seas breve.
     </div>

3. **ANÁLISIS DE RESULTADOS (VISUAL Y GRÁFICO)**: 
   - **TARJETAS DE PUNTUACIÓN:** Genera dos recuadros (divs) visuales lado a lado:
     - Uno rojo/verde para el PUNTAJE NUMÉRICO.
     - Uno naranja/amarillo para el NIVEL DE RIESGO.
   - **GRÁFICOS DE BARRAS (PHVA):** Para cada ciclo (Planear, Hacer, Verificar, Actuar), genera una **BARRA DE PROGRESO** visual usando HTML/CSS.
     - Estilo sugerido: Un contenedor gris claro con una barra interna de color (verde/naranja/rojo según cumplimiento) que tenga un ancho % proporcional.
   - **TABLA PHVA:** Crea una tabla HTML con encabezados azules (#0f766e) y filas alternadas.
   - Texto explicativo extenso sobre fortalezas y debilidades.

4. **HALLAZGOS DETALLADOS (TABLA DE NO CONFORMIDADES Y OBSERVACIONES)**:
   - **CONTEO EXACTO:** La tabla DEBE tener exactamente **${nonCompliantItems.length}** filas de No Conformidades + **${partialItems.length}** filas de Parciales = **${nonCompliantItems.length + partialItems.length}** filas totales. Cada ítem [NC-X] y [OBS-X] DEBE tener su propia fila. NO agrupes, resumas ni omitas.
   - Usa una **TABLA HTML**.
   - **Columnas (SIN Acción Correctiva ni Plazo — esas van en la sección del Plan de Acción):**
     | # (NC-X / OBS-X) | Estándar | Hallazgo (basado en observación del evaluador) | Tipo (NC Mayor / NC Menor / Observación) | Responsable |
   - **VERIFICACIÓN:** Si la tabla tiene menos de ${nonCompliantItems.length + partialItems.length} filas, FALTA información. Incluye los que falten.
   - **COLORES POR TIPO (aplicar background-color a cada fila <tr>):** NC Mayor: #ffe0e0 (rosa). NC Menor: #fff8e0 (amarillo). Observación: #e0f0ff (azul claro).

5. **PLAN DE ACCIÓN Y MEJORA RECOMENDADO (TABLA SEPARADA — UNA FILA POR CADA HALLAZGO)**:
   - **IMPORTANTE: Esta es una tabla COMPLETAMENTE SEPARADA de los Hallazgos. NO la fusiones con la tabla anterior.**
   - **REGLA CRÍTICA: Cada hallazgo DEBE tener su PROPIA fila individual. Si hay ${nonCompliantItems.length + partialItems.length} hallazgos, la tabla DEBE tener exactamente ${nonCompliantItems.length + partialItems.length} filas.**
   - **TABLA HTML con las siguientes columnas:**
     | # (NC-X / OBS-X) | Acción Correctiva Detallada (específica y ejecutable) | Recurso Necesario | Evidencia de Cumplimiento | Plazo (Inmediato 0-30d / Corto 1-3m / Mediano 3-6m / Largo 6-12m) |
   - Ordena las filas por prioridad (NC Mayores primero) pero SIN agrupar.
   - **COLORES POR PLAZO (aplicar background-color a cada fila <tr>):** Inmediato: #ffe0e0 (rojo). Corto: #fff0e0 (naranja). Mediano: #fff8e0 (amarillo). Largo: #e0ffe0 (verde).

6. **RIESGOS Y CONSECUENCIAS**:
   - Usa listas con iconos (puedes usar emojis como ⚠️ o ⚖️ sutilmente si encajan, o bullets estilizados) para enumerar consecuencias legales y operativas.
   - Explicación profunda de cada riesgo.

7. **RECOMENDACIONES FINALES**:
   - Hoja de ruta en formato de lista estilizada o tabla de cronograma.

**ESTILOS OBLIGATORIOS (CSS INLINE) - PRECAUCIÓN MODO OSCURO:**
- **Regla Crítica:** NO uses tablas "striped" (filas intercaladas claras/oscuras) porque rompen la lectura en modo oscuro.
- Cada vez que apliques un \`background-color\` a un elemento (tr, td, div), **DEBES OBLIGATORIAMENTE** especificar \`color: #000;\` (si el fondo es claro) o \`color: #fff;\` (si el fondo es oscuro).
- Títulos (h1, h2): Color azul oscuro (#0f766e) con \`color: #0f766e;\` explícito.
- Tablas: width="100%", border-collapse="separate", border-spacing="0", border-radius="12px", overflow="hidden", border="1px solid #ddd", th con background-color="#0f766e" y color="white".
- Celdas (td): padding="10px", border-bottom="1px solid #ddd" (sin background-color predeterminado para que hereden el modo oscuro).
- NC Mayor: fondo rosa (#ffe0e0) con \`color: #000;\`. NC Menor: fondo amarillo (#fff8e0) con \`color: #000;\`. Observación: fondo azul claro (#e0f0ff) con \`color: #000;\`.
- Plan de Acción por Plazo: Inmediato (#ffe0e0 rojo, \`color: #000;\`), Corto (#fff0e0 naranja, \`color: #000;\`), Mediano (#fff8e0 amarillo, \`color: #000;\`), Largo (#e0ffe0 verde, \`color: #000;\`).

MUY IMPORTANTE: NO incluyas tablas de firmas, espacios de aceptación, ni nombres de representantes o responsables al final del documento, ya que el sistema los añadirá automáticamente de forma estandarizada.

Genera SOLO el contenido del cuerpo (HTML body tags).`;
        }

        // Initialize the model
        // 4. Generate the report with Fallback Strategy
        let result;
        let text;

        // Console logs removed as per user request

        const generationConfig = {
            maxOutputTokens: 65536, // Maximum allowed by model
            temperature: 0.7,
        };

        const personalization = req.user?.personalization?.geminiModels;
        const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
        const selectedModel = req.body.modelName || preferredModel;

        // Helper: generate with timeout (90 seconds)
        const generateWithTimeout = async (model, prompt, timeoutMs = 300000) => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT: La generación del informe excedió el tiempo límite. Intente de nuevo.')), timeoutMs)
            );
            const genPromise = (async () => {
                const genResult = await generateWithKeyRotation(model, req.user?.id || req.user, prompt);
                const genResponse = await genResult.response;
                return genResponse.text();
            })();
            return Promise.race([genPromise, timeoutPromise]);
        };

        try {
            console.log(`[SGSST Diagnostico] Attempting Generation with ${selectedModel}`);
            const modelPrimary = genAI.getGenerativeModel({ model: selectedModel, generationConfig });
            text = await generateWithTimeout(modelPrimary, promptText);
        } catch (primaryError) {
            console.warn(`[SGSST Diagnostico] Primary model (${selectedModel}) failed, attempting fallback to gemini-3.5-flash (fallback dinámico). Error:`, primaryError.message);
            // If it was a timeout, don't retry — inform user immediately
            if (primaryError.message.includes('TIMEOUT')) {
                throw primaryError;
            }
            try {
                // Fallback to previous stable/experimental version
                const modelFallback = genAI.getGenerativeModel({ model: (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim(), generationConfig });
                text = await generateWithTimeout(modelFallback, promptText);
            } catch (fallbackError) {
                console.error('[SGSST Diagnostico] All models failed.');
                throw fallbackError; // Re-throw to main catch
            }
        }

        // Clean up: remove code blocks, full HTML document wrappers
        let cleanedReport = text
            .replace(/```html\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        // Prepend the standard header automatically to avoid recitation block issues on Gemini
        cleanedReport = headerHTML + '\n' + cleanedReport;

        // Strip full HTML document structure if AI still generates it
        const bodyMatch = cleanedReport.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            cleanedReport = bodyMatch[1].trim();
        }
        // Remove DOCTYPE, html, head, style tags
        cleanedReport = cleanedReport
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
            .replace(/<head>[\s\S]*?<\/head>/gi, '')
            .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .trim();

        if (loadedCompanyInfo) {
            cleanedReport += buildSignatureSection(loadedCompanyInfo);
        }

        res.json({
            report: cleanedReport,
            conversationId: crypto.randomUUID(), // Return new ID for UI
            summary: {
                score,
                totalPoints,
                percentage: parseFloat(percentage),
                level: complianceLevel.level,
                compliant: completedItems.length,
                partial: partialItems.length,
                nonCompliant: nonCompliantItems.length,
            }
        });

    } catch (error) {
        console.error('[SGSST CRITICAL ERROR] Diagnostic Analysis Failed:', {
            message: error.message,
            stack: error.stack,
            payloadSummary: {
                checklistLength: checklist?.length,
                score,
                totalPoints,
                modelName: 'modelo de respaldo dinámico'
            }
        });
        logger.error('[SGSST Diagnostico] Analysis error:', error);
        res.status(500).json({ error: `Error generando análisis: ${error.message}` });
    }
});

/**
 * POST /api/sgsst/diagnostico/save-report
 * Saves a new SGSST diagnostic report as a conversation+message and tags it.
 */
router.post('/save-report', requireJwtAuth, async (req, res) => {
    try {
        const { content, title, tags } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const conversationId = crypto.randomUUID();
        const messageId = crypto.randomUUID();
        const dateStr = new Date().toLocaleString('es-CO');
        const reportTitle = title || `Diagnóstico SGSST - ${dateStr}`;
        const reportTags = Array.isArray(tags) ? [...tags] : ['sgsst-diagnostico'];

        // Append company tag so report-history can filter by company
        try {
            let activeCompany = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean();
            if (!activeCompany) activeCompany = await CompanyInfo.findOne({ user: req.user.id }).lean();
            if (activeCompany?._id) {
                reportTags.push(`company-${activeCompany._id.toString()}`);
            }
        } catch (e) {
            logger.warn('[SGSST] Could not append company tag to report', e);
        }

        // 1. Save conversation WITH tags atomically (avoids race condition with updateTagsForConversation)
        await saveConvo(req, {
            conversationId,
            title: reportTitle,
            endpoint: 'sgsst-diagnostico',
            model: 'sgsst-diagnostico',
            tags: reportTags,
        }, { context: 'SGSST save-report' });

        // 2. Save message with the report content
        await saveMessage(req, {
            messageId,
            conversationId,
            text: content,
            sender: 'SGSST Diagnóstico',
            isCreatedByUser: false,
            parentMessageId: '00000000-0000-0000-0000-000000000000',
        }, { context: 'SGSST save-report message' });

        // 3. Ensure tags are set (belt-and-suspenders via direct model update)
        try {
            const { Conversation } = require('~/db/models');
            await Conversation.findOneAndUpdate(
                { conversationId, user: req.user.id },
                { $addToSet: { tags: { $each: reportTags } } },
                { new: true },
            );
        } catch (tagErr) {
            logger.warn('[SGSST] Error applying tags via direct update (non-fatal):', tagErr.message);
        }

        res.status(201).json({
            conversationId,
            messageId,
            title: reportTitle,
        });
    } catch (error) {
        logger.error('[SGSST save-report] Error:', error);
        res.status(500).json({ error: 'Error saving report' });
    }
});

/**
 * PUT /api/sgsst/diagnostico/save-report
 * Updates an existing SGSST diagnostic report message.
 */
router.put('/save-report', requireJwtAuth, async (req, res) => {
    try {
        const { conversationId, messageId, content } = req.body;
        if (!conversationId || !messageId || !content) {
            return res.status(400).json({ error: 'conversationId, messageId, and content are required' });
        }

        await updateMessageText(req, { messageId, text: content });

        res.json({ success: true, conversationId, messageId });
    } catch (error) {
        logger.error('[SGSST save-report update] Error:', error);
        res.status(500).json({ error: 'Error updating report' });
    }
});

/**
 * GET /api/sgsst/diagnostico/checklist
 * Returns the applicable checklist items based on filters
 */
router.get('/checklist', (req, res) => {
    const { size = 'medium', risk = '3' } = req.query;

    // The checklist data is handled on the frontend
    // This endpoint can be used for future server-side filtering
    res.json({
        message: 'Checklist data is managed on the frontend',
        filters: { size, risk }
    });
});

/**
 * GET /api/sgsst/diagnostico/report-history
 * Returns report conversations for the ACTIVE company only.
 * Bypasses React Query cache by being a dedicated endpoint.
 * Migrates legacy (untagged) reports to the active company synchronously.
 *
 * Query params:
 *   tags (string | string[]) — module tag(s), e.g. sgsst-perfil-sociodemografico
 */
router.get('/report-history', requireJwtAuth, async (req, res) => {
    try {
        const { Conversation } = require('~/db/models');
        const ConversationModel = Conversation;

        if (!ConversationModel) {
            logger.error('[report-history] Conversation model not available from db/models');
            return res.status(500).json({ error: 'Conversation model not available' });
        }

        // 1. Resolve active company for this user
        let company = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean();
        if (!company) {
            company = await CompanyInfo.findOne({ user: req.user.id }).lean();
            if (company) {
                await CompanyInfo.updateOne({ _id: company._id }, { isActive: true });
            }
        }

        const companyId = company?._id?.toString() ?? null;

        // 2. Parse module tags from query
        const rawTags = req.query.tags;
        const moduleTags = rawTags
            ? (Array.isArray(rawTags) ? rawTags : [rawTags]).filter(Boolean)
            : [];

        if (moduleTags.length === 0) {
            return res.status(400).json({ error: 'At least one tag is required' });
        }

        // 3. Synchronously migrate legacy reports (no company tag) → assign to active company
        if (companyId) {
            try {
                const companyTag = `company-${companyId}`;
                const legacyReports = await ConversationModel.find({
                    user: req.user.id,
                    tags: { $in: moduleTags },
                    $and: [
                        { tags: { $not: /^company-/ } },
                    ],
                }).select('_id tags').lean();

                if (legacyReports && legacyReports.length > 0) {
                    const ids = legacyReports.map(r => r._id);
                    await ConversationModel.updateMany(
                        { _id: { $in: ids } },
                        { $addToSet: { tags: companyTag } },
                    );
                    logger.info(`[report-history] Migrated ${legacyReports.length} legacy reports → ${companyTag}`);
                }
            } catch (migrateErr) {
                logger.warn('[report-history] Migration error (non-fatal):', migrateErr.message);
            }
        }

        // 4. Build strict filter: module tag(s) AND company tag
        const searchTags = companyId
            ? [...moduleTags, `company-${companyId}`]
            : moduleTags;

        const filterOp = companyId
            ? { $all: searchTags }   // AND — must have every tag
            : { $in: searchTags };   // fallback if no company

        const conversations = await ConversationModel.find({
            user: req.user.id,
            tags: filterOp,
            $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
            $and: [{ $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }] }],
        })
            .select('conversationId title updatedAt tags')
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();

        return res.json({
            conversations: conversations || [],
            companyId,
            count: conversations?.length || 0,
        });
    } catch (error) {
        logger.error('[report-history] Error:', error.message, error.stack);
        return res.status(500).json({ error: 'Error fetching report history', details: error.message });
    }
});

module.exports = router;

