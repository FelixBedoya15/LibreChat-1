import { useState, useEffect, useCallback, useRef, useMemo, type FC } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { Mic, MicOff, Video, VideoOff, RefreshCcw, Monitor, MonitorOff, PhoneOff, Smartphone, Camera, AlertCircle, FileText, UserCheck } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import store from '~/store';
import VoiceOrb from './VoiceOrb';
import VoiceSelector from './VoiceSelector';
import { useVoiceSession } from '~/hooks/useVoiceSession';
import { useLocalize } from '~/hooks';
import { useGetAgentByIdQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';

declare global {
    interface Window {
        Pose: any;
        drawConnectors: any;
        drawLandmarks: any;
        POSE_CONNECTIONS: any;
    }
}

const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
    });
};

interface VoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversationId?: string;
    onConversationIdUpdate?: (newId: string) => void;
    onConversationUpdated?: (conversationId?: string) => void;
    model?: string;
    endpoint?: string;
    agentId?: string;
}

const playStartupSound = () => {
    try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const frequencies = [523.25, 659.25, 783.99, 987.77];
        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1 + (i * 0.05));
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + (i * 0.05));
            osc.stop(ctx.currentTime + 1.5);
        });
    } catch (e) {
        console.warn('Startup sound could not be played:', e);
    }
};

import { resolveInspectionProtocol, INSPECTION_PROTOCOLS, ERGONOMIC_PHASES, type InspectionProtocol } from '~/utils/inspectionProtocols';
export { ERGONOMIC_PHASES };

const VoiceModal: FC<VoiceModalProps> = ({ isOpen, onClose, conversationId, onConversationIdUpdate, onConversationUpdated, model, endpoint, agentId }) => {
    const localize = useLocalize();
    const [voiceChatGeneral, setVoiceChatGeneral] = useRecoilState(store.voiceChatGeneral);
    const [selectedVoice, setSelectedVoice] = useState(voiceChatGeneral);
    const [countdownValue, setCountdownValue] = useState(10);
    const [isReady, setIsReady] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(true); // START ON by default
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const setShowModalState = useSetRecoilState(store.showVoiceModal);
    const setIsCanvasActive = useSetRecoilState(store.isCanvasActive);
    const [showVoiceSelector, setShowVoiceSelector] = useState(false);
    const [audioAmplitude, setAudioAmplitude] = useState(0);
    const [statusText, setStatusText] = useState('');
    // Transcription state: last user speech shown on HUD
    const [lastUserTranscript, setLastUserTranscript] = useState('');
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [zoom, setZoom] = useState<number>(1);
    const [isFlashActive, setIsFlashActive] = useState(false);
    const [limitNotification, setLimitNotification] = useState<string | null>(null);

    // Resolve conversation & effective agent details
    const chatContext = useChatContext();
    const conversation = chatContext?.conversation;
    const effectiveAgentId = agentId || conversation?.agent_id || (endpoint === 'agents' ? model : undefined);

    // Get active agent details
    const { data: agent, isLoading } = useGetAgentByIdQuery(effectiveAgentId, { enabled: !!effectiveAgentId });

    // Dynamic Inspection Protocol Resolution across all WAPPY Agent Families
    const activeProtocol = useMemo<InspectionProtocol>(() => {
        const candidate = agent?.name || conversation?.title || '';
        const resolved = resolveInspectionProtocol(candidate);
        // Default to Biomechanics if candidate is generic or missing, ensuring vision AI is never disabled
        if (resolved.id === 'auditoria' && (!agent || !agent.name)) {
            return INSPECTION_PROTOCOLS.biomecanico;
        }
        return resolved;
    }, [agent?.name, conversation?.title]);

    const isBiomechanicsAgent = useMemo(() => {
        const agentName = (agent?.name || '').toLowerCase();
        const agentInstructions = (agent?.instructions || '').toLowerCase();
        const convoTitle = (conversation?.title || '').toLowerCase();
        const modelStr = (model || '').toLowerCase();

        // 1. Direct name or instructions match
        if (
            agentName.includes('biomec') ||
            agentName.includes('fisioterapeuta') ||
            agentName.includes('ergon') ||
            agentName.includes('rosa') ||
            agentName.includes('puesto de trabajo') ||
            agentName.includes('ipt') ||
            agentInstructions.includes('fisioterapeuta') ||
            agentInstructions.includes('biomecánica') ||
            agentInstructions.includes('biomecanica') ||
            convoTitle.includes('biomec') ||
            convoTitle.includes('fisioterapeuta') ||
            modelStr.includes('biomec') ||
            modelStr.includes('fisioterapeuta')
        ) {
            return true;
        }

        // 2. Protocol match
        if (activeProtocol.id === 'biomecanico') {
            return true;
        }

        // 3. Fallback: If not specifically another specialist, default to true so MediaPipe is always active in Vision
        const otherSpecialistIds = ['quimico', 'pesv', 'emergencias_electrico', 'emergencias', 'electrico', 'alturas', 'investigacion_at', 'psicosocial'];
        if (!otherSpecialistIds.includes(activeProtocol.id)) {
            return true;
        }

        return false;
    }, [agent, conversation, model, activeProtocol.id]);

    // Multi-Phase Inspection Protocol & Perspective States
    const [currentPhaseIndex, setCurrentPhaseIndex] = useState<number>(0);
    const currentPhase = activeProtocol.phases[currentPhaseIndex] || activeProtocol.phases[0];

    // Reset phase index when agent changes
    useEffect(() => {
        setCurrentPhaseIndex(0);
    }, [activeProtocol.id]);

    const isMobileDevice = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
    }, []);

    const capturePerspective = useMemo(() => {
        if (isMobileDevice && facingMode === 'environment') {
            return 'Inspección Asistida (Smartphone)';
        }
        return 'Auto-evaluación (Portátil/Webcam)';
    }, [isMobileDevice, facingMode]);

    const currentPhaseRef = useRef(currentPhase);
    currentPhaseRef.current = currentPhase;
    const capturePerspectiveRef = useRef(capturePerspective);
    capturePerspectiveRef.current = capturePerspective;
    const activeProtocolRef = useRef(activeProtocol);
    activeProtocolRef.current = activeProtocol;

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const transcriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const manualPhotosCountRef = useRef<number>(0);

    // Biomechanics vison-AI states and refs
    const [neckAngle, setNeckAngle] = useState<number | null>(null);
    const [trunkAngle, setTrunkAngle] = useState<number | null>(null);
    const [armAngle, setArmAngle] = useState<number | null>(null);
    const [elbowAngle, setElbowAngle] = useState<number | null>(null);
    const [kneeAngle, setKneeAngle] = useState<number | null>(null);
    const [isMediaPipeLoaded, setIsMediaPipeLoaded] = useState(false);
    const [isPoseActive, setIsPoseActive] = useState(false);
    const [manualCapturedPhotos, setManualCapturedPhotos] = useState<string[]>([]);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportSuccess, setReportSuccess] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const poseRef = useRef<any>(null);
    const badPostureStartRef = useRef<number | null>(null);
    const lastSnapshotTimeRef = useRef<number>(0);
    const anglesRef = useRef<{
        neck: number | null;
        trunk: number | null;
        arm: number | null;
        elbow: number | null;
        knee: number | null;
    }>({ neck: null, trunk: null, arm: null, elbow: null, knee: null });
    const lastStateUpdateRef = useRef<number>(0);

    // Dynamic Cervical (Neck) risk level calculation matching RULA/REBA guidelines
    const neckInfo = useMemo(() => {
        if (neckAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/5 border-white/10 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (neckAngle > 25) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/15 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (neckAngle > 10) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-cyan-400'
        };
    }, [neckAngle]);

    // Dynamic Column (Trunk) risk level calculation matching RULA/REBA guidelines
    const trunkInfo = useMemo(() => {
        if (trunkAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/5 border-white/10 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (trunkAngle > 25) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/15 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (trunkAngle > 0) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [trunkAngle]);

    // Dynamic Arm Abduction risk level calculation matching RULA/REBA guidelines
    const armInfo = useMemo(() => {
        if (armAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/5 border-white/10 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (armAngle > 45) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/15 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (armAngle > 20) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [armAngle]);

    // Dynamic Elbow Flexion risk level calculation matching RULA guidelines
    const elbowInfo = useMemo(() => {
        if (elbowAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/5 border-white/10 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (elbowAngle < 30 || elbowAngle > 130) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/15 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if ((elbowAngle >= 30 && elbowAngle < 60) || (elbowAngle > 100 && elbowAngle <= 130)) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [elbowAngle]);

    // Dynamic Knee Flexion risk level calculation matching REBA guidelines
    const kneeInfo = useMemo(() => {
        if (kneeAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/5 border-white/10 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (kneeAngle > 60) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/15 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (kneeAngle > 30) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [kneeAngle]);

    const sessionOptions = useMemo(() => ({
        conversationId,
        onConversationIdUpdate,
        onConversationUpdated,
        initialVoice: voiceChatGeneral,
        model,
        endpoint,
        agentId: effectiveAgentId,
        template: isBiomechanicsAgent ? 'biomecanico_mediapipe' : undefined,
        onAudioReceived: (audioData: string) => {
            handleAudioReceived(audioData);
        },
        onTextReceived: (text: string, isUserTranscription?: boolean) => {
            if (isUserTranscription) {
                // Show user's own speech transcription live in the HUD
                console.log('[VoiceModal] User transcription:', text);
                setLastUserTranscript(text);
                if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
            }
            // AI text responses are intentionally not displayed (audio-only UI)
        },

        onReportReceived: (html: string, messageId?: string, evaluatedFrames?: string[]) => {
            console.log('[VoiceModal] Report received successfully');
            setIsGeneratingReport(false);
            setReportSuccess(true);
            setIsCanvasActive(true);
            setTimeout(() => setReportSuccess(false), 6000);
            if (onConversationUpdated) {
                onConversationUpdated(conversationId);
            }
        },

        onStatusChange: (newStatus: string) => {
            console.log('[VoiceModal] Status changed:', newStatus);
            if (newStatus === 'generating_report') {
                setIsGeneratingReport(true);
            } else if (newStatus === 'listening') {
                if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                transcriptTimeoutRef.current = setTimeout(() => {
                    setLastUserTranscript('');
                }, 3500);
            } else if (newStatus === 'interrupted') {
                console.log('[VoiceModal] Interrupted by user, clearing audio queue');
                clearAudioQueue();
            }
        },
        onError: (error: string) => {
            console.error('[VoiceModal] Error:', error);
            setIsGeneratingReport(false);
            setStatusText(`Error: ${error}`);
        },
    }), [conversationId, onConversationIdUpdate, onConversationUpdated, voiceChatGeneral, model, endpoint, isBiomechanicsAgent, effectiveAgentId]);

    const {
        isConnected,
        isConnecting,
        status,
        connect,
        disconnect,
        sendVideoFrame,
        sendEvidenceImage,
        changeVoice,
        getInputVolume,
        setMuted,
        sendTextMessage,
        setIsPlayingAudio,
        sendInterrupt,
        triggerReport,
    } = useVoiceSession(sessionOptions);

    const handleManualReportClick = useCallback(() => {
        if (isGeneratingReport) return;
        console.log('[VoiceModal] User clicked Generate Report button');
        setIsGeneratingReport(true);
        triggerReport();
    }, [isGeneratingReport, triggerReport]);

    const hasInitiatedConnectionRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            if (hasInitiatedConnectionRef.current) {
                console.log('[VoiceModal] Modal closed, disconnecting session...');
                hasInitiatedConnectionRef.current = false;
                clearAudioQueue();
                stopMediaTracks();
                disconnect();
                if (audioContextRef.current) {
                    audioContextRef.current.close().catch(console.error);
                    audioContextRef.current = null;
                }
                (window as any).sharedAudioContext24k = null;
            }
            return;
        }

        // Evitar conectar si el agente se está cargando (evita carrera inicial del primer render tras recargar)
        const isWaitingForAgent = !!agentId && isLoading;
        if (isWaitingForAgent) {
            console.log('[VoiceModal] Waiting for agent details query before connecting...');
            return;
        }

        if (isOpen && !isConnected && !isConnecting && !hasInitiatedConnectionRef.current) {
            console.log('[VoiceModal] Connecting voice session...');
            hasInitiatedConnectionRef.current = true;
            
            // Limpieza total de estados locales al iniciar sesión
            setManualCapturedPhotos([]);
            manualPhotosCountRef.current = 0;
            setLastUserTranscript('');
            setZoom(1);

            // FIX 1: Crear/reanudar el AudioContext 24kHz AQUÍ, dentro del gesto del usuario
            // (la apertura del modal es consecuencia de un click → gesto válido para el browser)
            // Esto garantiza que cuando llegue el primer audio de la IA el contexto ya esté 'running'
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
                let ctx = audioContextRef.current;
                if (!ctx || ctx.state === 'closed') {
                    ctx = (window as any).sharedAudioContext24k;
                    if (!ctx || ctx.state === 'closed') {
                        ctx = new AudioCtxClass({ sampleRate: 24000 });
                        console.log('[VoiceModal] AudioContext 24kHz creado en gesto de usuario:', ctx.state);
                    }
                    audioContextRef.current = ctx;
                    (window as any).sharedAudioContext24k = ctx;
                }
                if (ctx.state === 'suspended') {
                    ctx.resume().then(() => {
                        console.log('[VoiceModal] AudioContext 24kHz reanudado en gesto de usuario:', ctx?.state);
                    }).catch(console.error);
                }
            }

            setShowModalState(true);
            playStartupSound();
            connect();
        }
    }, [isOpen, isConnected, isConnecting, connect, agentId, isLoading]);

    useEffect(() => {
        if (isOpen && isConnected && selectedVoice !== voiceChatGeneral) {
            setSelectedVoice(voiceChatGeneral);
            changeVoice(voiceChatGeneral);
        }
    }, [isOpen, isConnected, voiceChatGeneral, selectedVoice, changeVoice]);

    // Eagerly initialize and resume AudioContext on the first user interaction (click/touch) inside the modal to bypass browser autoplay blocks
    useEffect(() => {
        if (!isOpen) return;

        const initAudioOnGesture = () => {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;

            let ctx = audioContextRef.current;
            if (!ctx) {
                ctx = (window as any).sharedAudioContext24k || new AudioContextClass({ sampleRate: 24000 });
                audioContextRef.current = ctx;
                (window as any).sharedAudioContext24k = ctx;
                console.log('[VoiceModal] AudioContext created eagerly on user gesture:', ctx?.state);
            } else if (ctx.state === 'suspended') {
                ctx.resume().then(() => {
                    console.log('[VoiceModal] AudioContext resumed eagerly on user gesture:', ctx?.state);
                });
            }
            
            // Remove listeners immediately
            window.removeEventListener('click', initAudioOnGesture, true);
            window.removeEventListener('touchstart', initAudioOnGesture, true);
        };

        window.addEventListener('click', initAudioOnGesture, true);
        window.addEventListener('touchstart', initAudioOnGesture, true);

        return () => {
            window.removeEventListener('click', initAudioOnGesture, true);
            window.removeEventListener('touchstart', initAudioOnGesture, true);
        };
    }, [isOpen]);

    // Cleanup local state when modal is closed to prevent bleeding of photos and text
    useEffect(() => {
        if (!isOpen) {
            setManualCapturedPhotos([]);
            manualPhotosCountRef.current = 0;
            setLastUserTranscript('');
            setZoom(1);
        }
    }, [isOpen]);

    // Connection Delay Logic: Set isReady to true immediately when connected (no countdown delay)
    useEffect(() => {
        if (isOpen && isConnected) {
            setIsReady(true);
            setCountdownValue(0);
        } else {
            setIsReady(false);
            setCountdownValue(0);
        }
    }, [isOpen, isConnected]);

    // Auto-start camera when READY (after countdown)
    useEffect(() => {
        if (isConnected && isOpen && isReady) {
            startCamera(facingMode);
        }
    }, [isConnected, isOpen, isReady, facingMode]);

    const handleClose = () => {
        if (onConversationUpdated && conversationId) {
            onConversationUpdated(conversationId);
        }
        onClose();
    };

    const stopMediaTracks = () => {
        if (videoIntervalRef.current) {
            clearInterval(videoIntervalRef.current);
            videoIntervalRef.current = null;
        }
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
        setIsScreenSharing(false);
    };

    const [supportsScreenShare, setSupportsScreenShare] = useState(false);
    useEffect(() => {
        if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
            setSupportsScreenShare(true);
        }
    }, []);

    const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
        try {
            stopMediaTracks();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 }, facingMode: mode },
                audio: false
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setIsCameraOn(true);
            startSendingFrames();
        } catch (error) {
            console.error('[VoiceModal] Error starting camera:', error);
            setStatusText('Error accessing camera');
            setIsCameraOn(false);
        }
    };

    const startScreenShare = async () => {
        try {
            stopMediaTracks();
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 10 } },
                audio: false
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            stream.getVideoTracks()[0].onended = () => stopMediaTracks();
            setIsScreenSharing(true);
            startSendingFrames();
        } catch (error) {
            console.error('[VoiceModal] Error starting screen share:', error);
            setIsScreenSharing(false);
        }
    };

    const startSendingFrames = () => {
        if (videoIntervalRef.current) {
            clearInterval(videoIntervalRef.current);
        }
        videoIntervalRef.current = setInterval(() => {
            if (videoRef.current) {
                let telemetryString = '';
                if (isBiomechanicsAgent && anglesRef.current) {
                    const currentAngles = anglesRef.current;
                    const nAngle = currentAngles.neck ?? neckAngle;
                    const tAngle = currentAngles.trunk ?? trunkAngle;
                    const aAngle = currentAngles.arm ?? armAngle;
                    const eAngle = currentAngles.elbow ?? elbowAngle;
                    const kAngle = currentAngles.knee ?? kneeAngle;

                    const parts: string[] = [];
                    if (nAngle !== null) parts.push(`Cuello: ${nAngle}° (${neckInfo.status})`);
                    if (tAngle !== null) parts.push(`Tronco: ${tAngle}° (${trunkInfo.status})`);
                    if (aAngle !== null) parts.push(`Brazo: ${aAngle}° (${armInfo.status})`);
                    if (eAngle !== null) parts.push(`Codo: ${eAngle}° (${elbowInfo.status})`);
                    if (kAngle !== null) parts.push(`Rodilla: ${kAngle}° (${kneeInfo.status})`);

                    if (parts.length > 0) {
                        const phaseName = currentPhaseRef.current?.name || 'Evaluación General';
                        const perspective = capturePerspectiveRef.current || 'Auto-evaluación';
                        telemetryString = `[Telemetría Articular en Vivo • ${phaseName} • ${perspective}]: ${parts.join(', ')}`;
                    }
                } else {
                    const proto = activeProtocolRef.current;
                    const phase = currentPhaseRef.current || proto.phases[0];
                    const perspective = capturePerspectiveRef.current || 'Auto-evaluación';
                    telemetryString = `[Inspección en Vivo • ${proto.title} • ${phase.name} • ${perspective} • Enfoque: ${phase.focus}]`;
                }

                sendVideoFrame(
                    videoRef.current,
                    telemetryString,
                    isBiomechanicsAgent && canvasRef.current ? canvasRef.current : null
                );
            }
        }, 1200);
    };

    const toggleCamera = () => { isCameraOn ? stopMediaTracks() : startCamera(); };
    const toggleScreenShare = () => { isScreenSharing ? stopMediaTracks() : startScreenShare(); };
    const switchCamera = () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        if (isCameraOn) { stopMediaTracks(); setTimeout(() => startCamera(newMode), 200); }
    };

    // Helper to capture video frame with digital zoom support
    const captureSnapshot = useCallback((): string | null => {
        const video = videoRef.current;
        if (!video) return null;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
            console.warn('[VoiceModal] captureSnapshot: video not ready (0x0), skipping');
            return null;
        }
        try {
            // Limit maximum dimension to 640px to reduce payload size and speed up transmission over WebSocket
            const maxDim = 640;
            let targetW = w;
            let targetH = h;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    targetW = maxDim;
                    targetH = Math.round((h * maxDim) / w);
                } else {
                    targetH = maxDim;
                    targetW = Math.round((w * maxDim) / h);
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const sw = w / zoom;
                const sh = h / zoom;
                const sx = (w - sw) / 2;
                const sy = (h - sh) / 2;
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
                if (isBiomechanicsAgent && canvasRef.current) {
                    ctx.drawImage(canvasRef.current, 0, 0, targetW, targetH);
                }
                const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                console.log(`[VoiceModal] Snapshot captured and scaled: ${targetW}x${targetH} (original: ${w}x${h}, zoom: ${zoom}x)`);
                return dataUrl;
            }
        } catch (e) {
            console.error('Error capturing snapshot in VoiceModal:', e);
        }
        return null;
    }, [zoom, isBiomechanicsAgent]);

    const onPoseResults = useCallback((results: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!results.poseLandmarks) return;

        // 1. Draw glowing neon HUD skeleton
        ctx.save();
        
        // Neon cyan connections glow
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        if (window.drawConnectors && window.POSE_CONNECTIONS) {
            const bodyConnections = window.POSE_CONNECTIONS.filter(([p1, p2]: [number, number]) => p1 >= 11 && p2 >= 11);
            window.drawConnectors(ctx, results.poseLandmarks, bodyConnections, {
                color: '#06b6d4',
                lineWidth: 3
            });
        }

        // Neon emerald joints glow (only body joints, slicing index 11 onwards)
        ctx.shadowColor = '#10b981';
        if (window.drawLandmarks) {
            window.drawLandmarks(ctx, results.poseLandmarks.slice(11), {
                color: '#10b981',
                fillColor: '#06b6d4',
                lineWidth: 2,
                radius: 4
            });
        }
        ctx.restore();

        // 2. Ergo calculations
        const landmarks = results.poseLandmarks;
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];

        // Side visibility check
        const leftVisible = (leftEar?.visibility ?? 0) > 0.5 && (leftShoulder?.visibility ?? 0) > 0.5 && (leftHip?.visibility ?? 0) > 0.5;
        const rightVisible = (rightEar?.visibility ?? 0) > 0.5 && (rightShoulder?.visibility ?? 0) > 0.5 && (rightHip?.visibility ?? 0) > 0.5;

        let activeEar: any = null;
        let activeShoulder: any = null;
        let activeHip: any = null;
        let activeElbow: any = null;
        let activeWrist: any = null;
        let activeKnee: any = null;
        let activeAnkle: any = null;

        if (leftVisible && (!rightVisible || (leftShoulder.visibility ?? 0) > (rightShoulder.visibility ?? 0))) {
            activeEar = leftEar;
            activeShoulder = leftShoulder;
            activeHip = leftHip;
            activeElbow = leftElbow;
            activeWrist = leftWrist;
            activeKnee = leftKnee;
            activeAnkle = leftAnkle;
        } else if (rightVisible) {
            activeEar = rightEar;
            activeShoulder = rightShoulder;
            activeHip = rightHip;
            activeElbow = rightElbow;
            activeWrist = rightWrist;
            activeKnee = rightKnee;
            activeAnkle = rightAnkle;
        } else {
            activeEar = leftEar || rightEar;
            activeShoulder = leftShoulder || rightShoulder;
            activeHip = leftHip || rightHip;
            activeElbow = leftElbow || rightElbow;
            activeWrist = leftWrist || rightWrist;
            activeKnee = leftKnee || rightKnee;
            activeAnkle = leftAnkle || rightAnkle;
        }

        let neckDeg: number | null = null;
        let trunkDeg: number | null = null;
        let armDeg: number | null = null;
        let elbowDegVal: number | null = null;
        let kneeFlexVal: number | null = null;

        // Cervical angle (flexion/tilt) calculation
        const nose = landmarks[0];
        const noseVisible = nose && (nose.visibility ?? 0) > 0.5;
        const leftEarVisible = leftEar && (leftEar.visibility ?? 0) > 0.5;
        const rightEarVisible = rightEar && (rightEar.visibility ?? 0) > 0.5;
        const leftShoulderVisible = leftShoulder && (leftShoulder.visibility ?? 0) > 0.5;
        const rightShoulderVisible = rightShoulder && (rightShoulder.visibility ?? 0) > 0.5;

        // Determine if we are in frontal view or side view
        // In frontal view, both shoulders are visible and separated horizontally
        const isFrontalView = leftShoulderVisible && rightShoulderVisible && 
                              Math.abs(leftShoulder.x - rightShoulder.x) > 0.12;

        if (isFrontalView) {
            // Frontal view: use midpoints or nose to estimate head center
            let headCenterX: number | null = null;
            let headCenterY: number | null = null;

            if (noseVisible) {
                // Nose is the most stable center point in frontal view
                headCenterX = nose.x;
                headCenterY = nose.y;
            } else if (leftEarVisible && rightEarVisible) {
                // Fallback to ears midpoint
                headCenterX = (leftEar.x + rightEar.x) / 2;
                headCenterY = (leftEar.y + rightEar.y) / 2;
            }

            const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
            const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;

            if (headCenterX !== null && headCenterY !== null) {
                const neckDx = shoulderCenterX - headCenterX;
                const neckDy = shoulderCenterY - headCenterY;
                if (neckDy > 0) {
                    const neckRad = Math.atan2(Math.abs(neckDx), neckDy);
                    neckDeg = Math.round(neckRad * (180 / Math.PI));
                }
            }
        } else {
            // Side view: use the visible side's ear and shoulder
            let activeEar: any = null;
            let activeShoulder: any = null;

            if (leftEarVisible && leftShoulderVisible) {
                activeEar = leftEar;
                activeShoulder = leftShoulder;
            } else if (rightEarVisible && rightShoulderVisible) {
                activeEar = rightEar;
                activeShoulder = rightShoulder;
            } else {
                // Fallback to whatever is available
                activeEar = leftEarVisible ? leftEar : (rightEarVisible ? rightEar : null);
                activeShoulder = leftShoulderVisible ? leftShoulder : (rightShoulderVisible ? rightShoulder : null);
            }

            if (activeEar && activeShoulder) {
                const neckDx = activeShoulder.x - activeEar.x;
                const neckDy = activeShoulder.y - activeEar.y;
                if (Math.abs(neckDy) > 0) {
                    const neckRad = Math.atan2(Math.abs(neckDx), Math.abs(neckDy));
                    neckDeg = Math.round(neckRad * (180 / Math.PI));
                }
            }
        }

        // Trunk angle (flexion from vertical)
        if (activeShoulder && activeHip && (activeShoulder.visibility ?? 0) > 0.5 && (activeHip.visibility ?? 0) > 0.5) {
            const trunkDx = activeShoulder.x - activeHip.x;
            const trunkDy = activeHip.y - activeShoulder.y;
            const trunkRad = Math.atan2(Math.abs(trunkDx), Math.abs(trunkDy));
            trunkDeg = Math.round(trunkRad * (180 / Math.PI));
        }

        // Arm angle (abduction from spine)
        if (activeHip && activeShoulder && activeElbow && (activeHip.visibility ?? 0) > 0.5 && (activeShoulder.visibility ?? 0) > 0.5 && (activeElbow.visibility ?? 0) > 0.5) {
            const v1 = { x: activeHip.x - activeShoulder.x, y: activeHip.y - activeShoulder.y };
            const v2 = { x: activeElbow.x - activeShoulder.x, y: activeElbow.y - activeShoulder.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
            if (mag1 * mag2 > 0) {
                const cosAngle = dot / (mag1 * mag2);
                armDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI));
            }
        }

        // Elbow flexion angle (relative angle at elbow joint)
        if (activeShoulder && activeElbow && activeWrist && (activeShoulder.visibility ?? 0) > 0.5 && (activeElbow.visibility ?? 0) > 0.5 && (activeWrist.visibility ?? 0) > 0.5) {
            const v1 = { x: activeShoulder.x - activeElbow.x, y: activeShoulder.y - activeElbow.y };
            const v2 = { x: activeWrist.x - activeElbow.x, y: activeWrist.y - activeElbow.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
            if (mag1 * mag2 > 0) {
                const cosAngle = dot / (mag1 * mag2);
                elbowDegVal = Math.round(Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI));
            }
        }

        // Knee flexion angle (deviation from 180 degrees)
        if (activeHip && activeKnee && activeAnkle && (activeHip.visibility ?? 0) > 0.5 && (activeKnee.visibility ?? 0) > 0.5 && (activeAnkle.visibility ?? 0) > 0.5) {
            const v1 = { x: activeHip.x - activeKnee.x, y: activeHip.y - activeKnee.y };
            const v2 = { x: activeAnkle.x - activeKnee.x, y: activeAnkle.y - activeKnee.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
            if (mag1 * mag2 > 0) {
                const cosAngle = dot / (mag1 * mag2);
                const kneeRawDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI));
                kneeFlexVal = Math.max(0, 180 - kneeRawDeg);
            }
        }

        anglesRef.current = {
            neck: neckDeg,
            trunk: trunkDeg,
            arm: armDeg,
            elbow: elbowDegVal,
            knee: kneeFlexVal,
        };

        // Throttle React state updates to at most once every 350ms (prevents 75 re-renders/sec)
        const now = Date.now();
        if (now - lastStateUpdateRef.current >= 350) {
            lastStateUpdateRef.current = now;
            setNeckAngle(neckDeg);
            setTrunkAngle(trunkDeg);
            setArmAngle(armDeg);
            setElbowAngle(elbowDegVal);
            setKneeAngle(kneeFlexVal);
        }

        // Posture status is updated dynamically for manual capture.
    }, []);

    // Load MediaPipe scripts on demand when isBiomechanicsAgent is true
    useEffect(() => {
        if (!isOpen || !isBiomechanicsAgent) return;

        let active = true;
        console.log('[VoiceModal] Biomechanics agent detected. Loading Vision AI...');
        setStatusText('Cargando Visión Artificial...');

        const loadAll = async () => {
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
                await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
                
                if (active) {
                    console.log('[VoiceModal] Vision AI successfully loaded!');
                    setIsMediaPipeLoaded(true);
                    setStatusText('Visión IA Preparada');
                }
            } catch (err) {
                console.error('[VoiceModal] Error loading Vision AI scripts:', err);
                if (active) {
                    setStatusText('Error de Visión IA');
                }
            }
        };

        loadAll();

        return () => {
            active = false;
        };
    }, [isOpen, isBiomechanicsAgent]);

    // Initialize and handle MediaPipe Pose instance
    useEffect(() => {
        if (!isMediaPipeLoaded || !isCameraOn || !isBiomechanicsAgent) {
            if (poseRef.current) {
                try {
                    poseRef.current.close();
                } catch (e) {
                    console.error('Error closing poseRef in VoiceModal:', e);
                }
                poseRef.current = null;
            }
            setIsPoseActive(false);
            return;
        }

        console.log('[VoiceModal] Initializing MediaPipe Pose instance...');
        
        try {
            const pose = new window.Pose({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
            });

            pose.setOptions({
                modelComplexity: 0, // Lite (Ultra-fast, saves 70% CPU/GPU and prevents Main Thread freezing)
                smoothLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            pose.onResults((results: any) => {
                onPoseResults(results);
            });

            poseRef.current = pose;
            setIsPoseActive(true);
            console.log('[VoiceModal] Pose instance ready!');
        } catch (e) {
            console.error('Error creating Pose instance in VoiceModal:', e);
        }

        return () => {
            if (poseRef.current) {
                try {
                    poseRef.current.close();
                } catch (e) {
                    console.error('Error closing poseRef on cleanup in VoiceModal:', e);
                }
                poseRef.current = null;
            }
            setIsPoseActive(false);
        };
    }, [isMediaPipeLoaded, isCameraOn, isBiomechanicsAgent, onPoseResults]);

    // Process frames at 10 FPS (optimal for real-time ergonomics without freezing the main thread)
    useEffect(() => {
        if (!isPoseActive || !videoRef.current) return;

        let active = true;
        let lastFrameTime = 0;
        const fpsInterval = 1000 / 10; // Limit to 10 FPS

        const poseLoop = async () => {
            if (!active) return;

            const now = Date.now();
            const elapsed = now - lastFrameTime;

            if (elapsed >= fpsInterval) {
                lastFrameTime = now - (elapsed % fpsInterval);

                const video = videoRef.current;
                if (video && video.readyState >= 2 && poseRef.current) {
                    const canvas = canvasRef.current;
                    if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                    }

                    try {
                        await poseRef.current.send({ image: video });
                    } catch (e) {
                        console.error('[VoiceModal] Pose send error:', e);
                    }
                }
            }

            requestAnimationFrame(poseLoop);
        };

        requestAnimationFrame(poseLoop);

        return () => {
            active = false;
        };
    }, [isPoseActive]);

    const handleManualCapture = useCallback(() => {
        if (!isCameraOn && !isScreenSharing) return;

        if (manualPhotosCountRef.current >= 10) {
            setLimitNotification("Límite alcanzado: Máximo 10 fotos de evidencia permitidas.");
            setTimeout(() => {
                setLimitNotification(null);
            }, 4000);
            return;
        }

        const dataUrl = captureSnapshot();
        if (dataUrl) {
            // Trigger visual flash
            setIsFlashActive(true);
            setTimeout(() => setIsFlashActive(false), 250);

            // Update local state to show on screen
            setManualCapturedPhotos((prev) => {
                const next = [...prev, dataUrl];
                manualPhotosCountRef.current = next.length;
                return next;
            });

            // Send to backend via WS (extract base64 payload from data URL)
            const base64 = dataUrl.split(',')[1];

            // Construct telemetry description at the exact moment of user manual capture
            const currentAngles = anglesRef.current;
            const nAngle = currentAngles.neck ?? neckAngle;
            const tAngle = currentAngles.trunk ?? trunkAngle;
            const aAngle = currentAngles.arm ?? armAngle;
            const eAngle = currentAngles.elbow ?? elbowAngle;
            const kAngle = currentAngles.knee ?? kneeAngle;

            let telemetryParts: string[] = [];
            if (nAngle !== null) telemetryParts.push(`Flexión Cervical: ${nAngle}° (${neckInfo.status})`);
            if (tAngle !== null) telemetryParts.push(`Flexión de Tronco: ${tAngle}° (${trunkInfo.status})`);
            if (aAngle !== null) telemetryParts.push(`Abducción de Brazo: ${aAngle}° (${armInfo.status})`);
            if (eAngle !== null) telemetryParts.push(`Flexión de Codo: ${eAngle}° (${elbowInfo.status})`);
            if (kAngle !== null) telemetryParts.push(`Flexión de Rodilla: ${kAngle}° (${kneeInfo.status})`);

            const proto = activeProtocolRef.current;
            const phase = currentPhaseRef.current || proto.phases[0];
            const perspective = capturePerspectiveRef.current || 'Auto-evaluación';

            let telemetryText = '';
            if (isBiomechanicsAgent) {
                telemetryText = telemetryParts.length > 0 
                    ? `[Captura de Evidencia Biomecánica • ${phase.name} • Perspectiva: ${perspective}] Registro de telemetría articular en el momento de la captura: ${telemetryParts.join(', ')}.`
                    : `[Captura de Evidencia Biomecánica • ${phase.name} • Perspectiva: ${perspective}] Captura de evidencia sin telemetría articular activa en el momento.`;
            } else {
                telemetryText = `[Captura de Evidencia Técnica • ${proto.title} • ${phase.name} • Perspectiva: ${perspective} • Enfoque: ${phase.focus}] Evidencia fotográfica registrada en el ciclo de inspección.`;
            }

            sendEvidenceImage(base64, telemetryText);

            // Auto-advance to next phase if not at last phase
            setCurrentPhaseIndex((prev) => (prev < proto.phases.length - 1 ? prev + 1 : prev));

            console.log(`[VoiceModal] Manual photo captured for ${proto.title} - ${phase.name} (${perspective}). Total manual photos: ${manualPhotosCountRef.current}`);
        }
    }, [
        isCameraOn, 
        isScreenSharing, 
        captureSnapshot, 
        sendEvidenceImage, 
        setManualCapturedPhotos,
        neckAngle,
        neckInfo.status,
        trunkAngle,
        trunkInfo.status,
        armAngle,
        armInfo.status,
        elbowAngle,
        elbowInfo.status,
        kneeAngle,
        kneeInfo.status
    ]);

    const [isPlaying, setIsPlaying] = useState(false);
    const outputAnalyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

    useEffect(() => {
        const updateAmplitude = () => {
            let vol = 0;
            if (status === 'speaking' && isPlaying && outputAnalyserRef.current) {
                const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
                outputAnalyserRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                vol = Math.min(1, (average / 255) * 2);
            } else if (status === 'listening' || status === 'ready') {
                vol = getInputVolume();
            }
            setAudioAmplitude(vol);
            animationFrameRef.current = requestAnimationFrame(updateAmplitude);
        };
        updateAmplitude();
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [status, isPlaying, getInputVolume]);

    function handleAudioReceived(audioData: string) {
        try {
            // Obtener o crear el AudioContext de reproducción (24kHz)
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                const existing = (window as any).sharedAudioContext24k;
                audioContextRef.current = (existing && existing.state !== 'closed')
                    ? existing
                    : new AudioContextClass({ sampleRate: 24000 });
                (window as any).sharedAudioContext24k = audioContextRef.current;
            }

            // Guardia de null explícita antes de usar ctx
            const ctx = audioContextRef.current;
            if (!ctx) return;

            console.log('[VoiceModal] AudioContext 24kHz estado al recibir audio:', ctx.state);

            // Decodificar audio (PCM 16-bit → Float32)
            const binaryString = atob(audioData);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
            const dataView = new DataView(bytes.buffer);
            const float32Data = new Float32Array(len / 2);
            for (let i = 0; i < len / 2; i++) {
                const int16 = dataView.getInt16(i * 2, true);
                float32Data[i] = int16 / 32768.0;
            }

            const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
            audioBuffer.getChannelData(0).set(float32Data);

            if (ctx.state === 'suspended') {
                console.warn('[VoiceModal] AudioContext suspendido al recibir audio — intentando reanudar y encolando buffer...');
                ctx.resume().catch((err) => {
                    console.error('[VoiceModal] No se pudo reanudar AudioContext:', err);
                });
            }

            scheduleAudio(audioBuffer);
        } catch (error) {
            console.error('[VoiceModal] Error processing audio:', error);
        }
    }

    function scheduleAudio(buffer: AudioBuffer) {
        if (!audioContextRef.current) return;
        const ctx = audioContextRef.current;
        const currentTime = ctx.currentTime;
        if (nextStartTimeRef.current < currentTime) {
            nextStartTimeRef.current = currentTime + 0.05;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        // Verificar que el analyser pertenece al contexto actual (no a uno antiguo)
        // Si el contexto fue recreado, el analyser viejo es inválido y hay que descartarlo
        if (!outputAnalyserRef.current || (outputAnalyserRef.current as any).context !== ctx) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            outputAnalyserRef.current = analyser;
            analyser.connect(ctx.destination);
        }
        source.connect(outputAnalyserRef.current);
        
        activeSourcesRef.current.push(source);
        
        source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
            if (activeSourcesRef.current.length === 0) {
                setIsPlaying(false);
                setIsPlayingAudio(false);
            }
        };

        setIsPlaying(true);
        setIsPlayingAudio(true);
        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += buffer.duration;
    }

    const clearAudioQueue = () => {
        activeSourcesRef.current.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Ignorar si ya se detuvo
            }
            try {
                source.disconnect();
            } catch (e) {}
        });
        activeSourcesRef.current = [];
        nextStartTimeRef.current = 0;
        setIsPlaying(false);
        setIsPlayingAudio(false);
    };

    const toggleMute = () => {
        if (status === 'speaking') {
            console.log('[VoiceModal] User tapped mic button during AI speech -> triggering immediate interrupt');
            sendInterrupt();
            clearAudioQueue();
            setIsMuted(false);
            setMuted(false);
            return;
        }
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        setMuted(newMuted);
    };

    const handleVoiceChange = (voiceId: string) => {
        setSelectedVoice(voiceId);
        setVoiceChatGeneral(voiceId);
        clearAudioQueue();
        changeVoice(voiceId);
        setShowVoiceSelector(false);
    };

    const handleOrbClick = () => {
        if (status === 'ready' || status === 'idle') {
            setShowVoiceSelector(!showVoiceSelector);
        }
    };

    if (!isOpen) return null;

    const countdown = countdownValue;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-300">
            <div className="relative w-full h-full flex flex-col overflow-hidden">

                {/* Limit Notification Toast */}
                {limitNotification && (
                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 bg-red-950/90 border border-red-500/50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-red-200">{limitNotification}</span>
                    </div>
                )}

                {/* Report Generation Progress Toast */}
                {isGeneratingReport && (
                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 bg-black/85 backdrop-blur-xl border border-cyan-500/50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin flex-shrink-0"></div>
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-cyan-200">Compilando informe técnico ergonómico...</span>
                            <span className="text-[10px] text-cyan-400/80">Estará disponible en tu chat en unos segundos</span>
                        </div>
                    </div>
                )}

                {/* Report Success Toast */}
                {reportSuccess && (
                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 bg-emerald-950/90 backdrop-blur-xl border border-emerald-500/50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
                        <span className="text-emerald-400 text-base">✅</span>
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-emerald-200">¡Informe técnico generado exitosamente!</span>
                            <span className="text-[10px] text-emerald-400/80">Guardado y disponible en tu conversación de chat</span>
                        </div>
                    </div>
                )}

                {/* Specialized Inspection HUD for SST Agents & Biomechanics Vision AI */}
                {(isBiomechanicsAgent || isCameraOn || isConnected || isReady) && (
                    isBiomechanicsAgent ? (
                        <div className="absolute top-4 left-4 right-4 z-40 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-wrap gap-2 md:gap-4 justify-between items-center transition-all animate-in fade-in duration-300">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></span>
                                <span className="text-[10px] md:text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">{activeProtocol.badgeText}</span>
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-semibold">
                                    {kneeAngle !== null && kneeAngle > 25 ? 'Método: REBA (Cuerpo Entero)' : 'Método: RULA (Miembros Sup.)'}
                                </span>
                                {/* Perspective Badge */}
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-semibold flex items-center gap-1">
                                    <UserCheck className="w-3 h-3 text-emerald-400" />
                                    {capturePerspective}
                                </span>
                                {/* Ergonomic Multi-Phase Selector */}
                                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                                    {activeProtocol.phases.map((p, idx) => (
                                        <button
                                            key={p.id}
                                            onClick={() => setCurrentPhaseIndex(idx)}
                                            className={`px-2 py-0.5 rounded-lg text-[9px] font-mono transition-all duration-200 ${
                                                currentPhaseIndex === idx 
                                                    ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/30' 
                                                    : 'text-white/60 hover:text-white hover:bg-white/10'
                                            }`}
                                            title={p.desc}
                                        >
                                            {p.shortName}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 md:gap-3 items-center">
                                {/* Neck Angle */}
                                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${neckInfo.colorClass}`}>
                                    <span className="text-[9px] font-mono font-medium opacity-60">Cuello</span>
                                    <span className={`text-xs font-bold font-mono ${neckInfo.valColorClass}`}>
                                        {neckAngle !== null ? `${neckAngle}°` : '--'}
                                    </span>
                                    <span className={`text-[9px] uppercase tracking-wider font-mono ${neckInfo.textClass}`}>
                                        {neckInfo.status}
                                    </span>
                                </div>
                                {/* Trunk Angle */}
                                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${trunkInfo.colorClass}`}>
                                    <span className="text-[9px] font-mono font-medium opacity-60">Tronco</span>
                                    <span className={`text-xs font-bold font-mono ${trunkInfo.valColorClass}`}>
                                        {trunkAngle !== null ? `${trunkAngle}°` : '--'}
                                    </span>
                                    <span className={`text-[9px] uppercase tracking-wider font-mono ${trunkInfo.textClass}`}>
                                        {trunkInfo.status}
                                    </span>
                                </div>
                                {/* Arm Angle */}
                                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${armInfo.colorClass}`}>
                                    <span className="text-[9px] font-mono font-medium opacity-60">Brazo</span>
                                    <span className={`text-xs font-bold font-mono ${armInfo.valColorClass}`}>
                                        {armAngle !== null ? `${armAngle}°` : '--'}
                                    </span>
                                    <span className={`text-[9px] uppercase tracking-wider font-mono ${armInfo.textClass}`}>
                                        {armInfo.status}
                                    </span>
                                </div>
                                {/* Elbow Angle */}
                                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${elbowInfo.colorClass}`}>
                                    <span className="text-[9px] font-mono font-medium opacity-60">Codo</span>
                                    <span className={`text-xs font-bold font-mono ${elbowInfo.valColorClass}`}>
                                        {elbowAngle !== null ? `${elbowAngle}°` : '--'}
                                    </span>
                                    <span className={`text-[9px] uppercase tracking-wider font-mono ${elbowInfo.textClass}`}>
                                        {elbowInfo.status}
                                    </span>
                                </div>
                                {/* Knee Angle */}
                                <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${kneeInfo.colorClass}`}>
                                    <span className="text-[9px] font-mono font-medium opacity-60">Rodilla</span>
                                    <span className={`text-xs font-bold font-mono ${kneeInfo.valColorClass}`}>
                                        {kneeAngle !== null ? `${kneeAngle}°` : '--'}
                                    </span>
                                    <span className={`text-[9px] uppercase tracking-wider font-mono ${kneeInfo.textClass}`}>
                                        {kneeInfo.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="absolute top-4 left-4 right-4 z-40 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl flex flex-wrap gap-2 md:gap-4 justify-between items-center transition-all animate-in fade-in duration-300">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: activeProtocol.accentColor }}></span>
                                <span className="text-[10px] md:text-xs font-mono font-bold uppercase tracking-wider text-white">
                                    {activeProtocol.badgeText}
                                </span>
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/90 font-mono font-semibold">
                                    {activeProtocol.methodLabel} ({activeProtocol.normRef})
                                </span>
                                {/* Perspective Badge */}
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-semibold flex items-center gap-1">
                                    <UserCheck className="w-3 h-3 text-emerald-400" />
                                    {capturePerspective}
                                </span>
                                {/* Specialized Multi-Phase Selector */}
                                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                                    {activeProtocol.phases.map((p, idx) => (
                                        <button
                                            key={p.id}
                                            onClick={() => setCurrentPhaseIndex(idx)}
                                            className={`px-2.5 py-1 rounded-lg text-[9px] font-mono transition-all duration-200 ${
                                                currentPhaseIndex === idx 
                                                    ? 'text-black font-bold shadow-md' 
                                                    : 'text-white/60 hover:text-white hover:bg-white/10'
                                            }`}
                                            style={currentPhaseIndex === idx ? { backgroundColor: activeProtocol.accentColor, color: '#000' } : {}}
                                            title={p.desc}
                                        >
                                            {p.shortName}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-white/5 border border-white/10">
                                <span className="text-[9px] font-mono text-white/50 uppercase tracking-wider">Enfoque:</span>
                                <span className="text-[10px] font-mono text-white font-medium">
                                    {currentPhase.focus}
                                </span>
                            </div>
                        </div>
                    )
                )}

                {/* ── Video Background ── */}
                <div className="absolute inset-0 z-0 overflow-hidden bg-surface-primary">
                    <video
                        ref={videoRef}
                        className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${isCameraOn || isScreenSharing ? 'opacity-100 scale-100' : 'opacity-0 scale-110 blur-xl'}`}
                        muted playsInline
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                    />

                    {/* Simplified Neon HUD Canvas Overlay */}
                    {isBiomechanicsAgent && (isCameraOn || isScreenSharing) && (
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
                            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                        />
                    )}

                    {/* Zoom Button */}
                    {isCameraOn && (
                        <button
                            onClick={() => setZoom(z => z === 1 ? 2 : z === 2 ? 3 : 1)}
                            className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 z-40 bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/10 rounded-full w-10 h-10 flex items-center justify-center shadow-lg text-white font-mono text-[10px] font-bold pointer-events-auto transition-all active:scale-95"
                        >
                            {zoom}x
                        </button>
                    )}

                    {/* Camera Flash Overlay */}
                    {isFlashActive && (
                        <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-flash"></div>
                    )}

                    {(isCameraOn || isScreenSharing) && (
                        <>
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_2px] opacity-15"></div>
                            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.5)]"></div>
                            <div className="absolute top-12 left-12 w-8 h-8 border-t-2 border-l-2 border-white/40 rounded-tl-sm pointer-events-none"></div>
                            <div className="absolute top-12 right-12 w-8 h-8 border-t-2 border-r-2 border-white/40 rounded-tr-sm pointer-events-none"></div>
                            <div className="absolute bottom-32 left-12 w-8 h-8 border-b-2 border-l-2 border-white/40 rounded-bl-sm pointer-events-none"></div>
                            <div className="absolute bottom-32 right-12 w-8 h-8 border-b-2 border-r-2 border-white/40 rounded-br-sm pointer-events-none"></div>
                            {status === 'thinking' && (
                                <div className="absolute top-0 left-0 w-full h-1 bg-teal-400/50 shadow-[0_0_15px_rgba(45,212,191,0.8)] z-10 animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Center: Voice Orb ── */}
                <div className="flex-1 flex flex-col items-center justify-center z-10 relative">
                    <div
                        onClick={handleOrbClick}
                        className={`cursor-pointer transition-all duration-500 transform opacity-30 hover:opacity-80 ${status === 'speaking' ? 'scale-110' : 'scale-100'}`}
                    >
                        <VoiceOrb status={status === 'ready' ? 'idle' : status} amplitude={audioAmplitude} className="drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" />
                    </div>

                    {showVoiceSelector && (
                        <div className="absolute top-full mt-8 bg-surface-primary border border-white/10 rounded-xl shadow-2xl p-2 min-w-[200px] z-50 overflow-hidden">
                            <div className="px-3 py-2 border-b border-light/10 text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">
                                Select System Voice
                            </div>
                            <VoiceSelector selectedVoice={selectedVoice} onVoiceChange={handleVoiceChange} />
                        </div>
                    )}
                </div>

                {/* ── Bottom Control Bar (Glassmorphism) ── */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 z-30 flex flex-col items-center gap-6">
                    {/* Floating Thumbnail Carousel of captured evidence */}
                    {manualCapturedPhotos.length > 0 && (
                        <div className="flex flex-col items-center gap-2 max-w-full px-4 animate-in slide-in-from-bottom-2 duration-300">
                            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded shadow">
                                Evidencia Capturada ({manualCapturedPhotos.length})
                            </span>
                            <div className="flex items-center gap-2 overflow-x-auto max-w-[90vw] pb-2 scrollbar-none">
                                {manualCapturedPhotos.map((src, idx) => (
                                    <div key={idx} className="relative w-16 h-16 rounded-lg border border-white/20 overflow-hidden shadow-md flex-shrink-0 group hover:border-emerald-500 transition-colors">
                                        <img src={src} alt={`Evidencia ${idx + 1}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-1 text-center">
                                            <span className="text-[8px] font-mono text-cyan-300 font-bold">Fase {Math.min(idx + 1, 3)}</span>
                                            <span className="text-[7px] font-mono text-white/80">#{idx + 1}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-1.5 sm:gap-4 bg-black/60 backdrop-blur-2xl px-2.5 sm:px-8 py-2 sm:py-5 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 shadow-2xl transition-all hover:bg-black/70 group max-w-[95vw]">

                        {/* Camera */}
                        <TooltipAnchor
                            description={isCameraOn ? localize('com_ui_voice_camera_off' as any) : localize('com_ui_voice_camera_on' as any)}
                            render={
                                <button
                                    onClick={toggleCamera}
                                    disabled={isScreenSharing}
                                    className={`p-2.5 sm:p-4 rounded-full transition-all duration-300 transform active:scale-95 ${isCameraOn ? 'bg-white text-black shadow-lg shadow-white/20' : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'} ${isScreenSharing ? 'opacity-20 cursor-not-allowed' : ''}`}
                                >
                                    {isCameraOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
                                </button>
                            }
                        />

                        {/* Camera Shutter Button */}
                        {(isCameraOn || isScreenSharing) && (
                            <TooltipAnchor
                                description={`Capturar ${currentPhase.name} (${capturePerspective})`}
                                render={
                                    <button
                                        onClick={handleManualCapture}
                                        className="relative p-2.5 sm:p-4 rounded-full bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all duration-300 transform active:scale-90 border border-emerald-400/30"
                                    >
                                        <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span className="absolute -top-1 -right-1 bg-black/80 text-cyan-300 text-[8px] font-mono font-bold px-1 rounded-full border border-cyan-500/50">
                                            {currentPhaseIndex + 1}/{activeProtocol.phases.length}
                                        </span>
                                    </button>
                                }
                            />
                        )}

                        {/* Camera Switch */}
                        {isCameraOn && (
                            <TooltipAnchor
                                description={localize('com_ui_switch_camera' as any)}
                                render={
                                    <button 
                                        onClick={switchCamera} 
                                        className="p-2.5 sm:p-4 rounded-full bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 border border-amber-500/30 transition-all transform active:rotate-180 duration-500 shadow-md shadow-amber-900/20"
                                    >
                                        <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                }
                            />
                        )}

                        <div className="w-[1px] h-6 sm:h-8 bg-white/10 mx-1 sm:mx-2"></div>

                        {/* Microphone (Center hero button) */}
                        <TooltipAnchor
                            description={isMuted ? localize('com_nav_voice_unmute' as any) : localize('com_nav_voice_mute' as any)}
                            render={
                                <button
                                    onClick={toggleMute}
                                    className={`p-3.5 sm:p-5 rounded-full transition-all duration-500 transform active:scale-90 ${isMuted ? 'bg-red-500/20 text-red-500 border border-red-500/50 backdrop-blur-md' : 'bg-white text-black shadow-xl shadow-white/10 scale-105 sm:scale-110 border-4 border-white'}`}
                                >
                                    {isMuted ? <MicOff className="w-6 h-6 sm:w-7 sm:h-7" /> : (
                                        <div className="relative">
                                            <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
                                            {status === 'listening' && (
                                                <span className="absolute -top-3 -right-3 flex h-4 w-4">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-teal-500"></span>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </button>
                            }
                        />

                        <div className="w-[1px] h-6 sm:h-8 bg-white/10 mx-1 sm:mx-2"></div>

                        {/* Screen Share */}
                        {supportsScreenShare && (
                            <TooltipAnchor
                                description={isScreenSharing ? localize('com_ui_voice_screen_share_stop' as any) : localize('com_ui_voice_screen_share_start' as any)}
                                render={
                                    <button
                                        onClick={toggleScreenShare}
                                        disabled={isCameraOn}
                                        className={`p-2.5 sm:p-4 rounded-full transition-all duration-300 transform active:scale-95 ${isScreenSharing ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 border border-blue-400/30' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'} ${isCameraOn ? 'opacity-20 cursor-not-allowed' : ''}`}
                                    >
                                        {isScreenSharing ? <MonitorOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />}
                                    </button>
                                }
                            />
                        )}

                        {/* Generate Report Button */}
                        <TooltipAnchor
                            description={isGeneratingReport ? 'Compilando informe...' : 'Generar Informe Técnico Ergonómico'}
                            render={
                                <button
                                    onClick={handleManualReportClick}
                                    disabled={isGeneratingReport}
                                    className={`p-2.5 sm:p-4 rounded-full transition-all duration-300 transform active:scale-95 flex items-center justify-center ${
                                        isGeneratingReport
                                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 animate-pulse cursor-not-allowed'
                                            : 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white shadow-lg shadow-teal-500/20 border border-teal-300/30'
                                    }`}
                                >
                                    <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                            }
                        />

                        {/* End Call */}
                        <TooltipAnchor
                            description={localize('com_ui_voice_end_call' as any)}
                            render={
                                <button 
                                    onClick={handleClose} 
                                    className="p-2.5 sm:p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all duration-300 transform hover:scale-110 active:scale-95 border border-red-400/20"
                                >
                                    <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                            }
                        />
                    </div>
                </div>

                {/* Scan & Flash animation keyframes */}
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes scan {
                        0% { top: 0; opacity: 0; }
                        5% { opacity: 1; }
                        95% { opacity: 1; }
                        100% { top: 100%; opacity: 0; }
                    }
                    @keyframes flash-effect {
                        0% { opacity: 1; }
                        100% { opacity: 0; }
                    }
                    .animate-flash {
                        animation: flash-effect 0.25s ease-out forwards;
                    }
                `}} />
            </div>
        </div>
    );
};

export default VoiceModal;
