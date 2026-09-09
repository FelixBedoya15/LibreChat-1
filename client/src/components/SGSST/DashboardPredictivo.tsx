import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    Layers,
    Scale,
    Heart,
    Stethoscope,
    BadgeCheck,
    MapPin,
    Cigarette,
    AlertCircle,
    Fingerprint,
    FileText,
    ClipboardList,
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

export interface TelemetrySourceItem {
    id: string;
    name: string;
    category: 'Humano' | 'Riesgos' | 'Operación' | 'Forense' | 'Gestión';
    count: number;
    unit: string;
    status: string;
}

interface ForecastData {
    overallRisk: number;
    criticalArea: string;
    topDomain?: string;
    predictionSummary: string;
    telemetrySources?: TelemetrySourceItem[];
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
    activeCompany?: {
        id?: string;
        name?: string;
        nit?: string;
        arl?: string;
        riskLevel?: string;
        workerCount?: number;
        sedesCount?: number;
    };
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

const ALL_TELEMETRY_DEFINITIONS = [
    { id: 'huella_biocentrica', name: 'Huella Biocéntrica 360°', tag: 'H1', category: 'Humano', desc: 'FIT Score, perfil sociodemográfico y salud', unit: 'colaboradores' },
    { id: 'perfiles_cargo', name: 'Perfiles de Cargo & Profesiograma', tag: 'H1', category: 'Humano', desc: 'Exigencias físicas, biomecánicas y psicosociales', unit: 'cargos parametrizados' },
    { id: 'matriz_ipevar', name: 'Matriz Bio-IPEVAR (GTC-45)', tag: 'H2', category: 'Riesgos', desc: '9 dominios de peligros y evaluación bio-física', unit: 'peligros evaluados' },
    { id: 'analisis_vulnerabilidad', name: 'Plan de Emergencias & Vulnerabilidad', tag: 'H2', category: 'Riesgos', desc: 'Análisis de amenazas naturales y técnicas', unit: 'amenazas analizadas' },
    { id: 'ergonomia_owas', name: 'Ergonomía OWAS & LIVA', tag: 'H3', category: 'Operación', desc: 'Sobrecarga postural, carga física y biomecánica', unit: 'posturas evaluadas' },
    { id: 'permisos_alturas', name: 'Permisos de Alto Riesgo', tag: 'H3', category: 'Operación', desc: 'Alturas, caliente, confinados y energías peligrosas', unit: 'permisos tramitados' },
    { id: 'sustancias_quimicas', name: 'Sustancias Químicas & SGA', tag: 'H3', category: 'Operación', desc: 'Fichas FDS e incompatibilidad de almacenamiento', unit: 'productos químicos' },
    { id: 'seguridad_vial', name: 'Seguridad Vial PESV', tag: 'H3', category: 'Operación', desc: 'Flota, conductores y preoperacionales de vehículos', unit: 'vehículos en flota' },
    { id: 'control_epp', name: 'Dotación & Control de EPP', tag: 'H3', category: 'Operación', desc: 'Inspección de equipos y reposición de dotación', unit: 'registros de dotación' },
    { id: 'analisis_ats', name: 'Análisis de Trabajo Seguro (ATS)', tag: 'H3', category: 'Operación', desc: 'Procedimientos paso a paso para tareas no rutinarias', unit: 'formatos ATS' },
    { id: 'reportes_actos', name: 'Reportes de Actos & Condiciones', tag: 'H3', category: 'Operación', desc: 'Tarjetas de observación preventiva en campo', unit: 'tarjetas de campo' },
    { id: 'percepcion_miedo', name: 'Percepción & Miedo (Voz IPEVAR)', tag: 'H3', category: 'Operación', desc: 'Voz del trabajador y riesgo percibido en campo', unit: 'percepciones recogidas' },
    { id: 'estadisticas_atel', name: 'Estadísticas ATEL (Res. 0312)', tag: 'H4', category: 'Forense', desc: 'Siniestralidad, severidad, frecuencia e ILI', unit: 'eventos registrados' },
    { id: 'investigaciones_atel', name: 'Investigación Forense (Res. 1401)', tag: 'H4', category: 'Forense', desc: 'Árbol de causas, modelo GEMA y lecciones', unit: 'árboles de causas' },
    { id: 'matriz_legal', name: 'Matriz Legal & Cumplimiento', tag: 'SG', category: 'Gestión', desc: 'Normatividad colombiana y evaluación de requisitos', unit: 'artículos normativos' },
    { id: 'programa_capacitaciones', name: 'Programa de Capacitaciones', tag: 'SG', category: 'Gestión', desc: 'Cronograma anual y cobertura de inducciones', unit: 'temas programados' },
    { id: 'kanban_tasks', name: 'Compromisos & Hallazgos Kanban', tag: 'SG', category: 'Gestión', desc: 'Planes de acción, cierre de hallazgos y PHVA', unit: 'planes de acción' }
];

const TAG_STYLE_BY_CATEGORY: Record<string, string> = {
    Humano: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Riesgos: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20',
    Operación: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20',
    Forense: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
    Gestión: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
};

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

// ─── Horizontal Bar Chart (Cyber-SST Metric Card) ──────────────────────────
interface RiskBarProps {
    label: string;
    subtitle?: string;
    value: number;
    color: string;
    delay: number;
    icon?: 'activity' | 'heart' | 'shield' | 'brain';
}

const getRiskStatus = (val: number) => {
    if (val <= 15) return { label: 'Zona Segura / Óptimo', badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dotClass: 'bg-emerald-500 shadow-[0_0_8px_#10b981]' };
    if (val <= 30) return { label: 'Riesgo Controlado', badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20', dotClass: 'bg-teal-500 shadow-[0_0_8px_#14b8a6]' };
    if (val <= 60) return { label: 'Precaución / Moderado', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dotClass: 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' };
    return { label: 'Atención Prioritaria', badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', dotClass: 'bg-red-500 shadow-[0_0_8px_#ef4444]' };
};

const RiskBar = ({ label, subtitle, value, color, delay, icon }: RiskBarProps) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(Math.min(100, Math.max(0, value))), delay);
        return () => clearTimeout(t);
    }, [value, delay]);

    const status = getRiskStatus(value);

    const renderIcon = () => {
        switch (icon) {
            case 'activity':
                return <Activity className="w-4 h-4 text-purple-500" />;
            case 'heart':
                return <HeartPulse className="w-4 h-4 text-emerald-500" />;
            case 'shield':
                return <ShieldCheck className="w-4 h-4 text-amber-500" />;
            case 'brain':
                return <BrainCircuit className="w-4 h-4 text-teal-500" />;
            default:
                return <Activity className="w-4 h-4 text-teal-500" />;
        }
    };

    return (
        <div className="p-3.5 rounded-2xl bg-surface-primary/70 dark:bg-slate-900/50 border border-border-light hover:border-teal-500/40 hover:shadow-md transition-all duration-300 group">
            {/* Header: Metric details & Status badge */}
            <div className="flex items-center justify-between gap-2.5 mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-border-light shrink-0 group-hover:scale-105 transition-transform">
                        {renderIcon()}
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-xs font-bold text-text-primary truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                            {label}
                        </h4>
                        {subtitle && (
                            <p className="text-[10px] text-text-tertiary truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border items-center gap-1.5 ${status.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} />
                        {status.label}
                    </span>
                    <span 
                        className="px-2.5 py-1 rounded-xl text-xs font-mono font-black border text-white shadow-sm transition-transform group-hover:scale-105"
                        style={{
                            backgroundColor: color,
                            borderColor: `${color}99`,
                            boxShadow: `0 0 12px ${color}40`,
                        }}
                    >
                        {value}%
                    </span>
                </div>
            </div>

            {/* Smooth Progress Track with Shimmer & Glow */}
            <div className="w-full bg-slate-100 dark:bg-slate-800/90 rounded-full h-2.5 overflow-hidden border border-border-light shadow-inner relative flex items-center">
                <div className="absolute inset-0 animate-shimmer-move pointer-events-none" />
                <div
                    className="h-full rounded-full transition-all relative"
                    style={{
                        width: `${width}%`,
                        background: `linear-gradient(90deg, ${color}99, ${color})`,
                        transition: `width 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
                        boxShadow: `0 0 10px ${color}60`,
                    }}
                />
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

const GET_WORKER_FIT_DETAILS = (score: number) => {
    if (score >= 90) {
        return {
            label: 'Aptitud Óptima',
            sublabel: 'Sin restricciones clínicas',
            ring: 'border-emerald-500/40 dark:border-emerald-400/40',
            glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]',
            bg: 'bg-emerald-50 dark:bg-emerald-950/30',
            text: 'text-emerald-600 dark:text-emerald-400',
            badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
            barColor: '#10b981',
            dot: 'bg-emerald-500',
        };
    }
    if (score >= 75) {
        return {
            label: 'Aptitud Controlada',
            sublabel: 'Recomendaciones preventivas',
            ring: 'border-teal-500/40 dark:border-teal-400/40',
            glow: 'shadow-[0_0_20px_rgba(20,184,166,0.2)]',
            bg: 'bg-teal-50 dark:bg-teal-950/30',
            text: 'text-teal-600 dark:text-teal-400',
            badge: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25',
            barColor: '#14b8a6',
            dot: 'bg-teal-500',
        };
    }
    if (score >= 60) {
        return {
            label: 'Observación Activa',
            sublabel: 'Seguimiento médico periódico',
            ring: 'border-amber-500/40 dark:border-amber-400/40',
            glow: 'shadow-[0_0_20px_rgba(245,158,11,0.2)]',
            bg: 'bg-amber-50 dark:bg-amber-950/30',
            text: 'text-amber-600 dark:text-amber-400',
            badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
            barColor: '#f59e0b',
            dot: 'bg-amber-500',
        };
    }
    return {
        label: 'Vulnerabilidad Alta',
        sublabel: 'Restricción laboral vigente',
        ring: 'border-rose-500/40 dark:border-rose-400/40',
        glow: 'shadow-[0_0_20px_rgba(244,63,94,0.2)]',
        bg: 'bg-rose-50 dark:bg-rose-950/30',
        text: 'text-rose-600 dark:text-rose-400',
        badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25',
        barColor: '#f43f5e',
        dot: 'bg-rose-500',
    };
};

const getPresionStatus = (pa?: string) => {
    if (!pa || pa === 'No registrada' || pa === 'Sin registro') return { label: 'Sin registro clínico', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-border-light' };
    const match = String(pa).match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
        const sys = parseInt(match[1], 10);
        const dia = parseInt(match[2], 10);
        if (sys < 120 && dia < 80) return { label: 'Óptima (< 120/80)', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
        if (sys <= 129 && dia < 80) return { label: 'Normal (120-129)', color: 'text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/20' };
        if (sys <= 139 || dia <= 89) return { label: 'Prehipertensión (130-139)', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' };
        return { label: 'Hipertensión (≥ 140/90)', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' };
    }
    return { label: 'Parámetro Registrado', color: 'text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/20' };
};

const getFrecuenciaStatus = (fc?: any) => {
    const val = parseInt(String(fc || ''), 10);
    if (!val || isNaN(val)) return { label: 'Sin registro clínico', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-border-light' };
    if (val >= 60 && val <= 100) return { label: 'Eucardia Normal (60-100 lpm)', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
    if (val < 60) return { label: 'Bradicardia (< 60 lpm)', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Taquicardia (> 100 lpm)', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' };
};

const getImcStatus = (imcStr?: any) => {
    const val = parseFloat(String(imcStr || '').replace(',', '.'));
    if (!val || isNaN(val)) return { label: 'Sin registro de peso', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-border-light' };
    if (val < 18.5) return { label: 'Bajo Peso (< 18.5)', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' };
    if (val <= 24.9) return { label: 'Peso Saludable (18.5 - 24.9)', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
    if (val <= 29.9) return { label: 'Sobrepeso Leve (25.0 - 29.9)', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' };
    if (val <= 34.9) return { label: 'Obesidad Grado I (30.0 - 34.9)', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' };
    return { label: 'Obesidad Severa (≥ 35)', color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' };
};

const getFumaStatus = (fuma?: string) => {
    const str = String(fuma || '').toLowerCase().trim();
    if (!str || str === 'no' || str === 'no registrado' || str === 'falso' || str === 'false') {
        return { label: 'No Fumador · Salud Pulmonar', isRisk: false, color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
    }
    return { label: 'Fumador Activo · Factor de Riesgo', isRisk: true, color: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20' };
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
    const [sourceFilter, setSourceFilter] = useState<string>('Todos');

    const telemetryMap = useMemo(() => {
        const map = new Map<string, number>();
        if (forecast?.telemetrySources) {
            forecast.telemetrySources.forEach(s => map.set(s.id, s.count));
        }
        return map;
    }, [forecast?.telemetrySources]);

    const filteredSources = useMemo(() => {
        return ALL_TELEMETRY_DEFINITIONS.filter(s => {
            if (sourceFilter === 'Todos') return true;
            return s.category === sourceFilter;
        });
    }, [sourceFilter]);

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

    // Build bar data from forecast with rich contextual metadata and adaptive severity colors
    const barData: RiskBarProps[] = [
        { 
            label: 'Incompatibilidad Biomecánica', 
            subtitle: 'Sobrecarga postural, repetitividad y dinamometría (OWAS / LIVA)',
            value: forecast?.indicators?.ergonomicRisk || 0, 
            color: '#8b5cf6',
            icon: 'activity',
            delay: 0,
        },
        { 
            label: 'Vulnerabilidad Biométrica', 
            subtitle: 'Aptitud médica, preexistencias y FIT Score poblacional (Hito 1)',
            value: forecast?.indicators?.healthRisk || 0, 
            color: (forecast?.indicators?.healthRisk || 0) <= 20 ? '#10b981' : (forecast?.indicators?.healthRisk || 0) <= 50 ? '#f59e0b' : '#ef4444',
            icon: 'heart',
            delay: 120,
        },
        { 
            label: 'Exposición Operacional', 
            subtitle: 'Severidad IPEVAR y tareas de alto riesgo en puestos de trabajo (Hito 2 / H3)',
            value: forecast?.indicators?.safetyRisk || 0, 
            color: (forecast?.indicators?.safetyRisk || 0) <= 25 ? '#3b82f6' : (forecast?.indicators?.safetyRisk || 0) <= 50 ? '#f59e0b' : '#ef4444',
            icon: 'shield',
            delay: 240,
        },
        { 
            label: 'Riesgo Bio-Individual General', 
            subtitle: 'Índice sintético multivariado ponderado por Ensamble ML',
            value: overallRisk, 
            color: overallRisk <= 20 ? '#0d9488' : overallRisk <= 50 ? '#f59e0b' : '#ef4444',
            icon: 'brain',
            delay: 360,
        },
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
                                {forecast?.activeCompany?.name && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-200 border border-teal-400/30 shadow-sm backdrop-blur-md">
                                        <Building2 className="w-3 h-3 text-teal-300" />
                                        <span>Empresa Activa: <strong className="text-white">{forecast.activeCompany.name}</strong>{forecast.activeCompany.nit ? ` · NIT: ${forecast.activeCompany.nit}` : ''}</span>
                                    </span>
                                )}
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

                {/* Left Panel: PUNTOS CRÍTICOS BIO-SEGURIDAD 360 & FUENTES INTEGRADAS */}
                <div className="p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl transition-all duration-300 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xs font-black text-text-primary flex items-center gap-2 tracking-[0.12em] uppercase">
                                <Activity className="h-4 w-4 text-teal-500" />
                                PUNTOS CRÍTICOS BIO-SEGURIDAD 360
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                                4 Ejes Cuantitativos
                            </span>
                        </div>

                        {isLoadingForecast ? (
                            <div className="space-y-3.5">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="p-4 rounded-2xl bg-surface-primary/50 border border-border-light animate-pulse space-y-2.5">
                                        <div className="flex justify-between items-center">
                                            <div className="w-32 h-3.5 bg-gray-200 dark:bg-gray-700 rounded" />
                                            <div className="w-12 h-4 bg-gray-200 dark:bg-gray-700 rounded-md" />
                                        </div>
                                        <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {barData.map((bar) => (
                                    <RiskBar key={bar.label} {...bar} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Data Sources */}
                    <div className="mt-6 pt-5 border-t border-border-medium/60">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                            <div>
                                <span className="text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-teal-500" />
                                    Fuentes Integradas & Motor Predictivo (17 Módulos)
                                </span>
                                <p className="text-[9px] text-text-tertiary mt-0.5">
                                    Red neuronal conectada en tiempo real a todo el ecosistema WAPPY SG-SST
                                </p>
                            </div>
                            {forecast?.predictiveMetrics && (
                                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1 shadow-sm shrink-0">
                                    <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                                    Motor ML {forecast.predictiveMetrics.modelReliabilityMonthly} (1M) / {forecast.predictiveMetrics.modelReliabilityYearly} (1A)
                                </span>
                            )}
                        </div>

                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 no-scrollbar">
                            {[
                                { key: 'Todos', label: 'Todos (17)' },
                                { key: 'Humano', label: 'Humano (2)' },
                                { key: 'Riesgos', label: 'Riesgos (2)' },
                                { key: 'Operación', label: 'Operación (8)' },
                                { key: 'Forense', label: 'Forense (2)' },
                                { key: 'Gestión', label: 'Gestión (3)' },
                            ].map(cat => (
                                <button
                                    key={cat.key}
                                    type="button"
                                    onClick={() => setSourceFilter(cat.key)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all shrink-0 border",
                                        sourceFilter === cat.key
                                            ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                                            : "bg-surface-primary/70 text-text-secondary border-border-light hover:border-teal-500/40 hover:text-text-primary"
                                    )}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Telemetry Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
                            {filteredSources.map(src => {
                                const liveCount = telemetryMap.has(src.id)
                                    ? (telemetryMap.get(src.id) ?? 0)
                                    : (src.id === 'huella_biocentrica' ? workers.length : (src.id === 'perfiles_cargo' ? profiles.length : 0));
                                const tagColor = TAG_STYLE_BY_CATEGORY[src.category] || 'text-teal-600 bg-teal-500/10 border-teal-500/20';

                                return (
                                    <div key={src.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-primary/70 dark:bg-slate-900/40 border border-border-light hover:border-teal-500/40 hover:bg-teal-500/5 transition-all duration-300 group cursor-default">
                                        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black border font-mono shrink-0 ${tagColor}`}>
                                            {src.tag}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <p className="text-[10px] font-bold text-text-primary truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                                                    {src.name}
                                                </p>
                                            </div>
                                            <p className="text-[8.5px] text-text-tertiary truncate">
                                                {liveCount > 0 ? (
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{liveCount} {src.unit}</span>
                                                ) : (
                                                    <span>0 {src.unit}</span>
                                                )}
                                                {' · '}{src.desc}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0" title="Telemetría conectada en tiempo real">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Correlation Panel or Upgrade Wall */}
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
                                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-teal-500/10 blur-3xl pointer-events-none group-hover:bg-teal-500/20 transition-all duration-500" />
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400">
                                            <BrainCircuit className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-text-primary tracking-[0.12em] uppercase">
                                                MODELO PREDICTIVO & CAUSALIDAD INTEGRAL SG-SST
                                            </h3>
                                            <span className="text-[10px] text-text-tertiary">
                                                Modelo Ensamble ML · Random Forest + XGBoost Regressor
                                            </span>
                                        </div>
                                    </div>
                                    {forecast?.topDomain && (
                                        <span className={cn(
                                            "px-3 py-1 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border",
                                            (forecast.overallRisk || 0) >= 50
                                                ? "bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300 border-red-200 dark:border-red-800"
                                                : (forecast.overallRisk || 0) >= 25
                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                        )}>
                                            {(forecast.overallRisk || 0) >= 50 ? (
                                                <>
                                                    <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                                                    Dominio Crítico: {forecast.topDomain}
                                                </>
                                            ) : (forecast.overallRisk || 0) >= 25 ? (
                                                <>
                                                    <Activity className="w-3 h-3 text-amber-500" />
                                                    Dominio en Observación: {forecast.topDomain}
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                                    Dominio en Zona Segura: {forecast.topDomain}
                                                </>
                                            )}
                                        </span>
                                    )}
                                </div>

                                <div className="relative p-5 bg-surface-primary/90 dark:bg-slate-900/60 rounded-2xl border-l-4 border-l-teal-500 border border-border-medium shadow-inner">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border-light/70">
                                        <Sparkles className="w-3.5 h-3.5 text-teal-500" />
                                        <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                            Diagnóstico Causal Sintético (WAPPY Oráculo)
                                        </span>
                                    </div>
                                    <p className="text-xs text-text-primary leading-relaxed font-medium">
                                        {cleanUUIDs(forecast?.predictionSummary) || "Haga clic en 'Actualizar' para generar el análisis predictivo cruzado de todos los módulos..."}
                                    </p>
                                </div>
                            </div>

                            {/* Recommended Actions */}
                            <div className="p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl hover:shadow-2xl transition-all duration-300">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400">
                                            <ShieldCheck className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-text-primary tracking-[0.12em] uppercase">
                                                ACCIONES PREVENTIVAS PRIORITARIAS
                                            </h3>
                                            <span className="text-[10px] text-text-tertiary">
                                                Directrices Tácticas Derivadas del Oráculo IA
                                            </span>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                                        {forecast?.recommendedActions?.length || 3} Medidas Clave
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {forecast?.recommendedActions?.length ? forecast.recommendedActions.map((action, i) => {
                                        const isSafe = (forecast?.overallRisk || 0) < 35;
                                        const priorities = isSafe ? [
                                            { label: 'M1 · Blindaje & Mantenimiento', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                                            { label: 'M2 · Prevención Proactiva', badge: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
                                            { label: 'M3 · Vigilancia & Bienestar', badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
                                            { label: 'M4 · Seguimiento Continuo', badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
                                        ] : [
                                            { label: 'P1 · Prioridad Inmediata', badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
                                            { label: 'P2 · Prioridad Táctica', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
                                            { label: 'P3 · Monitoreo & Gerencia', badge: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
                                            { label: 'P4 · Control Periódico', badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20' },
                                        ];
                                        const p = priorities[i] || priorities[priorities.length - 1];

                                        return (
                                            <div key={i} className="flex items-start gap-3.5 p-3.5 bg-surface-primary/80 dark:bg-slate-900/50 hover:bg-surface-primary hover:border-teal-500/40 hover:shadow-md transition-all duration-300 rounded-2xl border border-border-light/80 group">
                                                <div className="mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-md group-hover:scale-105 transition-transform"
                                                    style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}>
                                                    {i + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${p.badge}`}>
                                                            {p.label}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-text-primary font-medium leading-relaxed">
                                                        {cleanUUIDs(action)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }) : [1, 2, 3].map(i => (
                                        <div key={i} className="flex items-center gap-4 p-4 bg-surface-primary/60 rounded-2xl border border-border-light">
                                            <div className="h-7 w-7 rounded-xl bg-gray-200 dark:bg-slate-700 animate-pulse shrink-0" />
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
            {showUpgradeModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
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
                </div>,
                document.body
            )}

            {/* ═══ Ultra-Premium Bioseguridad 360° Worker Modal (Portal to body) ═══ */}
            {selectedWorker && typeof document !== 'undefined' && (() => {
                const fitDetails = GET_WORKER_FIT_DETAILS(selectedWorker.calculatedScore);
                const presionStatus = getPresionStatus(selectedWorker.presionArterial);
                const frecuenciaStatus = getFrecuenciaStatus(selectedWorker.frecuenciaCardiaca);
                const imcStatus = getImcStatus(selectedWorker.imc);
                const fumaStatus = getFumaStatus(selectedWorker.fuma);

                return createPortal(
                    <div 
                        className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-y-auto"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setSelectedWorker(null);
                        }}
                    >
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl max-w-2xl w-full mx-auto shadow-2xl relative animate-in zoom-in-95 duration-200 my-auto max-h-[92vh] flex flex-col overflow-hidden">
                            
                            {/* Top decorative gradient bar */}
                            <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-emerald-400 to-indigo-500 shrink-0" />
                            
                            {/* Ambient subtle decorative glows */}
                            <div className="absolute -top-20 -right-20 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute top-48 -left-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

                            {/* Modal Header */}
                            <div className="p-5 sm:p-6 pb-4 sm:pb-5 border-b border-border-light relative z-10 flex items-start justify-between gap-4">
                                <div className="flex items-start sm:items-center gap-3.5 sm:gap-4.5 min-w-0 flex-1">
                                    {/* Squircle Avatar with glowing border */}
                                    <div className="relative shrink-0">
                                        <div className={cn(
                                            "w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 flex items-center justify-center text-xl sm:text-2xl font-black transition-all",
                                            fitDetails.ring, fitDetails.bg, fitDetails.text, fitDetails.glow
                                        )}>
                                            {(selectedWorker.nombre || 'U')[0].toUpperCase()}
                                        </div>
                                        <span 
                                            className={cn(
                                                "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center",
                                                fitDetails.dot
                                            )}
                                            title={fitDetails.label}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                        </span>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 bg-teal-500/10 dark:bg-teal-500/20 px-2 py-0.5 rounded-md border border-teal-500/20 flex items-center gap-1">
                                                <Fingerprint className="w-3 h-3" /> Ficha Biocéntrica H1
                                            </span>
                                            {selectedWorker.identificacion && (
                                                <span className="text-[9px] font-bold text-text-tertiary bg-surface-secondary/70 px-2 py-0.5 rounded-md border border-border-light">
                                                    CC: {selectedWorker.identificacion}
                                                </span>
                                            )}
                                            {selectedWorker.sede && (
                                                <span className="text-[9px] font-bold text-text-tertiary bg-surface-secondary/70 px-2 py-0.5 rounded-md border border-border-light flex items-center gap-1">
                                                    <Building2 className="w-2.5 h-2.5" /> {selectedWorker.sede}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-black text-lg sm:text-xl text-text-primary tracking-tight truncate">
                                            {selectedWorker.nombre}
                                        </h3>
                                        <p className="text-xs text-text-secondary font-bold flex items-center gap-1.5 mt-0.5 truncate">
                                            <Briefcase className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                            <span>{selectedWorker.cargo || 'Sin cargo'}</span>
                                            {selectedWorker.edad && (
                                                <>
                                                    <span className="text-text-tertiary">·</span>
                                                    <span>{selectedWorker.edad} años</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {/* Right Top Area: FIT Score Card & Close button */}
                                <div className="flex items-start gap-2 shrink-0">
                                    <div className="hidden sm:flex flex-col items-end p-2.5 px-3 rounded-2xl bg-surface-secondary/60 border border-border-light text-right">
                                        <span className="text-[9px] font-mono font-black uppercase tracking-wider text-text-tertiary">
                                            ÍNDICE FIT 360°
                                        </span>
                                        <div className="flex items-baseline gap-1 my-0.5">
                                            <span className={cn("text-2xl font-black font-mono tracking-tight", fitDetails.text)}>
                                                {selectedWorker.calculatedScore}%
                                            </span>
                                        </div>
                                        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border flex items-center gap-1", fitDetails.badge)}>
                                            <span className={cn("w-1.5 h-1.5 rounded-full", fitDetails.dot)} />
                                            {fitDetails.label}
                                        </span>
                                    </div>

                                    <button 
                                        onClick={() => setSelectedWorker(null)} 
                                        className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors outline-none"
                                        title="Cerrar ficha"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Mobile-only FIT Score Bar */}
                            <div className="sm:hidden px-5 py-2.5 bg-surface-secondary/40 border-b border-border-light flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                                    <HeartPulse className="w-3.5 h-3.5 text-teal-500" />
                                    Índice FIT Biocéntrico:
                                </span>
                                <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide border flex items-center gap-1.5", fitDetails.badge)}>
                                    <span className={cn("w-1.5 h-1.5 rounded-full", fitDetails.dot)} />
                                    {selectedWorker.calculatedScore}% · {fitDetails.label}
                                </span>
                            </div>

                            {/* Scrollable Content Body */}
                            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                                
                                {/* 1. Hallazgos Semánticos IA */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5 text-teal-500" /> 
                                            Diagnóstico Semántico & Hallazgos IA
                                        </h4>
                                        <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-md">
                                            Análisis NLP
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {selectedWorker.bioTagsIA && selectedWorker.bioTagsIA.length > 0 && !selectedWorker.bioTagsIA.includes('Sin_Hallazgos') ? (
                                            selectedWorker.bioTagsIA.map((tag: string) => {
                                                const r = TAG_RULES[tag];
                                                const pts = r?.pts || 5;
                                                return (
                                                    <div 
                                                        key={tag} 
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-surface-secondary/70 text-text-primary border border-border-medium shadow-sm hover:border-teal-500/40 transition-colors"
                                                    >
                                                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 shadow-[0_0_6px_#f43f5e]" />
                                                        <span>{r?.label || tag}</span>
                                                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-black bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                            -{pts} pts
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold">Aptitud Plena · Sin Hallazgos Clínicos Adversos</p>
                                                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500/80 leading-tight">
                                                        El colaborador no registra diagnósticos osteomusculares, patologías restrictivas ni limitaciones físicas en su ficha.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Medical Recommendation Callout if present */}
                                    {selectedWorker.condicionesSalud && selectedWorker.condicionesSalud !== 'Ninguna' && selectedWorker.condicionesSalud !== 'Apto' && (
                                        <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">
                                            <Stethoscope className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                            <div className="min-w-0 flex-1 text-xs">
                                                <p className="font-bold text-amber-800 dark:text-amber-300">Nota Médica Registrada en Examen:</p>
                                                <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{selectedWorker.condicionesSalud}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 2. Biometría & Signos Vitales (The 4 Redesigned Cards) */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
                                            <Activity className="w-3.5 h-3.5 text-teal-500" />
                                            Signos Vitales & Biometría Ocupacional
                                        </h4>
                                        <span className="text-[9px] font-bold text-text-tertiary">
                                            Estándar OIT / GTC-45
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {/* Card 1: Presión Arterial */}
                                        <div className="p-4 rounded-2xl bg-surface-secondary/40 dark:bg-slate-800/40 border border-border-light hover:border-teal-500/30 transition-all group">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black text-text-secondary uppercase tracking-wider">
                                                    Presión Arterial
                                                </span>
                                                <div className="w-7 h-7 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform">
                                                    <Activity className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-lg font-black text-text-primary tracking-tight">
                                                    {selectedWorker.presionArterial || 'No registrada'}
                                                </span>
                                                {selectedWorker.presionArterial && selectedWorker.presionArterial !== 'No registrada' && (
                                                    <span className="text-[10px] font-bold text-text-tertiary">mmHg</span>
                                                )}
                                            </div>
                                            <div className="mt-2.5">
                                                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border", presionStatus.color)}>
                                                    <span className="w-1 h-1 rounded-full bg-current" />
                                                    {presionStatus.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Card 2: Frecuencia Cardíaca */}
                                        <div className="p-4 rounded-2xl bg-surface-secondary/40 dark:bg-slate-800/40 border border-border-light hover:border-rose-500/30 transition-all group">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black text-text-secondary uppercase tracking-wider">
                                                    Frecuencia Cardíaca
                                                </span>
                                                <div className="w-7 h-7 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform">
                                                    <Heart className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-lg font-black text-text-primary tracking-tight">
                                                    {selectedWorker.frecuenciaCardiaca ? `${selectedWorker.frecuenciaCardiaca}` : 'No registrada'}
                                                </span>
                                                {selectedWorker.frecuenciaCardiaca && (
                                                    <span className="text-[10px] font-bold text-text-tertiary">lpm</span>
                                                )}
                                            </div>
                                            <div className="mt-2.5">
                                                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border", frecuenciaStatus.color)}>
                                                    <span className="w-1 h-1 rounded-full bg-current" />
                                                    {frecuenciaStatus.label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Card 3: Índice de Masa Corporal */}
                                        <div className="p-4 rounded-2xl bg-surface-secondary/40 dark:bg-slate-800/40 border border-border-light hover:border-indigo-500/30 transition-all group">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black text-text-secondary uppercase tracking-wider">
                                                    Índice Masa Corporal
                                                </span>
                                                <div className="w-7 h-7 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                                                    <Scale className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-lg font-black text-text-primary tracking-tight">
                                                    {selectedWorker.imc || 'No registrado'}
                                                </span>
                                                {selectedWorker.imc && selectedWorker.imc !== 'No registrado' && (
                                                    <span className="text-[10px] font-bold text-text-tertiary">kg/m²</span>
                                                )}
                                            </div>
                                            <div className="mt-2.5 flex items-center justify-between gap-1 flex-wrap">
                                                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border", imcStatus.color)}>
                                                    <span className="w-1 h-1 rounded-full bg-current" />
                                                    {imcStatus.label}
                                                </span>
                                                {selectedWorker.peso && selectedWorker.talla && (
                                                    <span className="text-[9px] font-semibold text-text-tertiary">
                                                        {selectedWorker.peso}kg · {selectedWorker.talla}m
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card 4: Hábitos de Fumar */}
                                        <div className="p-4 rounded-2xl bg-surface-secondary/40 dark:bg-slate-800/40 border border-border-light hover:border-emerald-500/30 transition-all group">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black text-text-secondary uppercase tracking-wider">
                                                    Hábito Tabáquico
                                                </span>
                                                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                                                    <Cigarette className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-lg font-black text-text-primary tracking-tight">
                                                    {selectedWorker.fuma || 'No'}
                                                </span>
                                            </div>
                                            <div className="mt-2.5">
                                                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border", fumaStatus.color)}>
                                                    <span className="w-1 h-1 rounded-full bg-current" />
                                                    {fumaStatus.label}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. Auditoría de Aptitud Biocéntrica 360° */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-widest flex items-center gap-1.5">
                                            <ClipboardList className="w-3.5 h-3.5 text-teal-500" />
                                            Auditoría de Aptitud Biocéntrica 360°
                                        </h4>
                                        <span className="text-[9px] font-bold text-text-tertiary">
                                            Desglose de Factores
                                        </span>
                                    </div>

                                    <div className="space-y-2.5">
                                        {selectedWorker.auditItems && selectedWorker.auditItems.length > 0 ? (
                                            selectedWorker.auditItems.map((item: any, i: number) => {
                                                const s = SEV_STYLES[item.severity] || SEV_STYLES.info;
                                                return (
                                                    <div 
                                                        key={i} 
                                                        className={cn(
                                                            "flex items-start gap-3.5 p-3.5 rounded-2xl border bg-surface-secondary/30 transition-all hover:bg-surface-secondary/50",
                                                            s.border
                                                        )}
                                                    >
                                                        <div className={cn("text-xs font-black font-mono px-2 py-1 rounded-lg bg-surface-primary border shadow-sm shrink-0 text-center", s.pts)}>
                                                            -{Math.abs(item.pts)}
                                                        </div>
                                                        <div className="shrink-0 mt-0.5">{s.icon}</div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-text-primary">{item.title}</p>
                                                            <p className="text-[10px] text-text-secondary leading-relaxed mt-0.5 font-medium">{item.description}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-2xl flex items-center gap-3">
                                                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p>100% de Aptitud Biocéntrica</p>
                                                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500/80 font-normal mt-0.5">
                                                        Todos los índices de salud, biometría y compatibilidad postural se encuentran en estado óptimo.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 4. Badges Adicionales (Comités / Alergias / Biomecánica) */}
                                {(selectedWorker.esCopasst === 'Sí' || selectedWorker.esBrigadista === 'Sí' || (selectedWorker.alergiasQuimicas && selectedWorker.alergiasQuimicas !== 'Ninguna') || (selectedWorker.limitacionesBiomecanicas && selectedWorker.limitacionesBiomecanicas !== 'Ninguna')) && (
                                    <div className="pt-3 border-t border-border-light flex flex-wrap gap-2 items-center">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-text-tertiary mr-1">Condiciones Especiales:</span>
                                        {selectedWorker.esCopasst === 'Sí' && (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                                Miembro COPASST
                                            </span>
                                        )}
                                        {selectedWorker.esBrigadista === 'Sí' && (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                Brigadista de Emergencias
                                            </span>
                                        )}
                                        {selectedWorker.alergiasQuimicas && selectedWorker.alergiasQuimicas !== 'Ninguna' && (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                Alergias: {selectedWorker.alergiasQuimicas}
                                            </span>
                                        )}
                                        {selectedWorker.limitacionesBiomecanicas && selectedWorker.limitacionesBiomecanicas !== 'Ninguna' && (
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                                                Limitación: {selectedWorker.limitacionesBiomecanicas}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 sm:p-5 border-t border-border-light flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-primary/60 dark:bg-slate-900/60 shrink-0">
                                <div className="flex items-center gap-2 text-[10px] font-semibold text-text-tertiary">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" />
                                    <span>Telemetría Biocéntrica Hito 01 · Sincronizada en BD</span>
                                </div>
                                <button 
                                    onClick={() => setSelectedWorker(null)}
                                    className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-teal-600/20 border border-teal-400/20 active:scale-95 transition-all"
                                >
                                    Entendido · Cerrar Ficha
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                );
            })()}
        </div>
    );
};

export default DashboardPredictivo;
