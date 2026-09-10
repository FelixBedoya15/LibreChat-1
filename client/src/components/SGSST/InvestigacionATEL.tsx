import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UpgradeWall } from './UpgradeWall';
import { QRCodeSVG } from 'qrcode.react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '~/utils';
import {
    Sparkles,
    Save,
    Loader2,
    ChevronDown,
    ChevronRight,
    Camera,
    Image as ImageIcon,
    X,
    FileText,
    Plus,
    Trash2,
    Inbox,
    MessageSquare,
    AlertTriangle,
    Users,
    UserCheck,
    ClipboardList,
    Video,
    Film,
    Link,
    QrCode,
    Check,
    Trash2,
    ShieldAlert, Download, Info } from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ExportDropdown from './ExportDropdown';
import SGSSTToolbar from './SGSSTToolbar';
import SingleSelect from './SingleSelect';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import ModelSelector from './ModelSelector';
import { useAutoLoadReport } from './useAutoLoadReport';
import CollapsibleReportBox from './CollapsibleReportBox';

// ─── Worker Autocomplete (identical to PermisoAlturas) ────────────────────────
const WorkerAutocomplete = ({
    value,
    onChange,
    onSelect,
    data,
    searchKey,
    placeholder,
    className,
    wrapperClassName,
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
                            <div className="text-xs text-text-secondary mt-0.5">CC: {w.identificacion} {w.cargo ? `• ${w.cargo}` : ''}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// ─── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
    <div className="flex items-center gap-3 pb-3 mb-4 border-b border-border-medium">
        <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-xl text-teal-600">
            {icon}
        </div>
        <div>
            <h4 className="font-semibold text-text-primary text-sm">{title}</h4>
            {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
        </div>
    </div>
);

// ─── Catalogo Tipo de Vinculacion (SGSST) ──────────────────────────────────
const VINCULACION_OPTIONS_ATEL = [
    { label: '🏢 SECTOR PRIVADO', value: '', isHeader: true },
    'Contrato laboral a término indefinido',
    'Contrato laboral a término fijo',
    'Contrato laboral por obra o labor',
    'Trabajo ocasional, accidental o transitorio',
    'Trabajador en misión — Empresa de Servicios Temporales',
    'Contrato de aprendizaje',
    'Práctica, pasantía o judicatura',
    'Prestación de servicios — persona natural',
    { label: '🏛️ SECTOR PÚBLICO', value: '', isHeader: true },
    'Empleado público de carrera administrativa',
    'Empleado público con nombramiento provisional',
    'Empleado público de libre nombramiento y remoción',
    'Empleado público de periodo fijo',
    'Empleado público en planta temporal',
    'Trabajador oficial',
    'Miembro de corporación pública o de elección popular',
    'Supernumerario',
    'Contratista de prestación de servicios — persona natural',
    'Práctica, pasantía o judicatura en entidad pública',
    { label: '🤝 OTRAS VINCULACIONES', value: '', isHeader: true },
    'Trabajador independiente',
    'Trabajador cooperado',
    'Voluntario',
    'Otro tipo de vinculación',
    'No informa',
];

const normalizeVinculacionAtel = (val: string): string => {
    const map: Record<string, string> = {
        'Indefinido': 'Contrato laboral a término indefinido',
        'Término indefinido': 'Contrato laboral a término indefinido',
        'Fijo': 'Contrato laboral a término fijo',
        'Término fijo': 'Contrato laboral a término fijo',
        'Obra o labor': 'Contrato laboral por obra o labor',
        'Prestación de servicios': 'Prestación de servicios — persona natural',
        'Aprendizaje': 'Contrato de aprendizaje',
        'Aprendizaje (SENA)': 'Contrato de aprendizaje',
        'Temporal': 'Trabajador en misión — Empresa de Servicios Temporales',
        'Temporal/ETT': 'Trabajador en misión — Empresa de Servicios Temporales',
    };
    return map[val] || val;
};

// ─── Main Component ────────────────────────────────────────────────────────────
const InvestigacionATEL = () => {
    const { t } = useTranslation();
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isAiImportLoading, setIsAiImportLoading] = useState(false);
    const [pendingFileData, setPendingFileData] = useState<{ dataUrl: string; name: string; type: string } | null>(null);

    // ── Helpers to get initial blank states ──
    const getInitialFormData = () => ({
        tipoEvento: 'Incidente',
        fechaEvento: new Date().toISOString().split('T')[0],
        horaEvento: '08:00',
        lugarEvento: '',
        departamento: '',
        municipio: '',
        afectadoNombre: '',
        afectadoCedula: '',
        afectadoCargo: '',
        afectadoEps: '',
        afectadoArl: '',
        tipoContrato: 'Contrato laboral a término indefinido',
        jornadaLaboral: 'Diurna',
        experienciaLaboral: '',
        tiempoEnCargo: '',
        actividadMomento: '',
        descripcionHechos: '',
        consecuencias: '',
        diasIncapacidad: '0',
        naturalezaLesion: '',
        agenteCausal: '',
        parteCuerpo: '',
        foto1Desc: '',
        foto2Desc: '',
        foto3Desc: '',
        foto4Desc: '',
    });

    const getInitialEquipoList = () => [
        { nombre: '', cedula: '', rol: 'Jefe Inmediato / Supervisor' },
        { nombre: '', cedula: '', rol: 'Representante COPASST / Vigía' },
        { nombre: '', cedula: '', rol: 'Encargado SST / HSEQ' },
    ];

    const getInitialTestigosList = () => [
        { nombre: '', cedula: '', cargo: '', testimonio: '' }
    ];

    // ── Multiple Investigations State ──
    const [investigaciones, setInvestigaciones] = useState<any[]>([]);
    const [activeInvestId, setActiveInvestId] = useState<string | null>(null);
    const [isLoadingList, setIsLoadingList] = useState(false);

    // ── Form State ──
    const [formData, setFormData] = useState(getInitialFormData());
    const [images, setImages] = useState<{ [key: string]: string | null }>({
        foto1: null,
        foto2: null,
        foto3: null,
        foto4: null
    });
    const [video, setVideo] = useState<string | null>(null);
    const [isVideoUploading, setIsVideoUploading] = useState(false);
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [inboxTestimonios, setInboxTestimonios] = useState<any[]>([]);
    const [showInbox, setShowInbox] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);

    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/company-info', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(info => { if (info && info.companyName) setCompanyInfo(info); })
        .catch(() => {});
    }, [token]);

    const fetchInvestigationsList = async (selectId?: string) => {
        if (!token) return;
        setIsLoadingList(true);
        try {
            const res = await fetch('/api/sgsst/investigacion-atel/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInvestigaciones(data.list || []);
                if (data.list?.length > 0) {
                    const targetId = selectId || data.list[0].id;
                    setActiveInvestId(targetId);
                } else {
                    const newId = crypto.randomUUID();
                    setActiveInvestId(newId);
                    setFormData(getInitialFormData());
                    setEquipoList(getInitialEquipoList());
                    setTestigosList(getInitialTestigosList());
                    setImages({ foto1: null, foto2: null, foto3: null, foto4: null });
                    setVideo(null);
                    setInboxTestimonios([]);
                }
            }
        } catch (err) {
            console.error('Error fetching list', err);
        } finally {
            setIsLoadingList(false);
        }
    };

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

    // Equipo Investigador (Res 1401/2007 art. 7: jefe inmediato + COPASST + encargado SST)
    const [equipoList, setEquipoList] = useState([
        { nombre: '', cedula: '', rol: 'Jefe Inmediato / Supervisor' },
        { nombre: '', cedula: '', rol: 'Representante COPASST / Vigía' },
        { nombre: '', cedula: '', rol: 'Encargado SST / HSEQ' },
    ]);

    // Testigos
    const [testigosList, setTestigosList] = useState([
        { nombre: '', cedula: '', cargo: '', testimonio: '' }
    ]);

    const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);

    // UI State
    const [selectedModel, setSelectedModel] = useState(user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');

    React.useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user?.personalization?.geminiModels?.sstManagement]);

    const [generatedObjectives, setGeneratedObjectives] = useState<string | null>(null);
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

    // Fetch workers from perfil sociodemografico
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

    // Load investigations list on mount
    useEffect(() => {
        if (token) {
            fetchInvestigationsList();
        }
    }, [token]);

    // Fetch saved form data when activeInvestId changes
    useEffect(() => {
        if (!token || !activeInvestId) return;
        
        fetch(`/api/sgsst/investigacion-atel/data?id=${activeInvestId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => {
                if (res.status === 404) return null;
                return res.json();
            })
            .then(data => {
                if (!data) return;
                
                setFormData(getInitialFormData());
                
                if (Object.keys(data.formData || {}).length > 0) {
                    setFormData(prev => ({ ...prev, ...data.formData }));
                }
                setEquipoList(data.equipoList?.length ? data.equipoList : getInitialEquipoList());
                setTestigosList(data.testigosList?.length ? data.testigosList : getInitialTestigosList());
                setImages(data.images || { foto1: null, foto2: null, foto3: null, foto4: null });
                setVideo(data.video || null);
                setInboxTestimonios(data.inboxTestimonios || []);
            })
            .catch(err => console.error('Error fetching investigacion atel data', err));
    }, [token, activeInvestId]);

    // ── Save Form Data ──
    const handleSaveData = async (silent = false) => {
        if (!token || !activeInvestId) return;
        try {
            const res = await fetch('/api/sgsst/investigacion-atel/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ id: activeInvestId, formData, equipoList, testigosList, images, video })
            });
            if (res.ok) {
                fetchInvestigationsList(activeInvestId);
                if (!silent) {
                    showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
                }
            }
        } catch (err) {
            if (!silent) showToast({ message: 'Error al guardar los datos.', status: 'error' });
        }
    };

    const handleAddInvestigacion = () => {
        const newId = crypto.randomUUID();
        setActiveInvestId(newId);
        setFormData(getInitialFormData());
        setEquipoList(getInitialEquipoList());
        setTestigosList(getInitialTestigosList());
        setImages({ foto1: null, foto2: null, foto3: null, foto4: null });
        setVideo(null);
        setInboxTestimonios([]);
        setIsFormExpanded(true);
        
        setInvestigaciones(prev => [
            {
                id: newId,
                tipoEvento: 'Incidente',
                fechaEvento: new Date().toISOString().split('T')[0],
                afectadoNombre: 'Borrador (Sin guardar)',
                updatedAt: new Date()
            },
            ...prev
        ]);
        showToast({ message: 'Nueva investigación creada. Complete los datos y guarde.', status: 'info' });
    };

    const handleDeleteInvestigacion = async (idToDelete: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('¿Está seguro de eliminar esta investigación? Esta acción no se puede deshacer.')) return;
        
        try {
            const res = await fetch(`/api/sgsst/investigacion-atel/delete/${idToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showToast({ message: 'Investigación eliminada.', status: 'success', severity: 'success' });
                const remaining = investigaciones.filter(i => i.id !== idToDelete);
                if (activeInvestId === idToDelete) {
                    if (remaining.length > 0) {
                        fetchInvestigationsList(remaining[0].id);
                    } else {
                        fetchInvestigationsList();
                    }
                } else {
                    fetchInvestigationsList(activeInvestId || undefined);
                }
            } else {
                setInvestigaciones(prev => prev.filter(i => i.id !== idToDelete));
                if (activeInvestId === idToDelete) {
                    fetchInvestigationsList();
                }
                showToast({ message: 'Investigación borrada localmente.', status: 'info' });
            }
        } catch (err) {
            showToast({ message: 'Error al eliminar la investigación.', status: 'error' });
        }
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const base64Reader = new FileReader();
        base64Reader.onload = (base64Event) => {
            setPendingFileData({
                dataUrl: base64Event.target?.result as string,
                name: file.name,
                type: file.type || 'application/octet-stream'
            });
            setIsConfirmModalOpen(true);
        };
        base64Reader.readAsDataURL(file);
        if (e.target) e.target.value = '';
    };

    const handleConfirmAiImport = async () => {
        if (!pendingFileData) return;
        setIsConfirmModalOpen(false);
        setIsAiImportLoading(true);
        try {
            const res = await fetch('/api/sgsst/investigacion-atel/import-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    fileData: pendingFileData.dataUrl,
                    fileName: pendingFileData.name,
                    mimeType: pendingFileData.type,
                    modelName: selectedModel
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Error en el servidor');
            }

            const data = await res.json();
            if (data.success && data.formData) {
                setFormData(prev => ({
                    ...prev,
                    ...data.formData
                }));
                if (data.equipoList && Array.isArray(data.equipoList) && data.equipoList.length > 0) {
                    setEquipoList(data.equipoList);
                }
                if (data.testigosList && Array.isArray(data.testigosList) && data.testigosList.length > 0) {
                    setTestigosList(data.testigosList);
                }
                showToast({
                    message: `Datos del reporte/FURAT extraídos e importados exitosamente.`,
                    status: 'success',
                    severity: 'success'
                });
            }
        } catch (err: any) {
            console.error('Error importing with AI:', err);
            showToast({
                message: `Error al procesar con IA: ${err.message}`,
                status: 'error',
                severity: 'error'
            });
        } finally {
            setIsAiImportLoading(false);
            setPendingFileData(null);
        }
    };

    const handleDummyData = () => {
        const dummy = generateDummyData.investigacion();
        setFormData(prev => ({
            ...prev,
            tipoEvento: 'Accidente Leve', 
            fechaEvento: dummy.fechaEvento,
            horaEvento: dummy.horaEvento,
            lugarEvento: dummy.lugarEvento,
            departamento: 'Antioquia',
            municipio: 'Medellín',
            afectadoNombre: dummy.nombreAccidentado,
            afectadoCedula: dummy.cedula,
            afectadoCargo: dummy.cargo,
            afectadoEps: 'SURA',
            afectadoArl: 'SURA',
            tipoContrato: 'Indefinido',
            jornadaLaboral: dummy.jornadaNormal,
            experienciaLaboral: '5',
            tiempoEnCargo: dummy.tiempoCargo,
            actividadMomento: dummy.laborHabitual === 'Sí' ? 'Labor habitual en bodega' : 'Otra labor',
            descripcionHechos: dummy.descripcionDetallada,
            consecuencias: 'Incapacidad temporal, pausa en la producción.',
            diasIncapacidad: '3',
            naturalezaLesion: 'Esguince / Torcedura',
            agenteCausal: dummy.agenteLesion,
            parteCuerpo: dummy.parteCuerpo,
        }));
        setEquipoList(dummy.equipoList.map((item: any) => ({ nombre: item.nombre, cedula: item.cedula, rol: item.cargo })));
        setTestigosList(dummy.testigosList.map((item: any) => ({ nombre: item.nombre, cedula: item.cedula, cargo: item.cargo, testimonio: item.version })));
        showToast({ message: 'Datos de investigación simulados generados exitosamente.', status: 'success', severity: 'success' });
    };

    // ── Voice Input (identical to PermisoAlturas) ──
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
            recognition.onstart = () => { setIsListening(true); setInterimText(''); };
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
                        descripcionHechos: prev.descripcionHechos + (prev.descripcionHechos && !prev.descripcionHechos.endsWith(' ') ? ' ' : '') + newFinal
                    }));
                }
                setInterimText(currentInterim);
            };
            recognition.onerror = (event: any) => { console.error('Speech error:', event.error); setIsListening(false); setInterimText(''); };
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

    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
            showToast({ message: 'El video es demasiado pesado (Máximo 20MB).', status: 'error' });
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
            reader.onload = (readerEvent) => {
                setVideo(readerEvent.target?.result as string);
                setIsVideoUploading(false);
                showToast({ message: 'Video de evidencia cargado correctamente.', status: 'success', severity: 'success' });
            };
            reader.onerror = () => {
                setIsVideoUploading(false);
                showToast({ message: 'Error al leer el archivo de video.', status: 'error' });
            };
            reader.readAsDataURL(file);
        };

        videoElement.onerror = () => {
            setIsVideoUploading(false);
            showToast({ message: 'Error al procesar el archivo de video.', status: 'error' });
        };

        videoElement.src = URL.createObjectURL(file);
    };

    const removeVideo = () => setVideo(null);


    const handleDismissTestimony = async (id: string) => {
        try {
            const res = await fetch('/api/sgsst/investigacion-atel/inbox/testimonio/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ reportId: id })
            });
            const data = await res.json();
            if (res.ok) {
                setInboxTestimonios(data.inboxTestimonios);
                showToast({ message: 'Testimonio descartado.', status: 'info' });
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleAcceptTestimony = async (item: any) => {
        // Add to testigosList
        const newWitness = {
            nombre: item.testigo.nombre,
            cedula: item.testigo.cedula,
            cargo: item.testigo.cargo,
            testimonio: item.testimonio
        };
        setTestigosList(prev => [...prev, newWitness]);
        
        // Also add media to images if slot available
        if (item.media?.foto1) {
            setImages(prev => {
                const next = { ...prev };
                const freeSlot = Object.keys(next).find(k => !next[k]);
                if (freeSlot) next[freeSlot] = item.media.foto1;
                return next;
            });
        }

        // Remove from inbox
        await handleDismissTestimony(item.id);
        showToast({ message: 'Testimonio incorporado a la investigación.', status: 'success', severity: 'success' });
    };

    // ── Image Upload (identical to PermisoAlturas) ──
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

    // ── Generate Report ──
    const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-investigacion-atel`, { headers: { Authorization: `Bearer ${token}` } });
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
            const response = await fetch('/api/sgsst/investigacion-atel/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    formData,
                    equipoList,
                    testigosList,
                    images,
                    video,
                    modelName: selectedModel,
                    userName: user?.name,
                }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al generar el informe');
            }
            const data = await response.json();
            setGeneratedObjectives(data.report);
            editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId(null);
            setReportMessageId(null);
            setIsFormExpanded(false);
            showToast({ message: 'Informe de investigación generado exitosamente', status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Generation error:', error);
            showToast({ message: error.message || 'Error al generar', status: 'error' });
        } finally {
            setIsGenerating(false);
        }
    }, [formData, equipoList, testigosList, images, selectedModel, token, showToast]);

    // ── Save Report ──
    const handleSave = useCallback(async () => {
        const contentToSave = editorContentRef.current || generatedObjectives;
        if (!contentToSave || !token) return;
        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-investigacion-atel`, { headers: { Authorization: `Bearer ${token}` } });
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
                    showToast({ message: 'Informe actualizado exitosamente', status: 'success', severity: 'success' });
                }
                return;
            }
            const res = await fetch('/api/sgsst/investigacion-atel/save-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    content: contentToSave,
                    title: `Investigación ATEL - ${formData.tipoEvento} - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-investigacion-atel'],
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setConversationId(data.conversationId);
                setReportMessageId(data.messageId);
                setRefreshTrigger(prev => prev + 1);
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, status: 'error' });
        }
    }, [editorContentRef.current, generatedObjectives, conversationId, reportMessageId, token, showToast, formData]);

    // ── Load Report from History ──
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
                setGeneratedObjectives(lastMsg.text);
                editorContentRef.current = lastMsg.text;
            liveEditorRef.current?.setHTML(lastMsg.text);
                setConversationId(selectedConvoId);
                setReportMessageId(lastMsg.messageId);
            
            setIsFormExpanded(false);
                showToast({ message: 'Informe cargado correctamente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            showToast({ message: 'Error al cargar el informe', status: 'error' });
        }
        setIsHistoryOpen(false);
    }, [token, showToast]);

    useAutoLoadReport({
        token,
        tags: ['sgsst-investigacion-atel'],
        generatedReport: generatedObjectives,
        handleSelectReport
    });

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Main Toolbar */}
            <div className="flex flex-col items-center gap-6 mb-6">
                <div className="flex items-center gap-4 text-center">
                    <div className="p-3 rounded-2xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 shadow-sm">
                        <ShieldAlert className="h-8 w-8" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-text-primary tracking-tight">Investigación de Accidentes e Incidentes (ATEL)</h2>
                        <p className="text-sm text-text-secondary font-medium">Resolución 1401 de 2007</p>
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
                    hasContent={!!(editorContentRef.current || generatedObjectives)}
                    exportContent={editorContentRef.current || generatedObjectives || ''}
                    exportFileName="Investigacion_ATEL"
                    onDummy={handleDummyData}
                    onImportExcel={() => fileInputRef.current?.click()}
                    importExcelLabel="Importar Archivo"
                    importExcelTitle="Importar desde FURAT (Excel, Word, PDF, Imagen o Texto)"
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
                        tags={['sgsst-investigacion-atel']}
                    />
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
                                <p className="text-[11px] text-text-secondary font-semibold">Investigación ATEL - Testimonios</p>
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
                                    <h4 className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">Radicación de Testimonios</h4>
                                    <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 leading-relaxed font-semibold">
                                        Comparte este código o enlace para que los testigos radiquen su versión desde sus celulares de forma ágil y segura.
                                    </p>
                                </div>
                            </div>

                            <div className="relative group flex flex-col items-center gap-2.5 py-2 shrink-0">
                                <div id="atel-portal-qr-container" className="p-3 border border-border-medium bg-white rounded-xl shadow-sm">
                                    <QRCodeSVG value={`${window.location.origin}/sgsst-public/atel-testimonio/${companyInfo?._id || user?.id || user?._id || ''}?investigacionId=${activeInvestId || ''}`} size={115} className="mx-auto" level="H" includeMargin={false} />
                                </div>
                                <button
                                    onClick={() => downloadQR("Investigacion_ATEL_Testimonios_SGSST", 'atel-portal-qr-container')}
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
                                        value={`${window.location.origin}/sgsst-public/atel-testimonio/${companyInfo?._id || user?.id || user?._id || ''}?investigacionId=${activeInvestId || ''}`}
                                        className="flex-grow text-[10px] font-mono px-3 py-2.5 bg-surface-secondary dark:bg-zinc-800 border border-border-medium rounded-xl outline-none text-text-secondary"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/sgsst-public/atel-testimonio/${companyInfo?._id || user?.id || user?._id || ''}?investigacionId=${activeInvestId || ''}`);
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

            {/* Listado de Investigaciones (Cards Grid) */}
            <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        <span className="text-sm font-black uppercase tracking-widest text-text-primary">
                            Historial de Investigaciones
                        </span>
                        {isLoadingList && <span className="text-xs text-text-secondary animate-pulse">(Cargando...)</span>}
                    </div>
                    <button
                        onClick={handleAddInvestigacion}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 text-teal-700 dark:text-teal-300 rounded-xl text-xs font-black border border-teal-500/20 dark:border-teal-400/20 hover:from-teal-500/20 hover:to-cyan-500/20 hover:border-teal-500/40 transition-all shadow-sm cursor-pointer"
                    >
                        <Plus className="h-4 w-4" /> Nueva Investigación
                    </button>
                </div>
                
                {investigaciones.length === 0 ? (
                    <div className="text-center py-6 text-text-secondary text-sm border-2 border-dashed border-border-medium/50 rounded-xl">
                        No hay investigaciones registradas. Registre un accidente en Estadísticas ATEL o haga clic en "Nueva Investigación".
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {investigaciones.map(item => {
                            const isActive = activeInvestId === item.id;
                            const isAT = item.tipoEvento?.includes('Accidente') || item.tipoEvento === 'AT';
                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "group relative flex flex-col justify-between p-4 rounded-2xl transition-all duration-300 cursor-pointer border select-none h-[110px] shadow-sm hover:shadow-md",
                                        isActive 
                                            ? "bg-gradient-to-br from-teal-900 via-teal-850 to-cyan-900 text-white border-transparent shadow-[0_4px_15px_rgba(20,184,166,0.25)] scale-[1.02]" 
                                            : "bg-surface-primary/70 text-text-secondary border-border-medium/60 hover:border-teal-500/50 hover:text-text-primary hover:bg-surface-secondary/90 hover:scale-[1.01] dark:bg-surface-primary/20"
                                    )}
                                    onClick={() => setActiveInvestId(item.id)}
                                >
                                    {isActive && (
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 to-cyan-400" />
                                    )}
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                                isActive
                                                    ? "bg-white/20 text-white"
                                                    : isAT 
                                                        ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" 
                                                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                            )}>
                                                {item.tipoEvento}
                                            </span>
                                            
                                            <button
                                                onClick={(e) => handleDeleteInvestigacion(item.id, e)}
                                                className={cn(
                                                    "p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
                                                    isActive ? "text-red-300 hover:text-red-100 hover:bg-white/10" : "text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                )}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <h5 className={cn("font-bold text-xs line-clamp-1 mt-1", isActive ? "text-white" : "text-text-primary")}>
                                            Afectado: {item.afectadoNombre || 'Sin asignar'}
                                        </h5>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] opacity-80 mt-2">
                                        <span>{item.fechaEvento || 'Sin fecha'}</span>
                                        <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('es-CO') : ''}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Form Container ── */}
            <div className={cn("rounded-2xl border border-border-medium bg-surface-secondary shadow-sm transition-all", isFormExpanded ? "overflow-visible" : "overflow-hidden")}>
                <button
                    onClick={() => setIsFormExpanded(!isFormExpanded)}
                    className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                    <div className="flex items-center gap-2">
                        {isFormExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        <ShieldAlert className="h-5 w-5 text-red-500" />
                        <span className="font-semibold">Datos para la Investigación de Accidente/Incidente</span>
                        <span className="text-xs text-text-secondary ml-2">Resolución 1401 de 2007</span>
                    </div>
                </button>

                {isFormExpanded && (
                    <div className="grid grid-cols-1 gap-8 p-6">


                        {/* ── SECCIÓN 1: Datos del Evento ── */}
                        <div className="border rounded-xl p-5 bg-surface-tertiary/20 space-y-4">
                            <SectionHeader
                                icon={<AlertTriangle className="h-4 w-4" />}
                                subtitle="Tipo, fecha, hora y lugar donde ocurrió el evento"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Tipo de Evento</label>
                                    <SingleSelect value={formData.tipoEvento} onChange={val => handleInputChange('tipoEvento', val)} placeholder="Seleccione..." options={['Incidente', 'Accidente Leve', 'Accidente Grave', 'Accidente Mortal']} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Fecha del Evento</label>
                                    <input type="date" value={formData.fechaEvento} onChange={e => handleInputChange('fechaEvento', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Hora del Evento</label>
                                    <input type="time" value={formData.horaEvento} onChange={e => handleInputChange('horaEvento', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1 md:col-span-1">
                                    <label className="text-sm font-medium">Lugar / Área del Evento</label>
                                    <input type="text" value={formData.lugarEvento} onChange={e => handleInputChange('lugarEvento', e.target.value)} placeholder="Ej: Planta de producción, Piso 2" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Departamento</label>
                                    <input type="text" value={formData.departamento} onChange={e => handleInputChange('departamento', e.target.value)} placeholder="Ej: Antioquia" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Municipio</label>
                                    <input type="text" value={formData.municipio} onChange={e => handleInputChange('municipio', e.target.value)} placeholder="Ej: Medellín" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Actividad que realizaba al momento del evento</label>
                                <input type="text" value={formData.actividadMomento} onChange={e => handleInputChange('actividadMomento', e.target.value)} placeholder="Ej: Instalación de tubería en altura, manejo de maquinaria..." className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                            </div>
                        </div>

                        {/* ── SECCIÓN 2: Trabajador Afectado ── */}
                        <div className="border rounded-xl p-5 bg-surface-tertiary/20 space-y-4">
                            <SectionHeader
                                icon={<UserCheck className="h-4 w-4" />}
                                subtitle="Información laboral y personal del colaborador involucrado"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1 md:col-span-1">
                                    <label className="text-sm font-medium">Nombre completo</label>
                                    <WorkerAutocomplete
                                        value={formData.afectadoNombre}
                                        onChange={(val) => handleInputChange('afectadoNombre', val)}
                                        onSelect={(w) => setFormData(prev => ({
                                            ...prev,
                                            afectadoNombre: w.nombre,
                                            afectadoCedula: w.identificacion,
                                            afectadoCargo: w.cargo || '',
                                            afectadoEps: w.eps || '',
                                            afectadoArl: w.arl || '',
                                        }))}
                                        data={availableWorkers}
                                        searchKey="nombre"
                                        placeholder="Nombre del afectado"
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Cédula</label>
                                    <WorkerAutocomplete
                                        value={formData.afectadoCedula}
                                        onChange={(val) => handleInputChange('afectadoCedula', val)}
                                        onSelect={(w) => setFormData(prev => ({
                                            ...prev,
                                            afectadoCedula: w.identificacion,
                                            afectadoNombre: prev.afectadoNombre || w.nombre,
                                            afectadoCargo: prev.afectadoCargo || w.cargo || '',
                                        }))}
                                        data={availableWorkers}
                                        searchKey="identificacion"
                                        placeholder="Cédula de ciudadanía"
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Cargo</label>
                                    <input type="text" value={formData.afectadoCargo} onChange={e => handleInputChange('afectadoCargo', e.target.value)} placeholder="Cargo en la empresa" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">EPS</label>
                                    <input type="text" value={formData.afectadoEps} onChange={e => handleInputChange('afectadoEps', e.target.value)} placeholder="EPS afiliada" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">ARL</label>
                                    <input type="text" value={formData.afectadoArl} onChange={e => handleInputChange('afectadoArl', e.target.value)} placeholder="ARL afiliada" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Tipo de vinculación</label>
                                    <SingleSelect value={normalizeVinculacionAtel(formData.tipoContrato)} onChange={val => handleInputChange('tipoContrato', val)} placeholder="Seleccione..." options={VINCULACION_OPTIONS_ATEL} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Jornada laboral</label>
                                    <SingleSelect value={formData.jornadaLaboral} onChange={val => handleInputChange('jornadaLaboral', val)} placeholder="Seleccione..." options={['Diurna', 'Nocturna', 'Mixta', 'Por turnos']} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Experiencia laboral total (años)</label>
                                    <input type="text" value={formData.experienciaLaboral} onChange={e => handleInputChange('experienciaLaboral', e.target.value)} placeholder="Ej: 5" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Tiempo en el cargo actual</label>
                                    <input type="text" value={formData.tiempoEnCargo} onChange={e => handleInputChange('tiempoEnCargo', e.target.value)} placeholder="Ej: 8 meses" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                            </div>
                        </div>

                        {/* ── SECCIÓN 3: Descripción del Evento ── */}
                        <div className="border rounded-xl p-5 bg-surface-tertiary/20 space-y-4">
                            <SectionHeader
                                icon={<ClipboardList className="h-4 w-4" />}
                                subtitle="Narre los hechos antes, durante y después del accidente/incidente"
                            />
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-teal-600" /> Descripción de los Hechos (Dictado o Texto)
                                    </h4>
                                    <button
                                        onClick={handleVoiceInput}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow border flex items-center gap-2 ${isListening ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-surface-secondary hover:bg-surface-hover text-text-primary border-border-light'}`}
                                    >
                                        <span className="relative flex h-3 w-3">
                                            {isListening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                                            <span className={`relative inline-flex rounded-full h-3 w-3 ${isListening ? 'bg-red-500' : 'bg-teal-500'}`}></span>
                                        </span>
                                        {isListening ? 'Escuchando...' : 'Activar Micrófono'}
                                    </button>
                                </div>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    <strong>IMPORTANTE:</strong> Describa en detalle: <u>qué actividad se realizaba, cómo ocurrieron los hechos, qué sucedió antes/durante/después, quiénes estuvieron presentes, condiciones del lugar, herramientas utilizadas y consecuencias inmediatas.</u>
                                </p>
                                <textarea
                                    value={formData.descripcionHechos + (interimText ? (formData.descripcionHechos && !formData.descripcionHechos.endsWith(' ') ? ' ' : '') + interimText : '')}
                                    onChange={e => { if (!isListening) handleInputChange('descripcionHechos', e.target.value); }}
                                    readOnly={isListening}
                                    className={`w-full rounded-xl border-2 ${isListening ? 'border-solid border-red-300 bg-red-50/10 focus:border-red-400 focus:bg-red-50/20' : 'border-dashed border-teal-200 bg-teal-50/10 focus:bg-teal-50/30 focus:border-teal-400'} p-4 text-sm text-text-primary min-h-[160px] resize-y transition-colors focus:outline-none`}
                                    placeholder="Ej: El trabajador se encontraba realizando labores de... cuando súbitamente ocurrió..."
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Naturaleza de la lesión</label>
                                    <SingleSelect value={formData.naturalezaLesion} onChange={val => handleInputChange('naturalezaLesion', val)} placeholder="Seleccionar..." options={['Golpe / Contusión', 'Herida / Laceración', 'Fractura', 'Esguince / Torcedura', 'Quemadura', 'Amputación', 'Intoxicación', 'Electrocución', 'Trauma craneoencefálico', 'Sin lesión (Incidente)', 'Muerte', 'Otra']} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Parte del cuerpo afectada</label>
                                    <input type="text" value={formData.parteCuerpo} onChange={e => handleInputChange('parteCuerpo', e.target.value)} placeholder="Ej: Mano derecha, rodilla izquierda" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium">Días de incapacidad</label>
                                    <input type="number" min="0" value={formData.diasIncapacidad} onChange={e => handleInputChange('diasIncapacidad', e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Agente causal del evento</label>
                                <input type="text" value={formData.agenteCausal} onChange={e => handleInputChange('agenteCausal', e.target.value)} placeholder="Ej: Maquinaria, piso húmedo, material cortante, caída de altura..." className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Consecuencias del evento</label>
                                <textarea value={formData.consecuencias} onChange={e => handleInputChange('consecuencias', e.target.value)} placeholder="Describa las consecuencias para la persona, el proceso y la empresa..." className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary min-h-[80px] resize-y" />
                            </div>
                        </div>

                        {/* ── SECCIÓN 4: Testigos (Relato de los hechos) ── */}
                        <div className="border rounded-xl p-5 bg-surface-tertiary/20 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-text-primary text-sm italic">4. Testigos (Relato de los hechos)</h4>
                                <div className="flex items-center gap-1 p-1 bg-surface-secondary/50 border border-border-medium rounded-2xl shadow-sm">
                                    {/* Botón Bandeja (Inbox) */}
                                    <motion.button
                                        whileHover="hover"
                                        whileTap="tap"
                                        onClick={() => setShowInbox(!showInbox)}
                                        className={cn(
                                            "group flex items-center justify-center h-10 px-2.5 min-w-[40px] transition-all duration-300 shadow-sm shrink-0 cursor-pointer border outline-none rounded-xl hover:-rotate-3 hover:scale-105",
                                            showInbox 
                                                ? "bg-amber-100 text-amber-700 border-amber-400 shadow-inner w-auto" 
                                                : "bg-surface-primary border-border-medium hover:bg-surface-hover hover:border-amber-400 text-amber-600 w-10 hover:w-[130px]"
                                        )}
                                    >
                                        <div className="relative flex-shrink-0 flex items-center justify-center">
                                            <AnimatedIcon name="inbox" size={20} />
                                            {inboxTestimonios.length > 0 && !showInbox && (
                                                <span className="absolute -top-3 -right-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white z-10 animate-pulse">
                                                    {inboxTestimonios.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className={cn(
                                            "flex items-center max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-in-out whitespace-nowrap",
                                            showInbox ? "max-w-[200px] opacity-100 ml-2" : "group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2"
                                        )}>
                                            <span className="text-sm font-bold tracking-wide">Reportes ({inboxTestimonios.length})</span>
                                        </div>
                                    </motion.button>

                                    {/* Botón Portal Público (QR) */}
                                    <motion.button
                                        whileHover="hover"
                                        whileTap="tap"
                                        onClick={() => setShowQrModal(true)}
                                        className="group flex items-center justify-center h-10 px-2.5 min-w-[40px] w-10 hover:w-[150px] bg-surface-primary border-border-medium hover:bg-surface-hover hover:border-teal-400 text-teal-600 transition-all duration-300 shadow-sm shrink-0 cursor-pointer border outline-none rounded-xl hover:-rotate-3 hover:scale-105 overflow-hidden"
                                    >
                                        <div className="relative flex-shrink-0 flex items-center justify-center">
                                            <AnimatedIcon name="qrcode" size={20} />
                                        </div>
                                        <div className="flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                                            <span className="text-sm font-bold tracking-wide">Portal Público</span>
                                        </div>
                                    </motion.button>
                                </div>
                            </div>

                            {/* ── BANDEJA DE TESTIMONIOS (INBOX) INTEGRADA ── */}
                            {showInbox && inboxTestimonios.length > 0 && (
                                <div className="mb-4 bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-inner animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center gap-2 text-amber-800 mb-3 border-b border-amber-100 pb-2">
                                        <MessageSquare className="h-4 w-4" />
                                        <h5 className="font-bold text-xs uppercase tracking-wider">Testimonios Pendientes</h5>
                                    </div>
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {inboxTestimonios.map((item) => (
                                            <div key={item.id} className="bg-white border border-amber-100 rounded-xl p-3 shadow-sm hover:border-amber-300 transition-all group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 text-xs truncate max-w-[180px]" title={item.testigo.nombre}>{item.testigo.nombre}</h4>
                                                        <p className="text-[10px] text-gray-500 font-medium italic">{item.testigo.cargo} • CC: {item.testigo.cedula}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDismissTestimony(item.id); }}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Descartar"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleAcceptTestimony(item); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-[10px] font-black hover:bg-teal-700 shadow-sm active:scale-95 transition-all"
                                                        >
                                                            <Check className="h-3 w-3" /> Aceptar
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-gray-700 line-clamp-3 bg-gray-50 p-2 rounded-lg border border-gray-100 leading-relaxed font-medium">"{item.testimonio}"</p>
                                                
                                                {/* Multimedia preview */}
                                                {(item.testigo.foto1 || item.testigo.foto2 || item.testigo.video) && (
                                                    <div className="flex gap-2 mt-2">
                                                        {item.testigo.foto1 && (
                                                            <div className="relative group/img">
                                                                <img src={item.testigo.foto1} className="w-10 h-10 rounded-lg object-cover border border-gray-200 shadow-sm cursor-zoom-in transition-transform group-hover/img:scale-105" />
                                                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 rounded-lg transition-colors" />
                                                            </div>
                                                        )}
                                                        {item.testigo.foto2 && (
                                                            <div className="relative group/img">
                                                                <img src={item.testigo.foto2} className="w-10 h-10 rounded-lg object-cover border border-gray-200 shadow-sm cursor-zoom-in transition-transform group-hover/img:scale-105" />
                                                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 rounded-lg transition-colors" />
                                                            </div>
                                                        )}
                                                        {item.testigo.video && (
                                                            <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center shadow-sm relative overflow-hidden group/vid">
                                                                <Video className="h-4 w-4 text-teal-400" />
                                                                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/vid:opacity-100 transition-opacity" />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showInbox && inboxTestimonios.length === 0 && (
                                <div className="mb-4 bg-teal-50/50 border border-teal-100 rounded-2xl p-6 text-center animate-in fade-in slide-in-from-top-2">
                                    <Check className="w-8 h-8 text-teal-400 mx-auto mb-2" />
                                    <p className="text-xs text-teal-700 font-bold">No hay testimonios pendientes por revisar.</p>
                                </div>
                            )}
                            {testigosList.map((testigo, idx) => (
                                <div key={idx} className="border border-border-medium rounded-xl p-4 bg-surface-primary space-y-3 relative">
                                    <p className="text-xs text-text-secondary font-medium">Testigo {idx + 1}</p>
                                    <div className="flex flex-col md:flex-row gap-3">
                                        <WorkerAutocomplete
                                            value={testigo.nombre}
                                            onChange={(val) => {
                                                const newL = [...testigosList];
                                                newL[idx].nombre = val;
                                                setTestigosList(newL);
                                            }}
                                            onSelect={(w) => {
                                                const newL = [...testigosList];
                                                newL[idx] = { ...newL[idx], nombre: w.nombre, cedula: w.identificacion, cargo: w.cargo || '' };
                                                setTestigosList(newL);
                                            }}
                                            data={availableWorkers}
                                            searchKey="nombre"
                                            placeholder="Nombre del testigo"
                                            wrapperClassName="w-full md:w-1/2"
                                            className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                                        />
                                        <input
                                            type="text"
                                            value={testigo.cedula}
                                            onChange={e => {
                                                const newL = [...testigosList];
                                                newL[idx].cedula = e.target.value;
                                                setTestigosList(newL);
                                            }}
                                            placeholder="Cédula"
                                            className="w-full md:w-1/4 rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"
                                        />
                                        <div className="flex w-full md:w-1/4 gap-2">
                                            <input
                                                type="text"
                                                value={testigo.cargo}
                                                onChange={e => {
                                                    const newL = [...testigosList];
                                                    newL[idx].cargo = e.target.value;
                                                    setTestigosList(newL);
                                                }}
                                                placeholder="Cargo"
                                                className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"
                                            />
                                            <button
                                                onClick={() => setTestigosList(testigosList.filter((_, i) => i !== idx))}
                                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex-shrink-0"
                                                disabled={testigosList.length === 1}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        value={testigo.testimonio}
                                        onChange={e => {
                                            const newL = [...testigosList];
                                            newL[idx].testimonio = e.target.value;
                                            setTestigosList(newL);
                                        }}
                                        placeholder="Versión del testigo sobre cómo ocurrieron los hechos..."
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary min-h-[80px] resize-y"
                                    />
                                </div>
                            ))}
                            <button
                                onClick={() => setTestigosList([...testigosList, { nombre: '', cedula: '', cargo: '', testimonio: '' }])}
                                className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
                            >
                                <Plus className="h-4 w-4" /> Añadir Testigo
                            </button>
                        </div>

                        {/* ── SECCIÓN 5: Equipo Investigador (Res 1401 Art. 7) ── */}
                        <div className="border rounded-xl p-5 bg-surface-tertiary/20 space-y-4">
                            <SectionHeader
                                icon={<ClipboardList className="h-4 w-4" />}
                                subtitle="Art. 7 Res. 1401/2007: Jefe inmediato + Representante COPASST + Encargado SST"
                            />
                            {equipoList.map((miembro, idx) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-3">
                                    <WorkerAutocomplete
                                        value={miembro.nombre}
                                        onChange={(val) => {
                                            const newE = [...equipoList];
                                            newE[idx].nombre = val;
                                            const match = availableWorkers.find(w => w.nombre === val);
                                            if (match) newE[idx].cedula = match.identificacion;
                                            setEquipoList(newE);
                                        }}
                                        onSelect={(w) => {
                                            const newE = [...equipoList];
                                            newE[idx].nombre = w.nombre;
                                            newE[idx].cedula = w.identificacion;
                                            setEquipoList(newE);
                                        }}
                                        data={availableWorkers}
                                        searchKey="nombre"
                                        placeholder="Nombre del investigador"
                                        wrapperClassName="w-full md:w-1/3"
                                        className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                                    />
                                    <input
                                        type="text"
                                        value={miembro.rol}
                                        onChange={e => {
                                            const newE = [...equipoList];
                                            newE[idx].rol = e.target.value;
                                            setEquipoList(newE);
                                        }}
                                        className="w-full md:w-1/3 rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary"
                                        placeholder="Rol en la investigación"
                                    />
                                    <div className="flex w-full md:w-1/3 gap-2">
                                        <WorkerAutocomplete
                                            value={miembro.cedula}
                                            onChange={(val) => {
                                                const newE = [...equipoList];
                                                newE[idx].cedula = val;
                                                const match = availableWorkers.find(w => w.identificacion === val);
                                                if (match && !newE[idx].nombre) newE[idx].nombre = match.nombre;
                                                setEquipoList(newE);
                                            }}
                                            onSelect={(w) => {
                                                const newE = [...equipoList];
                                                newE[idx].cedula = w.identificacion;
                                                if (!newE[idx].nombre) newE[idx].nombre = w.nombre;
                                                setEquipoList(newE);
                                            }}
                                            data={availableWorkers}
                                            searchKey="identificacion"
                                            placeholder="Cédula"
                                            wrapperClassName="w-full"
                                            className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                                        />
                                        <button
                                            onClick={() => setEquipoList(equipoList.filter((_, i) => i !== idx))}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors flex-shrink-0"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => setEquipoList([...equipoList, { nombre: '', cedula: '', rol: '' }])}
                                className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 font-medium"
                            >
                                <Plus className="h-4 w-4" /> Añadir Investigador
                            </button>
                        </div>

                        {/* ── SECCIÓN 6: Registro Fotográfico ── */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <h4 className="font-semibold text-text-primary text-sm">6. Registro Fotográfico de Evidencias</h4>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {['foto1', 'foto2', 'foto3', 'foto4'].map((foto, idx) => {
                                    const labels = ['Lugar del Evento', 'Agente Causal', 'Lesiones / Daños', 'Condiciones del Área'];
                                    const fieldName = foto as 'foto1' | 'foto2' | 'foto3' | 'foto4';
                                    const descName = `${foto}Desc`;
                                    return (
                                        <div key={foto} className="flex flex-col items-center gap-3">
                                            <span className="font-semibold text-sm text-center">{labels[idx]}</span>
                                            <div className="relative w-full aspect-square bg-surface-tertiary rounded-xl border-2 border-dashed border-border-medium flex flex-col items-center justify-center overflow-hidden hover:bg-surface-hover transition-colors">
                                                {images[fieldName] ? (
                                                    <>
                                                        <img src={images[fieldName] as string} className="w-full h-full object-cover" alt={foto} />
                                                        <button onClick={() => removeImage(fieldName)} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500">
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-teal-500">
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

                        {/* ── SECCIÓN 7: Evidencia en Video ── */}
                        <div className="space-y-4 pt-4 border-t border-border-medium">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                    <Film className="h-4 w-4 text-teal-600" /> 7. Video de Evidencia Dinámica (Opcional)
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
                                            <p className="text-sm font-semibold text-text-primary">Sube evidencia dinámica del evento</p>
                                            <p className="text-xs text-text-secondary mt-1">Permite a la IA analizar la secuencia fáctica y condiciones en tiempo real</p>
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
                                            Evidencia de video lista para análisis pericial
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Generate Button bottom ── */}
                        <div className="flex justify-center pt-4 gap-4">
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
                                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">Generar Informe de Investigación con IA</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Report Viewer ── */}
            <div className="mt-4">
                <CollapsibleReportBox onSave={handleSave}
                    onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                    isHistoryOpen={isHistoryOpen}
                    title="Investigación ATEL"
                    icon={<FileText className="h-5 w-5 text-teal-600" />}
                    actions={
                    <ExportDropdown
                        content={editorContentRef.current || generatedObjectives || ''}
                        fileName="Informe_InvestigacionATEL"
                        reportType="general"
                    />
                }
                >
                    <div className="w-full min-w-0">
                        <LiveEditor
                            ref={liveEditorRef}
                            paperMode={true}
                            initialContent={generatedObjectives || ''}
                            onUpdate={(html) => { editorContentRef.current = html; }}
                            reportSourceData={{ formData, testigosList, equipoList }}
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

            {/* ═══ File Import Hidden Input ═══ */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportExcel}
                accept=".xlsx, .xls, .docx, .doc, .pdf, .txt, .json"
                className="hidden"
            />

            {/* ── MODAL IMPORT CONFIRMATION IA ── */}
            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border-medium bg-surface-primary p-6 shadow-2xl">
                        <div className="flex items-center gap-2 mb-3 text-text-primary">
                            <Sparkles className="h-5 w-5 text-teal-500 animate-pulse" />
                            <h3 className="text-sm font-bold">Confirmar Importación con IA</h3>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Se detectó un documento de reporte o FURAT ({pendingFileData?.name}). 
                            ¿Deseas usar la IA (Gemini) de Somos SST para analizar el contenido, extraer los datos del accidente y del afectado, y llenar el formulario de investigación automáticamente?
                        </p>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setIsConfirmModalOpen(false);
                                    setPendingFileData(null);
                                }}
                                className="rounded-xl border border-border-medium px-4 py-2 text-xs font-bold text-text-secondary hover:bg-surface-secondary cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmAiImport}
                                className="rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white px-4 py-2 text-xs font-bold shadow-md hover:scale-105 active:scale-95 transform transition-all cursor-pointer flex items-center gap-1"
                            >
                                <Sparkles className="h-3 w-3" />
                                Mapear con IA
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── SPINNER CARGA IA ── */}
            {isAiImportLoading && (
                <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm text-white">
                    <div className="bg-surface-primary border border-border-medium p-6 rounded-2xl flex flex-col items-center max-w-xs shadow-2xl">
                        <Loader2 className="h-10 w-10 text-teal-500 animate-spin mb-3" />
                        <h4 className="text-sm font-bold text-text-primary text-center">Procesando con IA...</h4>
                        <p className="text-[11px] text-text-secondary text-center mt-1">
                            Gemini está extrayendo los hechos, afectado y causales del reporte. Esto puede tardar unos segundos.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvestigacionATEL;
