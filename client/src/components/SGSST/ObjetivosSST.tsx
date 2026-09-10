import React, {  useState, useCallback, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    Save,
    Loader2,
    History,
    Target,
    ScrollText,
    Scale,
    ChevronDown,
    ChevronRight,
    Stethoscope,
    Download
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import SGSSTToolbar from './SGSSTToolbar';
import CollapsibleReportBox from './CollapsibleReportBox';

const ObjetivosSST = () => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Form state
    const [policySummary, setPolicySummary] = useState('');
    const [diagnosticSummary, setDiagnosticSummary] = useState('');
    const [additionalNorms, setAdditionalNorms] = useState('');
    const [previousObjectives, setPreviousObjectives] = useState('');
    const [yearPlan, setYearPlan] = useState('');
    const [selectedModel, setSelectedModel] = useState(user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');

    React.useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user?.personalization?.geminiModels?.sstManagement]);

    // Generated objectives
    const [generatedObjectives, setGeneratedObjectives] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // History
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Expand/collapse form
    const [isFormExpanded, setIsFormExpanded] = useState(true);

    const handleDummyData = () => {
        setPolicySummary('Prevenir accidentes y enfermedades laborales, fomentar la cultura de autocuidado, garantizar el bienestar físico y mental de los trabajadores, cumplir con la normatividad colombiana vigente en SST.');
        setDiagnosticSummary('Debilidades identificadas: falta de capacitaciones en 40% del personal, plan de emergencias desactualizado, sin indicadores de ausencia activos. Fortalezas: COPASST activo, empresa con <50 trabajadores.');
        setAdditionalNorms('Decreto 1072 de 2015, Resolución 0312 de 2019, Ley 1562 de 2012');
        showToast({ message: 'Datos de objetivos simulados generados exitosamente.', status: 'success', severity: 'success' });
    };

    const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-objetivos`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
        setIsGenerating(true);
        try {
            const response = await fetch('/api/sgsst/objetivos/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    policySummary,
                    diagnosticSummary,
                    additionalNorms,
                    modelName: selectedModel,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar los Objetivos');
            }

            const data = await response.json();
            setGeneratedObjectives(data.objectives);
            editorContentRef.current = data.objectives;
            liveEditorRef.current?.setHTML(data.objectives);
            setConversationId('new');  // 'new' marker so handleSave uses POST
            setReportMessageId(null);
            setIsFormExpanded(false);
            showToast({ message: 'Objetivos SST generados exitosamente', status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Objectives generation error:', error);
            showToast({ message: error.message || 'Error al generar los objetivos', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [policySummary, diagnosticSummary, additionalNorms, selectedModel, token, showToast]);

    const handleSave = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedObjectives;
        if (!contentToSave) {
            showToast({ message: 'No hay objetivos para guardar', status: 'warning' });
            return;
        }
        if (!token) {
            showToast({ message: 'Error: No autorizado', status: 'error' });
            return;
        }

        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-objetivos`, { headers: { Authorization: `Bearer ${token}` } });
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
            // Update existing
            if (conversationId && conversationId !== 'new' && reportMessageId) {
                const res = await fetch('/api/sgsst/diagnostico/save-report', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({
                        conversationId,
                        messageId: reportMessageId,
                        content: contentToSave,
                    }),
                });

                if (res.ok) {
                    setRefreshTrigger(prev => prev + 1);
                    showToast({ message: 'Objetivos actualizados exitosamente', status: 'success', severity: 'success' });
                } else {
                    const err = await res.json();
                    showToast({ message: `Error al actualizar: ${err.error || res.status}`, status: 'error' });
                }
                return;
            }

            // Create new
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    content: contentToSave,
                    title: `Objetivos SST - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-objetivos'],
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setConversationId(data.conversationId);
                setReportMessageId(data.messageId);
                setRefreshTrigger(prev => prev + 1);
                showToast({ message: 'Objetivos guardados exitosamente', status: 'success', severity: 'success' });
            } else {
                const err = await res.json();
                showToast({ message: `Error al guardar: ${err.error || res.status}`, status: 'error' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        }
    }, [editorContentRef.current, generatedObjectives, conversationId, reportMessageId, token, showToast]);

    const handleSelectReport = useCallback(async (selectedConvoId: string) => {
        if (!selectedConvoId) return;

        try {
            const res = await fetch(`/api/messages/${selectedConvoId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load');
            const messages = await res.json();

            // Find the last message with content
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.text) {
                setGeneratedObjectives(lastMsg.text);
                editorContentRef.current = lastMsg.text;
            liveEditorRef.current?.setHTML(lastMsg.text);
                setConversationId(selectedConvoId);
                setReportMessageId(lastMsg.messageId);
            
            setIsFormExpanded(false);
                showToast({ message: 'Objetivos cargados correctamente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            console.error('Load objectives error:', e);
            showToast({ message: 'Error al cargar los objetivos', status: 'error' });
        }
        setIsHistoryOpen(false);
    }, [token, showToast]);

    const LOCAL_STORAGE_KEY = 'sgsst_objetivos_form';

    React.useEffect(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.policySummary) setPolicySummary(data.policySummary);
                if (data.diagnosticSummary) setDiagnosticSummary(data.diagnosticSummary);
                if (data.previousObjectives) setPreviousObjectives(data.previousObjectives);
                if (data.yearPlan) setYearPlan(data.yearPlan);
            }
        } catch(e) {}
    }, []);

    const handleSaveData = () => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ policySummary, diagnosticSummary, previousObjectives, yearPlan }));
            showToast({ message: 'Datos guardados exitosamente', status: 'success', severity: 'success' });
        } catch(e) {
            showToast({ message: 'Error al guardar datos', status: 'error' });
        }
    };

    const formFields = [
        {
            id: 'policySummary',
            label: 'Resumen o Directrices de la Política SST',
            icon: ScrollText,
            value: policySummary,
            setter: setPolicySummary,
            placeholder: 'Ej: Prevención de accidentes, cuidado de la salud mental... (Si lo deja en blanco, la IA inferirá objetivos genéricos de la norma)',
            rows: 3,
        },
        {
            id: 'diagnosticSummary',
            label: 'Resultados del Diagnóstico Inicial',
            icon: Stethoscope,
            value: diagnosticSummary,
            setter: setDiagnosticSummary,
            placeholder: 'Ej: Debilidades en el plan de emergencias, falta de capacitaciones... (Opcional)',
            rows: 3,
        },
        {
            id: 'additionalNorms',
            label: 'Marco Normativo Adicional',
            icon: Scale,
            value: additionalNorms,
            setter: setAdditionalNorms,
            placeholder: 'Ej: Decreto 1072 de 2015, Resolución 0312 de 2019 (dejar vacío para usar el estándar)',
            rows: 2,
        },
    ];


    useAutoLoadReport({
        token,
        tags: ['sgsst-objetivos'],
        generatedReport: generatedObjectives,
        handleSelectReport
    });

    return (
        <div className="flex flex-col gap-4">
            <SGSSTToolbar
                onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                isHistoryOpen={isHistoryOpen}
                onAnalyze={handleGenerate}
                isAnalyzing={isGenerating}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSaveLocal={handleSaveData}
                hasContent={!!(generatedObjectives || editorContentRef.current)}
                exportContent={editorContentRef.current || ''}
                exportFileName="Objetivos_SST"
                onDummy={handleDummyData}
            />

            {/* History Panel */}
            {isHistoryOpen && (
                <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                    <ReportHistory
                        onSelectReport={handleSelectReport}
                        isOpen={isHistoryOpen}
                        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)}
                        refreshTrigger={refreshTrigger}
                        tags={['sgsst-objetivos']}
                    />
                </div>
            )}

            {/* Input Form */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button
                    onClick={() => setIsFormExpanded(!isFormExpanded)}
                    className="w-full flex items-center justify-between p-4 bg-surface-tertiary/50 hover:bg-surface-tertiary transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {isFormExpanded ? <ChevronDown className="h-5 w-5 text-text-secondary" /> : <ChevronRight className="h-5 w-5 text-text-secondary" />}
                        <Target className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        <span className="font-semibold text-text-primary">Datos para Generar los Objetivos</span>
                    </div>
                </button>

                {isFormExpanded && (
                    <div className="p-4 space-y-4">
                        <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-sm transition-all duration-300">
                            <h4 className="text-sm text-teal-800 dark:text-teal-300 mb-2 font-bold flex items-center gap-2">
                                <Sparkles className="h-5 w-5 animate-pulse text-teal-500" />
                                Integración Inteligente de Módulos
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                Puede dejar <strong>todos los campos vacíos</strong>. Si no ingresa información, la IA buscará automáticamente los indicadores actuales y peligros de su <strong>Matriz de Peligros</strong> para alinear los objetivos.
                                Si no ingresa la normatividad, se tomará por defecto el <strong>Decreto 1072 de 2015</strong> y <strong>Resolución 0312 de 2019</strong>.
                            </p>
                        </div>

                        {formFields.map((field) => {
                            const Icon = field.icon;
                            return (
                                <div key={field.id} className="space-y-1.5">
                                    <label
                                        htmlFor={field.id}
                                        className="flex items-center gap-2 text-sm font-medium text-text-primary"
                                    >
                                        <Icon className="h-4 w-4 text-text-secondary" />
                                        {field.label}
                                    </label>
                                    <textarea
                                        id={field.id}
                                        value={field.value}
                                        onChange={(e) => field.setter(e.target.value)}
                                        placeholder={field.placeholder}
                                        rows={field.rows}
                                        className="w-full rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
                                    />
                                </div>
                            );
                        })}

                        <div className="flex justify-center pt-2 gap-4">
                            <button
                                onClick={() => handleGenerate()}
                                disabled={isGenerating}
                                className="group flex items-center px-3 py-2 bg-teal-600 hover:bg-teal-700 border border-teal-600 hover:border-teal-700 text-white rounded-full transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                            >
                                {isGenerating ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <AnimatedIcon name="sparkles" size={20} />
                                )}
                                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">Generar Objetivos con IA</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Generated Objectives - LiveEditor */}
            <CollapsibleReportBox onSave={handleSave}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                        title="Objetivos SST"
                        icon={<Target className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
                        actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedObjectives || ''}
                            fileName="Informe_ObjetivosSST"
                            reportType="general"
                        />
                    }
                    >
                        <div className="w-full min-w-0">
                            <LiveEditor
                                ref={liveEditorRef}
                                paperMode={true}
                                initialContent={generatedObjectives}
                                onUpdate={(html) => { editorContentRef.current = html; }}
                                reportSourceData={{ policySummary, diagnosticSummary, additionalNorms, previousObjectives, yearPlan }}
                            />
                        </div>
                    </CollapsibleReportBox>
        
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

export default ObjetivosSST;
