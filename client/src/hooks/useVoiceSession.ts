import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';

interface VoiceMessage {
    type: 'audio' | 'text' | 'status' | 'error' | 'interrupted' | 'conversationId' | 'conversationUpdated' | 'report' | 'wappy_action';
    data: any;
}

interface UseVoiceSessionOptions {
    onAudioReceived?: (audioData: string) => void;
    onTextReceived?: (text: string, isUserTranscription?: boolean) => void;
    onReportReceived?: (html: string, messageId?: string, evaluatedFrames?: string[]) => void;
    onWappyAction?: (action: { id: string; name: string; args: any }) => void;
    onStatusChange?: (status: string) => void;
    onError?: (error: string) => void;
    conversationId?: string;
    onConversationIdUpdate?: (newId: string) => void;
    onConversationUpdated?: (conversationId?: string) => void;
    disableAudio?: boolean;
    mode?: 'chat' | 'live_analysis' | 'tenshi_voice' | string;
    initialVoice?: string;
    model?: string;
    endpoint?: string;
    template?: string;
    agentId?: string;
}



export const useVoiceSession = (options: UseVoiceSessionOptions = {}) => {
    const { token } = useAuthContext();
    const { conversationId, disableAudio } = options;
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking'>('idle');

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const isHardwareMutedRef = useRef(false);
    const isAutoMutedRef = useRef(false);
    const isPlayingAudioRef = useRef(false);
    const serverFinishedRef = useRef(false);
    const autoMuteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const inputAnalyserRef = useRef<AnalyserNode | null>(null);
    const statusRef = useRef(status);
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    /**
     * Start Audio Capture
     */
    const startAudioCapture = async () => {
        try {
            console.log('[VoiceSession] Starting audio capture...');

            // 1. Get Microphone Stream
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // No forzar sampleRate — dejar que el browser elija (más compatible)
                },
                video: false
            });
            streamRef.current = stream;
            console.log('[VoiceSession] Micrófono obtenido, tracks:', stream.getAudioTracks().map(t => t.label));

            // 2. Inicializar o Reutilizar AudioContext a 16kHz
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) throw new Error('AudioContext no disponible en este browser');

            let audioContext = audioContextRef.current;
            const sharedCtx = (window as any).sharedAudioContext16k;
            let workletAlreadyLoaded = false;

            if (!audioContext || audioContext.state === 'closed') {
                if (sharedCtx && sharedCtx.state !== 'closed') {
                    console.log('[VoiceSession] Reutilizando AudioContext 16kHz existente, estado:', sharedCtx.state);
                    audioContext = sharedCtx;
                    workletAlreadyLoaded = !!(window as any).sharedAudioWorkletLoaded;
                } else {
                    console.log('[VoiceSession] Creando nuevo AudioContext (16kHz)');
                    audioContext = new AudioContextClass({ sampleRate: 16000 });
                    (window as any).sharedAudioWorkletLoaded = false;
                }
                audioContextRef.current = audioContext;
                (window as any).sharedAudioContext16k = audioContext;
            } else {
                workletAlreadyLoaded = !!(window as any).sharedAudioWorkletLoaded;
            }

            if (!audioContext) throw new Error('AudioContext no disponible después de la inicialización');

            // Reanudar si estaba suspendido
            if (audioContext.state === 'suspended') {
                console.log('[VoiceSession] Reanudando AudioContext 16kHz suspendido');
                await audioContext.resume();
            }
            console.log('[VoiceSession] AudioContext 16kHz listo, estado:', audioContext.state, '| sampleRate:', audioContext.sampleRate);

            // 3. Helper: enviar PCM int16 al servidor via WebSocket
            let sendCount = 0;
            const sendPCMChunk = (float32Array: Float32Array) => {
                if (isHardwareMutedRef.current || isAutoMutedRef.current || isPlayingAudioRef.current || statusRef.current === 'speaking') return;
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                const int16Data = new Int16Array(float32Array.length);
                for (let j = 0; j < float32Array.length; j++) {
                    const s = Math.max(-1, Math.min(1, float32Array[j]));
                    int16Data[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                const bytes = new Uint8Array(int16Data.buffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);
                wsRef.current.send(JSON.stringify({ type: 'audio', data: { audioData: base64 } }));

                sendCount++;
                if (sendCount === 1 || sendCount % 50 === 0) {
                    console.log(`[VoiceSession] Audio enviado al servidor (chunk #${sendCount}, ${base64.length} chars)`);
                }
            };

            // 4. Crear grafo de audio — intentar AudioWorklet primero, ScriptProcessor como fallback
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            inputAnalyserRef.current = analyser;
            source.connect(analyser);

            let useWorklet = false;
            if (audioContext.audioWorklet) {
                try {
                    if (!workletAlreadyLoaded) {
                        const workletCode = `
                            class PCMProcessor extends AudioWorkletProcessor {
                                constructor() {
                                    super();
                                    this.bufferSize = 2048;
                                    this.buffer = new Float32Array(this.bufferSize);
                                    this.bufferIndex = 0;
                                }
                                process(inputs) {
                                    const input = inputs[0];
                                    if (!input || !input[0]) return true;
                                    const inputChannel = input[0];
                                    for (let i = 0; i < inputChannel.length; i++) {
                                        this.buffer[this.bufferIndex++] = inputChannel[i];
                                        if (this.bufferIndex >= this.bufferSize) {
                                            this.port.postMessage(this.buffer.slice(0));
                                            this.bufferIndex = 0;
                                        }
                                    }
                                    return true;
                                }
                            }
                            registerProcessor('pcm-processor', PCMProcessor);
                        `;
                        const blob = new Blob([workletCode], { type: 'application/javascript' });
                        const workletUrl = URL.createObjectURL(blob);
                        await audioContext.audioWorklet.addModule(workletUrl);
                        URL.revokeObjectURL(workletUrl);
                        (window as any).sharedAudioWorkletLoaded = true;
                        console.log('[VoiceSession] AudioWorklet cargado exitosamente');
                    } else {
                        console.log('[VoiceSession] Reutilizando AudioWorklet ya cargado');
                    }

                    const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
                    workletNode.port.onmessage = (event) => {
                        sendPCMChunk(new Float32Array(event.data));
                    };
                    analyser.connect(workletNode);
                    // Keep worklet alive silently
                    const gainNode = audioContext.createGain();
                    gainNode.gain.value = 0;
                    workletNode.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    workletNodeRef.current = workletNode;
                    useWorklet = true;
                    console.log('[VoiceSession] Usando AudioWorklet para captura');
                } catch (workletError) {
                    console.warn('[VoiceSession] AudioWorklet falló, usando ScriptProcessor como fallback:', workletError);
                }
            }

            if (!useWorklet) {
                // Fallback: ScriptProcessorNode (funciona en todos los browsers incluyendo Safari)
                console.log('[VoiceSession] Usando ScriptProcessorNode (fallback)');
                const bufferSize = 2048;
                const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
                scriptProcessor.onaudioprocess = (event) => {
                    const inputData = event.inputBuffer.getChannelData(0);
                    sendPCMChunk(new Float32Array(inputData));
                };
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);
                // Guardar en workletNodeRef para poder desconectarlo después
                (workletNodeRef as any).current = scriptProcessor;
            }

            // Only set status to listening if we are already connected/ready
            if (status === 'ready' || status === 'speaking') {
                setStatus('listening');
            }

        } catch (error: any) {
            console.error('[VoiceSession] Error starting audio capture:', error);
            let errorMessage = 'Failed to access microphone';
            if (error.name === 'NotAllowedError') errorMessage = 'Microphone permission denied';
            if (error.name === 'NotFoundError') errorMessage = 'No microphone found';
            if (error.name === 'NotReadableError') errorMessage = 'Microphone is busy';
            if (error.name === 'OverconstrainedError') errorMessage = 'Microphone constraints not satisfied';

            options.onError?.(`${errorMessage}: ${error.message}`);
        }
    };

    /**
     * Get current input volume (0-1)
     */
    const getInputVolume = useCallback(() => {
        if (!inputAnalyserRef.current) return 0;
        const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
        inputAnalyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        return Math.min(1, (average / 128));
    }, []);

    /**
     * Send Interrupt message to stop AI response
     */
    const sendInterrupt = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'interrupt',
            data: {}
        }));
    }, []);

    /**
     * Stop Audio Capture
     */
    const stopAudioCapture = () => {
        // Detener tracks del micrófono
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        // Desconectar el nodo worklet
        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        // FIX 3: NO cerrar el AudioContext — solo suspenderlo
        // Cerrarlo destruye el módulo AudioWorklet registrado y obliga a recargarlo
        // en la siguiente llamada, lo que puede fallar o crear race conditions
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
            audioContextRef.current.suspend().catch(console.error);
        }
        // NO borrar sharedAudioContext16k para permitir reutilización
        inputAnalyserRef.current = null;
    };

    /**
     * Send Video Frame with optional canvas overlay and telemetry
     */
    const sendVideoFrame = useCallback((videoElement: HTMLVideoElement, telemetry?: string, overlayCanvas?: HTMLCanvasElement | null) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        if (!videoCanvasRef.current) {
            videoCanvasRef.current = document.createElement('canvas');
        }

        const canvas = videoCanvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const width = 480;
        const height = 360;

        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        context.drawImage(videoElement, 0, 0, width, height);

        // Composite MediaPipe skeleton overlay if provided
        if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
            context.drawImage(overlayCanvas, 0, 0, width, height);
        }

        const base64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];

        wsRef.current.send(JSON.stringify({
            type: 'video',
            data: { 
                image: base64,
                ...(telemetry ? { telemetry } : {})
            }
        }));

    }, []);

    /**
     * Connect to voice WebSocket
     */
    const connect = useCallback(async () => {
        if (isConnected || isConnecting) return;

        setIsConnecting(true);
        setStatus('connecting');

        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            let wsUrl = `${protocol}//${host}/ws/voice?token=${encodeURIComponent(token || '')}&conversationId=${encodeURIComponent(conversationId || '')}&mode=${encodeURIComponent(options.mode || 'chat')}`;

            if (options.initialVoice) {
                wsUrl += `&initialVoice=${encodeURIComponent(options.initialVoice)}`;
            }
            if (options.model) {
                wsUrl += `&model=${encodeURIComponent(options.model)}`;
            }
            if (options.endpoint) {
                wsUrl += `&endpoint=${encodeURIComponent(options.endpoint)}`;
            }
            if (options.template) {
                wsUrl += `&template=${encodeURIComponent(options.template)}`;
            }
            if (options.agentId) {
                wsUrl += `&agentId=${encodeURIComponent(options.agentId)}`;
            }

            console.log('[VoiceSession] Connecting to:', wsUrl);
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = async () => {
                console.log('[VoiceSession] Connected');
                setIsConnected(true);
                setIsConnecting(false);
                setStatus('ready');

                if (!disableAudio) {
                    await startAudioCapture();
                }
            };

            ws.onmessage = (event) => {
                try {
                    const message: VoiceMessage = JSON.parse(event.data);
                    handleMessage(message);
                } catch (error) {
                    console.error('[VoiceSession] Error parsing message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('[VoiceSession] WebSocket error:', error);
                options.onError?.('WebSocket connection error');
                setStatus('idle');
            };

            ws.onclose = (event) => {
                console.log('[VoiceSession] WebSocket closed:', event.code, event.reason);
                setIsConnected(false);
                setIsConnecting(false);
                setStatus('idle');
                stopAudioCapture();
                wsRef.current = null;
            };

        } catch (error) {
            console.error('[VoiceSession] Connection error:', error);
            setIsConnecting(false);
            setStatus('idle');
            options.onError?.('Failed to connect');
        }
    }, [isConnected, isConnecting, token, conversationId, disableAudio, options]); // Added deps

    // FIX: Use ref to access latest options without reconnecting WebSocket
    const optionsRef = useRef(options);
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    /**
     * Handle incoming messages from WebSocket
     */
    const handleMessage = useCallback(async (message: VoiceMessage) => {
        switch (message.type) {
            case 'audio':
                if (statusRef.current === 'listening' || statusRef.current === 'thinking') {
                    console.log('[VoiceSession] Discarding residual server audio packet during listening/thinking state');
                    break;
                }
                if (message.data.audioData) {
                    optionsRef.current.onAudioReceived?.(message.data.audioData);
                    setStatus('speaking');
                    isAutoMutedRef.current = true;
                    serverFinishedRef.current = false;

                    if (autoMuteTimeoutRef.current) {
                        clearTimeout(autoMuteTimeoutRef.current);
                    }
                    autoMuteTimeoutRef.current = setTimeout(() => {
                        console.log('[VoiceSession] Safety auto-unmute timeout');
                        isAutoMutedRef.current = false;
                        autoMuteTimeoutRef.current = null;
                    }, 15000);
                }
                break;

            case 'text':
                if (message.data.text) {
                    optionsRef.current.onTextReceived?.(message.data.text, message.data.isUserTranscription ?? false);
                }
                break;

            case 'report':
                if (message.data.html) {
                    console.log('[VoiceSession] Report received');
                    optionsRef.current.onReportReceived?.(
                        message.data.html,
                        message.data.messageId,
                        message.data.evaluatedFrames
                    );
                    
                    // Force state back to ready to unfreeze UI
                    setStatus('ready');
                    optionsRef.current.onStatusChange?.('turn_complete');
                }
                break;


            case 'wappy_action':
                if (message.data) {
                    console.log('[VoiceSession] wappy_action received:', message.data);
                    optionsRef.current.onWappyAction?.(message.data);
                }
                break;

            case 'status':
                const newStatus = message.data.status;
                setStatus(newStatus);
                optionsRef.current.onStatusChange?.(newStatus);

                if (newStatus === 'listening' || newStatus === 'turn_complete') {
                    serverFinishedRef.current = true;
                    if (!isPlayingAudioRef.current) {
                        isAutoMutedRef.current = false;
                        if (autoMuteTimeoutRef.current) {
                            clearTimeout(autoMuteTimeoutRef.current);
                            autoMuteTimeoutRef.current = null;
                        }
                    }
                }
                break;

            case 'interrupted':
                setStatus('listening');
                optionsRef.current.onStatusChange?.('interrupted');
                console.log('[VoiceSession] AI interrupted event from server');
                serverFinishedRef.current = true;
                isPlayingAudioRef.current = false;
                isAutoMutedRef.current = false;
                if (autoMuteTimeoutRef.current) {
                    clearTimeout(autoMuteTimeoutRef.current);
                    autoMuteTimeoutRef.current = null;
                }
                break;

            case 'error':
                optionsRef.current.onError?.(message.data?.message);
                setStatus('idle');
                setIsConnected(false);
                stopAudioCapture();
                break;

            case 'conversationId':
                if (message.data.conversationId) {
                    optionsRef.current.onConversationIdUpdate?.(message.data.conversationId);
                }
                break;

            case 'conversationUpdated':
                console.log('[VoiceSession] Conversation updated event received from WS');
                if (optionsRef.current.onConversationUpdated) {
                    console.log('[VoiceSession] Executing onConversationUpdated callback with ID:', message.data.conversationId);
                    optionsRef.current.onConversationUpdated(message.data.conversationId);
                } else {
                    console.warn('[VoiceSession] No onConversationUpdated callback defined');
                }
                break;
        }
    }, []);

    /**
     * Change voice
     */
    const changeVoice = useCallback((voice: string) => {
        if (!wsRef.current) return;
        wsRef.current.send(JSON.stringify({
            type: 'config',
            data: { voice },
        }));
    }, []);

    /**
     * Disconnect
     */
    const disconnect = useCallback(() => {
        console.log('[VoiceSession] Disconnecting and cleaning up...');

        stopAudioCapture();

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        if (autoMuteTimeoutRef.current) {
            clearTimeout(autoMuteTimeoutRef.current);
            autoMuteTimeoutRef.current = null;
        }

        isHardwareMutedRef.current = false;
        isAutoMutedRef.current = false;
        isPlayingAudioRef.current = false;
        serverFinishedRef.current = false;
        inputAnalyserRef.current = null;
        videoCanvasRef.current = null;

        setIsConnected(false);
        setIsConnecting(false);
        setStatus('idle');

        console.log('[VoiceSession] Cleanup complete, ready for reconnection');
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            stopAudioCapture();
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    /**
     * Mute/Unmute
     */
    const setMuted = useCallback((muted: boolean) => {
        isHardwareMutedRef.current = muted;
        if (muted) {
            console.log('[VoiceSession] Hardware Mute: Releasing microphone to system.');
            stopAudioCapture();
        } else {
            console.log('[VoiceSession] Hardware Unmute: Acquiring microphone.');
            if (isConnected) {
                startAudioCapture();
            }
        }
    }, [isConnected]);

    /**
     * Send Text Message
     */
    const sendTextMessage = useCallback((text: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'message',
            data: { text }
        }));
    }, []);

    /**
     * Send Evidence Image
     */
    const sendEvidenceImage = useCallback((base64: string, text?: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'evidence-image',
            data: { image: base64, text }
        }));
    }, []);

    const setIsPlayingAudio = useCallback((isPlaying: boolean) => {
        isPlayingAudioRef.current = isPlaying;
        console.log('[VoiceSession] setIsPlayingAudio:', isPlaying, 'serverFinished:', serverFinishedRef.current);
        if (!isPlaying && serverFinishedRef.current) {
            console.log('[VoiceSession] Playback finished and server is done - unmuting microphone');
            isAutoMutedRef.current = false;
            if (autoMuteTimeoutRef.current) {
                clearTimeout(autoMuteTimeoutRef.current);
                autoMuteTimeoutRef.current = null;
            }
        }
    }, []);

    /**
     * Send Wappy Action Result to server for toolResponse
     */
    const sendWappyActionResult = useCallback((id: string, name: string, result: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({
            type: 'wappy_action_result',
            data: { id, name, result }
        }));
    }, []);

    /**
     * Trigger Report Generation manually via WebSocket
     */
    const triggerReport = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        console.log('[VoiceSession] Manually requesting report generation via WS');
        wsRef.current.send(JSON.stringify({
            type: 'trigger_report',
        }));
    }, []);

    return {
        isConnected,
        isConnecting,
        status,
        connect,
        disconnect,
        sendVideoFrame,
        sendTextMessage,
        sendEvidenceImage,
        changeVoice,
        getInputVolume,
        setMuted,
        setIsPlayingAudio,
        sendInterrupt,
        sendWappyActionResult,
        triggerReport,
    };
};
