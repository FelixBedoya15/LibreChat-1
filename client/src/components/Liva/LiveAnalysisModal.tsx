import { useState, useEffect, useCallback, useRef, useMemo, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { X, Mic, MicOff, Video, VideoOff, RefreshCcw, Monitor, MonitorOff, PhoneOff, Smartphone, Camera, UserCheck } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import store from '~/store';
import VoiceOrb from '../Voice/VoiceOrb';
import VoiceSelector from '../Voice/VoiceSelector';
import { ERGONOMIC_PHASES } from '../Voice/VoiceModal';
import { useLiveAnalysisSession } from '~/hooks/useLiveAnalysisSession';
import { useLocalize, useAuthContext } from '~/hooks';
import { UpgradeWall } from '~/components/SGSST/UpgradeWall';

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

interface LiveAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversationId?: string;
    onConversationIdUpdate?: (newId: string) => void;
    onTextReceived?: (text: string) => void;
    onReportReceived?: (html: string, kpi?: any, messageId?: string) => void;
    onConversationUpdated?: (conversationId?: string) => void;
    selectedModel?: string;
}

const LiveAnalysisModal: FC<LiveAnalysisModalProps> = ({ isOpen, onClose, conversationId, onConversationIdUpdate, onTextReceived, onReportReceived, onConversationUpdated, selectedModel }) => {
    const localize = useLocalize();
    const [neckAngle, setNeckAngle] = useState<number | null>(null);
    const [trunkAngle, setTrunkAngle] = useState<number | null>(null);
    const [armAngle, setArmAngle] = useState<number | null>(null);
    const [elbowAngle, setElbowAngle] = useState<number | null>(null);
    const [kneeAngle, setKneeAngle] = useState<number | null>(null);
    const [isMediaPipeLoaded, setIsMediaPipeLoaded] = useState(false);
    const [isPoseActive, setIsPoseActive] = useState(false);

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

    const [voiceLiveAnalysis, setVoiceLiveAnalysis] = useRecoilState(store.voiceLiveAnalysis);
    const setShowModalState = useSetRecoilState(store.showLiveAnalysisModal);
    const setIsCanvasActive = useSetRecoilState(store.isCanvasActive);
    const [selectedVoice, setSelectedVoice] = useState<string>((voiceLiveAnalysis as string) || '');
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [statusText, setStatusText] = useState('Initializing...');
    const [isReady, setIsReady] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [showVoiceSelector, setShowVoiceSelector] = useState(false);
    const [audioAmplitude, setAudioAmplitude] = useState(0);

    // Multi-Phase Ergonomic Protocol & Perspective States
    const [currentPhaseIndex, setCurrentPhaseIndex] = useState<number>(0);
    const currentPhase = ERGONOMIC_PHASES[currentPhaseIndex] || ERGONOMIC_PHASES[0];

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

    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [manualCapturedPhotos, setManualCapturedPhotos] = useState<string[]>([]);
    const [isFlashActive, setIsFlashActive] = useState(false);
    const [zoom, setZoom] = useState<number>(1);

    const handleTemplateClick = (templateId: string, templateName: string) => {
        if (isVital && templateId !== 'general') {
            setUpgradeModalTitle("Módulo Exclusivo Pro");
            setUpgradeModalDesc(`El análisis en vivo de ${templateName} es una herramienta avanzada de inspección exclusiva del Plan Wappy Pro.`);
            setShowUpgradeModal(true);
        } else {
            setSelectedTemplate(templateId);
        }
    };

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const snapshotRef = useRef<string | null>(null);
    // Store multiple snapshots for the report (up to 3)
    const snapshotsRef = useRef<string[]>([]);
    const manualPhotosCountRef = useRef<number>(0);
    const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Countdown state - 10 seconds
    const [countdown, setCountdown] = useState(10);

    // Track if report has been received
    const [hasReceivedReport, setHasReceivedReport] = useState(false);
    const [reportNotification, setReportNotification] = useState(false);
    const [limitNotification, setLimitNotification] = useState(false);

    const { user } = useAuthContext();
    const isVital = user?.role === 'USER_IPEVAR' || user?.role === 'IPEVAR';
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeModalTitle, setUpgradeModalTitle] = useState('Desbloquear Reportes');
    const [upgradeModalDesc, setUpgradeModalDesc] = useState('Adquiere Premium para redactar y guardar el informe.');

    const [supportsScreenShare, setSupportsScreenShare] = useState(false);

    // Audio Refs
    const nextStartTimeRef = useRef<number>(0);
    const outputAnalyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const statusRef = useRef<string>('idle');

    const stopAudioPlayback = useCallback(() => {
        if (activeSourcesRef.current.length > 0) {
            activeSourcesRef.current.forEach((src) => {
                try {
                    src.stop();
                    src.disconnect();
                } catch (e) {
                    // Ignorar si ya se había detenido
                }
            });
            activeSourcesRef.current = [];
        }
        if (audioContextRef.current) {
            nextStartTimeRef.current = audioContextRef.current.currentTime;
        } else {
            nextStartTimeRef.current = 0;
        }
    }, []);

    // Toast control Ref
    const prevHasReport = useRef(false);

    // Collapse state for telemetry overlay card (to prevent covering mobile video view)
    const [isTelemetryCollapsed, setIsTelemetryCollapsed] = useState(false);

    // Dynamic Cervical (Neck) risk level calculation matching RULA/REBA guidelines
    const neckInfo = useMemo(() => {
        if (neckAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/1 border-white/5 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (neckAngle > 25) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/10 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (neckAngle > 10) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/8 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/3 border-emerald-500/10 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-cyan-400'
        };
    }, [neckAngle]);

    // Dynamic Column (Trunk) risk level calculation matching RULA/REBA guidelines
    const trunkInfo = useMemo(() => {
        if (trunkAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/1 border-white/5 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (trunkAngle > 25) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/10 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (trunkAngle > 0) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/8 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/3 border-emerald-500/10 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [trunkAngle]);

    // Dynamic Arm Abduction risk level calculation matching RULA/REBA guidelines
    const armInfo = useMemo(() => {
        if (armAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/1 border-white/5 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (armAngle > 45) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/10 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (armAngle > 20) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/8 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/3 border-emerald-500/10 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [armAngle]);

    // Dynamic Elbow Flexion risk level calculation matching RULA guidelines
    const elbowInfo = useMemo(() => {
        if (elbowAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/1 border-white/5 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (elbowAngle < 30 || elbowAngle > 130) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/10 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if ((elbowAngle >= 30 && elbowAngle < 60) || (elbowAngle > 100 && elbowAngle <= 130)) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/8 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/3 border-emerald-500/10 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [elbowAngle]);

    // Dynamic Knee Flexion risk level calculation matching REBA guidelines
    const kneeInfo = useMemo(() => {
        if (kneeAngle === null) {
            return {
                status: '--',
                colorClass: 'bg-white/1 border-white/5 text-white/80',
                textClass: 'text-white/40',
                valColorClass: 'text-white/50'
            };
        }
        if (kneeAngle > 60) {
            return {
                status: 'Crítico',
                colorClass: 'bg-red-500/10 border-red-500/30 text-red-200',
                textClass: 'text-red-400 font-bold animate-pulse',
                valColorClass: 'text-red-400'
            };
        }
        if (kneeAngle > 30) {
            return {
                status: 'Moderado',
                colorClass: 'bg-amber-500/8 border-amber-500/20 text-amber-200',
                textClass: 'text-amber-400 font-semibold',
                valColorClass: 'text-amber-400'
            };
        }
        return {
            status: 'Normal',
            colorClass: 'bg-emerald-500/3 border-emerald-500/10 text-emerald-100',
            textClass: 'text-emerald-400 font-medium',
            valColorClass: 'text-emerald-400'
        };
    }, [kneeAngle]);



    // ==================== HELPER FUNCTIONS & CALLBACKS ====================

    // Helper to capture video frame — validates dimensions before saving
    const captureSnapshot = useCallback((): string | null => {
        const video = videoRef.current;
        if (!video) return null;
        const w = video.videoWidth;
        const h = video.videoHeight;
        // Only capture if video is actually streaming (non-zero dimensions)
        if (!w || !h) {
            console.warn('[LiveAnalysisModal] captureSnapshot: video not ready (0x0), skipping');
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
                const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                console.log(`[LiveAnalysisModal] Snapshot captured and scaled: ${targetW}x${targetH} (original: ${w}x${h}, zoom: ${zoom}x)`);
                return dataUrl;
            }
        } catch (e) {
            console.error('Error capturing snapshot:', e);
        }
        return null;
    }, [zoom]);

    const scheduleAudio = useCallback((buffer: AudioBuffer) => {
        if (!audioContextRef.current) return;

        const currentTime = audioContextRef.current.currentTime;
        if (nextStartTimeRef.current < currentTime) {
            nextStartTimeRef.current = currentTime + 0.05;
        }

        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        activeSourcesRef.current.push(source);
        source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        };

        if (!outputAnalyserRef.current) {
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 256;
            outputAnalyserRef.current = analyser;
            analyser.connect(audioContextRef.current.destination);
        }

        source.connect(outputAnalyserRef.current);
        source.start(nextStartTimeRef.current);

        nextStartTimeRef.current += buffer.duration;
    }, []);

    const handleAudioReceived = useCallback((audioData: string) => {
        try {
            let ctx = audioContextRef.current;
            if (!ctx) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                ctx = ((window as any).sharedAudioContext24k || new AudioContextClass({ sampleRate: 24000 })) as AudioContext;
                audioContextRef.current = ctx;
                (window as any).sharedAudioContext24k = ctx;
            }
            if (ctx.state === 'suspended') {
                ctx.resume().catch(console.error);
            }

            const binaryString = atob(audioData);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

            const float32Data = new Float32Array(len / 2);
            const dataView = new DataView(bytes.buffer);
            for (let i = 0; i < len / 2; i++) float32Data[i] = dataView.getInt16(i * 2, true) / 32768.0;

            const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
            audioBuffer.getChannelData(0).set(float32Data);

            scheduleAudio(audioBuffer);
        } catch (error) {
            console.error('[LiveAnalysisModal] Error processing audio:', error);
        }
    }, [scheduleAudio]);

    const sessionOptions = useMemo(() => ({
        conversationId,
        onConversationIdUpdate,
        disableAudio: false,
        initialVoice: (voiceLiveAnalysis as string) || '',
        selectedModel,
        template: selectedTemplate || 'general',
        onAudioReceived: (audioData: string) => {
            handleAudioReceived(audioData);
        },
        onTextReceived: (text: string) => {
            onTextReceived?.(text);
        },
        onConversationUpdated: (updatedId?: string) => {
            onConversationUpdated?.(updatedId);
        },
        onReportReceived: (html: string, messageId?: string, evaluatedFrames?: string[]) => {
            setHasReceivedReport(true); // Toast is triggered by useEffect watching this
            setIsCanvasActive(true);

            // REGLA DE ORO 1: Si el HTML ya viene completamente formateado del servidor con la plantilla premium esmeralda/teal,
            // no lo envolvemos doblemente. Lo pasamos tal cual al callback del editor principal.
            if (html.includes('WAPPY IA • HSE Command Center') || html.includes('wappy-kpi')) {
                const parseKpi = (rawHtml: string) => {
                    const defaults = { riesgo: 'INDETERMINADO', accion: 'Evaluar', consecuencia: 'Incapacitante', npeligros: '5+' };
                    try {
                        const match = rawHtml.match(/<div[^>]+id=["']wappy-kpi["'][^>]*>/i);
                        if (!match) return defaults;
                        const tag = match[0];
                        const get = (attr: string) => {
                            const m = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
                            return m ? m[1].trim() : '';
                        };
                        return {
                            riesgo:       get('data-riesgo')       || defaults.riesgo,
                            accion:       get('data-accion')       || defaults.accion,
                            consecuencia: get('data-consecuencia') || defaults.consecuencia,
                            npeligros:    get('data-npeligros')    || defaults.npeligros,
                        };
                    } catch { return defaults; }
                };
                const kpi = parseKpi(html);
                onReportReceived?.(html, kpi, messageId);
                return;
            }

            // REGLA DE ORO 2: Si es un placeholder simple, lo envolvemos en la plantilla Verde Esmeralda/Teal oficial,
            // inyectando las fotos capturadas durante la videollamada.
            const dateStr = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            
            // Preferir frames evaluados del backend, sino fotos manuales, sino snapshots automáticos
            let snapshots = manualCapturedPhotos.length > 0 ? manualCapturedPhotos : snapshotsRef.current;
            if (evaluatedFrames && evaluatedFrames.length > 0) {
                snapshots = evaluatedFrames.map(b64 => `data:image/jpeg;base64,${b64}`);
            }

            // Construir la sección HTML de la galería de fotos
            let evidenceHtml = '';
            if (snapshots.length > 0) {
                const imgItems = snapshots.map((src, idx) => `
                    <div style="flex:1 1 calc(33.333% - 16px); max-width:300px; min-width:200px; text-align:center; margin-bottom:12px; box-sizing:border-box;">
                        <img src="${src}" alt="Evidencia ${idx+1}" style="width:100%; height:240px; object-fit:contain; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.05);" />
                        <p style="font-size:0.75em; color:#7f8c8d; margin-top:4px;">Figura ${idx+1}: Captura de evidencia del entorno analizado.</p>
                    </div>`).join('');
                evidenceHtml = `
                    <div style="margin-bottom:24px;">
                        <h3 style="color:#0f766e; font-size:1.1em; text-transform:uppercase; letter-spacing:1px; border-left:4px solid #14b8a6; padding-left:10px; margin-bottom:12px;">1. Evidencia Fotográfica del Entorno Analizado</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:16px; margin-top:12px;">${imgItems}</div>
                    </div>`;
            }

            const radicadoId = `LA-${new Date().getFullYear()}-PENDIENTE`;

            // Envoltura Esmeralda/Teal idéntica al formato del inicio y al final
            const finalHtml = `<div id="wappy-kpi" data-riesgo="PENDIENTE" data-accion="Evaluar" data-consecuencia="Incapacitante" data-npeligros="5" style="display:none"></div>
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
          Informe de Análisis de Riesgos y Peligros
        </h1>
        <div style="color:#a7f3d0; font-size:0.85em; font-weight:500; display:flex; align-items:center; gap:6px;">
          <span style="display:inline-block; width:8px; height:8px; background-color:#34d399; border-radius:50%; box-shadow:0 0 8px #34d399;"></span>
          Modalidad: Auditoría de Campo Asistida por IA (Predictiva)
        </div>
      </div>
      <div>
        <div style="background:rgba(255,255,255,0.07); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:12px 20px; min-width:180px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
          <div style="color:#22d3ee; font-size:0.65em; font-weight:800; letter-spacing:3px; text-transform:uppercase; margin-bottom:4px;">RADICADO</div>
          <div style="color:#ffffff; font-size:1.25em; font-weight:900; font-family:monospace; letter-spacing:1px;">${radicadoId}</div>
          <div style="color:#e2e8f0; font-size:0.75em; margin-top:4px; font-weight:500;">
            📅 ${dateStr}
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
      <span style="color:#14b8a6; font-size:1.2em;">📅</span> <strong>Fecha:</strong> ${dateStr}
    </div>
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="color:#14b8a6; font-size:1.2em;">⏱️</span> <strong>Hora:</strong> ${timeStr}
    </div>
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="color:#14b8a6; font-size:1.2em;">🛡️</span> <strong>Estándar:</strong> GTC 45 / ISO 45001
    </div>
    <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
      <strong>Estado:</strong> 
      <span style="background-color:#fffbeb; color:#d97706; padding:3px 12px; border-radius:50px; font-size:0.9em; font-weight:700; border:1px solid #fde68a; display:flex; align-items:center; gap:6px;">
        <svg width="8" height="8" viewBox="0 0 100 100" style="overflow:visible;">
          <circle cx="50" cy="50" r="50" fill="#d97706">
            <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>
        ⌛ Generando Informe
      </span>
    </div>
  </div>

  <!-- BODY CONTENT -->
  <div style="background:#ffffff; padding:40px 32px; min-height:400px; display:flex; flex-direction:column;">
    
    ${evidenceHtml}

    <div class="ai-report-content" style="line-height:1.7;">
      ${html}
    </div>
    
  </div>
</div>`;

            const kpi = { riesgo: 'PENDIENTE', accion: 'Evaluar', consecuencia: 'Incapacitante', npeligros: '5' };
            onReportReceived?.(finalHtml, kpi, messageId);
        },
        onStatusChange: (newStatus: string) => {
            console.log('[LiveAnalysisModal] Status:', newStatus);
            switch (newStatus) {
                case 'listening':
                    setStatusText('Escuchando...');
                    break;
                case 'speaking':
                    setStatusText('Hablando...');
                    break;
                case 'thinking':
                    setStatusText('Analizando...');
                    break;
                case 'connecting':
                    setStatusText('Conectando...');
                    break;
                case 'connected':
                    setStatusText('Conectado');
                    break;
                case 'generating_report':
                    setStatusText('Generando Reporte...');
                    // Do not capture automatic snapshots at the end of the call anymore
                    snapshotsRef.current = [];
                    break;
                case 'ready':
                    setStatusText('Listo');
                    break;
                case 'turn_complete':
                    // Only show completion if we actually got the report
                    if (hasReceivedReport) {
                        setStatusText('Análisis Completado');
                    } else {
                        setStatusText('Listo');
                    }
                    break;
                case 'interrupted':
                    setStatusText('Listo');
                    stopAudioPlayback();
                    break;
                default:
                    setStatusText(newStatus);
            }
        },
        onError: (err: string) => {
            console.error('[LiveAnalysisModal] Error:', err);
            setStatusText(`Error: ${err}`);
        },
    }), [conversationId, onConversationIdUpdate, voiceLiveAnalysis, onTextReceived, onReportReceived, hasReceivedReport, selectedModel, selectedTemplate, handleAudioReceived, captureSnapshot, onConversationUpdated, stopAudioPlayback]);

    const {
        isConnected,
        isConnecting,
        status,
        connect,
        disconnect,
        sendVideoFrame,
        sendTextMessage,
        setMuted,
        changeVoice,
        getInputVolume,
        sendEvidenceImage,
        sendInterrupt,
    } = useLiveAnalysisSession(sessionOptions);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

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

        // 2. Ergo calculations (cervical and trunk angles)
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

    // ==================== CONTROLLER HELPER FUNCTIONS ====================

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

    const startSendingFrames = () => {
        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = setInterval(() => {
            if (videoRef.current && videoRef.current.readyState >= 2) {
                sendVideoFrame(videoRef.current);
            }
        }, 500); // Keep 2 FPS for analysis
    };

    const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
        try {
            stopMediaTracks(); // Ensure clean switch

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 15 },
                    facingMode: mode
                },
                audio: false
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.error("Error playing video:", e));
            }

            setIsCameraOn(true);
            startSendingFrames();

        } catch (error) {
            console.error('[LiveAnalysisModal] Error starting camera:', error);
            setStatusText('Error accessing camera');
            setIsCameraOn(false);
        }
    };

    const startScreenShare = async () => {
        try {
            stopMediaTracks(); // Ensure clean switch

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 10 }
                },
                audio: false
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }

            // Handle user clicking "Stop Sharing" in browser UI
            stream.getVideoTracks()[0].onended = () => {
                stopMediaTracks();
            };

            setIsScreenSharing(true);
            startSendingFrames();

        } catch (error) {
            console.error('[LiveAnalysisModal] Error starting screen share:', error);
            setIsScreenSharing(false);
        }
    };

    const toggleCamera = () => {
        if (isCameraOn) {
            stopMediaTracks();
        } else {
            startCamera();
        }
    };

    const toggleScreenShare = () => {
        if (isScreenSharing) {
            stopMediaTracks();
        } else {
            startScreenShare();
        }
    };

    const switchCamera = () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        if (isCameraOn) {
            stopMediaTracks();
            setTimeout(() => startCamera(newMode), 200);
        }
    };

    const toggleMute = () => {
        if (status === 'speaking') {
            console.log('[LiveAnalysisModal] User tapped mic button during AI speech -> triggering immediate interrupt');
            sendInterrupt();
            stopAudioPlayback();
            setIsMuted(false);
            setMuted(false);
            return;
        }
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        setMuted(newMuted);
    };

    const handleManualCapture = useCallback(() => {
        if (manualPhotosCountRef.current >= 10) {
            setLimitNotification(true);
            setTimeout(() => setLimitNotification(false), 3000);
            return;
        }

        const dataUrl = captureSnapshot();
        if (!dataUrl) return;

        // Trigger visual flash
        setIsFlashActive(true);
        setTimeout(() => setIsFlashActive(false), 150);

        // Save locally for carousel and update the synchronous count ref
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

        const phaseName = currentPhaseRef.current?.name || 'Fase 1: Postura Habitual';
        const perspective = capturePerspectiveRef.current || 'Auto-evaluación';

        const telemetryText = telemetryParts.length > 0 
            ? `[Captura de Evidencia Biomecánica • ${phaseName} • Perspectiva: ${perspective}] Registro de telemetría articular en el momento de la captura: ${telemetryParts.join(', ')}.`
            : `[Captura de Evidencia Biomecánica • ${phaseName} • Perspectiva: ${perspective}] Captura de evidencia sin telemetría articular activa en el momento.`;

        sendEvidenceImage(base64, telemetryText);

        // Auto-advance to next ergonomic phase if not at last phase
        setCurrentPhaseIndex((prev) => (prev < ERGONOMIC_PHASES.length - 1 ? prev + 1 : prev));
    }, [
        captureSnapshot, 
        sendEvidenceImage, 
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

    const handleClose = () => {
        stopMediaTracks();
        disconnect();
        setSelectedTemplate(null);
        setManualCapturedPhotos([]);
        manualPhotosCountRef.current = 0;
        onClose();
    };

    const handleVoiceChange = (voiceId: string) => {
        setSelectedVoice(voiceId);
        changeVoice(voiceId);
        setShowVoiceSelector(false);
    };

    const handleOrbClick = () => {
        if (status === 'ready' || status === 'idle' || status === 'listening') {
            setShowVoiceSelector(!showVoiceSelector);
        }
    };

    // ==================== EFFECTS (REACT LIFE CYCLE) ====================

    useEffect(() => {
        // Check if getDisplayMedia is supported
        if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
            setSupportsScreenShare(true);
        }
    }, []);

    // Load MediaPipe scripts on demand when 'biomecanico_mediapipe' is selected
    useEffect(() => {
        if (!isOpen || selectedTemplate !== 'biomecanico_mediapipe') return;

        let active = true;
        console.log('[LiveAnalysisModal] selectedTemplate is biomecanico_mediapipe. Loading Vision AI...');
        setStatusText('Cargando Visión Artificial...');

        const loadAll = async () => {
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
                await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
                
                if (active) {
                    console.log('[LiveAnalysisModal] Vision AI successfully loaded!');
                    setIsMediaPipeLoaded(true);
                    setStatusText('Visión IA Preparada');
                }
            } catch (err) {
                console.error('[LiveAnalysisModal] Error loading Vision AI scripts:', err);
                if (active) {
                    setStatusText('Error de Visión IA');
                }
            }
        };

        loadAll();

        return () => {
            active = false;
        };
    }, [isOpen, selectedTemplate]);

    // Initialize and handle MediaPipe Pose instance
    useEffect(() => {
        if (!isMediaPipeLoaded || !isCameraOn || selectedTemplate !== 'biomecanico_mediapipe') {
            if (poseRef.current) {
                try {
                    poseRef.current.close();
                } catch (e) {
                    console.error('Error closing poseRef:', e);
                }
                poseRef.current = null;
            }
            setIsPoseActive(false);
            return;
        }

        console.log('[LiveAnalysisModal] Initializing MediaPipe Pose instance...');
        
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
            console.log('[LiveAnalysisModal] Pose instance ready!');
        } catch (e) {
            console.error('Error creating Pose instance:', e);
        }

        return () => {
            if (poseRef.current) {
                try {
                    poseRef.current.close();
                } catch (e) {
                    console.error('Error closing poseRef on cleanup:', e);
                }
                poseRef.current = null;
            }
            setIsPoseActive(false);
        };
    }, [isMediaPipeLoaded, isCameraOn, selectedTemplate, onPoseResults]);

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
                        console.error('[LiveAnalysisModal] Pose send error:', e);
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

    // Amplitude meter updating audioAmplitude
    useEffect(() => {
        const updateAmplitude = () => {
            let vol = 0;

            if (status === 'speaking' && outputAnalyserRef.current) {
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
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [status, getInputVolume]);

    // Connection Delay Logic: Set isReady to true immediately when connected (no countdown delay)
    useEffect(() => {
        if (isOpen && isConnected) {
            setIsReady(true);
            setCountdown(0);
            snapshotsRef.current = [];
        } else {
            setIsReady(false);
            setCountdown(0);
        }
    }, [isOpen, isConnected]);

    // Trigger toast ONLY when hasReceivedReport flips to true (not on every render)
    useEffect(() => {
        if (hasReceivedReport && !prevHasReport.current) {
            prevHasReport.current = true;
            setReportNotification(true);
            const timer = setTimeout(() => setReportNotification(false), 8000);
            return () => clearTimeout(timer);
        }
    }, [hasReceivedReport]);

    // Reset report state when modal is closed (to allow next session to show toast again)
    useEffect(() => {
        if (!isOpen) {
            prevHasReport.current = false;
            setHasReceivedReport(false);
            setReportNotification(false);
            setSelectedTemplate(null);
            setManualCapturedPhotos([]);
            manualPhotosCountRef.current = 0;
        }
    }, [isOpen]);

    // Sync visible state with Recoil for Tenshi hiding
    useEffect(() => {
        setShowModalState(isOpen);
    }, [isOpen, setShowModalState]);

    // Connect on mount if open and template selected
    useEffect(() => {
        if (!isOpen || !selectedTemplate) return;

        // Reset photos for the new session
        setManualCapturedPhotos([]);
        manualPhotosCountRef.current = 0;

        if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = (window as any).sharedAudioContext24k || new AudioContextClass({ sampleRate: 24000 });
            (window as any).sharedAudioContext24k = audioContextRef.current;
        }

        connect();

        return () => {
            stopMediaTracks();
            disconnect();
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            (window as any).sharedAudioContext24k = null;
        };
    }, [isOpen, selectedTemplate]);

    // Eagerly initialize and resume AudioContext on the first user interaction (click/touch) inside the modal to bypass browser autoplay blocks
    useEffect(() => {
        if (!isOpen) return;

        const initAudioOnGesture = () => {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;

            let ctx = audioContextRef.current;
            if (!ctx) {
                ctx = ((window as any).sharedAudioContext24k || new AudioContextClass({ sampleRate: 24000 })) as AudioContext;
                audioContextRef.current = ctx;
                (window as any).sharedAudioContext24k = ctx;
                console.log('[LiveAnalysisModal] AudioContext created eagerly on user gesture:', ctx.state);
            } else if (ctx.state === 'suspended') {
                ctx.resume().then(() => {
                    console.log('[LiveAnalysisModal] AudioContext resumed eagerly on user gesture:', ctx?.state);
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

    // Ensure voice is updated when connected
    useEffect(() => {
        if (isOpen && isConnected && selectedVoice !== (voiceLiveAnalysis as string)) {
            console.log('[LiveAnalysisModal] Syncing voice with global setting:', voiceLiveAnalysis);
            setSelectedVoice((voiceLiveAnalysis as string) || '');
            changeVoice((voiceLiveAnalysis as string) || '');
        }
    }, [isOpen, isConnected, voiceLiveAnalysis, changeVoice]);



    // Auto-start camera and send initial prompt when READY (after countdown)
    useEffect(() => {
        if (isConnected && isOpen && isReady) {
            startCamera();

            const timer = setTimeout(() => {
                console.log("[LiveAnalysisModal] Sending initial analysis prompt");

                // Snapshots are captured at 'generating_report' status — not at startup
                // This ensures evidence photos match the actual report moment

                const currentDate = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                let templateGuide = "";
                if (selectedTemplate === 'alturas') {
                    templateGuide = "Tu enfoque de auditoría hoy es TRABAJO EN ALTURAS. Guíame a través de la revisión del arnés, los puntos de anclaje, líneas de vida y conectores.";
                } else if (selectedTemplate === 'eléctrico') {
                    templateGuide = "Tu enfoque de auditoría hoy es RIESGO ELÉCTRICO. Guíame a través del estado de tableros eléctricos, cableado expuesto y el protocolo LOTO (bloqueo/etiquetado).";
                } else if (selectedTemplate === '5s') {
                    templateGuide = "Tu enfoque de auditoría hoy es ORDEN Y ASEO (METODOLOGÍA 5S). Guíame a través de la clasificación, el orden, la limpieza, estandarización y disciplina del área.";
                } else if (selectedTemplate === 'biomecanico_estandar') {
                    templateGuide = "Tu enfoque de auditoría hoy es RIESGO BIOMECÁNICO CUALITATIVO (GTC 45 / ERGONOMÍA). Guíame a través de la evaluación de posturas prolongadas, levantamiento manual de cargas, movimientos repetitivos y disponibilidad de puestos ergonómicos.";
                } else if (selectedTemplate === 'biomecanico_mediapipe') {
                    templateGuide = "Tu enfoque de auditoría hoy es RIESGO BIOMECÁNICO CUANTITATIVO CON VISIÓN IA (RULA / REBA). Guíame interpretando los datos cuantitativos de telemetría articular (cervical, tronco, abducción de brazos, flexión de codos y flexión de rodillas) que te enviaré en tiempo real y que se muestran en mi pantalla.";
                } else {
                    templateGuide = "Tu enfoque de auditoría hoy es INSPECCIÓN GENERAL DE SEGURIDAD INDUSTRIAL (ISO 45001 / GTC 45). Guíame de manera general para auditar el área de trabajo.";
                }

                sendTextMessage(`
                    Actúa como un Auditor Líder Experto en Seguridad y Salud en el Trabajo (SST/HSE) certificado.
                    
                    CONTEXTO:
                    Estás realizando una inspección técnica formal basada en la evidencia visual que estás viendo AHORA MISMO en el video.
                    ${templateGuide}

                    TU MISIÓN:
                    Identificar peligros evidentes, evaluar actos inseguros y dar recomendaciones asertivas en tiempo real. 

                    INSTRUCCIONES DE RESPUESTA:
                    1. **ANÁLISIS INICIAL**: Inicia el análisis proactivamente AHORA MISMO basándote SÓLO en la imagen/video que captas. Comienza hablando de inmediato.
                    2. **ESTILO**: Háblame profesionalmente. Sé directo y táctico sobre los peligros críticos. 
                    3. **REPORTE (CRÍTICO)**: Cuando yo te pida generar el informe o reporte de la inspección, tu ÚNICA RESPUESTA debe ser EXACTAMENTE: "Entendido. Estoy procesando lo que vimos para generar el informe técnico detallado." 
                    NO generes el informe verbalmente ni en HTML. Solo di esa frase y el sistema en el backend se encargará de crearlo.
                `);
            }, 1000); // Short delay after ready

            return () => clearTimeout(timer);
        }
    }, [isConnected, isOpen, isReady, sendTextMessage, captureSnapshot, selectedTemplate]);

    if (!isOpen) return null;

    if (!selectedTemplate) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50/98 backdrop-blur-md transition-all duration-300">
                <div className="relative w-full h-full flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto">
                    {/* Wappy Design Light BG Gradients */}
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-slate-100/50 via-white to-teal-50/30 opacity-70"></div>
                    
                    {/* Top Close Button */}
                    <button 
                        onClick={handleClose}
                        className="absolute top-6 right-6 p-3 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900 transition-all z-50 shadow-sm"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Content Container */}
                    <div className="relative z-10 max-w-4xl w-full flex flex-col items-center gap-8 my-auto">
                        <div className="text-center space-y-3">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-mono uppercase tracking-[0.2em] shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                HSE Command Center
                            </div>
                            <h1 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-teal-900 to-slate-950 tracking-tight pb-1 drop-shadow-sm">
                                ANÁLISIS EN VIVO
                            </h1>
                            <p className="text-slate-600 text-sm md:text-base max-w-lg mx-auto font-medium">
                                Seleccione una plantilla de inspección técnica especializada. La IA adaptará sus directrices y su enfoque en tiempo real.
                            </p>
                        </div>

                        {/* Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-4">
                            {/* Card 1: General */}
                            <div 
                                onClick={() => setSelectedTemplate('general')}
                                className="group relative cursor-pointer bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-emerald-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(16,185,129,0.08)] flex flex-col justify-between min-h-[180px]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">ISO 45001</span>
                                </div>
                                <div className="mt-4 z-10">
                                    <h3 className="text-slate-800 text-lg font-bold group-hover:text-emerald-600 transition-colors">Inspección General</h3>
                                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Evaluación amplia de orden, aseo, señalización, ergonomía y condiciones de seguridad industrial estándar.</p>
                                </div>
                            </div>

                            {/* Card 2: Alturas */}
                            <div 
                                onClick={() => handleTemplateClick('alturas', 'Trabajo en Alturas')}
                                className="group relative cursor-pointer bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-cyan-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(6,182,212,0.08)] flex flex-col justify-between min-h-[180px]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-teal-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="p-3 bg-cyan-50 border border-cyan-100 rounded-xl text-cyan-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">SST ALTURA</span>
                                </div>
                                <div className="mt-4 z-10">
                                    <h3 className="text-slate-800 text-lg font-bold group-hover:text-cyan-600 transition-colors">Trabajo en Alturas</h3>
                                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Enfoque arneses, líneas de vida, puntos de anclaje, conectores y estado de plataformas de elevación.</p>
                                </div>
                            </div>

                            {/* Card 3: Eléctrico */}
                            <div 
                                onClick={() => handleTemplateClick('eléctrico', 'Riesgo Eléctrico')}
                                className="group relative cursor-pointer bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-amber-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(245,158,11,0.08)] flex flex-col justify-between min-h-[180px]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">LOTO / ENERGÍA</span>
                                </div>
                                <div className="mt-4 z-10">
                                    <h3 className="text-slate-800 text-lg font-bold group-hover:text-amber-600 transition-colors">Riesgo Eléctrico</h3>
                                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Tableros eléctricos, cableado expuesto, bloqueo y etiquetado (LOTO) y EPP dieléctrico.</p>
                                </div>
                            </div>

                            {/* Card 4: 5S */}
                            <div 
                                onClick={() => handleTemplateClick('5s', 'Metodología 5S')}
                                className="group relative cursor-pointer bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-teal-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(20,184,166,0.08)] flex flex-col justify-between min-h-[180px]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl text-teal-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">ORDEN & ASEO</span>
                                </div>
                                <div className="mt-4 z-10">
                                    <h3 className="text-slate-800 text-lg font-bold group-hover:text-teal-600 transition-colors">Metodología 5S</h3>
                                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Clasificación, orden, limpieza, estandarización y disciplina en plantas, almacenes y áreas de trabajo.</p>
                                </div>
                            </div>

                            {/* Card 5: Biomecánico Estándar */}
                            <div 
                                onClick={() => handleTemplateClick('biomecanico_estandar', 'Riesgo Biomecánico')}
                                className="group relative cursor-pointer bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-purple-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(168,85,247,0.08)] flex flex-col justify-between min-h-[180px]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-violet-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-purple-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">GTC 45 ERGO</span>
                                </div>
                                <div className="mt-4 z-10">
                                    <h3 className="text-slate-800 text-lg font-bold group-hover:text-purple-600 transition-colors">Riesgo Biomecánico</h3>
                                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Evaluación cualitativa de posturas, movimientos repetitivos, manejo de cargas y puestos de trabajo ergonómicos.</p>
                                </div>
                            </div>

                            {/* Card 6: Biomecánico MediaPipe */}
                            <div 
                                onClick={() => handleTemplateClick('biomecanico_mediapipe', 'Biomecánico (Visión IA)')}
                                className="group relative cursor-pointer bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-cyan-500/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_30px_rgba(6,182,212,0.12)] flex flex-col justify-between min-h-[180px]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="p-3 bg-cyan-50 border border-cyan-100 rounded-xl text-cyan-600 group-hover:scale-110 transition-transform shadow-sm">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded">VISIÓN IA</span>
                                </div>
                                <div className="mt-4 z-10">
                                    <h3 className="text-slate-800 text-lg font-bold group-hover:text-cyan-600 transition-colors">Biomecánico (Visión IA)</h3>
                                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">Evaluación cuantitativa en tiempo real con esqueleto digital predictivo, medición de ángulos cervical, tronco, codos y rodillas en vivo.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-300">
            {/* Main content - Fullscreen */}
            <div className="relative w-full h-full flex flex-col overflow-hidden">

                {/* Technical Loading Overlay - Hud Style Removed */}



                {selectedTemplate === 'biomecanico_mediapipe' && isReady && (
                    isTelemetryCollapsed ? (
                        /* Minimized Floating Badge for clean video visibility on mobile */
                        <div 
                            onClick={() => setIsTelemetryCollapsed(false)}
                            className="absolute top-4 right-4 z-40 bg-black/15 hover:bg-black/30 backdrop-blur-md border border-white/5 rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2 text-white pointer-events-auto cursor-pointer transition-all hover:scale-105"
                        >
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]"></span>
                            <span className="font-mono text-[10px] font-bold uppercase tracking-widest">Telemetría</span>
                            <svg className="w-3.5 h-3.5 text-white/60 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4M4 20l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
                        </div>
                    ) : (
                        /* Highly translucent, responsive panel with collapse button */
                        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-40 w-[calc(100%-2rem)] sm:w-80 max-w-sm bg-black/12 backdrop-blur-[3px] border border-white/5 rounded-2xl p-4 shadow-xl flex flex-col gap-3 text-white pointer-events-auto transition-all duration-300">
                            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]"></span>
                                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider">Telemetría de Pose</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-mono text-white/40 uppercase">GTC 45 / RULA</span>
                                    <button 
                                        onClick={() => setIsTelemetryCollapsed(true)}
                                        className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                                        title="Minimizar panel"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 12H6"/></svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1">
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-semibold flex items-center gap-1">
                                    <UserCheck className="w-3 h-3 text-emerald-400" />
                                    {capturePerspective}
                                </span>
                                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
                                    {ERGONOMIC_PHASES.map((p, idx) => (
                                        <button
                                            key={p.id}
                                            onClick={() => setCurrentPhaseIndex(idx)}
                                            className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono transition-all duration-200 ${
                                                currentPhaseIndex === idx 
                                                    ? 'bg-cyan-500 text-black font-bold shadow-sm shadow-cyan-500/30' 
                                                    : 'text-white/60 hover:text-white hover:bg-white/10'
                                            }`}
                                            title={p.desc}
                                        >
                                            {p.shortName}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2.5">
                                {/* Cuello Box */}
                                <div className={`p-2.5 rounded-xl border transition-all duration-300 ${neckInfo.colorClass}`}>
                                    <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1">Cervical (Cuello)</div>
                                    <div className="flex items-baseline justify-between">
                                        <span className={`text-xl font-mono font-black ${neckInfo.valColorClass}`}>
                                            {neckAngle !== null ? `${neckAngle}°` : '--'}
                                        </span>
                                        <span className={`text-[8.5px] uppercase font-black ${neckInfo.textClass}`}>
                                            {neckInfo.status}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${
                                                neckAngle !== null && neckAngle > 20 ? 'bg-red-500' : neckAngle !== null && neckAngle > 10 ? 'bg-amber-500' : 'bg-cyan-500'
                                            }`}
                                            style={{ width: `${neckAngle !== null ? Math.min(100, (neckAngle / 90) * 100) : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Tronco Box */}
                                <div className={`p-2.5 rounded-xl border transition-all duration-300 ${trunkInfo.colorClass}`}>
                                    <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1">Columna (Tronco)</div>
                                    <div className="flex items-baseline justify-between">
                                        <span className={`text-xl font-mono font-black ${trunkInfo.valColorClass}`}>
                                            {trunkAngle !== null ? `${trunkAngle}°` : '--'}
                                        </span>
                                        <span className={`text-[8.5px] uppercase font-black ${trunkInfo.textClass}`}>
                                            {trunkInfo.status}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${
                                                trunkAngle !== null && trunkAngle > 20 ? 'bg-red-500' : trunkAngle !== null && trunkAngle > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${trunkAngle !== null ? Math.min(100, (trunkAngle / 90) * 100) : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Arm Abduction Box */}
                                <div className={`p-2.5 rounded-xl border transition-all duration-300 ${armInfo.colorClass}`}>
                                    <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1">Brazos (Abduc.)</div>
                                    <div className="flex items-baseline justify-between">
                                        <span className={`text-xl font-mono font-black ${armInfo.valColorClass}`}>
                                            {armAngle !== null ? `${armAngle}°` : '--'}
                                        </span>
                                        <span className={`text-[8.5px] uppercase font-black ${armInfo.textClass}`}>
                                            {armInfo.status}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${
                                                armAngle !== null && armAngle > 45 ? 'bg-red-500' : armAngle !== null && armAngle > 20 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${armAngle !== null ? Math.min(100, (armAngle / 180) * 100) : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Elbow Flexion Box */}
                                <div className={`p-2.5 rounded-xl border transition-all duration-300 ${elbowInfo.colorClass}`}>
                                    <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1">Codos (Flex.)</div>
                                    <div className="flex items-baseline justify-between">
                                        <span className={`text-xl font-mono font-black ${elbowInfo.valColorClass}`}>
                                            {elbowAngle !== null ? `${elbowAngle}°` : '--'}
                                        </span>
                                        <span className={`text-[8.5px] uppercase font-black ${elbowInfo.textClass}`}>
                                            {elbowInfo.status}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${
                                                elbowAngle !== null && (elbowAngle < 30 || elbowAngle > 130) ? 'bg-red-500' : elbowAngle !== null && ((elbowAngle >= 30 && elbowAngle < 60) || (elbowAngle > 100 && elbowAngle <= 130)) ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${elbowAngle !== null ? Math.min(100, (elbowAngle / 180) * 100) : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Knee Flexion Box */}
                                <div className={`col-span-2 p-2.5 rounded-xl border transition-all duration-300 ${kneeInfo.colorClass}`}>
                                    <div className="text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1">Flexión de Rodillas</div>
                                    <div className="flex items-baseline justify-between">
                                        <span className={`text-xl font-mono font-black ${kneeInfo.valColorClass}`}>
                                            {kneeAngle !== null ? `${kneeAngle}°` : '--'}
                                        </span>
                                        <span className={`text-[8.5px] uppercase font-black ${kneeInfo.textClass}`}>
                                            {kneeInfo.status}
                                        </span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full mt-2 overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-300 ${
                                                kneeAngle !== null && kneeAngle > 60 ? 'bg-red-500' : kneeAngle !== null && kneeAngle > 30 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${kneeAngle !== null ? Math.min(100, (kneeAngle / 120) * 100) : 0}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Warnings Alert Box */}
                            {(neckAngle !== null && neckAngle > 10) || 
                             (trunkAngle !== null && trunkAngle > 0) || 
                             (armAngle !== null && armAngle > 20) || 
                             (elbowAngle !== null && (elbowAngle < 60 || elbowAngle > 100)) || 
                             (kneeAngle !== null && kneeAngle > 30) ? (
                                <div className={`border px-2.5 py-1.5 rounded-xl flex items-center gap-2 text-[10px] font-bold ${
                                    (neckAngle !== null && neckAngle > 20) || 
                                    (trunkAngle !== null && trunkAngle > 20) || 
                                    (armAngle !== null && armAngle > 45) || 
                                    (elbowAngle !== null && (elbowAngle < 30 || elbowAngle > 130)) || 
                                    (kneeAngle !== null && kneeAngle > 60)
                                        ? 'bg-red-500/10 border-red-500/20 text-red-200 animate-pulse'
                                        : 'bg-amber-500/10 border-amber-500/15 text-amber-200'
                                }`}>
                                    <span>⚠️</span>
                                    <span>
                                        {(neckAngle !== null && neckAngle > 20) || 
                                         (trunkAngle !== null && trunkAngle > 20) || 
                                         (armAngle !== null && armAngle > 45) || 
                                         (elbowAngle !== null && (elbowAngle < 30 || elbowAngle > 130)) || 
                                         (kneeAngle !== null && kneeAngle > 60)
                                            ? '¡Postura Crítica Detectada! Guardando evidencia...'
                                            : 'Postura ergonómica subóptima (Riesgo Moderado)'}
                                    </span>
                                </div>
                            ) : (
                                <div className="bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1.5 rounded-xl flex items-center gap-2 text-emerald-300 text-[10px] font-medium">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                                    <span>Postura segura bajo el estándar RULA</span>
                                </div>
                            )}
                        </div>
                    )
                )}

                {/* Video Preview (Main Focus) */}
                <div className="absolute inset-0 z-0 overflow-hidden bg-surface-primary">
                    <video
                        ref={videoRef}
                        className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${isCameraOn || isScreenSharing ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-110 blur-xl'}`}
                        muted
                        playsInline
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                    />
                    <canvas
                        ref={canvasRef}
                        className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-500 z-10 ${
                            selectedTemplate === 'biomecanico_mediapipe' && isCameraOn ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                    />
                    
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
                        <div className="absolute inset-0 bg-white z-20 pointer-events-none animate-flash"></div>
                    )}
                    
                    {/* Video Effects Overlays */}
                    {(isCameraOn || isScreenSharing) && (
                        <>
                            {/* CRT/Scanline pattern */}
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,118,0.02))] bg-[length:100%_2px,3px_100%] opacity-20"></div>
                            
                            {/* Vignette */}
                            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.5)]"></div>

                            {/* Camera Corners/Focus Brackets */}
                            <div className="absolute top-12 left-12 w-8 h-8 border-t-2 border-l-2 border-white/40 rounded-tl-sm pointer-events-none"></div>
                            <div className="absolute top-12 right-12 w-8 h-8 border-t-2 border-r-2 border-white/40 rounded-tr-sm pointer-events-none"></div>
                            <div className="absolute bottom-32 left-12 w-8 h-8 border-b-2 border-l-2 border-white/40 rounded-bl-sm pointer-events-none"></div>
                            <div className="absolute bottom-32 right-12 w-8 h-8 border-b-2 border-r-2 border-white/40 rounded-br-sm pointer-events-none"></div>

                            {/* Thinking Scanner Effect */}
                            {status === 'thinking' && (
                                <div className="absolute top-0 left-0 w-full h-1 bg-teal-400/50 shadow-[0_0_15px_rgba(45,212,191,0.8)] z-10 animate-[scan_2s_ease-in-out_infinite] pointer-events-none"></div>
                            )}
                        </>
                    )}
                </div>

                {/* Voice Orb & Floating UI */}
                <div className="flex-1 flex flex-col items-center justify-center z-10 relative">
                    <div 
                        onClick={handleOrbClick} 
                        className={`cursor-pointer transition-all duration-500 transform opacity-30 hover:opacity-80 ${status === 'speaking' ? 'scale-110' : 'scale-100'}`}
                    >
                        <VoiceOrb
                            status={status === 'ready' ? 'idle' : status}
                            amplitude={audioAmplitude}
                            className="drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                        />
                    </div>

                    {showVoiceSelector && (
                        <div className="absolute top-full mt-8 bg-surface-primary border border-white/10 rounded-xl shadow-2xl p-2 min-w-[200px] z-50 overflow-hidden">
                            <div className="px-3 py-2 border-b border-light/10 text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">
                                Select System Voice
                            </div>
                            <VoiceSelector
                                selectedVoice={selectedVoice}
                                onVoiceChange={handleVoiceChange}
                            />
                        </div>
                    )}
                </div>

                {/* Bottom Main Interaction Bar */}
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

                    {/* Control Bar - Premium Glassmorphism */}
                    <div className="flex items-center justify-center gap-1.5 sm:gap-4 bg-black/60 backdrop-blur-2xl px-2.5 sm:px-8 py-2 sm:py-5 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 shadow-2xl transition-all hover:bg-black/70 group max-w-[95vw]">
                        
                        {/* Camera Toggle */}
                        <TooltipAnchor
                            description={isCameraOn ? localize('com_ui_voice_camera_off' as any) : localize('com_ui_voice_camera_on' as any)}
                            render={
                                <button
                                    onClick={toggleCamera}
                                    disabled={isScreenSharing}
                                    className={`p-2.5 sm:p-4 rounded-full transition-all duration-300 transform active:scale-95 ${isCameraOn
                                        ? 'bg-white text-black shadow-lg shadow-white/20'
                                        : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                                        } ${isScreenSharing ? 'opacity-20 cursor-not-allowed' : ''}`}
                                >
                                    {isCameraOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
                                </button>
                            }
                        />

                        {/* Camera Shutter Button */}
                        {(isCameraOn || isScreenSharing) && (
                            <TooltipAnchor
                                description={selectedTemplate === 'biomecanico_mediapipe' ? `Capturar ${currentPhase.name} (${capturePerspective})` : "Capturar Foto de Evidencia"}
                                render={
                                    <button
                                        onClick={handleManualCapture}
                                        className="relative p-2.5 sm:p-4 rounded-full bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all duration-300 transform active:scale-90 border border-emerald-400/30"
                                    >
                                        <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                                        {selectedTemplate === 'biomecanico_mediapipe' && (
                                            <span className="absolute -top-1 -right-1 bg-black/80 text-cyan-300 text-[8px] font-mono font-bold px-1 rounded-full border border-cyan-500/50">
                                                {currentPhaseIndex + 1}/3
                                            </span>
                                        )}
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

                        {/* Microphone Toggle (Center Piece) */}
                        <TooltipAnchor
                            description={isMuted ? localize('com_nav_voice_unmute' as any) : localize('com_nav_voice_mute' as any)}
                            render={
                                <button
                                    onClick={toggleMute}
                                    className={`p-3.5 sm:p-5 rounded-full transition-all duration-500 transform active:scale-90 ${isMuted
                                        ? 'bg-red-500/20 text-red-500 border border-red-500/50 backdrop-blur-md'
                                        : 'bg-white text-black shadow-xl shadow-white/10 scale-105 sm:scale-110 border-4 border-white'
                                        }`}
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

                        {/* Screen Share Toggle */}
                        {supportsScreenShare && (
                            <TooltipAnchor
                                description={isScreenSharing ? localize('com_ui_voice_screen_share_stop' as any) : localize('com_ui_voice_screen_share_start' as any)}
                                render={
                                    <button
                                        onClick={toggleScreenShare}
                                        disabled={isCameraOn}
                                        className={`p-2.5 sm:p-4 rounded-full transition-all duration-300 transform active:scale-95 ${isScreenSharing
                                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 border border-blue-400/30'
                                            : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
                                            } ${isCameraOn ? 'opacity-20 cursor-not-allowed' : ''}`}
                                    >
                                        {isScreenSharing ? <MonitorOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />}
                                    </button>
                                }
                            />
                        )}

                        {/* End Call Button */}
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



                    {/* Report Completion Toast */}
                    {reportNotification && (
                        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-emerald-900/40 border border-emerald-400/30 animate-in slide-in-from-bottom-4 fade-in duration-500">
                            <span className="text-xl">✅</span>
                            <div>
                                <div className="font-bold text-sm">¡Informe Generado!</div>
                                <div className="text-xs text-emerald-100">El informe técnico ha sido enviado al editor.</div>
                            </div>
                        </div>
                    )}

                    {/* Limit Captured Photos Toast */}
                    {limitNotification && (
                        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-amber-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-amber-900/40 border border-amber-400/30 animate-in slide-in-from-bottom-4 fade-in duration-500">
                            <span className="text-xl">⚠️</span>
                            <div>
                                <div className="font-bold text-sm">Límite alcanzado</div>
                                <div className="text-xs text-amber-100">Máximo 10 fotos de evidencia permitidas.</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Additional CSS Animations */}
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes scan {
                        0% { top: 0; opacity: 0; }
                        5% { opacity: 1; }
                        95% { opacity: 1; }
                        100% { top: 100%; opacity: 0; }
                    }
                    @keyframes pulse-soft {
                        0%, 100% { opacity: 0.4; }
                        50% { opacity: 1; }
                    }
                    @keyframes flash-effect {
                        0% { opacity: 1; }
                        100% { opacity: 0; }
                    }
                    .animate-flash {
                        animation: flash-effect 150ms ease-out forwards;
                    }
                ` }} />
            </div>
            {showUpgradeModal && createPortal(
                <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <div className="relative max-w-sm w-full animate-in zoom-in-95 duration-300">
                        <button 
                            onClick={() => setShowUpgradeModal(false)} 
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-md text-sm z-50 pointer-events-auto"
                        >
                            Cerrar ✕
                        </button>
                        <UpgradeWall
                            title={upgradeModalTitle}
                            description={upgradeModalDesc}
                            plan="USER_IPEVAR"
                            isPopup={true}
                            hideFeatures={true}
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default LiveAnalysisModal;
