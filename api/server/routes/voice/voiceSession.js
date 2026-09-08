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
const { buildSignatureSection } = require('../sgsst/reportHeader');
const fs = require('fs');
const path = require('path');
const SKILLS_DIR = path.resolve(__dirname, '../../../config/skills');
const { resolveInspectionProtocol, INSPECTION_PROTOCOLS } = require('./inspectionProtocols');

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
        this.agentObj = null;
        this.isBiomechanics = false;

        logger.info(`[VoiceSession] Created for user: ${userId}, conversationId: ${conversationId || 'NULL'}`);

        // Modo Tenshi: Asistente oficial con control de plataforma por voz
        if (this.config.mode === 'tenshi_voice') {
            this.liveConfig.voice = this.config.voice || 'Aoede';
            this.liveConfig.tools = [
                {
                    functionDeclarations: [
                        {
                            name: "wappy_navegar",
                            description: "Navega a un módulo o vista de la plataforma WAPPY (ej: perfiles de cargo, huella biocéntrica, motor bio-individual, sgsst general, planes, matriz ipevar, matriz pesv, academia, blog, control acpm, automatizaciones).",
                            parameters: {
                                type: "object",
                                properties: {
                                    modulo: {
                                        type: "string",
                                        description: "Nombre de la sección destino (ej: 'perfiles_cargo', 'bio_motor', 'sgsst', 'planes', 'ipevar', 'pesv', 'quimicos', 'academia', 'blog', 'control')"
                                    },
                                    ruta: {
                                        type: "string",
                                        description: "Ruta URL interna opcional (ej: '/sgsst?super=bio_motor', '/planes', '/sgsst/control')"
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
                        }
                    ]
                }
            ];

            this.liveConfig.systemInstruction = `Eres Tenshi, la IA estrella, guía oficial y orquestadora de WAPPY IA. Administras la plataforma central Somos SST. 
Tienes acceso en vivo para hablar por voz con el usuario y controlar la pantalla de WAPPY en tiempo real mientras el usuario la observa.

REGLAS DE INTERACCIÓN EN VIVO:
1. **CONCISIÓN Y FLUIDEZ ORAL:** Responde siempre en español conversacional, fresco, empático y natural con el toque amable y cercano de Tenshi ("parce", "listo", "de una", "hágale"). Habla en 1 o 2 oraciones cortas por turno para mantener un diálogo dinámico. Cero monólogos largos.
2. **ACCIÓN INMEDIATA EN PANTALLA:** Si el usuario te pide navegar o realizar una acción (ej: "ve a perfiles de cargo", "activa la empresa X", "ayúdame a configurar un plan"), invoca inmediatamente la herramienta adecuada ('wappy_navegar', 'wappy_seleccionar_empresa', 'operar_interfaz_visual') para que la pantalla se mueva en vivo mientras le confirmas brevemente con tu voz lo que acabas de hacer.
3. **RESPETO DE RESTRICCIONES:** Si el usuario te dice "no edites nada solo ayúdame a configurar...", respeta estrictamente su instrucción: navega y ayúdale a visualizar o estructurar el plan sin modificar datos preexistentes.
4. **INTERRUPCIÓN:** Si el usuario empieza a hablarte mientras estás respondiendo, detente de inmediato y atiende su nueva indicación.`;
        } else {
            // Herramientas nativas para agentes SST y Fisioterapeuta Laboral
            const reportTool = {
                name: "generar_informe_tecnico",
                description: "Genera inmediatamente el informe técnico ergonómico o de riesgos SST con las evidencias fotográficas y mediciones recopiladas en vivo. DEBES llamar obligatoriamente a esta función siempre que el usuario te pida directa o indirectamente hacer, compilar, crear, generar o entregar el informe, reporte o resumen técnico (ej: 'haz el informe', 'genera el informe', 'dame el reporte ergonómico', 'quiero el informe').",
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

            this.liveConfig.tools = [
                {
                    functionDeclarations: [reportTool]
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
            // Accumulate user text for saving
            this.userTranscriptionText += text;
            // ✅ FIX: Send user transcription to client in real-time for HUD display
            this.sendToClient({
                type: 'text',
                data: { text, isUserTranscription: true }
            });

            // Fast-track real-time voice report trigger (only on explicit user command to generate report)
            if (!this.isGeneratingReport) {
                const userReportRegex = /\b(genera(r)?|haz|compil(a|ar)|dame|quiero|entreg(a|ar)|sacar?)\s+(el\s+|un\s+)?(informe|reporte)\b/i;
                const phoneticApproxRegex = /\b(general)\s+(el\s+|al\s+)?(informe|reporte)\b/i;
                if (userReportRegex.test(this.userTranscriptionText) || phoneticApproxRegex.test(this.userTranscriptionText)) {
                    logger.info(`[VoiceSession] Real-time voice trigger matched in user transcription: "${this.userTranscriptionText}"`);
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
            this.aiTranscriptionBuffer += text; // ← NEW
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

            if (toolCall.functionCalls) {
                for (const fc of toolCall.functionCalls) {
                    // Manejo directo de herramienta nativa de informe
                    if (fc.name === 'generar_informe_tecnico' || fc.name === 'generar_informe_ergonomico') {
                        logger.info(`[VoiceSession] Gemini invoked native tool "${fc.name}"! Triggering report generation...`);
                        
                        this.sendToClient({
                            type: 'status',
                            data: { status: 'generating_report', message: 'Compilando informe técnico...' }
                        });

                        if (this.geminiClient) {
                            this.geminiClient.sendToolResponse([{
                                id: fc.id,
                                name: fc.name,
                                response: { result: "Informe técnico compilado y mostrado en pantalla con éxito. Informa brevemente al usuario que su informe ergonómico está listo en pantalla." }
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
            await this.saveCurrentTurn('TurnComplete');
            logger.info('[VoiceSession] ========== END TURN ==========');
        });

        // Listen for Interrupted (User Barge-In)
        this.geminiClient.on('interrupted', () => {
            logger.info('[VoiceSession] ========== USER INTERRUPTED RESPONSE ==========');
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
                    logger.info(`[VoiceSession] Received evidence payload (has image: ${!!data.image}, has text: ${!!data.text})`);
                    
                    if (data.image) {
                        // Let the model know about this image: set it as the latestFrame 
                        // so that if the user asks about it, the model has the context.
                        this.latestFrame = data.image;
                    }

                    const isTelemetry = !!data.text;
                    const text = data.text || "Fotos de evidencia";

                    // Build message content
                    const messageContent = [
                        { type: 'text', text }
                    ];

                    if (isTelemetry) {
                        if (data.image) {
                            const imageUrl = data.image.startsWith('data:') ? data.image : `data:image/jpeg;base64,${data.image}`;
                            messageContent.push({
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl
                                }
                            });
                        }
                    } else {
                        // Manual evidence photo: group it in manualEvidences
                        if (!this.manualEvidences) {
                            this.manualEvidences = [];
                        }
                        if (data.image) {
                            this.manualEvidences.push(data.image);
                        }
                        // Keep up to 10 manual evidence photos
                        if (this.manualEvidences.length > 10) {
                            this.manualEvidences.shift();
                        }

                        for (const img of this.manualEvidences) {
                            const imageUrl = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
                            messageContent.push({
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl
                                }
                            });
                        }
                    }

                    try {
                        let conversationId = this.conversationId;
                        let isNewConvo = false;
                        if (!conversationId || conversationId === 'new') {
                            conversationId = uuidv4();
                            this.conversationId = conversationId;
                            isNewConvo = true;
                        }

                        if (!isTelemetry && this.activeEvidenceMessageId) {
                            // Update existing grouped message (only for manual photos)
                            const messageData = {
                                messageId: this.activeEvidenceMessageId,
                                content: messageContent
                            };
                            await updateMessage({ user: { id: this.userId } }, messageData, { context: 'VoiceSession - Evidence Update' });
                            logger.info(`[VoiceSession] Updated manual evidence image to grouped message: ${this.activeEvidenceMessageId}`);
                        } else {
                            // Create new message (for telemetry, or for the first manual photo)
                            const messageId = uuidv4();
                            const messageData = {
                                messageId,
                                conversationId,
                                parentMessageId: this.lastMessageId,
                                text,
                                content: messageContent,
                                user: this.userId,
                                sender: 'User',
                                isCreatedByUser: true,
                                endpoint: this.dbEndpoint,
                                model: this.dbModel,
                            };

                            const savedMessage = await saveMessage({ user: { id: this.userId } }, messageData, { context: 'VoiceSession - Evidence Save' });
                            if (savedMessage) {
                                if (!isTelemetry) {
                                    this.activeEvidenceMessageId = messageId;
                                }
                                this.lastMessageId = messageId;
                                logger.info(`[VoiceSession] Saved new ${isTelemetry ? 'telemetry' : 'manual'} evidence message: ${messageId}`);
                            }
                        }

                        // Send to Gemini Live silently if it's a telemetry alert
                        if (isTelemetry && this.geminiClient) {
                            this.geminiClient.sendImageWithText(data.image || null, data.text, false);
                        }

                        // Notify client of conversationId if it was new
                        if (isNewConvo) {
                            this.sendToClient({
                                type: 'conversationId',
                                data: { conversationId: this.conversationId }
                            });
                        }

                        // Always notify client that conversation was updated, so it can invalidate cache/refresh chat feed
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
                    // Append user text for database saving
                    this.userTranscriptionText += (this.userTranscriptionText ? '\n' : '') + data.text;
                    
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

                // Save message to database if conversationId is present
                if (this.conversationId) {
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
        if (!text) return null;

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
        if (!this.conversationId || !text) return;

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
     * Correct user transcription using Gemini Flash Lite
     */
    async correctTranscription(userText, aiResponseText) {
        try {
            if (!userText || userText.trim().length <= 3) {
                return userText;
            }
            logger.info(`[VoiceSession] Starting transcription correction for: "${userText}"`);

            // Use Gemini 3.5 Flash for high performance voice transcription corrections
            const correctionModelName = 'gemini-3.5-flash';

            const prompt = `
            Eres un corrector ortográfico y gramatical experto en español, especializado en Seguridad y Salud en el Trabajo (SST/HSE).
            Tu tarea es corregir y pulir los errores fonéticos o de puntuación de la transcripción de voz para hacerla fluida y profesional.

            ÚLTIMA INTERVENCIÓN:
            """
            ${(aiResponseText || '').substring(0, 250)}
            """

            TRANSCRIPCIÓN DE VOZ A CORREGIR:
            """
            ${userText}
            """

            REGLAS DE ORO:
            1. MANTÉN ESTRICTAMENTE EL TEXTO EN ESPAÑOL. Está absolutamente prohibido traducir cualquier palabra al inglés.
            2. Reconoce y respeta siglas y términos de SST como: "SST", "EPP", "RULA", "REBA", "GTC 45", "ISO 45001", "Decreto 1072", "LOTO", "línea de vida", "arnés", "dieléctrico", etc.
            3. Si el texto original está en español correcto, devuélvelo tal cual sin inventar nada.
            4. Si la transcripción es ininteligible o muy corta (ej: "hola"), devuélvela exactamente igual.
            5. DEVUELVE ÚNICA Y EXCLUSIVAMENTE EL TEXTO CORREGIDO. Sin explicaciones, introducciones ni despedidas.
            `;

            const result = await generateWithKeyRotation(correctionModelName, this.userId, prompt);
            const correctedText = result.response.text().trim();

            logger.info(`[VoiceSession] Transcription correction result: "${userText}" -> "${correctedText}"`);
            return correctedText;
        } catch (error) {
            logger.error('[VoiceSession] Error correcting transcription:', error);
            return userText; // Fallback to original
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

            // Use Gemini 3.5 Flash as the default model accompanying Live reports
            const reportModelName = 'gemini-3.5-flash';
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
            <div id="wappy-kpi" data-riesgo="[ALTO|MEDIO|BAJO]" data-accion="[Inmediata|Programada|Preventiva]" data-consecuencia="[Mortal|Incapacitante|Leve]" data-npeligros="[N]" style="display:none"></div>
            - data-riesgo: El nivel de riesgo predominante que encontraste.
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
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 900px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #004d99; color: white;">
                <tr>
                    <th style="padding: 10px 10px; white-space: nowrap;">#</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Proceso / Zona</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Peligro (Descripción Técnica)</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Clasificación GTC 45</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Efectos Posibles para la Salud</th>
                    <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">ND</th>
                    <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">NE</th>
                    <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">NC</th>
                    <th style="padding: 10px 10px; text-align: center; white-space: nowrap;">NR</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Nivel de Riesgo</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Aceptabilidad</th>
                </tr>
              </thead>
              <tbody>
                <!-- OBLIGATORIO: Genera al menos 5 filas. Máximo las que el entorno requiera. Para cada peligro: ND (1-10), NE (1-4), NC (10-100), NR = ND×NE×NC, Nivel: I(>600 Crítico), II(200-600 Alto), III(70-200 Medio), IV(<70 Bajo) -->
                <tr style="background:#fff0f0;">
                    <td style="padding: 8px; font-weight:bold; text-align: center; white-space: nowrap;">1</td>
                    <td style="padding: 8px;">[Zona/Proceso]</td>
                    <td style="padding: 8px;">[Descripción técnica del peligro 1]</td>
                    <td style="padding: 8px;">[Ej: Biomecánico / Físico / Psicosocial / Químico / Locativo / Eléctrico / Tránsito / Biológico]</td>
                    <td style="padding: 8px;">[Efectos en salud: enfermedades, lesiones posibles]</td>
                    <td style="padding: 8px; text-align:center; white-space: nowrap;">[ND]</td>
                    <td style="padding: 8px; text-align:center; white-space: nowrap;">[NE]</td>
                    <td style="padding: 8px; text-align:center; white-space: nowrap;">[NC]</td>
                    <td style="padding: 8px; text-align:center; font-weight:bold; white-space: nowrap;">[NR]</td>
                    <td style="padding: 8px; font-weight:bold; color:red; white-space: nowrap;">I - CRÍTICO</td>
                    <td style="padding: 8px; color:red; font-weight:bold; white-space: nowrap;">No aceptable</td>
                </tr>
                <!-- Agrega mínimo 4 filas más con el mismo formato -->
              </tbody>
            </table>
            </div>

            <h3>5. Medidas de Intervención por Jerarquía de Controles (ISO 45001 / GTC 45)</h3>
            <p>Las medidas de control se proponen siguiendo estrictamente la Jerarquía de Controles establecida en la ISO 45001 y la GTC 45: Eliminación → Sustitución → Controles de Ingeniería → Controles Administrativos → Elementos de Protección Personal (EPP).</p>
            <div class="table-responsive" style="overflow-x: auto; width: 100%; margin: 16px 0; -webkit-overflow-scrolling: touch;">
            <table border="0" style="border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #ddd; width: 100%; min-width: 760px; text-align: left; font-size: 0.88em;">
              <thead style="background-color: #004d99; color: white;">
                <tr>
                    <th style="padding: 10px 10px; white-space: nowrap;">Peligro / Riesgo</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Eliminación / Sustitución</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Controles de Ingeniería</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Controles Administrativos</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">EPP Requerido</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Responsable</th>
                    <th style="padding: 10px 10px; white-space: nowrap;">Plazo</th>
                </tr>
              </thead>
              <tbody>
                <!-- Una fila por cada peligro identificado en la sección anterior -->
                <tr>
                    <td style="padding: 8px;">[Peligro 1]</td>
                    <td style="padding: 8px;">[Medida de eliminación/sustitución concreta]</td>
                    <td style="padding: 8px;">[Control de ingeniería específico]</td>
                    <td style="padding: 8px;">[Procedimiento, capacitación, señalización]</td>
                    <td style="padding: 8px;">[EPP específico: tipo, norma técnica]</td>
                    <td style="padding: 8px;">[Área o cargo responsable]</td>
                    <td style="padding: 8px; white-space: nowrap;">[Inmediato / 8 días / 30 días]</td>
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


            logger.info(`[VoiceSession] Sending multimodal prompt to model: ${reportModelName} (via rotation)`);
            
            // Multimodal Array of Parts
            const promptParts = [
                { text: prompt }
            ];

            // Inject visual frames: prefer manual photos captured by the user, fallback to automatic rolling buffer
            let injectedFrames = 0;
            const framesToUse = (this.manualEvidences && this.manualEvidences.length > 0) 
                ? this.manualEvidences 
                : (this.frameBuffer && this.frameBuffer.length > 0) 
                    ? this.frameBuffer 
                    : this.latestFrame 
                        ? [this.latestFrame] 
                        : [];

            for (const b64 of framesToUse) {
                promptParts.push({
                    inlineData: {
                        data: b64,
                        mimeType: "image/jpeg"
                    }
                });
                injectedFrames++;
            }
            logger.info(`[VoiceSession] Injected ${injectedFrames} visual frames (manual: ${!!(this.manualEvidences && this.manualEvidences.length > 0)}) into report prompt.`);

            // Call API with the multimodal array
            const result = await generateWithKeyRotation(reportModelName, this.userId, promptParts);
            const response = result.response;
            let reportHtml = response.text().replace(/```html/g, '').replace(/```/g, '').trim();

            // ─── DYNAMIC SIGNATURE AND WORKER DETECTION ──────────────────────
            let finalSignatureHtml = '';
            try {
                const companyInfo = await CompanyInfo.findOne({ user: this.userId }).lean();
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

            // ─── PREMIUM EMERALD-TEAL WRAPPER (MATCH INITIAL FORMAT 1) ────────
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
                const phaseLabels = activeProtocol.phases;
                const sectionTitle = `1. Evidencia Fotográfica y Documental Multifase (${activeProtocol.title})`;

                const imgItems = framesToUse.map((b64, idx) => {
                    const caption = `<strong>${phaseLabels[idx] || `Fase ${idx + 1}: Evidencia de Inspección`}</strong>`;
                    return `
                    <div style="flex:1 1 calc(33.333% - 16px); max-width:300px; min-width:200px; text-align:center; margin-bottom:12px; box-sizing:border-box;">
                        <img src="data:image/jpeg;base64,${b64}" alt="Evidencia ${idx+1}" style="width:100%; height:240px; object-fit:contain; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.05);" />
                        <p style="font-size:0.75em; color:#475569; margin-top:6px; line-height:1.3;">${caption}</p>
                    </div>`;
                }).join('');

                evidenceHtml = `
                    <div style="margin-bottom:24px;">
                        <h3 style="color:#0f766e; font-size:1.1em; text-transform:uppercase; letter-spacing:1px; border-left:4px solid #14b8a6; padding-left:10px; margin-bottom:12px;">${sectionTitle}</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:16px; margin-top:12px;">${imgItems}</div>
                    </div>`;
            }

            const radicadoId = `LA-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`;
            const currentHour = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            const finalWrappedHtml = `<div class="report-container">
${kpiDiv}
<style>
.ai-report-content h2, .ai-report-content h3 { color: #0f766e; margin-top: 24px; margin-bottom: 12px; font-weight: 700; border-bottom: 1px solid #ccfbf1; padding-bottom: 6px; }
.ai-report-content p, .ai-report-content li { color: #334155; margin-bottom: 10px; font-size: 0.95em; }
.ai-report-content table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.88em; }
.ai-report-content th { background-color: #0f766e; color: #ffffff; padding: 10px 8px; text-align: left; }
.ai-report-content td { padding: 8px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
.ai-report-content tr:nth-child(even) td { background-color: #f8fafc; }
</style>
<div style="font-family:'Segoe UI',Arial,sans-serif; max-width:900px; margin:0 auto; color:#111827; background-color:#f9fafb; border-radius:16px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 10px 15px -3px rgba(0,0,0,0.05);">
  <!-- HEADER (WAPPY PREMIUM EMERALD-TEAL-CYAN DEGRADADO) -->
  <div style="background:linear-gradient(135deg,#064e3b 0%,#0f766e 60%,#0891b2 100%); padding:32px; position:relative; overflow:hidden; border-bottom:3px solid #14b8a6;">
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; position:relative; z-index:10;">
      <div>
        <div style="color:#22d3ee; font-size:0.75em; font-weight:800; letter-spacing:4px; text-transform:uppercase; margin-bottom:6px; text-shadow:0 0 10px rgba(34,211,238,0.3); display:flex; align-items:center; gap:8px;">
          <svg width="12" height="12" viewBox="0 0 100 100" style="overflow:visible;">
            <circle cx="50" cy="50" r="45" fill="#22d3ee">
              <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
              <animate attributeName="r" values="45;65;45" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
          ✨ WAPPY IA • HSE Command Center
        </div>
        <h1 style="color:#ffffff; font-size:1.8em; font-weight:900; margin:0 0 6px; letter-spacing:-0.5px; text-shadow:0 2px 4px rgba(0,0,0,0.2);">
          ${this.isBiomechanics ? 'Informe Técnico de Ergonomía y Biomecánica' : 'Informe de Análisis de Riesgos y Peligros'}
        </h1>
        <div style="color:#a7f3d0; font-size:0.85em; font-weight:500; display:flex; align-items:center; gap:6px;">
          <span style="display:inline-block; width:8px; height:8px; background-color:#34d399; border-radius:50%; box-shadow:0 0 8px #34d399;"></span>
          Modalidad: Auditoría Asistida por IA (${this.isBiomechanics ? 'Visión Artificial en Vivo' : 'Predictiva'})
        </div>
      </div>
      <div>
        <div style="background:rgba(255,255,255,0.07); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:12px 20px; min-width:180px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="color:#22d3ee; font-size:0.65em; font-weight:800; letter-spacing:3px; text-transform:uppercase; margin-bottom:4px;">RADICADO</div>
          <div style="color:#ffffff; font-size:1.25em; font-weight:900; font-family:monospace; letter-spacing:1px;">${radicadoId}</div>
          <div style="color:#e2e8f0; font-size:0.75em; margin-top:4px; font-weight:500;">
            📅 ${currentDate}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Background grid pattern -->
    <div style="position:absolute; inset:0; opacity:0.15; pointer-events:none; z-index:1;">
      <svg width="100%" height="100%">
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" stroke-width="1"/>
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  </div>

  <!-- INFO BAR -->
  <div style="background:#f0fdfa; border-bottom:1px solid #ccfbf1; padding:14px 32px; display:flex; flex-wrap:wrap; gap:32px; font-size:0.85em; color:#0f766e; font-weight:600; align-items:center;">
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="color:#14b8a6; font-size:1.2em;">📅</span> <strong>Fecha:</strong> ${currentDate}
    </div>
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="color:#14b8a6; font-size:1.2em;">⏱️</span> <strong>Hora:</strong> ${currentHour}
    </div>
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="color:#14b8a6; font-size:1.2em;">🛡️</span> <strong>Estándar:</strong> ${this.isBiomechanics ? 'RULA / REBA / OWAS (GTC 45 / Res. 2400)' : 'GTC 45 / ISO 45001'}
    </div>
    <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
      <strong>Estado:</strong> 
      <span style="background-color:#ecfdf5; color:#065f46; padding:3px 12px; border-radius:50px; font-size:0.9em; font-weight:700; border:1px solid #a7f3d0; display:flex; align-items:center; gap:6px;">
        ✔ Completado
      </span>
    </div>
  </div>

  <!-- BODY CONTENT -->
  <div style="background:#ffffff; padding:40px 32px; min-height:400px; display:flex; flex-direction:column; color:#1f2937;">
    
    ${evidenceHtml}

    <div class="ai-report-content" style="line-height:1.7; color:#1f2937;">
      <h2 style="color:#0f766e; font-size:1.4em; font-weight:800; border-bottom:2px solid #14b8a6; padding-bottom:8px; margin-bottom:20px;">${this.isBiomechanics ? 'Informe Técnico de Evaluación Postural y Ergonómica' : 'Informe Técnico de Evaluación de Riesgos y Peligros'}</h2>
      ${reportHtml}
    </div>
    
  </div>
</div>
</div>`;

            // Strip any 4+ space indentation so markdown engines never treat tags as code blocks
            reportHtml = finalWrappedHtml.replace(/^[ \t]{4,}/gm, '');

            // Ensure every <table> is wrapped in a responsive overflow container and headers do not break letter-by-letter
            if (reportHtml && typeof reportHtml === 'string') {
                reportHtml = reportHtml.replace(/(?:<div[^>]*class=["'][^"']*table-responsive[^"']*["'][^>]*>\s*)?(<table[\s\S]*?<\/table>)(?:\s*<\/div>)?/gi, (match, tableContent) => {
                    let cleanTable = tableContent;
                    if (!cleanTable.includes('min-width')) {
                        cleanTable = cleanTable.replace(/<table\b([^>]*)>/i, (m, attrs) => {
                            if (/style=["']/.test(attrs)) {
                                return `<table ${attrs.replace(/style=["']([^"']*)["']/, 'style="min-width: 760px; width: 100%; $1"')}>`;
                            } else {
                                return `<table style="min-width: 760px; width: 100%;" ${attrs}>`;
                            }
                        });
                    }
                    // Make sure th has white-space: nowrap
                    cleanTable = cleanTable.replace(/<th\b([^>]*)>/gi, (m, attrs) => {
                        if (/style=["']/.test(attrs)) {
                            return `<th ${attrs.replace(/style=["']([^"']*)["']/, 'style="white-space: nowrap; word-break: normal; $1"')}>`;
                        } else {
                            return `<th style="white-space: nowrap; word-break: normal;" ${attrs}>`;
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

                        let active = await CompanyInfo.findOne({ user: this.userId, isActive: true });
                        if (!active) active = await CompanyInfo.findOne({ user: this.userId });
                        const companyId = active ? active._id : null;

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
            const evalFrames = (this.manualEvidences && this.manualEvidences.length > 0)
                ? [...this.manualEvidences]
                : (this.frameBuffer && this.frameBuffer.length > 0)
                    ? [...this.frameBuffer]
                    : this.latestFrame
                        ? [this.latestFrame]
                        : [];

            // Clear manual evidence buffer for next turns/reports
            this.manualEvidences = [];

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
            const aiReportRegex = /\b(procedo a generar|voy a compilar|generando el informe t[eé]cnico|informe técnico compilado)\b/i;

            const userRequested = userReportRegex.test(currentUserText) || phoneticApproxRegex.test(currentUserText);
            const aiConfirmed = aiReportRegex.test(currentAiText) || aiReportRegex.test(this.aiTranscriptionBuffer);
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

            const result = await this.saveUserMessage(textToSave);
            if (result) {
                messagesSaved = true;
                isNewConversation = result.isNewConversation;
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
                                          config.template === 'biomecanico_mediapipe' || 
                                          !agentId;
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
1. Toma el control desde tu primer saludo proponiendo la evaluación estructurada en 3 pasos rápidos:
   - Paso 1 (Postura Habitual / Línea Base): Pídele trabajar/digitar normalmente unos segundos mientras mides cuello y tronco con MediaPipe.
   - Paso 2 (Alcance Crítico / Flexión Máxima): Pídele mostrar el punto o alcance más exigente de su puesto de trabajo.
   - Paso 3 (Postura Fatigada / Apoyo Lumbar): Pídele mostrar cómo se sienta cuando ya siente cansancio para revisar soporte de silla, columna y pies.
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
GENERACIÓN DEL INFORME TÉCNICO: Cuando el usuario te pida generar, hacer o sacar el informe, reporte o resumen técnico ("haz el informe", "genera el informe", "dame el reporte", "quiero el informe", "sí, hazlo"), DEBES INVOCAR INMEDIATAMENTE la función 'generar_informe_tecnico'. Mientras se procesa, confirma en una sola frase breve: "Listo, procesando las evidencias bajo el método seleccionado para generar el informe técnico ergonómico."`;
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
2. **SALUDO INICIAL Y LIDERAZGO:** En tu primera respuesta saluda cordialmente en 1 o 2 frases y TOMA EL LIDERAZGO proponiendo de inmediato iniciar el Paso 1 de la evaluación de campo.
3. **CONDUCE LA EVALUACIÓN PASO A PASO:** Guía activamente al usuario por las fases de campo: Paso 1 (Postura Habitual), Paso 2 (Alcance Crítico) y Paso 3 (Fatiga / Deslizamiento). NO seas un asistente pasivo que solo espera preguntas.
4. **RETROALIMENTACIÓN BIOMECÁNICA PRECISA:** Menciona los ángulos articulares medidos en cámara (cuello, tronco, brazos) y brinda correcciones físicas inmediatas.
5. **CERO CUESTIONARIOS ADMINISTRATIVOS:** Prohibido preguntar por ARL, tamaño de empresa o porcentajes de implementación. Céntrate en la observación de campo.
6. **RESPUESTAS HABLADAS CONCISAS:** Respuestas habladas claras y pedagógicas (2 a 4 oraciones por turno). Sin formato Markdown ni HTML en voz.
7. **GENERACIÓN DE INFORME:** Al concluir las 3 fases o cuando el usuario lo solicite ("haz el informe", "genera el reporte", "dame el informe", "sí, hazlo"), invoca INMEDIATAMENTE la herramienta 'generar_informe_tecnico'.
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
