import React, { useState, useMemo } from 'react';
import { ShieldAlert, Crosshair, Users, Activity, Sparkles, Filter, ChevronRight, HeartPulse } from 'lucide-react';
import { cn } from '~/utils';

export interface LesionItem {
    id: string;
    name: string;
    count: number;
    percentage: number;
    color: string;
    severity?: string;
}

export interface AnatomyItem {
    id: string;
    name: string;
    count: number;
    percentage: number;
    color: string;
    tagsLinked?: string[];
    rolesRisk?: string[];
}

interface PredictiveAnatomyTreemapProps {
    lesionDistribution?: LesionItem[];
    anatomyDistribution?: AnatomyItem[];
    onFilterByWorkerRisk?: (tagOrRole: string, label: string) => void;
    activeFilter?: string | null;
}

export const PredictiveAnatomyTreemap: React.FC<PredictiveAnatomyTreemapProps> = ({
    lesionDistribution = [],
    anatomyDistribution = [],
    onFilterByWorkerRisk,
    activeFilter = null
}) => {
    const [activeTab, setActiveTab] = useState<'anatomy' | 'lesion'>('anatomy');
    const [hoveredItem, setHoveredItem] = useState<any | null>(null);

    // Default anatomy data if empty
    const anatomyData: AnatomyItem[] = useMemo(() => {
        if (anatomyDistribution && anatomyDistribution.length > 0) return anatomyDistribution;
        return [
            { id: 'manos', name: 'Manos y Muñecas', count: 6, percentage: 28.6, color: '#0d9488', tagsLinked: ['Tunel_Carpiano', 'Epicondilitis'], rolesRisk: ['Operario', 'Mantenimiento', 'Producción'] },
            { id: 'multiples', name: 'Ubicaciones Múltiples', count: 4, percentage: 19.1, color: '#ec4899', tagsLinked: ['Vertigo', 'Epilepsia', 'Medicamento_SNC'], rolesRisk: ['Alturas', 'Conductor'] },
            { id: 'espalda', name: 'Columna / Tronco', count: 3, percentage: 14.3, color: '#8b5cf6', tagsLinked: ['Lumbalgia', 'Hernia_Discal', 'No_Carga_Peso'], rolesRisk: ['Bodega', 'Cargue y Descargue'] },
            { id: 'cabeza', name: 'Cabeza y Ojos', count: 2, percentage: 9.5, color: '#f59e0b', tagsLinked: ['Vision_Reducida'], rolesRisk: ['Metalmecánica', 'Construcción'] },
            { id: 'torax', name: 'Tórax y Abdomen', count: 2, percentage: 9.5, color: '#ef4444', tagsLinked: ['Cardiopatia', 'HTA'], rolesRisk: ['Producción', 'Operaciones'] },
            { id: 'pies', name: 'Miembros Inferiores / Pies', count: 2, percentage: 9.5, color: '#3b82f6', tagsLinked: ['Restriccion_Rodilla', 'No_Bipedestacion'], rolesRisk: ['Planta', 'Logística'] }
        ];
    }, [anatomyDistribution]);

    // Default lesion data if empty
    const lesionData: LesionItem[] = useMemo(() => {
        if (lesionDistribution && lesionDistribution.length > 0) return lesionDistribution;
        return [
            { id: 'golpe', name: 'Golpe o Contusión', count: 9, percentage: 45, color: '#0d9488', severity: 'Alta Probabilidad' },
            { id: 'herida', name: 'Herida Cortante', count: 4, percentage: 20, color: '#f97316', severity: 'Severidad Media' },
            { id: 'torcedura', name: 'Torcedura / Esguince', count: 3, percentage: 15, color: '#8b5cf6', severity: 'Osteomuscular' },
            { id: 'luxacion', name: 'Luxación o Fractura', count: 2, percentage: 10, color: '#ef4444', severity: 'Crítico' },
            { id: 'conmocion', name: 'Trauma / Conmoción', count: 1, percentage: 5, color: '#ec4899', severity: 'Emergencia' },
            { id: 'otros', name: 'Otras Lesiones', count: 1, percentage: 5, color: '#64748b', severity: 'Leve' }
        ];
    }, [lesionDistribution]);

    const activeList = activeTab === 'anatomy' ? anatomyData : lesionData;
    const totalCount = activeList.reduce((sum, item) => sum + item.count, 0) || 1;
    const currentActiveItem = hoveredItem || activeList[0];

    // SVG Donut Calculations
    const radius = 60;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    return (
        <div className="space-y-6">
            {/* Header & View Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-sm font-black text-text-primary flex items-center gap-2 tracking-[0.1em] uppercase">
                        <Activity className="w-4 h-4 text-teal-500" />
                        DIAGNÓSTICO PREDICTIVO ANATÓMICO Y DE LESIONES
                    </h3>
                    <p className="text-[11px] text-text-secondary font-semibold mt-0.5">
                        Mapeo cuantitativo y probabilístico de los focos corporales y mecánicos de mayor siniestralidad.
                    </p>
                </div>

                {/* Sub-tab pills */}
                <div className="inline-flex items-center p-1 bg-surface-secondary border border-border-medium/70 rounded-2xl shrink-0">
                    <button
                        onClick={() => { setActiveTab('anatomy'); setHoveredItem(null); }}
                        className={cn(
                            "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                            activeTab === 'anatomy'
                                ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                                : "text-text-secondary hover:text-text-primary"
                        )}
                    >
                        <Crosshair className="w-3.5 h-3.5" />
                        Parte Afectada
                    </button>
                    <button
                        onClick={() => { setActiveTab('lesion'); setHoveredItem(null); }}
                        className={cn(
                            "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300",
                            activeTab === 'lesion'
                                ? "bg-pink-600 text-white shadow-md shadow-pink-600/20"
                                : "text-text-secondary hover:text-text-primary"
                        )}
                    >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Tipo de Lesión
                    </button>
                </div>
            </div>

            {/* Main Visual Grid: Treemap (Left 65%) + Interactive Donut (Right 35%) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ═══ Left: Modern Treemap Grid (8 Cols) ═══ */}
                <div className="lg:col-span-7 xl:col-span-8 p-5 rounded-3xl border border-border-medium/60 glass-premium shadow-xl flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary">
                            Distribución de Casos Esperados (Treemap de Volumen)
                        </span>
                        <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                            {totalCount} eventos anuales estimados
                        </span>
                    </div>

                    {/* Treemap Modular Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                        {activeList.map((item, idx) => {
                            const isHovered = currentActiveItem?.id === item.id;
                            const isPrimary = idx === 0;

                            return (
                                <div
                                    key={item.id}
                                    onMouseEnter={() => setHoveredItem(item)}
                                    className={cn(
                                        "p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer relative overflow-hidden group min-h-[115px]",
                                        isHovered
                                            ? "border-teal-400 shadow-lg scale-[1.02] bg-surface-primary"
                                            : "border-border-light bg-surface-primary/70 hover:border-border-medium hover:bg-surface-primary"
                                    )}
                                    style={{
                                        borderLeftWidth: isPrimary ? '5px' : '3px',
                                        borderLeftColor: item.color
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-bold text-xs text-text-primary group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors leading-tight">
                                            {item.name}
                                        </h4>
                                        <span
                                            className="px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 shadow-xs"
                                            style={{ backgroundColor: `${item.color}18`, color: item.color }}
                                        >
                                            {item.percentage}%
                                        </span>
                                    </div>

                                    <div className="mt-3 flex items-end justify-between border-t border-border-light/70 pt-2">
                                        <div>
                                            <span className="text-xl font-black text-text-primary tracking-tight">
                                                {item.count}
                                            </span>
                                            <span className="text-[10px] text-text-secondary font-bold ml-1">casos</span>
                                        </div>

                                        {/* Action: Link to Bio individual workforce */}
                                        {activeTab === 'anatomy' && (item as AnatomyItem).rolesRisk && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onFilterByWorkerRisk && (item as AnatomyItem).rolesRisk?.[0]) {
                                                        onFilterByWorkerRisk((item as AnatomyItem).rolesRisk![0], item.name);
                                                    }
                                                }}
                                                className="text-[9px] font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform"
                                            >
                                                Ver expuestos <ChevronRight className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Hint */}
                    <div className="mt-4 pt-3 border-t border-border-light/70 flex items-center justify-between text-[10px] text-text-secondary font-semibold">
                        <span className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-teal-500" />
                            Haz clic en una categoría para cruzar con los cargos de la Huella Biocéntrica (Hito 1).
                        </span>
                        <span className="font-bold text-teal-600 dark:text-teal-400">Interacción Biocéntrica WAPPY</span>
                    </div>
                </div>

                {/* ═══ Right: Interactive Donut SVG (4 Cols) ═══ */}
                <div className="lg:col-span-5 xl:col-span-4 p-5 rounded-3xl border border-border-medium/60 glass-premium shadow-xl flex flex-col items-center justify-between">
                    <div className="w-full flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary">
                            Probabilidad Relativa (%)
                        </span>
                        <span className="text-[9px] font-black text-pink-600 dark:text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full">
                            {activeTab === 'anatomy' ? 'Anatomía' : 'Mecánica'}
                        </span>
                    </div>

                    {/* Donut Chart with Center Display */}
                    <div className="relative flex items-center justify-center my-3">
                        <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 160 160">
                            {/* Track */}
                            <circle
                                cx="80"
                                cy="80"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth={strokeWidth}
                                fill="transparent"
                                className="text-gray-100 dark:text-slate-800/80"
                            />

                            {/* Donut Slices */}
                            {activeList.map((item) => {
                                const sliceLength = (item.percentage / 100) * circumference;
                                const strokeDashoffset = -accumulatedAngle;
                                accumulatedAngle += sliceLength;
                                const isHovered = currentActiveItem?.id === item.id;

                                return (
                                    <circle
                                        key={item.id}
                                        cx="80"
                                        cy="80"
                                        r={radius}
                                        stroke={item.color}
                                        strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                                        strokeDasharray={`${sliceLength} ${circumference}`}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap="round"
                                        fill="transparent"
                                        className="transition-all duration-300 cursor-pointer hover:opacity-90"
                                        onMouseEnter={() => setHoveredItem(item)}
                                    />
                                );
                            })}
                        </svg>

                        {/* Center Display Card */}
                        <div className="absolute flex flex-col items-center justify-center text-center px-2 pointer-events-none">
                            <span className="text-2xl font-black text-text-primary tracking-tight">
                                {currentActiveItem?.percentage}%
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary max-w-[90px] truncate">
                                {currentActiveItem?.name}
                            </span>
                            <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 mt-0.5">
                                {currentActiveItem?.count} eventos
                            </span>
                        </div>
                    </div>

                    {/* Active Slice Insight Card */}
                    <div className="w-full p-3.5 rounded-2xl bg-surface-primary border border-border-light shadow-inner mt-2">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: currentActiveItem?.color }} />
                            <h5 className="text-xs font-bold text-text-primary truncate">
                                {currentActiveItem?.name}
                            </h5>
                        </div>
                        <p className="text-[10px] text-text-secondary font-medium leading-relaxed">
                            Representa el <strong className="text-text-primary">{currentActiveItem?.percentage}%</strong> de la siniestralidad potencial con un volumen proyectado de <strong className="text-text-primary">{currentActiveItem?.count} siniestros</strong>.
                        </p>

                        {activeTab === 'anatomy' && (currentActiveItem as AnatomyItem)?.rolesRisk && (
                            <div className="mt-2 pt-2 border-t border-border-light flex items-center justify-between">
                                <span className="text-[9px] font-bold text-text-secondary">Cargos diana:</span>
                                <span className="text-[9px] font-black text-teal-600 dark:text-teal-400 truncate max-w-[140px]">
                                    {(currentActiveItem as AnatomyItem).rolesRisk?.join(', ')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PredictiveAnatomyTreemap;
