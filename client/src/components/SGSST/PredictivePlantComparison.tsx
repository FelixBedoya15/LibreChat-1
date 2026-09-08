import React from 'react';
import { Building2, TrendingDown, TrendingUp, Minus, ShieldAlert, CheckCircle } from 'lucide-react';
import { cn } from '~/utils';

export interface SiteItem {
    siteName: string;
    historicalCount: number;
    expectedCount: number;
    percentage: number;
    variationPct: number;
    growthNet: number;
    trend: 'up' | 'down' | 'stable';
}

interface PredictivePlantComparisonProps {
    siteDistribution?: SiteItem[];
}

export const PredictivePlantComparison: React.FC<PredictivePlantComparisonProps> = ({
    siteDistribution = []
}) => {
    const sites: SiteItem[] = siteDistribution.length > 0 ? siteDistribution : [
        { siteName: 'Planta Principal / Operaciones', historicalCount: 13, expectedCount: 11, percentage: 58, variationPct: -15, growthNet: -2, trend: 'down' },
        { siteName: 'Sede Logística / Almacén', historicalCount: 4, expectedCount: 5, percentage: 25, variationPct: +25, growthNet: +1, trend: 'up' },
        { siteName: 'Sede Administrativa / Comercial', historicalCount: 3, expectedCount: 3, percentage: 17, variationPct: 0, growthNet: 0, trend: 'stable' }
    ];

    const totalHistorical = sites.reduce((sum, s) => sum + s.historicalCount, 0);
    const totalExpected = sites.reduce((sum, s) => sum + s.expectedCount, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-black text-text-primary flex items-center gap-2 tracking-[0.1em] uppercase">
                        <Building2 className="w-4 h-4 text-teal-500" />
                        FOCALIZACIÓN TERRITORIAL: COMPARATIVA DE SEDES Y PLANTAS
                    </h3>
                    <p className="text-[11px] text-text-secondary font-semibold mt-0.5">
                        Principio de Pareto aplicado: priorización del presupuesto y recursos preventivos en las instalaciones críticas.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-text-secondary">
                        Variación Neta Consolidada:
                    </span>
                    <span className={cn(
                        "px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1",
                        totalExpected < totalHistorical ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                    )}>
                        {totalExpected < totalHistorical ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                        {totalExpected - totalHistorical} casos ({totalHistorical > 0 ? Math.round(((totalExpected - totalHistorical) / totalHistorical) * 100) : 0}%)
                    </span>
                </div>
            </div>

            {/* Visual Bars & Table */}
            <div className="p-5 sm:p-6 rounded-3xl border border-border-medium/60 glass-premium shadow-xl space-y-6">
                
                {/* Horizontal Progress Bars */}
                <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary block">
                        Concentración del Riesgo por Centro de Trabajo
                    </span>
                    {sites.map((site, index) => {
                        const isHighest = index === 0;
                        return (
                            <div key={site.siteName} className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-text-primary flex items-center gap-2">
                                        <span className={cn(
                                            "w-2 h-2 rounded-full",
                                            isHighest ? "bg-teal-500 shadow-[0_0_6px_#14b8a6]" : "bg-slate-400"
                                        )} />
                                        {site.siteName}
                                    </span>
                                    <div className="flex items-center gap-3 font-semibold text-[11px]">
                                        <span className="text-text-secondary">{site.expectedCount} accidentes esperados</span>
                                        <span className="font-black text-text-primary bg-surface-secondary px-2 py-0.5 rounded-lg border border-border-light">
                                            {site.percentage}%
                                        </span>
                                    </div>
                                </div>
                                <div className="w-full h-3.5 bg-gray-100 dark:bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-border-light shadow-inner">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{
                                            width: `${site.percentage}%`,
                                            background: isHighest ? 'linear-gradient(90deg, #0d9488, #14b8a6)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Comparative Table */}
                <div className="overflow-x-auto min-w-0">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-border-medium text-[10px] font-black uppercase tracking-wider text-text-secondary">
                                <th className="py-2.5 px-3">Centro de Trabajo</th>
                                <th className="py-2.5 px-3 text-center">Últimos 12M</th>
                                <th className="py-2.5 px-3 text-center">Próximos 12M</th>
                                <th className="py-2.5 px-3 text-center">Crecimiento Neto</th>
                                <th className="py-2.5 px-3 text-center">Variación %</th>
                                <th className="py-2.5 px-3 text-center">Estado Preventivo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light/70 font-medium">
                            {sites.map((site) => (
                                <tr key={site.siteName} className="hover:bg-surface-hover transition-colors">
                                    <td className="py-3 px-3 font-bold text-text-primary flex items-center gap-2">
                                        <Building2 className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                                        {site.siteName}
                                    </td>
                                    <td className="py-3 px-3 text-center text-text-secondary">
                                        {site.historicalCount}
                                    </td>
                                    <td className="py-3 px-3 text-center font-bold text-text-primary">
                                        {site.expectedCount}
                                    </td>
                                    <td className="py-3 px-3 text-center font-bold">
                                        <span className={cn(
                                            site.growthNet < 0 ? "text-emerald-600 dark:text-emerald-400" : site.growthNet > 0 ? "text-red-500" : "text-text-secondary"
                                        )}>
                                            {site.growthNet > 0 ? `+${site.growthNet}` : site.growthNet}
                                        </span>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black",
                                            site.variationPct < 0
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                                : site.variationPct > 0
                                                    ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                                                    : "bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20"
                                        )}>
                                            {site.variationPct < 0 ? <TrendingDown className="w-3 h-3" /> : site.variationPct > 0 ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                            {site.variationPct > 0 ? `+${site.variationPct}%` : `${site.variationPct}%`}
                                        </span>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                        {site.variationPct <= 0 ? (
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> En Descenso
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                                                <ShieldAlert className="w-3 h-3" /> Prioridad Auditoría
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PredictivePlantComparison;
