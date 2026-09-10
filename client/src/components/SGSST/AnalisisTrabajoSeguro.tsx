import React, { useState, useCallback, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { useTranslation } from 'react-i18next';
import {
    Loader2,
    ChevronDown,
    ChevronRight,
    Camera,
    X,
    FileText,
    Plus,
    Trash2,
    ShieldCheck, Download , Bot, Video, Film } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import SGSSTToolbar from './SGSSTToolbar';
import SingleSelect from './SingleSelect';
import CollapsibleReportBox from './CollapsibleReportBox';

const WorkerAutocomplete = ({
    value,
    onChange,
    onSelect,
    data,
    searchKey,
    placeholder,
    className,
    wrapperClassName
}: {
    value: string;
    onChange: (val: string) => void;
    onSelect?: (worker: any) => void;
    data: any[];
    searchKey: 'nombre' | 'identificacion';
    placeholder: string;
    className?: string;
    wrapperClassName?: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: any) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = data.filter(w => {
        const searchVal = w[searchKey];
        if (!value) return true;
        return searchVal && String(searchVal).toLowerCase().includes(String(value).toLowerCase());
    });

    const exactMatch = value && filteredOptions.find(w =>
        String(w[searchKey]).toLowerCase() === String(value).toLowerCase());


    return (
        <div className={`relative ${wrapperClassName || 'w-full'}`} ref={wrapperRef}>
            <input
                type="text"
                value={value}
                onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                className={className}
                placeholder={placeholder}
                autoComplete="off"
            />
            {isOpen && filteredOptions.length > 0 && !exactMatch && (
                <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-auto bg-surface-primary border border-border-medium rounded-xl shadow-xl py-1 text-left origin-top animate-in fade-in zoom-in-95 duration-200">
                    {filteredOptions.map((w, idx) => (
                        <li
                            key={idx}
                            className="px-4 py-2 text-sm text-text-primary hover:bg-surface-hover cursor-pointer transition-colors"
                            onClick={() => {
                                if (onSelect) onSelect(w);
                                else onChange(w[searchKey]);
                                setIsOpen(false);
                            }}
                        >
                            <div className="font-semibold text-text-primary">{w.nombre}</div>
                            <div className="text-xs text-text-secondary mt-0.5">
                                CC: {w.identificacion} {w.cargo ? `• ${w.cargo}` : ''}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const AnalisisTrabajoSeguro = () => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [formData, setFormData] = useState({
        actividadGlobal: '',
        foto1Desc: '',
        foto2Desc: '',
        foto3Desc: '',
        fecha: new Date().toISOString().split('T')[0],
        horaInicio: new Date().toTimeString().slice(0, 5),
        horaFin: '',
        seguridadSocial: 'Sí',      // → "Charla de Seguridad Realizada"
        aptitudMedica: 'Sí',        // → "Equipos/Herramientas Inspeccionados"
        certificacionAlturas: 'Sí', // → "Condiciones del Área Verificadas"
    });

    const [images, setImages] = useState<{ [key: string]: string | null }>({
        foto1: null, foto2: null, foto3: null
    });
    const [video, setVideo] = useState<string | null>(null);
    const [isVideoUploading, setIsVideoUploading] = useState(false);

    const [trabajadoresList, setTrabajadoresList] = useState([{ nombre: '', cedula: '' }]);
    const [responsablesList, setResponsablesList] = useState([{ nombre: '', cedula: '', rol: '' }]);
    const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);

    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash';
    });
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isFormExpanded, setIsFormExpanded] = useState(true);
    const [isListening, setIsListening] = useState(false);
    const [interimText, setInterimText] = useState('');
    // Initialize model from user preferences when user data loads
    React.useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user?.personalization?.geminiModels?.sstManagement]);

    const recognitionRef = useRef<any>(null);

    // Load available workers
    React.useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/perfil-sociodemografico/data', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => { if (data.trabajadores?.length) setAvailableWorkers(data.trabajadores); })
            .catch(err => console.error('Error fetching workers', err));
    }, [token]);

    // Load saved ATS data
    React.useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/analisis-trabajo-seguro/data', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Object.keys(data.formData || {}).length > 0) {
                    setFormData(prev => ({ ...prev, ...data.formData }));
                }
                if (data.trabajadoresList?.length) setTrabajadoresList(data.trabajadoresList);
                if (data.responsablesList?.length) setResponsablesList(data.responsablesList);
                if (data.images) setImages(data.images);
                if (data.video) setVideo(data.video);
            })
            .catch(err => console.error('Error fetching ATS data', err));
    }, [token]);

    const handleSaveData = async (silent = false) => {
        if (!token) return;
        try {
            const res = await fetch('/api/sgsst/analisis-trabajo-seguro/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ formData, trabajadoresList, responsablesList, images, video })
            });
            if (res.ok && !silent) showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
        } catch (err) {
            if (!silent) showToast({ message: 'Error al guardar los datos.', status: 'error' });
        }
    };

    const handleDummyData = () => {
        const dummy = generateDummyData.ats();
        setFormData(prev => ({ ...prev, ...dummy.formData }));
        setTrabajadoresList(dummy.trabajadoresList);
        setResponsablesList(dummy.responsablesList);
        setImages(dummy.images as any);
        showToast({ message: 'Datos de prueba generados exitosamente.', status: 'success', severity: 'success' });
    };

    const handleVoiceInput = () => {
        if (isListening) {
            try { recognitionRef.current?.stop(); } catch (e) { }
            setIsListening(false);
            setInterimText('');
            return;
        }
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast({ message: 'Su navegador no soporta reconocimiento de voz. Use Chrome.', status: 'error' });
            return;
        }
        try {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            recognition.lang = 'es-CO';
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onstart = () => { setIsListening(true); setInterimText(''); };
            recognition.onresult = (event: any) => {
                let currentInterim = '';
                let newFinal = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) newFinal += event.results[i][0].transcript;
                    else currentInterim += event.results[i][0].transcript;
                }
                if (newFinal) {
                    setFormData(prev => ({
                        ...prev,
                        actividadGlobal: prev.actividadGlobal +
                            (prev.actividadGlobal && !prev.actividadGlobal.endsWith(' ') ? ' ' : '') + newFinal
                    }));
                }
                setInterimText(currentInterim);
            };
            recognition.onerror = () => { setIsListening(false); setInterimText(''); };
            recognition.onend = () => { setIsListening(false); setInterimText(''); };
            recognition.start();
        } catch (e) {
            setIsListening(false);
            showToast({ message: 'Error al iniciar reconocimiento', status: 'error' });
        }
    };

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = (field: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_DIM = 1200;
                    if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
                    else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
                    canvas.width = width;
                    canvas.height = height;
                    canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
                    setImages(prev => ({ ...prev, [field]: canvas.toDataURL('image/jpeg', 0.6) }));
                };
                img.src = readerEvent.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
            showToast({ message: 'El video es demasiado pesado. Máximo 20MB.', status: 'error' });
            return;
        }

        setIsVideoUploading(true);
        const videoElement = document.createElement('video');
        videoElement.preload = 'metadata';

        videoElement.onloadedmetadata = () => {
            window.URL.revokeObjectURL(videoElement.src);
            const duration = videoElement.duration;

            if (duration > 10.5) {
                showToast({ message: 'El video no debe superar los 10 segundos para evidencia.', status: 'error' });
                setIsVideoUploading(false);
                return;
            }

            const reader = new FileReader();
            reader.onload = (ev) => {
                setVideo(ev.target?.result as string);
                setIsVideoUploading(false);
                showToast({ message: 'Video de evidencia cargado (Máx 10s).', status: 'success', severity: 'success' });
            };
            reader.onerror = () => setIsVideoUploading(false);
            reader.readAsDataURL(file);
        };

        videoElement.onerror = () => {
            showToast({ message: 'Error al procesar el video.', status: 'error' });
            setIsVideoUploading(false);
        };

        videoElement.src = URL.createObjectURL(file);
    }, [showToast]);

    const removeVideo = () => {
        setVideo(null);
    };

    const removeImage = (field: string) => {
        setImages(prev => ({ ...prev, [field]: null }));
    };

    const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-ats`, { headers: { Authorization: `Bearer ${token}` } });
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
        handleSaveData(true);
        try {
            const response = await fetch('/api/sgsst/analisis-trabajo-seguro/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ formData, trabajadoresList, responsablesList, images, video, modelName: selectedModel }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar el ATS');
            }
            const data = await response.json();
            setGeneratedReport(data.report);
            editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId(null);
            setReportMessageId(null);
            setIsFormExpanded(false);
            showToast({ message: 'ATS generado exitosamente', status: 'success', severity: 'success' });
        } catch (error: any) {
            showToast({ message: error.message || 'Error al generar ATS', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [formData, images, video, selectedModel, token, trabajadoresList, responsablesList, showToast, handleSaveData]);

    const handleSave = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedReport;
        if (!contentToSave || !token) return;
        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-ats`, { headers: { Authorization: `Bearer ${token}` } });
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
            if (conversationId && conversationId !== 'new' && reportMessageId) {
                const res = await fetch('/api/sgsst/diagnostico/save-report', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ conversationId, messageId: reportMessageId, content: contentToSave }),
                });
                if (res.ok) { setRefreshTrigger(p => p + 1); showToast({ message: 'ATS actualizado exitosamente', status: 'success', severity: 'success' }); }
                return;
            }
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    content: contentToSave,
                    title: `ATS - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-ats'],
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setConversationId(data.conversationId);
                setReportMessageId(data.messageId);
                setRefreshTrigger(p => p + 1);
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        }
    }, [generatedReport, conversationId, reportMessageId, token, showToast]);

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
                setGeneratedReport(lastMsg.text);
                editorContentRef.current = lastMsg.text;
                liveEditorRef.current?.setHTML(lastMsg.text);
                setConversationId(selectedConvoId);
                setReportMessageId(lastMsg.messageId);
                setIsFormExpanded(false);
                showToast({ message: 'ATS cargado correctamente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            showToast({ message: 'Error al cargar el ATS', status: 'error' });
        }
        setIsHistoryOpen(false);
    }, [token, showToast]);

    useAutoLoadReport({
        token,
        tags: ['sgsst-ats'],
        generatedReport: generatedReport,
        handleSelectReport
    });

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Main Toolbar */}
            <div className="flex flex-col items-center gap-6 mb-6">
                <div className="flex items-center gap-4 text-center">
                    <div className="p-3 rounded-2xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 shadow-sm">
                        <ShieldCheck className="h-8 w-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-text-primary tracking-tight">Análisis de Trabajo Seguro (ATS)</h2>
                        <p className="text-sm text-text-secondary font-medium">Identificación de Peligros y Control de Riesgos por Tarea</p>
                    </div>
                </div>

                <SGSSTToolbar
                    onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                    isHistoryOpen={isHistoryOpen}
                    onAnalyze={handleGenerate}
                    isAnalyzing={isGenerating}
                    selectedModel={selectedModel}
                    onSelectModel={setSelectedModel}
                    onSaveLocal={handleSaveData}
                    hasContent={!!(editorContentRef.current || generatedReport)}
                    exportContent={editorContentRef.current || generatedReport || ''}
                    exportFileName="Analisis_Trabajo_Seguro_ATS"
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
                        tags={['sgsst-ats']}
                    />
                </div>
            )}

            {/* Form */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button onClick={() => setIsFormExpanded(!isFormExpanded)} className="w-full flex items-center justify-between p-4 bg-surface-tertiary">
                    <div className="flex items-center gap-2">
                        {isFormExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        <ShieldCheck className="h-5 w-5 text-teal-700" />
                        <span className="font-semibold">Datos del Análisis de Trabajo Seguro (ATS)</span>
                    </div>
                </button>

                {isFormExpanded && (
                    <div className="p-6 space-y-6">
                        {/* Workers Section */}
                        <div className="space-y-4 border rounded-xl p-4 bg-surface-tertiary/20">
                            <h4 className="font-semibold text-text-primary text-sm">Trabajadores que Ejecutan la Tarea</h4>
                            {(trabajadoresList || []).map((trabajador, idx) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-3">
                                    <WorkerAutocomplete
                                        value={trabajador.nombre}
                                        onChange={(val) => {
                                            const newT = [...trabajadoresList];
                                            newT[idx].nombre = val;
                                            const match = availableWorkers.find(w => w.nombre === val);
                                            if (match) newT[idx].cedula = match.identificacion;
                                            setTrabajadoresList(newT);
                                        }}
                                        onSelect={(w) => {
                                            const newT = [...trabajadoresList];
                                            newT[idx].nombre = w.nombre;
                                            newT[idx].cedula = w.identificacion;
                                            setTrabajadoresList(newT);
                                        }}
                                        data={availableWorkers}
                                        searchKey="nombre"
                                        placeholder="Nombre completo"
                                        wrapperClassName="w-full md:w-1/2"
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <div className="flex w-full md:w-1/2 gap-2">
                                        <WorkerAutocomplete
                                            value={trabajador.cedula}
                                            onChange={(val) => {
                                                const newT = [...trabajadoresList];
                                                newT[idx].cedula = val;
                                                const match = availableWorkers.find(w => w.identificacion === val);
                                                if (match && !newT[idx].nombre) newT[idx].nombre = match.nombre;
                                                setTrabajadoresList(newT);
                                            }}
                                            onSelect={(w) => {
                                                const newT = [...trabajadoresList];
                                                newT[idx].cedula = w.identificacion;
                                                if (!newT[idx].nombre) newT[idx].nombre = w.nombre;
                                                setTrabajadoresList(newT);
                                            }}
                                            data={availableWorkers}
                                            searchKey="identificacion"
                                            placeholder="Cédula"
                                            wrapperClassName="w-full"
                                            className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        />
                                        <button
                                            onClick={() => setTrabajadoresList(trabajadoresList.filter((_, i) => i !== idx))}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                            disabled={trabajadoresList.length === 1}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => setTrabajadoresList([...trabajadoresList, { nombre: '', cedula: '' }])}
                                className="flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium"
                            >
                                <Plus className="h-4 w-4" /> Añadir Trabajador
                            </button>
                        </div>

                        {/* Fecha / Hora */}
                        <h4 className="font-semibold text-text-primary text-sm mt-4">Información de la Tarea</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Fecha de Ejecución</label>
                                <input type="date" value={formData.fecha} onChange={e => handleInputChange('fecha', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Hora de Inicio</label>
                                <input type="time" value={formData.horaInicio} onChange={e => handleInputChange('horaInicio', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                            </div>
                        </div>

                        {/* Preoperational checks */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Charla de Seguridad Realizada</label>
                                <SingleSelect value={formData.seguridadSocial} onChange={val => handleInputChange('seguridadSocial', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Equipos / Herramientas Inspeccionados</label>
                                <SingleSelect value={formData.aptitudMedica} onChange={val => handleInputChange('aptitudMedica', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Condiciones del Área Verificadas</label>
                                <SingleSelect value={formData.certificacionAlturas} onChange={val => handleInputChange('certificacionAlturas', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                            </div>
                        </div>

                        {/* Supervisors */}
                        <div className="space-y-3 pt-3 border-t">
                            <label className="text-sm font-medium">Supervisor / Responsable que Aprueba el ATS</label>
                            {(responsablesList || []).map((resp, idx) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-3">
                                    <WorkerAutocomplete
                                        value={resp.nombre}
                                        onChange={(val) => {
                                            const newR = [...responsablesList];
                                            newR[idx].nombre = val;
                                            const match = availableWorkers.find(w => w.nombre === val);
                                            if (match) { newR[idx].cedula = match.identificacion; if (!newR[idx].rol && match.cargo) newR[idx].rol = match.cargo; }
                                            setResponsablesList(newR);
                                        }}
                                        onSelect={(w) => {
                                            const newR = [...responsablesList];
                                            newR[idx].nombre = w.nombre;
                                            newR[idx].cedula = w.identificacion;
                                            if (!newR[idx].rol && w.cargo) newR[idx].rol = w.cargo;
                                            setResponsablesList(newR);
                                        }}
                                        data={availableWorkers}
                                        searchKey="nombre"
                                        placeholder="Nombre"
                                        wrapperClassName="w-full md:w-1/3"
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    />
                                    <input
                                        type="text"
                                        value={resp.rol}
                                        onChange={e => { const newR = [...responsablesList]; newR[idx].rol = e.target.value; setResponsablesList(newR); }}
                                        className="w-full md:w-1/3 rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"
                                        placeholder="Rol (Ej: Supervisor, Jefe de Área)"
                                    />
                                    <div className="flex w-full md:w-1/3 gap-2">
                                        <WorkerAutocomplete
                                            value={resp.cedula}
                                            onChange={(val) => {
                                                const newR = [...responsablesList];
                                                newR[idx].cedula = val;
                                                const match = availableWorkers.find(w => w.identificacion === val);
                                                if (match && !newR[idx].nombre) { newR[idx].nombre = match.nombre; if (!newR[idx].rol && match.cargo) newR[idx].rol = match.cargo; }
                                                setResponsablesList(newR);
                                            }}
                                            onSelect={(w) => {
                                                const newR = [...responsablesList];
                                                newR[idx].cedula = w.identificacion;
                                                if (!newR[idx].nombre) { newR[idx].nombre = w.nombre; if (!newR[idx].rol && w.cargo) newR[idx].rol = w.cargo; }
                                                setResponsablesList(newR);
                                            }}
                                            data={availableWorkers}
                                            searchKey="identificacion"
                                            placeholder="Cédula"
                                            wrapperClassName="w-full"
                                            className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        />
                                        <button
                                            onClick={() => setResponsablesList(responsablesList.filter((_, i) => i !== idx))}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => setResponsablesList([...responsablesList, { nombre: '', cedula: '', rol: '' }])}
                                className="flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 font-medium"
                            >
                                <Plus className="h-4 w-4" /> Añadir Supervisor
                            </button>
                        </div>

                        {/* Task description with voice */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-teal-700" /> Descripción de la Tarea a Analizar (Dictado o Texto)
                                </h4>
                                <button
                                    onClick={handleVoiceInput}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow border flex items-center gap-2 ${isListening ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-surface-secondary hover:bg-surface-hover text-text-primary border-border-light'}`}
                                >
                                    <span className="relative flex h-3 w-3">
                                        {isListening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                                        <span className={`relative inline-flex rounded-full h-3 w-3 ${isListening ? 'bg-red-500' : 'bg-teal-700'}`}></span>
                                    </span>
                                    {isListening ? 'Escuchando...' : 'Activar Micrófono'}
                                </button>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                <strong>IMPORTANTE:</strong> Describa detalladamente la tarea que se va a ejecutar:{' '}
                                <u>Tipo de actividad, área o proceso, equipos y herramientas a utilizar, pasos principales, materiales, condiciones del entorno y cualquier peligro observable.</u>
                            </p>
                            <textarea
                                value={formData.actividadGlobal + (interimText ? (formData.actividadGlobal && !formData.actividadGlobal.endsWith(' ') ? ' ' : '') + interimText : '')}
                                onChange={e => { if (!isListening) handleInputChange('actividadGlobal', e.target.value); }}
                                readOnly={isListening}
                                className={`w-full rounded-xl border-2 ${isListening ? 'border-solid border-red-300 bg-red-50/10 focus:border-red-400' : 'border-dashed border-teal-200 bg-teal-50/10 focus:bg-teal-50/30 focus:border-teal-400'} p-4 text-sm text-text-primary min-h-[160px] resize-y transition-colors focus:outline-none`}
                                placeholder="Ej: Se realizará el cambio de rodamiento del motor eléctrico de 50HP en la línea de producción 2. Para la tarea se usará esmeriladora angular, extractor de rodamientos, manleva de 3 toneladas y llaves de torque. La zona cuenta con iluminación artificial..."
                            />
                        </div>

                        {/* Photos */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <h4 className="font-semibold text-text-primary text-sm">Registro Fotográfico del Área y Tarea</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {['foto1', 'foto2', 'foto3'].map((foto, idx) => {
                                    const labels = ['Vista General del Área', 'Equipos / Herramientas a Usar', 'Condiciones del Entorno'];
                                    const fieldName = foto as 'foto1' | 'foto2' | 'foto3';
                                    const descName = `${foto}Desc`;
                                    return (
                                        <div key={foto} className="flex flex-col items-center gap-3">
                                            <span className="font-semibold text-sm">{labels[idx]}</span>
                                            <div className="relative w-full aspect-square bg-surface-tertiary rounded-xl border-2 border-dashed border-teal-200 flex flex-col items-center justify-center overflow-hidden hover:bg-surface-hover transition-colors">
                                                {images[fieldName] ? (
                                                    <>
                                                        <img src={images[fieldName] as string} className="w-full h-full object-cover" alt={foto} />
                                                        <button onClick={() => removeImage(fieldName)} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500">
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-teal-700">
                                                        <Camera className="h-8 w-8 mb-2" />
                                                        <span className="text-xs text-center px-4">Tocar para tomar/subir foto</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(fieldName, e)} />
                                                    </label>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Descripción breve..."
                                                value={(formData as any)[descName]}
                                                onChange={e => handleInputChange(descName, e.target.value)}
                                                className="w-full rounded border px-2 py-1 text-xs bg-surface-primary text-text-primary"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Video Evidence */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                    <Film className="h-4 w-4 text-teal-700" /> Video de Evidencia Crítica (Opcional)
                                </h4>
                                <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold uppercase">Máximo 10 Segundos</span>
                            </div>

                            <div className="bg-surface-tertiary/10 border-2 border-dashed border-teal-200 rounded-2xl p-6 transition-all hover:bg-surface-tertiary/20">
                                {!video ? (
                                    <div className="flex flex-col items-center justify-center space-y-3">
                                        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold">
                                            {isVideoUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Video className="h-8 w-8" />}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-text-primary uppercase tracking-wide">Adjuntar Video de la Tarea</p>
                                            <p className="text-xs text-text-secondary mt-1">El video permite a la IA analizar riesgos dinámicos</p>
                                        </div>
                                        <label className="cursor-pointer bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 flex items-center gap-2">
                                            {isVideoUploading ? 'Procesando...' : 'Seleccionar Evidencia'}
                                            <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isVideoUploading} />
                                        </label>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-w-md mx-auto shadow-2xl border-2 border-teal-500">
                                            <video src={video} controls className="w-full h-full" />
                                            <button onClick={removeVideo} className="absolute top-3 right-3 bg-red-600 text-white p-2.5 rounded-full shadow-lg hover:bg-red-700 transition-colors z-10">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-center gap-2 text-teal-600 font-bold bg-teal-50 py-3 rounded-xl border border-teal-100 text-sm">
                                            <ShieldCheck className="h-4 w-4" />
                                            Evidencia de video lista para análisis de riesgos
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom generate button */}
                        <div className="flex justify-center pt-4 gap-4">
                            <button
                                onClick={() => handleGenerate()}
                                disabled={isGenerating}
                                className="group flex items-center px-5 py-3 bg-teal-700 hover:bg-teal-800 border border-teal-700 text-white rounded-full transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                            >
                                {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <AnimatedIcon name="sparkles" size={20} />}
                                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">Generar ATS con IA</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Generated ATS Editor */}
            <CollapsibleReportBox onSave={handleSave}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                    title="Análisis de Trabajo Seguro (ATS)"
                    icon={<ShieldCheck className="h-5 w-5" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_AnalisisTrabajoSeguro"
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
                            reportSourceData={{ formData, trabajadoresList, responsablesList }}
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

export default AnalisisTrabajoSeguro;
