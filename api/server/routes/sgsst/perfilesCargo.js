const express = require('express');
const { generateWithKeyRotation, resolveApiKeys } = require('./sgsstGemini');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { getUserKey } = require('~/server/services/UserService');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const CompanyInfo = require('../../../models/CompanyInfo');
const { buildStandardHeader, buildSignatureSection, buildCompanyContextString } = require('./reportHeader');
const { logger } = require('~/config');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');

const router = express.Router();
const mongoose = require('mongoose');

// ─── Helper: Obtener Empresa Activa ──────────────────────────────────────────
async function getActiveCompanyId(userId) {
    let active = await CompanyInfo.findOne({ user: userId, isActive: true });
    if (!active) active = await CompanyInfo.findOne({ user: userId });
    return active ? active._id : null;
}

// ─── Mongoose Schema ──────────────────────────────────────────────────────
const PerfilCargoDataSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyInfo', required: false },
  perfilesList: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now },
});

PerfilCargoDataSchema.index({ user: 1, companyId: 1 }, { unique: true });

const PerfilCargoData =
  mongoose.models.PerfilCargoData ||
  mongoose.model('PerfilCargoData', PerfilCargoDataSchema);

// ─── GET /data ─────────────────────────────────────────────────────────────
router.get('/data', requireJwtAuth, async (req, res) => {
  try {
    const companyId = await getActiveCompanyId(req.user.id);
    const data = await PerfilCargoData.findOne({ user: req.user.id, companyId: companyId });
    if (data) {
      return res.json({ perfilesList: data.perfilesList || [] });
    }
    res.json({ perfilesList: [] });
  } catch (error) {
    logger.error('[SGSST PerfilesCargo] Load error:', error);
    res.status(500).json({ error: 'Error al cargar datos' });
  }
});

// ─── POST /save ────────────────────────────────────────────────────────────
router.post('/save', requireJwtAuth, express.json({ limit: '100mb' }), async (req, res) => {
  try {
    const { perfilesList } = req.body;
    const companyId = await getActiveCompanyId(req.user.id);
    await PerfilCargoData.findOneAndUpdate(
      { user: req.user.id, companyId: companyId },
      { $set: { perfilesList, companyId, updatedAt: Date.now() } },
      { upsert: true, new: true },
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('[SGSST PerfilesCargo] Save error:', error);
    res.status(500).json({ error: 'Error al guardar datos' });
  }
});

// ─── POST /upload ──────────────────────────────────────────────────────────
router.post('/upload', requireJwtAuth, express.json({ limit: '200mb' }), async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No file data' });
    
    // fileData is expected to be a base64 string: data:image/png;base64,iVBORw...
    const matches = fileData.match(/^data:(.+?);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 format' });
    }
    
    const buffer = Buffer.from(matches[2], 'base64');
    const fs = require('fs');
    const path = require('path');
    
    // Save to client/public/images/sgsst
    const uploadDir = path.join(__dirname, '../../../../client/public/images/sgsst');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Secure filename
    const safeName = (fileName || 'upload').replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1000)}-${safeName}`;
    const filePath = path.join(uploadDir, uniqueName);
    
    fs.writeFileSync(filePath, buffer);
    res.json({ url: `/images/sgsst/${uniqueName}` });
  } catch (error) {
    logger.error('[SGSST PerfilesCargo] Upload error:', error);
    res.status(500).json({ error: 'Error al subir el archivo' });
  }
});

const { extractTextFromFile, cleanAndParseJson } = require('./fileExtractorHelper');

// ─── POST /import-file ──────────────────────────────────────────────────────
router.post('/import-file', requireJwtAuth, express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { fileData, fileName, mimeType, modelName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No se recibieron datos del archivo.' });

    // 1. Convertir Base64 a Buffer en memoria
    const base64Data = fileData.split(';base64,').pop();
    const buffer = Buffer.from(base64Data, 'base64');

    // 2. Extraer texto según tipo de archivo de forma robusta
    const extractedText = await extractTextFromFile({ buffer, fileName, mimeType });

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto legible del archivo.' });
    }

    // 3. Configurar e invocar a Gemini con rotación de claves y modelos (503/429/403/400)
    const personalization = req.user?.personalization?.geminiModels;
    const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
    const finalModelName = modelName || preferredModel;

    const modelInstance = {
      model: finalModelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombreCargo: { type: 'string' },
              area: { type: 'string' },
              nivelCargo: { type: 'string', enum: ['Estratégico / Directivo', 'Táctico / Mando Medio', 'Profesional / Técnico', 'Operativo', 'Auxiliar / Asistencial'] },
              tipoContrato: { type: 'string' },
              jornada: { type: 'string' },
              jefeInmediato: { type: 'string' },
              escalasSalarial: { type: 'string' },
              numVacantes: { type: 'string' },
              contextoAdicional: { type: 'string' },
              exigenciaFisica: { type: 'string' },
              exigenciaMental: { type: 'string' },
              operaMaquinaria: { type: 'string' },
              eppSeleccionados: { type: 'array', items: { type: 'string' } },
              entrenamientosSeleccionados: { type: 'array', items: { type: 'string' } },
              controlesFuenteSeleccionados: { type: 'array', items: { type: 'string' } },
              controlesMedioSeleccionados: { type: 'array', items: { type: 'string' } },
            },
            required: ['nombreCargo', 'area', 'nivelCargo'],
          },
        },
      },
    };

    const promptText = `
    Eres un experto senior en diseño de perfiles de cargo y Seguridad y Salud en el Trabajo (SST) en Colombia.
    Tu tarea es leer el siguiente documento adjunto y extraer todos los perfiles de cargo descritos en él.
    Para cada cargo identificado, mapea la información a la estructura JSON solicitada.
    Si no encuentras información exacta para un campo (como EPPs o Controles), infiérelos técnicamente según las responsabilidades y riesgos lógicos del cargo de acuerdo con la normatividad de SST (GTC 45).
    
    Asegúrate de:
    - Retornar un array JSON conteniendo cada perfil de cargo como un objeto.
    - Si el nombre del archivo contiene pistas del cargo (ej: "Coordinador Administrativo"), úsalo para precisar el campo 'nombreCargo'.
    - El campo 'nivelCargo' debe ser estrictamente uno de los siguientes valores: 'Estratégico / Directivo', 'Táctico / Mando Medio', 'Profesional / Técnico', 'Operativo', 'Auxiliar / Asistencial'.
    
    DOCUMENTO A ANALIZAR:
    Nombre del archivo: ${fileName || 'Documento adjunto'}
    
    ${extractedText}
    `;

    const result = await generateWithKeyRotation(modelInstance, req.user?.id || req.user, [{ text: promptText }]);
    const response = await result.response;
    const responseText = response.text();
    const cleanJson = cleanAndParseJson(responseText);

    res.json({ success: true, perfiles: Array.isArray(cleanJson) ? cleanJson : [cleanJson] });
  } catch (error) {
    logger.error('[SGSST PerfilesCargo] Import error:', error);
    res.status(500).json({ error: error.message || 'Error al procesar el archivo con IA' });
  }
});

// ─── POST /generate ────────────────────────────────────────────────────────
router.post('/generate', requireJwtAuth, async (req, res) => {
  try {
    const { perfilData, modelName } = req.body;

    let resolvedApiKey = null;
    try {
      const storedKey = await getUserKey({ userId: req.user.id, name: 'google' });
      try {
        const parsed = JSON.parse(storedKey);
        resolvedApiKey = parsed['google'] || parsed.apiKey || parsed.GOOGLE_API_KEY;
      } catch {
        resolvedApiKey = storedKey;
      }
    } catch (err) {
      logger.debug('[SGSST PerfilesCargo] No user Google key found, trying env vars:', err.message);
    }

    if (!resolvedApiKey) {
      resolvedApiKey = process.env.GOOGLE_KEY || process.env.GEMINI_API_KEY;
    }

    if (resolvedApiKey && typeof resolvedApiKey === 'string') {
      resolvedApiKey = resolvedApiKey.split(',')[0].trim();
    }

    if (!resolvedApiKey || resolvedApiKey === 'user_provided') {
      return res.status(400).json({
        error:
          'No se ha configurado la clave API de Google. Por favor, configúrala en la opción de Google del menú principal e intenta nuevamente.',
      });
    }

    const personalization = req.user?.personalization?.geminiModels;
    const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
    const finalModelName = modelName || preferredModel;
    const genAI = new GoogleGenerativeAI(resolvedApiKey);
    const model = genAI.getGenerativeModel({ model: finalModelName });

    const currentDate = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let loadedCompanyInfo = null;
    try {
      loadedCompanyInfo = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean()
        || await CompanyInfo.findOne({ user: req.user.id }).lean();
    } catch (e) {
      logger.warn('[SGSST PerfilesCargo] Failed to load company info');
    }

    const companyContext = buildCompanyContextString(loadedCompanyInfo);
    const headerHTML = buildStandardHeader({
      title: 'PERFIL DE CARGO EXTENSO (GTC 45)',
      companyInfo: loadedCompanyInfo,
      date: currentDate,
      norm: 'Art. 16 de la Resolución 1843 de 2025 & GTC 45:2012',
      responsibleName: req.user?.name,
    });

    const eppText = perfilData.eppSeleccionados?.length > 0
      ? perfilData.eppSeleccionados.join(', ')
      : 'Específicos según riesgo';

    const entrenamientoText = perfilData.entrenamientosSeleccionados?.length > 0
      ? perfilData.entrenamientosSeleccionados.join(', ')
      : 'SST Básico';

    const controlesFuenteText = perfilData.controlesFuenteSeleccionados?.length > 0
      ? perfilData.controlesFuenteSeleccionados.join(', ')
      : 'Por definir según inspección de ingeniería';

    const controlesMedioText = perfilData.controlesMedioSeleccionados?.length > 0
      ? perfilData.controlesMedioSeleccionados.join(', ')
      : 'Por definir según monitoreo de higiene industrial';

    const promptText = `
Eres un Experto Senior en Gestión Humana, Seguridad y Salud en el Trabajo (SG-SST) y Psicología Organizacional con 20 años de experiencia. Tu especialidad es el diseño técnico de perfiles de cargo altamente detallados según la normativa colombiana actual, integrando la metodología de matriz bio-individual (alineada con la GTC 45) y la **Resolución 1843 de 2025 (Art. 16)**.

Tu objetivo es generar el **PERFIL DE CARGO MÁS COMPLETO, EXTENSO Y TÉCNICO POSIBLE** en formato HTML. No escatimes en detalles. Desarrolla cada punto con profundidad académica y práctica.

**INFORMACIÓN DE LA EMPRESA:**
${companyContext}

**DATOS DEL CARGO A GENERAR:**
- Nombre del Cargo: ${perfilData.nombreCargo || '[PENDIENTE]'}
- Área / Departamento: ${perfilData.area || '[PENDIENTE]'}
- Nivel del Cargo: ${perfilData.nivelCargo || 'Operativo'}
- Tipo de Contrato: ${perfilData.tipoContrato || 'Término indefinido'}
- Jornada Laboral: ${perfilData.jornada || 'Tiempo completo (8 horas/día)'}
- Cargo del Jefe Inmediato: ${perfilData.jefeInmediato || '[PENDIENTE]'}
- Escala Salarial / Rango: ${perfilData.escalasSalarial || 'No especificado'}
- Número de Vacantes: ${perfilData.numVacantes || '1'}
- Controles sugeridos en la Fuente (Ingeniería/Diseño): ${controlesFuenteText}
- Controles sugeridos en el Medio (Entorno/Organización): ${controlesMedioText}
- EPP Seleccionados por el usuario: ${eppText}
- Entrenamientos Seleccionados por el usuario: ${entrenamientoText}
- Contexto Adicional proporcionado: ${perfilData.contextoAdicional || 'No proporcionado'}

**INSTRUCCIONES DE CONTENIDO CRÍTICO:**

1.  **EXTENSIÓN Y PROFUNDIDAD:** Cada sección debe ser rica en texto. Si mencionas una función, explica su impacto. Si mencionas un riesgo, detalla su origen y control según la jerarquía de controles de ley.
2.  **RIESGOS Y CONTROLES (MATRIZ BIO-INDIVIDUAL):** Identifica **TODOS** los peligros que apliquen razonablemente al cargo. Clasifícalos de manera estricta según los **Dominios** y **Dimensiones** de nuestra Metodología Bio-Individual:
    - **Osteomuscular**: Postura (mantenida, forzada, antigravitacional), Esfuerzo, Movimiento repetitivo, Manipulación manual de cargas.
    - **Cardiovascular**: Temperaturas extremas (calor/frío), Presión atmosférica, Exigencia cardiovascular alta, Trabajo sedentario prolongado.
    - **Neurológico**: Vibración (cuerpo entero, segmentaria), Fatiga del sistema nervioso, Alteración del ciclo circadiano, Sobrecarga sensorial.
    - **Psicoemocional**: Gestión organizacional, Características de la organización, Características del grupo social, Condiciones de la tarea, Interfase persona-tarea, Jornada de trabajo.
    - **Metabólico**: Líquidos (nieblas y rocíos), Alteración nutricional/digestiva, Desbalance térmico extremo, Sedentarismo metabólico.
    - **Respiratorio**: Polvos orgánicos/inorgánicos, Fibras, Gases y vapores, Humos metálicos/no metálicos, Material particulado.
    - **Sensorial**: Ruido (impacto, intermitente, continuo), Iluminación (exceso o deficiencia), Radiaciones no ionizantes, Radiaciones ionizantes, Afectación táctil/olfativa.
    - **Inmunológico**: Virus, Bacterias, Hongos, Ricketsias, Parásitos, Picaduras/Mordeduras, Fluidos o excrementos.
    - **Seguridad**: Mecánico (máquinas, herramientas), Eléctrico (alta/baja tensión), Locativo (superficies, caídas), Tecnológico (explosión, incendio), Accidentes de tránsito, Públicos (robos, asaltos), Trabajo en alturas, Espacios confinados, Fenómenos naturales (Sismo, etc.).
    Para cada peligro identificado, describe detalladamente los controles existentes en la fuente, el medio y la persona/individuo.
3.  **NORMATIVA:** Debes mencionar y alinearte explícitamente con el Art. 16 de la Resolución 1843 de 2025.

**ESTRUCTURA OBLIGATORIA (HTML):**

1️⃣ **IDENTIFICACIÓN TÉCNICA DEL CARGO**
   Tabla detallada que incluya también: Código de cargo (si aplica), Versión del perfil, Nivel de Riesgo ARL asignado.

2️⃣ **MISIÓN Y PROPÓSITO ESTRATÉGICO**
   Un texto extenso (mínimo 2 párrafos de 5 líneas) que conecte el cargo con los objetivos de la empresa y la seguridad laboral.

3️⃣ **I. MATRIZ DE FUNCIONES, RESPONSABILIDADES Y RENDICIÓN DE CUENTAS**
   Tabla con 3 columnas: Función Detallada, Periodicidad (Diaria/Semanal/Mensual), y Responsabilidad SST asociada. Incluye al menos 12-15 funciones altamente específicas.

4️⃣ **II. PERFIL DE COMPETENCIAS (SABER, HACER, SER)**
   - **Competencias Técnicas (Saber):** Tabla extensa con conocimientos académicos, normativos y de herramientas.
   - **Competencias del Cargo (Hacer):** Habilidades prácticas.
   - **Competencias Blandas/Socioemocionales (Ser):** Liderazgo, inteligencia emocional, etc.

5️⃣ **III. REQUISITOS DE INGRESO (PROFESIOGRAMA)**
   Tabla con subtítulos para Formación, Experiencia mínima (meses/años), Experiencia específica y **Capacitaciones Obligatorias de Ley**.

6️⃣ **IV. REQUISITOS FÍSICOS Y MENTALES (EXIGENCIAS BIOMECÁNICAS)**
   Detalla posturas (sentado, de pie, caminata), levantamiento de cargas (pesos exactos máximos de ley), exigencia visual, auditiva y carga mental cognitiva.

7️⃣ **V. MATRIZ DE PELIGROS, RIESGOS Y CONTROLES (BASADA EN METODOLOGÍA BIO-INDIVIDUAL)**
   Tabla con columnas: Dominio Bio-Individual | Dimensión Bio-Individual | Peligro del Cargo (Descripción del peligro/actividad de riesgo) | **Controles Existentes (Fuente, Medio, Individuo)** | Efectos Posibles en la Salud.
   *Debe ser la sección más larga del informe.*

8️⃣ **VI. PLAN DE ENTRENAMIENTO, ELEMENTOS DE PROTECCIÓN (EPP) Y MEDIDAS COLECTIVAS**
   - Tabla de Controles sugeridos en la Fuente (Ingeniería/Diseño) para mitigar el peligro en el origen. Integra: ${controlesFuenteText}.
   - Tabla de Controles sugeridos en el Medio (Físico/Ambiental) para mitigar el peligro en el entorno de propagación. Integra: ${controlesMedioText}.
   - Tabla de EPP detallando el tipo de protección (ej. Gafas con filtro UV y antiempañante Z87+). Integra los EPP seleccionados: ${eppText}.
   - Tabla de formación continua y entrenamientos. Integra: ${entrenamientoText}.

9️⃣ **VII. INDICADORES DE GESTIÓN (KPIs)**
   Mínimo 5 indicadores con nombre, fórmula, meta esperada y frecuencia.

🔟 **VIII. AUTORIDAD Y TOMA DE DECISIONES**
   ¿Qué puede decidir el cargo? ¿En qué momentos tiene autoridad para detener un trabajo por riesgo inminente?

**DISEÑO HTML PREMIUM:**
- Usa tablas elegantes, sombreados sutiles en las cabeceras (\`#0f766e\`), y tipografía legible.
- Toda tabla debe ir OBLIGATORIAMENTE dentro de: \`<div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0;"><table style="width: 100%; border-collapse: collapse;">...</table></div>\`.
- Distribuye el ancho de las columnas de forma proporcional y equilibrada (evita que una sola columna ocupe el 100% de la tabla; por ejemplo en Matriz de Funciones usa: Función Detallada 45%, Periodicidad 20%, Responsabilidad SST 35%).
- **NO** incluyas bloques de código \`\`\`html. Responde directamente con el código.
- **NO** incluyas firmas.
`;

    const result = await generateWithKeyRotation(model, req.user?.id || req.user, [{ text: promptText }]);
    const response = await result.response;
    const htmlBody = response
      .text()
      .replace(/```html\n? ?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let processedHtmlBody = htmlBody;
    if (processedHtmlBody.includes('<table') && !processedHtmlBody.includes('table-responsive')) {
      processedHtmlBody = processedHtmlBody
        .replace(/<table/gi, '<div class="table-responsive custom-table-scroll" style="width: 100%; overflow-x: auto; margin: 16px 0;"><table')
        .replace(/<\/table>/gi, '</table></div>');
    }

    let fullReport = headerHTML + '<div style="margin-top: 20px;">' + processedHtmlBody + '</div>';

    if (loadedCompanyInfo) {
      fullReport += buildSignatureSection(loadedCompanyInfo);
    }

    res.json({ report: fullReport });
  } catch (error) {
    logger.error('[SGSST PerfilesCargo] Generation error:', error);
    res.status(500).json({ error: 'Error al generar el Perfil de Cargo' });
  }
});

module.exports = router;
