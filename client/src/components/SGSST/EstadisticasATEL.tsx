import React, {  useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    Save,
    History,
    BarChart,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    Calculator,
    Loader2,
    Calendar,
    CalendarDays,
    Database,
    Download,
    Building2,
} from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import SGSSTToolbar from './SGSSTToolbar';
import EventLogger, { ATELContext } from './EventLogger';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import CollapsibleReportBox from './CollapsibleReportBox';
import { FileText } from 'lucide-react';

interface MonthData {
    numTrabajadores: number | '';
    diasProgramados: number | '';
    events: ATELContext[];
    // Cached totals (optional, can be calculated on fly)
}

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const EstadisticasATEL = () => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Annual State: 0-11 index
    const [year, setYear] = useState(new Date().getFullYear());
    const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
    const [annualData, setAnnualData] = useState<Record<number, MonthData>>(() => {
        const initial: Record<number, MonthData> = {};
        MONTHS.forEach((_, i) => {
            initial[i] = { numTrabajadores: '', diasProgramados: '', events: [] };
        });
        return initial;
    });

    const [selectedModel, setSelectedModel] = useState(() => user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');
    
    useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user]);

    // UI State
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSavingData, setIsSavingData] = useState(false); // New persistence state
    const [isLoadingData, setIsLoadingData] = useState(false); // New persistence state
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);
    const [isFormExpanded, setIsFormExpanded] = useState(true);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState('new');
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Dynamic list of selectable years
    const currentCalYear = new Date().getFullYear();
    const [availableYears, setAvailableYears] = useState<number[]>([
        currentCalYear - 2,
        currentCalYear - 1,
        currentCalYear,
        currentCalYear + 1
    ]);
    const [activeCompanyInfo, setActiveCompanyInfo] = useState<{ name: string; nit?: string } | null>(null);

    // Fetch active company details
    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/company-info', { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                if (data?.companyName) {
                    setActiveCompanyInfo({ name: data.companyName, nit: data.nit });
                }
            })
            .catch(() => {});
    }, [token]);

    // Fetch list of years with registered data
    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/atel-data/years/list', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data?.years?.length) {
                    setAvailableYears(prev => {
                        const set = new Set([...prev, ...data.years]);
                        return Array.from(set).sort((a, b) => b - a);
                    });
                }
            })
            .catch(() => {});
    }, [token, refreshTrigger]);

    // Load Data Effect (Reset to clean slate per year to prevent cross-year leakage)
    useEffect(() => {
        const loadData = async () => {
            if (!token) return;
            setIsLoadingData(true);
            try {
                const res = await fetch(`/api/sgsst/atel-data/${year}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                // Initialize clean annual structure
                const freshAnnual: Record<number, MonthData> = {};
                MONTHS.forEach((_, i) => {
                    freshAnnual[i] = { numTrabajadores: '', diasProgramados: '', events: [] };
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.months) {
                        Object.keys(data.months).forEach(key => {
                            const m = data.months[key];
                            if (m) {
                                freshAnnual[Number(key)] = {
                                    numTrabajadores: m.numTrabajadores ?? '',
                                    diasProgramados: m.diasProgramados ?? '',
                                    events: Array.isArray(m.events) ? m.events : []
                                };
                            }
                        });
                    }
                }
                setAnnualData(freshAnnual);
            } catch (error) {
                console.error('Error loading annual data:', error);
                showToast({ message: 'Error al cargar datos guardados', status: 'error' });
            } finally {
                setIsLoadingData(false);
            }
        };
        loadData();
    }, [year, token]);

    // Calculate total recorded events for active year
    const totalYearEvents = useMemo(() => {
        return Object.values(annualData).reduce((sum, m) => sum + (m.events?.length || 0), 0);
    }, [annualData]);

    // Helpers to update current month data
    const updateMonthData = (field: keyof MonthData, value: any) => {
        setAnnualData(prev => ({
            ...prev,
            [currentMonthIndex]: { ...prev[currentMonthIndex], [field]: value }
        }));
    };

    const handleDummyData = () => {
        const dummy = generateDummyData.estadisticasATEL();
        setAnnualData(prev => ({
            ...prev,
            [currentMonthIndex]: {
                ...prev[currentMonthIndex],
                numTrabajadores: dummy.numTrabajadores,
                diasProgramados: dummy.diasProgramados,
                events: dummy.events
            }
        }));
        showToast({ message: 'Datos estadísticos de prueba generados exitosamente.', status: 'success', severity: 'success' });
    };

    // Calculate totals for current month based on events
    const currentData = annualData[currentMonthIndex];
    const stats = useMemo(() => {
        const events = currentData.events || [];
        return {
            numAT: events.filter(e => e.tipo === 'AT').length,
            diasIncapacidadAT: events.filter(e => e.tipo === 'AT').reduce((sum, e) => sum + (e.diasIncapacidad || 0), 0),
            diasCargados: events.filter(e => e.tipo === 'AT').reduce((sum, e) => sum + (e.diasCargados || 0), 0),
            casosNuevosEL: events.filter(e => e.tipo === 'EL').length,
            casosAntiguosEL: 0,
            diasAusencia: events.filter(e => e.tipo === 'Ausentismo').reduce((sum, e) => sum + (e.diasIncapacidad || 0), 0),
        };
    }, [currentData.events]); // Use specific dependency to avoid loop

    // Save Logic (Persistence)
    const handleSaveData = async () => {
        if (!token) return;
        setIsSavingData(true);
        try {
            const res = await fetch('/api/sgsst/atel-data/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    year,
                    annualData
                }),
            });

            if (res.ok) {
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            } else {
                throw new Error('Error en respuesta del servidor');
            }
        } catch (error) {
            console.error('Error saving annual data:', error);
            showToast({ message: 'Error al guardar los datos', status: 'error' });
        } finally {
            setIsSavingData(false);
        }
    };

    const handleGenerate = useCallback(async (scope: 'MONTH' | 'ANNUAL') => {
        const currentMonthData = annualData[currentMonthIndex];

        // Basic validation
        if (scope === 'MONTH' && !currentMonthData.numTrabajadores) {
            showToast({ message: 'Ingrese el N° de trabajadores para este mes', status: 'warning' });
            return;
        }

        // Auto-save data before generating to ensure consistency
        handleSaveData();

        setIsGenerating(true);
        try {
            // Prepare payload
            const payload = {
                scope,
                year,
                targetMonthIndex: currentMonthIndex,
                monthName: MONTHS[currentMonthIndex],
                annualData, // Send all months
                modelName: selectedModel,
                userName: user?.name,
            };

            const response = await fetch('/api/sgsst/estadisticas/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar el informe');
            }

            const data = await response.json();
            setGeneratedReport(data.report);
            editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId(null);
            setReportMessageId(null);
            setIsFormExpanded(false);

            // Reset context for new save
            setConversationId('new');
            setReportMessageId(null);

            showToast({ message: `Informe ${scope === 'ANNUAL' ? 'Anual' : 'Mensual'} generado exitosamente`, status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Statistics generation error:', error);
            showToast({ message: error.message || 'Error al generar el informe', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [annualData, currentMonthIndex, year, selectedModel, token, user, showToast]);

    const handleSaveReport = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedReport;
        if (!contentToSave) {
            showToast({ message: t('com_ui_no_report_save', 'No hay informe para guardar'), status: 'warning' });
            return;
        }
        if (!token) {
            showToast({ message: t('com_ui_error_unauthorized', 'Error: No autorizado'), status: 'error' });
            return;
        }

        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-estadisticas-atel`, { headers: { Authorization: `Bearer ${token}` } });
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
            const method = isNew ? 'POST' : 'PUT';

            const body = {
                content: contentToSave,
                ...(isNew ? {
                    title: `Estadísticas ATEL (Informe) - ${MONTHS[currentMonthIndex]} ${year}`,
                    tags: ['sgsst-estadisticas-atel']
                } : {
                    conversationId,
                    messageId: reportMessageId
                })
            };

            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = await res.json();
                if (isNew) {
                    setConversationId(data.conversationId);
                    setReportMessageId(data.messageId);
                }
                // Synchronize state
                setGeneratedReport(contentToSave);
                editorContentRef.current = contentToSave;
            liveEditorRef.current?.setHTML(contentToSave);

                setRefreshTrigger(prev => prev + 1);
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            } else {
                const err = await res.json();
                showToast({ message: `Error al guardar: ${err.error || res.status}`, status: 'error' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        }
    }, [editorContentRef.current, generatedReport, conversationId, reportMessageId, token, showToast, t, currentMonthIndex, year]);

    const handleSelectReport = async (reportOrId: any) => {
        let content = '';
        let convId = '';
        let msgId = '';

        if (typeof reportOrId === 'string') {
            convId = reportOrId;
            try {
                // Fetch messages for this conversation
                const res = await fetch(`/api/messages/${convId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const messages = await res.json();

                    // Logic to find the correct message with content
                    // Usually the last assistant message is the report
                    // Or filter by sender 'SGSST Diagnóstico'
                    const reportMsg = messages.reverse().find((m: any) =>
                        m.sender === 'SGSST Diagnóstico' ||
                        (m.isCreatedByUser === false && m.text && m.text.includes('<html')) ||
                        (m.isCreatedByUser === false && m.text && m.text.length > 100)
                    );

                    if (reportMsg) {
                        content = reportMsg.text;
                        msgId = reportMsg.messageId;
                    } else {
                        // Fallback: try taking the very last message text
                        const last = messages[0]; // reversed
                        if (last) {
                            content = last.text;
                            msgId = last.messageId;
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching report content:', error);
                showToast({ message: 'Error al obtener el contenido del informe', status: 'error' });
                return;
            }
        } else if (reportOrId && reportOrId.content) {
            content = reportOrId.content;
            convId = reportOrId.conversationId;
            msgId = reportOrId.messageId;
        }

        if (content) {
            setGeneratedReport(content);
            editorContentRef.current = content;
            liveEditorRef.current?.setHTML(content);
            setConversationId(convId);
            setReportMessageId(msgId);
            setIsHistoryOpen(false);
            showToast({ message: t('com_ui_report_loaded', 'Informe cargado'), status: 'info' });
        } else {
            showToast({ message: 'No se encontró contenido válido en el informe', status: 'warning' });
        }
    };


    useAutoLoadReport({
        token,
        tags: ['sgsst-estadisticas-atel'],
        generatedReport: generatedReport,
        handleSelectReport
    });

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Toolbar */}
            <div className="flex flex-col items-start justify-center gap-4 p-4 rounded-xl bg-surface-secondary border border-border-medium shadow-sm">
                <div className="flex flex-wrap items-center gap-3 w-full">
                    <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                        <BarChart className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">Gestión de Indicadores ATEL</h2>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border-medium bg-surface-primary shadow-xs">
                                <button
                                    type="button"
                                    onClick={() => setYear(y => y - 1)}
                                    title="Año anterior"
                                    className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-black font-mono text-teal-600 dark:text-teal-400 px-1">
                                    {year}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setYear(y => y + 1)}
                                    title="Año siguiente"
                                    className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                                >
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <span className="text-xs text-text-secondary">| Res. 0312 Art. 30</span>
                            {activeCompanyInfo?.name && (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 dark:bg-teal-500/20 px-2.5 py-0.5 rounded-full border border-teal-500/20 shadow-xs">
                                    <Building2 className="w-3 h-3 text-teal-500" />
                                    <span>Empresa: <strong>{activeCompanyInfo.name}</strong>{activeCompanyInfo.nit ? ` · NIT: ${activeCompanyInfo.nit}` : ''}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

            <SGSSTToolbar
                onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                isHistoryOpen={isHistoryOpen}
                aiButtons={[
                    {
                        id: 'generate-annual',
                        onClick: () => handleGenerate('ANNUAL'),
                        disabled: isGenerating,
                        title: `Generar Informe Anual ${year}`,
                        label: "Generar Informe Anual",
                        icon: "sparkles",
                        variant: "ai",
                        isLoading: isGenerating
                    }
                ]}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSaveLocal={handleSaveData}
                isSavingLocal={isSavingData}
                hasContent={!!(editorContentRef.current || generatedReport)}
                exportContent={editorContentRef.current || generatedReport || ''}
                exportFileName={`Estadisticas_ATEL_${MONTHS[currentMonthIndex]}`}
                onDummy={handleDummyData}
            />
            </div>

            {/* History Panel */}
            {isHistoryOpen && (
                <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                    <ReportHistory
                        onSelectReport={handleSelectReport}
                        isOpen={isHistoryOpen}
                        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)}
                        refreshTrigger={refreshTrigger}
                        tags={['sgsst-estadisticas-atel']}
                    />
                </div>
            )}

            {/* MAIN DASHBOARD */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button
                    onClick={() => setIsFormExpanded(!isFormExpanded)}
                    className="w-full flex items-center justify-between p-4 bg-surface-tertiary/50 hover:bg-surface-tertiary transition-colors"
                >
                    <div className="flex flex-wrap items-center gap-2 w-full">
                        {isFormExpanded ? <ChevronDown className="h-5 w-5 text-text-secondary" /> : <ChevronRight className="h-5 w-5 text-text-secondary" />}
                        <CalendarDays className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        <span className="font-semibold text-text-primary">
                            Registro Mensual de Eventos ({year})
                        </span>
                        {isLoadingData && <span className="text-xs text-text-secondary animate-pulse ml-2">(Cargando datos...)</span>}
                    </div>
                </button>

                {isFormExpanded && (
                    <div className="flex flex-col md:flex-row min-h-[500px] overflow-hidden">
                        {/* Month Selector Sidebar (Desktop) or Scroll (Mobile) */}
                        <div className="w-full md:w-52 bg-surface-tertiary/20 border-b md:border-b-0 md:border-r border-border-medium flex md:flex-col overflow-x-auto md:overflow-visible">
                            {/* Year Selector Control in Sidebar */}
                            <div className="p-3 bg-surface-primary/80 border-b border-border-medium flex flex-col gap-2 shrink-0">
                                <span className="text-[10px] font-black uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-teal-500" />
                                    Año de Registro
                                </span>
                                <div className="flex items-center justify-between gap-1 bg-surface-secondary rounded-xl p-1 border border-border-medium">
                                    <button
                                        type="button"
                                        onClick={() => setYear(y => y - 1)}
                                        title="Año anterior"
                                        className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors shrink-0"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <select
                                        value={year}
                                        onChange={(e) => setYear(Number(e.target.value))}
                                        className="bg-transparent text-xs font-black text-text-primary focus:outline-none cursor-pointer text-center flex-1 py-1"
                                    >
                                        {availableYears.map(y => (
                                            <option key={y} value={y} className="bg-surface-primary text-text-primary">
                                                Año {y}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setYear(y => y + 1)}
                                        title="Año siguiente"
                                        className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors shrink-0"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-text-secondary px-0.5">
                                    <span>Eventos {year}:</span>
                                    <span className={`font-black px-1.5 py-0.2 rounded-md ${totalYearEvents > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>
                                        {totalYearEvents} {totalYearEvents === 1 ? 'evento' : 'eventos'}
                                    </span>
                                </div>
                            </div>

                            {MONTHS.map((month, index) => {
                                const mData = annualData[index];
                                const hasData = mData && (mData.events?.length > 0 || (mData.numTrabajadores !== '' && mData.numTrabajadores > 0));
                                return (
                                    <button
                                        key={month}
                                        onClick={() => setCurrentMonthIndex(index)}
                                        className={`flex-shrink-0 flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors border-l-4 ${currentMonthIndex === index
                                            ? 'bg-surface-primary border-teal-500 text-teal-600 dark:text-teal-400 shadow-sm'
                                            : 'border-transparent text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                                            }`}
                                    >
                                        <span>{month}</span>
                                        {hasData && <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 p-4 md:p-6 space-y-6 bg-surface-primary/10 overflow-auto">
                            {/* 1. Basic Stats Inputs */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary">N° Trabajadores (Promedio) <span className="text-red-500">*</span></label>
                                    <input
                                        type="number"
                                        value={currentData?.numTrabajadores || ''}
                                        onChange={(e) => updateMonthData('numTrabajadores', Number(e.target.value))}
                                        placeholder="Ej: 50"
                                        className="w-full rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-teal-500 transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary">N° Días Programados (Trabajo)</label>
                                    <input
                                        type="number"
                                        value={currentData?.diasProgramados || ''}
                                        onChange={(e) => updateMonthData('diasProgramados', Number(e.target.value))}
                                        placeholder="Ej: 24"
                                        className="w-full rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-teal-500 transition-colors"
                                    />
                                </div>
                            </div>

                            {/* 2. Event Logger */}
                            <EventLogger
                                events={currentData?.events || []}
                                onChange={(events) => updateMonthData('events', events)}
                                monthName={MONTHS[currentMonthIndex]}
                            />

                            {/* 3. Auto-calculated Summary Badge */}
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 flex flex-wrap gap-2 text-xs text-text-secondary p-3 bg-surface-tertiary rounded-xl border border-border-medium">
                                    <span className="font-semibold text-text-primary">Resumen Mes:</span>
                                    <span>AT: <strong className="text-teal-600">{stats.numAT}</strong></span> •
                                    <span>EL: <strong className="text-green-600">{stats.casosNuevosEL}</strong></span> •
                                    <span>Incap: <strong className="text-amber-600">{stats.diasIncapacidadAT + stats.diasAusencia}</strong> días</span>
                                </div>
                                <div className="flex-1 bg-teal-50 dark:bg-teal-900/20 p-3 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-sm transition-all duration-300">
                                    <h4 className="text-xs text-teal-800 dark:text-teal-300 mb-1 font-bold flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 animate-pulse text-teal-500" />
                                        Generación Inteligente
                                    </h4>
                                    <p className="text-[10px] sm:text-xs text-text-secondary leading-relaxed">
                                        La IA redactará el informe cruzando su accidentabilidad y hallazgos. Se tomará por defecto la <strong>Resolución 1401 de 2007</strong>, el <strong>Decreto 1072 de 2015</strong> y la <strong>Resolución 0312 de 2019</strong> si no especifica otra.
                                    </p>
                                </div>
                            </div>

                            {/* 4. Action Buttons */}
                            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border-medium/50">
                                <button
                                    onClick={() => handleGenerate('MONTH')}
                                    disabled={isGenerating || !currentData.numTrabajadores}
                                    className="group flex items-center px-3 py-2 bg-surface-primary border border-border-medium hover:bg-surface-hover text-text-primary rounded-full transition-all duration-300 shadow-sm font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Calendar className="h-5 w-5" />
                                    )}
                                    <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">
                                        Informe Mensual ({MONTHS[currentMonthIndex]})
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleGenerate('ANNUAL')}
                                    disabled={isGenerating || !currentData.numTrabajadores}
                                    className="group flex items-center px-3 py-2 bg-teal-600 hover:bg-teal-700 border border-teal-600 hover:border-teal-700 text-white rounded-full transition-all duration-300 shadow-sm hover:shadow-md font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <AnimatedIcon name="sparkles" size={20} />
                                    )}
                                    <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">
                                        Informe Anual Acumulado {year}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Generated Report - LiveEditor */}
            <div className="mt-4">
                    <CollapsibleReportBox onSave={handleSaveReport}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                        title={`Estadísticas ATEL — ${MONTHS[currentMonthIndex]}`}
                        icon={<BarChart className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
                        actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_EstadisticasATEL"
                            reportType="general"
                        />
                    }
                    >
                        <div className="w-full min-w-0">
                            <LiveEditor
                                ref={liveEditorRef}
                                paperMode={true}
                                initialContent={generatedReport}
                                onUpdate={(html) => { editorContentRef.current = html; }}
                                reportSourceData={annualData}
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
        </div>
    );
};

export default EstadisticasATEL;
