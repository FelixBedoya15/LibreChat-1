import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    Save,
    Download,
    Loader2,
    History,
    Scale,
    ChevronDown,
    ChevronRight,
    Search,
    BookOpen,
    CheckCircle2,
    XCircle,
    MinusCircle,
    FileText,
    Database
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector, { AI_MODELS } from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import SGSSTToolbar from './SGSSTToolbar';
import { MATRIZ_LEGAL_ITEMS, MatrizLegalItem } from './matrizLegalData';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import SingleSelect from './SingleSelect';
import CollapsibleReportBox from './CollapsibleReportBox';

interface ComplianceStatus {
    itemId: string;
    status: 'cumple' | 'no_cumple' | 'no_aplica' | 'pendiente';
}

const STATUS_OPTIONS = [
    { value: 'cumple' as const, label: 'Cumple', icon: CheckCircle2, color: 'text-green-500 bg-green-500/10' },
    { value: 'no_cumple' as const, label: 'No Cumple', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
    { value: 'no_aplica' as const, label: 'No Aplica', icon: MinusCircle, color: 'text-gray-400 bg-gray-400/10' },
];

const MatrizLegal = () => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Form state
    const [activity, setActivity] = useState('');
    const [location, setLocation] = useState('');
    const [entityType, setEntityType] = useState('private');

    // Fetch company info to auto-fill
    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/company-info', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    setActivity(prev => prev || data.economicActivity || '');
                    setLocation(prev => prev || data.city || '');
                }
            })
            .catch(err => console.error('Error fetching company info', err));
    }, [token]);

    // Checklist State
    const [statuses, setStatuses] = useState<ComplianceStatus[]>([]);
    const [seguimientos, setSeguimientos] = useState<Record<string, string>>({});
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    // Analysis state  
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [generatedMatrix, setGeneratedMatrix] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);

    const [selectedModel, setSelectedModel] = useState(() => user?.personalization?.geminiModels?.sstManagement || AI_MODELS[0].id);

    useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user]);

    // History & save state
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState('new');
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [isLoadingInitial, setIsLoadingInitial] = useState(true);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!token) {
                setIsLoadingInitial(false);
                return;
            }
            try {
                const res = await fetch('/api/sgsst/matriz/data', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.statuses && data.statuses.length > 0) setStatuses(data.statuses);
                    if (data.seguimientos) setSeguimientos(data.seguimientos);
                    if (data.activity) setActivity(data.activity);
                    if (data.location) setLocation(data.location);
                    if (data.entityType) setEntityType(data.entityType);
                }
            } catch (err) {
                console.error('Error loading initial Matriz Legal data:', err);
            } finally {
                setIsLoadingInitial(false);
            }
        };
        loadInitialData();
    }, [token]);

    // Filter out any orphaned statuses
    const validStatuses = useMemo(() => {
        const itemIds = new Set(MATRIZ_LEGAL_ITEMS.map(i => i.id));
        return statuses.filter(s => itemIds.has(s.itemId));
    }, [statuses]);

    // Calculate progress
    const totalItems = MATRIZ_LEGAL_ITEMS.length;
    const completedCount = useMemo(() => {
        return validStatuses.filter(s => s.status !== 'pendiente').length;
    }, [validStatuses]);
    const compliantCount = useMemo(() => {
        return validStatuses.filter(s => s.status === 'cumple').length;
    }, [validStatuses]);

    const compliancePercentage = useMemo(() => {
        const noAplicaCount = validStatuses.filter(s => s.status === 'no_aplica').length;
        if (totalItems === 0) return 0;
        const percentage = ((compliantCount + noAplicaCount) / totalItems) * 100;
        return Math.min(percentage, 100);
    }, [validStatuses, compliantCount, totalItems]);

    // Group items by category
    const itemsByCategory = useMemo(() => {
        return MATRIZ_LEGAL_ITEMS.reduce((acc, item) => {
            if (!acc[item.categoria]) acc[item.categoria] = [];
            acc[item.categoria].push(item);
            return acc;
        }, {} as Record<string, MatrizLegalItem[]>);
    }, []);

    const getItemStatus = useCallback((id: string) => {
        return validStatuses.find(s => s.itemId === id)?.status || 'pendiente';
    }, [validStatuses]);

    const handleStatusChange = useCallback((id: string, status: ComplianceStatus['status']) => {
        setStatuses(prev => {
            const existing = prev.findIndex(s => s.itemId === id);
            if (existing >= 0) {
                const newStatuses = [...prev];
                newStatuses[existing] = { itemId: id, status };
                return newStatuses;
            }
            return [...prev, { itemId: id, status }];
        });
    }, []);

    const handleDummyData = () => {
        const dummy = generateDummyData.matrizLegal();
        const newStatuses: ComplianceStatus[] = MATRIZ_LEGAL_ITEMS.map((item, idx) => ({
            itemId: item.id,
            status: idx % 4 === 3 ? 'no_cumple' : idx % 5 === 4 ? 'no_aplica' : 'cumple',
        }));
        const newSeguimientos: Record<string, string> = {};
        dummy.normasAnadidas.forEach(norma => {
            const match = MATRIZ_LEGAL_ITEMS.find(i => i.norma?.includes(norma.num.split(' ')[0]));
            if (match) newSeguimientos[match.id] = `${norma.num}: ${norma.info}`;
        });
        setStatuses(newStatuses);
        setSeguimientos(newSeguimientos);
        if (!activity) setActivity('Manufactura y distribución de productos químicos');
        if (!location) setLocation('Bogotá D.C.');
        showToast({ message: 'Datos de matriz legal simulados generados exitosamente.', status: 'success', severity: 'success' });
    };

    const toggleCategory = useCallback((category: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) newSet.delete(category);
            else newSet.add(category);
            return newSet;
        });
    }, []);

    const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-matriz-legal`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
        if (!activity.trim()) {
            showToast({ message: 'Ingrese la actividad económica e inicie la calificación', status: 'warning' });
            return;
        }

        setIsAnalyzing(true);
        try {
            const response = await fetch('/api/sgsst/matriz/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    activity,
                    location,
                    entityType,
                    statuses: validStatuses.map(s => {
                        const definition = MATRIZ_LEGAL_ITEMS.find(i => i.id === s.itemId) || {};
                        return { ...s, ...definition };
                    }),
                    seguimientos,
                    compliancePercentage: Math.round(compliancePercentage),
                    modelName: selectedModel,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar la matriz legal');
            }

            const data = await response.json();
            setGeneratedMatrix(data.matrix);
            editorContentRef.current = data.matrix;
            liveEditorRef.current?.setHTML(data.matrix);
            setConversationId('new');
            setReportMessageId(null);
            showToast({ message: 'Matriz Legal generada exitosamente', status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Matrix generation error:', error);
            showToast({ message: error.message || 'Error al generar la matriz', status: 'error' });
        } finally {
            setIsAnalyzing(false);
        }
    }, [activity, location, entityType, selectedModel, token, showToast, validStatuses, seguimientos, compliancePercentage]);

    const [isSavingData, setIsSavingData] = useState(false);

    const handleSaveData = useCallback(async () => {
        if (!token) {
            showToast({ message: 'Error: No autorizado', status: 'error' });
            return;
        }
        setIsSavingData(true);
        try {
            const body = {
                statuses: validStatuses,
                seguimientos,
                activity,
                location,
                entityType
            };
            const res = await fetch('/api/sgsst/matriz/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            } else {
                throw new Error('Error al guardar datos');
            }
        } catch (error: any) {
            showToast({ message: error.message, status: 'error' });
        } finally {
            setIsSavingData(false);
        }
    }, [token, showToast, validStatuses, seguimientos, activity, location, entityType]);

    const [isSaving, setIsSaving] = useState(false);

    const handleSaveReport = useCallback(async () => {
        const content = editorContentRef.current || generatedMatrix;
        if (!content || content.trim() === '') {
            showToast({ message: 'No hay documento generado para guardar en el historial', status: 'warning' });
            return;
        }

        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-matriz-legal`, { headers: { Authorization: `Bearer ${token}` } });
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
            setIsSaving(true);

            const isNew = !conversationId || conversationId === 'new';
            const body = {
                content,
                title: `Matriz Legal SST - ${new Date().toLocaleDateString('es-CO')}`,
                tags: ['sgsst-matriz-legal'],
                ...(isNew ? {} : { conversationId, messageId: reportMessageId })
            };

            const method = isNew ? 'POST' : 'PUT';
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const data = await res.json();
                if (method === 'POST') {
                    setConversationId(data.conversationId);
                    setReportMessageId(data.messageId);
                }
                // Synchronize state
                setGeneratedMatrix(content);
                editorContentRef.current = content;

                setRefreshTrigger(prev => prev + 1);
                setIsHistoryOpen(false);
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            } else {
                showToast({ message: 'Error al guardar el documento', status: 'error' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        } finally {
            setIsSaving(false);
        }
    }, [generatedMatrix, conversationId, reportMessageId, token, showToast]);

    const handleSelectReport = async (reportOrId: any) => {
        let content = '', convId = '', msgId = '';
        if (typeof reportOrId === 'string') {
            convId = reportOrId;
            try {
                const res = await fetch(`/api/messages/${convId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const messages = await res.json();
                    const reportMsg = messages.reverse().find((m: any) =>
                        m.sender === 'SGSST Diagnóstico' || (m.isCreatedByUser === false && m.text?.length > 100)
                    );
                    if (reportMsg) { content = reportMsg.text; msgId = reportMsg.messageId; }
                }
            } catch { /* ignore */ }
        } else if (reportOrId?.content) {
            content = reportOrId.content; convId = reportOrId.conversationId; msgId = reportOrId.messageId;
        }

        if (content) {
            // Support legacy embedded states just in case
            const cleanContent = content.replace(/<!-- SGSST_MATRIZ_DATA_V1:.*? -->/g, '').trim();
            setGeneratedMatrix(cleanContent || null);
            editorContentRef.current = cleanContent || '';
            liveEditorRef.current?.setHTML(cleanContent || '');
            setConversationId(convId);
            setReportMessageId(msgId);
            setIsHistoryOpen(false);
            showToast({ message: t('com_ui_report_loaded', 'Documento de historial cargado'), status: 'info' });
        }
    };

    useAutoLoadReport({
        token,
        tags: ['sgsst-matriz-legal'],
        generatedReport: generatedMatrix,
        handleSelectReport
    });

    if (isLoadingInitial) {

        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center gap-6">
                <div className="flex items-center gap-4 text-center">
                    <div className="p-3 rounded-2xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 shadow-sm">
                        <Scale className="h-8 w-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-text-primary tracking-tight">Matriz Legal SG-SST</h2>
                        <p className="text-sm text-text-secondary font-medium">Resolución 0312 de 2019 / Decreto 1072 de 2015</p>
                    </div>
                </div>

                <SGSSTToolbar
                    onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                    isHistoryOpen={isHistoryOpen}
                    onAnalyze={handleGenerate}
                    isAnalyzing={isAnalyzing}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                    onSaveLocal={handleSaveData}
                    hasContent={!!(editorContentRef.current || generatedMatrix)}
                    exportContent={editorContentRef.current || generatedMatrix || ''}
                    exportFileName="Matriz_Legal_SGSST"
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
                        tags={['sgsst-matriz-legal']}
                    />
                </div>
            )}

            {/* Main Content Layout */}
            <div className="space-y-6">

                {/* Checklist Section */}
                <div className="space-y-4">
                    {/* Progress Overview Card */}
                    <div className="p-5 rounded-2xl border border-border-medium bg-surface-secondary shadow-sm flex flex-col md:flex-row items-center gap-6">
                        <div className="relative w-20 h-20 flex-shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-200 dark:text-gray-700" />
                                <circle
                                    cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
                                    strokeDasharray={`${2 * Math.PI * 45}`}
                                    strokeDashoffset={`${2 * Math.PI * 45 * (1 - compliancePercentage / 100)}`}
                                    className="text-teal-500 transition-all duration-1000 ease-in-out"
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                                <span className="text-xl font-bold text-text-primary">{Math.round(compliancePercentage)}%</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-text-primary mb-1">Cumplimiento Legal Inicial</h3>
                            <p className="text-sm text-text-secondary">
                                Progreso de evaluación: {completedCount} de {totalItems} ítems evaluados.
                            </p>
                            <div className="mt-3 bg-teal-50 dark:bg-teal-900/20 p-4 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-sm transition-all duration-300">
                                <h4 className="text-sm text-teal-800 dark:text-teal-300 mb-2 font-bold flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 animate-pulse text-teal-500" />
                                    Generación Inteligente
                                </h4>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                    Si no ingresa la normatividad específica, se tomará por defecto el <strong>Decreto 1072 de 2015</strong> y <strong>Resolución 0312 de 2019</strong>. La IA redactará el análisis cruzando sus respuestas actuales.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleGenerate()}
                                disabled={isAnalyzing || completedCount === 0}
                                className="shrink-0 group flex items-center px-3 py-2 bg-teal-600 hover:bg-teal-700 border border-teal-600 hover:border-teal-700 text-white rounded-full transition-all duration-300 shadow-md hover:shadow-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <AnimatedIcon name="sparkles" size={20} />}
                                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">{generatedMatrix ? 'Regenerar Matriz con IA' : 'Generar Matriz con IA'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Metadata Form */}
                    <div className="p-4 rounded-2xl border border-border-medium bg-surface-secondary shadow-sm">
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Variables Organizacionales</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs font-medium text-text-secondary">Actividad Económica <span className="text-red-500">*</span></label>
                                <input type="text" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Ej: Construcción residencial..." className="w-full rounded-md border border-border-medium bg-surface-primary px-3 py-1.5 text-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-text-secondary">Ciudad / Depto</label>
                                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej: Bogotá" className="w-full rounded-md border border-border-medium bg-surface-primary px-3 py-1.5 text-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-text-secondary">Tipo de Entidad</label>
                                <SingleSelect
                                    value={entityType === 'private' ? 'Privada' : entityType === 'public' ? 'Pública' : 'Mixta'}
                                    onChange={val => setEntityType(val === 'Privada' ? 'private' : val === 'Pública' ? 'public' : 'mixed')}
                                    placeholder="Seleccione..."
                                    options={['Privada', 'Pública', 'Mixta']}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Checklist Accordion */}
                    <div className="space-y-3">
                        {Object.entries(itemsByCategory).map(([category, items]) => {
                            const isExpanded = expandedCategories.has(category);
                            const categoryItemsCount = items.length;
                            const categoryCompletedCount = items.filter(i => getItemStatus(i.id) !== 'pendiente').length;

                            return (
                                <div key={category} className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden shadow-sm">
                                    <button
                                        onClick={() => toggleCategory(category)}
                                        className="w-full flex items-center justify-between p-4 bg-surface-tertiary/30 hover:bg-surface-tertiary transition-colors"
                                    >
                                        <div className="flex flex-wrap items-center gap-3 w-full">
                                            {isExpanded ? <ChevronDown className="h-5 w-5 text-text-secondary" /> : <ChevronRight className="h-5 w-5 text-text-secondary" />}
                                            <div className="text-left">
                                                <h3 className="font-semibold text-text-primary">{category}</h3>
                                                <div className="text-xs text-text-secondary mt-0.5">
                                                    Avance: {categoryCompletedCount} / {categoryItemsCount}
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="divide-y divide-border-medium">
                                            {items.map((item) => {
                                                const status = getItemStatus(item.id);
                                                return (
                                                    <div key={item.id} className="p-4 hover:bg-surface-tertiary/10 transition-colors">
                                                        <div className="flex flex-col gap-3">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs font-bold text-teal-600 bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded uppercase">{item.norma} - {item.articulo}</span>
                                                                </div>
                                                                <p className="text-sm font-medium text-text-primary leading-snug">{item.descripcion}</p>
                                                                <p className="text-xs text-text-secondary mt-1">Evidencia: {item.evidencia}</p>
                                                            </div>

                                                            <div className="flex flex-col sm:flex-row gap-3 mt-1 items-start sm:items-center">
                                                                {/* Status Buttons */}
                                                                <div className="flex rounded-xl border border-border-medium overflow-hidden shrink-0">
                                                                    {STATUS_OPTIONS.map((opt) => {
                                                                        const isSelected = status === opt.value;
                                                                        const Icon = opt.icon;
                                                                        return (
                                                                            <button
                                                                                key={opt.value}
                                                                                onClick={() => handleStatusChange(item.id, opt.value)}
                                                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-r border-border-medium last:border-r-0 hover:bg-surface-hover ${isSelected ? opt.color : 'text-text-secondary bg-surface-primary'
                                                                                    }`}
                                                                                title={opt.label}
                                                                            >
                                                                                <Icon className="h-3.5 w-3.5" />
                                                                                <span className="hidden sm:inline">{opt.label}</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                {/* Seguimiento Input */}
                                                                <input
                                                                    type="text"
                                                                    placeholder="Notas de seguimiento o justificación..."
                                                                    value={seguimientos[item.id] || ''}
                                                                    onChange={(e) => setSeguimientos({ ...seguimientos, [item.id]: e.target.value })}
                                                                    className="w-full rounded text-xs border border-border-medium bg-surface-primary px-2 py-1.5 focus:border-teal-500 focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Report Viewer Section */}
                <div className="mt-6">
                    <CollapsibleReportBox onSave={handleSaveReport}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                        title="Matriz Legal SST"
                        icon={<FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
                        actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedMatrix || ''}
                            fileName="Informe_MatrizLegal"
                            reportType="general"
                        />
                    }
                    >
                        <div className="w-full min-w-0">
                            <LiveEditor
                                ref={liveEditorRef}
                                paperMode={true}
                                initialContent={generatedMatrix || ''}
                                onUpdate={(html) => { editorContentRef.current = html; }}
                                reportSourceData={{ statuses: validStatuses, seguimientos, activity, location, entityType, compliancePercentage }}
                            />
                        </div>
                    </CollapsibleReportBox>
                </div>
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

export default MatrizLegal;
