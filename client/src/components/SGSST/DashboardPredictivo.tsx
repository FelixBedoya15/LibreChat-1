import React, {  useState, useCallback, useEffect, useRef } from 'react';
import {
    Sparkles,
    Loader2,
    AlertTriangle,
    ShieldCheck,
    HeartPulse,
    Activity,
    LineChart,
    RefreshCw,
    Brain,
    TrendingUp,
    Zap,
    Users,
    ChevronUp,
    ChevronDown,
    BrainCircuit,
    Database,
    Search,
    User,
    UserX,
    X,
    Eye,
    Briefcase,
    ShieldAlert,
    CheckCircle,
    Clock,
    Building2,
} from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import SGSSTToolbar from './SGSSTToolbar';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { cn } from '~/utils';
import { useAutoLoadReport } from './useAutoLoadReport';
import { UpgradeWall } from './UpgradeWall';
import { SystemRoles } from 'librechat-data-provider';
import CollapsibleReportBox from './CollapsibleReportBox';
import PredictiveTimeSeriesChart, { type TimeSeriesPoint } from './PredictiveTimeSeriesChart';
import PredictiveAnatomyTreemap, { type LesionItem, type AnatomyItem } from './PredictiveAnatomyTreemap';
import PredictivePlantComparison, { type SiteItem } from './PredictivePlantComparison';

interface ForecastData {
    overallRisk: number;
    criticalArea: string;
    topDomain?: string;
    predictionSummary: string;
    predictiveMetrics?: {
        modelReliabilityMonthly: string;
        modelReliabilityYearly: string;
        expectedMonthlyAccidents: number;
        expectedYearlyDaysLost: number;
        expectedDaysCharged: number;
        expectedYearlyTotal?: number;
        topThreatenedDomain: string;
    };
    timeSeries?: TimeSeriesPoint[];
    lesionDistribution?: LesionItem[];
    anatomyDistribution?: AnatomyItem[];
    siteDistribution?: SiteItem[];
    domainRiskScores?: Record<string, number>;
    indicators: {
        healthRisk: number;
        safetyRisk: number;
        ergonomicRisk: number;
    };
    evidence: {
        healthEvidence: string;
        safetyEvidence: string;
        ergonomicEvidence: string;
    };
    recommendedActions: string[];
}

// ─── Animated Ring Gauge (Premium H1 Style) ──────────────────────────────────
const RingGauge = ({
    value,
    label,
    color,
    bgColor,
    icon: Icon,
    description,
    gradientId,
    gradColors,
}: {
    value: number;
    label: string;
    color: string;
    bgColor: string;
    icon: any;
    description?: string;
    gradientId: string;
    gradColors: { from: string; to: string };
}) => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    const riskLabel = value >= 70 ? 'CRÍTICO' : value >= 40 ? 'ALTO' : value >= 20 ? 'MODERADO' : 'BAJO';
    const riskColor = value >= 70 ? '#ef4444' : value >= 40 ? '#f97316' : value >= 20 ? '#eab308' : '#22c55e';

    return (
        <div className="flex flex-col items-center p-6 glass-premium rounded-3xl border border-border-medium/60 shadow-lg transition-all duration-500 hover:shadow-2xl hover:shadow-teal-500/10 hover:-translate-y-1.5 group cursor-default">
            <div className="relative mb-5 shrink-0">
                <div className="absolute inset-0 rounded-2xl opacity-20 blur-md transition-all duration-500 group-hover:opacity-40" style={{ backgroundColor: color }} />
                <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center border border-white/10 shadow-inner" style={{ backgroundColor: `${color}15` }}>
                    <Icon className="h-6 w-6 transition-transform duration-500 group-hover:scale-110" style={{ color }} />
                </div>
            </div>
            <div className="relative flex items-center justify-center mb-5">
                <svg className="w-32 h-32 transform -rotate-90 filter drop-shadow-[0_0_12px_rgba(0,0,0,0.06)]" viewBox="0 0 100 100">
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={gradColors.from} />
                            <stop offset="100%" stopColor={gradColors.to} />
                        </linearGradient>
                    </defs>
                    {/* Background track */}
                    <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100 dark:text-slate-800/60" />
                    {/* Progress arc */}
                    <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        stroke={`url(#${gradientId})`}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        style={{
                            strokeDashoffset: offset,
                            transition: 'stroke-dashoffset 2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            filter: `drop-shadow(0 0 8px ${color}60)`
                        }}
                        strokeLinecap="round"
                        fill="transparent"
                    />
                </svg>
                <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-black text-text-primary tracking-tighter transition-all duration-300 group-hover:scale-105">{value}%</span>
                </div>
            </div>
            <span className="text-xs font-black text-text-primary uppercase tracking-[0.15em] text-center mb-2">{label}</span>
            <span className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow-sm transition-all" style={{ color: riskColor, backgroundColor: `${riskColor}12`, border: `1px solid ${riskColor}25` }}>
                {riskLabel}
            </span>
            {description && <p className="text-[11px] text-text-secondary text-center mt-3.5 leading-relaxed px-1 font-medium">{description}</p>}
        </div>
    );
};

// ─── Horizontal Bar Chart (Premium Shimmer style) ──────────────────────────
const RiskBar = ({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);

    return (
        <div className="flex items-center gap-4 group py-1">
            <span className="text-xs font-bold text-text-secondary w-36 shrink-0 text-right group-hover:text-text-primary transition-colors">{label}</span>
            <div className="flex-1 bg-gray-100 dark:bg-slate-800/80 rounded-full h-6 overflow-hidden border border-border-light shadow-inner relative flex items-center">
                <div className="absolute inset-0 animate-shimmer-move pointer-events-none" />
                <div
                    className="h-full rounded-full flex items-center justify-end pr-3 transition-all relative"
                    style={{
                        width: `${width}%`,
                        background: `linear-gradient(90deg, ${color}cc, ${color})`,
                        transition: `width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
                        boxShadow: `0 0 10px ${color}50`,
                    }}
                >
                    <span className="text-[10px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{value}%</span>
                </div>
            </div>
        </div>
    );
};

const SCORE_COLOR = (s: number) => {
    if (s >= 80) return { ring: 'border-green-400', text: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
    if (s >= 60) return { ring: 'border-amber-400', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    return { ring: 'border-red-400', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
};

const SEV_STYLES: Record<string, { icon: React.ReactNode; border: string; pts: string }> = {
    critical: { icon: <ShieldAlert className="w-4 h-4 text-red-500" />, border: 'border-red-200 dark:border-red-800', pts: 'text-red-600 dark:text-red-400' },
    warning:  { icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, border: 'border-amber-200 dark:border-amber-800', pts: 'text-amber-600 dark:text-amber-400' },
    info:     { icon: <HeartPulse className="w-4 h-4 text-blue-400" />, border: 'border-blue-100 dark:border-blue-800', pts: 'text-blue-500 dark:text-blue-400' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main DashboardPredictivo Component ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardPredictivo = () => {
    const { showToast } = useToastContext();
    const { token, user } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO';

    // Data State
    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [isLoadingForecast, setIsLoadingForecast] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);

    // Sociodemographic & Roles State (Hito 1 & 2 integration)
    const [workers, setWorkers] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWorker, setSelectedWorker] = useState<any | null>(null);

    // UI State
    const [selectedModel, setSelectedModel] = useState(() => user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');

    useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState('new');
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [isReportCollapsed, setIsReportCollapsed] = useState(false);
    const [activeHito7Tab, setActiveHito7Tab] = useState<'timeseries' | 'anatomy' | 'sedes' | 'workforce'>('timeseries');
    const [riskFilter, setRiskFilter] = useState<{ roleOrTag: string; label: string } | null>(null);

    // ─── Fetch Forecast & Biocentric data ─────────────────────────────────
    const fetchForecast = useCallback(async () => {
        if (!token) return;
        if (!isPro) {
            setForecast(null);
            return;
        }
        setIsLoadingForecast(true);
        try {
            const res = await fetch('/api/sgsst/predictivo/forecast', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setForecast(data);
                showToast({ message: 'Indicadores predictivos actualizados', status: 'success' });
            } else {
                const errData = await res.json();
                showToast({ message: errData.error || 'Error al cargar indicadores', status: 'error' });
            }
        } catch (err) {
            showToast({ message: 'Error de conexión con el servidor', status: 'error' });
        } finally {
            setIsLoadingForecast(false);
        }
    }, [token, showToast]);

    const fetchBiocentricData = useCallback(async () => {
        if (!token) return;
        setLoadingData(true);
        try {
            const [s, p] = await Promise.all([
                fetch('/api/sgsst/perfil-sociodemografico/data', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/sgsst/perfiles-cargo/data', { headers: { Authorization: `Bearer ${token}` } })
            ]);
            const sd = await s.json();
            const pd = await p.json();
            setWorkers(sd.trabajadores || []);
            setProfiles(pd.perfilesList || []);
        } catch {
            showToast({ message: 'Error cargando datos biocéntricos', status: 'error' });
        } finally {
            setLoadingData(false);
        }
    }, [token, showToast]);

    useEffect(() => {
        fetchForecast();
        fetchBiocentricData();
    }, [token]);

    // ─── TAG → Score Map: Each IA tag maps to a score penalty ────────────────
    const TAG_RULES: Record<string, { pts: number; sev: string; cat: string; label: string; desc: string }> = {
        Lumbalgia:            { pts: 10, sev: 'warning',  cat: 'Osteomuscular',    label: 'Lumbalgia',             desc: 'Restricción lumbar detectada. Limita carga de peso y posturas prolongadas.' },
        Hernia_Discal:        { pts: 15, sev: 'critical', cat: 'Osteomuscular',    label: 'Hernia Discal',         desc: 'Condición discal que puede agravarse con esfuerzo físico.' },
        Cervicalgia:          { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',    label: 'Cervicalgia',           desc: 'Restricción cervical. Limita posiciones de cuello sostenidas.' },
        Epicondilitis:        { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',    label: 'Epicondilitis',         desc: 'Inflamación en el codo. Limita movimientos repetitivos del antebrazo.' },
        Tunel_Carpiano:       { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',    label: 'Túnel Carpiano',        desc: 'Compresión del nervio mediano. Limita trabajo manual repetitivo.' },
        Restriccion_Hombro:   { pts: 10, sev: 'warning',  cat: 'Osteomuscular',    label: 'Restricción de Hombro', desc: 'Limitación en el complejo del hombro. Limita levantamiento sobre la cabeza.' },
        Restriccion_Rodilla:  { pts: 10, sev: 'warning',  cat: 'Osteomuscular',    label: 'Restricción de Rodilla',desc: 'Limitación articular en rodilla. Limita escaleras, cargas y bipedestación.' },
        No_Carga_Peso:        { pts: 8,  sev: 'warning',  cat: 'Restricción Física',label: 'No Carga de Peso',      desc: 'Restricción médica explícita de levantamiento o carga de objetos.' },
        No_Bipedestacion:     { pts: 5,  sev: 'info',     cat: 'Restricción Física',label: 'No Bipedestación Prolongada', desc: 'Limitación para permanecer de pie por períodos extendidos.' },
        No_Sedestacion:       { pts: 5,  sev: 'info',     cat: 'Restricción Física',label: 'No Sedestación Prolongada',   desc: 'Limitación para permanecer sentado por períodos extendidos.' },
        Hipoacusia:           { pts: 8,  sev: 'warning',  cat: 'Sensorial',        label: 'Hipoacusia',            desc: 'Pérdida auditiva detectada. Requiere protección auditiva y evaluación.' },
        Vision_Reducida:      { pts: 5,  sev: 'info',     cat: 'Sensorial',        label: 'Visión Reducida',       desc: 'Disminución visual. Requiere corrección óptica adecuada para el cargo.' },
        HTA:                  { pts: 15, sev: 'warning',  cat: 'Clínico',          label: 'Hipertensión Arterial', desc: 'Tensión arterial elevada. Requiere seguimiento y control de estrés.' },
        Cardiopatia:          { pts: 20, sev: 'critical', cat: 'Clínico',          label: 'Cardiopatía',           desc: 'Condición cardíaca declarada. Limita esfuerzos físicos intensos.' },
        Diabetes:             { pts: 10, sev: 'warning',  cat: 'Clínico',          label: 'Diabetes',              desc: 'Condición metabólica que requiere control glucémico y pausas.' },
        Epilepsia:            { pts: 25, sev: 'critical', cat: 'Neurológico',      label: 'Epilepsia / Convulsiones','desc': 'Alto riesgo en operación de maquinaria y alturas. Bloqueo preventivo.' },
        Vertigo:              { pts: 18, sev: 'critical', cat: 'Neurológico',      label: 'Vértigo / Mareo',       desc: 'Riesgo de caída en alturas o desequilibrio durante operación de equipos.' },
        EPOC:                 { pts: 15, sev: 'warning',  cat: 'Respiratorio',     label: 'EPOC / Bronquitis',     desc: 'Enfermedad pulmonar obstructiva. Limita exposición a polvo y químicos.' },
        Asma:                 { pts: 10, sev: 'warning',  cat: 'Respiratorio',     label: 'Asma',                  desc: 'Hipersensibilidad bronquial. Limita exposición a irritantes ambientales.' },
        Alergia_Quimica:      { pts: 10, sev: 'warning',  cat: 'Inmunológico',     label: 'Alergia Química',       desc: 'Sensibilidad a agentes químicos. Requiere EPP específico y restricción de área.' },
        Medicamento_SNC:      { pts: 15, sev: 'critical', cat: 'Farmacológico',    label: 'Medicamento Depresor SNC','desc': 'Uso de sedantes o psicotrópicos incompatible con maquinaria. Alerta de seguridad.' },
        Restriccion_Mental:   { pts: 12, sev: 'warning',  cat: 'Psicosocial',      label: 'Restricción de Salud Mental','desc': 'Condición de salud mental que puede afectar concentración y toma de decisiones.' },
        Patologia_Cronica:    { pts: 10, sev: 'warning',  cat: 'Clínico',          label: 'Patología Crónica',     desc: 'Enfermedad crónica base que requiere vigilancia epidemiológica.' },
        Diagnostico_Reciente: { pts: 5,  sev: 'info',     cat: 'Clínico',          label: 'Diagnóstico Reciente',  desc: 'Diagnóstico médico reciente. Amerita seguimiento y ajuste del puesto.' },
        Recomendacion_Leve:   { pts: 3,  sev: 'info',     cat: 'Preventivo',       label: 'Recomendación Médica',  desc: 'Recomendación preventiva activa que debe ser gestionada por SST.' },
    };

    const calcFit = useCallback((w: any, profile: any) => {
        let score = 100;
        const auditItems: { title: string; description: string; pts: number; severity: string; category: string }[] = [];
        const add = (title: string, desc: string, pts: number, sev: string, cat: string) => {
            score -= pts; auditItems.push({ title, description: desc, pts, severity: sev, category: cat });
        };
        if (!profile) return { score: 0, auditItems: [{ title: 'Sin rol asignado', description: 'No se encontró Perfil de Cargo.', pts: 100, severity: 'critical', category: 'Operativo' }] };

        // 1. BIOMETRÍA
        if (w.imc) {
            const imc = parseFloat(w.imc);
            if (imc >= 30) add('Obesidad detectada', `IMC ${imc} indica obesidad. Riesgo cardiovascular elevado.`, 10, 'warning', 'Clínico');
            else if (imc < 18.5) add('Bajo peso', `IMC ${imc} sugiere déficit nutricional.`, 5, 'info', 'Clínico');
        }
        if (w.presionArterial) {
            const [s1, d1] = w.presionArterial.split('/');
            if (parseInt(s1||'0') >= 135 || parseInt(d1||'0') >= 90) add('Riesgo de Hipertensión', `PA ${w.presionArterial} sobre rangos óptimos.`, 15, 'warning', 'Clínico');
        }
        if (w.frecuenciaCardiaca) {
            const fc = parseInt(w.frecuenciaCardiaca);
            if (fc > 100) add('Taquicardia en reposo', `FC ${fc} lpm, posible estrés cardiovascular.`, 10, 'warning', 'Clínico');
            else if (fc < 50) add('Bradicardia', `FC ${fc} lpm, valoración cardiológica recomendada.`, 5, 'info', 'Clínico');
        }

        // 2. HÁBITOS
        if (w.fuma === 'Sí, diario') add('Tabaquismo Activo', 'Consumo diario impacta capacidad pulmonar y oxigenación celular.', 10, 'warning', 'Clínico');
        if (w.alcohol === 'Sí (Frecuente)') add('Etilismo Frecuente', 'Aumenta accidentabilidad y vulnerabilidad hepática.', 15, 'warning', 'Psicosocial');

        // 3. IA SEMÁNTICA
        const iaTags: string[] = w.bioTagsIA || [];
        const hasIATags = iaTags.length > 0 && !iaTags.includes('Sin_Hallazgos');
        const hasAnyText = [
            w.limitacionesBiomecanicas, w.recomendacionesMedicas,
            w.diagnosticoMedico, w.enfermedades, w.alergiasQuimicas, w.medicamentos
        ].some(v => v && String(v).trim().length > 2 && !String(v).toLowerCase().includes('ninguna') && !String(v).toLowerCase().includes('ninguno'));

        if (hasAnyText) {
            if (hasIATags) {
                iaTags.forEach(tag => {
                    const rule = TAG_RULES[tag];
                    if (!rule) return;
                    let pts = rule.pts;
                    if (tag === 'Lumbalgia' || tag === 'Hernia_Discal' || tag === 'Restriccion_Hombro' || tag === 'Restriccion_Rodilla') {
                        if (profile.exigenciaFisica === 'Alta') pts = Math.round(pts * 1.5);
                    }
                    if ((tag === 'Epilepsia' || tag === 'Vertigo' || tag === 'Medicamento_SNC' || tag === 'Restriccion_Mental') && profile.operaMaquinaria === 'Sí') {
                        pts = Math.round(pts * 2.0);
                    }
                    if (tag === 'Restriccion_Mental' && profile.exigenciaMental === 'Alta') {
                        pts = Math.round(pts * 1.5);
                    }
                    add(rule.label, rule.desc + (pts !== rule.pts ? ` ⚠️ Penalización agravada por exigencias del cargo.` : ''), pts, rule.sev, rule.cat);
                });
            } else {
                const hasEnf = w.enfermedades?.trim() && !w.enfermedades.toLowerCase().includes('ninguna');
                const hasDiag = w.diagnosticoMedico?.trim() && !w.diagnosticoMedico.toLowerCase().includes('ninguno') && !w.diagnosticoMedico.toLowerCase().includes('apto');
                const hasRestr = w.limitacionesBiomecanicas?.trim() && !w.limitacionesBiomecanicas.toLowerCase().includes('ninguna');
                const hasRec = w.recomendacionesMedicas?.trim() && !w.recomendacionesMedicas.toLowerCase().includes('ninguna');
                const hasAl = w.alergiasQuimicas?.trim() && !w.alergiasQuimicas.toLowerCase().includes('ninguna');
                if (hasEnf) add('Patología Base (pendiente análisis IA)', `"${w.enfermedades}" — Procesando con IA semántica.`, 10, 'warning', 'Clínico');
                if (hasDiag && !hasEnf) add('Diagnóstico Médico (pendiente análisis IA)', `"${w.diagnosticoMedico}" — Procesando con IA semántica.`, 5, 'info', 'Clínico');
                if (hasRestr) add('Restricción Biomecánica (pendiente análisis IA)', `"${w.limitacionesBiomecanicas}" — Procesando con IA semántica.`, 8, 'warning', 'Osteomuscular');
                if (hasRec) add('Recomendación Médica (pendiente análisis IA)', `"${w.recomendacionesMedicas}" — Procesando con IA semántica.`, 3, 'info', 'Preventivo');
                if (hasAl) add('Alergia Química (pendiente análisis IA)', `"${w.alergiasQuimicas}" — Procesando con IA semántica.`, 8, 'warning', 'Inmunológico');
            }
        }

        // 4. VULNERABILIDAD SOCIODEMOGRÁFICA
        let vs = 0;
        let socialDesc: string[] = [];
        if (['1', '2'].includes(w.estrato)) { vs++; socialDesc.push('estrato bajo'); }
        if (w.personasCargo && Number(w.personasCargo) >= 3) { vs++; socialDesc.push('alta carga dependientes'); }
        if (w.estadoCivil?.toLowerCase().includes('solter') || w.estadoCivil?.toLowerCase().includes('viud') || w.estadoCivil?.toLowerCase().includes('divorciad')) {
            if (w.personasCargo && Number(w.personasCargo) > 0) { vs++; socialDesc.push('monoparentalidad'); }
        }
        if (w.vivienda?.toLowerCase().includes('arrendada') || w.vivienda?.toLowerCase().includes('invasión')) { vs++; socialDesc.push('inestabilidad habitacional'); }

        if (vs >= 3) add('Vulnerabilidad Sociodemográfica', `Factores: ${socialDesc.join(', ')}.`, 0, 'info', 'Vigilancia Epidemiológica');
        else if (vs >= 2) add('Factores Psicosociales Externos', `Factores: ${socialDesc.join(', ')}.`, 0, 'info', 'Vigilancia Epidemiológica');

        return { score: Math.max(0, score), auditItems, hasIATags };
    }, [TAG_RULES]);

    // ─── Deterministic Conflict Detection Engine (Bio-Seguridad 360) ──────
    const getActiveConflicts = useCallback((workersList: any[], profilesList: any[]) => {
        const conflictsList: { workerName: string; cargo: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string }[] = [];
        workersList.forEach(w => {
            const profile = profilesList.find(p => (p.nombreCargo || '').toLowerCase().trim() === (w.cargo || '').toLowerCase().trim());
            if (!profile) return;
            const tags: string[] = w.bioTagsIA || [];
            
            // 1. Critical Lifesaving conflict: Epilepsia, Vertigo, SNC meds + operating machinery
            const isMachinery = profile.operaMaquinaria === 'Sí';
            const hasLethalTags = tags.some(t => ['Epilepsia', 'Vertigo', 'Medicamento_SNC'].includes(t));
            if (hasLethalTags && isMachinery) {
                conflictsList.push({
                    workerName: w.nombre,
                    cargo: w.cargo,
                    severity: 'critical',
                    title: '🛑 CONFLICTO CRÍTICO DE SEGURIDAD VITAL',
                    description: `El trabajador presenta susceptibilidad neurológica/farmacológica activa (${tags.filter(t => ['Epilepsia', 'Vertigo', 'Medicamento_SNC'].includes(t)).join(', ')}) y está asignado a operación de maquinaria pesada. Alto riesgo de fatalidad.`
                });
            }

            // 2. High Physical demand conflict: Lumbalgia, Hernia, Restricciones + High Physical Exigency
            const isHighPhysical = profile.exigenciaFisica === 'Alta';
            const hasErgoTags = tags.some(t => ['Lumbalgia', 'Hernia_Discal', 'Restriccion_Hombro', 'Restriccion_Rodilla', 'No_Carga_Peso'].includes(t));
            if (hasErgoTags && isHighPhysical) {
                conflictsList.push({
                    workerName: w.nombre,
                    cargo: w.cargo,
                    severity: 'warning',
                    title: '⚠️ INCOMPATIBILIDAD BIOMECÁNICA',
                    description: `Trabajador con restricción o antecedente osteomuscular activo (${tags.filter(t => ['Lumbalgia', 'Hernia_Discal', 'Restriccion_Hombro', 'Restriccion_Rodilla', 'No_Carga_Peso'].includes(t)).join(', ')}) asignado a cargo con exigencia física ALTA.`
                });
            }

            // 3. Clinical Exposure: HTA, Cardiopatía, Diabetes + High Physical Exigency
            const hasClinicalTags = tags.some(t => ['HTA', 'Cardiopatia', 'Diabetes'].includes(t));
            if (hasClinicalTags && isHighPhysical) {
                conflictsList.push({
                    workerName: w.nombre,
                    cargo: w.cargo,
                    severity: 'warning',
                    title: '💓 EXPOSICIÓN CARDIOVASCULAR',
                    description: `Trabajador con susceptibilidad cardiovascular activa (${tags.filter(t => ['HTA', 'Cardiopatia', 'Diabetes'].includes(t)).join(', ')}) expuesto a cargas físicas intensas de alta exigencia.`
                });
            }

            // 4. Psicosocial: Restriccion mental + High Mental Exigency
            const isHighMental = profile.exigenciaMental === 'Alta';
            const hasMentalTags = tags.some(t => ['Restriccion_Mental'].includes(t));
            if (hasMentalTags && isHighMental) {
                conflictsList.push({
                    workerName: w.nombre,
                    cargo: w.cargo,
                    severity: 'info',
                    title: '🧠 EXTREMA CARGA PSICOSOCIAL',
                    description: `Trabajador con vulnerabilidad de salud mental asignado a rol de alta exigencia cognitiva/toma de decisiones. Riesgo agudo de burnout.`
                });
            }
        });
        return conflictsList;
    }, []);

    // ─── Report Generation ────────────────────────────────────────────────
    const handleGenerate = useCallback(async () => {
        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-predictivo-ia`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
        if (!token) return;
        if (!isPro) {
            showToast({ message: 'Mejora a un plan Pro para generar análisis de IA', status: 'warning' });
            return;
        }
        setIsGenerating(true);
        try {
            const response = await fetch('/api/sgsst/predictivo/generate-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ modelName: selectedModel }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar el informe');
            }

            const data = await response.json();
            setGeneratedReport(data.report);
            editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId('new');
            setReportMessageId(null);
            setIsReportCollapsed(false);
            showToast({ message: 'Guardado exitosamente', status: 'success' });
        } catch (error: any) {
            showToast({ message: error.message || 'Error al generar el informe', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [selectedModel, token, showToast]);

    // ─── Save Report ──────────────────────────────────────────────────────
    const handleSaveReport = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedReport;
        if (!contentToSave) { showToast({ message: 'No hay informe para guardar', status: 'warning' }); return; }
        if (!token) { showToast({ message: 'Error: No autorizado', status: 'error' }); return; }

        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-predictivo-ia`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
        
        try {
            const isNew = !conversationId || conversationId === 'new';
            const body = {
                content: contentToSave,
                ...(isNew ? {
                    title: `Pronóstico IA Predictivo - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-predictivo-ia']
                } : { conversationId, messageId: reportMessageId })
            };

            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = await res.json();
                if (isNew) { setConversationId(data.conversationId); setReportMessageId(data.messageId); }
                setGeneratedReport(contentToSave);
                editorContentRef.current = contentToSave;
                liveEditorRef.current?.setHTML(contentToSave);
                setRefreshTrigger(prev => prev + 1);
                showToast({ message: 'Guardado exitosamente', status: 'success' });
            } else {
                const err = await res.json();
                showToast({ message: `Error al guardar: ${err.error || res.status}`, status: 'error' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        }
    }, [editorContentRef.current, generatedReport, conversationId, reportMessageId, token, showToast]);

    // ─── Select Report from History ──────────────────────────────────────
    const handleSelectReport = async (reportOrId: any) => {
        let content = '', convId = '', msgId = '';

        if (typeof reportOrId === 'string') {
            convId = reportOrId;
            try {
                const res = await fetch(`/api/messages/${convId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const messages = await res.json();
                    const reportMsg = messages.reverse().find((m: any) =>
                        m.sender === 'SGSST Diagnóstico' ||
                        (m.isCreatedByUser === false && m.text && m.text.includes('<html')) ||
                        (m.isCreatedByUser === false && m.text && m.text.length > 100)
                    );
                    if (reportMsg) { content = reportMsg.text; msgId = reportMsg.messageId; }
                    else { const last = messages[0]; if (last) { content = last.text; msgId = last.messageId; } }
                }
            } catch { showToast({ message: 'Error al obtener el contenido del informe', status: 'error' }); return; }
        } else if (reportOrId?.content) {
            content = reportOrId.content; convId = reportOrId.conversationId; msgId = reportOrId.messageId;
        }

        if (content) {
            setGeneratedReport(content); editorContentRef.current = content;
            liveEditorRef.current?.setHTML(content);
            setConversationId(convId); setReportMessageId(msgId);
            setIsHistoryOpen(false);
            showToast({ message: 'Informe cargado desde historial', status: 'info' });
        } else {
            showToast({ message: 'No se encontró contenido válido en el informe', status: 'warning' });
        }
    };

    const overallRisk = forecast?.overallRisk || 0;
    const riskBadgeColor = overallRisk > 70 ? '#ef4444' : overallRisk > 40 ? '#f97316' : '#22c55e';
    const riskBadgeBg = overallRisk > 70 ? '#fef2f2' : overallRisk > 40 ? '#fff7ed' : '#f0fdf4';
    const riskLabel = overallRisk > 70 ? 'Riesgo Extremo' : overallRisk > 40 ? 'Riesgo Alto' : 'Controlado';

    // Quantum reactive background system for the Hero Card
    const getHeroStyles = (risk: number) => {
        if (risk >= 70) {
            return {
                bg: 'linear-gradient(135deg, #311012 0%, #7f1d1d 50%, #991b1b 100%)',
                glow: 'rgba(239, 68, 68, 0.45)',
                textGlow: 'drop-shadow-[0_0_20px_rgba(239,68,68,0.85)]',
                badgeText: 'text-red-400',
                badgeBg: 'rgba(239, 68, 68, 0.15)',
                badgeBorder: 'border-red-500/30'
            };
        } else if (risk >= 40) {
            return {
                bg: 'linear-gradient(135deg, #2b170c 0%, #7c2d12 50%, #9a3412 100%)',
                glow: 'rgba(249, 115, 22, 0.45)',
                textGlow: 'drop-shadow-[0_0_20px_rgba(249,115,22,0.85)]',
                badgeText: 'text-orange-400',
                badgeBg: 'rgba(249, 115, 22, 0.15)',
                badgeBorder: 'border-orange-500/30'
            };
        } else {
            return {
                bg: 'linear-gradient(135deg, #042f2e 0%, #0d9488 50%, #115e59 100%)',
                glow: 'rgba(13, 148, 136, 0.45)',
                textGlow: 'drop-shadow-[0_0_20px_rgba(20,184,166,0.85)]',
                badgeText: 'text-teal-300',
                badgeBg: 'rgba(20, 184, 166, 0.15)',
                badgeBorder: 'border-teal-400/30'
            };
        }
    };
    
    const heroStyles = getHeroStyles(overallRisk);

    const cleanUUIDs = useCallback((text?: string) => {
        if (!text) return '';
        return text.replace(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, (match) => {
            const found = profiles.find(p => p.id?.toLowerCase() === match.toLowerCase());
            return found?.nombreCargo ? found.nombreCargo : 'Operaciones / Obra';
        });
    }, [profiles]);

    // Build bar data from forecast
    const barData = [
        { label: 'Incompatibilidad Biomecánica', value: forecast?.indicators?.ergonomicRisk || 0, color: '#8b5cf6' },
        { label: 'Vulnerabilidad Biométrica', value: forecast?.indicators?.healthRisk || 0, color: '#ef4444' },
        { label: 'Exposición Operacional', value: forecast?.indicators?.safetyRisk || 0, color: '#f97316' },
        { label: 'Riesgo Bio-Individual General', value: overallRisk, color: '#0d9488' },
    ];

    useAutoLoadReport({
        token,
        tags: ['sgsst-predictivo-ia'],
        generatedReport,
        handleSelectReport
    });

    // Filtering workers (supports biocentric risk filter from anatomy treemap)
    const filteredWorkers = workers.filter(w => {
        if (riskFilter) {
            const queryRisk = riskFilter.roleOrTag.toLowerCase();
            const matchesRole = (w.cargo || '').toLowerCase().includes(queryRisk);
            const matchesTag = (w.bioTagsIA || []).some((t: string) => t.toLowerCase().includes(queryRisk));
            if (!matchesRole && !matchesTag) return false;
        }
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return (w.nombre || '').toLowerCase().includes(query) || (w.cargo || '').toLowerCase().includes(query);
    });

    const activeConflicts = getActiveConflicts(workers, profiles);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
            {/* Inject Custom Style Block for High End Micro-Animations */}
            <style>{`
                @keyframes pulse-slow {
                    0%, 100% { opacity: 0.15; transform: scale(1); }
                    50% { opacity: 0.25; transform: scale(1.15); }
                }
                @keyframes border-shimmer {
                    0% { border-color: rgba(20, 184, 166, 0.4); }
                    50% { border-color: rgba(99, 102, 241, 0.6); }
                    100% { border-color: rgba(20, 184, 166, 0.4); }
                }
                @keyframes shimmer-move {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 8s infinite ease-in-out;
                }
                .animate-border-shimmer {
                    animation: border-shimmer 4s infinite ease-in-out;
                }
                .animate-shimmer-move {
                    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0) 100%);
                    background-size: 200% 100%;
                    animation: shimmer-move 3s infinite linear;
                }
                .glass-premium {
                    background: rgba(255, 255, 255, 0.65);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                }
                .dark .glass-premium {
                    background: rgba(15, 23, 42, 0.5);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                }
            `}</style>

            {/* ═══ Header / Toolbar ═══ */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900 p-6 sm:p-8 text-white shadow-2xl border border-teal-500/20">
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-teal-400 blur-[100px] -mr-20 -mt-20 animate-pulse-slow" />
                    <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-indigo-500 blur-[80px] -ml-20 -mb-20 animate-pulse-slow" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-teal-400/10 backdrop-blur-md border border-teal-400/20 flex items-center justify-center shrink-0 shadow-lg shadow-teal-500/10">
                            <BrainCircuit className="w-6 h-6 text-teal-300 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                                <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-teal-200 to-indigo-200">
                                    Centro de Inteligencia Predictiva · WAPPY
                                </h1>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-pink-500/15 text-pink-400 border border-pink-500/30 shadow-sm">
                                    <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-ping" />
                                    🧠 Hito 07 · El Pináculo de WAPPY
                                </span>
                            </div>
                            <p className="text-teal-100/80 text-xs max-w-2xl leading-relaxed font-medium">
                                Cúspide de analítica predictiva y Machine Learning. Pronóstico estocástico de siniestralidad a 1 y 12 meses, radar anatómico de lesiones y prescripción proactiva de controles para proteger la vida de cada colaborador.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 mt-6 pt-5 border-t border-white/10 w-full">
                    <SGSSTToolbar
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                        aiButtons={[
                            {
                                id: 'generate-predictive',
                                onClick: handleGenerate,
                                disabled: isGenerating,
                                title: "Generar Pronóstico IA 360°",
                                label: "Generar Pronóstico IA",
                                icon: "sparkles",
                                variant: "ai",
                                isLoading: isGenerating
                            }
                        ]}
                        selectedModel={selectedModel}
                        onSelectModel={setSelectedModel}
                        hasContent={!!(editorContentRef.current || generatedReport)}
                        exportContent={editorContentRef.current || generatedReport || ''}
                        exportFileName={`Pronostico_Predictivo_BioSeguridad_IA_${new Date().toISOString().split('T')[0]}`}
                        customSections={[
                            <button
                                key="btn-refresh"
                                onClick={() => { fetchForecast(); fetchBiocentricData(); }}
                                disabled={isLoadingForecast || loadingData}
                                className="group flex items-center justify-center h-10 px-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl transition-all duration-300 shadow-lg shrink-0 font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed outline-none hover:-rotate-2 hover:scale-105"
                            >
                                <RefreshCw className={cn("h-4 w-4 text-teal-300", (isLoadingForecast || loadingData) && "animate-spin")} />
                                <span className="ml-2 font-bold tracking-wide uppercase">Actualizar</span>
                            </button>
                        ]}
                    />
                </div>
            </div>

            {/* ═══ Report History ═══ */}
            {isHistoryOpen && (
                <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                    <ReportHistory onSelectReport={handleSelectReport} isOpen={isHistoryOpen}
                        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)} refreshTrigger={refreshTrigger} tags={['sgsst-predictivo-ia']} />
                </div>
            )}

            {/* ═══ Main Dashboard Grid ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left: Hero Card (Quantum Reactive Glow) ── */}
                <div className="lg:col-span-1 relative overflow-hidden rounded-3xl p-8 flex flex-col justify-between min-h-[300px] border border-white/10 shadow-2xl transition-all duration-500 hover:scale-[1.01] hover:shadow-3xl"
                    style={{ background: heroStyles.bg, boxShadow: `0 20px 40px -15px ${heroStyles.glow}` }}>
                    
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/5 blur-2xl animate-pulse-slow" />
                        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/5 blur-2xl animate-pulse-slow" />
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-5">
                            <Zap className="h-4.5 w-4.5 text-teal-200 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-200">Riesgo Bio-Individual General</span>
                        </div>
                        <div className={cn("text-7xl sm:text-8xl font-black text-white mb-4 tracking-tighter leading-none transition-all duration-500", heroStyles.textGlow)}>
                            {isLoadingForecast
                                ? <div className="h-20 w-36 bg-white/15 rounded-2xl animate-pulse" />
                                : `${overallRisk}%`
                            }
                        </div>
                        <span className="inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border border-white/10"
                            style={{ backgroundColor: riskBadgeBg, color: riskBadgeColor }}>
                            {riskLabel}
                        </span>
                    </div>

                    {forecast?.criticalArea && (
                        <div className="mt-6 pt-5 border-t border-white/15 relative z-10">
                            <span className="block text-[9px] text-teal-200/80 font-black uppercase tracking-[0.2em] mb-2.5 flex items-center gap-1.5">
                                <TrendingUp className="h-3.5 w-3.5" /> Foco Crítico de Siniestralidad
                            </span>
                            <span className="font-black text-white text-sm sm:text-base tracking-wide flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" />
                                {cleanUUIDs(forecast.criticalArea).toUpperCase()}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Right: 3 Premium Bioseguridad Medidores ── */}
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <RingGauge
                        value={forecast?.indicators?.healthRisk || 0}
                        label="Vulnerabilidad Biométrica"
                        color="#ef4444"
                        bgColor="#fef2f2"
                        icon={HeartPulse}
                        description={forecast?.evidence?.healthEvidence || "Hallazgos y susceptibilidades clínicas registradas"}
                        gradientId="grad-health"
                        gradColors={{ from: "#ef4444", to: "#991b1b" }}
                    />
                    <RingGauge
                        value={forecast?.indicators?.safetyRisk || 0}
                        label="Exposición Operacional"
                        color="#f97316"
                        bgColor="#fff7ed"
                        icon={AlertTriangle}
                        description={forecast?.evidence?.safetyEvidence || "Incidentes, actos inseguros y peligros biológicos/físicos"}
                        gradientId="grad-safety"
                        gradColors={{ from: "#f97316", to: "#f43f5e" }}
                    />
                    <RingGauge
                        value={forecast?.indicators?.ergonomicRisk || 0}
                        label="Incompatibilidad Postural"
                        color="#8b5cf6"
                        bgColor="#f5f3ff"
                        icon={ShieldCheck}
                        description={forecast?.evidence?.ergonomicEvidence || "Riesgos biomecánicos y OWAS ergonómicos"}
                        gradientId="grad-ergonomic"
                        gradColors={{ from: "#8b5cf6", to: "#6366f1" }}
                    />
                </div>
            </div>

            {/* ═══ active conflicts list (strategic bioseguridad alerts) ═══ */}
            {activeConflicts.length > 0 && (
                <div className="p-6 rounded-3xl border-2 border-red-500/20 bg-red-500/[0.03] dark:bg-red-500/[0.02] shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldAlert className="h-5 w-5 text-red-500 animate-bounce" />
                        <h3 className="text-sm font-black text-red-600 dark:text-red-400 tracking-[0.1em] uppercase">ALERTAS CRÍTICAS DE BIO-SEGURIDAD 360°</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeConflicts.map((conf, index) => (
                            <div key={index} className="flex items-start gap-4 p-4 rounded-2xl border border-red-500/20 bg-surface-primary dark:bg-slate-900/50 hover:shadow-lg transition-shadow group">
                                <div className="p-2 bg-red-500/10 text-red-500 rounded-xl shrink-0">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-600 dark:text-red-400 mb-1 border border-red-500/20">
                                        {conf.severity.toUpperCase()}
                                    </span>
                                    <h4 className="font-bold text-xs text-text-primary mb-1">
                                        {conf.workerName} · <span className="text-text-secondary font-medium">{conf.cargo}</span>
                                    </h4>
                                    <p className="text-[11px] text-text-secondary leading-relaxed font-semibold">
                                        {conf.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ Modular Sub-Navigation Pills (Hito 07) ═══ */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 rounded-3xl bg-surface-primary border border-border-medium/60 shadow-sm">
                <div className="flex items-center flex-wrap gap-1.5 w-full sm:w-auto">
                    <button
                        onClick={() => setActiveHito7Tab('timeseries')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                            activeHito7Tab === 'timeseries'
                                ? "bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-lg shadow-teal-500/25 scale-[1.02]"
                                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                        )}
                    >
                        <TrendingUp className="w-4 h-4" />
                        Proyección Temporal (1M & 12M)
                    </button>
                    <button
                        onClick={() => setActiveHito7Tab('anatomy')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                            activeHito7Tab === 'anatomy'
                                ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-lg shadow-pink-500/25 scale-[1.02]"
                                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                        )}
                    >
                        <ShieldAlert className="w-4 h-4" />
                        Diagnóstico Anatómico & Lesiones
                    </button>
                    <button
                        onClick={() => setActiveHito7Tab('sedes')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                            activeHito7Tab === 'sedes'
                                ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/25 scale-[1.02]"
                                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                        )}
                    >
                        <Building2 className="w-4 h-4" />
                        Sedes & Focalización Operativa
                    </button>
                    <button
                        onClick={() => setActiveHito7Tab('workforce')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                            activeHito7Tab === 'workforce'
                                ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/25 scale-[1.02]"
                                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                        )}
                    >
                        <Users className="w-4 h-4" />
                        Plantilla Biocéntrica (FIT 360°)
                    </button>
                </div>

                {riskFilter && (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-700 dark:text-teal-300 text-xs font-bold shrink-0">
                        <span>Filtro Biocéntrico: <strong>{riskFilter.label}</strong></span>
                        <button
                            onClick={() => setRiskFilter(null)}
                            className="p-0.5 hover:bg-teal-500/20 rounded-md transition-colors"
                            title="Quitar filtro"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* ═══ Active Tab Content ═══ */}
            {activeHito7Tab === 'timeseries' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <PredictiveTimeSeriesChart
                        timeSeries={forecast?.timeSeries || []}
                        metrics={forecast?.predictiveMetrics}
                        isLoading={isLoadingForecast}
                    />
                </div>
            )}

            {activeHito7Tab === 'anatomy' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <PredictiveAnatomyTreemap
                        lesionDistribution={forecast?.lesionDistribution}
                        anatomyDistribution={forecast?.anatomyDistribution}
                        onFilterByWorkerRisk={(roleOrTag, label) => {
                            setRiskFilter({ roleOrTag, label });
                            setActiveHito7Tab('workforce');
                        }}
                        activeFilter={riskFilter?.label}
                    />
                </div>
            )}

            {activeHito7Tab === 'sedes' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <PredictivePlantComparison
                        siteDistribution={forecast?.siteDistribution}
                    />
                </div>
            )}

            {activeHito7Tab === 'workforce' && (
                <div className="p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <h3 className="text-sm font-black text-text-primary flex items-center gap-2 tracking-[0.1em] uppercase">
                                <Users className="h-4.5 w-4.5 text-teal-500" />
                                MAPA DE CALOR: APTITUD BIO-INDIVIDUAL 360°
                            </h3>
                            <p className="text-[11px] text-text-secondary font-semibold mt-0.5">Control de aptitud clínica-operativa de la plantilla completa.</p>
                        </div>
                        <div className="relative max-w-xs w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
                            <input
                                type="text"
                                placeholder="Buscar trabajador o cargo..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-border-medium bg-surface-primary hover:border-teal-500/30 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-semibold"
                            />
                        </div>
                    </div>

                    {loadingData ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                        </div>
                    ) : filteredWorkers.length === 0 ? (
                        <div className="text-center p-12 text-text-secondary">
                            <UserX className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-xs font-bold">No se encontraron trabajadores que coincidan con el filtro actual.</p>
                            {riskFilter && (
                                <button
                                    onClick={() => setRiskFilter(null)}
                                    className="mt-3 text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline"
                                >
                                    Quitar filtro biocéntrico ({riskFilter.label})
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredWorkers.map(w => {
                                const profile = profiles.find(p => (p.nombreCargo || '').toLowerCase().trim() === (w.cargo || '').toLowerCase().trim());
                                const fit = calcFit(w, profile);
                                const score = (w.biocentricScore !== undefined && w.biocentricScore !== null) ? w.biocentricScore : fit.score;
                                const sc = SCORE_COLOR(score);
                                const hasIA = w.bioTagsIA && w.bioTagsIA.length > 0 && !w.bioTagsIA.includes('Sin_Hallazgos');
                                
                                return (
                                    <div 
                                        key={w.id} 
                                        onClick={() => setSelectedWorker({ ...w, calculatedScore: score, auditItems: fit.auditItems })}
                                        className="p-4 rounded-2xl border border-border-light bg-surface-primary/70 hover:bg-surface-primary hover:border-teal-500/40 hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between gap-3 group relative overflow-hidden"
                                    >
                                        {/* Visual hover background glow */}
                                        <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-teal-500/[0.02] blur-xl pointer-events-none group-hover:bg-teal-500/10 transition-all duration-500" />
                                        
                                        <div className="flex items-start justify-between gap-2.5">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-black shrink-0 transition-transform duration-500 group-hover:scale-105", sc.ring, sc.bg, sc.text)}>
                                                    {(w.nombre || 'U')[0].toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-xs text-text-primary truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{w.nombre}</h4>
                                                    <p className="text-[10px] text-text-secondary truncate font-bold flex items-center gap-1 mt-0.5">
                                                        <Briefcase className="w-3 h-3 shrink-0" />
                                                        {w.cargo || 'Sin cargo'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end">
                                                <span className={cn("px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase shadow-sm", sc.badge)}>
                                                    {score}% FIT
                                                </span>
                                            </div>
                                        </div>

                                        {/* Tags row */}
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {hasIA ? (
                                                w.bioTagsIA.slice(0, 2).map((tag: string) => (
                                                    <span key={tag} className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                        {tag}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-[8px] font-bold text-text-secondary italic">Sin anomalías críticas</span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between border-t border-border-light pt-2 mt-1">
                                            <span className="text-[9px] font-bold text-text-secondary">Edad: {w.edad || '?'} años</span>
                                            <span className="text-[9px] font-black text-teal-600 dark:text-teal-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Ficha 360° <Eye className="w-3 h-3" />
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Bar Chart + Predicted Insight ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Bar Chart (Radar Panel) */}
                <div className="p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl transition-all duration-300">
                    <h3 className="text-xs font-black text-text-primary mb-6 flex items-center gap-2 tracking-[0.12em] uppercase">
                        <Activity className="h-4 w-4 text-teal-500" />
                        PUNTOS CRÍTICOS BIO-SEGURIDAD 360
                    </h3>
                    {isLoadingForecast ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex flex-wrap items-center gap-3 w-full animate-pulse">
                                    <div className="w-28 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                                    <div className="flex-1 h-5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4.5">
                            {barData.map((bar, i) => (
                                <RiskBar key={bar.label} {...bar} delay={i * 150} />
                            ))}
                        </div>
                    )}

                    {/* Data Sources */}
                    <div className="mt-6 pt-5 border-t border-border-medium/60">
                        <div className="flex items-center justify-between mb-3.5">
                            <span className="text-[10px] font-black text-teal-600 dark:text-teal-400 block uppercase tracking-[0.15em]">Fuentes Integradas & Motor Predictivo</span>
                            {forecast?.predictiveMetrics && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Motor ML {forecast.predictiveMetrics.modelReliabilityMonthly} (1M) / {forecast.predictiveMetrics.modelReliabilityYearly} (1A)
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                'Huella Biocéntrica H1 (FIT & Salud)',
                                'Matriz Bio-IPEVAR (9 Dominios H2)',
                                'Matriz Causal Multidimensional (8M)',
                                'Estadísticas ATEL & Días Cargados (H4)',
                                'Investigaciones Forenses (H4)',
                                'Dinámica OWAS & LIVA IA (H3)',
                                'Participación IPEVAR & Miedo (H3)',
                                'Tareas Críticas & Alturas (H3)'
                            ].map(src => (
                                <div key={src} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-primary border border-border-light hover:border-teal-500/30 hover:bg-teal-500/5 transition-all duration-300 group cursor-default">
                                    <div className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_6px_#14b8a6] shrink-0 group-hover:scale-125 transition-transform" />
                                    <span className="text-[10px] font-bold text-text-secondary group-hover:text-text-primary transition-colors">{src}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Correlation Panel or Upgrade Wall */}
                <div className="flex flex-col gap-6">
                    {!isPro ? (
                        <div className="flex-1 flex flex-col justify-center h-full">
                            <UpgradeWall
                                isPopup={true}
                                plan="USER_IPEVAR"
                                title="Análisis Predictivo IA Exclusivo"
                                description="El análisis de correlación predictiva IA y sus recomendaciones prioritarias son exclusivas del Plan Wappy Pro. Actualiza tu plan para activarlo."
                            />
                        </div>
                    ) : (
                        <>
                            {/* AI Insight Card */}
                            <div className="p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl flex-1 hover:shadow-2xl transition-all duration-300 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl pointer-events-none group-hover:bg-teal-500/20 transition-all duration-500" />
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-xs font-black text-text-primary flex items-center gap-2 tracking-[0.12em] uppercase">
                                        <AnimatedIcon name="sparkles" size={16} className="text-teal-500 animate-pulse" />
                                        ANÁLISIS PREDICTIVO ML & CAUSALIDAD MULTIDIMENSIONAL (8M)
                                    </h3>
                                    {forecast?.topDomain && (
                                        <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800">
                                            Dominio Crítico: {forecast.topDomain}
                                        </span>
                                    )}
                                </div>
                                <div className="relative p-5 bg-surface-primary/80 backdrop-blur-sm rounded-2xl border border-border-medium shadow-inner">
                                    <span className="absolute -top-3 left-4 text-3xl font-serif text-teal-400/50 leading-none">“</span>
                                    <p className="text-xs text-text-primary leading-relaxed font-semibold italic pl-4 pr-2">
                                        {cleanUUIDs(forecast?.predictionSummary) || "Haga clic en 'Actualizar' para generar el análisis predictivo cruzado de todos los módulos..."}
                                    </p>
                                    <span className="absolute -bottom-7 right-4 text-3xl font-serif text-teal-400/50 leading-none">”</span>
                                </div>
                            </div>

                            {/* Recommended Actions */}
                            <div className="p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl hover:shadow-2xl transition-all duration-300">
                                <h3 className="text-xs font-black text-text-primary mb-5 flex items-center gap-2 tracking-[0.12em] uppercase">
                                    <AnimatedIcon name="database" size={16} className="text-teal-500" />
                                    ACCIONES PREVENTIVAS PRIORITARIAS
                                </h3>
                                <div className="space-y-3.5">
                                    {forecast?.recommendedActions?.length ? forecast.recommendedActions.map((action, i) => (
                                        <div key={i} className="flex items-start gap-4.5 p-4.5 bg-surface-primary/60 hover:bg-surface-primary hover:border-teal-500/40 hover:shadow-md transition-all duration-300 rounded-2xl border border-border-light/80 group">
                                            <div className="mt-0.5 h-7 w-7 rounded-2xl flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-lg shadow-teal-500/20 group-hover:scale-110 transition-transform"
                                                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}>
                                                {i + 1}
                                            </div>
                                            <span className="text-xs text-text-primary font-semibold leading-relaxed">{cleanUUIDs(action)}</span>
                                        </div>
                                    )) : [1, 2, 3].map(i => (
                                        <div key={i} className="flex items-center gap-4 p-4.5 bg-surface-primary/60 rounded-2xl border border-border-light">
                                            <div className="h-7 w-7 rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
                                            <div className="flex-1 h-4 bg-gray-200 dark:bg-slate-700 animate-pulse rounded" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            {/* ═══ Generated Report ═══ */}
            <div className="mt-4">
                <CollapsibleReportBox 
                    onSave={handleSaveReport}
                    onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                    isHistoryOpen={isHistoryOpen}
                    title="Gestión Predictiva de Bioseguridad"
                    icon={<LineChart className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_DashboardPredictivo_Bioseguridad360"
                            reportType="general"
                        />
                    }
                >
                    <div className="rounded-xl p-1 overflow-hidden bg-white dark:bg-[#1a1a1a]">
                        <LiveEditor
                            ref={liveEditorRef}
                            initialContent={generatedReport || ''}
                            onUpdate={(html) => { editorContentRef.current = html; }}
                            reportSourceData={forecast}
                        />
                    </div>
                </CollapsibleReportBox>
            </div>
        
            {/* Upgrade Modal (Freemium Teaser) */}
            {showUpgradeModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <div className="relative max-w-sm w-full animate-in zoom-in-95 duration-300">
                        <button 
                            onClick={() => setShowUpgradeModal(false)} 
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-md text-sm"
                        >
                            Cerrar ✕
                        </button>
                        <div className="bg-surface-primary rounded-3xl shadow-2xl overflow-hidden">
                            <UpgradeWall
                                title="Límite Gratuito Alcanzado"
                                description="Has alcanzado el límite para este módulo. Adquiere Premium para generar registros ilimitados."
                                plan="USER_IPEVAR"
                                isCompact={true}
                                hideFeatures={true}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Ultra-Premium Bioseguridad 360° Worker Modal ═══ */}
            {selectedWorker && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <div className="bg-surface-primary dark:bg-slate-900 border border-border-medium/60 rounded-3xl p-6 max-w-xl w-full mx-4 shadow-2xl relative animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
                        <button 
                            onClick={() => setSelectedWorker(null)} 
                            className="absolute top-4 right-4 p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors text-text-secondary outline-none"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        
                        <div className="flex items-center gap-4.5 mb-6 border-b border-border-light pb-5">
                            <div className={cn("w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-black shrink-0", SCORE_COLOR(selectedWorker.calculatedScore).ring, SCORE_COLOR(selectedWorker.calculatedScore).bg, SCORE_COLOR(selectedWorker.calculatedScore).text)}>
                                {(selectedWorker.nombre || 'U')[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-black text-lg text-text-primary truncate">{selectedWorker.nombre}</h3>
                                <p className="text-xs text-text-secondary font-bold flex items-center gap-1.5 mt-0.5">
                                    <Briefcase className="w-3.5 h-3.5 text-teal-500" />
                                    {selectedWorker.cargo || 'Sin cargo'} · {selectedWorker.edad || '?'} años
                                </p>
                            </div>
                            <div className={cn("px-3.5 py-2 rounded-2xl text-xs font-black uppercase tracking-wider text-center shrink-0 border", SCORE_COLOR(selectedWorker.calculatedScore).badge)}>
                                {selectedWorker.calculatedScore}% FIT
                            </div>
                        </div>

                        <div className="space-y-5">
                            {/* IA Tags Area */}
                            <div>
                                <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Hallazgos Semánticos IA
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedWorker.bioTagsIA && selectedWorker.bioTagsIA.length > 0 && !selectedWorker.bioTagsIA.includes('Sin_Hallazgos') ? (
                                        selectedWorker.bioTagsIA.map((tag: string) => {
                                            const r = TAG_RULES[tag];
                                            const pts = r?.pts || 5;
                                            return (
                                                <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-border-medium/60 shadow-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                    {r?.label || tag} (-{pts} pts)
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <div className="flex items-center gap-2 text-green-600 text-xs font-bold py-1">
                                            <CheckCircle className="w-4 h-4" /> Apto · Sin susceptibilidades de salud críticas
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-surface-secondary/50 rounded-2xl p-4 border border-border-light">
                                    <p className="text-[9px] text-text-secondary font-black uppercase tracking-wider mb-1">Presión Arterial</p>
                                    <p className="text-sm font-black text-text-primary">{selectedWorker.presionArterial || 'No registrada'}</p>
                                </div>
                                <div className="bg-surface-secondary/50 rounded-2xl p-4 border border-border-light">
                                    <p className="text-[9px] text-text-secondary font-black uppercase tracking-wider mb-1">Frecuencia Cardíaca</p>
                                    <p className="text-sm font-black text-text-primary">{selectedWorker.frecuenciaCardiaca ? `${selectedWorker.frecuenciaCardiaca} lpm` : 'No registrada'}</p>
                                </div>
                                <div className="bg-surface-secondary/50 rounded-2xl p-4 border border-border-light">
                                    <p className="text-[9px] text-text-secondary font-black uppercase tracking-wider mb-1">Índice de Masa Corporal (IMC)</p>
                                    <p className="text-sm font-black text-text-primary">{selectedWorker.imc || 'No registrado'}</p>
                                </div>
                                <div className="bg-surface-secondary/50 rounded-2xl p-4 border border-border-light">
                                    <p className="text-[9px] text-text-secondary font-black uppercase tracking-wider mb-1">Hábitos de Fumar</p>
                                    <p className="text-sm font-black text-text-primary">{selectedWorker.fuma || 'No registrado'}</p>
                                </div>
                            </div>

                            {/* Biocentric Audit Alerts */}
                            <div>
                                <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <HeartPulse className="w-3.5 h-3.5 text-teal-500" /> Auditoría de Aptitud Biocéntrica 360°
                                </h4>
                                <div className="space-y-2">
                                    {selectedWorker.auditItems && selectedWorker.auditItems.length > 0 ? (
                                        selectedWorker.auditItems.map((item: any, i: number) => {
                                            const s = SEV_STYLES[item.severity] || SEV_STYLES.info;
                                            return (
                                                <div key={i} className={cn("flex items-start gap-3 p-3 rounded-2xl border bg-surface-secondary/30", s.border)}>
                                                    <div className={cn("text-xs font-black w-8 shrink-0 text-right mt-0.5", s.pts)}>-{Math.abs(item.pts)}</div>
                                                    <div className="shrink-0 mt-0.5">{s.icon}</div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-text-primary">{item.title}</p>
                                                        <p className="text-[10px] text-text-secondary leading-tight mt-0.5 font-semibold">{item.description}</p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="p-3 bg-green-500/5 border border-green-500/20 text-green-600 text-xs font-bold rounded-2xl flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4" /> 100% de Aptitud Biocéntrica. Óptimas condiciones clínicas y operacionales.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-5 border-t border-border-light flex justify-end">
                            <button 
                                onClick={() => setSelectedWorker(null)}
                                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-teal-600/10 border border-teal-500/20 transition-all duration-300"
                            >
                                Entendido · Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardPredictivo;
