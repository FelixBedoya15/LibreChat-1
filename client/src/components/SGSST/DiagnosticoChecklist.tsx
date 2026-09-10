import React, {  useState, useCallback, useMemo, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
    Filter,
    CheckCircle2,
    XCircle,
    AlertCircle,
    MinusCircle,
    ChevronDown,
    ChevronRight,
    FileText,
    Download,
    Sparkles,
    History,
    Save,
    Loader2,
    HelpCircle, Plus, Trash2, ShieldCheck, Bot, Video, Film, Users, Building2, AlertTriangle
} from 'lucide-react';
import { Button, useToastContext } from '@librechat/client';
import { cn } from '~/utils';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import {
    CompanySize,
    RiskLevel,
    ComplianceStatus,
    ChecklistItem,
    getApplicableChecklist,
    getApplicableArticle,
    calculateScore,
    getTotalPoints,
    getComplianceLevel,
} from './checklistData';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import { useAuthContext } from '~/hooks';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import SGSSTToolbar from './SGSSTToolbar';
import { useAutoLoadReport } from './useAutoLoadReport';
import SingleSelect from './SingleSelect';
import CollapsibleReportBox from './CollapsibleReportBox';

// Force rebuild verification
console.log('DiagnosticoChecklist loaded');

interface DiagnosticoChecklistProps {
    onAnalysisComplete?: (report: string) => void;
}

const COMPANY_SIZE_OPTIONS = [
    { value: CompanySize.SMALL, label: '≤10 trabajadores', icon: Users },
    { value: CompanySize.MEDIUM, label: '11-50 trabajadores', icon: Users },
    { value: CompanySize.LARGE, label: '>50 trabajadores', icon: Building2 },
];

const RISK_LEVEL_OPTIONS = [
    { value: RiskLevel.I, label: 'Riesgo I', color: 'text-green-500' },
    { value: RiskLevel.II, label: 'Riesgo II', color: 'text-lime-500' },
    { value: RiskLevel.III, label: 'Riesgo III', color: 'text-yellow-500' },
    { value: RiskLevel.IV, label: 'Riesgo IV', color: 'text-orange-500' },
    { value: RiskLevel.V, label: 'Riesgo V', color: 'text-red-500' },
];

const STATUS_OPTIONS = [
    { value: 'cumple' as const, label: 'Cumple', icon: CheckCircle2, color: 'text-green-500 bg-green-500/10' },
    { value: 'no_cumple' as const, label: 'No Cumple', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
    { value: 'parcial' as const, label: 'Parcial', icon: AlertCircle, color: 'text-yellow-500 bg-yellow-500/10' },
    { value: 'no_aplica' as const, label: 'No Aplica', icon: MinusCircle, color: 'text-gray-400 bg-gray-400/10' },
];

const DiagnosticoChecklist: React.FC<DiagnosticoChecklistProps> = ({ onAnalysisComplete }) => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Filters
    const [companySize, setCompanySize] = useState<CompanySize>(CompanySize.SMALL);
    const [riskLevel, setRiskLevel] = useState<RiskLevel>(RiskLevel.I);

    // Checklist state
    const [statuses, setStatuses] = useState<ComplianceStatus[]>([]);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['planear', 'hacer', 'verificar', 'actuar']));

    const handleCompanySizeChange = (newSize: CompanySize) => {
        setCompanySize(newSize);
        // Reset state on filter change
        setStatuses([]);
        setObservations({});
        setExpandedItems(new Set());
    };

    const handleRiskLevelChange = (newLevel: RiskLevel) => {
        setRiskLevel(newLevel);
        // Reset state on filter change
        setStatuses([]);
        setObservations({});
        setExpandedItems(new Set());
    };

    // Observations state
    const [observations, setObservations] = useState<Record<string, string>>({});

    // Analysis state  
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisReport, setAnalysisReport] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);

    // History & save state
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState('new');
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return user?.personalization?.geminiModels?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.7-flash').split(',')[0].trim();
    });

    // Initialize model from user preferences when user data loads
    React.useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user?.personalization?.geminiModels?.sstManagement]);

    // Get applicable checklist
    const checklist = useMemo(() => {
        return getApplicableChecklist(companySize, riskLevel);
    }, [companySize, riskLevel]);

    const applicableArticle = useMemo(() => {
        return getApplicableArticle(companySize, riskLevel);
    }, [companySize, riskLevel]);

    // Calculate scores
    const totalPoints = useMemo(() => getTotalPoints(checklist), [checklist]);
    const currentScore = useMemo(() => calculateScore(checklist, statuses), [checklist, statuses]);
    const complianceLevel = useMemo(() => getComplianceLevel(currentScore, totalPoints), [currentScore, totalPoints]);

    // Group items by category
    const groupedItems = useMemo(() => {
        const groups: Record<string, ChecklistItem[]> = {
            planear: [],
            hacer: [],
            verificar: [],
            actuar: [],
        };
        checklist.forEach(item => {
            groups[item.category].push(item);
        });
        return groups;
    }, [checklist]);

    // Progress calculation
    const completedCount = useMemo(() => {
        return (statuses || []).filter(s => s.status !== 'pendiente').length;
    }, [statuses]);

    const handleStatusChange = useCallback((itemId: string, status: ComplianceStatus['status']) => {
        setStatuses(prev => {
            const existing = prev.find(s => s.itemId === itemId);
            if (existing) {
                return prev.map(s => s.itemId === itemId ? { ...s, status } : s);
            }
            return [...prev, { itemId, status }];
        });
    }, []);

    const handleDummyData = () => {
        const dummyItems = generateDummyData.checklist(checklist);
        const newStatuses: ComplianceStatus[] = (dummyItems || []).map((item: any) => ({
            itemId: item.id,
            status: item.estado === 'Cumple' ? 'cumple' : item.estado === 'No Cumple' ? 'no_cumple' : 'no_aplica',
        }));
        const newObservations: Record<string, string> = {};
        dummyItems.forEach((item: any) => {
            if (item.evidencia) newObservations[item.id] = item.evidencia;
        });
        
        setStatuses(newStatuses);
        setObservations(newObservations);
        showToast({ message: 'Resultados simulados generados correctamente', status: 'success', severity: 'success' });
    };

    const toggleItemExpanded = useCallback((itemId: string) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    }, []);

    const toggleCategoryExpanded = useCallback((category: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    }, []);

    const getItemStatus = useCallback((itemId: string): ComplianceStatus['status'] => {
        return statuses.find(s => s.itemId === itemId)?.status || 'pendiente';
    }, [statuses]);

    const LOCAL_STORAGE_KEY = 'sgsst_diagnostico_form';

    React.useEffect(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.statuses) setStatuses(data.statuses);
                if (data.observations) setObservations(data.observations);
            }
        } catch(e) {}
    }, []);

    const handleSaveData = () => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ statuses, observations }));
            showToast({ message: 'Calificación de diagnóstico guardada localmente', status: 'success', severity: 'success' });
        } catch(e) {
            showToast({ message: 'Error al guardar calificación', status: 'error' });
        }
    };

    const handleAnalyze = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-diagnostico`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
        if (completedCount === 0) {
            showToast({ message: t('com_ui_complete_one_item', 'Complete al menos un ítem antes de analizar'), status: 'warning' });
            return;
        }

        setIsAnalyzing(true);

        try {
            // Merge statuses into checklist items so the backend knows each item's evaluation
            const checklistWithStatuses = (checklist || []).map(item => ({
                ...item,
                status: getItemStatus(item.id),
            }));

            // Prepare data for analysis
            const analysisData = {
                checklist: checklistWithStatuses,
                score: currentScore,
                totalPoints,
                percentage: parseFloat(complianceLevel.percentage),
                riskLevel: riskLevel,
                companySize: companySize,
                observations,
                modelName: selectedModel,
                complianceLevel,
                userName: user?.name || user?.username || 'Usuario',
                currentDate: new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
            };

            // Call analysis API
            console.log('[DiagnosticoChecklist] Sending analysis data:', analysisData);

            const response = await axios.post('/api/sgsst/diagnostico/analyze', analysisData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                timeout: 200000, // 200 seconds timeout
            });

            const result = response.data;

            // Post-process report: Replace broken images with Signature Icon
            const signatureIcon = '<div class="flex flex-col items-center justify-center my-4 opacity-70"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-900"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg><span class="text-xs text-teal-900 mt-1 font-semibold tracking-wider uppercase">Firmado Digitalmente</span></div>';

            const cleanReport = result.report.replace(/<img[^>]*>/gi, signatureIcon);

            setAnalysisReport(cleanReport);
            editorContentRef.current = cleanReport;
            liveEditorRef.current?.setHTML(cleanReport);
            // Always reset for a fresh save after regeneration
            setConversationId('new');
            setReportMessageId(null);
            onAnalysisComplete?.(result.report);
            showToast({ message: t('com_ui_analysis_success', 'Análisis generado exitosamente'), status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Analysis error:', error);
            let errorMsg: string;
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                errorMsg = 'El informe tardó demasiado en generarse. Intente de nuevo.';
            } else if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else {
                errorMsg = error.message || t('com_ui_analysis_error', 'Error al generar el análisis');
            }
            showToast({ message: `Error: ${errorMsg}`, status: 'error', duration: 8000 });
        } finally {
            setIsAnalyzing(false);
        }
    }, [completedCount, companySize, riskLevel, applicableArticle, checklist, currentScore, totalPoints, complianceLevel, getItemStatus, onAnalysisComplete, showToast, user, observations, token, selectedModel, conversationId]);



    // Save report using dedicated backend endpoint
    const handleSave = useCallback(async () => {
        let contentToSave = editorContentRef.current || analysisReport;
        if (!contentToSave) {
            showToast({ message: t('com_ui_no_report_save', 'No hay informe para guardar'), status: 'warning' });
            return;
        }
        if (!token) {
            showToast({ message: t('com_ui_error_unauthorized', 'Error: No autorizado'), status: 'error' });
            return;
        }

        // Embed state data as a hidden comment
        const stateData = {
            statuses,
            observations,
            companySize,
            riskLevel
        };
        const stateString = `<!-- SGSST_DATA_V1:${JSON.stringify(stateData)} -->`;

        // Remove any existing state data before appending new
        contentToSave = contentToSave.replace(/<!-- SGSST_DATA_V1:.*? -->/g, '');
        contentToSave += stateString;

        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-diagnostico`, { headers: { Authorization: `Bearer ${token}` } });
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
            // Update existing report
            if (conversationId && conversationId !== 'new' && reportMessageId) {
                // ... (rest of update logic)
                console.log('[SGSST Save] Updating existing:', conversationId, reportMessageId);
                const res = await fetch('/api/sgsst/diagnostico/save-report', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        conversationId,
                        messageId: reportMessageId,
                        content: contentToSave,
                        title: `Diagnóstico SGSST - ${new Date().toLocaleDateString('es-CO')}`, // Refresh title date
                    }),
                });

                if (res.ok) {
                    // Synchronize state
                    setAnalysisReport(contentToSave);
                    editorContentRef.current = contentToSave;
            liveEditorRef.current?.setHTML(contentToSave);
                    setRefreshTrigger(prev => prev + 1);
                    showToast({ message: t('com_ui_diagnostic_updated', 'Diagnóstico actualizado exitosamente'), status: 'success', severity: 'success' });
                } else {
                    // ... error handling
                    const err = await res.json();
                    showToast({ message: `${t('com_ui_update_error', 'Error al actualizar')}: ${err.error || res.status}`, status: 'error' });
                }
                return;
            }

            // Create new report
            console.log('[SGSST Save] Creating new report');
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    content: contentToSave,
                    title: `Diagnóstico SGSST - ${new Date().toLocaleDateString('es-CO')}`,
                }),
            });
            // ... (rest of create logic)
            if (res.ok) {
                const data = await res.json();
                setConversationId(data.conversationId);
                setReportMessageId(data.messageId);
                // Synchronize state
                setAnalysisReport(contentToSave);
                editorContentRef.current = contentToSave;
            liveEditorRef.current?.setHTML(contentToSave);
                setRefreshTrigger(prev => prev + 1);
                showToast({ message: t('com_ui_diagnostic_saved', 'Diagnóstico guardado exitosamente'), status: 'success', severity: 'success' });
            } else {
                const err = await res.json();
                showToast({ message: `${t('com_ui_save_error', 'Error al guardar')}: ${err.error || res.status}`, status: 'error' });
            }

        } catch (e) {
            console.error('[SGSST Save] Error:', e);
            showToast({ message: t('com_ui_save_network_error', 'Error de red al guardar el diagnóstico'), status: 'error' });
        }
    }, [editorContentRef.current, analysisReport, token, conversationId, reportMessageId, showToast, statuses, observations, companySize, riskLevel]);

    // Load report from history
    const handleSelectReport = useCallback(async (selectedConvoId: string) => {
        try {
            const res = await fetch(`/api/messages/${selectedConvoId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load');
            const messages = await res.json();

            // Find the last message with content
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.text) {
                // Extract embedded state data
                const stateMatch = lastMsg.text.match(/<!-- SGSST_DATA_V1:(.*?) -->/);
                let loadedContent = lastMsg.text;

                if (stateMatch && stateMatch[1]) {
                    try {
                        const stateData = JSON.parse(stateMatch[1]);
                        if (stateData) {
                            console.log('[SGSST Load] Restoring state:', stateData);
                            if (stateData.statuses) setStatuses(stateData.statuses);
                            if (stateData.observations) setObservations(stateData.observations);
                            if (stateData.companySize) setCompanySize(stateData.companySize);
                            if (stateData.riskLevel) setRiskLevel(stateData.riskLevel);

                            // Remove the hidden data from the editor view to avoid confusion
                            // loadedContent = loadedContent.replace(/<!-- SGSST_DATA_V1:.*? -->/g, ''); 
                            // Actually, keeping it in editorContentRef.current is fine as it's hidden HTML, but cleaner to strip for display if needed.
                            // However, if we strip it, the next save might lose it if we don't re-append. 
                            // My handleSave logic re-appends based on current state, so stripping it from editor is safer.
                            loadedContent = loadedContent.replace(/<!-- SGSST_DATA_V1:.*? -->/g, '');
                        }
                    } catch (err) {
                        console.error('[SGSST Load] Error parsing state data:', err);
                    }
                }

                // Clean up content: Replace broken images with Signature Icon
                const signatureIcon = '<div class="flex flex-col items-center justify-center my-4 opacity-70"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-900"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg><span class="text-xs text-teal-900 mt-1 font-semibold tracking-wider uppercase">Firmado Digitalmente</span></div>';

                loadedContent = loadedContent.replace(/<img[^>]*>/gi, signatureIcon);

                setAnalysisReport(loadedContent);
                editorContentRef.current = loadedContent;
            liveEditorRef.current?.setHTML(loadedContent);
                setConversationId(selectedConvoId);
                setReportMessageId(lastMsg.messageId);
                setIsHistoryOpen(false);
                showToast({ message: t('com_ui_diagnostic_loaded', 'Diagnóstico cargado y restaurado'), status: 'success', severity: 'success' });
            }
        } catch (e) {
            console.error('Load error:', e);
            showToast({ message: t('com_ui_load_error', 'Error al cargar el diagnóstico'), status: 'error' });
        }
    }, [token, showToast]);

    const getCategoryTitle = (category: string): string => {
        const titles: Record<string, string> = {
            planear: 'I. PLANEAR',
            hacer: 'II. HACER',
            verificar: 'III. VERIFICAR',
            actuar: 'IV. ACTUAR',
        };
        return titles[category] || category;
    };

    const getCategoryColor = (category: string): string => {
        const colors: Record<string, string> = {
            planear: 'border-teal-500 text-teal-600',
            hacer: 'border-yellow-500 text-yellow-600',
            verificar: 'border-red-500 text-red-600',
            actuar: 'border-green-500 text-green-600',
        };
        return colors[category] || '';
    };


    useAutoLoadReport({
        token,
        tags: ['sgsst-diagnostico'],
        generatedReport: analysisReport,
        handleSelectReport
    });

    return (
        <div className="flex flex-col gap-6">
            {/* Filters Section */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm p-4">
                <div className="mb-4 flex items-center gap-2">
                    <Filter className="h-5 w-5 text-text-secondary" />
                    <h3 className="font-semibold text-text-primary">{t('com_ui_eval_filters', 'Filtros de Evaluación')}</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-secondary">
                            {t('com_ui_worker_count', 'Número de Trabajadores')}
                        </label>
                        <SingleSelect
                            value={COMPANY_SIZE_OPTIONS.find(o => o.value === companySize)?.label || ''}
                            onChange={val => { const opt = COMPANY_SIZE_OPTIONS.find(o => o.label === val); if (opt) handleCompanySizeChange(opt.value); }}
                            placeholder="Seleccione..."
                            options={COMPANY_SIZE_OPTIONS.map(o => o.label)}
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-text-secondary">
                            {t('com_ui_risk_level', 'Nivel de Riesgo')}
                        </label>
                        <SingleSelect
                            value={RISK_LEVEL_OPTIONS.find(o => o.value === riskLevel)?.label || ''}
                            onChange={val => { const opt = RISK_LEVEL_OPTIONS.find(o => o.label === val); if (opt) handleRiskLevelChange(opt.value); }}
                            placeholder="Seleccione..."
                            options={RISK_LEVEL_OPTIONS.map(o => o.label)}
                        />
                    </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-xl bg-teal-500/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-teal-500" />
                    <span className="text-teal-700 dark:text-teal-300">
                        {t('com_ui_applies_article', 'Aplica')} <strong>{t('com_ui_article', 'Artículo')} {applicableArticle}</strong> {t('com_ui_resolution_0312', 'de la Resolución 0312/2019')}
                        ({checklist.length} {t('com_ui_standards', 'estándares')})
                    </span>
                </div>
            </div>

            {/* Progress Card */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm p-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-6 w-full md:w-auto">
                        <div className="bg-surface-tertiary/50 p-2 rounded-xl sm:bg-transparent sm:p-0">
                            <p className="text-xs sm:text-sm text-text-secondary">{t('com_ui_progress', 'Progreso')}</p>
                            <p className="text-xl sm:text-2xl font-bold text-text-primary">
                                {completedCount}/{checklist.length}
                            </p>
                        </div>
                        <div className="bg-surface-tertiary/50 p-2 rounded-xl sm:bg-transparent sm:p-0">
                            <p className="text-xs sm:text-sm text-text-secondary">{t('com_ui_score', 'Puntuación')}</p>
                            <p className="text-xl sm:text-2xl font-bold text-text-primary">
                                {currentScore.toFixed(1)}/{Math.round(totalPoints)}
                            </p>
                        </div>
                        <div className="col-span-2 sm:col-span-1 bg-surface-tertiary/50 p-2 rounded-xl sm:bg-transparent sm:p-0 flex items-center justify-between sm:block">
                            <p className="text-xs sm:text-sm text-text-secondary">{t('com_ui_level', 'Nivel')}</p>
                            <span className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium',
                                complianceLevel.level === 'crítico' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                complianceLevel.level === 'moderado' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                                complianceLevel.level === 'aceptable' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                            )}>
                                {complianceLevel.level.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 px-4 hidden md:block">
                        <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-sm transition-all duration-300">
                            <h4 className="text-xs text-teal-800 dark:text-teal-300 mb-1 font-bold flex items-center gap-2">
                                <Sparkles className="h-4 w-4 animate-pulse text-teal-500" />
                                Generación Inteligente
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                La IA redactará el diagnóstico basándose en el cumplimiento de los estándares mínimos evaluados (Ciclo PHVA). Se tomará por defecto el <strong>Decreto 1072 de 2015</strong> y la <strong>Resolución 0312 de 2019</strong> si no especifica otra.
                            </p>
                        </div>
                    </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
                    <div
                        className={cn(
                            'h-full transition-all duration-300',
                            complianceLevel.level === 'crítico' && 'bg-red-500',
                            complianceLevel.level === 'moderado' && 'bg-yellow-500',
                            complianceLevel.level === 'aceptable' && 'bg-green-500',
                        )}
                        style={{ width: `${(currentScore / totalPoints) * 100}%` }}
                    />
                </div>
            <SGSSTToolbar
                onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                isHistoryOpen={isHistoryOpen}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSaveLocal={handleSaveData}
                hasContent={!!(analysisReport || editorContentRef.current)}
                exportContent={editorContentRef.current || ''}
                exportFileName="Diagnostico_SST"
                onDummy={handleDummyData}
            />


            {/* Checklist Items by Category */}
            <div className="space-y-4">
                {Object.entries(groupedItems).map(([category, items]) => {
                    if (items.length === 0) return null;

                    const isExpanded = expandedCategories.has(category);
                    const categoryCompleted = items.filter(item => {
                        const status = getItemStatus(item.id);
                        return status !== 'pendiente';
                    }).length;

                    return (
                        <div key={category} className="overflow-hidden rounded-2xl border border-border-medium bg-surface-secondary shadow-sm">
                            <button
                                onClick={() => toggleCategoryExpanded(category)}
                                className={cn(
                                    'flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface-tertiary',
                                    'border-l-4',
                                    getCategoryColor(category),
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                        <ChevronDown className="h-5 w-5 text-text-secondary" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5 text-text-secondary" />
                                    )}
                                    <span className="font-bold">{getCategoryTitle(category)}</span>
                                    <span className="text-sm text-text-secondary">
                                        ({categoryCompleted}/{items.length} {t('com_ui_evaluated', 'evaluados')})
                                    </span>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="divide-y divide-border-light">
                                    {items.map((item) => {
                                        const status = getItemStatus(item.id);
                                        const isItemExpanded = expandedItems.has(item.id);

                                        return (
                                            <div key={item.id} className="bg-surface-primary/50">
                                                <div className="p-4 flex flex-col sm:flex-row sm:items-start gap-4">
                                                    {/* Helper Icon */}
                                                    <button
                                                        onClick={() => toggleItemExpanded(item.id)}
                                                        className="hidden sm:block mt-1 flex-shrink-0 text-text-secondary hover:text-text-primary"
                                                    >
                                                        <HelpCircle className="h-4 w-4" />
                                                    </button>

                                                    <div className="min-w-0 flex-1 w-full">
                                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                            <div className="flex-1">
                                                                <div className="flex items-start gap-2">
                                                                    {/* Mobile Helper Icon */}
                                                                    <button
                                                                        onClick={() => toggleItemExpanded(item.id)}
                                                                        className="sm:hidden mt-1 flex-shrink-0 text-text-secondary hover:text-text-primary"
                                                                    >
                                                                        <HelpCircle className="h-4 w-4" />
                                                                    </button>
                                                                    <div>
                                                                        <p className="font-medium text-text-primary">
                                                                            <span className="mr-2 text-text-secondary font-mono bg-surface-tertiary px-1.5 py-0.5 rounded text-xs">{item.code}</span>
                                                                            {item.name}
                                                                        </p>
                                                                        <p className="mt-1 text-sm text-text-secondary leading-relaxed">{item.description}</p>
                                                                        <p className="mt-2 text-xs text-text-tertiary flex items-center gap-2">
                                                                            <span className="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
                                                                                {item.points} pts
                                                                            </span>
                                                                            <span className="hidden sm:inline">|</span>
                                                                            <span className="uppercase tracking-wide opacity-75">{item.subcategory}</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Action Buttons - Scrollable or Stacked */}
                                                            <div className="flex sm:flex-col lg:flex-row flex-wrap gap-1 sm:ml-4 sm:flex-shrink-0 border-t sm:border-t-0 border-border-light pt-3 sm:pt-0 justify-between sm:justify-end">
                                                                {STATUS_OPTIONS.map(opt => {
                                                                    const Icon = opt.icon;
                                                                    const isSelected = status === opt.value;

                                                                    return (
                                                                        <button
                                                                            key={opt.value}
                                                                            onClick={() => handleStatusChange(item.id, opt.value)}
                                                                            className={cn(
                                                                                'rounded-xl p-2 transition-all',
                                                                                isSelected ? opt.color : 'text-text-tertiary hover:bg-surface-tertiary',
                                                                            )}
                                                                            aria-label={opt.label}
                                                                        >
                                                                            <Icon className="h-5 w-5" />
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {isItemExpanded && (
                                                            <div className="mt-3 rounded-2xl border border-border-light bg-surface-secondary p-3">
                                                                <p className="mb-2 text-sm font-medium text-text-primary">
                                                                    {t('com_ui_how_eval', '¿Cómo se evalúa?')}
                                                                </p>
                                                                <p className="text-sm text-text-secondary">{item.evaluation}</p>
                                                            </div>
                                                        )}

                                                        {/* Observations field for parcial/no_aplica */}
                                                        {(status === 'parcial' || status === 'no_aplica') && (
                                                            <div className="mt-2">
                                                                <textarea
                                                                    placeholder={t('com_ui_add_obs', 'Agregar observación...')}
                                                                    value={observations[item.id] || ''}
                                                                    onChange={(e) => setObservations(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                                    className="w-full rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-yellow-500 focus:outline-none resize-none"
                                                                    rows={2}
                                                                />
                                                            </div>
                                                        )}
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
            {/* Bottom Action Button */}
            <div className="flex justify-center mt-6 mb-4 gap-4">
                <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || completedCount === 0}
                    className="group flex items-center px-3 py-2 bg-teal-600 hover:bg-teal-700 border border-teal-600 hover:border-teal-700 text-white rounded-full transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                    {isAnalyzing ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <AnimatedIcon name="sparkles" size={20} />
                    )}
                    <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">Generar Análisis con IA</span>
                </button>
            </div>
            {/* Analysis Report - Editable */}
                <CollapsibleReportBox onSave={handleSave}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                    title="Diagnóstico SGSST"
                    icon={<FileText className="h-5 w-5" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || analysisReport || ''}
                            fileName="Informe_DiagnosticoChecklist"
                            reportType="general"
                        />
                    }
                >
                    <div className="w-full min-w-0">
                        <LiveEditor
                            ref={liveEditorRef}
                            paperMode={true}
                            reportType="checklist"
                            initialContent={analysisReport}
                            onUpdate={(html) => { editorContentRef.current = html; }}
                            reportSourceData={{ statuses, observations, companySize, riskLevel, currentScore, totalPoints, complianceLevel }}
                        />
                    </div>
                </CollapsibleReportBox>

            {/* Report History Panel */}
            <ReportHistory
                isOpen={isHistoryOpen}
                toggleOpen={() => setIsHistoryOpen(false)}
                onSelectReport={handleSelectReport}
                refreshTrigger={refreshTrigger}
                tags={['sgsst-diagnostico']}
            />
        
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

export default DiagnosticoChecklist;
