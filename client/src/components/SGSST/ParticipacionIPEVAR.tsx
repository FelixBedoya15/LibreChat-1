import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    Sparkles,
    Save,
    Loader2,
    History,
    ChevronDown,
    ChevronRight,
    Camera,
    X,
    FileText,
    Plus,
    Trash2,
    AlertTriangle,
    Inbox,
    CheckCircle,
    Video,
    Film,
    Download,
    QrCode,
    Info
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
import SGSSTToolbar, { ToolbarButton } from './SGSSTToolbar';
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

    const exactMatch = value && filteredOptions.find(w => String(w[searchKey]).toLowerCase() === String(value).toLowerCase());


    return (
        <div className={`relative ${wrapperClassName || 'w-full'}`} ref={wrapperRef}>
            <input
                type="text"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setIsOpen(true);
                }}
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
                            <div className="text-xs text-text-secondary mt-0.5">CC: {w.identificacion} {w.cargo ? `• ${w.cargo}` : ''}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};


interface ParticipacionData {
    id: string;
    title: string;
    formData: {
        fecha: string;
        tarea: string;
        peligros: string;
        controlesExistentes: string;
        suficientes: boolean;
        sugeridoIngenieria: string;
        sugeridoAdministrativo: string;
        sugeridoEPP: string;
        actividadGlobal: string;
    };
    images: { foto1: string | null; foto2: string | null; foto3: string | null; };
    video: string | null;
    trabajadoresList: { nombre: string; cedula: string; cargo?: string; }[];
    responsablesList: { nombre: string; cedula: string; rol: string; }[];
    report?: string;
}

const createInitialParticipacion = (): ParticipacionData => ({
    id: crypto.randomUUID(),
    title: `Nueva Participación`,
    formData: {
        fecha: new Date().toISOString().split('T')[0],
        tarea: '',
        peligros: '',
        controlesExistentes: '',
        suficientes: true,
        sugeridoIngenieria: '',
        sugeridoAdministrativo: '',
        sugeridoEPP: '',
        actividadGlobal: ''
    },
    images: { foto1: null, foto2: null, foto3: null },
    video: null,
    trabajadoresList: [{ nombre: '', cedula: '' }],
    responsablesList: [{ nombre: '', cedula: '', rol: '' }],
});

const ParticipacionIPEVAR = () => {

    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [participacionesList, setParticipacionesList] = useState<ParticipacionData[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    const [activeParticipacion, setActiveParticipacion] = useState<ParticipacionData>(createInitialParticipacion());

    const formData = activeParticipacion.formData;
    const images = activeParticipacion.images;
    const video = activeParticipacion.video;
    const trabajadoresList = activeParticipacion.trabajadoresList;
    const responsablesList = activeParticipacion.responsablesList;

    const setFormData = (updater: any) => {
        setActiveParticipacion(prev => ({
            ...prev,
            formData: typeof updater === 'function' ? updater(prev.formData) : { ...prev.formData, ...updater }
        }));
    };
    const setImages = (updater: any) => {
        setActiveParticipacion(prev => ({
            ...prev,
            images: typeof updater === 'function' ? updater(prev.images) : { ...prev.images, ...updater }
        }));
    };
    const setVideo = (val: string | null) => {
        setActiveParticipacion(prev => ({ ...prev, video: val }));
    };
    const setTrabajadoresList = (val: any) => {
        setActiveParticipacion(prev => ({ ...prev, trabajadoresList: typeof val === 'function' ? val(prev.trabajadoresList) : val }));
    };
    const setResponsablesList = (val: any) => {
        setActiveParticipacion(prev => ({ ...prev, responsablesList: typeof val === 'function' ? val(prev.responsablesList) : val }));
    };

    const [isVideoUploading, setIsVideoUploading] = useState(false);
    const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);

    const [selectedModel, setSelectedModel] = useState(() => user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');

    React.useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user]);
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
    const recognitionRef = useRef<any>(null);

    // Public Inbox State
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [inboxPublico, setInboxPublico] = useState<any[]>([]);
    const [isInboxOpen, setIsInboxOpen] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);

    React.useEffect(() => {
        fetch('/api/sgsst/company-info', {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(info => { if (info && info.companyName) setCompanyInfo(info); })
        .catch(() => {});
    }, [token]);

    const downloadQR = (title: string, containerId: string) => {
        const svgElement = document.getElementById(containerId)?.querySelector('svg');
        if (!svgElement) return;

        const svgString = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const URL = window.URL || window.webkitURL || window;
        const blobURL = URL.createObjectURL(svgBlob);

        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, 512, 512);
                context.drawImage(image, 32, 32, 448, 448);
                
                const png = canvas.toDataURL('image/png');
                const downloadLink = document.createElement('a');
                downloadLink.href = png;
                downloadLink.download = `QR_${title.replace(/\s+/g, '_')}.png`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
            }
        };
        image.src = blobURL;
    };

    // Listen for cross-component inbox open requests (from notifications)
    React.useEffect(() => {
        const handleOpenInbox = (e: Event) => {
            const { module } = (e as CustomEvent).detail || {};
            if (module === 'participacion_ipevar') setIsInboxOpen(true);
        };
        window.addEventListener('sgsst-open-inbox', handleOpenInbox);
        return () => window.removeEventListener('sgsst-open-inbox', handleOpenInbox);
    }, []);

    // Load available workers from Perfil Sociodemográfico
    React.useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/perfil-sociodemografico/data', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.trabajadores?.length) setAvailableWorkers(data.trabajadores);
            })
            .catch(err => console.error('Error fetching workers', err));
    }, [token]);

    // Load previously saved data
    React.useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/participacion-ipevar/data', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.inboxPublico) setInboxPublico(data.inboxPublico);
                if (data.participacionesList?.length > 0) {
                    setParticipacionesList(data.participacionesList);
                    setActiveId(data.participacionesList[0].id);
                    setActiveParticipacion(data.participacionesList[0]);
                    setGeneratedReport(data.participacionesList[0].report || null);
                    editorContentRef.current = data.participacionesList[0].report || '';
                    if (liveEditorRef.current) liveEditorRef.current.setHTML(data.participacionesList[0].report || '');
                } else {
                    const initial = createInitialParticipacion();
                    setParticipacionesList([initial]);
                    setActiveId(initial.id);
                    setActiveParticipacion(initial);
                }
            })
            .catch(err => console.error('Error fetching participacion ipevar data', err));
    }, [token]);

    const handleAddParticipacion = () => {
        const initial = createInitialParticipacion();
        setParticipacionesList(prev => [...prev, initial]);
        setActiveId(initial.id);
        setActiveParticipacion(initial);
        setGeneratedReport(null);
        editorContentRef.current = '';
        if (liveEditorRef.current) liveEditorRef.current.setHTML('');
        setIsFormExpanded(true);
        showToast({ message: 'Nueva participación creada', status: 'info' });
    };

    const handleDeleteParticipacion = (id: string) => {
        const updated = participacionesList.filter(p => p.id !== id);
        if (updated.length === 0) {
            const initial = createInitialParticipacion();
            setParticipacionesList([initial]);
            setActiveId(initial.id);
            setActiveParticipacion(initial);
            setGeneratedReport(null);
            editorContentRef.current = '';
            if (liveEditorRef.current) liveEditorRef.current.setHTML('');
        } else {
            setParticipacionesList(updated);
            if (activeId === id) {
                setActiveId(updated[0].id);
                setActiveParticipacion(updated[0]);
                setGeneratedReport(updated[0].report || null);
                editorContentRef.current = updated[0].report || '';
                if (liveEditorRef.current) liveEditorRef.current.setHTML(updated[0].report || '');
            }
        }
    };

    const handleSelectParticipacion = (id: string) => {
        const part = participacionesList.find(p => p.id === id);
        if (part) {
            setActiveId(id);
            setActiveParticipacion(part);
            setGeneratedReport(part.report || null);
            editorContentRef.current = part.report || '';
            if (liveEditorRef.current) liveEditorRef.current.setHTML(part.report || '');
            setIsFormExpanded(true);
            setConversationId(null);
            setReportMessageId(null);
            setRefreshTrigger(p => p + 1);
        }
    };


    const handleDismissInbox = async (id: string) => {
        if (!token) return;
        try {
            const res = await fetch('/api/sgsst/participacion-ipevar/inbox/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reportId: id })
            });
            if (res.ok) {
                const data = await res.json();
                setInboxPublico(data.inboxPublico || []);
                showToast({ message: 'Reporte archivado', status: 'success', severity: 'success' });
            }
        } catch (err) {
            showToast({ message: 'Error archivando el reporte', status: 'error' });
        }
    };

    const handleMarkProcessed = async (id: string) => {
        if (!token) return;
        try {
            const res = await fetch('/api/sgsst/participacion-ipevar/inbox/mark-processed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reportId: id })
            });
            if (res.ok) {
                const data = await res.json();
                setInboxPublico(data.inboxPublico || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleLoadInboxItem = (item: any) => {
        const newPart = createInitialParticipacion();
        newPart.id = crypto.randomUUID();
        newPart.title = `Reporte: ${item.trabajador.nombre}`;
        newPart.formData = {
            ...newPart.formData,
            tarea: item.data?.tarea || '',
            peligros: item.data?.peligros || '',
            controlesExistentes: item.data?.controlesExistentes || '',
            suficientes: item.data?.suficientes ?? true,
            sugeridoIngenieria: item.data?.sugeridoIngenieria || '',
            sugeridoAdministrativo: item.data?.sugeridoAdministrativo || '',
            sugeridoEPP: item.data?.sugeridoEPP || '',
        };
        newPart.trabajadoresList = [{ nombre: item.trabajador.nombre, cedula: item.trabajador.cedula, cargo: item.trabajador.cargo }];
        newPart.images = {
            foto1: item.data?.foto1 || null,
            foto2: item.data?.foto2 || null,
            foto3: item.data?.foto3 || null
        };
        newPart.video = item.data?.video || null;
        
        setParticipacionesList(prev => [...prev, newPart]);
        setActiveId(newPart.id);
        setActiveParticipacion(newPart);
        setGeneratedReport(null);
        editorContentRef.current = '';
        if (liveEditorRef.current) liveEditorRef.current.setHTML('');
        
        setIsInboxOpen(false);
        setIsFormExpanded(true);
        showToast({ message: 'Reporte cargado como nueva participación. Revise y complete la información.', status: 'info' });
        handleMarkProcessed(item.id);
    };

    const handleDummyData = () => {
        const newPart = createInitialParticipacion();
        newPart.title = 'Participación Simulada';
        newPart.formData = {
            ...newPart.formData,
            tarea: 'Mantenimiento de luminarias en bodega principal',
            peligros: 'Trabajo en alturas, riesgo eléctrico, caída de objetos',
            controlesExistentes: 'Uso de arnés, línea de vida, desenergización de línea',
            suficientes: false,
            sugeridoIngenieria: 'Instalar sistema de poleas para ascender equipos',
            sugeridoAdministrativo: 'Permiso de trabajo en alturas, señalización del área',
            sugeridoEPP: 'Casco con barbuquejo, guantes dieléctricos, botas de seguridad',
        };
        newPart.trabajadoresList = [{ nombre: 'Juan Pérez', cedula: '12345678' }];
        newPart.responsablesList = [{ nombre: 'Ana Gómez', cedula: '98765432', rol: 'Supervisor SST' }];
        newPart.images = {
            foto1: 'https://images.unsplash.com/photo-1541888946425-d81bb19480c5?auto=format&fit=crop&q=80&w=500',
            foto2: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=500',
            foto3: 'https://images.unsplash.com/photo-1621905235210-90805c862d22?auto=format&fit=crop&q=80&w=500'
        };
        setParticipacionesList(prev => [...prev, newPart]);
        setActiveId(newPart.id);
        setActiveParticipacion(newPart);
        setGeneratedReport(null);
        editorContentRef.current = '';
        if (liveEditorRef.current) liveEditorRef.current.setHTML('');
        showToast({ message: 'Datos de participación simulados generados exitosamente.', status: 'success', severity: 'success' });
    };

    const handleSaveData = async (silent = false) => {
        if (!token) return;
        
        const editedReport = editorContentRef.current || generatedReport || undefined;
        let pList = participacionesList;
        if (activeId) {
            pList = participacionesList.map(p => 
                p.id === activeId ? { ...activeParticipacion, report: editedReport } : p
            );
            setParticipacionesList(pList);
        }

        try {
            const res = await fetch('/api/sgsst/participacion-ipevar/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ participacionesList: pList })
            });
            if (res.ok && !silent) {
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            }
        } catch (err) {
            if (!silent) showToast({ message: 'Error al guardar los datos.', status: 'error' });
        }
    };

    const handleVoiceInput = () => {
        if (isListening) {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { }
            }
            setIsListening(false);
            setInterimText('');
            return;
        }

        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast({ message: 'Su navegador no soporta reconocimiento de voz. Intente con Chrome.', status: 'error' });
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            recognition.lang = 'es-CO';
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onstart = () => {
                setIsListening(true);
                setInterimText('');
            };

            recognition.onresult = (event: any) => {
                let currentInterim = '';
                let newFinal = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        newFinal += event.results[i][0].transcript;
                    } else {
                        currentInterim += event.results[i][0].transcript;
                    }
                }

                if (newFinal) {
                    setFormData(prev => ({
                        ...prev,
                        tarea: prev.tarea + (prev.tarea && !prev.tarea.endsWith(' ') ? ' ' : '') + newFinal
                    }));
                }
                setInterimText(currentInterim);
            };

            recognition.onerror = (event: any) => {
                console.error('Speech error:', event.error);
                setIsListening(false);
                setInterimText('');
            };

            recognition.onend = () => {
                setIsListening(false);
                setInterimText('');
            };

            recognition.start();
        } catch (e) {
            setIsListening(false);
            showToast({ message: 'Error al iniciar reconocimiento', status: 'error' });
        }
    };

    const handleInputChange = (field: string, value: string | boolean) => {
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
                    if (width > height) {
                        if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
                    } else {
                        if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    setImages(prev => ({ ...prev, [field]: resizedDataUrl }));
                };
                img.src = readerEvent.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = (field: string) => {
        setImages(prev => ({ ...prev, [field]: null }));
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
            if (videoElement.duration > 10.5) {
                showToast({ message: 'El video excede los 10 segundos permitidos.', status: 'error' });
                setIsVideoUploading(false);
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                setVideo(ev.target?.result as string);
                setIsVideoUploading(false);
                showToast({ message: 'Video de evidencia cargado.', status: 'success', severity: 'success' });
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

    const removeVideo = () => setVideo(null);

    const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-participacion-ipevar`, { headers: { Authorization: `Bearer ${token}` } });
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
            const response = await fetch('/api/sgsst/participacion-ipevar/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    formData,
                    trabajadoresList,
                    responsablesList,
                    images,
                    video,
                    modelName: selectedModel,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar el Reporte');
            }

            const data = await response.json();
            setGeneratedReport(data.report);
            editorContentRef.current = data.report;
            if (liveEditorRef.current) liveEditorRef.current.setHTML(data.report);
            setConversationId(null);
            setReportMessageId(null);
            setIsFormExpanded(false);
            setParticipacionesList(prev => prev.map(p => p.id === activeId ? { ...p, report: data.report } : p));
            showToast({ message: 'Reporte generado exitosamente', status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Generation error:', error);
            showToast({ message: error.message || 'Error al generar', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [formData, images, selectedModel, token, showToast]);

    const handleSave = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedReport;
        if (!contentToSave) return;
        if (!token) return;

        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-participacion-ipevar`, { headers: { Authorization: `Bearer ${token}` } });
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
                if (res.ok) {
                    setRefreshTrigger(prev => prev + 1);
                    showToast({ message: 'Reporte actualizado exitosamente', status: 'success', severity: 'success' });
                }
                return;
            }

            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    content: contentToSave,
                    title: `${activeParticipacion.title} - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-participacion-ipevar', `sgsst-participacion-ipevar-${activeId}`],
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setConversationId(data.conversationId);
                setReportMessageId(data.messageId);
                setRefreshTrigger(prev => prev + 1);
                
                const updatedList = participacionesList.map(p => p.id === activeId ? { ...p, report: contentToSave } : p);
                setParticipacionesList(updatedList);
                await fetch('/api/sgsst/participacion-ipevar/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ participacionesList: updatedList })
                });
                
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        }
    }, [editorContentRef.current, generatedReport, conversationId, reportMessageId, token, showToast]);

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
                showToast({ message: 'Reporte cargado correctamente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            showToast({ message: 'Error al cargar el reporte', status: 'error' });
        }
        setIsHistoryOpen(false);
    }, [token, showToast]);

    useAutoLoadReport({
        token,
        tags: ['sgsst-participacion-ipevar', `sgsst-participacion-ipevar-${activeId}`],
        generatedReport: generatedReport,
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
                onSaveLocal={() => handleSaveData(false)}
                hasContent={!!generatedReport}
                exportContent={editorContentRef.current || ''}
                exportFileName="Reporte_Actos_Condiciones"
                onDummy={handleDummyData}
                customSections={[
                    <div className="flex items-center gap-2">
                        <ToolbarButton
                            id="inbox-public"
                            onClick={() => setIsInboxOpen(!isInboxOpen)}
                            label={`Reportes (${inboxPublico.filter(i => i.status !== 'processed').length})`}
                            icon="inbox"
                            badge={inboxPublico.filter(i => i.status !== 'processed').length || undefined}
                            active={isInboxOpen}
                        />
                        <ToolbarButton
                            id="qr-portal"
                            onClick={() => setShowQrModal(true)}
                            label="Portal Público"
                            icon="qrcode"
                        />
                    </div>
                ]}
            />

            {/* ── Participaciones Quick Access ── */}
            <div className="rounded-2xl border border-border-medium bg-surface-tertiary p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-teal-600" />
                        <span className="text-xs font-black text-text-secondary uppercase tracking-widest">Listado de Participaciones</span>
                    </div>
                    <button
                        onClick={handleAddParticipacion}
                        className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 rounded-xl text-xs font-bold border border-teal-200 dark:border-teal-800 hover:bg-teal-100 transition-colors shadow-sm"
                    >
                        <Plus className="h-3.5 w-3.5" /> Nueva Participación
                    </button>
                </div>
                <div className="flex flex-wrap gap-2.5">
                    {participacionesList.map(p => (
                        <div key={p.id} className="group flex items-center gap-1">
                            <button
                                onClick={() => handleSelectParticipacion(p.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all border shadow-sm truncate max-w-[200px] ${
                                    activeId === p.id 
                                        ? "bg-teal-600 text-white border-teal-600 ring-2 ring-teal-100 dark:ring-teal-900/40" 
                                        : "bg-surface-primary text-text-primary border-border-medium hover:border-teal-400"
                                }`}
                            >
                                {p.title || 'Participación'}
                            </button>
                            <button
                                onClick={() => handleDeleteParticipacion(p.id)}
                                className="p-1.5 text-text-tertiary hover:text-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* History Panel */}
            {isHistoryOpen && (
                <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                    <ReportHistory onSelectReport={handleSelectReport} isOpen={isHistoryOpen} toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)} refreshTrigger={refreshTrigger} tags={['sgsst-participacion-ipevar', `sgsst-participacion-ipevar-${activeId}`]} />
                </div>
            )}

            {/* Inbox Panel */}
            {isInboxOpen && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/30 dark:bg-blue-900/10 overflow-hidden shadow-inner p-4 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg text-blue-800 dark:text-blue-400 flex items-center gap-2">
                            <Inbox className="w-5 h-5" /> Bandeja de Reportes Públicos
                        </h3>
                        <button onClick={() => setIsInboxOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    {inboxPublico.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <CheckCircle className="w-12 h-12 mx-auto text-green-400 mb-3 opacity-50" />
                            <p>No tienes reportes pendientes por revisar.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {inboxPublico.map((item, idx) => {
                                const isProcessed = item.status === 'processed';
                                return (
                                <div key={idx} className={`rounded-xl shadow border p-4 relative flex flex-col transition-colors ${isProcessed ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 opacity-70' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-300'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate pr-6 flex items-center gap-2" title={item.trabajador.nombre}>
                                                {item.trabajador.nombre}
                                                {isProcessed && <CheckCircle className="w-3 h-3 text-green-500" />}
                                            </h4>
                                            <p className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis w-[180px]">Cargo: {item.trabajador.cargo}</p>
                                        </div>
                                        <button onClick={() => handleDismissInbox(item.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className={`text-xs line-clamp-3 my-2 flex-grow italic ${isProcessed ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>"{item.data?.tarea || item.data?.descripcion}"</p>
                                    <div className="text-[10px] text-gray-400 mb-3 flex justify-between">
                                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</span>
                                        <span>📍 {item.data?.ubicacion || 'Sin ub.'}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleLoadInboxItem(item)}
                                        className={`w-full py-2 rounded font-semibold text-xs transition-colors flex items-center justify-center gap-2 ${isProcessed ? 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/50'}`}
                                    >
                                        {isProcessed ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />} 
                                        {isProcessed ? 'Cargar de nuevo' : 'Investigar este reporte'}
                                    </button>
                                </div>
                            )})}
                        </div>
                    )}
                </div>
            )}

            {/* QR Modal */}
            {showQrModal && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowQrModal(false)}>
                    <div
                        className="bg-white dark:bg-zinc-900 w-full max-w-[385px] min-h-[490px] md:min-h-[530px] max-h-[85vh] md:max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden border border-border-medium/60 flex flex-col animate-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}>
                        {/* Modal Header - Integrated Wappy Style (Compact) */}
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border-light dark:border-border-medium/30 relative shrink-0">
                            <div className="w-10 h-10 rounded-full border-2 border-teal-500/20 bg-teal-50/50 dark:bg-teal-950/30 flex items-center justify-center shrink-0 shadow-inner">
                                <QrCode className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div className="text-left flex-grow">
                                <h3 className="font-extrabold text-sm text-text-primary tracking-tight">Portal Público SGSST</h3>
                                <p className="text-[11px] text-text-secondary font-semibold">Participación IPEVAR</p>
                            </div>
                            <button
                                onClick={() => setShowQrModal(false)}
                                className="absolute top-4 right-5 p-1 rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-all duration-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body - Scrollable */}
                        <div className="p-5 flex flex-col bg-surface-primary dark:bg-zinc-900/10 space-y-4 overflow-y-auto flex-grow">
                            {/* Blue Instruction Card (Wappy Style - Compact) */}
                            <div className="bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 text-left w-full flex items-start gap-2.5 shrink-0">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                    <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">Portal IPEVAR</h4>
                                    <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 leading-relaxed font-semibold">
                                        Comparte este código o enlace. Los trabajadores podrán reportar y participar activamente en la identificación de peligros y evaluación de riesgos desde sus celulares.
                                    </p>
                                </div>
                            </div>

                            <div className="relative group flex flex-col items-center gap-2.5 py-2 shrink-0">
                                <div id="ipevar-portal-qr-container" className="p-3 border border-border-medium bg-white rounded-xl shadow-sm">
                                    <QRCodeSVG value={`${window.location.origin}/sgsst-public/ipevar/${companyInfo?._id || user?.id || (user as any)?._id || ''}`} size={115} className="mx-auto" level="H" includeMargin={false} />
                                </div>
                                <button
                                    onClick={() => downloadQR("Participacion_IPEVAR_SGSST", 'ipevar-portal-qr-container')}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg text-[10px] font-bold border border-teal-200 dark:border-teal-900/50 hover:bg-teal-100 transition-colors shadow-sm cursor-pointer shrink-0"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Descargar QR
                                </button>
                            </div>

                            <div className="w-full space-y-1.5 pt-1 shrink-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary opacity-70 text-center">Enlace de acceso público</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        value={`${window.location.origin}/sgsst-public/ipevar/${companyInfo?._id || user?.id || (user as any)?._id || ''}`}
                                        className="flex-grow text-[10px] font-mono px-3 py-2.5 bg-surface-secondary dark:bg-zinc-800 border border-border-medium rounded-xl outline-none text-text-secondary"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/sgsst-public/ipevar/${companyInfo?._id || user?.id || (user as any)?._id || ''}`);
                                            showToast({ message: 'Enlace copiado al portapapeles', status: 'success', severity: 'success' });
                                        }}
                                        className="px-3.5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold rounded-xl transition-colors shadow-sm shrink-0"
                                    >
                                        Copiar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-gray-50 dark:bg-zinc-900/80 border-t border-border-light dark:border-border-medium flex justify-end shrink-0">
                            <button
                                onClick={() => setShowQrModal(false)}
                                className="px-5 py-1.5 rounded-lg font-bold text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-750 transition-all shadow-sm cursor-pointer">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Form */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button onClick={() => setIsFormExpanded(!isFormExpanded)} className="w-full flex items-center justify-between p-4 bg-surface-tertiary">
                    <div className="flex items-center gap-2">
                        {isFormExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        <AlertTriangle className="h-5 w-5 text-teal-600" />
                        <span className="font-semibold">Datos Participación IPEVAR</span>
                    </div>
                </button>

                {isFormExpanded && (
                    <div className="p-6 space-y-6">
                        {/* Personnel involved */}
                        <div className="space-y-4 border rounded-xl p-4 bg-surface-tertiary/20">
                            <h4 className="font-semibold text-text-primary text-sm">Personal Reportante / Involucrado</h4>
                            {trabajadoresList.map((trabajador, idx) => (
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
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
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
                                            className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
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
                                className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
                            >
                                <Plus className="h-4 w-4" /> Añadir Persona
                            </button>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <h4 className="font-semibold text-text-primary text-sm">Labor o Tarea Realizada</h4>
                            <input type="text" value={formData.tarea} onChange={e => handleInputChange('tarea', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary mt-1" placeholder="Ej: Soldadura de tubería..." />
                            
                            <h4 className="font-semibold text-text-primary text-sm mt-4">Peligros Identificados</h4>
                            <textarea rows={3} value={formData.peligros} onChange={e => handleInputChange('peligros', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary mt-1" placeholder="Describe los peligros..."></textarea>
                            
                            <h4 className="font-semibold text-text-primary text-sm mt-4">Controles Existentes</h4>
                            <textarea rows={2} value={formData.controlesExistentes} onChange={e => handleInputChange('controlesExistentes', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary mt-1" placeholder="Ej: Uso de guantes..."></textarea>
                            
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-medium">¿Son suficientes los controles?</label>
                                <div className="w-32">
                                    <SingleSelect value={formData.suficientes ? 'Sí' : 'No'} onChange={val => handleInputChange('suficientes', val === 'Sí')} placeholder="Seleccione..." options={['Sí', 'No']} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <h4 className="font-semibold text-text-primary text-sm">Controles Sugeridos</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-500">Ingeniería</label>
                                    <textarea rows={3} placeholder="Ej: Guardas, sensores, ventilación..." value={formData.sugeridoIngenieria} onChange={e => handleInputChange('sugeridoIngenieria', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"></textarea>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-500">Administrativos</label>
                                    <textarea rows={3} placeholder="Ej: Capacitación, señalización, rotación..." value={formData.sugeridoAdministrativo} onChange={e => handleInputChange('sugeridoAdministrativo', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"></textarea>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-500">Elementos de Protección (EPP)</label>
                                    <textarea rows={3} placeholder="Ej: Casco, guantes, protección auditiva..." value={formData.sugeridoEPP} onChange={e => handleInputChange('sugeridoEPP', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"></textarea>
                                </div>
                            </div>
                        </div>

                        {/* Evidencia Fotográfica */}
                        <div className="space-y-3 pt-4 border-t border-border-medium">
                            <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">Evidencia Fotográfica</h4>
                            <div className="flex flex-col md:flex-row gap-4 w-full">
                                {['foto1', 'foto2', 'foto3'].map((imgKey, index) => (
                                    <div key={imgKey} className="flex-1">
                                        {images[imgKey] ? (
                                            <div className="relative rounded-xl overflow-hidden border">
                                                <img src={images[imgKey] as string} alt={`Evidencia ${index + 1}`} className="w-full h-48 object-cover" />
                                                <button onClick={() => removeImage(imgKey)} className="absolute top-2 right-2 p-1 bg-red-500 rounded-full text-white shadow-md">
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center w-full h-48 border-2 border-dashed border-teal-200 bg-teal-50/10 hover:bg-teal-50/30 transition-colors relative cursor-pointer group rounded-xl">
                                                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(imgKey, e)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                                <Camera className="h-10 w-10 text-teal-600/50 group-hover:scale-110 transition-transform duration-300" />
                                                <div className="absolute bottom-4 text-xs font-semibold text-teal-700/60">Cargar Foto {index + 1}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Video Evidence */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                    <Film className="h-4 w-4 text-teal-600" /> Video de Evidencia Dinámica (Opcional)
                                </h4>
                                <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold uppercase">Máximo 10 Segundos</span>
                            </div>

                            <div className="bg-surface-tertiary/10 border-2 border-dashed border-teal-200 rounded-2xl p-6 transition-all hover:bg-surface-tertiary/20">
                                {!video ? (
                                    <div className="flex flex-col items-center justify-center space-y-3">
                                        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                                            {isVideoUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Video className="h-8 w-8" />}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-semibold text-text-primary">Sube evidencia dinámica en video</p>
                                            <p className="text-xs text-text-secondary mt-1">Permite a la IA validar comportamientos y condiciones en tiempo real</p>
                                        </div>
                                        <label className="cursor-pointer bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95">
                                            {isVideoUploading ? 'Procesando...' : 'Seleccionar Video'}
                                            <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isVideoUploading} />
                                        </label>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-md mx-auto shadow-2xl border-2 border-teal-400">
                                            <video src={video} controls className="w-full h-full" />
                                            <button onClick={removeVideo} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 transition-colors z-10">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <p className="text-center text-xs text-teal-600 font-medium bg-teal-50 py-2 rounded-lg border border-teal-100 italic">
                                            Evidencia de video lista para análisis multimodal
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Additional info with dictation */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-teal-600" /> Notas adicionales del Analista (Opcional)
                                </h4>
                                <button
                                    onClick={handleVoiceInput}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow border flex items-center gap-2 ${isListening ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-surface-secondary hover:bg-surface-hover text-text-primary border-border-light'}`}
                                >
                                    <span className="relative flex h-3 w-3">
                                        {isListening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                                        <span className={`relative inline-flex rounded-full h-3 w-3 ${isListening ? 'bg-red-500' : 'bg-teal-600'}`}></span>
                                    </span>
                                    {isListening ? 'Escuchando...' : 'Activar Micrófono'}
                                </button>
                            </div>
                            <textarea
                                value={formData.actividadGlobal || ''}
                                onChange={e => {
                                    if (!isListening) {
                                        handleInputChange('actividadGlobal', e.target.value);
                                    }
                                }}
                                readOnly={isListening}
                                className={`w-full rounded-xl border-2 ${isListening ? 'border-solid border-red-300 bg-red-50/10 focus:border-red-400' : 'border-dashed border-teal-200 bg-teal-50/10 focus:bg-teal-50/20 focus:border-teal-400'} p-4 text-sm text-text-primary min-h-[120px] resize-y transition-colors focus:outline-none`}
                                placeholder="Notas internas sobre este hallazgo..."
                            />
                        </div>

                        {/* Bottom generate button */}
                        <div className="flex justify-center pt-4 gap-4">
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="group flex items-center px-4 py-2.5 bg-teal-600 hover:bg-teal-700 border border-teal-600 text-white rounded-full transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                            >
                                {isGenerating ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-5 w-5" />
                                )}
                                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">Generar Análisis IA</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Generated Report Editor */}
                <CollapsibleReportBox onSave={handleSave}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                    title="Participación IPEVAR"
                    icon={<AlertTriangle className="h-5 w-5 text-teal-600" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_ParticipacionIPEVAR"
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

export default ParticipacionIPEVAR;
