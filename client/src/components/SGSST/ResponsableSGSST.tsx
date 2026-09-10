import React, {  useState, useCallback, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    Save,
    Download,
    Loader2,
    History,
    FileText,
    UserCheck,
    ScrollText,
    Scale,
    ChevronDown,
    ChevronRight,
    Briefcase,
    Calendar,
    Award
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import SGSSTToolbar from './SGSSTToolbar';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import CollapsibleReportBox from './CollapsibleReportBox';

const ResponsableSGSST = () => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Form state
    const [responsableName, setResponsableName] = useState('');
    const [formationLevel, setFormationLevel] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [licenseExpiry, setLicenseExpiry] = useState('');
    const [courseStatus, setCourseStatus] = useState('');
    const [additionalNorms, setAdditionalNorms] = useState('');
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash';
    });

    // Generated document
    const [generatedDoc, setGeneratedDoc] = useState<string | null>(null);
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

    // Initialize model from user preferences when user data loads
    React.useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user?.personalization?.geminiModels?.sstManagement]);

    // Auto-fill from company info
    React.useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/company-info', {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.json())
            .then(data => {
                if (data) {
                    if (data.responsibleSST) setResponsableName(prev => prev || data.responsibleSST);
                    if (data.formationLevel) setFormationLevel(prev => prev || data.formationLevel);
                    if (data.licenseNumber) setLicenseNumber(prev => prev || data.licenseNumber);
                    if (data.licenseExpiry) setLicenseExpiry(prev => prev || data.licenseExpiry);
                    if (data.courseStatus) setCourseStatus(prev => prev || data.courseStatus);
                }
            })
            .catch(err => console.error('Error fetching company info for auto-fill:', err));
    }, [token]);

    const handleDummyData = () => {
        const dummy = generateDummyData.responsableSGSST();
        setResponsableName(prev => prev || dummy.name);
        setFormationLevel(prev => prev || dummy.profile);
        setLicenseNumber(prev => prev || '4567-2021 - Secretaría de Salud de Antioquia');
        setLicenseExpiry(prev => prev || '2026-12-31');
        setCourseStatus(prev => prev || '2025-03-01');
        setAdditionalNorms(prev => prev || 'Resolución 908 de 2025, Decreto 1072 de 2015, Resolución 0312 de 2019');
        showToast({ message: 'Datos del responsable SG-SST simulados generados exitosamente.', status: 'success', severity: 'success' });
    };

    const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-responsable`, { headers: { Authorization: `Bearer ${token}` } });
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
            const response = await fetch('/api/sgsst/responsable/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    responsableName,
                    formationLevel,
                    licenseNumber,
                    licenseExpiry,
                    courseStatus,
                    additionalNorms,
                    modelName: selectedModel,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar el documento');
            }

            const data = await response.json();
            setGeneratedDoc(data.document);
            editorContentRef.current = data.document;
            liveEditorRef.current?.setHTML(data.document);
            setConversationId('new');  // 'new' marker so handleSave uses POST
            setReportMessageId(null);
            setIsFormExpanded(false);
            showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Generation error:', error);
            showToast({ message: error.message || 'Error al generar el documento', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [responsableName, formationLevel, licenseNumber, licenseExpiry, courseStatus, additionalNorms, token, showToast, selectedModel]);

    const handleSave = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedDoc;
        if (!contentToSave) {
            showToast({ message: 'No hay documento para guardar', status: 'warning' });
            return;
        }
        if (!token) {
            showToast({ message: 'Error: No autorizado', status: 'error' });
            return;
        }

        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-responsable`, { headers: { Authorization: `Bearer ${token}` } });
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
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(isNew ? {
                    title: 'Asignación Responsable SG-SST',
                    content: contentToSave,
                    tags: ['sgsst-responsable'],
                    metadata: { responsableName, formationLevel }
                } : {
                    conversationId,
                    messageId: reportMessageId,
                    content: contentToSave,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (isNew) {
                    setConversationId(data.conversationId);
                    setReportMessageId(data.messageId);
                }
                setGeneratedDoc(contentToSave);
                editorContentRef.current = contentToSave;
                setRefreshTrigger(prev => prev + 1);
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            } else {
                const err = await res.json();
                throw new Error(err.message || 'Error al guardar');
            }
        } catch (error: any) {
            console.error('Save error:', error);
            showToast({ message: error.message || 'Error al guardar el documento', status: 'error' });
        }
    }, [editorContentRef.current, generatedDoc, conversationId, reportMessageId, responsableName, formationLevel, token, showToast]);

    const LOCAL_STORAGE_KEY = 'sgsst_responsable_form';

    React.useEffect(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.responsableName) setResponsableName(data.responsableName);
                if (data.formationLevel) setFormationLevel(data.formationLevel);
                if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
                if (data.licenseExpiry) setLicenseExpiry(data.licenseExpiry);
                if (data.courseStatus) setCourseStatus(data.courseStatus);
                if (data.additionalNorms) setAdditionalNorms(data.additionalNorms);
            }
        } catch(e) {}
    }, []);

    const handleSaveData = () => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ responsableName, formationLevel, licenseNumber, licenseExpiry, courseStatus, additionalNorms }));
            showToast({ message: 'Datos guardados exitosamente', status: 'success', severity: 'success' });
        } catch(e) {
            showToast({ message: 'Error al guardar datos', status: 'error' });
        }
    };

    const handleSelectReport = useCallback(async (selectedConvoId: string) => {
        if (!selectedConvoId) return;

        try {
            const res = await fetch(`/api/messages/${selectedConvoId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load');
            const messages = await res.json();

            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.text) {
                setGeneratedDoc(lastMsg.text);
                editorContentRef.current = lastMsg.text;
            liveEditorRef.current?.setHTML(lastMsg.text);
                setConversationId(selectedConvoId);
                setReportMessageId(lastMsg.messageId);
            
            setIsFormExpanded(false);
                showToast({ message: 'Documento cargado correctamente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            console.error('Load document error:', e);
            showToast({ message: 'Error al cargar el documento', status: 'error' });
        }
        setIsHistoryOpen(false);
    }, [token, showToast]);

    const formFields = [
        {
            id: 'responsableName',
            label: 'Nombre del Responsable',
            icon: UserCheck,
            value: responsableName,
            setter: setResponsableName,
            placeholder: 'Nombre completo de la persona asignada',
            rows: 1,
        },
        {
            id: 'formationLevel',
            label: 'Nivel de Formación',
            icon: Briefcase,
            value: formationLevel,
            setter: setFormationLevel,
            placeholder: 'Técnico, Tecnólogo, Profesional, Especialista en SST',
            rows: 1,
        },
        {
            id: 'licenseNumber',
            label: 'Número de Licencia SST',
            icon: Award,
            value: licenseNumber,
            setter: setLicenseNumber,
            placeholder: 'Ej: 12345 de 2024 - Secretaría de Salud',
            rows: 1,
        },
        {
            id: 'licenseExpiry',
            label: 'Vigencia de Licencia',
            icon: Calendar,
            value: licenseExpiry,
            setter: setLicenseExpiry,
            type: 'date',
        },

        {
            id: 'courseStatus',
            label: 'Curso 50 Horas / Actualización 20 Horas',
            icon: FileText,
            value: courseStatus,
            setter: setCourseStatus,
            type: 'date',
        },

        {
            id: 'additionalNorms',
            label: 'Observaciones / Normativa Adicional',
            icon: Scale,
            value: additionalNorms,
            setter: setAdditionalNorms,
            placeholder: 'Ej: Resolución 908 de 2025 para el ejercicio de la licencia',
            rows: 2,
        },
    ];


    useAutoLoadReport({
        token,
        tags: ['sgsst-responsable'],
        generatedReport: generatedDoc,
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
                hasContent={!!(generatedDoc || editorContentRef.current)}
                exportContent={editorContentRef.current || ''}
                exportFileName="Asignacion_Responsable_SGSST"
                onDummy={handleDummyData}
            />

            {isHistoryOpen && (
                <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                    <ReportHistory
                        onSelectReport={handleSelectReport}
                        isOpen={isHistoryOpen}
                        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)}
                        refreshTrigger={refreshTrigger}
                        tags={['sgsst-responsable']}
                    />
                </div>
            )}

            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button
                    onClick={() => setIsFormExpanded(!isFormExpanded)}
                    className="w-full flex items-center justify-between p-4 bg-surface-tertiary/50 hover:bg-surface-tertiary transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {isFormExpanded ? <ChevronDown className="h-5 w-5 text-text-secondary" /> : <ChevronRight className="h-5 w-5 text-text-secondary" />}
                        <UserCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        <span className="font-semibold text-text-primary">Datos del Responsable SG-SST</span>
                    </div>
                </button>

                {isFormExpanded && (
                    <div className="p-4 space-y-4">
                        <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-xl border border-teal-100 dark:border-teal-800/30 shadow-sm transition-all duration-300">
                            <h4 className="text-sm text-teal-800 dark:text-teal-300 mb-2 font-bold flex items-center gap-2">
                                <Sparkles className="h-5 w-5 animate-pulse text-teal-500" />
                                Generación Inteligente
                            </h4>
                            <p className="text-sm text-text-secondary leading-relaxed">
                                Puede dejar los campos en blanco. La IA utilizará automáticamente la información que haya guardado en el perfil de <strong>Información de la Empresa</strong>.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {formFields.map((field) => {
                                const Icon = field.icon;
                                return (
                                    <div key={field.id} className="space-y-1.5 single-field-container">
                                        <label
                                            htmlFor={field.id}
                                            className="flex items-center gap-2 text-sm font-medium text-text-primary"
                                        >
                                            <Icon className="h-4 w-4 text-text-secondary" />
                                            {field.label}
                                        </label>
                                        <input
                                            type={field.type || 'text'}
                                            id={field.id}
                                            value={field.value}
                                            onChange={(e) => field.setter(e.target.value)}
                                            placeholder={field.id === 'additionalNorms' ? 'Resolución 908 de 2025, Resolucion 0312 de 2019 (Predeterminado)' : field.placeholder}
                                            className="w-full rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                        />
                                        {field.id === 'additionalNorms' && (
                                            <p className="mt-1 text-[10px] italic text-text-secondary opacity-70">
                                                * Si se deja vacío, la IA redactará basándose en la normativa vigente de 2025.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

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
                                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">Generar con IA</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <CollapsibleReportBox onSave={handleSave}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                        title="Responsable SGSST"
                        icon={<ScrollText className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
                        actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedDoc || ''}
                            fileName="Informe_ResponsableSGSST"
                            reportType="general"
                        />
                    }
                    >
                        <div className="rounded-xl p-1 overflow-hidden">
                            <LiveEditor
                                ref={liveEditorRef}
                                initialContent={generatedDoc}
                                onUpdate={(html) => { editorContentRef.current = html; }}
                                reportSourceData={{ responsableName, formationLevel, licenseNumber, licenseExpiry, courseStatus, additionalNorms }}
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

export default ResponsableSGSST;
