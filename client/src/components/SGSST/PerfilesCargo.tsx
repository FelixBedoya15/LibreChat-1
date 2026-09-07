import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    Sparkles,
    Loader2,
    ChevronDown,
    ChevronRight,
    FileText,
    Plus,
    Trash2,
    Briefcase,
    UserCheck,
    AlertTriangle,
    Shield,
    Brain,
    Target,
    BookOpen,
    ClipboardList,
    Mic,
    MicOff,
    CheckCircle2,
    X,
    Database,
    History,
    Save,
    Camera,
    Video,
    Film,
    Activity,
    ShieldAlert,
    HeartPulse,
    Info,
    MapPin,
    Upload,
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { cn } from '~/utils';
import SGSSTToolbar from './SGSSTToolbar';
import SingleSelect from './SingleSelect';
import { exportPerfilesCargoToExcel } from './exportPerfilesCargo';
import CollapsibleReportBox from './CollapsibleReportBox';
import WorkersProfileList from './WorkersProfileList';
import BioIndividuoDashboard from './BioIndividuoDashboard';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PerfilCargoData {
    id: string;
    nombreCargo: string;
    area: string;
    nivelCargo: string;
    sectorOrganizacion?: string;
    tipoContrato: string;
    jornada: string;
    jefeInmediato: string;
    escalasSalarial: string;
    numVacantes: string;
    contextoAdicional: string;
    eppSeleccionados: string[];
    entrenamientosSeleccionados: string[];
    controlesFuenteSeleccionados?: string[];
    controlesMedioSeleccionados?: string[];
    images?: {
        foto1?: string | null;
        foto2?: string | null;
        foto3?: string | null;
        foto1Desc?: string;
        foto2Desc?: string;
        foto3Desc?: string;
    };
    video?: string | null;
    exigenciaFisica?: string;
    exigenciaMental?: string;
    operaMaquinaria?: string;
    report?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const NIVEL_CARGO_OPTIONS = [
    'Estratégico / Directivo',
    'Táctico / Mando Medio',
    'Profesional / Técnico',
    'Operativo',
    'Auxiliar / Asistencial',
];

const SECTOR_ORGANIZACION_OPTIONS = [
    'Sector privado',
    'Sector público',
    'Mixto',
];

const VINCULACION_PRIVADO_OPTIONS = [
    'Contrato laboral a término indefinido',
    'Contrato laboral a término fijo',
    'Contrato laboral por obra o labor',
    'Trabajo ocasional, accidental o transitorio',
    'Trabajador en misión — Empresa de Servicios Temporales',
    'Contrato de aprendizaje',
    'Práctica, pasantía o judicatura',
    'Prestación de servicios — persona natural',
];

const VINCULACION_PUBLICO_OPTIONS = [
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
];

const VINCULACION_OTRAS_OPTIONS = [
    'Trabajador independiente',
    'Trabajador cooperado',
    'Voluntario',
    'Otro tipo de vinculación',
    'No informa',
];

const normalizeVinculacion = (val: string): string => {
    const map: Record<string, string> = {
        'Término indefinido': 'Contrato laboral a término indefinido',
        'Indefinido': 'Contrato laboral a término indefinido',
        'Término fijo': 'Contrato laboral a término fijo',
        'Fijo': 'Contrato laboral a término fijo',
        'Obra o labor': 'Contrato laboral por obra o labor',
        'Prestación de servicios': 'Prestación de servicios — persona natural',
        'Aprendizaje (SENA)': 'Contrato de aprendizaje',
        'Aprendizaje': 'Contrato de aprendizaje',
        'Temporal/ETT': 'Trabajador en misión — Empresa de Servicios Temporales',
        'Temporal': 'Trabajador en misión — Empresa de Servicios Temporales',
    };
    return map[val] || val;
};

const getVinculacionOptionsForSector = (sector?: string, currentValue?: string) => {
    let list: (string | { label: string; value: string; isHeader?: boolean })[] = [];
    if (sector === 'Sector público') {
        list = [
            { label: '🏛️ SECTOR PÚBLICO', value: '', isHeader: true },
            ...VINCULACION_PUBLICO_OPTIONS,
            { label: '🤝 OTRAS VINCULACIONES', value: '', isHeader: true },
            ...VINCULACION_OTRAS_OPTIONS,
        ];
    } else if (sector === 'Mixto') {
        list = [
            { label: '🏢 SECTOR PRIVADO', value: '', isHeader: true },
            ...VINCULACION_PRIVADO_OPTIONS,
            { label: '🏛️ SECTOR PÚBLICO', value: '', isHeader: true },
            ...VINCULACION_PUBLICO_OPTIONS,
            { label: '🤝 OTRAS VINCULACIONES', value: '', isHeader: true },
            ...VINCULACION_OTRAS_OPTIONS,
        ];
    } else {
        // Sector privado por defecto
        list = [
            { label: '🏢 SECTOR PRIVADO', value: '', isHeader: true },
            ...VINCULACION_PRIVADO_OPTIONS,
            { label: '🤝 OTRAS VINCULACIONES', value: '', isHeader: true },
            ...VINCULACION_OTRAS_OPTIONS,
        ];
    }

    if (currentValue && !list.some(item => typeof item === 'string' ? item === currentValue : item.value === currentValue)) {
        list.push(currentValue);
    }

    return list;
};

const JORNADA_OPTIONS = [
    'Tiempo completo (8 horas/día)',
    'Medio tiempo (4 horas/día)',
    'Turnos rotativos',
    'Turno nocturno',
    'Jornada flexible',
];

const EPP_OPTIONS = [
    'Casco de seguridad (Dieléctrico/Tipo I/II)',
    'Gafas de seguridad (Claras/Oscuras/Antiempañantes)',
    'Protección auditiva (Inserción/Copa)',
    'Mascarilla para material particulado (N95/P100)',
    'Respirador con filtros químicos',
    'Guantes de nitrilo/látex/vaqueta/carnaza',
    'Guantes de protección mecánica/corte',
    'Botas de seguridad con puntera (Dieléctrica)',
    'Overol de trabajo / Chaleco reflectivo',
    'Arnés de cuerpo completo (4 argollas)',
    'Eslinga de posicionamiento / Protección de caídas',
    'Protector solar',
    'Capas impermeables',
];

const CONTROLES_FUENTE_OPTIONS = [
    'Mantenimiento preventivo periódico de maquinaria',
    'Aislamiento de la fuente generadora (Cabinas/Encerramientos)',
    'Sustitución de herramientas convencionales por ergonómicas/aisladas',
    'Automatización de procesos críticos o peligrosos',
    'Rediseño del puesto de trabajo o ergonomía física',
    'Protecciones mecánicas fijas o móviles en poleas y partes móviles',
    'Sistemas de parada de emergencia activa',
    'Voltaje extra bajo de seguridad (SELV / VRD en soldadura)',
];

const CONTROLES_MEDIO_OPTIONS = [
    'Sistemas de ventilación mecánica localizada o extracción',
    'Aislamiento acústico de áreas ruidosas',
    'Barandas, delimitación y demarcación de zonas de peligro',
    'Instalación de mamparas, pantallas térmicas o pantallas de soldadura',
    'Sistemas de iluminación artificial focalizada y antideslumbrante',
    'Limpieza profunda y control de polvo en el ambiente de trabajo',
    'Señalización de seguridad fotoluminiscente y advertencia de riesgos',
    'Diseño de rutas de evacuación y pasillos despejados',
    'Monitoreo ambiental periódico de contaminantes (Aire/Vibración/Ruido)',
];

const ENTRENAMIENTO_OPTIONS = [
    'Inducción y Reinducción en SST',
    'Identificación de Peligros y Riesgos (GTC 45)',
    'Uso y Mantenimiento de EPP',
    'Primeros Auxilios Básicos',
    'Prevención y Control de Incendios (Extintores)',
    'Plan de Emergencias y Evacuación',
    'Ergonomía y Pausas Activas',
    'Manejo de Sustancias Químicas (GHS)',
    'Riesgo Psicosocial y Manejo del Estrés',
    'Seguridad Vial (PESV)',
    'Reporte de Actos y Condiciones Inseguras',
    // Alturas - Res. 4272/2021
    'Trabajador Autorizado para Trabajo en Alturas',
    'Coordinador de Trabajo Seguro en Alturas',
    'Administrador del Programa de Protección Contra Caídas',
    // Espacios Confinados - Res. 0491/2020
    'Trabajador Entrante para Espacios Confinados',
    'Vigía de Seguridad para Espacios Confinados',
    'Supervisor de Trabajo en Espacios Confinados',
    'Administrador de Programa para Espacios Confinados',
    // Otros
    'Manejo Seguro de Herramientas Eléctricas y Manuales',
    'Mantenimiento Preventivo de Equipos',
    'Buenas Prácticas de Manufactura (BPM)',
];

// ─── Empty form ───────────────────────────────────────────────────────────────
const createInitialPerfil = (): PerfilCargoData => ({
    id: crypto.randomUUID(),
    nombreCargo: '',
    area: '',
    nivelCargo: 'Operativo',
    sectorOrganizacion: 'Sector privado',
    tipoContrato: 'Contrato laboral a término indefinido',
    jornada: 'Tiempo completo (8 horas/día)',
    jefeInmediato: '',
    escalasSalarial: '',
    numVacantes: '1',
    contextoAdicional: '',
    eppSeleccionados: [],
    entrenamientosSeleccionados: [],
    controlesFuenteSeleccionados: [],
    controlesMedioSeleccionados: [],
    images: { foto1: null, foto2: null, foto3: null, foto1Desc: '', foto2Desc: '', foto3Desc: '' },
    video: null,
    exigenciaFisica: 'Media',
    exigenciaMental: 'Media',
    operaMaquinaria: 'No',
});

// ─── Field config for rendering ─────────────────────────────────────────────
const EXIGENCIA_OPTIONS = ['Baja', 'Media', 'Alta'];
const SINO_OPTIONS = ['Sí', 'No'];

const FIELD_SECTIONS = [
    {
        title: 'Identificación del Cargo',
        icon: <Briefcase className="h-4 w-4 text-teal-600" />,
        fields: [
            { key: 'nombreCargo', label: 'Nombre del Cargo *', placeholder: 'Ej: Auxiliar de Bodega, Contador Público...', type: 'text', required: true },
            { key: 'area', label: 'Área / Departamento *', placeholder: 'Logística, Contabilidad...', type: 'text', required: true },
            { key: 'jefeInmediato', label: 'Cargo Jefe Inmediato', placeholder: 'Jefe de Bodega...', type: 'text' },
            { key: 'numVacantes', label: 'N° de Vacantes', placeholder: '1', type: 'number' },
        ]
    },
    {
        title: 'Condiciones Laborales',
        icon: <UserCheck className="h-4 w-4 text-teal-600" />,
        fields: [
            { key: 'nivelCargo', label: 'Nivel del Cargo', type: 'select', options: NIVEL_CARGO_OPTIONS },
            { key: 'sectorOrganizacion', label: 'Sector de la Organización', type: 'select', options: SECTOR_ORGANIZACION_OPTIONS },
            { key: 'tipoContrato', label: 'Tipo de Vinculación', type: 'select', options: [] },
            { key: 'jornada', label: 'Jornada Laboral', type: 'select', options: JORNADA_OPTIONS },
            { key: 'escalasSalarial', label: 'Escala Salarial', placeholder: '1.8 SMMLV - 2.5 SMMLV', type: 'text' },
        ]
    },
    {
        title: 'Exigencias Biocéntricas del Entorno',
        icon: <Brain className="h-4 w-4 text-teal-600" />,
        fields: [
            { key: 'exigenciaFisica', label: 'Carga Física Esperada', type: 'select', options: EXIGENCIA_OPTIONS },
            { key: 'exigenciaMental', label: 'Carga Mental / Toma Decisiones', type: 'select', options: EXIGENCIA_OPTIONS },
            { key: 'operaMaquinaria', label: '¿Opera Maquinaria Peligrosa / Vehículos?', type: 'select', options: SINO_OPTIONS },
        ]
    },
];

// ─── MultiSelect Component ────────────────────────────────────────────────────
const MultiSelect = ({ options, selected, onChange, label, placeholder }: { options: string[], selected: string[], onChange: (val: string[]) => void, label: string, placeholder: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const toggle = (val: string) => {
        if (selected.includes(val)) {
            onChange(selected.filter(s => s !== val));
        } else {
            onChange([...selected, val]);
        }
    };

    const handleAddCustom = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = inputValue.trim();
            if (val && !selected.includes(val)) {
                onChange([...selected, val]);
                setInputValue('');
            }
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const allOptions = Array.from(new Set([...options, ...selected]));

    return (
        <div className="space-y-2 relative flex flex-col justify-end h-full" ref={containerRef}>
            <label className="text-[11px] font-extrabold text-text-secondary uppercase tracking-wider">{label}</label>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "min-h-[48px] w-full rounded-2xl border px-4 py-2.5 text-sm bg-surface-primary/70 text-text-primary flex flex-wrap gap-2 cursor-pointer transition-all duration-300 shadow-sm",
                    isOpen 
                        ? "border-teal-500 ring-4 ring-teal-500/10 shadow-[0_0_15px_rgba(20,184,166,0.15)]" 
                        : "border-border-medium/60 hover:border-teal-500/80 hover:shadow-[0_0_15px_rgba(20,184,166,0.08)]"
                )}
            >
                {selected.length === 0 && <span className="text-text-tertiary flex items-center text-xs font-semibold">{placeholder}</span>}
                {selected.map(val => (
                    <span key={val} className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 text-teal-700 dark:text-teal-300 rounded-2xl text-[11px] font-extrabold border border-teal-500/20 shadow-sm transition-all hover:scale-102 hover:bg-teal-500/20">
                        {val}
                        <X className="h-3.5 w-3.5 hover:text-red-500 transition-colors cursor-pointer" onClick={(e) => { e.stopPropagation(); toggle(val); }} />
                    </span>
                ))}
                <div className="ml-auto flex items-center pl-2">
                    <ChevronDown className={cn("h-4 w-4 text-text-tertiary transition-transform duration-300", isOpen && "rotate-180")} />
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-[60] bottom-full mb-2 w-full max-h-72 overflow-hidden bg-surface-secondary border border-border-medium/70 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 flex flex-col backdrop-blur-md">
                    <div className="p-2 border-b border-border-medium/40 bg-surface-primary/90 sticky top-0 z-10 shrink-0">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleAddCustom}
                            placeholder="Buscar o presionar Enter para crear..."
                            className="w-full text-xs font-bold rounded-2xl bg-surface-secondary border border-border-medium/60 px-4 py-3 text-text-primary focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:shadow-[0_0_10px_rgba(20,184,166,0.15)] transition-all placeholder:text-text-tertiary shadow-inner"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="p-2 flex-1 overflow-y-auto space-y-1">
                        {allOptions.filter(opt => opt.toLowerCase().includes(inputValue.toLowerCase())).map(opt => (
                            <div
                                key={opt}
                                onClick={() => toggle(opt)}
                                className={cn(
                                    "flex items-center justify-between px-3.5 py-2.5 text-xs rounded-xl cursor-pointer transition-all duration-200 font-bold border",
                                    selected.includes(opt) 
                                        ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20" 
                                        : "hover:bg-surface-hover text-text-primary border-transparent"
                                )}
                            >
                                <span className="leading-snug">{opt}</span>
                                {selected.includes(opt) && <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 ml-2" />}
                            </div>
                        ))}
                        {inputValue.trim() && !allOptions.some(opt => opt.toLowerCase() === inputValue.toLowerCase().trim()) && (
                             <div 
                                className="px-3.5 py-2.5 text-xs rounded-xl cursor-pointer text-teal-600 bg-teal-50/50 hover:bg-teal-100 dark:text-teal-400 dark:bg-teal-900/20 dark:hover:bg-teal-900/40 font-bold flex items-center justify-between border border-dashed border-teal-300 dark:border-teal-700 transition-all duration-200 mt-1"
                                onClick={() => {
                                    onChange([...selected, inputValue.trim()]);
                                    setInputValue('');
                                }}
                             >
                                 <span className="truncate mr-2 font-black">Agregar "{inputValue.trim()}"</span>
                                 <Plus className="h-4 w-4 flex-shrink-0"/> 
                             </div>
                        )}
                        {allOptions.filter(opt => opt.toLowerCase().includes(inputValue.toLowerCase())).length === 0 && !inputValue.trim() && (
                            <div className="px-3 py-4 text-center text-xs text-text-tertiary italic font-semibold">
                                No hay opciones disponibles
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
// ─── Component ────────────────────────────────────────────────────────────────
const PerfilesCargo = () => {
    const { showToast } = useToastContext();
    const { user, token } = useAuthContext();

    const [perfiles, setPerfiles] = useState<PerfilCargoData[]>([]);
    const [activePerfilId, setActivePerfilId] = useState<string | null>(null);
    const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
    const [formData, setFormData] = useState<PerfilCargoData>(createInitialPerfil());
    const [isFormExpanded, setIsFormExpanded] = useState(true);
    const [selectedModel, setSelectedModel] = useState(user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [summaryPerfil, setSummaryPerfil] = useState<PerfilCargoData | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    const [isVideoUploading, setIsVideoUploading] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isAiImportLoading, setIsAiImportLoading] = useState(false);
    const [pendingFileData, setPendingFileData] = useState<{ dataUrl: string; name: string; type: string } | null>(null);

    const handleImageUpload = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

                    setFormData(prev => ({
                        ...prev,
                        images: { ...(prev.images || {}), [key]: compressedDataUrl }
                    }));
                    showToast({ message: 'Foto cargada exitosamente', severity: NotificationSeverity.SUCCESS });
                } catch (err) {
                    console.error('[PerfilesCargo] Compression error:', err);
                    setFormData(prev => ({
                        ...prev,
                        images: { ...(prev.images || {}), [key]: event.target?.result as string }
                    }));
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const removeImage = (key: string) => {
        setFormData(prev => ({
            ...prev,
            images: {
                ...(prev.images || {}),
                [key]: null,
                [`${key}Desc`]: ''
            }
        }));
    };

    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsVideoUploading(true);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            window.URL.revokeObjectURL(video.src);
            if (video.duration > 10) {
                showToast({ message: 'El video no debe superar los 10 segundos.', severity: NotificationSeverity.ERROR });
                setIsVideoUploading(false);
                return;
            }
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;
                try {
                    const res = await fetch('/api/sgsst/perfiles-cargo/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ fileData: base64String, fileName: file.name })
                    });
                    const data = await res.json();
                    if (data.url) {
                        setFormData(prev => ({ ...prev, video: data.url }));
                    } else {
                        showToast({ message: 'Error al subir video', severity: NotificationSeverity.ERROR });
                    }
                } catch (err) {
                    showToast({ message: 'Error de conexión', severity: NotificationSeverity.ERROR });
                } finally {
                    setIsVideoUploading(false);
                }
            };
            reader.readAsDataURL(file);
        };
        video.src = URL.createObjectURL(file);
    };

    const removeVideo = () => {
        setFormData(prev => ({ ...prev, video: null }));
    };

    const handleImageDescUpdate = (key: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            images: {
                ...(prev.images || {}),
                [key]: value
            }
        }));
    };

    // Voice Input State
    const [isListening, setIsListening] = useState(false);
    const [interimText, setInterimText] = useState('');
    const recognitionRef = useRef<any>(null);

    // ─── Load saved profiles ────────────────────────────────────────────────
    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/perfiles-cargo/data', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => res.json())
            .then(data => {
                if (data.perfilesList?.length) {
                    setPerfiles(data.perfilesList);
                    const first = data.perfilesList[0];
                    setActivePerfilId(first.id);
                    setFormData(first);
                    setGeneratedReport(first.report || null);
                    editorContentRef.current = first.report || '';
                    liveEditorRef.current?.setHTML(first.report || '');
                } else {
                    const initial = createInitialPerfil();
                    setPerfiles([initial]);
                    setActivePerfilId(initial.id);
                    setFormData(initial);
                }
            })
            .catch(err => console.error('[PerfilesCargo] Error loading data:', err));
    }, [token]);

    // Keep the perfiles list synchronized with form changes in real-time
    useEffect(() => {
        if (!formData || !formData.id) return;
        setPerfiles(prev => {
            const index = prev.findIndex(p => p.id === formData.id);
            if (index === -1) return prev;
            const current = prev[index];
            
            // Compare key properties to avoid infinite loops or unnecessary updates
            const keys = Object.keys(formData) as Array<keyof PerfilCargoData>;
            let changed = false;
            for (const key of keys) {
                if (Array.isArray(formData[key])) {
                    if (JSON.stringify(formData[key]) !== JSON.stringify(current[key])) {
                        changed = true;
                        break;
                    }
                } else if (formData[key] !== current[key]) {
                    changed = true;
                    break;
                }
            }
            if (!changed) return prev;
            const updated = [...prev];
            updated[index] = { ...formData };
            return updated;
        });
    }, [formData]);

    const handleInput = (key: keyof PerfilCargoData, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleAddPerfil = () => {
        const newPerfil = createInitialPerfil();
        setPerfiles(prev => [...prev, newPerfil]);
        setActivePerfilId(newPerfil.id);
        setFormData(newPerfil);
        setGeneratedReport(null);
        editorContentRef.current = '';
        liveEditorRef.current?.setHTML('');
        setIsFormExpanded(true);
        showToast({ message: 'Nuevo perfil de cargo creado', severity: NotificationSeverity.INFO });
    };

    const handleDeletePerfil = (id: string) => {
        const updated = perfiles.filter(p => p.id !== id);
        if (updated.length === 0) {
            const initial = createInitialPerfil();
            setPerfiles([initial]);
            setActivePerfilId(initial.id);
            setFormData(initial);
        } else {
            setPerfiles(updated);
            if (activePerfilId === id) {
                setActivePerfilId(updated[0].id);
                setFormData(updated[0]);
                setGeneratedReport(updated[0].report || null);
                editorContentRef.current = updated[0].report || '';
                liveEditorRef.current?.setHTML(updated[0].report || '');
            }
        }
    };

    const handleSelectPerfil = (id: string) => {
        const perfil = perfiles.find(p => p.id === id);
        if (perfil) {
            setActivePerfilId(id);
            setFormData(perfil);
            setGeneratedReport(perfil.report || null);
            editorContentRef.current = perfil.report || '';
            liveEditorRef.current?.setHTML(perfil.report || '');
            setIsFormExpanded(true);
            // Reset conversation tracking when switching profiles
            setConversationId(null);
            setReportMessageId(null);
            setSelectedWorkerId(null);
            setRefreshTrigger(p => p + 1);
        }
    };

    // ─── Voice Input (Same interface as Heights Permit) ────────────────────
    const handleVoiceInput = () => {
        if (isListening) {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) { }
            }
            setIsListening(false);
            setInterimText('');
            return;
        }

        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast({ message: 'Su navegador no soporta reconocimiento de voz. Intente con Chrome.', severity: NotificationSeverity.ERROR });
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
                        contextoAdicional: prev.contextoAdicional + (prev.contextoAdicional && !prev.contextoAdicional.endsWith(' ') ? ' ' : '') + newFinal
                    }));
                }
                setInterimText(currentInterim);
            };

            recognition.onerror = (event: any) => {
                showToast({ message: 'Error en reconocimiento de voz', severity: NotificationSeverity.ERROR });
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
            showToast({ message: 'Error al iniciar reconocimiento', severity: NotificationSeverity.ERROR });
        }
    };

    // ─── Excel Import/Export ──────────────────────────────────────────────────
    const safeJoin = (val: any): string => {
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'string') return val;
        return '';
    };

    const safeText = (val: any, isHTML = false): string => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        if (isHTML) {
            str = str.replace(/<[^>]*>/g, '');
        }
        if (str.length > 32760) {
            return str.substring(0, 32750) + '... [TRUNCADO]';
        }
        return str;
    };

    const handleExportExcel = async () => {
        try {
            await exportPerfilesCargoToExcel(perfiles);
            showToast({ message: 'Archivo Excel exportado exitosamente', severity: NotificationSeverity.SUCCESS });
        } catch (error: any) {
            console.error('Error al exportar Excel:', error);
            showToast({ message: `Error al exportar Excel: ${error.message || error}`, severity: NotificationSeverity.ERROR });
        }
    };

    const saveImportedPerfiles = async (list: PerfilCargoData[]) => {
        if (!token) return;
        try {
            await fetch('/api/sgsst/perfiles-cargo/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ perfilesList: list }),
            });
        } catch (e) {
            console.error('Error saving imported profiles:', e);
        }
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase();
        
        // Helper to load file as base64 and open confirmation modal
        const requestAiImport = () => {
            const base64Reader = new FileReader();
            base64Reader.onload = (base64Event) => {
                let inferredType = file.type || 'application/octet-stream';
                if (file.name.toLowerCase().endsWith('.docx')) {
                    inferredType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                } else if (file.name.toLowerCase().endsWith('.xlsx')) {
                    inferredType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                } else if (file.name.toLowerCase().endsWith('.pdf')) {
                    inferredType = 'application/pdf';
                }

                setPendingFileData({
                    dataUrl: base64Event.target?.result as string,
                    name: file.name,
                    type: inferredType
                });
                setIsConfirmModalOpen(true);
            };
            base64Reader.readAsDataURL(file);
        };

        // Si es PDF, Word (.docx, .doc) o texto, va directo a la ruta de IA
        if (['pdf', 'docx', 'doc', 'txt'].includes(extension || '')) {
            requestAiImport();
            if (e.target) e.target.value = '';
            return;
        }

        // Si es JSON, leemos e intentamos parsear
        if (extension === 'json') {
            const jsonReader = new FileReader();
            jsonReader.onload = (jsonEvent) => {
                try {
                    const parsed = JSON.parse(jsonEvent.target?.result as string);
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].nombreCargo) {
                        // Formato estándar
                        const newPerfiles = parsed.map((p: any) => ({
                            ...p,
                            id: p.id || crypto.randomUUID(),
                            images: p.images || {},
                            video: p.video || null,
                            report: p.report || ''
                        }));
                        setPerfiles(prev => {
                            const cleanPrev = (prev.length === 1 && !prev[0].nombreCargo) ? [] : prev;
                            const combined = [...cleanPrev, ...newPerfiles];
                            if (combined.length > 0 && (!activePerfilId || !prev.find(p2 => p2.id === activePerfilId)?.nombreCargo)) {
                                setActivePerfilId(combined[0].id);
                                setFormData(combined[0]);
                                setGeneratedReport(combined[0].report || null);
                                editorContentRef.current = combined[0].report || '';
                                liveEditorRef.current?.setHTML(combined[0].report || '');
                            }
                            saveImportedPerfiles(combined);
                            return combined;
                        });
                        showToast({ message: `${newPerfiles.length} perfiles importados desde backup`, severity: NotificationSeverity.SUCCESS });
                    } else {
                        // JSON no estándar, preguntar por IA
                        requestAiImport();
                    }
                } catch (err) {
                    showToast({ message: 'Error al parsear el archivo JSON', severity: NotificationSeverity.ERROR });
                }
            };
            jsonReader.readAsText(file);
            if (e.target) e.target.value = '';
            return;
        }

        // Si es Excel (.xlsx, .xls), validamos si tiene cabeceras válidas para la ruta tradicional o si va a IA
        const reader = new FileReader();
        reader.onload = (eEvent) => {
            try {
                const data = eEvent.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const importedData = XLSX.utils.sheet_to_json<any>(sheet);

                if (!importedData || importedData.length === 0) {
                    throw new Error("El archivo no contiene datos.");
                }

                // Validamos si hay cabeceras estándar en el primer registro
                const firstRow = importedData[0];
                const keys = Object.keys(firstRow).map(k => k.toLowerCase().replace(/\s+/g, ''));
                const isStandard = keys.some(k => 
                    k.includes('cargo') || 
                    k.includes('epp') || 
                    k.includes('entrenamiento') || 
                    k.includes('area') ||
                    k.includes('contrato') ||
                    k.includes('vinculacion')
                );

                if (isStandard) {
                    // Ruta A: Mapeo Tradicional Directo
                    const newPerfiles: PerfilCargoData[] = importedData.map((row: any) => {
                        const eppStr = row['EPP Requeridos'] || row['EPP'] || row.eppSeleccionados || '';
                        const entrenamientosStr = row['Entrenamientos Requeridos'] || row['Entrenamientos'] || row.entrenamientosSeleccionados || '';
                        const controlesFuenteStr = row['Controles en la Fuente'] || row['Controles Fuente'] || row.controlesFuenteSeleccionados || '';
                        const controlesMedioStr = row['Controles en el Medio'] || row['Controles Medio'] || row.controlesMedioSeleccionados || '';

                        const descValue = 
                            row['Descripción Detallada'] || 
                            row['Descripcion Detallada'] || 
                            row['Descripción detallada'] || 
                            row['Descripcion detallada'] || 
                            row['Descripción'] || 
                            row['Descripcion'] || 
                            row['contextoAdicional'] || 
                            row.contextoAdicional || 
                            '';

                        const rawVinculacion = 
                            row['Tipo de Vinculación'] || 
                            row['Tipo de vinculación'] || 
                            row['Vinculación'] || 
                            row['Tipo de Contrato'] || 
                            row['Tipo de contrato'] || 
                            row.tipoContrato || 
                            'Contrato laboral a término indefinido';

                        return {
                            id: crypto.randomUUID(),
                            nombreCargo: row['Nombre del Cargo'] || row['Nombre de Cargo'] || row['Cargo'] || row.nombreCargo || '',
                            area: row['Área'] || row['Area'] || row.area || '',
                            nivelCargo: row['Nivel del Cargo'] || row['Nivel de Cargo'] || row.nivelCargo || 'Operativo',
                            sectorOrganizacion: row['Sector Organización'] || row['Sector de la Organización'] || row['Sector'] || row.sectorOrganizacion || 'Sector privado',
                            tipoContrato: normalizeVinculacion(rawVinculacion),
                            jornada: row['Jornada'] || row.jornada || 'Tiempo completo (8 horas/día)',
                            jefeInmediato: row['Jefe Inmediato'] || row['Jefe inmediato'] || row.jefeInmediato || '',
                            escalasSalarial: row['Escala Salarial'] || row['Escala salarial'] || row.escalasSalarial || '',
                            numVacantes: row['Número de Vacantes'] || row['Numero de Vacantes'] || row['Nº de Vacantes'] || row['Nº Vacantes'] || row.numVacantes || '',
                            contextoAdicional: descValue,
                            exigenciaFisica: row['Exigencia Física'] || row['Exigencia Fisica'] || row.exigenciaFisica || '',
                            exigenciaMental: row['Exigencia Mental'] || row.exigenciaMental || '',
                            operaMaquinaria: row['Opera Maquinaria'] || row['Opera maquinaria'] || row.operaMaquinaria || '',
                            eppSeleccionados: eppStr ? eppStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
                            entrenamientosSeleccionados: entrenamientosStr ? entrenamientosStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
                            controlesFuenteSeleccionados: controlesFuenteStr ? controlesFuenteStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
                            controlesMedioSeleccionados: controlesMedioStr ? controlesMedioStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
                            report: row['Reporte Generado'] || row.report || '',
                            images: {},
                            video: null
                        };
                    });

                    setPerfiles(prev => {
                        const cleanPrev = (prev.length === 1 && !prev[0].nombreCargo) ? [] : prev;
                        const combined = [...cleanPrev, ...newPerfiles];
                        if (combined.length > 0 && (!activePerfilId || !prev.find(p => p.id === activePerfilId)?.nombreCargo)) {
                            setActivePerfilId(combined[0].id);
                            setFormData(combined[0]);
                            setGeneratedReport(combined[0].report || null);
                            editorContentRef.current = combined[0].report || '';
                            liveEditorRef.current?.setHTML(combined[0].report || '');
                        }
                        saveImportedPerfiles(combined);
                        return combined;
                    });

                    showToast({ message: `${newPerfiles.length} perfiles de cargo importados correctamente`, severity: NotificationSeverity.SUCCESS });
                } else {
                    // Ruta B: Excel No Estándar -> Procesar con IA
                    requestAiImport();
                }
            } catch (err) {
                console.error("Error importing Excel:", err);
                showToast({ message: 'Error al importar archivo Excel. Verifica el formato.', severity: NotificationSeverity.ERROR });
            }
        };
        reader.readAsArrayBuffer(file);
        if (e.target) e.target.value = '';
    };

    // Nueva función para ejecutar la importación por IA
    const handleConfirmAiImport = async () => {
        if (!pendingFileData) return;
        setIsConfirmModalOpen(false);
        setIsAiImportLoading(true);
        try {
            const res = await fetch('/api/sgsst/perfiles-cargo/import-file', {
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
            if (data.success && data.perfiles) {
                const nuevosPerfiles = data.perfiles.map((p: any) => ({
                    ...p,
                    id: crypto.randomUUID(),
                    images: {},
                    video: null,
                    report: p.report || ''
                }));

                setPerfiles(prev => {
                    const cleanPrev = (prev.length === 1 && !prev[0].nombreCargo) ? [] : prev;
                    const combined = [...cleanPrev, ...nuevosPerfiles];
                    if (combined.length > 0 && (!activePerfilId || !prev.find(p2 => p2.id === activePerfilId)?.nombreCargo)) {
                        setActivePerfilId(combined[0].id);
                        setFormData(combined[0]);
                        setGeneratedReport(combined[0].report || null);
                        editorContentRef.current = combined[0].report || '';
                        liveEditorRef.current?.setHTML(combined[0].report || '');
                    }
                    saveImportedPerfiles(combined);
                    return combined;
                });

                showToast({
                    message: `Se han extraído ${nuevosPerfiles.length} perfiles con IA exitosamente.`,
                    severity: NotificationSeverity.SUCCESS
                });
            }
        } catch (err: any) {
            console.error('Error importing with AI:', err);
            showToast({
                message: `Error al procesar con IA: ${err.message}`,
                severity: NotificationSeverity.ERROR
            });
        } finally {
            setIsAiImportLoading(false);
            setPendingFileData(null);
        }
    };

    // ─── Save Data ────────────────────────────────────────────────────────────
    const handleSaveData = async (silent = false) => {
        if (!token) return;
        const editedReport = editorContentRef.current || generatedReport || undefined;
        const updatedPerfiles = perfiles.map(p => (p.id === activePerfilId ? { ...formData, report: editedReport || p.report } : p));
        setPerfiles(updatedPerfiles);
        try {
            const res = await fetch('/api/sgsst/perfiles-cargo/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ perfilesList: updatedPerfiles }),
            });
            if (res.ok && !silent) showToast({ message: 'Guardado exitosamente', severity: NotificationSeverity.SUCCESS });
        } catch {
            if (!silent) showToast({ message: 'Error al guardar', severity: NotificationSeverity.ERROR });
        }
    };

    // ─── Generation ─────────────────────────────────────────────────────────────
    const handleGenerate = useCallback(async () => {
        if (!formData.nombreCargo.trim()) {
            showToast({ message: 'Por favor ingresa el nombre del cargo', severity: NotificationSeverity.WARNING });
            return;
        }
        setIsGenerating(true);
        handleSaveData(true);
        try {
            const res = await fetch('/api/sgsst/perfiles-cargo/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ perfilData: formData, modelName: selectedModel }),
            });
            if (!res.ok) throw new Error('Error al generar el perfil');
            const data = await res.json();
            setGeneratedReport(data.report);
            editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId(null);
            setReportMessageId(null);
            setIsFormExpanded(false);
            // Persist report in list immediately
            setPerfiles(prev => prev.map(p => p.id === activePerfilId ? { ...p, report: data.report } : p));
            showToast({ message: 'Perfil generado con éxito ✅', severity: NotificationSeverity.SUCCESS });
        } catch (error: any) {
            showToast({ message: error.message || 'Error al generar', severity: NotificationSeverity.ERROR });
        } finally {
            setIsGenerating(false);
        }
    }, [formData, selectedModel, token, showToast, activePerfilId]);

    // ─── Report History (Independent) ──────────────────────────────────────────
    const handleSaveReport = useCallback(async () => {
        const content = editorContentRef.current || generatedReport;
        if (!content || !token || !activePerfilId) return;
        setIsSaving(true);
        try {
            const reportTag = `sgsst-perfil-cargo-${activePerfilId}`;
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    content,
                    title: `Perfil: ${formData.nombreCargo} - ${new Date().toLocaleDateString()}`,
                    tags: ['sgsst-perfil-cargo', reportTag],
                }),
            });
            if (res.ok) {
                // 1. Update in-memory state so the editor shows the saved content
                setGeneratedReport(content);
                // 2. Persist edited content to perfiles-cargo DB so it survives reload
                const updatedPerfiles = perfiles.map(p =>
                    p.id === activePerfilId ? { ...p, report: content } : p
                );
                setPerfiles(updatedPerfiles);
                await fetch('/api/sgsst/perfiles-cargo/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ perfilesList: updatedPerfiles }),
                });
                setRefreshTrigger(prev => prev + 1);
                showToast({ message: 'Guardado exitosamente', severity: NotificationSeverity.SUCCESS });
            }
        } catch (error: any) {
            showToast({ message: `Error: ${error.message}`, severity: NotificationSeverity.ERROR });
        } finally {
            setIsSaving(false);
        }
    }, [generatedReport, token, activePerfilId, formData.nombreCargo, showToast]);

    const handleSelectReport = useCallback(
        async (selectedConvoId: string) => {
            try {
                const res = await fetch(`/api/messages/${selectedConvoId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error('Load failed');
                const messages = await res.json();
                const lastMsg = messages[messages.length - 1];
                if (lastMsg?.text) {
                    setGeneratedReport(lastMsg.text);
                    editorContentRef.current = lastMsg.text;
                    liveEditorRef.current?.setHTML(lastMsg.text);
                    setIsFormExpanded(false);
                    showToast({ message: 'Reporte cargado desde el historial', severity: NotificationSeverity.SUCCESS });
                }
            } catch {
                showToast({ message: 'Error al cargar reporte', severity: NotificationSeverity.ERROR });
            }
            setIsHistoryOpen(false);
        },
        [token, showToast],
    );

    const handleLoadDummyData = async () => {
        try {
            const dummyProfiles = (generateDummyData.perfilesCargo?.() || []) as PerfilCargoData[];
            if (!dummyProfiles.length) {
                showToast({ message: 'No hay perfiles de prueba disponibles', severity: NotificationSeverity.ERROR });
                return;
            }

            setPerfiles(dummyProfiles);
            setActivePerfilId(dummyProfiles[0].id);
            setFormData(dummyProfiles[0]);
            setGeneratedReport(null);
            editorContentRef.current = '';
            liveEditorRef.current?.setHTML('');

            const res = await fetch('/api/sgsst/perfiles-cargo/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ perfilesList: dummyProfiles }),
            });
            if (res.ok) {
                window.dispatchEvent(new CustomEvent('wappy-reload-sgsst-data'));
                showToast({ message: 'Base de datos completada con 20 perfiles de construcción con fotos y videos', severity: NotificationSeverity.SUCCESS });
            } else {
                throw new Error('Error al responder el servidor');
            }
        } catch(e: any) {
            console.error('[PerfilesCargo] Error loading dummy data:', e);
            showToast({ message: e?.message || 'Error al guardar los perfiles en la base de datos', severity: NotificationSeverity.ERROR });
        }
    };

    // ─── Render Field helper ──────────────────────────────────────────────────
    const renderField = (field: any) => {
        const baseClass =
            'w-full min-h-[48px] rounded-2xl border border-border-medium/60 px-4 py-2.5 text-sm bg-surface-primary/70 text-text-primary focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:shadow-[0_0_15px_rgba(20,184,166,0.15)] transition-all duration-300 hover:border-teal-500/80 hover:shadow-[0_0_15px_rgba(20,184,166,0.08)] shadow-sm font-medium';
        if (field.type === 'select') {
            let selectOptions = field.options;
            let currentVal = (formData as any)[field.key] || '';

            if (field.key === 'sectorOrganizacion') {
                currentVal = formData.sectorOrganizacion || 'Sector privado';
            } else if (field.key === 'tipoContrato') {
                currentVal = normalizeVinculacion(formData.tipoContrato || 'Contrato laboral a término indefinido');
                selectOptions = getVinculacionOptionsForSector(formData.sectorOrganizacion || 'Sector privado', currentVal);
            }

            return (
                <SingleSelect
                    value={currentVal}
                    onChange={val => {
                        handleInput(field.key as keyof PerfilCargoData, val);
                        if (field.key === 'sectorOrganizacion') {
                            if (val === 'Sector público') {
                                const isPublic = VINCULACION_PUBLICO_OPTIONS.includes(formData.tipoContrato) || VINCULACION_OTRAS_OPTIONS.includes(formData.tipoContrato);
                                if (!isPublic) {
                                    handleInput('tipoContrato', 'Empleado público de carrera administrativa');
                                }
                            } else if (val === 'Sector privado') {
                                const isPrivate = VINCULACION_PRIVADO_OPTIONS.includes(formData.tipoContrato) || VINCULACION_OTRAS_OPTIONS.includes(formData.tipoContrato);
                                if (!isPrivate) {
                                    handleInput('tipoContrato', 'Contrato laboral a término indefinido');
                                }
                            }
                        }
                    }}
                    options={selectOptions}
                    className="w-full min-h-[48px] rounded-2xl border border-border-medium/60 px-4 py-2.5 text-sm bg-surface-primary/70 text-text-primary transition-all duration-300 hover:border-teal-500/80 hover:shadow-[0_0_15px_rgba(20,184,166,0.08)] shadow-sm font-medium"
                />
            );
        }
        return (
            <input
                type={field.type || 'text'}
                value={(formData as any)[field.key] || ''}
                onChange={e => handleInput(field.key as keyof PerfilCargoData, e.target.value)}
                placeholder={field.placeholder}
                className={baseClass}
            />
        );
    };

    const actionButtonClass = "group flex items-center px-4 py-2 bg-surface-primary border border-border-medium hover:bg-surface-hover text-text-primary rounded-full transition-all duration-300 shadow-sm font-semibold text-sm hover:scale-105 active:scale-95 transform cursor-pointer";

    if (selectedWorkerId) {
        return (
            <BioIndividuoDashboard 
                workerId={selectedWorkerId} 
                onBack={() => setSelectedWorkerId(null)} 
            />
        );
    }

    return (
        <div className="w-full overflow-x-hidden space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── Toolbar ── */}
            <SGSSTToolbar
                onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                isHistoryOpen={isHistoryOpen}
                onAnalyze={handleGenerate}
                isAnalyzing={isGenerating}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSaveLocal={() => handleSaveData(false)}
                hasContent={!!generatedReport}
                exportContent={editorContentRef.current || generatedReport || ''}
                exportFileName={`Perfil_${formData.nombreCargo.replace(/\s+/g, '_')}`}
                onDummy={handleLoadDummyData}
                onImportExcel={() => fileInputRef.current?.click()}
                importExcelLabel="Importar Archivo"
                importExcelTitle="Importar desde Excel, PDF o Word"
                onExportExcel={handleExportExcel}
                hasData={perfiles.length > 0}
            />

            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-900 via-teal-800 to-cyan-900 p-8 text-white shadow-2xl">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-teal-400 blur-3xl -mr-20 -mt-20" />
                    <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full bg-cyan-400 blur-3xl -ml-10 -mb-10" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-teal-400/20 backdrop-blur-sm border border-teal-400/30 flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-teal-300" />
                        </div>
                        <h1 className="text-2xl font-black tracking-tight">Perfiles de Cargo Biocéntricos</h1>
                    </div>
                    <p className="text-teal-100/80 text-sm max-w-2xl leading-relaxed">
                        Diseño ergonómico y operacional de perfiles de rol. Define exigencias físicas y cognitivas, equipos de protección requeridos (EPP) y controles de ingeniería en el puesto de trabajo.
                    </p>
                </div>
            </div>

            {/* ── History (Filtered by Profile ID) ── */}
            {/* ── History (Filtered by Profile ID) ── */}
            <ReportHistory
                onSelectReport={handleSelectReport}
                isOpen={isHistoryOpen}
                toggleOpen={() => setIsHistoryOpen(false)}
                refreshTrigger={refreshTrigger}
                tags={['sgsst-perfil-cargo', `sgsst-perfil-cargo-${activePerfilId}`]}
            />

            {/* ── Profiles Quick Access ── */}
            <div className="rounded-3xl border border-border-medium/40 bg-gradient-to-br from-surface-secondary/80 to-surface-primary/50 backdrop-blur-md p-6 shadow-xl border-l-4 border-l-teal-500/80 transition-all hover:shadow-2xl hover:border-teal-500/20">
                <div className="flex items-center justify-between mb-5 px-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center border border-teal-500/20">
                            <Briefcase className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
                        </div>
                        <span className="text-xs font-black text-text-primary dark:text-text-primary uppercase tracking-widest bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">Listado de Perfiles</span>
                    </div>
                    <button
                        onClick={handleAddPerfil}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 text-teal-700 dark:text-teal-300 rounded-2xl text-xs font-black border border-teal-500/20 dark:border-teal-400/20 hover:from-teal-500/20 hover:to-cyan-500/20 hover:border-teal-500/40 transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95 transform duration-300"
                    >
                        <Plus className="h-4 w-4" /> Nuevo Cargo
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {perfiles.map(p => {
                        const isActive = activePerfilId === p.id;
                        return (
                            <div 
                                key={p.id} 
                                className={cn(
                                    "group relative flex flex-col justify-between p-5 rounded-3xl transition-all duration-300 cursor-pointer border select-none transform overflow-hidden h-[150px] shadow-sm hover:shadow-md",
                                    isActive 
                                        ? "bg-gradient-to-br from-teal-900 via-teal-850 to-cyan-900 text-white border-transparent ring-2 ring-teal-500/20 shadow-[0_4px_20px_rgba(20,184,166,0.25)] hover:scale-[1.02] active:scale-[0.98]" 
                                        : "bg-surface-primary/70 text-text-secondary border-border-medium/60 hover:border-teal-500/50 hover:text-text-primary hover:shadow-[0_4px_20px_rgba(20,184,166,0.1)] hover:bg-surface-secondary/90 hover:scale-[1.02] active:scale-[0.98] dark:bg-surface-primary/20"
                                )}
                                onClick={() => {
                                    handleSelectPerfil(p.id);
                                    setSummaryPerfil(p);
                                }}
                            >
                                {/* Active subtle top glowing bar */}
                                {isActive && (
                                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 to-cyan-400 shadow-[0_0_10px_rgba(45,212,191,0.8)]" />
                                )}

                                <div className="space-y-2">
                                    <div className="flex items-start justify-between">
                                        <div className={cn(
                                            "flex items-center justify-center w-8 h-8 rounded-2xl shadow-inner transition-colors",
                                            isActive ? "bg-white/20 text-white" : "bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400"
                                        )}>
                                            <Briefcase className="w-4.5 h-4.5" />
                                        </div>
                                        {/* Delete Button */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeletePerfil(p.id); }}
                                            className={cn(
                                                "p-1.5 rounded-xl transition-all duration-200 opacity-0 group-hover:opacity-100",
                                                isActive 
                                                    ? "hover:bg-red-500 hover:text-white text-white/70" 
                                                    : "hover:bg-red-50 hover:text-red-600 text-text-tertiary dark:hover:bg-red-900/30 dark:text-red-400"
                                            )}
                                            title="Eliminar cargo"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="pt-1">
                                        <h5 className={cn(
                                            "font-extrabold text-xs tracking-tight leading-tight line-clamp-2",
                                            isActive ? "text-white font-black" : "text-text-primary"
                                        )}>
                                            {p.nombreCargo || 'Cargo sin nombre'}
                                        </h5>
                                        <p className={cn(
                                            "text-[9px] font-black uppercase tracking-wider mt-1 truncate",
                                            isActive ? "text-teal-200" : "text-text-tertiary"
                                        )}>
                                            {p.area || 'Sin área asignada'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-border-medium/20 mt-auto">
                                    <span className={cn(
                                        "text-[9px] font-black uppercase px-2 py-0.5 rounded-md",
                                        isActive 
                                            ? "bg-white/10 text-white" 
                                            : "bg-surface-secondary text-text-secondary border border-border-medium/30"
                                    )}>
                                        {p.nivelCargo ? p.nivelCargo.split(' ')[0] : 'Nivel N/A'}
                                    </span>
                                    {p.numVacantes && (
                                        <span className={cn(
                                            "text-[9px] font-extrabold",
                                            isActive ? "text-cyan-200" : "text-teal-600 dark:text-teal-400"
                                        )}>
                                            {p.numVacantes} {Number(p.numVacantes) === 1 ? 'vacante' : 'vacantes'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Core Form ── */}
            <div className="rounded-3xl border border-border-medium/40 bg-gradient-to-br from-surface-secondary/90 to-surface-primary/70 backdrop-blur-lg shadow-2xl p-6 md:p-8 space-y-10 border-l-4 border-l-cyan-500/80 transition-all duration-500 hover:shadow-cyan-500/5 hover:border-cyan-500/20 animate-in fade-in duration-300">
                <div className="space-y-8">
                    {FIELD_SECTIONS.map(section => (
                        <div key={section.title} className="space-y-5 bg-surface-primary/30 backdrop-blur-md p-6 rounded-3xl border border-border-medium/20 shadow-xl relative transition-all duration-300 hover:shadow-2xl hover:border-teal-500/20">
                            <div className="flex items-center gap-3 pb-3 border-b border-border-medium/30">
                                <div className="p-2.5 bg-gradient-to-br from-teal-500/15 to-cyan-500/15 dark:from-teal-400/15 dark:to-cyan-400/15 border border-teal-500/20 dark:border-teal-400/20 rounded-2xl shrink-0 shadow-sm">{section.icon}</div>
                                <h4 className="font-extrabold text-sm bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-600 dark:from-teal-300 dark:to-cyan-300 bg-clip-text text-transparent uppercase tracking-wider">{section.title}</h4>
                            </div>
                            <div className={cn("grid gap-5", section.fields.length >= 5 ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4")}>
                                {section.fields.map(field => (
                                    <div key={field.key} className="flex flex-col justify-end h-full space-y-2">
                                        <label className="text-[11px] font-extrabold text-text-secondary uppercase tracking-wider">
                                            {field.label}
                                        </label>
                                        <div className="mt-auto">
                                            {renderField(field)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <div className="space-y-5 bg-surface-primary/30 backdrop-blur-md p-6 rounded-3xl border border-border-medium/20 shadow-xl relative transition-all duration-300 hover:shadow-2xl hover:border-teal-500/20">
                        <div className="flex items-center gap-3 pb-3 border-b border-border-medium/30">
                            <div className="p-2.5 bg-gradient-to-br from-teal-500/15 to-cyan-500/15 dark:from-teal-400/15 dark:to-cyan-400/15 border border-teal-500/20 dark:border-teal-400/20 rounded-2xl shrink-0 shadow-sm"><Shield className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" /></div>
                            <h4 className="font-extrabold text-sm bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-600 dark:from-teal-300 dark:to-cyan-300 bg-clip-text text-transparent uppercase tracking-wider">Controles y Equipos de Protección</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <MultiSelect
                                label="Controles en la Fuente (Ingeniería / Diseño)"
                                placeholder="Seleccionar controles en la fuente..."
                                options={CONTROLES_FUENTE_OPTIONS}
                                selected={formData.controlesFuenteSeleccionados || []}
                                onChange={(val) => handleInput('controlesFuenteSeleccionados', val)}
                            />
                            <MultiSelect
                                label="Controles en el Medio (Organización / Entorno)"
                                placeholder="Seleccionar controles en el medio..."
                                options={CONTROLES_MEDIO_OPTIONS}
                                selected={formData.controlesMedioSeleccionados || []}
                                onChange={(val) => handleInput('controlesMedioSeleccionados', val)}
                            />
                            <MultiSelect
                                label="EPP Requeridos (GTC 45 / Res. 4272)"
                                placeholder="Seleccionar EPP..."
                                options={EPP_OPTIONS}
                                selected={formData.eppSeleccionados}
                                onChange={(val) => handleInput('eppSeleccionados', val)}
                            />
                            <MultiSelect
                                label="Entrenamiento / Certificación SST"
                                placeholder="Seleccionar capacitación..."
                                options={ENTRENAMIENTO_OPTIONS}
                                selected={formData.entrenamientosSeleccionados}
                                onChange={(val) => handleInput('entrenamientosSeleccionados', val)}
                            />
                        </div>
                    </div>

                    {/* Microphone Interface (Matching Alturas Permit) */}
                    <div className="space-y-4 pt-4 border-t border-border-medium">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-teal-600" /> Descripción Detallada (Dictado o Texto)
                            </h4>
                            <button
                                onClick={handleVoiceInput}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all shadow-md border flex items-center gap-2.5 hover:scale-105 active:scale-95 transform",
                                    isListening 
                                        ? "bg-red-50 text-red-600 border-red-200 animate-pulse" 
                                        : "bg-surface-secondary hover:bg-surface-hover text-text-primary border-border-light"
                                )}
                            >
                                <span className="relative flex h-3 w-3">
                                    {isListening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                                    <span className={cn("relative inline-flex rounded-full h-3 w-3", isListening ? "bg-red-500" : "bg-teal-500")}></span>
                                </span>
                                {isListening ? 'Escuchando...' : 'Activar Micrófono'}
                            </button>
                        </div>
                        <div className="relative group">
                            <textarea
                                value={formData.contextoAdicional + (interimText ? (formData.contextoAdicional && !formData.contextoAdicional.endsWith(' ') ? ' ' : '') + interimText : '')}
                                onChange={e => {
                                    if (!isListening) {
                                        handleInput('contextoAdicional', e.target.value);
                                    }
                                }}
                                readOnly={isListening}
                                placeholder="Ej: Describe aquí funciones específicas, equipos a operar, o condiciones especiales de riesgo..."
                                className={cn(
                                    "w-full rounded-2xl border-2 p-5 text-sm text-text-primary min-h-[180px] transition-all duration-300 focus:outline-none shadow-inner",
                                    isListening 
                                        ? "border-solid border-red-300 bg-red-50/10 focus:border-red-400" 
                                        : "border-dashed border-teal-500/30 bg-surface-primary/50 text-text-primary placeholder:text-text-tertiary focus:bg-surface-primary/80 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:shadow-[0_0_15px_rgba(20,184,166,0.15)]"
                                )}
                            />
                            {!isListening && (
                                <div className="absolute top-4 right-4 text-teal-200 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <FileText className="h-5 w-5" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── SECCIÓN: Registro Fotográfico de Evidencias ── */}
                    <div className="space-y-4 pt-4 border-t border-border-medium/60">
                        <h4 className="font-extrabold text-sm text-text-primary flex items-center gap-2">
                            <Camera className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" /> Registro Fotográfico del Cargo
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {['foto1', 'foto2', 'foto3'].map((foto, idx) => {
                                const labels = ['Actividad Principal', 'Ambiente de Trabajo', 'Controles / Herramientas'];
                                const fieldName = foto as 'foto1' | 'foto2' | 'foto3';
                                const descName = `${foto}Desc`;
                                return (
                                    <div key={foto} className="flex flex-col items-center gap-3">
                                        <span className="font-extrabold text-xs text-text-secondary text-center uppercase tracking-wide">{labels[idx]}</span>
                                        <div className="relative w-full aspect-square bg-surface-primary/40 hover:bg-surface-primary/70 dark:bg-surface-primary/10 dark:hover:bg-surface-primary/20 rounded-3xl border-2 border-dashed border-teal-500/30 dark:border-teal-500/20 flex flex-col items-center justify-center overflow-hidden hover:border-teal-500 focus-within:ring-4 focus-within:ring-teal-500/10 transition-all duration-300 shadow-lg">
                                            {formData.images?.[fieldName] ? (
                                                <>
                                                    <img
                                                        src={formData.images[fieldName] as string}
                                                        className="w-full h-full object-cover"
                                                        alt={labels[idx]}
                                                        onError={() => {
                                                            removeImage(fieldName);
                                                        }}
                                                    />
                                                    <button onClick={() => removeImage(fieldName)} className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white hover:bg-red-500 transition-colors">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-teal-500 transition-colors">
                                                    <Camera className="h-8 w-8 mb-2 text-text-tertiary" />
                                                    <span className="text-xs font-bold text-center px-4">Subir foto</span>
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(fieldName, e)} />
                                                </label>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Descripción de la foto..."
                                            value={formData.images?.[descName as keyof typeof formData.images] || ''}
                                            onChange={e => handleImageDescUpdate(descName, e.target.value)}
                                            className="w-full rounded-2xl border border-border-medium/60 px-4 py-2.5 text-xs bg-surface-primary/70 text-text-primary focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:shadow-[0_0_10px_rgba(20,184,166,0.15)] transition-all hover:border-teal-500/80 shadow-sm font-medium"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── SECCIÓN: Evidencia en Video ── */}
                    <div className="space-y-4 pt-4 border-t border-border-medium/60">
                        <div className="flex items-center justify-between">
                            <h4 className="font-extrabold text-sm text-text-primary flex items-center gap-2">
                                <Film className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" /> Video de la Actividad (Opcional)
                            </h4>
                            <span className="text-[10px] bg-teal-100/50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 px-3 py-1 rounded-full font-black uppercase border border-teal-200/50 dark:border-teal-800/40">Máximo 10 Segundos</span>
                        </div>

                        <div className="bg-surface-primary/30 border-2 border-dashed border-teal-500/30 rounded-3xl p-6 transition-all duration-300 hover:bg-surface-primary/50 hover:border-teal-500 hover:shadow-xl">
                            {!formData.video ? (
                                <div className="flex flex-col items-center justify-center space-y-3">
                                    <div className="w-16 h-16 bg-teal-500/10 dark:bg-teal-400/10 border border-teal-500/20 rounded-full flex items-center justify-center text-teal-600 dark:text-teal-400">
                                        {isVideoUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Video className="h-8 w-8" />}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-extrabold text-text-primary uppercase tracking-wide">Sube un video corto de la labor</p>
                                        <p className="text-xs text-text-secondary mt-1">Suministra contexto dinámico para autocompletar la Matriz IPEVAR</p>
                                    </div>
                                    <label className="cursor-pointer bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-600 hover:scale-105 active:scale-95 text-white px-6 py-2.5 rounded-2xl text-xs font-black transition-all shadow-lg duration-300">
                                        {isVideoUploading ? 'Procesando...' : 'Seleccionar Video'}
                                        <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isVideoUploading} />
                                    </label>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-w-md mx-auto shadow-2xl border-2 border-teal-500/50">
                                        <video src={formData.video} controls className="w-full h-full" />
                                        <button onClick={removeVideo} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 transition-colors z-10">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Normative Badge Re-styled */}
                <div className="px-6 py-4 bg-teal-500/5 dark:bg-teal-900/10 border-t border-border-medium/60 flex items-center gap-3 rounded-b-3xl">
                    <CheckCircle2 className="h-5 w-5 text-teal-500" />
                    <span className="text-[11px] font-black text-teal-800 dark:text-teal-300 uppercase tracking-widest">
                        Cumple Art. 16 de la Resolución 1843 de 2025 & GTC 45 (2012)
                    </span>
                </div>
            </div>

            {/* Workers Profile List (Bio-Individuos) */}
            {activePerfilId && (
                <WorkersProfileList 
                    perfilId={activePerfilId} 
                    perfilNombre={formData.nombreCargo || 'Cargo seleccionado'} 
                    onSelectWorker={(workerId) => setSelectedWorkerId(workerId)} 
                />
            )}

            {/* Generated Report View */}
                <CollapsibleReportBox onSave={handleSaveReport}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
                    title="Perfil de Cargos"
                    icon={<FileText className="h-5 w-5" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_PerfilesCargo"
                            reportType="general"
                        />
                    }
                >
                    <div style={{ minHeight: '400px', overflowX: 'auto', width: '100%' }}>
                         <div style={{ minWidth: '100%', padding: '24px' }}>
                            <LiveEditor
                                ref={liveEditorRef}
                                initialContent={generatedReport || ''}
                                onUpdate={(html) => { editorContentRef.current = html; }}
                                reportSourceData={{ formData, perfiles }}
                            />
                        </div>
                    </div>
                </CollapsibleReportBox>

            {/* ── Summary Profile Popup Modal (Premium Glassmorphism) ── */}
            {/* ── Summary Profile Popup Modal (Estilo Auditoría Biocéntrica - Portalizado) ── */}
            {summaryPerfil && ReactDOM.createPortal(
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setSummaryPerfil(null)}
                >
                    <div 
                        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border-medium bg-surface-secondary shadow-2xl animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border-medium px-6 py-5 bg-surface-primary/50 backdrop-blur-md">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-center justify-center h-14 w-14 rounded-full border-2 border-teal-500 bg-teal-50 dark:bg-teal-900/20 font-bold text-xl text-teal-600 shadow-inner">
                                    <Briefcase className="h-6 w-6 text-teal-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                                        Resumen de Perfil de Cargo
                                    </h2>
                                    <p className="text-sm text-text-secondary mt-0.5">
                                        <span className="font-semibold text-text-primary">{summaryPerfil.nombreCargo || 'Cargo sin nombre'}</span> — {summaryPerfil.area || 'Sin área asignada'}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setSummaryPerfil(null)} 
                                className="rounded-xl p-2 text-text-secondary hover:bg-surface-hover transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                            
                            {/* Caja de Explicación del Perfil */}
                            <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 flex gap-4">
                                <div className="mt-1">
                                    <Activity className="h-5 w-5 text-indigo-500" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-1">¿Qué define este Perfil de Cargo?</h4>
                                    <p className="text-sm text-indigo-800/80 dark:text-indigo-400/80 leading-relaxed">
                                        Este perfil establece las exigencias físicas, mentales, controles de seguridad (EPP), entrenamientos requeridos y condiciones operativas para el desempeño seguro y eficiente del cargo de <strong>{summaryPerfil.nombreCargo}</strong> en el área de <strong>{summaryPerfil.area || 'Sin área'}</strong>.
                                    </p>
                                </div>
                            </div>

                            {/* Desglose de Puntos / Requerimientos */}
                            <div>
                                <h3 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
                                    <span className="bg-surface-tertiary px-2.5 py-1 rounded-md text-xs border border-border-light">Detalles y Requerimientos del Cargo</span>
                                </h3>
                                
                                <div className="grid grid-cols-1 gap-3">
                                    {/* Fila 1: Estructura Organizacional */}
                                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border-medium bg-surface-primary/30 transition-all hover:shadow-md">
                                        <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                                            <div className="font-mono font-bold text-base text-text-primary">
                                                ROL
                                            </div>
                                            <div className="text-[9px] uppercase font-bold text-text-secondary">Estructura</div>
                                        </div>
                                        <div className="w-px h-full bg-border-medium self-stretch mx-1"></div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center">
                                                    <MapPin className="h-5 w-5 text-teal-500" />
                                                    <h4 className="font-bold text-sm ml-2 text-text-primary">Estructura Organizacional</h4>
                                                </div>
                                                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-primary px-2 py-0.5 rounded-full border border-border-light">
                                                    <Briefcase className="h-3.5 w-3.5 mr-1" />
                                                    General
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">Jefe Inmediato</span>
                                                    <span className="text-xs font-bold text-text-primary block truncate">{summaryPerfil.jefeInmediato || 'No asignado'}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">Escala Salarial</span>
                                                    <span className="text-xs font-bold text-text-primary block truncate">{summaryPerfil.escalasSalarial || 'No especificada'}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">Jornada Laboral</span>
                                                    <span className="text-xs font-bold text-text-primary block truncate">{summaryPerfil.jornada || 'No especificada'}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">Vacantes / Vinculación</span>
                                                    <span className="text-xs font-bold text-text-primary block truncate">
                                                        {summaryPerfil.tipoContrato || summaryPerfil.nivelCargo || 'Nivel N/A'}
                                                        {summaryPerfil.numVacantes ? ` (${summaryPerfil.numVacantes} Vac)` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fila 2: Exigencias y Operaciones */}
                                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border-medium bg-surface-primary/30 transition-all hover:shadow-md">
                                        <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                                            <div className="font-mono font-bold text-base text-text-primary">
                                                EXIG
                                            </div>
                                            <div className="text-[9px] uppercase font-bold text-text-secondary">Condición</div>
                                        </div>
                                        <div className="w-px h-full bg-border-medium self-stretch mx-1"></div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center">
                                                    <Brain className="h-5 w-5 text-indigo-500" />
                                                    <h4 className="font-bold text-sm ml-2 text-text-primary">Exigencias de Rol y Operación</h4>
                                                </div>
                                                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-primary px-2 py-0.5 rounded-full border border-border-light">
                                                    <Brain className="h-3.5 w-3.5 mr-1" />
                                                    Capacidad
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">Exigencia Física</span>
                                                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 block">{summaryPerfil.exigenciaFisica || 'N/A'}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">Exigencia Mental</span>
                                                    <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 block">{summaryPerfil.exigenciaMental || 'N/A'}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-surface-secondary border border-border-light">
                                                    <span className="text-[8px] font-black uppercase text-text-tertiary block">¿Opera Maquinaria?</span>
                                                    <span className={cn(
                                                        "text-xs font-bold uppercase block",
                                                        summaryPerfil.operaMaquinaria === 'Sí' || summaryPerfil.operaMaquinaria === 'Si'
                                                            ? "text-red-500"
                                                            : "text-text-secondary"
                                                    )}>
                                                        {summaryPerfil.operaMaquinaria || 'No'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fila 3: Equipos de Protección Personal */}
                                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border-medium bg-surface-primary/30 transition-all hover:shadow-md">
                                        <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                                            <div className="font-mono font-bold text-base text-text-primary">
                                                EPP
                                            </div>
                                            <div className="text-[9px] uppercase font-bold text-text-secondary">Seguridad</div>
                                        </div>
                                        <div className="w-px h-full bg-border-medium self-stretch mx-1"></div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center">
                                                    <Shield className="h-5 w-5 text-emerald-500" />
                                                    <h4 className="font-bold text-sm ml-2 text-text-primary">Equipos de Protección Personal</h4>
                                                </div>
                                                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-primary px-2 py-0.5 rounded-full border border-border-light">
                                                    <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                                                    Protección
                                                </span>
                                            </div>
                                            <div className="mt-3">
                                                {summaryPerfil.eppSeleccionados && summaryPerfil.eppSeleccionados.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {summaryPerfil.eppSeleccionados.map((epp, idx) => (
                                                            <span 
                                                                key={idx}
                                                                className="text-[9px] font-bold px-2 py-1 rounded-xl bg-surface-secondary text-text-secondary border border-border-light flex items-center gap-1.5"
                                                            >
                                                                <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                                                {epp}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-text-tertiary italic">No se han seleccionado EPPs para este cargo.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fila 4: Entrenamientos y Capacitación */}
                                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border-medium bg-surface-primary/30 transition-all hover:shadow-md">
                                        <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                                            <div className="font-mono font-bold text-base text-text-primary">
                                                CAP
                                            </div>
                                            <div className="text-[9px] uppercase font-bold text-text-secondary">Formación</div>
                                        </div>
                                        <div className="w-px h-full bg-border-medium self-stretch mx-1"></div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center">
                                                    <BookOpen className="h-5 w-5 text-blue-500" />
                                                    <h4 className="font-bold text-sm ml-2 text-text-primary">Entrenamientos y Capacitaciones</h4>
                                                </div>
                                                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-primary px-2 py-0.5 rounded-full border border-border-light">
                                                    <BookOpen className="h-3.5 w-3.5 mr-1" />
                                                    Desarrollo
                                                </span>
                                            </div>
                                            <div className="mt-3">
                                                {summaryPerfil.entrenamientosSeleccionados && summaryPerfil.entrenamientosSeleccionados.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {summaryPerfil.entrenamientosSeleccionados.map((ent, idx) => (
                                                            <span 
                                                                key={idx}
                                                                className="text-[9px] font-bold px-2 py-1 rounded-xl bg-surface-secondary text-text-secondary border border-border-light flex items-center gap-1.5"
                                                            >
                                                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                                                {ent}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-text-tertiary italic">No se han seleccionado entrenamientos para este cargo.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fila 5: Controles de Prevención (Si aplica) */}
                                    {(summaryPerfil.controlesFuenteSeleccionados?.length || summaryPerfil.controlesMedioSeleccionados?.length) ? (
                                        <div className="flex items-start gap-4 p-4 rounded-xl border border-border-medium bg-surface-primary/30 transition-all hover:shadow-md">
                                            <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                                                <div className="font-mono font-bold text-base text-text-primary">
                                                    CTRL
                                                </div>
                                                <div className="text-[9px] uppercase font-bold text-text-secondary">Prevención</div>
                                            </div>
                                            <div className="w-px h-full bg-border-medium self-stretch mx-1"></div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center">
                                                        <ShieldAlert className="h-5 w-5 text-purple-500" />
                                                        <h4 className="font-bold text-sm ml-2 text-text-primary">Controles Operacionales</h4>
                                                    </div>
                                                    <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-primary px-2 py-0.5 rounded-full border border-border-light">
                                                        <Info className="h-3.5 w-3.5 mr-1" />
                                                        Ingeniería
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                                                    <div className="space-y-1">
                                                        <span className="text-[9px] font-black uppercase text-text-tertiary">En Fuente</span>
                                                        {summaryPerfil.controlesFuenteSeleccionados && summaryPerfil.controlesFuenteSeleccionados.length > 0 ? (
                                                            <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4 font-semibold">
                                                                {summaryPerfil.controlesFuenteSeleccionados.map((ctrl, i) => (
                                                                    <li key={i}>{ctrl}</li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="text-[10px] text-text-tertiary italic">Ninguno</p>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <span className="text-[9px] font-black uppercase text-text-tertiary">En Medio</span>
                                                        {summaryPerfil.controlesMedioSeleccionados && summaryPerfil.controlesMedioSeleccionados.length > 0 ? (
                                                            <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4 font-semibold">
                                                                {summaryPerfil.controlesMedioSeleccionados.map((ctrl, i) => (
                                                                    <li key={i}>{ctrl}</li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="text-[10px] text-text-tertiary italic">Ninguno</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Fila 6: Contexto Adicional (Si aplica) */}
                                    {summaryPerfil.contextoAdicional && (
                                        <div className="flex items-start gap-4 p-4 rounded-xl border border-border-medium bg-surface-primary/30 transition-all hover:shadow-md">
                                            <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                                                <div className="font-mono font-bold text-base text-text-primary">
                                                    DESC
                                                </div>
                                                <div className="text-[9px] uppercase font-bold text-text-secondary">Notas</div>
                                            </div>
                                            <div className="w-px h-full bg-border-medium self-stretch mx-1"></div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center">
                                                        <Info className="h-5 w-5 text-indigo-500" />
                                                        <h4 className="font-bold text-sm ml-2 text-text-primary">Contexto Adicional</h4>
                                                    </div>
                                                    <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface-primary px-2 py-0.5 rounded-full border border-border-light">
                                                        <Info className="h-3.5 w-3.5 mr-1" />
                                                        Información
                                                    </span>
                                                </div>
                                                <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-r from-teal-500/5 to-cyan-500/5 border border-border-medium/30">
                                                    <p className="text-xs text-text-secondary italic leading-relaxed">
                                                        "{summaryPerfil.contextoAdicional}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="border-t border-border-medium px-6 py-4 bg-surface-primary/50 flex justify-end">
                            <button
                                onClick={() => {
                                    setSummaryPerfil(null);
                                }}
                                className="rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-teal-500/10 transition-all hover:scale-105 active:scale-95 transform cursor-pointer"
                            >
                                Ver Ficha Completa y Editar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ═══ Excel/File Import Hidden Input ═══ */}
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
                            Se detectó un documento no estándar o archivo de texto ({pendingFileData?.name}). 
                            ¿Deseas usar la IA (Gemini) de Somos SST para analizar el contenido, extraer las responsabilidades y riesgos, y crear los perfiles de cargo de forma automática?
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
                            Gemini está analizando la información de los cargos y riesgos del documento. Esto puede tardar unos segundos.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PerfilesCargo;
