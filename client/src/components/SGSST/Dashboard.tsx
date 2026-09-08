import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { 
    FileText, 
    ClipboardCheck, 
    BarChart2, 
    ShieldAlert, 
    Building2, 
    AlertTriangle, 
    ChevronRight,
    BrainCircuit,
    Activity,
    Box,
    UserCircle,
    ArrowLeft,
    Target,
    GitMerge,
    Stethoscope,
    Scale,
    GraduationCap,
    Hammer,
    Lock
} from 'lucide-react';
import { cn } from '~/utils';
import { OpenSidebar } from '~/components/Chat/Menus';
import { useToastContext } from '@librechat/client';
import type { ContextType } from '~/common';

import { PHASE_CATEGORIES } from './constants';
import PhaseDetail from './PhaseDetail';
import CompanyInfoModal from './CompanyInfoModal';
import DashboardPredictivo from './DashboardPredictivo';

const REQUIRED_FIELDS = [
    'companyName', 'nit', 'legalRepresentative', 'workerCount',
    'arl', 'economicActivity', 'riskLevel', 'ciiu',
    'address', 'city', 'phone', 'email',
    'sector', 'responsibleSST', 'generalActivities',
] as const;

// ─── 6 Hitos Unificados de Somos SST ──────────────────────────────────────────
const getUnifiedHitos = (): Array<{
    id: string;
    title: string;
    subtitle: string;
    description: string;
    extendedPhilosophy: string;
    accent: string;
    bgGlow: string;
    borderHover: string;
    icon: React.ReactNode;
    label?: string;
}> => [
    {
        id: 'hito1',
        title: 'Gobernanza y Cimiento Legal',
        subtitle: 'El Marco Institucional (PHVA)',
        description: 'Diagnóstico 0312, Responsable SG-SST, Políticas, Objetivos, Matriz Legal, Reglamentos y Emergencias.',
        extendedPhilosophy: 'El cimiento estructural y normativo que sostiene la vida colectiva en la empresa. Define la ética de protección y las normas claras que garantizan la coexistencia segura y el cumplimiento de los estándares legales de prevención.',
        accent: 'text-[#0d9488]',
        bgGlow: 'bg-[#0d9488]/5',
        borderHover: 'hover:border-[#0d9488]',
        icon: <Scale className="w-8 h-8 text-[#0d9488] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 01'
    },
    {
        id: 'hito2',
        title: 'Huella Biocéntrica',
        subtitle: 'Línea Base del Ser Humano',
        description: 'Perfiles de Cargo, Perfil Sociodemográfico, Condiciones de Salud y Dictamen de Compatibilidad.',
        extendedPhilosophy: 'El viaje preventivo comienza reconociendo que cada individuo posee variaciones biológicas, psicológicas y sociales únicas. No podemos prevenir daños si no conocemos el estado de salud y las capacidades del ser humano.',
        accent: 'text-[#10b981]',
        bgGlow: 'bg-[#10b981]/5',
        borderHover: 'hover:border-[#10b981]',
        icon: <UserCircle className="w-8 h-8 text-[#10b981] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 02'
    },
    {
        id: 'hito3',
        title: 'Evaluación Dinámica de Riesgos',
        subtitle: 'Peligros y Percepción',
        description: 'Matriz Bio-IPEVAR, Termómetro Psicosocial en Tiempo Real y Participación IPEVAR Comunitaria.',
        extendedPhilosophy: 'Hub centralizado de consciencia del riesgo. Evalúa la interacción viva entre los peligros del puesto, la percepción directa del colaborador y su salud mental cotidiana.',
        accent: 'text-[#059669]',
        bgGlow: 'bg-[#059669]/5',
        borderHover: 'hover:border-[#059669]',
        icon: <ShieldAlert className="w-8 h-8 text-[#059669] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 03'
    },
    {
        id: 'hito4',
        title: 'Dinámica Operativa y Terreno',
        subtitle: 'Controles y Tareas Críticas',
        description: 'Permisos de Alturas, ATS, Ergonomía OWAS, EPP, Seguridad Vial (PESV), Equipos de Alturas y Químicos SGA.',
        extendedPhilosophy: 'El riesgo se materializa en la jornada diaria. Este hito implementa las barreras duras de ingeniería, permisos de alto riesgo y control de activos críticos para proteger la vida en el terreno.',
        accent: 'text-[#0284c7]',
        bgGlow: 'bg-[#0284c7]/5',
        borderHover: 'hover:border-[#0284c7]',
        icon: <Activity className="w-8 h-8 text-[#0284c7] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 04'
    },
    {
        id: 'hito5',
        title: 'Cultura, Escuela e Innovación',
        subtitle: 'Capacitación y Micro-Apps',
        description: 'Reporte de Actos y Condiciones, Programa de Capacitación, Rutas de Aprendizaje LMS y App Builder.',
        extendedPhilosophy: 'Empodera la inteligencia colectiva y conductual de la organización mediante la formación continua adaptativa y herramientas no-code para digitalizar inspecciones en campo.',
        accent: 'text-[#f59e0b]',
        bgGlow: 'bg-[#f59e0b]/5',
        borderHover: 'hover:border-[#f59e0b]',
        icon: <GraduationCap className="w-8 h-8 text-[#f59e0b] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 05'
    },
    {
        id: 'hito6',
        title: 'Auditoría, Causalidad & Cierre de Ciclo',
        subtitle: 'Verificación, Forense y Dirección',
        description: 'Estadísticas ATEL, Investigación Forense 8M, Tablero Kanban ACPM, Auditoría SG-SST y Alta Dirección.',
        extendedPhilosophy: 'Cierra el ciclo sistémico de mejora continua: aprende con rigor forense de los accidentes, audita el cumplimiento de los estándares legales, rinde cuentas gerenciales y gestiona acciones correctivas para blindar la organización.',
        accent: 'text-[#6366f1]',
        bgGlow: 'bg-[#6366f1]/5',
        borderHover: 'hover:border-[#6366f1]',
        icon: <ClipboardCheck className="w-8 h-8 text-[#6366f1] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 06'
    },
    {
        id: 'hito7',
        title: 'Inteligencia Artificial & Oráculo Predictivo',
        subtitle: 'El Pináculo: Gemelo Digital y Prescripción',
        description: 'Modelos predictivos de siniestralidad, Radar de los 9 Dominios Bioindividuales, simulador estocástico y prescripción con IA.',
        extendedPhilosophy: 'El pináculo y destino final de Somos SST. Aquí convergen todos los datos biocéntricos, operativos y forenses para alimentar el oráculo de IA: anticipa siniestros antes de que ocurran, simula escenarios futuros y prescribe controles autónomos para salvar vidas.',
        accent: 'text-[#ec4899]',
        bgGlow: 'bg-[#ec4899]/5',
        borderHover: 'hover:border-[#ec4899]',
        icon: <BrainCircuit className="w-8 h-8 text-[#ec4899] relative z-10 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />,
        label: 'HITO 07'
    }
];

const OrganicBlob = () => (
    <svg className="absolute top-0 right-0 w-64 h-64 opacity-20 transform translate-x-12 -translate-y-8 transition-transform duration-[1200ms] group-hover:scale-[1.35] group-hover:-rotate-[15deg] pointer-events-none" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <path fill="#ffffff" d="M47.7,-67.2C61.4,-57.1,71.5,-41.8,78.2,-24.5C84.9,-7.2,88.2,12.1,81.3,28.8C74.4,45.5,57.3,59.6,39.6,68.4C21.9,77.2,3.6,80.7,-14.2,78.7C-32,76.7,-49.3,69.2,-64.1,56.5C-78.9,43.8,-91.2,25.9,-93.8,6.8C-96.4,-12.3,-89.3,-32.6,-76.3,-48.1C-63.3,-63.6,-44.4,-74.3,-26.8,-76.6C-9.2,-78.9,7.1,-72.8,22.8,-71.8C38.5,-70.8,34,-77.3,47.7,-67.2Z" transform="translate(100 100)" />
    </svg>
);

export default function SGSSTDashboard() {
    const { user, token } = useAuthContext();
    const { navVisible, setNavVisible } = useOutletContext<ContextType>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { showToast } = useToastContext();
    
    // State
    const [disabledApps, setDisabledApps] = useState<string[]>([]);
    const isAdmin = user?.role === 'ADMIN';
    const [selectedHito, setSelectedHito] = useState<any>(null);
    const [showCompanyInfo, setShowCompanyInfo] = useState(false);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const hasCheckedRef = React.useRef(false);
    const unifiedHitos = getUnifiedHitos();

    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/config', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                if (data && Array.isArray(data.disabledApps)) {
                    setDisabledApps(data.disabledApps);
                }
            }).catch(console.error);
    }, [token]);

    const handleToggleApp = async (categoryId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isAdmin) return;

        const currentlyDisabled = disabledApps.includes(categoryId);
        const newDisabledStatus = !currentlyDisabled;

        setDisabledApps(prev => 
            newDisabledStatus 
                ? [...prev, categoryId] 
                : prev.filter(id => id !== categoryId)
        );

        try {
            const res = await fetch('/api/sgsst/config/toggle', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ appId: categoryId, disabled: newDisabledStatus })
            });
            if (!res.ok) throw new Error('Request error');
        } catch(err) {
            console.error(err);
            setDisabledApps(prev => 
                !newDisabledStatus 
                    ? [...prev, categoryId] 
                    : prev.filter(id => id !== categoryId)
            );
        }
    };

    // ─── Fetch Company Info ────────────────────────────────────────────────
    useEffect(() => {
        if (!token || hasCheckedRef.current) return;
        hasCheckedRef.current = true;

        fetch(`/api/sgsst/company-info?cb=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
        .then(res => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.json(); })
        .then(info => {
            setCompanyInfo(info);
            if (info && info.logoBase64) {
                localStorage.setItem('wappy_sst_global_logo', info.logoBase64);
            } else {
                localStorage.removeItem('wappy_sst_global_logo');
            }
            if (!info || Object.keys(info).length === 0) {
                setMissingFields([...REQUIRED_FIELDS]);
                setShowCompanyInfo(true);
                return;
            }
            const missing = REQUIRED_FIELDS.filter(f => {
                const val = info[f];
                if (typeof val === 'string') {
                    const t = val.trim();
                    return t === '' || t === 'N/A' || t === 'No registrado';
                }
                return val === undefined || val === null || val === 0;
            });

            setMissingFields(missing);
            if (missing.length > 0) setShowCompanyInfo(true);
        })
        .catch(err => {
            console.error('[SGSST Dashboard] Error checking company info:', err.message);
            hasCheckedRef.current = false;
        });
    }, [token]);

    const handleModalClose = useCallback(() => {
        setShowCompanyInfo(false);
        hasCheckedRef.current = false;
    }, []);

    // ─── handle navigate-sgsst event (from notification panel / tenshi) ───
    useEffect(() => {
        const SGSST_MODULE_PHASE_MAP: Record<string, string> = {
            // Hito 1: Gobernanza y Legal
            diagnostico: 'hito1',
            responsable: 'hito1',
            politica: 'hito1',
            objetivos: 'hito1',
            legal: 'hito1',
            rhs: 'hito1',
            rit: 'hito1',
            vulnerabilidad: 'hito1',

            // Hito 2: Huella Biocéntrica
            perfil_socio: 'hito2',
            perfil_sociodemografico: 'hito2',
            condiciones_salud: 'hito2',
            perfil_cargo: 'hito2',
            oraculo_predictivo: 'hito2',

            // Hito 3: Evaluación Dinámica de Riesgos
            peligros: 'hito3',
            animo: 'hito3',
            participacion_ipevar: 'hito3',

            // Hito 4: Dinámica Operativa y Terreno
            permiso_alturas: 'hito4',
            analisis_trabajo_seguro: 'hito4',
            metodo_owas: 'hito4',
            epp_delivery: 'hito4',
            vehicles_pesv: 'hito4',
            heights_lifecycle: 'hito4',
            chemical_registry: 'hito4',

            // Hito 5: Cultura, Escuela e Innovación
            reporte_actos: 'hito5',
            capacitaciones: 'hito5',
            ruta_aprendizaje: 'hito5',
            app_builder: 'hito5',
            custom_html_sandbox: 'hito5',

            // Hito 6: Auditoría, Causalidad & Cierre de Ciclo
            estadisticas: 'hito6',
            investigacion_atel: 'hito6',
            control_acpm: 'hito6',
            acpm: 'hito6',
            auditoria: 'hito6',
            alta_direccion: 'hito6',
            investigacion_profunda: 'hito6',

            // Hito 7: Inteligencia Artificial & Oráculo Predictivo
            predictivo: 'hito7',
        };
        const handler = (e: Event) => {
            const { module } = (e as CustomEvent).detail || {};
            if (!module) return;
            const targetHito = SGSST_MODULE_PHASE_MAP[module] || 'hito1';
            setSearchParams({ hito: targetHito, module });
        };
        window.addEventListener('navigate-sgsst', handler);
        return () => window.removeEventListener('navigate-sgsst', handler);
    }, [setSearchParams]);

    // ─── URL Sync ──────────────────────────────────────────────────────────
    useEffect(() => {
        const rawHito = searchParams.get('hito') || searchParams.get('sub');
        let targetId = rawHito;

        // Mapeo retrocompatible
        if (rawHito === 'fase1') targetId = 'hito1';
        if (rawHito === 'fase2') targetId = 'hito6';

        if (targetId) {
            const found = unifiedHitos.find(h => h.id === targetId);
            setSelectedHito(found || null);
        } else {
            setSelectedHito(null);
        }
    }, [searchParams]);

    const handlePhaseSelect = (phase: any) => {
        if (missingFields.length > 0) {
            setShowCompanyInfo(true);
            return;
        }

        if (disabledApps.includes(phase.id) && !isAdmin) {
            showToast({ message: 'Este hito se encuentra actualmente en desarrollo y construcción.', status: 'warning' });
            return;
        }
        
        setSearchParams({ hito: phase.id });
    };

    if (selectedHito) {
        const moduleParam = searchParams.get('module') || undefined;
        return (
            <PhaseDetail
                phase={selectedHito}
                onBack={() => setSearchParams({})}
                navVisible={navVisible}
                setNavVisible={setNavVisible}
                autoOpenModule={moduleParam}
            />
        );
    }

    return (
        <div className="flex h-full w-full flex-col overflow-y-auto bg-surface-primary pb-20 scroll-smooth">
            
            {/* ═══ Header Section ═══ */}
            <header className="px-6 lg:px-12 py-8 bg-surface-primary flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                {/* Left: Title & Sidebar toggle */}
                <div className="flex items-center gap-4">
                    {!navVisible && (
                        <button 
                            onClick={() => setNavVisible(true)}
                            className="hidden md:flex shrink-0 p-2 rounded-xl border border-border-medium hover:bg-surface-secondary transition-colors text-text-secondary hover:text-text-primary"
                        >
                            <OpenSidebar setNavVisible={setNavVisible} />
                        </button>
                    )}
                    <div className="flex items-center gap-4">
                        <div className="bg-[#10b981]/10 p-3.5 rounded-2xl dark:bg-[#10b981]/20">
                            <Activity className="h-8 w-8 text-[#10b981]" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-text-primary tracking-tight">SOMOS SST</h1>
                            <p className="text-text-secondary mt-1 text-sm font-medium">Suite Integral de Seguridad y Salud en el Trabajo &bull; 6 Hitos Estratégicos</p>
                        </div>
                    </div>
                </div>

                {/* Right: Integrated Company Info Widget */}
                <button
                    onClick={() => setShowCompanyInfo(true)}
                    className="group flex items-center gap-3 bg-surface-secondary border border-border-medium px-4 py-3 rounded-2xl hover:bg-surface-hover hover:border-[#10b981]/40 hover:shadow-sm transition-all text-left w-full sm:w-auto"
                >
                    <div className="p-2.5 bg-[#10b981]/10 rounded-xl group-hover:bg-[#10b981]/20 group-hover:scale-105 transition-all">
                        <Building2 className="h-5 w-5 text-[#10b981]" />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] uppercase font-bold text-text-secondary mb-0.5 tracking-wider">Entidad Activa</p>
                        <p className="text-sm font-bold text-text-primary truncate max-w-[160px]">
                            {companyInfo?.companyName || 'Configurar Organización'}
                        </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-text-secondary group-hover:text-[#10b981] group-hover:translate-x-1 transition-all" />
                </button>
            </header>

            {/* ═══ Main Content Container ═══ */}
            <main className="max-w-[1400px] mx-auto w-full px-6 lg:px-8 pt-8 space-y-12">
                
                {/* Missing Info Warning */}
                {missingFields.length > 0 && (
                    <div
                        onClick={() => setShowCompanyInfo(true)}
                        className="animate-in fade-in slide-in-from-top-4 flex cursor-pointer items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 transition-all hover:bg-amber-500/20 hover:shadow-md"
                    >
                        <AlertTriangle className="h-6 w-6 flex-shrink-0 text-amber-500 animate-pulse" />
                        <div className="text-sm">
                            <span className="font-bold text-amber-600 dark:text-amber-500 tracking-wide uppercase text-xs block mb-0.5">Atención Requerida</span>
                            <span className="text-text-secondary font-medium">
                                Su organización tiene <strong className="text-text-primary">{missingFields.length} campos</strong> pendientes por diligenciar. Finalice la configuración para habilitar simulaciones precisas.
                            </span>
                        </div>
                    </div>
                )}

                {/* ═══ Roadmap (Timeline) Section ═══ */}
                <section className="animate-in fade-in slide-in-from-bottom-8 duration-[800ms] fill-mode-both">
                    <div className="flex items-center justify-center flex-col text-center gap-3 mb-16 pt-4 px-4">
                        <div className="p-3 rounded-2xl bg-[#10b981]/10 dark:bg-[#10b981]/20 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <Box className="h-6 w-6 text-[#10b981] animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-3xl md:text-4xl font-black text-text-primary tracking-tighter drop-shadow-sm">
                                Ruta Integral de Prevención y Liderazgo
                            </h2>
                            <p className="text-sm md:text-base text-text-secondary font-medium mt-2 max-w-2xl mx-auto">
                                Recorra los 7 hitos estratégicos: desde la gobernanza legal y la huella del bio-individuo, hasta los controles de terreno, la auditoría y la analítica predictiva de inteligencia artificial.
                            </p>
                        </div>
                    </div>

                    <div className="relative flex flex-col gap-16 lg:gap-24 w-full py-6 mx-auto max-w-5xl">
                        {/* Línea Central Conectora */}
                        <div className="absolute top-0 bottom-0 left-[34px] lg:left-1/2 w-1 -translate-x-1/2 bg-gradient-to-b from-[#0d9488] via-[#0284c7] via-[#f59e0b] via-[#6366f1] to-[#ec4899] opacity-35 dark:opacity-45 rounded-full" />
                        
                        {unifiedHitos.map((phase, i) => {
                            const isEven = i % 2 === 1;
                            const isHitoDisabled = disabledApps.includes(phase.id);
                            return (
                                <div 
                                    key={phase.id} 
                                    className={cn(
                                        "relative flex flex-col lg:flex-row items-center w-full gap-4", 
                                        isEven ? "lg:flex-row-reverse" : ""
                                    )}
                                    style={{ animationDelay: `${i * 150}ms` }}
                                >
                                    {/* Nodo Central (Icono con latido) */}
                                    <div className="absolute left-[34px] lg:left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-surface-primary border-4 border-surface-secondary shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                                        <div className="relative flex items-center justify-center w-full h-full rounded-full bg-surface-secondary overflow-hidden">
                                            <span className="absolute inline-flex h-full w-full rounded-full opacity-30 animate-ping duration-1000 bg-current" style={{ color: phase.accent.replace('text-', '') }}></span>
                                            <div className="scale-75 md:scale-[0.85] origin-center">{phase.icon}</div>
                                        </div>
                                    </div>

                                    {/* Contenedor de Tarjeta (Espaciado adaptativo) */}
                                    <div className={cn("w-full pl-[86px] lg:pl-0 lg:w-1/2 flex", isEven ? "lg:pr-14 lg:justify-end" : "lg:pl-14 lg:justify-start")}>
                                        <div
                                            onClick={() => handlePhaseSelect(phase)}
                                            className={cn(
                                                "group relative flex flex-col w-full max-w-lg rounded-[2rem] border bg-white/70 dark:bg-black/40 backdrop-blur-3xl shadow-xl transition-all duration-500 overflow-hidden",
                                                isHitoDisabled && !isAdmin 
                                                    ? "cursor-not-allowed opacity-80 border-dashed border-amber-500/40" 
                                                    : "cursor-pointer border-border-light dark:border-white/10 hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_20px_40px_rgba(16,185,129,0.15)] hover:-translate-y-2",
                                                phase.borderHover
                                            )}
                                        >
                                                    {/* Glow de Fondo Intenso */}
                                                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 ${phase.bgGlow} pointer-events-none`} />

                                                    {/* Blob Orgánico de Adorno */}
                                                    <div className="absolute top-0 right-0 w-40 h-40 opacity-10 pointer-events-none group-hover:scale-[1.4] transition-transform duration-[1.2s] ease-out">
                                                        <svg className={cn("w-full h-full transform translate-x-10 -translate-y-10", phase.accent)} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                                            <path fill="currentColor" d="M47.7,-67.2C61.4,-57.1,71.5,-41.8,78.2,-24.5C84.9,-7.2,88.2,12.1,81.3,28.8C74.4,45.5,57.3,59.6,39.6,68.4C21.9,77.2,3.6,80.7,-14.2,78.7C-32,76.7,-49.3,69.2,-64.1,56.5C-78.9,43.8,-91.2,25.9,-93.8,6.8C-96.4,-12.3,-89.3,-32.6,-76.3,-48.1C-63.3,-63.6,-44.4,-74.3,-26.8,-76.6C-9.2,-78.9,7.1,-72.8,22.8,-71.8C38.5,-70.8,34,-77.3,47.7,-67.2Z" transform="translate(100 100)" />
                                                        </svg>
                                                    </div>

                                                    <div className="relative p-6 sm:p-8 flex flex-col flex-1 z-10 w-full">
                                                        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <div className="inline-block bg-surface-secondary dark:bg-black/60 rounded-full px-4 py-1.5 border border-border-medium text-text-secondary text-[11px] font-black tracking-[0.25em] uppercase shadow-sm">
                                                                    {phase.label || `HITO 0${i + 1}`}
                                                                </div>
                                                                {isHitoDisabled && (
                                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                                                        <Hammer className="w-3.5 h-3.5" /> En construcción
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isAdmin && (
                                                                <div 
                                                                    className="flex items-center bg-surface-secondary/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-border-light dark:border-white/10 hover:bg-surface-tertiary transition-all shadow-sm z-20 cursor-pointer"
                                                                    onClick={(e) => handleToggleApp(phase.id, e)}
                                                                    title={isHitoDisabled ? "Hito en Construcción: Clic para activar" : "Hito Activo: Clic para marcar en construcción"}
                                                                >
                                                                    <div className="relative inline-flex items-center cursor-pointer my-1 mx-1">
                                                                        <div className={`w-9 h-5 rounded-full transition-colors ${!isHitoDisabled ? 'bg-teal-500' : 'bg-surface-tertiary border border-border-medium'}`}></div>
                                                                        <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow-md transition-transform ${!isHitoDisabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                                    </div>
                                                                    <span className={`ml-2 text-[10px] font-black uppercase tracking-wider ${!isHitoDisabled ? 'text-teal-600 dark:text-teal-400' : 'text-amber-500'}`}>
                                                                        {!isHitoDisabled ? 'ACTIVO' : 'EN CONSTR.'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                
                                                <div className="text-left flex flex-col flex-1">
                                                    <h2 className={cn("text-2xl sm:text-3xl font-black tracking-tight leading-none mb-3 text-text-primary transition-colors", `group-hover:${phase.accent}`)}>
                                                        {phase.title}
                                                    </h2>
                                                    <p className="text-text-secondary font-bold text-xs uppercase tracking-wider mb-4 opacity-80">
                                                        {phase.subtitle}
                                                    </p>
                                                    <p className="text-sm font-medium text-text-secondary leading-relaxed md:leading-loose opacity-90 mt-auto pt-2 border-t border-border-light pt-4 dark:border-white/10">
                                                        {phase.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Bloque espaciador para empujar la tarjeta hacia un lado (Desktop Only) */}
                                    <div className="hidden lg:block lg:w-1/2" />
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>

            <CompanyInfoModal isOpen={showCompanyInfo} onClose={handleModalClose} />
        </div>
    );
}
