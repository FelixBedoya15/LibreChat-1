const WebSocket = require('ws');
const logger = require('~/config/winston');
const GeminiLiveClient = require('./geminiLive');
const { getUserKey } = require('~/server/services/UserService');
const { EModelEndpoint } = require('librechat-data-provider');
const { saveMessage, saveConvo, getMessages, updateMessage } = require('~/models');
const { v4: uuidv4 } = require('uuid');
const { generateWithKeyRotation, SGSST_FALLBACK_MODELS, LIVE_FALLBACK_MODELS } = require('../sgsst/sgsstGemini');
const mongoose = require('mongoose');
const CompanyInfo = require('~/models/CompanyInfo');
const { buildSignatureSection, buildStandardHeader, buildWorkerSubHeader } = require('../sgsst/reportHeader');
const fs = require('fs');
const path = require('path');
const SKILLS_DIR = path.resolve(__dirname, '../../../config/skills');
const { resolveInspectionProtocol, INSPECTION_PROTOCOLS } = require('./inspectionProtocols');

/**
 * Sanitizes voice transcription for common Spanish/SST phonetic misrecognitions
 */
function sanitizeTranscription(text) {
    if (!text || typeof text !== 'string') return text;
    let s = text;

    // Filter out obvious Hindi/Urdu hallucinated chunks if Gemini STT drifted
    if (/\b(aur|ek\s+chhat|hai\s+na|jo\s+hamara|system\s+hai\s+na)\b/i.test(s)) {
        s = s.replace(/aur\s+ek\s+chhat\s+dil\s+consultant\s+jo\s+system\s+hai\s+na\s+jo\s+hamara\s+jo\s+system\s+hai/gi, 'abre el sistema o consultor de la plataforma');
    }

    // Fix affirmative false cognates (e.g. Google STT hearing "bistro" for "listo")
    s = s.replace(/\b(bistro|visto|misto|cristo|pisto|disto)\b/gi, (match) => {
        return match[0] === match[0].toUpperCase() ? 'Listo' : 'listo';
    });

    // Fix report voice triggers
    s = s.replace(/\bgeneral\s+(el\s+|al\s+)?(informe|reporte)\b/gi, 'generar el informe');
    s = s.replace(/\b(has|hazme|as)\s+el\s+(informe|reporte)\b/gi, 'haz el informe');
    s = s.replace(/\b(quiero|dame)\s+el\s+(reporte|informe)\b/gi, 'genera el informe');

    return s;
}

/**
 * Loads and extracts clean technical domain knowledge from agent skills
 */
function getAgentSkillsContent(agentObj, isBiomechanics) {
    const skillsToLoad = new Set();

    if (agentObj && Array.isArray(agentObj.skills) && agentObj.skills.length > 0) {
        agentObj.skills.forEach(s => skillsToLoad.add(s));
    }

    // Force biomechanics essential skills
    const name = (agentObj?.name || '').toLowerCase();
    if (isBiomechanics || name.includes('fisio') || name.includes('biomec') || name.includes('ergon')) {
        skillsToLoad.add('skill-live-biomecanica');
        skillsToLoad.add('skill-metodologia-rosa');
        skillsToLoad.add('skill-ergonomia-owas');
    }

    if (skillsToLoad.size === 0 || !fs.existsSync(SKILLS_DIR)) {
        return '';
    }

    const loadedBlocks = [];
    for (const skillName of skillsToLoad) {
        try {
            const fileName = skillName.endsWith('.md') ? skillName : `${skillName}.md`;
            const filePath = path.join(SKILLS_DIR, fileName);
            if (!fs.existsSync(filePath)) continue;

            const content = fs.readFileSync(filePath, 'utf8');
            let body = content;

            // Strip YAML frontmatter
            const match = content.match(/^---(\s*[\s\S]*?)---(\s*[\s\S]*)$/);
            if (match) {
                body = match[2].trim();
            }

            // Strip written-chat questionnaires, authorization flows, and markdown tables
            const cleanBody = body
                .replace(/<[^>]*>/g, '')
                .replace(/\|[^\n]+\|/g, '')
                .replace(/🔄 PROCESO DE RECOLECCIÓN DE DATOS INTERACTIVO[\s\S]*?(?=📋 Restricciones|##|$)/gi, '')
                .replace(/Información inicial que siempre pedirás[\s\S]*?(?=🔹|---|##|$)/gi, '')
                .replace(/¿autoriza la elaboración[\s\S]*?Sí \/ No/gi, '')
                .replace(/\{\{[^}]+\}\}/g, 'usuario')
                .trim();

            if (cleanBody) {
                const trimmed = cleanBody.length > 2500 ? cleanBody.substring(0, 2500) + '...' : cleanBody;
                loadedBlocks.push(`[SKILL: ${skillName.toUpperCase()}]\n${trimmed}`);
            }
        } catch (err) {
            logger.warn(`[VoiceSession] Error loading skill "${skillName}":`, err.message);
        }
    }

    return loadedBlocks.join('\n\n');
}

/**
 * Strips written-chat artifacts from agent instructions for natural voice interaction
 */
function cleanAgentInstructions(instructions) {
    if (!instructions || typeof instructions !== 'string') return '';
    return instructions
        .replace(/<[^>]*>/g, '')
        .replace(/\|[^\n]+\|/g, '')
        .replace(/Información inicial que siempre pedirás[\s\S]*?(?=🔹|---|##|$)/gi, '')
        .replace(/Preguntas clave\s*\([^)]*\)/gi, '')
        .replace(/Tamaño de la empresa[\s\S]*?actividad económica\./gi, '')
        .replace(/Clase de riesgo ARL[\s\S]*?\./gi, '')
        .replace(/Estado actual de implementación[\s\S]*?\./gi, '')
        .replace(/Rol del usuario dentro del sistema[\s\S]*?\./gi, '')
        .replace(/🔹\s*6\.\s*Información inicial[\s\S]*?(?=🔹|---|##|$)/gi, '')
        .replace(/🔹\s*4\.\s*Estructura recomendada[\s\S]*?(?=🔹|---|##|$)/gi, '')
        .replace(/🔹\s*10\.\s*Ejemplos de inicio[\s\S]*?(?=🔹|---|##|$)/gi, '')
        .replace(/🔹 11\. Reglas de Formato Visual[\s\S]*?(?=🔹|---|##|$)/gi, '')
        .replace(/⚠️ REGLA DE ORO DE TARJETAS[\s\S]*?(?=⚠️|🔹|---|##|$)/gi, '')
        .replace(/⚠️ REGLA DE ORO DE AUTOMATIZACIONES[\s\S]*?(?=⚠️|🔹|---|##|$)/gi, '')
        .replace(/\{\{[^}]+\}\}/g, 'usuario')
        .trim();
}

/**
 * Active voice sessions
 * Map of userId -> VoiceSession
 */
const activeSessions = new Map();

/**
 * Voice Session Manager
 * Manages a voice conversation session between client and Gemini
 */
class VoiceSession {
    constructor(clientWs, userId, apiKeys, config = {}, conversationId = null) {
        this.clientWs = clientWs;
        this.userId = userId;
        this.apiKeys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
        this.config = config;

        // Context persistence: Use model/endpoint from client (Chat/Agent)
        this.dbModel = config.model;
        this.dbEndpoint = config.endpoint || EModelEndpoint.google;

        // Verify/Set defaults if missing (for DB saving)
        if (!this.dbModel) {
            // Fallback to voice model if no chat model provided
            this.dbModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.5-flash';
        }

        // Voice Configuration: Separate from DB Config
        this.liveConfig = { ...config };

        // CRITICAL: Ensure we don't pass an Agent ID or incompatible model to Gemini Live (WebSocket)
        // Gemini Live requires specific models (e.g. gemini-2.5-flash-native...).
        // Priority: 
        // 1. Explicit model passed from client (e.g. dropdown in LivePage)
        // 2. User personalization settings (Personalization panel)
        // 3. System default (GEMINI_LIVE_MODEL env)

        let candidateModel = config.model; // Dropdown priority
        let finalModel = null;
        
        const isSupported = (name) => {
            if (!name) return false;
            return name.toLowerCase().includes('gemini-') || ['native-audio', 'live', 'preview'].some(
                validModel => name.toLowerCase().includes(validModel)
            );
        };

        // Try candidate (dropdown)
        if (isSupported(candidateModel)) {
            finalModel = candidateModel;
        } 
        // If dropdown was invalid/missing, try User Personalization fallback
        else if (isSupported(this.config?.userSettings?.liveAnalysis)) {
            logger.warn(`[VoiceSession] Model "${candidateModel}" invalid. Falling back to personal settings: ${this.config.userSettings.liveAnalysis}`);
            finalModel = this.config.userSettings.liveAnalysis;
        } 
        // Neither are valid, completely delete to use GeminiLiveClient fallback
        else {
            logger.warn(`[VoiceSession] Neither requested model nor personalization are compatible for Live. Using system default.`);
            finalModel = null;
        }

        if (finalModel) {
            this.liveConfig.model = finalModel;
            logger.info(`[VoiceSession] Using live model: ${this.liveConfig.model}`);
        } else {
            delete this.liveConfig.model;
        }

        this.conversationId = conversationId;
        this.geminiClient = null;
        this.isActive = false;

        // Text accumulation for saving
        this.userTranscriptionText = '';
        this.aiResponseText = '';
        this.aiTranscriptionBuffer = ''; // ← NEW: accumulates AI speech transcription separately
        this.aiAudioChunkCount = 0; // Count audio chunks to know if AI responded with voice
        this.lastMessageId = null; // Track last message ID for parent linking
        this.activeEvidenceMessageId = null; // Track current grouped evidence message ID
        this.manualEvidences = []; // Stored manual evidence photos
        this.phaseEvidences = {}; // Stored structured multi-phase photos and telemetries
        this.lastEvaluatedFrames = []; // Fallback cache of last evaluated frames
        this.lastPhaseEvidences = {}; // Fallback cache of last phase evidences
        this.agentObj = null;
        this.isBiomechanics = false;
        this.toolCalledThisTurn = false;

        logger.info(`[VoiceSession] Created for user: ${userId}, conversationId: ${conversationId || 'NULL'}`);

        // Modo Tenshi: Asistente oficial con control de plataforma por voz
        if (this.config.mode === 'tenshi_voice') {
            this.liveConfig.voice = this.config.voice || 'Aoede';
            this.liveConfig.tools = [
                {
                    functionDeclarations: [
                        {
                            name: "wappy_navegar",
                            description: "Navega de inmediato a cualquier módulo, hito, pantalla o aplicativo de la plataforma WAPPY y Somos SST. DEBES invocar esta función siempre que el usuario te pida ir, ver, abrir o consultar una sección o hito.",
                            parameters: {
                                type: "object",
                                properties: {
                                    modulo: {
                                        type: "string",
                                        description: "Nombre clave del módulo, hito o aplicativo. Ejemplos: 'predictivo', 'perfil_cargo', 'peligros', 'vehicles_pesv', 'chemical_registry', 'permiso_alturas', 'analisis_trabajo_seguro', 'metodo_owas', 'capacitaciones', 'ruta_aprendizaje', 'control_acpm', 'estadisticas', 'investigacion_atel', 'investigacion_profunda', 'auditoria', 'diagnostico', 'responsable', 'politica', 'legal', 'rhs', 'vulnerabilidad', 'perfil_socio', 'condiciones_salud', 'animo', 'participacion_ipevar', 'epp_delivery', 'heights_lifecycle', 'reporte_actos', 'app_builder', 'alta_direccion', 'planes', 'academia', 'training_admin', 'ruta_admin', 'blog', 'blog_admin', 'events_meet', 'events_meet_admin', 'agents', 'live', 'chat_sst', 'animo_dashboard', 'roadmap', 'contactanos', 'comunidad', 'matriz', 'embajadores', 'tenshi_admin'"
                                    },
                                    ruta: {
                                        type: "string",
                                        description: "Ruta URL interna exacta. Ejemplos: '/sgsst?hito=hito7&module=predictivo', '/sgsst?hito=hito2&module=perfil_cargo', '/sgsst?hito=hito3&module=peligros', '/sgsst?hito=hito4&module=vehicles_pesv', '/sgsst?hito=hito4&module=chemical_registry', '/planes', '/academia?tab=cursos', '/training/admin', '/ruta-aprendizaje/admin', '/blog', '/blog/admin', '/events-meet', '/sgsst/control', '/sgsst/animo', '/auditoria', '/agents', '/live', '/chat-sst', '/hoja-de-ruta', '/contactanos', '/comunidad', '/matriz', '/embajadores', '/tenshi/admin'"
                                    }
                                },
                                required: ["modulo"]
                            }
                        },
                        {
                            name: "wappy_seleccionar_empresa",
                            description: "Activa o selecciona una empresa específica en el sistema por su nombre o identificación para trabajar sobre sus datos.",
                            parameters: {
                                type: "object",
                                properties: {
                                    nombre_o_id: {
                                        type: "string",
                                        description: "Nombre de la empresa o identificador."
                                    }
                                },
                                required: ["nombre_o_id"]
                            }
                        },
                        {
                            name: "operar_interfaz_visual",
                            description: "Ejecuta una acción visual interactiva en la pantalla del usuario (hacer clic en un botón, expandir sección, hacer scroll, abrir plan).",
                            parameters: {
                                type: "object",
                                properties: {
                                    accion: {
                                        type: "string",
                                        description: "Acción a ejecutar: 'click', 'scroll', 'esperar', 'abrir_plan'"
                                    },
                                    detalle: {
                                        type: "string",
                                        description: "Descripción del botón o elemento (ej: 'configurar plan', 'abrir tarjeta')"
                                    }
                                },
                                required: ["accion"]
                            }
                        },
                        {
                            name: "wappy_abrir_chat_agente",
                            description: "Abre de inmediato un nuevo chat directamente con cualquiera de los agentes especialistas de WAPPY (Abogado Laboral, Médico Laboral, Fisioterapeuta Laboral, Ingeniero Químico SST, Coordinador PESV, Psicólogo SST, Terapeuta en Salud Mental, Nutricionista Laboral, Primer Respondiente, Coordinador de Emergencias, Especialista en Bioseguridad, Ingeniero Electricista SST, Coordinador de Tareas Críticas, Ingeniero de Minas SST, Auditor SG-SST, Ingeniero Ambiental, Especialista en Riesgo Climático, Redactor Creativo, Simulador de Accidentes SST, Coordinador de Capacitaciones, Consultor Senior SG-SST, Coordinador IPEVAR, Asistente ATS, Asistente TSA, Creador de Formatos, Asistente ACI) y opcionalmente le envía una consulta o pregunta inicial para que el especialista responda de inmediato en pantalla.",
                            parameters: {
                                type: "object",
                                properties: {
                                    agente: {
                                        type: "string",
                                        description: "Nombre o especialidad del agente. Ejemplos: 'abogado_laboral', 'medico_laboral', 'fisioterapeuta_laboral', 'ingeniero_quimico_sst', 'coordinador_seguridad_vial', 'psicologo_sst', 'terapeuta_salud_mental', 'nutricionista_laboral', 'primer_respondiente', 'coordinador_emergencias', 'especialista_bioseguridad', 'ingeniero_electricista_sst', 'coordinador_tareas_criticas', 'ingeniero_minas_sst', 'auditor_sg_sst', 'ingeniero_ambiental', 'especialista_riesgo_climatico', 'redactor_creativo', 'simulador_accidentes', 'coordinador_capacitaciones', 'profesional_sst', 'agente_sst', 'coordinador_ipevar', 'asistente_ats', 'asistente_permiso_tsa', 'creador_formatos', 'asistente_de_aci'"
                                    },
                                    pregunta: {
                                        type: "string",
                                        description: "Pregunta o consulta textual exacta del usuario para el especialista. DEBES incluirla siempre que el usuario pida consultar o preguntar algo."
                                    }
                                },
                                required: ["agente"]
                            }
                        }
                    ]
                }
            ];

            this.liveConfig.systemInstruction = `[DIRECTIVA CRÍTICA DE IDIOMA Y AUDICIÓN]:
- IDIOMA EXCLUSIVO: ESPAÑOL DE COLOMBIA / LATINOAMÉRICA.
- El usuario habla ÚNICA Y EXCLUSIVAMENTE en ESPAÑOL.
- ESTÁ TERMINANTEMENTE PROHIBIDO interpretar o responder en otro idioma. Responde siempre en español con tono fresco, empático y profesional ("de una", "listo", "hágale", "vamos para allá").
- MAXIMA AGILIDAD: Sé ultra concisa, habla en 1 o máximo 2 oraciones cortas (10 a 15 palabras). Cero rodeos.

[ROL]:
Eres Tenshi, copiloto y orquestadora oficial de WAPPY IA y Somos SST. Tienes control en tiempo real para abrir cualquier agente y navegar a cualquier sección.

[HERRAMIENTAS]:
1. **wappy_abrir_chat_agente**: Abre de inmediato el chat con el agente y formula su pregunta.
   - Parámetros: 'agente' (ej: 'psicologo_sst', 'abogado_laboral', 'medico_laboral', 'fisioterapeuta_laboral', 'ingeniero_quimico_sst', 'coordinador_seguridad_vial', 'coordinador_tareas_criticas', 'auditor_sg_sst', 'coordinador_ipevar', 'asistente_ats', 'asistente_permiso_tsa', 'creador_formatos', etc.) y 'pregunta' (la consulta textual del usuario).
   - REGLA DE ORO: Si el usuario pide preguntar o hablar con un especialista, INVOCA INMEDIATAMENTE esta herramienta pasando 'agente' y 'pregunta'. Nunca respondas solo con voz si vas a abrir un chat.
   - Responde oralmente en una frase: "¡Listo! Abriendo el chat con el especialista y pasándole tu consulta."
   - Espera la respuesta técnica: NUNCA inventes lo que respondió el especialista hasta recibir el mensaje del sistema.
2. **wappy_navegar**: Navega a cualquier módulo de los 7 Hitos o aplicativo.
   - Hitos: 'diagnostico' (0312), 'responsable', 'politica', 'legal', 'rhs', 'vulnerabilidad', 'perfil_cargo', 'perfil_socio', 'condiciones_salud', 'peligros' (IPEVAR), 'animo', 'participacion_ipevar', 'vehicles_pesv', 'chemical_registry', 'permiso_alturas', 'analisis_trabajo_seguro', 'metodo_owas', 'epp_delivery', 'capacitaciones', 'ruta_aprendizaje', 'reporte_actos', 'estadisticas', 'investigacion_atel', 'control_acpm', 'auditoria', 'predictivo'.
   - Aplicativos: 'academia' (/academia?tab=cursos), 'training_admin', 'rutas', 'ruta_admin', 'events_meet', 'events_meet_admin', 'blog', 'blog_admin', 'control' (Kanban), 'animo_dashboard', 'planes', 'agents', 'live', 'chat_sst', 'roadmap', 'contactanos', 'comunidad', 'matriz', 'embajadores', 'tenshi_admin'.
   - INVÓCALA DE INMEDIATO si el usuario menciona un destino.
3. **SÍNTESIS DE RESPUESTAS**: Cuando recibas la notificación del sistema con la respuesta del especialista, da un resumen ejecutivo de 2 oraciones al usuario y recomienda el siguiente paso.`;
        } else {
            // Herramientas nativas para agentes SST y Fisioterapeuta Laboral
            const reportTool = {
                name: "generar_informe_tecnico",
                description: "Genera el informe técnico ergonómico o de riesgos SST con las evidencias fotográficas y mediciones recopiladas en vivo. DEBES llamar a esta función cuando se hayan completado las 3 fases de la evaluación O cuando el usuario te pida expresamente hacer o generar el informe ('haz el informe', 'genera el reporte'). NUNCA la llames durante el saludo o en los pasos 1 y 2.",
                parameters: {
                    type: "object",
                    properties: {
                        motivo: {
                            type: "string",
                            description: "Método aplicado o resumen breve para el informe (ej: 'Método RULA', 'Método REBA', 'Evaluación de puesto de trabajo')"
                        }
                    }
                }
            };

            const phaseTool = {
                name: "cambiar_fase_evaluacion",
                description: "Avanza o cambia la fase actual de la evaluación en la pantalla del usuario (Fase 1: Postura Habitual, Fase 2: Alcance Máximo/Cargas, Fase 3: Fatiga/Deslizamiento). Invócala cuando le indiques al usuario pasar a la siguiente fase de la evaluación.",
                parameters: {
                    type: "object",
                    properties: {
                        fase: {
                            type: "number",
                            description: "Número de fase destino (1, 2 o 3)"
                        }
                    },
                    required: ["fase"]
                }
            };

            this.liveConfig.tools = [
                {
                    functionDeclarations: [reportTool, phaseTool]
                }
            ];
        }

        // Setup client handlers once
        this.setupClientHandlers();
    }


    /**
     * Initialize and start the session
     */
    async start() {
        try {
            // FIX FASE 3 & 5: Cargar historial y último mensaje si es chat existente (últimos 6 mensajes para contexto ligero)
            if (this.conversationId && this.conversationId !== 'new') {
                try {
                    const messages = await getMessages({
                        conversationId: this.conversationId,
                        user: this.userId
                    }, null, { limit: 6, sort: { createdAt: -1 } });

                    if (messages && messages.length > 0) {
                        // 1. Set lastMessageId (FASE 3 - Mensajes Verticales)
                        const sortedMessages = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        this.lastMessageId = sortedMessages[0].messageId;
                        logger.info(`[VoiceSession] Loaded lastMessageId: ${this.lastMessageId}`);

                        // 2. Build Context (FASE 5 - Memoria con ventana ligera)
                        const contextMessages = [...messages].reverse().map(msg => {
                            const role = msg.isCreatedByUser ? 'Usuario' : 'Asistente';
                            let text = msg.text;
                            if (!text && Array.isArray(msg.content)) {
                                text = msg.content.map(c => c.text || '').join(' ');
                            }
                            return `${role}: ${(text || '[Contenido multimedia]').substring(0, 200)}`;
                        });

                        this.conversationTurns = [...contextMessages];
                        this.config.conversationContext = contextMessages.join('\n');
                        logger.info(`[VoiceSession] Loaded context with ${messages.length} messages`);
                    }
                } catch (error) {
                    logger.error(`[VoiceSession] Error loading history:`, error);
                }
            }

            // Try connecting with API key AND model rotation
            let success = false;
            let lastError = null;

            const rawPreferredLiveModel = this.liveConfig.model || process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
            
            const mapModelToRealGoogleModel = (modelName) => {
                if (!modelName) return 'gemini-3.1-flash-live-preview';
                const name = modelName.toLowerCase().trim();
                if (name === 'gemini-3.1-flash-live-preview' || name === 'gemini-2.5-flash-native-audio-preview-12-2025' || name === 'gemini-2.5-flash-native-audio-preview-09-2025') {
                    return name;
                }
                if (name.includes('3.5') || name.includes('3.1') || name.includes('live')) {
                    return 'gemini-3.1-flash-live-preview';
                }
                if (name.includes('09-2025')) {
                    return 'gemini-2.5-flash-native-audio-preview-09-2025';
                }
                if (name.includes('12-2025')) {
                    return 'gemini-2.5-flash-native-audio-preview-12-2025';
                }
                if (name.includes('2.5') || name.includes('native-audio')) {
                    return 'gemini-2.5-flash-native-audio-preview-12-2025';
                }
                return 'gemini-3.1-flash-live-preview';
            };

            const preferredLiveModel = mapModelToRealGoogleModel(rawPreferredLiveModel);
            const liveFallbacks = LIVE_FALLBACK_MODELS.map(m => mapModelToRealGoogleModel(m)).filter(m => m !== preferredLiveModel);
            const liveModelsToTry = [...new Set([preferredLiveModel, ...liveFallbacks])];

            logger.info(`[VoiceSession] Modelos Live a intentar en la sesión: ${liveModelsToTry.join(', ')}`);

            // Bucle Externo: Recorre los modelos consecutivos
            for (let m = 0; m < liveModelsToTry.length; m++) {
                const currentLiveModel = liveModelsToTry[m];
                this.liveConfig.model = currentLiveModel; // Asignar el modelo de turno a la configuración

                // Bucle Interno: Recorre las API keys consecutivamente para el modelo actual
                for (let i = 0; i < this.apiKeys.length; i++) {
                    const key = this.apiKeys[i];
                    logger.info(`[VoiceSession] Intentando conexión con Modelo "${currentLiveModel}" y API Key ${i + 1}/${this.apiKeys.length}`);
                    
                    try {
                        // Create Gemini Live client
                        this.geminiClient = new GeminiLiveClient(key, this.liveConfig);

                        // Connect to Gemini WebSocket
                        await this.geminiClient.connect();
                        
                        success = true;
                        break; // ✅ Éxito en la conexión con la clave actual
                    } catch (error) {
                        logger.warn(`[VoiceSession] Falló conexión con Modelo "${currentLiveModel}" y API Key ${i + 1}: ${error.message}`);
                        lastError = error;
                        if (this.geminiClient && typeof this.geminiClient.disconnect === 'function') {
                            this.geminiClient.disconnect();
                        }
                        this.geminiClient = null;
                    }
                }

                if (success) {
                    break; // ✅ Conectado con éxito a un modelo compatible
                }

                logger.warn(`[VoiceSession] Todas las claves agotadas para el modelo "${currentLiveModel}". Probando siguiente modelo de respaldo en la lista...`);
            }

            if (!success) {
                throw new Error(lastError?.message || 'No se pudo conectar a Gemini Live con ningún modelo o clave API disponible');
            }

            // Setup message handlers for Gemini
            this.setupGeminiHandlers();

            this.isActive = true;
            logger.info(`[VoiceSession] Started for user: ${this.userId}`);
            this.sendToClient({ type: 'status', data: { status: 'listening' } });

            return { success: true };
        } catch (error) {
            logger.error(`[VoiceSession] Failed to start:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Setup message handlers for Client (Once)
     */
    setupClientHandlers() {
        // Handle messages from client
        this.clientWs.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleClientMessage(message);
            } catch (error) {
                logger.error('[VoiceSession] Error handling client message:', error);
            }
        });
    }

    /**
     * Setup message handlers between Gemini and Server
     */
    setupGeminiHandlers() {
        // Handle messages from Gemini
        this.geminiClient.onMessage((message) => {
            this.handleGeminiMessage(message);
        });

        // Listen for AUDIO from Gemini (AI voice response)
        this.geminiClient.on('audio', (audioData) => {
            this.isAiSpeaking = true;
            // Forward audio to client for playback
            this.sendToClient({ type: 'audio', data: { audioData } });

            // Count audio chunks to know AI responded with voice
            this.aiAudioChunkCount++;

            // Safety timeout: Reset isAiSpeaking to false if silence for 3.5 seconds
            if (this.aiSpeakingTimeout) clearTimeout(this.aiSpeakingTimeout);
            this.aiSpeakingTimeout = setTimeout(() => {
                if (this.isAiSpeaking) {
                    logger.info('[VoiceSession] Safety reset isAiSpeaking to false after silence');
                    this.isAiSpeaking = false;
                }
            }, 3500);
        });

        // Listen for USER TRANSCRIPTION  
        // Listen for USER transcription (what the user says)
        this.geminiClient.on('userTranscription', (text) => {
            logger.info(`[VoiceSession] User transcription received: "${text}"`);
            this.toolCalledThisTurn = false;
            const cleanText = sanitizeTranscription(text);
            // Accumulate user text for saving
            this.userTranscriptionText += cleanText;
            // ✅ FIX: Send sanitized user transcription to client in real-time for HUD display
            this.sendToClient({
                type: 'text',
                data: { text: cleanText, isUserTranscription: true }
            });

            // Fast-track real-time voice report trigger (only on explicit user command to generate report)
            // Fast-track real-time voice report trigger (only on explicit user command to generate report)
            if (!this.isGeneratingReport && this.conversationTurns && this.conversationTurns.length >= 1) {
                const userReportRegex = /\b(genera(r)?|haz|compil(a|ar)|dame|quiero|entreg(a|ar)|sacar?)\s+(el\s+|un\s+)?(informe|reporte)\b/i;
                const phoneticApproxRegex = /\b(general)\s+(el\s+|al\s+)?(informe|reporte)\b/i;
                if (userReportRegex.test(cleanText) || phoneticApproxRegex.test(cleanText)) {
                    logger.info(`[VoiceSession] Real-time voice trigger matched in user transcription: "${cleanText}"`);
                    this.isGeneratingReport = true;
                    this.sendToClient({
                        type: 'status',
                        data: { status: 'generating_report', message: 'Compilando informe técnico...' }
                    });
                    this.generateReport(this.config.conversationContext).finally(() => {
                        this.isGeneratingReport = false;
                    });
                }
            }
        });


        // Listen for AI transcription (what the AI says)
        this.geminiClient.on('aiTranscription', (text) => {
            logger.info(`[VoiceSession] AI transcription received: "${text}"`);
            // Accumulate AI text (both buffers, so the trigger can find the phrase)
            this.aiResponseText += text;
            this.aiTranscriptionBuffer += text;

            // Forward full cumulative text to client so assistant chat bubble updates in real time
            this.sendToClient({
                type: 'text',
                data: {
                    text: this.aiResponseText,
                    isUserTranscription: false
                }
            });
        });

        // Listen for AI TEXT response
        this.geminiClient.on('aiText', (text) => {
            logger.info(`[VoiceSession] AI text response received: "${text}"`);

            // Filter AI "thinking" text - don't accumulate or send to client
            const shouldSkip = text.startsWith('**') ||
                text.includes('Considering') ||
                text.includes('Analyzing') ||
                text.includes('linguist') ||
                text.includes('Evaluating') ||
                text.includes('Reviewing');

            if (shouldSkip) {
                logger.info(`[VoiceSession] Skipping AI "thinking" text (not user-facing)`);
                return;
            }

            // Accumulate AI text
            this.aiResponseText += text;
            // Send to client in real-time with correct format
            this.sendToClient({
                type: 'text',
                data: { text }
            });
        });

        // Listen for Tool Calls
        this.geminiClient.on('toolCall', (toolCall) => {
            logger.info('[VoiceSession] Tool Call received:', JSON.stringify(toolCall));
            this.toolCalledThisTurn = true;

            if (toolCall.functionCalls) {
                for (const fc of toolCall.functionCalls) {
                    // Manejo de cambio de fase interactiva
                    if (fc.name === 'cambiar_fase_evaluacion') {
                        const targetPhase = fc.args?.fase || 2;
                        logger.info(`[VoiceSession] Gemini invoked tool "${fc.name}" with phase: ${targetPhase}`);
                        this.sendToClient({
                            type: 'wappy_action',
                            data: {
                                id: fc.id,
                                name: fc.name,
                                args: fc.args
                            }
                        });
                        if (this.geminiClient) {
                            this.geminiClient.sendToolResponse([{
                                id: fc.id,
                                name: fc.name,
                                response: { result: `Fase ${targetPhase} activada en la pantalla del usuario con éxito.` }
                            }]);
                        }
                        continue;
                    }

                    // Manejo directo de herramienta nativa de informe
                    if (fc.name === 'generar_informe_tecnico' || fc.name === 'generar_informe_ergonomico') {
                        const phaseCount = this.phaseEvidences ? Object.keys(this.phaseEvidences).length : 0;
                        const turnCount = this.conversationTurns ? this.conversationTurns.length : 0;
                        if (turnCount < 2 && phaseCount === 0) {
                            logger.warn(`[VoiceSession] Gemini prematurely called "${fc.name}" on turn ${turnCount} with 0 phases. Rejecting premature call.`);
                            if (this.geminiClient) {
                                this.geminiClient.sendToolResponse([{
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: "Aún no se puede compilar el informe técnico porque recién estamos iniciando la evaluación de campo. Continúa guiando al usuario en el Paso 1 (Postura Habitual)." }
                                }]);
                            }
                            continue;
                        }

                        logger.info(`[VoiceSession] Gemini invoked native tool "${fc.name}"! Triggering report generation...`);
                        
                        this.sendToClient({
                            type: 'status',
                            data: { status: 'generating_report', message: 'Compilando informe técnico...' }
                        });

                        if (this.geminiClient) {
                            this.geminiClient.sendToolResponse([{
                                id: fc.id,
                                name: fc.name,
                                response: { result: "La compilación del informe técnico ergonómico oficial ha comenzado en segundo plano y tardará unos segundos. Informa cordialmente al usuario en una sola frase breve que estamos redactando y estructurando su informe completo con las mediciones y evidencias fotográficas, y que por favor espere un momento conectado mientras se carga completamente en su pantalla y en el chat." }
                            }]);
                        }

                        if (!this.isGeneratingReport) {
                            this.isGeneratingReport = true;
                            this.generateReport(this.config.conversationContext).finally(() => {
                                this.isGeneratingReport = false;
                            });
                        }
                        continue;
                    }

                    // Send action request to client
                    this.sendToClient({
                        type: 'wappy_action',
                        data: {
                            id: fc.id,
                            name: fc.name,
                            args: fc.args
                        }
                    });

                    // Safety timeout if client doesn't reply in 6 seconds
                    if (!this.pendingToolCalls) this.pendingToolCalls = new Map();
                    const timeoutId = setTimeout(() => {
                        if (this.pendingToolCalls && this.pendingToolCalls.has(fc.id)) {
                            logger.warn(`[VoiceSession] Tool call ${fc.id} (${fc.name}) timed out waiting for client`);
                            this.pendingToolCalls.delete(fc.id);
                            if (this.geminiClient) {
                                this.geminiClient.sendToolResponse([{
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: "Acción procesada en pantalla" }
                                }]);
                            }
                        }
                    }, 6000);
                    this.pendingToolCalls.set(fc.id, { timeoutId, name: fc.name });
                }
            }
        });

        // Listen for turn complete
        this.geminiClient.on('turnComplete', async () => {
            logger.info('[VoiceSession] ========== TURN COMPLETE ==========');
            this.isAiSpeaking = false;
            if (this.aiSpeakingTimeout) {
                clearTimeout(this.aiSpeakingTimeout);
                this.aiSpeakingTimeout = null;
            }
            this.sendToClient({ type: 'status', data: { status: 'turn_complete' } });
            this.sendToClient({ type: 'status', data: { status: 'listening' } });
            await this.saveCurrentTurn('TurnComplete');
            logger.info('[VoiceSession] ========== END TURN ==========');
        });

        // Listen for Interrupted (User Barge-In)
        this.geminiClient.on('interrupted', () => {
            logger.info('[VoiceSession] ========== USER INTERRUPTED RESPONSE ==========');
            this.toolCalledThisTurn = false;
            this.isAiSpeaking = false;
            if (this.aiSpeakingTimeout) {
                clearTimeout(this.aiSpeakingTimeout);
                this.aiSpeakingTimeout = null;
            }
            this.sendToClient({ type: 'status', data: { status: 'interrupted' } });
            this.sendToClient({ type: 'interrupted', data: {} });
            // Reset temporary AI response buffers for this turn
            this.aiResponseText = '';
            this.aiTranscriptionBuffer = '';
            this.aiAudioChunkCount = 0;
        });

        // Handle Gemini connection close/error to avoid zombie state
        this.geminiClient.on('close', (code, reason) => {
            const reasonStr = reason ? reason.toString() : '';
            logger.warn(`[VoiceSession] Gemini connection closed: Code ${code}, Reason: ${reasonStr}`);
            if (this.isActive) {
                this.sendToClient({ type: 'status', data: { status: 'idle' } });
                const userMsg = reasonStr
                    ? `Conexión con Gemini finalizada (${code}): ${reasonStr}`
                    : 'Conexión con el motor de voz de Gemini finalizada.';
                this.sendToClient({ type: 'error', data: { message: userMsg } });
                this.stop().catch(err => logger.error('[VoiceSession] Error in stop on Gemini close:', err));
            }
        });

        this.geminiClient.on('error', (error) => {
            logger.error('[VoiceSession] Gemini connection error:', error);
            if (this.isActive) {
                this.sendToClient({ type: 'error', data: { message: error.message || 'Error en la conexión con el motor de voz de Gemini.' } });
                this.stop().catch(err => logger.error('[VoiceSession] Error in stop on Gemini error:', err));
            }
        });

        // Handle client disconnect
        this.clientWs.on('close', () => {
            logger.info(`[VoiceSession] Client disconnected: ${this.userId}`);
            this.stop().catch(err => logger.error('[VoiceSession] Error in stop on close:', err));
        });

        // Handle errors
        this.clientWs.on('error', (error) => {
            logger.error(`[VoiceSession] Client error:`, error);
        });
    }

    /**
     * Handle message from client
     */
    async handleClientMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'wappy_action_result':
                if (data && data.id && this.geminiClient) {
                    logger.info(`[VoiceSession] Received wappy_action_result from client for tool ${data.name} (id: ${data.id})`, data.result);
                    if (this.pendingToolCalls && this.pendingToolCalls.has(data.id)) {
                        const { timeoutId } = this.pendingToolCalls.get(data.id);
                        clearTimeout(timeoutId);
                        this.pendingToolCalls.delete(data.id);
                    }
                    this.geminiClient.sendToolResponse([
                        {
                            id: data.id,
                            name: data.name,
                            response: { result: data.result || "Acción ejecutada correctamente en la pantalla" }
                        }
                    ]);
                }
                break;

            case 'audio':
                // Do not process audio if session is stopped or geminiClient is not ready
                if (!this.isActive || !this.geminiClient) {
                    break;
                }
                // Do not forward client mic audio to Gemini while AI is speaking (prevents speaker echo)
                if (this.isAiSpeaking) {
                    break;
                }
                // Forward audio to Gemini
                if (data && data.audioData) {
                    this.audioChunkCount = (this.audioChunkCount || 0) + 1;
                    if (this.audioChunkCount === 1 || this.audioChunkCount % 100 === 0) {
                        logger.info(`[VoiceSession] AUDIO recibido del cliente (chunk #${this.audioChunkCount}, ${data.audioData.length} chars)`);
                    }
                    this.geminiClient.sendAudio(data.audioData);
                }
                break;

            case 'video':
                // Forward video frame to Gemini
                if (data && data.image) {
                    logger.debug(`[VoiceSession] Received video frame (${data.image.length} chars, has telemetry: ${!!data.telemetry})`);
                    this.latestFrame = data.image; // Guarda el último frame capturado para el análisis
                    if (data.telemetry) {
                        this.latestTelemetry = data.telemetry;
                    }
                    
                    // Keep a rolling buffer of up to 4 sampled frames for the report generator
                    if (!this.frameBuffer) this.frameBuffer = [];
                    this.frameCount = (this.frameCount || 0) + 1;
                    if (this.frameCount % 2 === 0) { // Sample every 2nd frame received (roughly 1 frame per 2 seconds)
                        this.frameBuffer.push(data.image);
                        if (this.frameBuffer.length > 4) {
                            this.frameBuffer.shift();
                        }
                    }

                    if (this.geminiClient) {
                        this.geminiClient.sendVideo(data.image);
                    } else {
                        logger.warn('[VoiceSession] Received video but Gemini client is not ready');
                    }
                }
                break;

            case 'evidence-image':
                if (data && (data.image || data.text)) {
                    logger.info(`[VoiceSession] Received evidence payload (has image: ${!!data.image}, has text: ${!!data.text}, has metadata: ${!!data.metadata})`);
                    
                    if (data.image) {
                        this.latestFrame = data.image;
                        if (!this.manualEvidences) {
                            this.manualEvidences = [];
                        }
                        this.manualEvidences.push(data.image);
                        if (this.manualEvidences.length > 10) {
                            this.manualEvidences.shift();
                        }
                    }

                    // Save structured multi-phase evidence with MediaPipe telemetry
                    if (!this.phaseEvidences) {
                        this.phaseEvidences = {};
                    }

                    const phaseIdx = (data.metadata && data.metadata.phaseIndex !== undefined)
                        ? Number(data.metadata.phaseIndex)
                        : (data.phaseIndex !== undefined ? Number(data.phaseIndex) : null);

                    if (phaseIdx !== null && data.image) {
                        this.phaseEvidences[phaseIdx] = {
                            image: data.image,
                            phaseIndex: phaseIdx,
                            phaseName: data.metadata?.phaseName || data.phaseName || `Fase ${phaseIdx + 1}`,
                            telemetry: data.metadata?.telemetry || data.telemetry || null,
                            text: data.text || ''
                        };
                        logger.info(`[VoiceSession] Stored evidence photo for phase ${phaseIdx} (${this.phaseEvidences[phaseIdx].phaseName})`);
                    } else if (data.image) {
                        const existingCount = Object.keys(this.phaseEvidences).length;
                        const assignedIdx = existingCount < 3 ? existingCount : 0;
                        if (!this.phaseEvidences[assignedIdx]) {
                            this.phaseEvidences[assignedIdx] = {
                                image: data.image,
                                phaseIndex: assignedIdx,
                                phaseName: `Fase ${assignedIdx + 1}`,
                                telemetry: data.metadata?.telemetry || null,
                                text: data.text || ''
                            };
                        }
                    }

                    const phaseName = data.metadata?.phaseName || (phaseIdx !== null ? `Fase ${phaseIdx + 1}` : 'Evidencia Fotográfica');
                    const telemetry = data.metadata?.telemetry;
                    let textLines = [`📸 **Evidencia Biomecánica • ${phaseName}**`];

                    if (telemetry) {
                        const parts = [];
                        if (telemetry.neck !== null && telemetry.neck !== undefined) parts.push(`• Flexión Cervical: **${telemetry.neck}°**`);
                        if (telemetry.trunk !== null && telemetry.trunk !== undefined) parts.push(`• Flexión de Tronco: **${telemetry.trunk}°**`);
                        if (telemetry.arm !== null && telemetry.arm !== undefined) parts.push(`• Abducción de Brazo: **${telemetry.arm}°**`);
                        if (telemetry.elbow !== null && telemetry.elbow !== undefined) parts.push(`• Flexión de Codo: **${telemetry.elbow}°**`);
                        if (telemetry.knee !== null && telemetry.knee !== undefined) parts.push(`• Flexión de Rodilla: **${telemetry.knee}°**`);

                        if (parts.length > 0) {
                            textLines.push(`\n📐 **Telemetría Articular MediaPipe:**\n${parts.join('\n')}`);
                        } else if (telemetry.summary) {
                            textLines.push(`\n📐 **Telemetría Articular MediaPipe:**\n${telemetry.summary}`);
                        }
                    } else if (data.text) {
                        textLines.push(`\n${data.text}`);
                    }

                    const messageText = textLines.join('\n');
                    const imageUrl = data.image ? (data.image.startsWith('data:') ? data.image : `data:image/jpeg;base64,${data.image}`) : null;

                    let messageContent = [
                        { type: 'text', text: messageText }
                    ];
                    if (imageUrl) {
                        messageContent.push({
                            type: 'image_url',
                            image_url: { url: imageUrl }
                        });
                    }

                    try {
                        let conversationId = this.conversationId;
                        let isNewConvo = false;
                        if (!conversationId || conversationId === 'new') {
                            conversationId = uuidv4();
                            this.conversationId = conversationId;
                            isNewConvo = true;
                        }

                        const messageId = uuidv4();
                        const messageData = {
                            messageId,
                            conversationId,
                            parentMessageId: this.lastMessageId,
                            text: messageText,
                            content: messageContent,
                            user: this.userId,
                            sender: 'User',
                            isCreatedByUser: true,
                            endpoint: this.dbEndpoint,
                            model: this.dbModel,
                        };

                        const savedMessage = await saveMessage({ user: { id: this.userId } }, messageData, { context: 'VoiceSession - Evidence Save' });
                        if (savedMessage) {
                            this.lastMessageId = messageId;
                            logger.info(`[VoiceSession] Saved new evidence photo message: ${messageId} for phase: ${phaseName}`);
                        }

                        // Send to Gemini Live silently if it's a telemetry alert
                        const isTelemetry = !!data.text && !data.metadata?.phaseName;
                        if (isTelemetry && this.geminiClient) {
                            this.geminiClient.sendImageWithText(data.image || null, data.text, false);
                        }

                        // If it's a phase evidence captured by the user, notify Gemini Live so the AI verbally acknowledges it!
                        if (data.metadata?.phaseName && this.geminiClient && this.isActive) {
                            const summary = data.metadata?.telemetry?.summary || '';
                            const phaseNum = (data.metadata.phaseIndex ?? 0) + 1;
                            const isLastPhase = phaseNum >= 3;
                            const instructionPrompt = isLastPhase
                                ? `[INSTRUCCIÓN DE SISTEMA]: El usuario acaba de registrar la evidencia fotográfica de la Fase 3 (${data.metadata.phaseName}). Telemetría: ${summary}. Las 3 fases han sido completadas con éxito. Valida en voz alta en 1 sola frase corta lo observado y pregúntale cordialmente si desea que compiles su informe técnico ergonómico oficial ahora mismo.`
                                : `[INSTRUCCIÓN DE SISTEMA]: El usuario acaba de registrar la evidencia fotográfica de la Fase ${phaseNum} (${data.metadata.phaseName}). Telemetría: ${summary}. Valida en voz alta en 1 sola frase corta lo observado, dile qué postura adoptar para la Fase ${phaseNum + 1}, y recuérdale que te avise diciendo "Listo", "Ya" o pulsando el botón de la cámara cuando esté en posición. NO avances ni captures por tu cuenta antes de que el usuario lo indique.`;
                            try {
                                this.geminiClient.sendText(instructionPrompt);
                            } catch (notifyErr) {
                                logger.warn('[VoiceSession] Error notifying Gemini Live of phase capture:', notifyErr.message);
                            }
                        }

                        // Notify client of conversationId if it was new
                        if (isNewConvo) {
                            this.sendToClient({
                                type: 'conversationId',
                                data: { conversationId: this.conversationId }
                            });
                        }

                        // Always notify client so the photo appears immediately in chat!
                        this.sendToClient({
                            type: 'conversationUpdated',
                            data: { conversationId: this.conversationId }
                        });

                    } catch (saveError) {
                        logger.error('[VoiceSession] Error processing evidence image in chat DB:', saveError);
                    }
                }
                break;

            case 'trigger_report':
            case 'generate_report':
                logger.info('[VoiceSession] Manual report generation requested by client via WS.');
                if (this.isGeneratingReport) {
                    logger.info('[VoiceSession] Report generation already in progress. Skipping duplicate request.');
                    break;
                }

                let manualFrames = [];
                if (this.manualEvidences && this.manualEvidences.length > 0) {
                    manualFrames = [...this.manualEvidences];
                } else if (this.frameBuffer && this.frameBuffer.length > 0) {
                    manualFrames = [...this.frameBuffer];
                } else if (this.latestFrame) {
                    manualFrames = [this.latestFrame];
                }

                this.sendToClient({
                    type: 'status',
                    data: { status: 'generating_report', message: 'Compilando informe técnico...' }
                });

                if (this.geminiClient && this.isActive) {
                    try {
                        this.geminiClient.sendText('INSTRUCCIÓN DE SISTEMA: El usuario presionó el botón de generar informe técnico. Confírmale verbalmente en 1 sola frase breve: "Entendido, estoy compilando tu informe técnico ergonómico con las evidencias recopiladas."');
                    } catch (speakErr) {
                        logger.warn('[VoiceSession] Error sending spoken confirmation for manual report trigger:', speakErr.message);
                    }
                }

                this.isGeneratingReport = true;
                this.generateReport(this.config.conversationContext).finally(() => {
                    this.isGeneratingReport = false;
                });
                break;

            case 'config':
                // Update session configuration
                if (data.voice) {
                    logger.info(`[VoiceSession] Config update received. New voice: ${data.voice}`);
                    this.config.voice = data.voice;
                    // Reconnect with new voice
                    await this.reconnect();
                    logger.info(`[VoiceSession] Reconnected with voice: ${this.config.voice}`);
                }
                break;

            case 'message':
                if (data && data.text) {
                    logger.info(`[VoiceSession] Received text message from client: "${data.text.substring(0, 100)}..."`);
                    // Solo registrar como transcripción del usuario si no es un prompt interno del sistema
                    if (!data.text.startsWith('[SISTEMA INTERNO WAPPY]')) {
                        this.userTranscriptionText += (this.userTranscriptionText ? '\n' : '') + data.text;
                    }
                    
                    if (this.geminiClient) {
                        this.geminiClient.sendText(data.text);
                    } else {
                        logger.warn('[VoiceSession] Received text message but Gemini client is not ready');
                    }
                }
                break;

            case 'interrupt':
                // User interrupted, stop current Gemini response
                logger.info('[VoiceSession] Manual interrupt command received from client');
                this.isAiSpeaking = false;
                if (this.geminiClient) {
                    this.geminiClient.interrupt();
                }
                this.sendToClient({ type: 'status', data: { status: 'interrupted' } });
                this.sendToClient({ type: 'interrupted', data: {} });
                this.aiResponseText = '';
                this.aiTranscriptionBuffer = '';
                this.aiAudioChunkCount = 0;
                break;

            default:
                logger.warn(`[VoiceSession] Unknown message type: ${type}`);
        }
    }

    /**
     * Handle message from Gemini
     */
    handleGeminiMessage(message) {
        // This method is now largely deprecated as event listeners handle most of the logic.
        // It remains for backward compatibility or specific cases not covered by new events.
        try {
            // Check for User Transcription (often in a different part of the response object)
            // Based on API behavior, we need to inspect where input transcription lands.
            // For now, we log everything to find it.
            if (message.serverContent && !message.serverContent.modelTurn) {
                logger.debug('[VoiceSession] Non-modelTurn content:', JSON.stringify(message.serverContent));
            }
        } catch (error) {
            logger.error('[VoiceSession] Error handling Gemini message:', error);
        }
    }

    /**
     * Send message to client
     */
    sendToClient(message) {
        if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
            this.clientWs.send(JSON.stringify(message));
        }
    }

    /**
     * Reconnect with new configuration
     */
    async reconnect() {
        if (this.geminiClient) {
            this.geminiClient.disconnect();
        }
        await this.start();
    }

    /**
     * Refine transcription using Gemini Flash Lite
     */
    async refineTranscription(text) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent?key=${this.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Please format the following transcription to be more readable, correcting punctuation and capitalization, but keeping the original meaning and words as much as possible. Do not add any conversational filler. Text: "${text}"`
                        }]
                    }]
                })
            });

            const apiKey = await getUserKey({ userId: this.userId, name: EModelEndpoint.google });
            logger.debug(`[VoiceSession] Retrieved API Key for refinement: ${apiKey ? 'Success' : 'Failed'}`);

            if (!apiKey) {
                // Handle case where API key is not found, e.g., by sending original text
                this.sendToClient({
                    type: 'text',
                    data: {
                        text: text,
                        isRefined: false
                    }
                });
                return; // Exit early if no API key
            }

            const data = await response.json();

            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const refinedText = data.candidates[0].content.parts[0].text;

                this.sendToClient({
                    type: 'text',
                    data: {
                        text: refinedText,
                        isRefined: true
                    }
                });

                logger.debug('[VoiceSession] Transcription refined:', refinedText);

                // Save message to database if conversationId is present (and not tenshi_voice)
                if (this.conversationId && this.config.mode !== 'tenshi_voice') {
                    try {
                        let conversationId = this.conversationId;
                        let isNewConversation = false;

                        // Generate real UUID if conversationId is 'new'
                        if (conversationId === 'new') {
                            conversationId = uuidv4();
                            isNewConversation = true;
                            logger.info(`[VoiceSession] Generated new conversationId: ${conversationId}`);
                        }

                        const messageId = uuidv4();
                        const messageData = {
                            messageId,
                            conversationId,
                            text: refinedText,
                            content: [{ type: 'text', text: refinedText }],
                            user: this.userId,
                            sender: 'User',
                            isCreatedByUser: true,
                            endpoint: this.dbEndpoint, // Ensure endpoint is set
                            model: this.dbModel,
                        };

                        const savedMessage = await saveMessage({ user: { id: this.userId } }, messageData, { context: 'VoiceSession' });

                        if (savedMessage) {
                            // Also save/update the conversation
                            await saveConvo({ user: { id: this.userId } }, {
                                ...savedMessage,
                                ...(this.config.mode === 'live_analysis' ? { tags: ['sgsst-live-analysis'] } : {})
                            }, { context: 'VoiceSession' });

                            logger.info(`[VoiceSession] Saved user message: ${messageId}`);

                            // Update local conversationId and notify client if it was new
                            if (isNewConversation) {
                                this.conversationId = conversationId;
                                this.sendToClient({
                                    type: 'conversationId',
                                    data: { conversationId: this.conversationId }
                                });
                            }
                        } else {
                            logger.error('[VoiceSession] saveMessage returned null/undefined');
                        }
                    } catch (saveError) {
                        logger.error('[VoiceSession] Error saving message:', saveError);
                    }
                }
            }
        } catch (error) {
            logger.error('[VoiceSession] Error refining transcription:', error);
            // Fallback to original text if refinement fails
            this.sendToClient({
                type: 'text',
                data: {
                    text: text,
                    isRefined: false
                }
            });
        }
    }

    /**
     * Save User Message to database
     */
    async saveUserMessage(text) {
        if (!text || this.config.mode === 'tenshi_voice') return null;

        try {
            let conversationId = this.conversationId;
            let isNewConversation = false;

            // If conversation doesn't exist, create a new one
            if (!conversationId || conversationId === 'new') {
                conversationId = uuidv4();
                this.conversationId = conversationId;
                isNewConversation = true;
                logger.info(`[VoiceSession] Generated new conversationId for user message: ${conversationId}`);
            }

            const messageId = uuidv4();

            // Check if user is asking the AI to look at something
            const observationRegex = /(mira|observa|qué ves|analiza|pantalla|imagen|foto|qué hay|describe|veas|vea)/i;
            const isAskingToLook = observationRegex.test(text);
            logger.info(`[VoiceSession] Processing user message: "${text}". isAskingToLook: ${isAskingToLook}, latestFrame: ${!!this.latestFrame}`);

            let messageContent = [{ type: 'text', text: text }];

            // If the user is asking to look at something, and we have a recent frame from the camera/screen
            if (isAskingToLook && this.latestFrame) {
                logger.info('[VoiceSession] User requested visual analysis, attaching latest frame to message.');
                messageContent.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${this.latestFrame}`
                    }
                });
                // We consume the frame so it isn't accidentally reused in unrelated future messages
                this.latestFrame = null;
            }

            const messageData = {
                messageId,
                conversationId,
                parentMessageId: this.lastMessageId, // Link to previous message in conversation
                text: text,
                content: messageContent,
                user: this.userId,
                sender: 'User',
                isCreatedByUser: true,
                endpoint: this.dbEndpoint,
                model: this.dbModel,
            };

            const savedMessage = await saveMessage({ user: { id: this.userId } }, messageData, { context: 'VoiceSession - User' });

            if (savedMessage) {
                this.lastMessageId = messageId; // Update for next message
                logger.info(`[VoiceSession] Saved user message: ${messageId}`);
                return { isNewConversation, messageId };
            }
            return null;
        } catch (error) {
            logger.error('[VoiceSession] Error saving user message:', error);
            return null;
        }
    }

    /**
     * Save AI Message to database
     */
    async saveAiMessage(text) {
        if (!this.conversationId || !text || this.config.mode === 'tenshi_voice') return;

        try {
            const messageId = uuidv4();
            const messageData = {
                messageId,
                conversationId: this.conversationId,
                parentMessageId: this.lastMessageId, // Link to user message
                text: text,
                content: [{ type: 'text', text: text }],
                user: this.userId,
                sender: this.agentObj?.name || (this.isBiomechanics ? 'Fisioterapeuta Laboral' : 'Assistant'),
                iconURL: this.agentObj?.avatar?.filepath || this.agentObj?.avatar?.url || undefined,
                isCreatedByUser: false,
                endpoint: this.dbEndpoint,
                model: this.dbModel,
            };

            const savedMessage = await saveMessage({ user: { id: this.userId } }, messageData, { context: 'VoiceSession - AI' });

            if (savedMessage) {
                this.lastMessageId = messageId; // Update for next message
                logger.info(`[VoiceSession] Saved AI message: ${messageId}`);
            }
        } catch (error) {
            logger.error('[VoiceSession] Error saving AI message:', error);
        }
    }

    /**
     * Stop the session
     */
    /**
     * Correct user transcription using Gemini Flash Lite with instant fast-path for common phrases
     */
    async correctTranscription(userText, aiResponseText) {
        try {
            if (!userText || typeof userText !== 'string') {
                return userText;
            }

            // 1. Pre-sanitizer for common voice recognition inaccuracies
            const sanitized = sanitizeTranscription(userText).trim();

            // 2. Fast-path for common Spanish responses (zero latency, no API call required)
            const lower = sanitized.toLowerCase().replace(/[.,!¡?¿]/g, '').trim();
            const quickPhrases = {
                'listo': 'Listo.',
                'si': 'Sí.',
                'sí': 'Sí.',
                'vale': 'Vale.',
                'de una': 'De una.',
                'dale': 'Dale.',
                'ya': 'Ya.',
                'ok': 'OK.',
                'okay': 'OK.',
                'no': 'No.',
                'correcto': 'Correcto.',
                'entendido': 'Entendido.',
                'haz el informe': 'Haz el informe.',
                'genera el informe': 'Genera el informe.',
                'generar el informe': 'Generar el informe.',
                'listo genera el informe': 'Listo, genera el informe.',
                'si genera el informe': 'Sí, genera el informe.',
                'si haz el informe': 'Sí, haz el informe.',
            };

            if (quickPhrases[lower]) {
                logger.info(`[VoiceSession] Transcription fast-path matched: "${userText}" -> "${quickPhrases[lower]}"`);
                return quickPhrases[lower];
            }

            if (sanitized.length <= 3) {
                return sanitized;
            }

            logger.info(`[VoiceSession] Starting transcription correction for: "${sanitized}"`);

            // Use Gemini 3.5 Flash Lite for high performance voice transcription corrections
            const correctionModelName = 'gemini-3.5-flash-lite';

            const prompt = `
            Eres un corrector ortográfico y gramatical experto en español de Colombia/Latinoamérica, especializado en Seguridad y Salud en el Trabajo (SST/HSE).
            Tu tarea es corregir y pulir los errores fonéticos o de puntuación de la transcripción de voz para hacerla fluida, correcta y en perfecto español.

            ÚLTIMA INTERVENCIÓN DE LA IA:
            """
            ${(aiResponseText || '').substring(0, 250)}
            """

            TRANSCRIPCIÓN DE VOZ DEL USUARIO A CORREGIR:
            """
            ${sanitized}
            """

            REGLAS DE ORO:
            1. MANTÉN ESTRICTAMENTE EL TEXTO EN ESPAÑOL. Está absolutamente prohibido traducir cualquier palabra al inglés o a cualquier otro idioma. El usuario habla español.
            2. Si la transcripción dice palabras como "bistro", "visto" o "cristo" en tono de asentimiento, corrígelas a "Listo".
            3. Si el usuario pide el informe con palabras parecidas (ej: "general el informe"), corrígelo a "Generar el informe".
            4. Reconoce y respeta siglas y términos de SST como: "SST", "EPP", "RULA", "REBA", "OWAS", "GTC 45", "ISO 45001", "Decreto 1072", "postura", "ergonomía".
            5. Si el texto original está en español correcto, devuélvelo tal cual sin inventar nada.
            6. DEVUELVE ÚNICA Y EXCLUSIVAMENTE EL TEXTO CORREGIDO EN ESPAÑOL. Sin explicaciones, comillas ni notas.
            `;

            const result = await generateWithKeyRotation(correctionModelName, this.userId, prompt);
            const correctedText = result.response.text().replace(/^["']|["']$/g, '').trim();

            logger.info(`[VoiceSession] Transcription correction result: "${userText}" -> "${correctedText}"`);
            return correctedText;
        } catch (error) {
            logger.error('[VoiceSession] Error correcting transcription:', error);
            return sanitizeTranscription(userText); // Fallback to sanitized
        }
    }

    /**
     * Generate Formal Report using Gemini Flash
     */
    async generateReport(conversationContext) {
        try {
            logger.info('[VoiceSession] Generating formal report...');

            // FETCH CONTEXT FROM DB (Source of Truth)
            // Instead of relying on passed context, we fetch the last 20 messages
            let dbContext = '';
            if (this.conversationId && this.conversationId !== 'new') {
                try {
                    const messages = await getMessages({
                        conversationId: this.conversationId,
                        user: this.userId
                    }, null, { limit: 20, sort: { createdAt: -1 } });

                    if (messages && messages.length > 0) {
                        // Messages come in reverse order (newest first), so reverse them back
                        dbContext = messages.reverse().map(m => {
                            const role = m.isCreatedByUser ? 'User' : 'AI';
                            return `${role}: ${m.text}`;
                        }).join('\n');
                        logger.info(`[VoiceSession] Fetched ${messages.length} messages from DB for context.`);
                    }
                } catch (dbError) {
                    logger.error('[VoiceSession] Error fetching messages for context:', dbError);
                }
            }

            // Fallback to passed context if DB fetch failed or empty
            const finalContext = dbContext || conversationContext;

            logger.info(`[VoiceSession] Final Context length: ${finalContext ? finalContext.length : 0}`);

            if (!finalContext || finalContext.length < 10) {
                logger.warn('[VoiceSession] Context too short, skipping report generation');
                this.sendToClient({
                    type: 'report',
                    data: { html: '<p>No hay suficiente contexto para generar un informe. Por favor, continúe la conversación.</p>' }
                });
                return null;
            }

            // Notify client that generation started
            this.sendToClient({
                type: 'status',
                data: { status: 'generating_report', message: 'Generando informe técnico...' }
            });

            // Use Gemini 3.7 Flash as the primary model for reports (with fallback scale down to 3.6, 3.5, 3.5-lite)
            const reportModelName = SGSST_FALLBACK_MODELS[0];
            logger.info(`[VoiceSession] Report model (with key+model rotation): ${reportModelName}`);

            const currentDate = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            // Determine active inspection protocol and comparative matrix instructions
            const activeProtocol = this.agentProtocol || resolveInspectionProtocol(this.agentObj?.name || this.config?.template);
            let templateInstructions = "";

            if (activeProtocol.id === 'biomecanico') {
                templateInstructions = `ENFOQUE DE AUDITORÍA: Análisis Biomecánico Cuantitativo y Ergonómico Multifase en tiempo real aplicando la selección técnica de métodos ergonómicos (Criterios Prevencionar: RULA, REBA u OWAS).
Durante la sesión se ha registrado telemetría de ángulos articulares (Flexión Cervical, Inclinación de Tronco, Abducción de Brazos, Codos y Rodillas) y se estructuró la evaluación a través de un PROTOCOLO MULTIFASE en el ciclo de trabajo:
- Perspectiva de Captura: Documenta si el análisis se ejecutó como "Auto-evaluación (Portátil/Webcam)" o como "Inspección Asistida por Tercero (Smartphone)".
- Método RULA: Para labores de oficina / sedente frente a pantalla o ensamblaje fino donde el riesgo principal recae en miembros superiores y cuello.
- Método REBA: Para labores de pie, posturas forzadas de cuerpo entero, flexión de rodillas, manipulación de carga o posturas dinámicas/inestables.
- Método OWAS: Para tareas dinámicas de alta variabilidad postural en ciclos cambiantes (mantenimiento, construcción, aseo).
- Ecuación NIOSH / Res. 2400: Cuando existió levantamiento manual repetido de cargas (>3 kg).

REQUERIMIENTO ADICIONAL OBLIGATORIO:
1. Debes incluir OBLIGATORIAMENTE la sección especial comparativa multifase inmediatamente después de la tabla de Matriz de Riesgos (antes de la sección 5):
${activeProtocol.reportMatrixHeader}
2. Analiza las imágenes de evidencia capturadas citando explícitamente a qué fase corresponden y contrastando la evolución de la postura desde la fase habitual hasta la postura crítica y la fatiga.`;
            } else {
                templateInstructions = `ENFOQUE DE AUDITORÍA: ${activeProtocol.title} aplicando ${activeProtocol.methodLabel} (${activeProtocol.normRef}).
La inspección en vivo se estructuró y documentó a través de un PROTOCOLO MULTIFASE sistemático:
- Fases evaluadas: ${activeProtocol.phases.join(', ')}.
- Perspectiva de Captura: Documenta si la verificación se ejecutó como auto-inspección autónoma o como inspección asistida con dispositivo móvil.

REQUERIMIENTO ADICIONAL OBLIGATORIO:
1. Debes incluir OBLIGATORIAMENTE la sección comparativa multifase inmediatamente después de la tabla de Matriz de Riesgos (antes de la sección 5):
${activeProtocol.reportMatrixHeader}
2. Analiza las imágenes de evidencia fotográfica capturadas citando explícitamente a qué fase corresponden y contrastando los hallazgos técnicos entre cada etapa de la inspección.`;
            }

            const prompt = `
            INSTRUCCIÓN DE SISTEMA:
            Eres "Wappy-Audit", Consultor Senior HSE con certificación en ISO 45001 y GTC 45. Tu especialidad es producir Informes Técnicos de Evaluación de Riesgos de MÁXIMA CALIDAD PROFESIONAL.

            ${templateInstructions}

            CONTEXTO DE LA INSPECCIÓN:
            La siguiente es la conversación entre el Usuario y el Asistente de IA durante una inspección de seguridad en tiempo real con análisis de video.
            ${finalContext}

            TAREA:
            Genera un INFORME TÉCNICO EXTENSO Y DETALLADO de Evaluación de Riesgos basado en toda la conversación anterior.
            Sé EXHAUSTIVO. Cada sección debe tener al menos 2 párrafos de análisis profundo.

            REQUERIMIENTOS CRÍTICOS:
            1. **IDIOMA:** OBLIGATORIAMENTE EN ESPAÑOL TÉCNICO Y FORMAL.
            2. **FECHA:** Usa esta fecha: ${currentDate}.
            3. **FORMATO:** Solo HTML limpio. CERO bloques de código markdown (\`\`\`html). 
            4. **VERACIDAD VISUAL Y CONTEXTUAL:** Analiza PROFUNDAMENTE las imágenes fotográficas incluidas en este prompt y lee la conversación transcrita. El informe debe basarse en lo que VES en las imágenes y escuchas en la conversación. NO asumas que es una bodega de carga o planta industrial si las imágenes revelan una oficina o un entorno doméstico. Adapta tu análisis a la evidencia real proporcionada.
            5. **EXTENSIÓN Y PRECISIÓN:** El informe debe ser riguroso, formal y técnico, de extensión óptima (aproximadamente 1.000 a 1.500 palabras en español). Desarrolla cada sección con terminología técnica experta, matrices concisas y recomendaciones accionables sin redundancias ni demora.
            6. **MATRIZ DE RIESGOS:** Mantén OBLIGATORIAMENTE un mínimo de 5 peligros. Deduce 5 riesgos especializados basados directamente en LAS IMÁGENES adjuntas y el tema de la conversación. JAMÁS inventes peligros genéricos si no encajan con la evidencia fotográfica enviada.
               - OBLIGATORIAMENTE DEBES INCLUIR en la matriz y en las medidas de control:
                 1. **Riesgo Biomecánico / Ergonómico:** Analizando la postura del trabajador, silla, escritorio o movimientos repetitivos observados en la imagen (e.g. postura sentada prolongada frente a la pantalla, flexión de cuello, etc.).
                 2. **Uso de Elementos de Protección Personal (EPP):** Analizando si el trabajador usa o no EPP adecuado según el entorno observado en las imágenes (e.g., gafas de seguridad, protección auditiva, respiratoria, o EPP específico para oficina/computadores como lentes con filtro de luz azul o soporte ergonómico).


            ESTRUCTURA HTML OBLIGATORIA:

            PRIMERA LÍNEA (ANTES de cualquier otro HTML, sin excepción):
            <div id="wappy-kpi" data-riesgo="[ALTO|MEDIO|BAJO]" data-trabajador="[Nombre completo del trabajador evaluado]" data-cedula="[Cédula o documento del trabajador si fue mencionada, o N/A]" data-cargo="[Nombre del cargo o puesto de trabajo mencionado por el usuario]" data-actividad="[Breve resumen de la actividad laboral evaluada]" data-modalidad="[auto|asistida]" data-accion="[Inmediata|Programada|Preventiva]" data-consecuencia="[Mortal|Incapacitante|Leve]" data-npeligros="[N]" style="display:none"></div>
            - data-riesgo: El nivel de riesgo predominante que encontraste.
            - data-trabajador: Nombre completo del trabajador evaluado (mencionado en el saludo o conversación).
            - data-cedula: Cédula de ciudadanía o identificación del trabajador (si se indicó).
            - data-cargo: Cargo o puesto de trabajo que se indicó al inicio (ej. Desarrollador de Software, Asistente Administrativo, etc.).
            - data-actividad: Breve descripción de la actividad habitual evaluada.
            - data-modalidad: "auto" si el trabajador se auto-evalúa, o "asistida" si un prevencionista o compañero lo evalúa.
            - data-accion: La acción requerida con mayor urgencia.
            - data-consecuencia: La consecuencia máxima posible de materialización del riesgo crítico (Mortal, Incapacitante o Leve).
            - data-npeligros: El número exacto de peligros que listaste en la Matriz de Riesgos (debe ser ≥ 5).

            LUEGO EL CUERPO DEL INFORME:

            <h2>Informe Técnico de Evaluación de Riesgos y Peligros</h2>
            <p><strong>Fecha de Generación:</strong> ${currentDate}</p>
            <p><strong>Modalidad:</strong> Inspección en Vivo con Análisis de Video IA</p>
            <p><strong>Metodología Aplicada:</strong> GTC 45 / ISO 45001 / Decreto 1072 de 2015</p>

            <h3>1. Objeto y Alcance de la Inspección</h3>
            <p>[Describe el propósito de la inspección, qué se quería evaluar, cuál es el entorno de trabajo auditado y cuáles son los límites del análisis. Mínimo 2 párrafos detallados.]</p>

            <h3>2. Descripción Exhaustiva del Entorno Analizado</h3>
            <p>[Describe con precisión técnica el entorno observado: espacio físico, condiciones ambientales (iluminación, temperatura, humedad estimada), herramientas y equipos presentes, número de trabajadores estimado, actividades en ejecución. Usa terminología HSE. Mínimo 3 párrafos.]</p>

            <h3>3. Identificación y Análisis de Actos y Condiciones Inseguras</h3>
            <p>[Analiza detalladamente cada acto inseguro y condición insegura encontrada. Para cada uno: describe el hallazgo, la norma técnica o legal que incumple, y el potencial de daño. Usa viñetas para claridad pero con descripción extensa de cada punto.]</p>
            <ul>
                <li><strong>[Hallazgo 1 - Tipo]:</strong> [Descripción detallada del acto/condición insegura, su causa raíz, consecuencias potenciales y referencia normativa incumplida]</li>
                <li><strong>[Hallazgo 2 - Tipo]:</strong> [Descripción detallada...]</li>
                <li><strong>[Hallazgo N - Tipo]:</strong> [Descripción detallada...]</li>
            </ul>

            <h3>4. Matriz de Identificación de Peligros y Valoración de Riesgos (GTC 45)</h3>
            <p>La siguiente matriz ha sido construida con metodología GTC 45 (Guía Técnica Colombiana), evaluando cada peligro identificado durante la inspección en vivo. El nivel de riesgo se obtiene multiplicando Nivel de Deficiencia (ND) × Nivel de Exposición (NE) = Nivel de Probabilidad (NP), y luego NP × Nivel de Consecuencia (NC) = Nivel de Riesgo (NR).</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 850px; table-layout: auto; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #004d99; color: white;">
                <tr>
                    <th style="padding: 8px 6px; text-align: center; white-space: normal;">#</th>
                    <th style="padding: 8px 8px; white-space: normal;">Proceso / Zona</th>
                    <th style="padding: 8px 8px; white-space: normal;">Peligro (Descripción)</th>
                    <th style="padding: 8px 8px; white-space: normal;">Clasificación GTC 45</th>
                    <th style="padding: 8px 8px; white-space: normal;">Efectos Posibles</th>
                    <th style="padding: 8px 6px; text-align: center; white-space: normal;">ND</th>
                    <th style="padding: 8px 6px; text-align: center; white-space: normal;">NE</th>
                    <th style="padding: 8px 6px; text-align: center; white-space: normal;">NC</th>
                    <th style="padding: 8px 6px; text-align: center; white-space: normal;">NR</th>
                    <th style="padding: 8px 8px; white-space: normal;">Nivel Riesgo</th>
                    <th style="padding: 8px 8px; white-space: normal;">Aceptabilidad</th>
                </tr>
              </thead>
              <tbody>
                <!-- OBLIGATORIO: Genera al menos 5 filas. Máximo las que el entorno requiera. Para cada peligro: ND (1-10), NE (1-4), NC (10-100), NR = ND×NE×NC, Nivel: I(>600 Crítico), II(200-600 Alto), III(70-200 Medio), IV(<70 Bajo) -->
                <tr style="background:#fff0f0;">
                    <td style="padding: 6px 4px; font-weight:bold; text-align: center;">1</td>
                    <td style="padding: 6px 5px; word-break: break-word;">[Zona/Proceso]</td>
                    <td style="padding: 6px 5px; word-break: break-word;">[Descripción técnica del peligro 1]</td>
                    <td style="padding: 6px 5px; word-break: break-word;">[Ej: Biomecánico / Físico / Psicosocial / Químico / Locativo]</td>
                    <td style="padding: 6px 5px; word-break: break-word;">[Efectos en salud: lesiones posibles]</td>
                    <td style="padding: 6px 3px; text-align:center;">[ND]</td>
                    <td style="padding: 6px 3px; text-align:center;">[NE]</td>
                    <td style="padding: 6px 3px; text-align:center;">[NC]</td>
                    <td style="padding: 6px 3px; text-align:center; font-weight:bold;">[NR]</td>
                    <td style="padding: 6px 5px; font-weight:bold; color:red; word-break: break-word;">I - CRÍTICO</td>
                    <td style="padding: 6px 5px; color:red; font-weight:bold; word-break: break-word;">No aceptable</td>
                </tr>
                <!-- Agrega mínimo 4 filas más con el mismo formato -->
              </tbody>
            </table>
            </div>

            <h3>5. Medidas de Intervención por Jerarquía de Controles (ISO 45001 / GTC 45)</h3>
            <p>Las medidas de control se proponen siguiendo estrictamente la Jerarquía de Controles establecida en la ISO 45001 y la GTC 45: Eliminación → Sustitución → Controles de Ingeniería → Controles Administrativos → Elementos de Protección Personal (EPP).</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 850px; table-layout: auto; text-align: left; font-size: 0.85em;">
              <thead style="background-color: #004d99; color: white;">
                <tr>
                    <th style="padding: 8px 8px; white-space: normal;">Peligro / Riesgo</th>
                    <th style="padding: 8px 8px; white-space: normal;">Eliminación / Sustitución</th>
                    <th style="padding: 8px 8px; white-space: normal;">Controles Ingeniería</th>
                    <th style="padding: 8px 8px; white-space: normal;">Controles Admin</th>
                    <th style="padding: 8px 8px; white-space: normal;">EPP Requerido</th>
                    <th style="padding: 8px 8px; white-space: normal;">Responsable</th>
                    <th style="padding: 8px 8px; white-space: normal;">Plazo</th>
                </tr>
              </thead>
              <tbody>
                <!-- Una fila por cada peligro identificado en la sección anterior -->
                <tr>
                    <td style="padding: 6px 6px; word-break: break-word;">[Peligro 1]</td>
                    <td style="padding: 6px 6px; word-break: break-word;">[Medida de eliminación/sustitución]</td>
                    <td style="padding: 6px 6px; word-break: break-word;">[Control de ingeniería específico]</td>
                    <td style="padding: 6px 6px; word-break: break-word;">[Procedimiento, capacitación]</td>
                    <td style="padding: 6px 6px; word-break: break-word;">[EPP específico: tipo, norma]</td>
                    <td style="padding: 6px 6px; word-break: break-word;">[Área o cargo responsable]</td>
                    <td style="padding: 6px 6px; word-break: break-word;">[Inmediato / 8 días]</td>
                </tr>
              </tbody>
            </table>
            </div>

            <h3>6. Plan de Acción Inmediata (Riesgos Críticos y Altos)</h3>
            <p>[Lista las acciones que deben tomarse AHORA MISMO o en las próximas 24-48 horas para controlar los riesgos de Nivel I y II. Sé muy específico: qué hacer, quién debe hacerlo, y cómo verificar que se hizo.]</p>
            <ol>
                <li><strong>Acción 1 (Inmediata - 0h):</strong> [Descripción detallada de la acción inmediata]</li>
                <li><strong>Acción 2 (Corto Plazo - 24h):</strong> [Descripción detallada]</li>
                <li><strong>Acción 3 (Corto Plazo - 48h):</strong> [Descripción detallada]</li>
            </ol>

            <h3>7. Análisis de Causas Raíz</h3>
            <p>[Aplica metodología de "Los 5 Por Qué" o Diagrama de Ishikawa para el riesgo más crítico identificado. Explica las causas inmediatas, básicas y sistémicas que generaron las condiciones inseguras encontradas. Mínimo 2 párrafos.]</p>

            <h3>8. Conclusiones Técnicas y Viabilidad Operacional</h3>
            <p>[Emite un dictamen técnico formal sobre el estado de seguridad del área/actividad inspeccionada. Indica si la operación puede continuar, si debe detenerse, o si debe hacerlo con medidas de control específicas. Sé contundente y técnico. Mínimo 2 párrafos.]</p>

            <h3>9. Firmas y Responsabilidades</h3>
            <p>El presente informe ha sido generado mediante inspección asistida por Inteligencia Artificial (Wappy-Audit HSE), con base en la evidencia visual y conversacional recopilada durante la sesión de análisis en vivo.</p>
            `;


            // Gather frames and telemetries from phaseEvidences
            let phaseFrames = [];
            let phaseTelemetryNotes = [];

            if (this.phaseEvidences && Object.keys(this.phaseEvidences).length > 0) {
                const sortedPhaseIndices = Object.keys(this.phaseEvidences)
                    .map(Number)
                    .sort((a, b) => a - b);

                for (const idx of sortedPhaseIndices) {
                    const pe = this.phaseEvidences[idx];
                    if (pe && pe.image) {
                        phaseFrames.push(pe.image);
                        const telemDesc = pe.telemetry?.summary || pe.text || '';
                        phaseTelemetryNotes.push(`• Fase ${idx + 1} (${pe.phaseName}): ${telemDesc || 'Captura de postura registrada'}`);
                    }
                }
            }

            // If some phases didn't have explicit captures, fill from manualEvidences
            if (phaseFrames.length < 3 && this.manualEvidences && this.manualEvidences.length > 0) {
                for (const img of this.manualEvidences) {
                    if (phaseFrames.length >= 3) break;
                    if (!phaseFrames.includes(img)) {
                        phaseFrames.push(img);
                    }
                }
            }

            const framesToUse = phaseFrames.length > 0 
                ? phaseFrames 
                : (this.manualEvidences && this.manualEvidences.length > 0) 
                    ? this.manualEvidences 
                    : (this.frameBuffer && this.frameBuffer.length > 0) 
                        ? this.frameBuffer 
                        : (this.lastEvaluatedFrames && this.lastEvaluatedFrames.length > 0)
                            ? this.lastEvaluatedFrames
                            : this.latestFrame 
                                ? [this.latestFrame] 
                                : [];

            let realTelemetryBlock = '';
            if (phaseTelemetryNotes.length > 0) {
                realTelemetryBlock = `
VALORES REALES DE TELEMETRÍA ARTICULAR REGISTRADOS EN VIVO (MEDICIÓN DIRECTA MEDIAPIPE):
${phaseTelemetryNotes.join('\n')}

REGLA ESTRICTA DE LA MATRIZ ERGONÓMICA:
En la sección "4.1 Matriz Ergonómica Comparativa Multifase", en la columna "Telemetría Articular (Cuello / Tronco / Brazo)", DEBES PLASMAR OBLIGATORIAMENTE estos ángulos articulares medidos en cada una de las fases. NO inventes valores ficticios. Sustenta los puntajes RULA / REBA y el nivel de riesgo directamente sobre estas mediciones reales.
`;
            }

            logger.info(`[VoiceSession] Sending multimodal prompt to model: ${reportModelName} (via rotation)`);
            
            // Multimodal Array of Parts
            const promptParts = [
                { text: `${prompt}\n\n${realTelemetryBlock}` }
            ];

            // Inject visual frames: prefer 3 distinct phase photos
            let injectedFrames = 0;
            for (const b64 of framesToUse.slice(0, 3)) {
                promptParts.push({
                    inlineData: {
                        data: b64,
                        mimeType: "image/jpeg"
                    }
                });
                injectedFrames++;
            }
            logger.info(`[VoiceSession] Injected ${injectedFrames} visual frames (phaseEvidences: ${Object.keys(this.phaseEvidences || {}).length}, manual: ${!!(this.manualEvidences && this.manualEvidences.length > 0)}) into report prompt.`);

            // Call API with the multimodal array
            const result = await generateWithKeyRotation(reportModelName, this.userId, promptParts);
            const response = result.response;
            let reportHtml = response.text().replace(/```html/g, '').replace(/```/g, '').trim();

            // ─── DYNAMIC SIGNATURE AND WORKER DETECTION ──────────────────────
            let finalSignatureHtml = '';
            let companyInfo = null;
            try {
                companyInfo = await CompanyInfo.findOne({ user: this.userId, isActive: true }).lean();
                if (!companyInfo) {
                    companyInfo = await CompanyInfo.findOne({ user: this.userId }).lean();
                }
                let matchedWorker = null;

                if (mongoose.models.PerfilSociodemograficoData) {
                    const profileData = await mongoose.models.PerfilSociodemograficoData.findOne({ user: this.userId }).lean();
                    if (profileData && profileData.trabajadores) {
                        // Find the first worker whose name or identification is explicitly mentioned in the generated HTML
                        matchedWorker = profileData.trabajadores.find(w => {
                            if (w.nombre && reportHtml.includes(w.nombre)) return true;
                            if (w.identificacion && reportHtml.includes(w.identificacion)) return true;
                            return false;
                        });
                        if (matchedWorker) {
                            logger.info(`[VoiceSession] Worker matched in report: ${matchedWorker.nombre}`);
                        }
                    }
                }

                if (companyInfo) {
                    finalSignatureHtml = buildSignatureSection(companyInfo, matchedWorker);
                }
            } catch (err) {
                logger.warn('[VoiceSession] Error generating signatures for LiveAnalysis:', err.message);
            }

            if (finalSignatureHtml) {
                reportHtml += `\n\n${finalSignatureHtml}`;
            }

            // ─── EXTRACT KPI DIV AND CONTEXT METADATA ────────
            const kpiMatch = reportHtml.match(/<div[^>]+id=["']wappy-kpi["'][^>]*>[\s\S]*?<\/div>/i) || reportHtml.match(/<div[^>]+id=["']wappy-kpi["'][^>]*>/i);
            let kpiDiv = '';
            if (kpiMatch) {
                kpiDiv = kpiMatch[0];
                if (!kpiDiv.endsWith('</div>') && !kpiDiv.includes('/>')) {
                    kpiDiv += '</div>';
                }
                reportHtml = reportHtml.replace(kpiMatch[0], '');
            } else {
                kpiDiv = '<div id="wappy-kpi" data-riesgo="MEDIO" data-accion="Programada" data-consecuencia="Incapacitante" data-npeligros="5" style="display:none"></div>';
            }

            // Remove any duplicated title or metadata from Gemini's output
            reportHtml = reportHtml.replace(/<h2>Informe Técnico de Evaluación de Riesgos y Peligros<\/h2>/i, '');
            reportHtml = reportHtml.replace(/<p><strong>Fecha de Generación:<\/strong>.*?<\/p>/i, '');
            reportHtml = reportHtml.replace(/<p><strong>Modalidad:<\/strong>.*?<\/p>/i, '');
            reportHtml = reportHtml.replace(/<p><strong>Metodología Aplicada:<\/strong>.*?<\/p>/i, '');

            // Build photographic evidence section inside body
            let evidenceHtml = '';
            if (framesToUse.length > 0) {
                const activeProtocol = this.agentProtocol || resolveInspectionProtocol(this.agentObj?.name || this.config?.template);
                const phaseLabels = (activeProtocol.phases || []).map(p => typeof p === 'string' ? p : (p.name || p.shortName));
                const sectionTitle = `1. Evidencia Fotográfica y Documental Multifase (${activeProtocol.title})`;

                const imgItems = framesToUse.slice(0, 3).map((b64, idx) => {
                    const phaseData = this.phaseEvidences?.[idx] || this.lastPhaseEvidences?.[idx];
                    const label = phaseData?.phaseName || phaseLabels[idx] || `Fase ${idx + 1}: Evidencia de Inspección`;
                    const telemSummary = phaseData?.telemetry?.summary || '';
                    const telemItems = telemSummary ? telemSummary.split(/\s*•\s*/).filter(Boolean) : [];

                    const telemHtml = telemItems.length > 0 ? `
                        <div style="margin-top:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 8px; text-align:left; box-shadow:0 1px 2px rgba(0,0,0,0.03); width:100%; box-sizing:border-box;">
                            <div style="font-size:0.72em; font-weight:700; color:#0f766e; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; border-bottom:1px solid #e2e8f0; padding-bottom:2px;">
                                📐 Telemetría Articular:
                            </div>
                            ${telemItems.map(item => {
                                const parts = item.split(':');
                                const metricName = parts[0]?.trim() || '';
                                const metricVal = parts.slice(1).join(':').trim() || '';
                                return `
                                <div style="font-size:0.68em; line-height:1.3; color:#334155; margin-bottom:3px; word-break:break-word; overflow-wrap:break-word;">
                                    <span style="font-weight:600; color:#1e293b;">• ${metricName}:</span> 
                                    <span style="color:#0f766e; font-weight:600;">${metricVal}</span>
                                </div>`;
                            }).join('')}
                        </div>` : '';

                    return `
                    <td style="width:33.333%; max-width:33.333%; padding:6px; vertical-align:top; text-align:center; border:none; background:transparent; word-break:break-word; overflow-wrap:break-word; box-sizing:border-box;">
                        <div style="background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; padding:4px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                            <img src="data:image/jpeg;base64,${b64}" alt="Evidencia Fase ${idx+1}" style="width:100%; max-height:220px; object-fit:contain; border-radius:6px; display:block; margin:0 auto;" />
                        </div>
                        <p style="font-size:0.78em; color:#0f766e; font-weight:700; margin-top:8px; margin-bottom:2px; line-height:1.3; word-break:break-word; overflow-wrap:break-word;">${label}</p>
                        ${telemHtml}
                    </td>`;
                }).join('');

                evidenceHtml = `
                    <div style="margin-bottom:24px;">
                        <h3 style="color:#0f766e; font-size:1.1em; text-transform:uppercase; letter-spacing:1px; border-left:4px solid #14b8a6; padding-left:10px; margin-bottom:12px;">${sectionTitle}</h3>
                        <table border="0" style="width:100%; border:none; table-layout:fixed; border-collapse:collapse; margin-top:12px; box-sizing:border-box;">
                            <tr>${imgItems}</tr>
                        </table>
                    </div>`;
            }

            const radicadoId = `LA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`;

            // Extract worker, cargo, actividad & modalidad if present in kpiDiv or conversation turns
            const workerNameMatch = kpiDiv.match(/data-trabajador=["']([^"']+)["']/i);
            const workerIdMatch = kpiDiv.match(/data-cedula=["']([^"']+)["']/i);
            const cargoMatch = kpiDiv.match(/data-cargo=["']([^"']+)["']/i);
            const actividadMatch = kpiDiv.match(/data-actividad=["']([^"']+)["']/i);
            const modalidadMatch = kpiDiv.match(/data-modalidad=["']([^"']+)["']/i);

            const convoText = (this.conversationTurns || []).join('\n');

            let extractedWorkerName = workerNameMatch && !workerNameMatch[1].includes('[') && workerNameMatch[1] !== 'N/A' 
                ? workerNameMatch[1].trim() 
                : '';
            if (!extractedWorkerName && convoText) {
                const nameRegex = /(?:me llamo|mi nombre es|nombre(?:\s+completo)?\s*(?:es|:))\s*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,40})/i;
                const mName = convoText.match(nameRegex);
                if (mName && mName[1]) {
                    extractedWorkerName = mName[1].replace(/\n.*$/, '').trim();
                }
            }
            if (!extractedWorkerName) {
                extractedWorkerName = this.user?.name || 'Trabajador Evaluado';
            }

            let extractedWorkerId = workerIdMatch && !workerIdMatch[1].includes('[') && workerIdMatch[1] !== 'N/A'
                ? workerIdMatch[1].trim()
                : '';
            if (!extractedWorkerId && convoText) {
                const docRegex = /(?:c[eé]dula|cc|identificaci[oó]n|documento|doc)[\s:]*([0-9\.\-]{6,15})/i;
                const mDoc = convoText.match(docRegex);
                if (mDoc && mDoc[1]) {
                    extractedWorkerId = mDoc[1].replace(/\D/g, '').trim();
                } else {
                    const digitsMatch = convoText.match(/\b([1-9][0-9]{6,9})\b/);
                    if (digitsMatch) {
                        extractedWorkerId = digitsMatch[1].trim();
                    }
                }
            }

            let extractedCargo = cargoMatch && !cargoMatch[1].includes('[') ? cargoMatch[1].trim() : '';
            if (!extractedCargo && convoText) {
                const cargoRegex = /(?:cargo|puesto(?:\s+de\s+trabajo)?)\s*(?:es|:)?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,40})/i;
                const mCargo = convoText.match(cargoRegex);
                if (mCargo && mCargo[1]) {
                    extractedCargo = mCargo[1].replace(/\n.*$/, '').trim();
                }
            }
            if (!extractedCargo) {
                extractedCargo = 'Puesto Operativo / Administrativo';
            }

            const extractedActividad = actividadMatch && !actividadMatch[1].includes('[') ? actividadMatch[1].trim() : 'Evaluación ergonómica y postural en ciclo regular';
            const extractedModalidad = (modalidadMatch && modalidadMatch[1].toLowerCase().includes('asist')) || (convoText.toLowerCase().includes('compañero') || convoText.toLowerCase().includes('asistid')) ? 'asistida' : 'auto';

            // Store extracted worker metadata on the session instance for persistence
            this.extractedWorkerMeta = {
                workerName: extractedWorkerName,
                workerId: extractedWorkerId,
                cargo: extractedCargo,
                actividad: extractedActividad,
                modalidad: extractedModalidad,
            };

            const standardReportTitle = this.isBiomechanics 
                ? 'INFORME TÉCNICO DE ERGONOMÍA Y BIOMECÁNICA' 
                : (activeProtocol?.title ? activeProtocol.title.toUpperCase() : 'INFORME TÉCNICO DE EVALUACIÓN DE RIESGOS');

            // 1. Encabezado institucional de la entidad (100% puro e intacto)
            const standardHeaderHtml = buildStandardHeader({
                title: standardReportTitle,
                companyInfo: companyInfo,
                norm: this.isBiomechanics ? 'Resolución 2400 de 1979 / GTC 45 / ISO 11226 (RULA/REBA)' : (activeProtocol?.normRef || 'Resolución 0312 de 2019 / GTC 45'),
                version: '1.0',
                documentId: radicadoId,
                date: new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
            });

            // 2. Sub-encabezado técnico del trabajador y puesto evaluado
            const workerSubHeaderHtml = buildWorkerSubHeader({
                workerName: extractedWorkerName,
                workerId: extractedWorkerId,
                cargo: extractedCargo,
                actividad: extractedActividad,
                evaluationType: extractedModalidad,
                evaluatorName: extractedModalidad === 'auto' ? 'Auto-reporte asistido por WAPPY Fisio IA' : (this.user?.name || 'Inspector SG-SST'),
            });

            const finalWrappedHtml = `<div class="report-container" style="font-family:'Segoe UI',Arial,sans-serif; max-width:900px; margin:0 auto; color:#111827;">
${kpiDiv}
<style>
.ai-report-content h2, .ai-report-content h3 { color: #0f766e; margin-top: 24px; margin-bottom: 12px; font-weight: 700; border-bottom: 1px solid #ccfbf1; padding-bottom: 6px; }
.ai-report-content p, .ai-report-content li { color: #334155; margin-bottom: 10px; font-size: 0.95em; }
.ai-report-content .table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 16px 0; border-radius: 10px; border: 1px solid #e2e8f0; }
.ai-report-content table { width: 100%; min-width: 800px; table-layout: auto; border-collapse: separate; border-spacing: 0; margin: 0; font-size: 0.85em; }
.ai-report-content th { background-color: #0f766e; color: #ffffff; padding: 9px 10px; text-align: left; white-space: normal; word-break: normal; }
.ai-report-content td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; white-space: normal; word-break: normal; }
.ai-report-content tr:nth-child(even) td { background-color: #f8fafc; }
</style>

${standardHeaderHtml}
${workerSubHeaderHtml}

<div style="background:#ffffff; padding:10px 0; min-height:400px; display:flex; flex-direction:column; color:#1f2937;">
    ${evidenceHtml}

    <div class="ai-report-content" style="line-height:1.7; color:#1f2937;">
      <h2 style="color:#0f766e; font-size:1.4em; font-weight:800; border-bottom:2px solid #14b8a6; padding-bottom:8px; margin-bottom:20px;">${this.isBiomechanics ? 'Informe Técnico de Evaluación Postural y Ergonómica' : 'Informe Técnico de Evaluación de Riesgos y Peligros'}</h2>
      ${reportHtml}
    </div>
</div>
</div>`;

            // Strip any 4+ space indentation so markdown engines never treat tags as code blocks
            reportHtml = finalWrappedHtml.replace(/^[ \t]{4,}/gm, '');

            // Ensure every <table> has a responsive wrapper and horizontal scroll (min-width: 800px, overflow-x: auto)
            if (reportHtml && typeof reportHtml === 'string') {
                reportHtml = reportHtml.replace(/(?:<div[^>]*class=["'][^"']*table-responsive[^"']*["'][^>]*>\s*)?(<table[\s\S]*?<\/table>)(?:\s*<\/div>)?/gi, (match, tableContent) => {
                    let cleanTable = tableContent;
                    // Replace table-layout: fixed with table-layout: auto so columns never crush/overlap
                    cleanTable = cleanTable.replace(/table-layout:\s*fixed;?/gi, 'table-layout: auto;');
                    // Ensure table has min-width: 800px so overflow-x: auto activates when space is constrained
                    if (!cleanTable.includes('min-width')) {
                        cleanTable = cleanTable.replace(/<table\b([^>]*)>/i, (m, attrs) => {
                            if (/style=["']/.test(attrs)) {
                                return `<table ${attrs.replace(/style=["']([^"']*)["']/, 'style="width: 100%; min-width: 800px; table-layout: auto; $1"')}>`;
                            } else {
                                return `<table style="width: 100%; min-width: 800px; table-layout: auto;" ${attrs}>`;
                            }
                        });
                    } else {
                        cleanTable = cleanTable.replace(/<table\b([^>]*)>/i, (m, attrs) => {
                            if (/style=["']/.test(attrs)) {
                                return `<table ${attrs.replace(/style=["']([^"']*)["']/, 'style="table-layout: auto; $1"')}>`;
                            } else {
                                return `<table style="table-layout: auto;" ${attrs}>`;
                            }
                        });
                    }
                    // Ensure th & td allow natural wrapping and never overlap
                    cleanTable = cleanTable.replace(/<(th|td)\b([^>]*)>/gi, (m, tag, attrs) => {
                        if (/style=["']/.test(attrs)) {
                            return `<${tag} ${attrs.replace(/style=["']([^"']*)["']/, 'style="white-space: normal; word-break: normal; $1"')}>`;
                        } else {
                            return `<${tag} style="white-space: normal; word-break: normal;" ${attrs}>`;
                        }
                    });
                    return `<div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">${cleanTable}</div>`;
                });
            }
            // ──────────────────────────────────────────────────────────────────

            logger.info(`[VoiceSession] Report generated successfully (${reportHtml.length} chars)`);

            // SAVE REPORT TO DATABASE FIRST (Persistence)
            // This ensures we have a messageId BEFORE sending to client
            let messageId = uuidv4();
            if (this.conversationId && this.conversationId !== 'new') {
                try {
                    // IMPROVED: Convert HTML to Markdown for chat display
                    // The chat UI expects Markdown, not raw HTML
                    const convertHtmlToMarkdown = (html) => {
                        let md = html;

                        // Strip out style blocks, svgs, and hidden tracking elements
                        md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                        md = md.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
                        md = md.replace(/<div id="wappy-kpi"[^>]*>[\s\S]*?<\/div>/gi, '');

                        // Handle tables FIRST (before stripping other tags)
                        // This creates proper Markdown tables
                        const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
                        md = md.replace(tableRegex, (match, tableContent) => {
                            const rows = [];
                            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                            let rowMatch;
                            let isHeader = true;

                            while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
                                const cells = [];
                                const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
                                let cellMatch;

                                while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
                                    // Clean cell content
                                    let cellText = cellMatch[2]
                                        .replace(/<[^>]*>/g, '') // Remove inner tags
                                        .replace(/\n/g, ' ')
                                        .trim();
                                    cells.push(cellText || ' ');
                                }

                                if (cells.length > 0) {
                                    rows.push('| ' + cells.join(' | ') + ' |');

                                    // Add separator after header row
                                    if (isHeader) {
                                        rows.push('|' + cells.map(() => '---').join('|') + '|');
                                        isHeader = false;
                                    }
                                }
                            }

                            return '\n' + rows.join('\n') + '\n';
                        });

                        // Handle headings
                        md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
                        md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
                        md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
                        md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');

                        // Handle text formatting
                        md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
                        md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
                        md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
                        md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

                        // Handle lists
                        md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
                        md = md.replace(/<ul[^>]*>/gi, '\n');
                        md = md.replace(/<\/ul>/gi, '\n');
                        md = md.replace(/<ol[^>]*>/gi, '\n');
                        md = md.replace(/<\/ol>/gi, '\n');

                        // Handle paragraphs and line breaks
                        md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, '\n$1\n');
                        md = md.replace(/<br\s*\/?>/gi, '\n');
                        md = md.replace(/<div[^>]*>/gi, '\n');
                        md = md.replace(/<\/div>/gi, '\n');

                        // Handle images - base64 images replaced with placeholder, URL images to markdown
                        // Base64 images cause display issues in chat (too long)
                        md = md.replace(/<img[^>]*src="data:[^"]*"[^>]*alt="([^"]*)"[^>]*>/gi, '\n\n📷 **[$1]** *(imagen disponible en el informe original)*\n\n');
                        md = md.replace(/<img[^>]*src="data:[^"]*"[^>]*>/gi, '\n\n📷 **[Imagen captada]** *(ver en informe original)*\n\n');
                        // Normal URL images convert to markdown
                        md = md.replace(/<img[^>]*src="(https?:\/\/[^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)');
                        md = md.replace(/<img[^>]*src="(https?:\/\/[^"]*)"[^>]*>/gi, '![image]($1)');

                        // Remove remaining HTML tags
                        md = md.replace(/<[^>]*>/g, '');

                        // Clean up entities
                        md = md.replace(/&nbsp;/g, ' ');
                        md = md.replace(/&amp;/g, '&');
                        md = md.replace(/&lt;/g, '<');
                        md = md.replace(/&gt;/g, '>');

                        // Fix excess newlines
                        md = md.replace(/\n\s*\n\s*\n/g, '\n\n');

                        return md.trim();
                    };

                    const cleanMarkdown = convertHtmlToMarkdown(reportHtml);
                    const reportTitle = this.isBiomechanics 
                        ? 'Informe Técnico de Ergonomía y Biomecánica' 
                        : 'Informe Técnico de Evaluación de Riesgos y Peligros';

                    const chatMessageText = `${cleanMarkdown}\n\n:::canvas{title="${reportTitle}" fileType="text" identifier="informe-ergonomico-${radicadoId}"}\n${reportHtml}\n:::\n`;

                    const reportModelName = SGSST_FALLBACK_MODELS[0]; // Use same model name used for generation
                    const reportSender = this.agentObj?.name || (this.isBiomechanics ? 'Fisioterapeuta Laboral' : 'Assistant');
                    const reportIconURL = this.agentObj?.avatar?.filepath || this.agentObj?.avatar?.url || undefined;
                    const reportMessage = {
                        messageId,
                        conversationId: this.conversationId,
                        parentMessageId: this.lastMessageId,
                        sender: reportSender,
                        iconURL: reportIconURL,
                        user: this.userId,
                        text: chatMessageText, // Clean Markdown + Native Canvas Directive
                        content: [{ type: 'text', text: chatMessageText }],
                        isCreatedByUser: false,
                        isHtmlReport: true, // Marker - this is an HTML report
                        error: false,
                        model: reportModelName,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };

                    await saveMessage({ user: { id: this.userId } }, reportMessage, { context: 'VoiceSession - Report' });
                    this.lastMessageId = messageId; // Update pointer
                    logger.info(`[VoiceSession] Report saved to DB with sender "${reportSender}". MessageId: ${messageId}`);

                    // Save conversation state so LibreChat updates the conversation list and timestamps
                    try {
                        await saveConvo({ user: { id: this.userId } }, {
                            conversationId: this.conversationId,
                            endpoint: this.dbEndpoint,
                            model: this.dbModel,
                            ...(this.config.mode === 'live_analysis' ? { tags: ['sgsst-live-analysis'] } : {})
                        }, { context: 'VoiceSession - Report' });
                    } catch (convoSaveError) {
                        logger.warn('[VoiceSession] Error updating conversation for report:', convoSaveError.message);
                    }

                    // Sync to LiveEditorSession & Canvas
                    try {
                        const LiveEditorSession = require('~/models/LiveEditorSession');
                        const CompanyInfo = require('~/models/CompanyInfo');
                        const { syncLiveEditorToCanvas } = require('../sgsst/syncBridge');
                        const { getActiveCompanyId } = require('../sgsst/contextHelper');

                        const companyId = this.config.companyId || (await getActiveCompanyId(this.userId));

                        const reportTitle = `Informe de Inspección - ${this.isBiomechanics ? 'BIOMECÁNICA (RULA/REBA)' : 'SST'}`;

                        if (companyId) {
                            await LiveEditorSession.findOneAndUpdate(
                                { conversationId: this.conversationId, companyId },
                                {
                                    $set: {
                                        content: reportHtml,
                                        contentUpdatedAt: new Date(),
                                        companyId,
                                        fileName: reportTitle,
                                    },
                                    $setOnInsert: { user: this.userId },
                                },
                                { upsert: true, new: true }
                            );
                        }

                        await syncLiveEditorToCanvas(this.conversationId, reportHtml, reportTitle, this.userId);
                        logger.info('[VoiceSession] Report synced to LiveEditorSession and Canvas successfully');

                        // If this is a Biomechanics / Ergonomics study, persist to EstudioPuestoTrabajo and sync worker
                        if (this.isBiomechanics && companyId) {
                            try {
                                const EstudioPuestoTrabajo = require('~/models/EstudioPuestoTrabajo');
                                const workerMeta = this.extractedWorkerMeta || {};
                                const rawWorkerId = workerMeta.workerId || '';
                                const cleanWorkerId = rawWorkerId ? String(rawWorkerId).trim() : `CC-${Date.now().toString().slice(-6)}`;
                                const cleanWorkerName = workerMeta.workerName || this.user?.name || 'Trabajador Evaluado';
                                const cleanCargo = workerMeta.cargo || 'Puesto Evaluado';
                                const cleanActividad = workerMeta.actividad || 'Evaluación en vivo';
                                const cleanModalidad = workerMeta.modalidad || 'auto';

                                // Extract RULA & REBA scores and Risk Level from report
                                const rulaMatch = reportHtml.match(/RULA[^\d<]*?(\d+)/i);
                                const rebaMatch = reportHtml.match(/REBA[^\d<]*?(\d+)/i);
                                const rulaScore = rulaMatch ? parseInt(rulaMatch[1], 10) : null;
                                const rebaScore = rebaMatch ? parseInt(rebaMatch[1], 10) : null;

                                let riskLevel = 'Bajo';
                                const riesgoMatch = (kpiDiv || '').match(/data-riesgo=["']([^"']+)["']/i);
                                if (riesgoMatch) {
                                    const rRaw = riesgoMatch[1].toLowerCase();
                                    if (rRaw.includes('crit') || rRaw.includes('crít')) riskLevel = 'Crítico';
                                    else if (rRaw.includes('alt')) riskLevel = 'Alto';
                                    else if (rRaw.includes('med')) riskLevel = 'Medio';
                                    else riskLevel = 'Bajo';
                                } else if (/riesgo\s*(es|:)?\s*cr[ií]tico/i.test(reportHtml) || (rulaScore && rulaScore >= 7) || (rebaScore && rebaScore >= 11)) {
                                    riskLevel = 'Crítico';
                                } else if (/riesgo\s*(es|:)?\s*alto/i.test(reportHtml) || (rulaScore && rulaScore >= 5) || (rebaScore && rebaScore >= 8)) {
                                    riskLevel = 'Alto';
                                } else if (/riesgo\s*(es|:)?\s*medio/i.test(reportHtml) || (rulaScore && rulaScore >= 3) || (rebaScore && rebaScore >= 4)) {
                                    riskLevel = 'Medio';
                                }

                                let actionLevel = 'Nivel 1 - Postura Aceptable';
                                if (riskLevel === 'Crítico') {
                                    actionLevel = 'Nivel 4 - Actuación Inmediata';
                                } else if (riskLevel === 'Alto') {
                                    actionLevel = 'Nivel 3 - Pronta Actuación';
                                } else if (riskLevel === 'Medio') {
                                    actionLevel = 'Nivel 2 - Es Necesaria la Actuación';
                                }

                                const newStudyDoc = new EstudioPuestoTrabajo({
                                    companyId,
                                    user: this.userId,
                                    workerId: cleanWorkerId,
                                    workerName: cleanWorkerName,
                                    cargo: cleanCargo,
                                    actividad: cleanActividad,
                                    evaluationType: cleanModalidad,
                                    evaluatorName: cleanModalidad === 'auto' ? 'Auto-reporte asistido por WAPPY IA' : (this.user?.name || 'Inspector SG-SST'),
                                    channel: 'chat_voice',
                                    modelUsed: reportModelName,
                                    telemetry: this.phaseEvidences?.map(p => p?.telemetry).filter(Boolean) || {},
                                    evidences: (framesToUse || []).slice(0, 3).map((f, idx) => ({
                                        phase: idx + 1,
                                        label: `Fase ${idx + 1}`,
                                        url: `data:image/jpeg;base64,${f}`,
                                        telemetry: this.phaseEvidences?.[idx]?.telemetry || {},
                                    })),
                                    rulaScore,
                                    rebaScore,
                                    actionLevel,
                                    riskLevel,
                                    reportHtml,
                                    status: 'completado',
                                });
                                await newStudyDoc.save();
                                logger.info(`[VoiceSession] EstudioPuestoTrabajo saved with ID: ${newStudyDoc._id}, Risk: ${riskLevel}, Action: ${actionLevel}`);

                                // Sync or update worker in PerfilSociodemograficoData & SgsstWorker
                                const PerfilSociodemograficoData = mongoose.models.PerfilSociodemograficoData;
                                if (PerfilSociodemograficoData) {
                                    let perfilDoc = await PerfilSociodemograficoData.findOne({ companyId });
                                    if (!perfilDoc && this.userId) {
                                        perfilDoc = new PerfilSociodemograficoData({
                                            user: this.userId,
                                            companyId,
                                            trabajadores: [],
                                        });
                                    }

                                    if (perfilDoc) {
                                        const existingIdx = perfilDoc.trabajadores.findIndex(
                                            (w) => w.identificacion && String(w.identificacion).trim() === cleanWorkerId
                                        );
                                        const dateStr = new Date().toLocaleDateString('es-CO');
                                        const eptNote = `Estudio Ergonómico WAPPY IA (${dateStr}): ${cleanCargo}. Actividad: ${cleanActividad}`;

                                        if (existingIdx >= 0) {
                                            const w = perfilDoc.trabajadores[existingIdx];
                                            if (!w.cargo && cleanCargo) w.cargo = cleanCargo;
                                            w.completedByAI = true;
                                            w.diagnosticoMedico = w.diagnosticoMedico ? `${w.diagnosticoMedico} | ${eptNote}` : eptNote;
                                            perfilDoc.markModified('trabajadores');
                                            await perfilDoc.save();
                                            logger.info(`[VoiceSession] Existing worker ${cleanWorkerId} updated with EPT study`);

                                            // Sync SgsstWorker as well
                                            const SgsstWorker = mongoose.models.SgsstWorker;
                                            if (SgsstWorker && this.userId) {
                                                await SgsstWorker.findOneAndUpdate(
                                                    { companyId, documento: cleanWorkerId },
                                                    {
                                                        $set: {
                                                            user: this.userId,
                                                            companyId,
                                                            documento: cleanWorkerId,
                                                            nombre: w.nombre || cleanWorkerName,
                                                            perfilId: cleanWorkerId,
                                                            condicionesSalud: `EPT ergonómico registrado: ${actionLevel}`,
                                                            updatedAt: new Date(),
                                                        },
                                                    },
                                                    { upsert: true, new: true }
                                                ).catch((err) => logger.warn('[VoiceSession] SgsstWorker upsert warning:', err.message));
                                            }
                                        } else {
                                            logger.info(`[VoiceSession] Worker ${cleanWorkerId} not yet in PerfilSociodemograficoData. Study kept in chat/EPT pending worker creation.`);
                                        }
                                    }
                                }
                            } catch (eptErr) {
                                logger.warn('[VoiceSession] Error saving EstudioPuestoTrabajo from voice session:', eptErr.message);
                            }
                        }
                    } catch (syncErr) {
                        logger.warn('[VoiceSession] Error syncing report to LiveEditor/Canvas:', syncErr.message);
                    }

                    // CRITICAL: Notify client to invalidate queries so the report appears immediately in the chat!
                    this.sendToClient({
                        type: 'conversationUpdated',
                        data: { conversationId: this.conversationId }
                    });

                    // INTERACTIVITY: Instruct Gemini Live (First Brain) to announce the report
                    if (this.geminiClient && this.isActive) {
                        logger.info('[VoiceSession] Instructing Gemini Live to announce report...');
                        try {
                            this.geminiClient.sendText('INSTRUCCIÓN DE SISTEMA: El informe técnico acaba de ser generado exitosamente por el motor de análisis y ya está visible para el usuario en su pantalla del editor principal. Notifícale esto al usuario con una respuesta verbal muy breve de máximo 1 oración, diciendo algo como: "Listo, el informe ha sido generado y cargado en tu pantalla." PROHIBIDO INVENTAR O LEER EL CONTENIDO DEL INFORME. SOLO AVISA QUE YA ESTÁ LISTO.');
                        } catch (announceErr) {
                            logger.warn('[VoiceSession] Could not send report announcement to Gemini:', announceErr.message);
                        }
                    }

                } catch (saveError) {
                    logger.error('[VoiceSession] Error saving report to DB:', saveError);
                    // Continue anyway, client will receive report but save might fail if clicked immediately
                }
            }

            // Get the frames evaluated
            const evalFrames = (framesToUse && framesToUse.length > 0)
                ? [...framesToUse.slice(0, 3)]
                : (this.manualEvidences && this.manualEvidences.length > 0)
                    ? [...this.manualEvidences]
                    : (this.frameBuffer && this.frameBuffer.length > 0)
                        ? [...this.frameBuffer]
                        : this.latestFrame
                            ? [this.latestFrame]
                            : [];

            // Cache evaluated frames and phase evidences for fallback in case subsequent report needs them
            if (evalFrames && evalFrames.length > 0) {
                this.lastEvaluatedFrames = [...evalFrames];
            }
            if (this.phaseEvidences && Object.keys(this.phaseEvidences).length > 0) {
                this.lastPhaseEvidences = { ...this.phaseEvidences };
            }

            // Clear manual evidence and phase buffers for next turns/reports
            this.manualEvidences = [];
            this.phaseEvidences = {};

            // Notify client with HTML (for rich rendering in Live editor) AND messageId
            this.sendToClient({
                type: 'report',
                data: {
                    html: reportHtml,
                    messageId: messageId,
                    evaluatedFrames: evalFrames
                }
            });

            return reportHtml;
        } catch (error) {
            logger.error('[VoiceSession] Error generating formal report:', error);
            
            // Critical fallback: Notify client that report generation failed so UI unfreezes!
            this.sendToClient({
                type: 'report',
                data: { 
                    html: `<div style="padding:24px; color:#d32f2f; background-color:#ffebee; border-radius:8px; border:1px solid #ef5350;">
                        <h3 style="margin-top:0;">⚠️ Error de Generación</h3>
                        <p>Ocurrió un error al generar el informe técnico con la Inteligencia Artificial. El sistema experimentó una falla interna: <strong>${error.message}</strong>.</p>
                        <p>No te preocupes, el diagnóstico no se ha perdido. Por favor, vuelve a indicarle al asistente de voz que genere el informe.</p>
                    </div>`,
                    messageId: uuidv4()
                }
            });
            return null;
        }
    }

    /**
     * Tenshi Voice Failsafe: Intercepta intenciones de abrir agentes o navegar
     * en caso de que Gemini Live haya respondido por voz pero omitido el toolCall.
     */
    handleTenshiVoiceFailsafe(currentUserText = '', currentAiText = '') {
        if (this.config.mode !== 'tenshi_voice') return;
        if (this.toolCalledThisTurn) {
            logger.debug('[VoiceSession] [Tenshi Voice Failsafe] Tool was properly called by Gemini. No failsafe needed.');
            return;
        }

        const userText = (currentUserText || '').trim();
        const aiText = (currentAiText || '').trim();
        const combinedText = `${userText} ${aiText}`.toLowerCase();

        // 1. Detección de intención de consultar / abrir chat con un agente especialista
        const agentIntentRegex = /(chat|agente|especialista|preg[uú]ntale|consulta|habla con|vamos a preguntarle|p[ií]dele|dile a|abrí el chat|abriendo el chat|le pasé tu pregunta|le pas[eé]|abrir chat|nuevo chat)/i;
        if (agentIntentRegex.test(combinedText)) {
            let matchedAgent = null;

            if (/fisioterap|biomec|ergonom|owas|rula|rosa|postur|puesto.*trabajo|dme|músculo|musculo/i.test(combinedText)) {
                matchedAgent = 'fisioterapeuta_laboral';
            } else if (/abogado.*rit|reglamento interno.*rit/i.test(combinedText)) {
                matchedAgent = 'abogado_rit';
            } else if (/debido proceso|proceso disciplinario|descargo/i.test(combinedText)) {
                matchedAgent = 'abogado_procesos_disciplinarios';
            } else if (/acoso sexual|ley 2365/i.test(combinedText)) {
                matchedAgent = 'abogado_acoso_sexual';
            } else if (/abogad|jur[ií]dic|disciplinar|ley 1010|contrato|despido|rit|legal/i.test(combinedText)) {
                matchedAgent = 'abogado_laboral';
            } else if (/m[eé]dic|doctor|salud ocupacional|restricci[oó]n|ausentism|epidemiol/i.test(combinedText)) {
                matchedAgent = 'medico_laboral';
            } else if (/qu[ií]mic|sga|fds|hds|sustancia|derrame|hoja.*seguridad/i.test(combinedText)) {
                matchedAgent = 'ingeniero_quimico_sst';
            } else if (/seguridad vial|vial|pesv|tr[aá]nsito|conductor|veh[ií]cul/i.test(combinedText)) {
                matchedAgent = 'coordinador_seguridad_vial';
            } else if (/psic[oó]log|psicosocial|bater[ií]a|acoso|clima/i.test(combinedText)) {
                matchedAgent = 'psicologo_sst';
            } else if (/salud mental|burnout|emocional|terapeuta/i.test(combinedText)) {
                matchedAgent = 'terapeuta_salud_mental';
            } else if (/nutrici[oó]n|dieta|aliment|cardiovascular/i.test(combinedText)) {
                matchedAgent = 'nutricionista_laboral';
            } else if (/primer respondiente|primeros auxilios|rcp|botiqu[ií]n|hemorragia/i.test(combinedText)) {
                matchedAgent = 'primer_respondiente';
            } else if (/emergencia|brigada|simulacro|pae|evacuaci[oó]n/i.test(combinedText)) {
                matchedAgent = 'coordinador_emergencias';
            } else if (/bioseguridad|biol[oó]gic|vacun|pgirh/i.test(combinedText)) {
                matchedAgent = 'especialista_bioseguridad';
            } else if (/el[eé]ctric|retie|loto|arco el[eé]ctrico/i.test(combinedText)) {
                matchedAgent = 'ingeniero_electricista_sst';
            } else if (/\bats\b|an[aá]lisis de trabajo seguro/i.test(combinedText)) {
                matchedAgent = 'asistente_ats';
            } else if (/permiso.*tsa|permiso.*alturas|permiso de trabajo/i.test(combinedText)) {
                matchedAgent = 'asistente_permiso_tsa';
            } else if (/tareas cr[ií]ticas|alturas|espacios confinados|caliente|excavaci[oó]n/i.test(combinedText)) {
                matchedAgent = 'coordinador_tareas_criticas';
            } else if (/minas|miner[ií]a|subterr[aá]nea|t[uú]nel/i.test(combinedText)) {
                matchedAgent = 'ingeniero_minas_sst';
            } else if (/ipevar|gtc.*45|matriz de peligro/i.test(combinedText)) {
                matchedAgent = 'coordinador_ipevar';
            } else if (/creador.*formato|formatos sst|plantilla sst/i.test(combinedText)) {
                matchedAgent = 'creador_formatos';
            } else if (/\baci\b|or[aá]culo.*aci|predictivo aci/i.test(combinedText)) {
                matchedAgent = 'asistente_de_aci';
            } else if (/auditor|0312|est[aá]ndares|phva/i.test(combinedText)) {
                matchedAgent = 'auditor_sg_sst';
            } else if (/ambiental|residuos|vertimiento|ecol[oó]g/i.test(combinedText)) {
                matchedAgent = 'ingeniero_ambiental';
            } else if (/clim[aá]tic|estr[eé]s t[eé]rmico|radiaci[oó]n|uv/i.test(combinedText)) {
                matchedAgent = 'especialista_riesgo_climatico';
            } else if (/redactor|blog|art[ií]culo/i.test(combinedText)) {
                matchedAgent = 'redactor_creativo';
            } else if (/simulador|siniestro|accidente|causa ra[ií]z/i.test(combinedText)) {
                matchedAgent = 'simulador_accidentes';
            } else if (/capacitaci[oó]n|pac|inducci[oó]n/i.test(combinedText)) {
                matchedAgent = 'coordinador_capacitaciones';
            } else if (/profesional sst/i.test(combinedText)) {
                matchedAgent = 'profesional_sst';
            } else if (/consultor sst|asesor sst/i.test(combinedText)) {
                matchedAgent = 'agente_sst';
            }

            if (matchedAgent) {
                // Extraer la pregunta o consulta formulada por el usuario
                let pregunta = '';
                const qMatch = userText.match(/(preg[uú]ntale\s+(que\s+)?|pregunta\s+(que\s+)?|dile\s+(que\s+)?|sobre\s+|acerca de\s+)(.+)/i);
                if (qMatch && qMatch[4]) {
                    pregunta = qMatch[4].trim();
                } else if (userText.length > 8) {
                    pregunta = userText;
                }

                logger.info(`[VoiceSession] [Tenshi Voice Failsafe] Gemini omitted toolCall! Dispatching wappy_abrir_chat_agente: ${matchedAgent}, pregunta: "${pregunta}"`);
                this.sendToClient({
                    type: 'wappy_action',
                    data: {
                        id: `failsafe-agent-${Date.now()}`,
                        name: 'wappy_abrir_chat_agente',
                        args: {
                            agente: matchedAgent,
                            pregunta: pregunta
                        }
                    }
                });
                return;
            }
        }

        // 2. Detección de intención de navegación
        const navIntentRegex = /(ll[eé]vame|vamos|abre|abrir|ir a|mu[eé]strame|ver|consultar|quiero ver)/i;
        if (navIntentRegex.test(userText) || /vamos a|te llevo a|abriendo/i.test(aiText)) {
            let targetModulo = null;
            let targetRuta = null;

            if (/admin.*curso|gesti[oó]n.*curso|administrar curso/i.test(combinedText)) {
                targetModulo = 'training_admin';
                targetRuta = '/training/admin';
            } else if (/admin.*ruta|administrar ruta/i.test(combinedText)) {
                targetModulo = 'ruta_admin';
                targetRuta = '/ruta-aprendizaje/admin';
            } else if (/admin.*evento|admin.*meet/i.test(combinedText)) {
                targetModulo = 'events_meet_admin';
                targetRuta = '/events-meet/admin';
            } else if (/evento|clase en vivo|meet/i.test(combinedText)) {
                targetModulo = 'events_meet';
                targetRuta = '/events-meet';
            } else if (/admin.*blog|crear art[ií]culo|nuevo art[ií]culo/i.test(combinedText)) {
                targetModulo = 'blog_admin';
                targetRuta = '/blog/admin';
            } else if (/admin.*tenshi|panel tenshi/i.test(combinedText)) {
                targetModulo = 'tenshi_admin';
                targetRuta = '/tenshi/admin';
            } else if (/chat.*sst|chat sst/i.test(combinedText)) {
                targetModulo = 'chat_sst';
                targetRuta = '/chat-sst';
            } else if (/dashboard.*[aá]nimo|anal[ií]tica.*[aá]nimo/i.test(combinedText)) {
                targetModulo = 'animo_dashboard';
                targetRuta = '/sgsst/animo';
            } else if (/hoja de ruta|roadmap/i.test(combinedText)) {
                targetModulo = 'roadmap';
                targetRuta = '/hoja-de-ruta';
            } else if (/cont[aá]ctanos|contacto|soporte/i.test(combinedText)) {
                targetModulo = 'contactanos';
                targetRuta = '/contactanos';
            } else if (/comunidad/i.test(combinedText)) {
                targetModulo = 'comunidad';
                targetRuta = '/comunidad';
            } else if (/embajador/i.test(combinedText)) {
                targetModulo = 'embajadores';
                targetRuta = '/embajadores';
            } else if (/matriz\b/i.test(combinedText)) {
                targetModulo = 'matriz';
                targetRuta = '/matriz';
            } else if (/academia|curso/i.test(combinedText)) {
                targetModulo = 'academia';
                targetRuta = '/academia?tab=cursos';
            } else if (/blog/i.test(combinedText)) {
                targetModulo = 'blog';
                targetRuta = '/blog';
            } else if (/planes|precios|suscripci[oó]n|tarifas/i.test(combinedText)) {
                targetModulo = 'planes';
                targetRuta = '/planes';
            } else if (/pesv|seguridad vial|veh[ií]culos/i.test(combinedText)) {
                targetModulo = 'vehicles_pesv';
                targetRuta = '/sgsst?hito=hito4&module=vehicles_pesv';
            } else if (/qu[ií]mica|sga|compatibilidad/i.test(combinedText)) {
                targetModulo = 'chemical_registry';
                targetRuta = '/sgsst?hito=hito4&module=chemical_registry';
            } else if (/diagn[oó]stico|evaluaci[oó]n inicial|0312/i.test(combinedText)) {
                targetModulo = 'diagnostico';
                targetRuta = '/sgsst?hito=hito1&module=diagnostico';
            } else if (/responsable sst|asignaci[oó]n responsable/i.test(combinedText)) {
                targetModulo = 'responsable';
                targetRuta = '/sgsst?hito=hito1&module=responsable';
            } else if (/pol[ií]tica sst|objetivos sst/i.test(combinedText)) {
                targetModulo = 'politica';
                targetRuta = '/sgsst?hito=hito1&module=politica';
            } else if (/matriz legal|requisitos legales/i.test(combinedText)) {
                targetModulo = 'legal';
                targetRuta = '/sgsst?hito=hito1&module=legal';
            } else if (/reglamento|rhs|higiene/i.test(combinedText)) {
                targetModulo = 'rhs';
                targetRuta = '/sgsst?hito=hito1&module=rhs';
            } else if (/vulnerabilidad|plan.*emergencia/i.test(combinedText)) {
                targetModulo = 'vulnerabilidad';
                targetRuta = '/sgsst?hito=hito1&module=vulnerabilidad';
            } else if (/perfil.*cargo|profesigrama/i.test(combinedText)) {
                targetModulo = 'perfil_cargo';
                targetRuta = '/sgsst?hito=hito2&module=perfil_cargo';
            } else if (/sociodemogr[aá]fico|perfil socio/i.test(combinedText)) {
                targetModulo = 'perfil_socio';
                targetRuta = '/sgsst?hito=hito2&module=perfil_socio';
            } else if (/condiciones de salud|ex[aá]menes m[eé]dicos/i.test(combinedText)) {
                targetModulo = 'condiciones_salud';
                targetRuta = '/sgsst?hito=hito2&module=condiciones_salud';
            } else if (/participaci[oó]n ipevar|reportar peligro/i.test(combinedText)) {
                targetModulo = 'participacion_ipevar';
                targetRuta = '/sgsst?hito=hito3&module=participacion_ipevar';
            } else if (/peligro|gtc.*45|ipevar/i.test(combinedText)) {
                targetModulo = 'peligros';
                targetRuta = '/sgsst?hito=hito3&module=peligros';
            } else if (/permiso.*alturas|permiso.*tsa/i.test(combinedText)) {
                targetModulo = 'permiso_alturas';
                targetRuta = '/sgsst?hito=hito4&module=permiso_alturas';
            } else if (/\bats\b|an[aá]lisis de trabajo seguro/i.test(combinedText)) {
                targetModulo = 'analisis_trabajo_seguro';
                targetRuta = '/sgsst?hito=hito4&module=analisis_trabajo_seguro';
            } else if (/m[eé]todo owas|owas|ergonom[ií]a laboral/i.test(combinedText)) {
                targetModulo = 'metodo_owas';
                targetRuta = '/sgsst?hito=hito4&module=metodo_owas';
            } else if (/epp|entrega.*epp|dotaci[oó]n/i.test(combinedText)) {
                targetModulo = 'epp_delivery';
                targetRuta = '/sgsst?hito=hito4&module=epp_delivery';
            } else if (/l[ií]nea de vida|ciclo.*altura|arn[eé]s/i.test(combinedText)) {
                targetModulo = 'heights_lifecycle';
                targetRuta = '/sgsst?hito=hito4&module=heights_lifecycle';
            } else if (/capacitaci[oó]n|pac|programa capacitaci[oó]n/i.test(combinedText)) {
                targetModulo = 'capacitaciones';
                targetRuta = '/sgsst?hito=hito5&module=capacitaciones';
            } else if (/ruta.*aprendizaje|lms/i.test(combinedText)) {
                targetModulo = 'ruta_aprendizaje';
                targetRuta = '/sgsst?hito=hito5&module=ruta_aprendizaje';
            } else if (/reporte de actos|condiciones inseguras/i.test(combinedText)) {
                targetModulo = 'reporte_actos';
                targetRuta = '/sgsst?hito=hito5&module=reporte_actos';
            } else if (/app.*builder|constructor.*app|micro.*app/i.test(combinedText)) {
                targetModulo = 'app_builder';
                targetRuta = '/sgsst?hito=hito5&module=app_builder';
            } else if (/estad[ií]sticas|indicadores atel/i.test(combinedText)) {
                targetModulo = 'estadisticas';
                targetRuta = '/sgsst?hito=hito6&module=estadisticas';
            } else if (/investigaci[oó]n.*accidente|[aá]rbol de causas/i.test(combinedText)) {
                targetModulo = 'investigacion_atel';
                targetRuta = '/sgsst?hito=hito6&module=investigacion_atel';
            } else if (/alta direcci[oó]n|revisi[oó]n gerencial/i.test(combinedText)) {
                targetModulo = 'alta_direccion';
                targetRuta = '/sgsst?hito=hito6&module=alta_direccion';
            } else if (/investigaci[oó]n profunda/i.test(combinedText)) {
                targetModulo = 'investigacion_profunda';
                targetRuta = '/sgsst?hito=hito6&module=investigacion_profunda';
            } else if (/auditor[ií]a/i.test(combinedText)) {
                targetModulo = 'auditoria';
                targetRuta = '/auditoria';
            } else if (/predictivo|or[aá]culo/i.test(combinedText)) {
                targetModulo = 'predictivo';
                targetRuta = '/sgsst?hito=hito7&module=predictivo';
            } else if (/videollamada|c[aá]mara|en vivo/i.test(combinedText)) {
                targetModulo = 'live';
                targetRuta = '/live';
            } else if (/agentes|mercado|cat[aá]logo/i.test(combinedText)) {
                targetModulo = 'agents';
                targetRuta = '/agents';
            } else if (/control|kanban|acpm/i.test(combinedText)) {
                targetModulo = 'control_acpm';
                targetRuta = '/sgsst/control';
            }

            if (targetModulo) {
                logger.info(`[VoiceSession] [Tenshi Voice Failsafe] Gemini omitted nav tool call. Dispatching wappy_navegar: ${targetModulo}`);
                this.sendToClient({
                    type: 'wappy_action',
                    data: {
                        id: `failsafe-nav-${Date.now()}`,
                        name: 'wappy_navegar',
                        args: {
                            modulo: targetModulo,
                            ruta: targetRuta
                        }
                    }
                });
            }
        }
    }

    async saveCurrentTurn(source = 'Unknown') {
        const currentUserText = this.userTranscriptionText;
        const currentAiText = this.aiResponseText;
        const currentAudioCount = this.aiAudioChunkCount;

        if (!currentUserText.trim() && !currentAiText.trim() && currentAudioCount === 0) {
            return;
        }

        // On Disconnect, do not save if the AI never started responding (to avoid saving partial/unanswered fragments)
        if (source === 'Disconnect' && !currentAiText.trim() && currentAudioCount === 0) {
            logger.info(`[VoiceSession] [${source}] Discarding unanswered user transcription fragment to prevent chat clutter: "${currentUserText}"`);
            this.userTranscriptionText = '';
            this.aiResponseText = '';
            this.aiAudioChunkCount = 0;
            return;
        }

        // MODO TENSHI: Copiloto oficial en ventana flotante/widget.
        // NUNCA guardar turnos en MongoDB ni crear conversaciones en el sidebar de LibreChat.
        if (this.config.mode === 'tenshi_voice') {
            logger.info(`[VoiceSession] [Tenshi Voice] Turn completed (${source}). User: "${currentUserText}", AI: "${currentAiText}"`);
            this.handleTenshiVoiceFailsafe(currentUserText, currentAiText);
            this.userTranscriptionText = '';
            this.aiResponseText = '';
            this.aiTranscriptionBuffer = '';
            this.aiAudioChunkCount = 0;
            return;
        }

        logger.info(`[VoiceSession] [${source}] Saving pending turn. User: "${currentUserText}", AI: "${currentAiText}", Audio chunks: ${currentAudioCount}`);

        // Reset text and chunk count IMMEDIATELY to prevent multiple saves/race conditions
        this.userTranscriptionText = '';
        this.aiResponseText = '';
        this.aiAudioChunkCount = 0;

        let messagesSaved = false;
        let isNewConversation = false;

        // FASE FAST-TRACK: TRIGGER REPORT GENERATION (Second Brain) IMMEDIATELY
        const currentTurnContext = `Usuario: ${currentUserText}\nAsistente: ${currentAiText}`;
        if (!this.conversationTurns) {
            this.conversationTurns = [];
        }
        this.conversationTurns.push(currentTurnContext);
        // Ventana deslizante: mantener solo los últimos 6 turnos en memoria activa
        if (this.conversationTurns.length > 6) {
            this.conversationTurns.shift();
        }
        this.config.conversationContext = this.conversationTurns.join('\n');

        if (this.isGeneratingReport) {
            logger.info('[VoiceSession] Report generation already in progress. Skipping trigger.');
            this.aiTranscriptionBuffer = '';
        } else {
            // Check BOTH user voice request (including common phonetic STT variations) AND AI keywords
            const userReportRegex = /\b(genera(r)?|haz|compil(a|ar)|dame|quiero|entreg(a|ar)|sacar?)\s+(el\s+|un\s+)?(informe|reporte)\b/i;
            const phoneticApproxRegex = /\b(general)\s+(el\s+|al\s+)?(informe|reporte)\b/i;
            // ONLY match current active compilation phrase, NEVER future promises ("voy a", "procedo a")
            const aiReportRegex = /\b(estoy\s+compilando|generando\s+el\s+informe\s+t[eé]cnico|informe técnico compilado y en pantalla)\b/i;

            const userRequested = userReportRegex.test(currentUserText) || phoneticApproxRegex.test(currentUserText);
            // Require at least 2 turns for AI keyword confirmation to prevent greeting false positives
            const aiConfirmed = (this.conversationTurns && this.conversationTurns.length >= 2) && (aiReportRegex.test(currentAiText) || aiReportRegex.test(this.aiTranscriptionBuffer));
            const shouldGenerateReport = userRequested || aiConfirmed;

            logger.info(`[VoiceSession] Report trigger check. userRequested: ${userRequested} ("${currentUserText}"), aiConfirmed: ${aiConfirmed}, trigger: ${shouldGenerateReport}`);
            this.aiTranscriptionBuffer = ''; // Reset for next turn

            if (shouldGenerateReport) {
                logger.info('[VoiceSession] Report generation triggered by user or AI keywords.');

                if (userRequested && this.geminiClient && this.isActive) {
                    try {
                        this.geminiClient.sendText('INSTRUCCIÓN DE SISTEMA: El usuario ha solicitado generar el informe técnico. Responde en 1 sola frase corta: "Entendido, estoy compilando tu informe técnico ergonómico con las evidencias recopiladas."');
                    } catch (speakErr) {
                        logger.warn('[VoiceSession] Could not send spoken confirmation:', speakErr.message);
                    }
                }
                
                this.sendToClient({
                    type: 'status',
                    data: { status: 'generating_report', message: 'Compilando informe técnico...' }
                });

                this.isGeneratingReport = true;
                this.generateReport(this.config.conversationContext).finally(() => {
                    this.isGeneratingReport = false;
                });
            }
        }

        // Save user message FIRST
        if (currentUserText.trim()) {
            let textToSave = currentUserText.trim();
            // Refine/correct transcription
            textToSave = await this.correctTranscription(textToSave, currentAiText.trim() || '🎤 [Respuesta de voz]');

            // Filter out isolated cut-off fragments (e.g. "¿Es", "y", "el") that aren't valid standalone utterances
            const stripped = textToSave.replace(/^[¿¡?!\s,.]+|[¿¡?!\s,.]+$/g, '').trim().toLowerCase();
            const validShortWords = new Set(['sí', 'si', 'no', 'ya', 'ok', 'va', 'voy', 'paz', 'fin']);
            const isInvalidFragment = stripped.length <= 3 && !validShortWords.has(stripped);

            if (!isInvalidFragment && textToSave.length > 0) {
                const result = await this.saveUserMessage(textToSave);
                if (result) {
                    messagesSaved = true;
                    isNewConversation = result.isNewConversation;
                }
            } else {
                logger.info(`[VoiceSession] Discarded short/cut-off user transcription fragment: "${textToSave}"`);
            }
        }

        // Save AI response AFTER user message
        if (currentAiText.trim()) {
            await this.saveAiMessage(currentAiText.trim());
            messagesSaved = true;
        } else if (currentAudioCount > 0) {
            await this.saveAiMessage('🎤 [Respuesta de voz]');
            messagesSaved = true;
        }

        if (messagesSaved) {
            try {
                await saveConvo({ user: { id: this.userId } }, {
                    conversationId: this.conversationId,
                    endpoint: this.dbEndpoint,
                    model: this.dbModel,
                    ...(this.config.mode === 'live_analysis' ? { tags: ['sgsst-live-analysis'] } : {})
                }, { context: `VoiceSession - ${source}` });

                if (isNewConversation) {
                    this.sendToClient({
                        type: 'conversationId',
                        data: { conversationId: this.conversationId }
                    });
                }

                this.sendToClient({
                    type: 'conversationUpdated',
                    data: { conversationId: this.conversationId }
                });
            } catch (error) {
                logger.error('[VoiceSession] Error updating conversation:', error);
            }
        }
    }

    async stop() {
        if (!this.isActive) return;
        this.isActive = false;

        logger.info(`[VoiceSession] Stopping session for user: ${this.userId}...`);

        try {
            await this.saveCurrentTurn('Disconnect');
        } catch (saveError) {
            logger.error('[VoiceSession] Error saving pending turn on stop:', saveError);
        }

        this.userTranscriptionText = '';
        this.aiResponseText = '';

        if (this.geminiClient) {
            try {
                this.geminiClient.disconnect();
            } catch (err) {
                logger.error('[VoiceSession] Error disconnecting geminiClient:', err);
            }
            this.geminiClient = null;
        }

        // Remove from active sessions
        if (activeSessions.has(this.userId)) {
            activeSessions.delete(this.userId);
        }

        logger.info(`[VoiceSession] Stopped for user: ${this.userId}`);
    }
}

/**
 * Create a new voice session for a user
 * @param {WebSocket} clientWs
 * @param {string} userId
 * @param {string} conversationId
 * @param {string|Object} configOrVoice - Initial voice name (string) or full config object
 */
async function createSession(clientWs, userId, conversationId, configOrVoice = null) {
    try {
        // Check if user already has active session
        if (activeSessions.has(userId)) {
            logger.warn(`[VoiceSession] User ${userId} already has active session`);
            const existingSession = activeSessions.get(userId);
            await existingSession.stop();
        }

        // Get user's Google API key
        const apiKey = await getUserKey({ userId, name: EModelEndpoint.google });

        if (!apiKey) {
            throw new Error('Google API Key not configured');
        }

        // Parse API key if stored as JSON
        let parsedKey = apiKey;
        try {
            const parsed = JSON.parse(apiKey);
            parsedKey = parsed.GOOGLE_API_KEY || parsed;
        } catch (e) {
            // Key is not JSON, use as-is
        }

        if (!parsedKey) {
            throw new Error('Google API Key not configured');
        }

        // Split by comma for rotation support
        const apiKeys = typeof parsedKey === 'string' ? parsedKey.split(',').map(k => k.trim()).filter(Boolean) : [parsedKey];

        if (apiKeys.length === 0) {
            throw new Error('No valid Google API Keys found after parsing');
        }

        // Create session
        let config = {};
        if (configOrVoice) {
            if (typeof configOrVoice === 'string') {
                config.voice = configOrVoice;
                logger.info(`[VoiceSession] Initializing with voice: ${configOrVoice} `);
            } else if (typeof configOrVoice === 'object') {
                config = configOrVoice;
                logger.info(`[VoiceSession] Initializing with custom config`);
            }
        }

        // MODO TENSHI VOICE: Orquestadora oficial de WAPPY IA con control de plataforma
        if (config.mode === 'tenshi_voice') {
            logger.info(`[VoiceSession] Initializing Tenshi Voice Mode (Orchestrator, platform control enabled)`);
            const agentObj = {
                id: 'tenshi',
                name: 'Tenshi',
                instructions: 'Orquestadora y Guía Oficial de WAPPY IA'
            };
            const session = new VoiceSession(clientWs, userId, apiKeys, config, conversationId);
            session.agentObj = agentObj;
            session.isBiomechanics = false;
            session.agentProtocol = { id: 'tenshi', title: 'Tenshi Orquestadora', methodLabel: 'Orquestación WAPPY' };

            const result = await session.start();

            if (result.success) {
                activeSessions.set(userId, session);
                return { success: true, session };
            } else {
                return { success: false, error: result.error };
            }
        }

        // Load agent prompt/instructions if applicable
        let agentId = config.agentId;
        if (!agentId && conversationId && conversationId !== 'new') {
            try {
                const { getConvo } = require('~/models');
                const convo = await getConvo({ user: userId }, conversationId);
                if (convo && convo.agent_id) {
                    agentId = convo.agent_id;
                }
            } catch (convoError) {
                logger.error('[VoiceSession] Error loading conversation details:', convoError);
            }
        }

        let agentObj = null;
        if (agentId) {
            try {
                const { getAgent } = require('~/models/Agent');
                agentObj = await getAgent({ id: agentId });
                if (!agentObj) {
                    const { Agent } = require('~/db/models');
                    agentObj = await Agent.findOne({ $or: [{ id: agentId }, { _id: agentId }] }).lean();
                }
            } catch (agentError) {
                logger.error('[VoiceSession] Error loading agent details:', agentError);
            }
        }

        if (!agentObj) {
            try {
                const { Agent } = require('~/db/models');
                // Check if user is in biomechanics / fisioterapeuta mode or template
                const wantsBiomechanics = config.mode === 'live_analysis' || 
                                          config.template === 'biomecanico_mediapipe';
                if (wantsBiomechanics) {
                    agentObj = await Agent.findOne({
                        $or: [
                            { name: /biomec[aá]nic/i },
                            { name: /fisioterapeuta/i },
                            { name: /ergon/i }
                        ]
                    }).lean();
                }
            } catch (err) {
                logger.warn('[VoiceSession] Could not fallback find agent in DB:', err.message);
            }
        }

        // Bulletproof fallback: Load local markdown instructions if agentObj still lacks instructions
        if (!agentObj || !agentObj.instructions) {
            try {
                const fs = require('fs');
                const path = require('path');
                const fisioPath = path.resolve(process.cwd(), 'Agentes/Agentes Wappy/fisioterapeuta_laboral.md');
                if (fs.existsSync(fisioPath)) {
                    const content = fs.readFileSync(fisioPath, 'utf-8');
                    agentObj = {
                        name: 'Especialista en Biomecánica Laboral',
                        instructions: content,
                    };
                    logger.info('[VoiceSession] Successfully loaded Fisioterapeuta instructions from local markdown file');
                }
            } catch (mdErr) {
                logger.warn('[VoiceSession] Could not load markdown fallback:', mdErr.message);
            }
        }

        // Dynamic Inspection Protocol Resolution across all WAPPY Agent Families
        const agentProtocol = resolveInspectionProtocol(agentObj?.name || config.template || 'biomecanico');
        const isBiomechanics = agentProtocol.id === 'biomecanico' ||
            (agentObj && /biomec|fisioterapeuta|ergon|rosa|ipt/i.test(agentObj.name)) ||
            config.template === 'biomecanico_mediapipe';

        logger.info(`[VoiceSession] Live session configured with Agent: ${agentObj?.name || agentId || 'General'} (Protocol: ${agentProtocol.title}, isBiomechanics: ${isBiomechanics})`);

        // Load agent skills and clean core instructions
        const skillsContent = getAgentSkillsContent(agentObj, isBiomechanics);
        const cleanedInstructions = cleanAgentInstructions(agentObj?.instructions);

        // Build rich domain expertise based on agent's real knowledge and skills
        let domainKnowledge = '';
        if (isBiomechanics) {
            domainKnowledge = `
ROL: Eres el Fisioterapeuta Laboral y Especialista en Biomecánica de WAPPY IA.
PROPÓSITO:
Asesorar en vivo mediante visión artificial y voz en la prevención de desórdenes musculoesqueléticos, higiene postural y evaluación ergonómica integral de puestos de trabajo (oficinas, pantallas, teletrabajo o labores operativas).

DIRECTIVA DE LIDERAZGO ACTIVO Y EVALUACIÓN PASO A PASO (OBLIGATORIO):
No actúes como un chatbot pasivo que solo espera preguntas o suelta recomendaciones sueltas. TÚ DIRIGES LA EVALUACIÓN ERGONÓMICA EN CAMPO:
1. Toma el control desde tu primer saludo:
   - PASO PREVIO OBLIGATORIO (IDENTIFICACIÓN DEL TRABAJADOR Y PUESTO - ANTES DE INICIAR FASES):
     En tu primer turno, saluda con calidez y solicita en un solo mensaje fluido:
     "¡Hola! Soy tu Especialista en Ergonomía y Fisioterapeuta Laboral en WAPPY IA. Para vincular este estudio ergonómico al expediente oficial de la empresa, por favor confírmame:
      1. ¿Es una auto-evaluación de tu propio puesto o estás evaluando a un compañero?
      2. Nombre completo y número de cédula del trabajador evaluado.
      3. Cargo y una breve descripción de la actividad cotidiana a evaluar."
     REGLA ESTRICTA: NUNCA inicies el Paso 1 ni pidas adoptar posturas antes de recibir el nombre completo y cédula del trabajador. Si el usuario te responde solo el cargo o actividad sin su nombre o cédula, pídeselos amablemente antes de iniciar.
   - INICIO DE FASES (AL RECIBIR LA IDENTIFICACIÓN COMPLETA):
     Valida cordialmente en una sola frase breve (ej: "¡Perfecto! Expediente preparado para [Nombre del Trabajador]") y da inicio inmediato al Paso 1 llamando a 'cambiar_fase_evaluacion' con fase: 1.
   - REGLA DE ORO DE CAPTURA Y CAMBIO DE FASES (NO CAPTURAR SOLO):
     NUNCA asumas que la postura ya fue adoptada ni avances de fase por tu cuenta antes de tiempo. Para cada paso:
     1. Pide al usuario adoptar la postura correspondiente (Paso 1: Postura habitual digitando; Paso 2: Alcance crítico o tarea más exigente; Paso 3: Postura fatigada o soporte lumbar).
     2. Indica SIEMPRE al final de tu instrucción: "Cuando estés en la postura, avísame diciendo 'Listo', 'Ya' o presiona el botón de la cámara para registrarla."
     3. ESPERA OBLIGATORIAMENTE la confirmación del usuario ("Listo", "Ya", "Adelante", "Ya tomé la postura") o a que el sistema te notifique que el usuario tomó la foto con el botón de la cámara.
     4. Al recibir la confirmación o foto de evidencia, valida brevemente en 1 frase los grados medidos en la telemetría y guía la siguiente fase invocando 'cambiar_fase_evaluacion'.
2. En cada fase, utiliza la telemetría articular (grados de cuello, tronco, brazos) para darle retroalimentación en vivo sobre lo que ves.
3. Al culminar las 3 fases, ofrece compilar el informe técnico oficial e invoca 'generar_informe_tecnico' en cuanto el usuario lo apruebe.

EVALUACIÓN DE PUESTO DE TRABAJO (IPT / OFICINA / PANTALLAS):
Cuando el usuario te muestre su puesto de trabajo o solicite una inspección/evaluación de su puesto:
1. PANTALLA: Verifica que el borde superior esté a la altura de los ojos, a 50-70 cm de distancia (longitud de un brazo), centrada directamente al frente para no rotar el cuello.
2. SILLA: Verifica soporte lumbar, altura adecuada para que los pies descansen completamente planos en el piso con rodillas a 90°-100° (o necesidad de reposapiés), y apoyabrazos alineados con la mesa para descansar antebrazos.
3. TECLADO Y RATÓN: Verifica codos a 90° cerca del cuerpo, antebrazos apoyados y muñecas en posición neutra recta (sin flexión forzada ni extensión).
4. POSTURA DEL TRABAJADOR: Evalúa flexión de cuello, inclinación del tronco y relajación de hombros.

ÁRBOL DE DECISIÓN Y SELECCIÓN DE MÉTODOS ERGONÓMICOS:
- MÉTODO RULA y MÉTODO ROSA: Actívalos cuando el trabajo sea sentado, oficina, pantalla (PVD) o ensamble fino centrado en miembros superiores (cuello, hombros, brazos, muñecas) y mobiliario (silla, pantalla, teclado, mouse).
- MÉTODO REBA: Actívalo para labores de pie, con flexión de tronco profunda, manipulación de cargas o posturas forzadas de cuerpo completo.
- MÉTODO OWAS: Actívalo para labores dinámicas con alta variabilidad de posturas en ciclos de trabajo cambiantes.
- MODULADORES: Ecuación NIOSH para levantamiento repetido de cargas (>3 kg) y JSI/OCRA para movimientos repetitivos de muñeca (>30 acciones/min).

TELEMETRÍA ARTICULAR EN TIEMPO REAL (MEDIAPIPE):
- Cuello (Flexión cervical): Normal <15°, Alerta 15°-25°, Crítico >25°.
- Tronco (Flexión lumbar): Normal <10°, Alerta 10°-20°, Crítico >20°.
- Brazos (Abducción/Elevación): Normal <20°, Alerta 20°-45°, Crítico >45°.
- Codos y Rodillas: Rango neutro 90°-100°.
Explica oralmente y con claridad el hallazgo biomecánico observado en la cámara y cómo corregirlo físicamente de inmediato.

PAUTAS DE ENCUADRE Y MULTIFASE:
- Si el usuario usa portátil/webcam y se corta el cuerpo: Sugiérele amablemente inclinar un poco la pantalla a 45° o dar un paso atrás.
- Si un compañero está grabando con celular: Sugiérele ubicarse en plano lateral (perfil a 90°) a la altura de la cintura.
- CERO INTERROGATORIOS: No preguntes quién graba ni qué dispositivo usa ni hagas cuestionarios de empresa. Observa directamente y evalúa.

${cleanedInstructions ? `\nINSTRUCCIONES Y NORMATIVIDAD DEL AGENTE:\n${cleanedInstructions.substring(0, 1500)}\n` : ''}
GENERACIÓN DEL INFORME TÉCNICO: Cuando el usuario te pida generar, hacer o sacar el informe, reporte o resumen técnico ("haz el informe", "genera el informe", "dame el reporte", "quiero el informe"), DEBES INVOCAR la función 'generar_informe_tecnico'. Mientras se procesa, confirma en una sola frase breve: "Listo, procesando las evidencias bajo el método seleccionado para generar el informe técnico ergonómico." NUNCA invoques 'generar_informe_tecnico' durante el saludo inicial ni antes de evaluar los puestos.`;
        } else {
            domainKnowledge = `
ROL: Eres el asistente especialista "${agentObj?.name || agentProtocol.title}" de WAPPY IA.
ESPECIALIDAD TÉCNICA Y MARCO NORMATIVO: ${agentProtocol.methodLabel} (${agentProtocol.normRef}).
CAPACIDADES: Videollamada interactiva en vivo con visión artificial y auditoría técnica de campo asistida en tiempo real.

PAUTAS DE INSPECCIÓN:
${agentProtocol.framingGuidance}

FASES DE VERIFICACIÓN TÉCNICA:
${agentProtocol.phaseGuidance}

${skillsContent ? `\nCONOCIMIENTO DE SKILLS DEL AGENTE:\n${skillsContent}\n` : ''}
${cleanedInstructions ? `\nINSTRUCCIONES Y NORMATIVIDAD DEL AGENTE:\n${cleanedInstructions.substring(0, 3000)}\n` : `CRITERIOS TÉCNICOS: ${agentProtocol.title}`}`;
        }

        // Live interaction directives
        config.systemInstruction = `
${domainKnowledge}

[DIRECTIVAS DE INTERACCIÓN EN VIVO POR VOZ Y VIDEO]:
1. **IDIOMA EXCLUSIVO: ESPAÑOL.** El usuario y tú se comunican SIEMPRE en español de Colombia/Latinoamérica. NUNCA respondas, transcribas ni traduzcas en árabe, inglés ni ningún otro idioma. Todo lo que dice el usuario está en español.
2. **SALUDO INICIAL Y PASO PREVIO OBLIGATORIO (IDENTIFICACIÓN COMPLETA DEL TRABAJADOR):** En tu primera intervención saluda cordialmente y PREGUNTA de inmediato: "¿Es una auto-evaluación de tu propio puesto o evalúas a un compañero? Confírmame tu nombre completo, número de cédula, cargo y qué actividad principal realizas." NUNCA invoques herramientas de informe en el saludo y NUNCA pidas posturas en tu primer turno. Si el usuario no te da su nombre o cédula, insiste amablemente en pedirlos antes de pasar al Paso 1 para poder vincular el expediente oficial de la empresa.
3. **CONDUCE LA EVALUACIÓN TRAS EL CONTEXTO:** Una vez que el usuario te responda indicando su nombre, cédula, cargo y actividad, valida en una sola frase breve y entusiasta (ej: "¡Perfecto! Expediente preparado para [Nombre]") y da inicio al Paso 1 (Postura Habitual / Línea Base), invocando de inmediato la herramienta 'cambiar_fase_evaluacion' con fase: 1.
   **REGLA DE CAPTURA Y TRANSICIÓN:** En cada paso, explica la postura y solicita al usuario confirmar diciendo "Listo", "Ya" o pulsando el botón de la cámara. NUNCA avances de fase ni captures la imagen solo; espera siempre la confirmación del usuario ("Listo", "Ya", "Adelante") o el aviso del botón de captura antes de avanzar al siguiente paso.
4. **RETROALIMENTACIÓN BIOMECÁNICA PRECISA:** Menciona los ángulos articulares medidos en cámara (cuello, tronco, brazos) y brinda correcciones físicas inmediatas.
5. **CERO CUESTIONARIOS ADMINISTRATIVOS ADICIONALES:** Prohibido preguntar por ARL, tamaño de empresa o porcentajes de implementación. Limítate exclusivamente a preguntar cargo y actividad al inicio y luego concéntrate en la observación de campo.
6. **RESPUESTAS HABLADAS CONCISAS:** Respuestas habladas claras y pedagógicas (2 a 4 oraciones por turno). Sin formato Markdown ni HTML en voz.
7. **GENERACIÓN DE INFORME:** NUNCA generes el informe durante el saludo ni en los pasos 1 o 2. Solo debes invocar 'generar_informe_tecnico' al concluir las 3 fases O cuando el usuario te ordene explícitamente generar el informe ('haz el informe', 'genera el reporte', 'dame el informe').
`.trim();
        
        // Pass the array of keys to VoiceSession
        const session = new VoiceSession(clientWs, userId, apiKeys, config, conversationId);
        session.agentObj = agentObj;
        session.agentProtocol = agentProtocol;
        session.isBiomechanics = isBiomechanics;

        // Start session
        const result = await session.start();

        if (result.success) {
            activeSessions.set(userId, session);
            return { success: true, session };
        } else {
            return { success: false, error: result.error };
        }

    } catch (error) {
        logger.error('[VoiceSession] Error creating session:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get active session for user
 */
function getSession(userId) {
    return activeSessions.get(userId);
}

/**
 * Stop session for user
 */
async function stopSession(userId) {
    const session = activeSessions.get(userId);
    if (session) {
        await session.stop();
        return true;
    }
    return false;
}

module.exports = {
    VoiceSession,
    createSession,
    getSession,
    stopSession,
    activeSessions,
};
