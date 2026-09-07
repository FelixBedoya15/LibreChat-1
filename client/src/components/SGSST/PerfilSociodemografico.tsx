import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    Loader2,
    Sparkles,
    Image as ImageIcon,
    Upload,
    Download,
    X,
    Inbox,
    CheckCircle,
    PenTool,
    Briefcase,
    AlertTriangle,
    ClipboardList,
    QrCode,
    UserCircle,
    User,
    UserCheck,
    Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import SignaturePad from '~/components/SGSST/SignaturePad';
import SubUserManagerModal from '~/components/SGSST/SubUserManagerModal';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import SingleSelect from './SingleSelect';
import ReportHistory from '~/components/Liva/ReportHistory';

const SCORE_COLOR = (s: number) => {
    if (s >= 80) return { ring: 'border-green-400', text: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
    if (s >= 60) return { ring: 'border-amber-400', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    return { ring: 'border-red-400', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
};
import { QRCodeSVG } from 'qrcode.react';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import SGSSTToolbar, { ToolbarButton } from './SGSSTToolbar';
import cn from '~/utils/cn';
import { exportPerfilSociodemograficoToExcel, type LicenciaConduccionItem } from './exportPerfilSociodemografico';
import CollapsibleReportBox from './CollapsibleReportBox';
import { smartMapExcelToWorkers } from './excelWorkerMapper';

const CATEGORIAS_LICENCIA = [
    'A1',
    'A2',
    'B1',
    'B2',
    'B3',
    'C1',
    'C2',
    'C3',
    'Especial / Maquinaria',
];

const getLicenseBadge = (fecha?: string) => {
    if (!fecha) return { label: 'Sin fecha', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(fecha + 'T12:00:00');
    if (isNaN(expDate.getTime())) return { label: 'Inválida', color: 'bg-gray-100 text-gray-600' };

    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        return { label: `Vencida (${Math.abs(diffDays)}d)`, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    }
    if (diffDays <= 30) {
        return { label: `Por Vencer (${diffDays}d)`, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    }
    return { label: 'Vigente', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
};

// ─── Types ────────────────────────────────────────────────────────────
interface WorkerEntry {
    id: string;
    nombre: string;
    identificacion: string;
    edad: number | '';
    genero: string;
    estadoCivil: string;
    nivelEscolaridad: string;
    direccion: string;
    telefono: string;
    cargo: string;
    fechaExamenMedico: string;
    fechaCursoAlturasAutorizado: string;
    fechaCursoAlturasCoordinador: string;
    diagnosticoMedico: string;
    recomendacionesMedicas: string;
    fechaSeguimiento: string;
    // New Demographic / Medical Fields
        // New Social/Biometric Fields
    fechaNacimiento: string;
    lugarNacimiento: string;
    barrio: string;
    municipioDomicilio: string;
    correoElectronico: string;
    deporte: string;
    alimentacion: string;
    riesgoCardiovascular: string;
    emergenciaContacto: string;
    tipoSangre: string;
    enfermedades: string;
    medicamentos: string;
    fuma: string;
    alcohol: string;
    terapiaPsicologica: string;
    personasCargo: number | '';
    estrato: string;
    vivienda: string;
    // New Conditional Fields (Conductor)
    soatVencimiento: string;
    tecnicomecanicaVencimiento: string;
    licenciaConduccion: string;
    licenciaConduccionVencimiento: string;
    licenciasConduccion?: LicenciaConduccionItem[];

    // New Conditional Fields (SGSST)
    licenciaSST: string;
    licenciaVencimiento: string;
    curso50h: string;
    curso20h: string;

    // Comités
    esCopasst: string;
    esComiteConvivencia: string;
    esBrigadista: string;
    esComiteSeguridadVial: string;

    // Formación (lista JSON o similar)
    formacion: any[];

    // Bio-Fit Engine (Índice Biocéntrico)
    biocentricScore?: number;
    biocentricAlerts?: string[];
    biocentricIsLethal?: boolean;

    // New Biomonitoring Fields
    peso: string;
    talla: string;
    imc: string;
    presionArterial: string;
    frecuenciaCardiaca: string;
    limitacionesBiomecanicas: string;
    alergiasQuimicas: string;

    completedByAI: boolean;
    consentimientoFirmaDigital: string;
    firmaDigital: string | null;
}

const EMPTY_WORKER: Omit<WorkerEntry, 'id'> = {
    nombre: '', identificacion: '', edad: '', genero: '', estadoCivil: '',
    nivelEscolaridad: '', direccion: '', telefono: '', cargo: '',
    fechaExamenMedico: '', fechaCursoAlturasAutorizado: '', fechaCursoAlturasCoordinador: '',
    diagnosticoMedico: '', recomendacionesMedicas: '', fechaSeguimiento: '',
        fechaNacimiento: '', lugarNacimiento: '', barrio: '', municipioDomicilio: '', correoElectronico: '', deporte: '', alimentacion: '', riesgoCardiovascular: '',
    emergenciaContacto: '', tipoSangre: '', enfermedades: '', medicamentos: '',
    fuma: '', alcohol: '', terapiaPsicologica: '', personasCargo: '',
    estrato: '', vivienda: '', soatVencimiento: '', tecnicomecanicaVencimiento: '',
    licenciaConduccion: '', licenciaConduccionVencimiento: '',
    licenciasConduccion: [],
    licenciaSST: '', licenciaVencimiento: '', curso50h: '', curso20h: '',
    esCopasst: 'No', esComiteConvivencia: 'No', esBrigadista: 'No', esComiteSeguridadVial: 'No',
    formacion: [],
    peso: '', talla: '', imc: '', presionArterial: '', frecuenciaCardiaca: '',
    limitacionesBiomecanicas: '', alergiasQuimicas: '',
    completedByAI: false, consentimientoFirmaDigital: 'No', firmaDigital: null,
};

const PerfilSociodemografico = () => {
    const { token, user } = useAuthContext();
    const { showToast } = useToastContext();

    const [trabajadores, setTrabajadores] = useState<WorkerEntry[]>([]);
    const [workerTabs, setWorkerTabs] = useState<Record<string, string>>({});
    const [activeSignatureWorkerId, setActiveSignatureWorkerId] = useState<string | null>(null);

    const [selectedModel, setSelectedModel] = useState(user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');

    useEffect(() => {
        if (user?.personalization?.geminiModels?.sstManagement) {
            setSelectedModel(user.personalization.geminiModels.sstManagement);
        }
    }, [user?.personalization?.geminiModels?.sstManagement]);
    const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingFull, setIsGeneratingFull] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [cargosDisponibles, setCargosDisponibles] = useState<any[]>([]);

    // Report state
    const [generatedReport, setGeneratedReport] = useState<string | null>(null);
    const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [conversationId, setConversationId] = useState('new');
    const [reportMessageId, setReportMessageId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // QR Code Modal State
    const [selectedQrWorker, setSelectedQrWorker] = useState<WorkerEntry | null>(null);
    const [qrTab, setQrTab] = useState<'profile' | 'update'>('profile');

    // Inbox: pending profile updates from workers
    const [showInboxPerfil, setShowInboxPerfil] = useState(false);
    const [inboxPerfil, setInboxPerfil] = useState<any[]>([]);
    const [loadingInbox, setLoadingInbox] = useState(false);

    // Public portal QR modal state
    const [showPortalQr, setShowPortalQr] = useState(false);

    // Sub-users Management Modal State
    const [showSubUserManager, setShowSubUserManager] = useState(false);
    const [selectedWorkerDocForSubUser, setSelectedWorkerDocForSubUser] = useState<string>('');
    // ─── Sync Signatures ────────────────────────────────────────
    const syncWorkersSignaturesToStorage = (workers: WorkerEntry[]) => {
        try {
            const namedSigsStr = localStorage.getItem('wappy_signatures');
            const namedSignatures: Record<string, string> = namedSigsStr ? JSON.parse(namedSigsStr) : {};
            let updated = false;

            for (const w of workers) {
                if (w.consentimientoFirmaDigital === 'Sí' && w.firmaDigital && w.nombre) {
                    namedSignatures[w.nombre.trim().toUpperCase()] = w.firmaDigital;
                    updated = true;
                }
            }

            if (updated) {
                localStorage.setItem('wappy_signatures', JSON.stringify(namedSignatures));
                window.dispatchEvent(new Event('storage'));
            }
        } catch (e) {
            console.error('Error syncing worker signatures', e);
        }
    };

    // ─── Load Data ──────────────────────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            if (!token) return;
            setIsLoading(true);
            try {
                const res = await fetch('/api/sgsst/perfil-sociodemografico/data', {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.trabajadores?.length) {
                        setTrabajadores(data.trabajadores);
                        syncWorkersSignaturesToStorage(data.trabajadores);
                    }
                }
            } catch (err) {
                console.error('Error loading perfil sociodemografico:', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [token]);

    useEffect(() => {
        if (!token) return;
        fetch('/api/sgsst/company-info', {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.json())
            .then(info => { if (info && info.companyName) setCompanyInfo(info); })
            .catch(() => { });

        // Load available Cargo Profiles
        fetch('/api/sgsst/perfiles-cargo/data', {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.json())
            .then(data => {
                if (data.perfilesList) {
                    setCargosDisponibles(data.perfilesList);
                }
            })
            .catch(() => { });
    }, [token]);

    // ─── Handlers ───────────────────────────────────────────────
    const handleAddWorker = () => {
        const newWorker: WorkerEntry = { id: crypto.randomUUID(), ...EMPTY_WORKER };
        setTrabajadores(prev => [...prev, newWorker]);
        setExpandedWorkers(prev => new Set(prev).add(newWorker.id));
    };

    const handleDeleteWorker = (workerId: string) => {
        setTrabajadores(prev => prev.filter(w => w.id !== workerId));
    };

    const updateWorkerField = (workerId: string, field: keyof WorkerEntry, value: any) => {
        setTrabajadores(prev => prev.map(w => {
            if (w.id !== workerId) return w;
            const updated = { ...w, [field]: value };
            
            // Auto calculate IMC if peso or talla is updated
            if (field === 'peso' || field === 'talla') {
                const { peso, talla } = updated;
                if (peso && talla) {
                    const p = parseFloat(String(peso).replace(',', '.'));
                    const t = parseFloat(String(talla).replace(',', '.'));
                    if (p > 0 && t > 0) {
                        const tMeters = t > 3 ? t / 100 : t; 
                        updated.imc = (p / (tMeters * tMeters)).toFixed(1);
                    } else {
                        updated.imc = '';
                    }
                } else {
                    updated.imc = '';
                }
            }
            return updated;
        }));
    };

    const handleFirmaUpload = (workerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                updateWorkerField(workerId, 'firmaDigital', readerEvent.target?.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // ─── Excel Import/Export ───────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isAiImportLoading, setIsAiImportLoading] = useState(false);
    const [pendingFileData, setPendingFileData] = useState<{ dataUrl: string; name: string; type: string } | null>(null);

    const handleUpdateWorkerLicenses = (workerId: string, updatedLicenses: LicenciaConduccionItem[]) => {
        const summaryStr = updatedLicenses
            .map(l => `${l.categoria}${l.numero ? ` (N° ${l.numero})` : ''}`)
            .filter(Boolean)
            .join(', ');

        const validDates = updatedLicenses.map(l => l.fechaVencimiento).filter(Boolean).sort();
        const nearestExpiry = validDates.length > 0 ? validDates[0] : '';

        setTrabajadores(prev => prev.map(worker => {
            if (worker.id !== workerId) return worker;
            return {
                ...worker,
                licenciasConduccion: updatedLicenses,
                licenciaConduccion: summaryStr,
                licenciaConduccionVencimiento: nearestExpiry
            };
        }));
    };

    const handleExportExcel = async () => {
        try {
            await exportPerfilSociodemograficoToExcel(
                trabajadores,
                'Perfil_Sociodemografico.xlsx',
                cargosDisponibles.map(c => c.nombreCargo)
            );
            showToast({ message: 'Archivo Excel exportado exitosamente con pestañas de respuestas', status: 'success', severity: 'success' });
        } catch (error: any) {
            console.error('Error exportando Excel:', error);
            showToast({ message: `Error al exportar Excel: ${error?.message || error}`, status: 'error', severity: 'error' });
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
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].identificacion) {
                        // Formato estándar
                        const nuevosTrabajadores = parsed.map((t: any) => ({
                            ...EMPTY_WORKER,
                            ...t,
                            id: t.id || crypto.randomUUID(),
                            firmaDigital: t.firmaDigital || null,
                            completedByAI: t.completedByAI || false
                        }));
                        setTrabajadores(prev => [...prev, ...nuevosTrabajadores]);
                        showToast({ message: `${nuevosTrabajadores.length} trabajadores importados desde backup`, status: 'success', severity: 'success' });
                    } else {
                        requestAiImport();
                    }
                } catch (err) {
                    showToast({ message: 'Error al parsear el archivo JSON', status: 'error', severity: 'error' });
                }
            };
            jsonReader.readAsText(file);
            if (e.target) e.target.value = '';
            return;
        }

        // Si es Excel (.xlsx, .xls), procesamos con el mapeador inteligente y fallback a IA
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

                // Normalización inteligente de columnas (Google Forms / MS Forms / SST)
                const newWorkers: WorkerEntry[] = smartMapExcelToWorkers(importedData, EMPTY_WORKER);
                const validWorkers = newWorkers.filter(w => (w.nombre && w.nombre.trim()) || (w.identificacion && w.identificacion.trim()));

                if (validWorkers.length > 0) {
                    setTrabajadores(prev => [...prev, ...validWorkers]);
                    showToast({ message: `${validWorkers.length} trabajadores importados correctamente`, status: 'success', severity: 'success' });
                } else {
                    // Ruta B: Excel No Estándar -> Procesar con IA
                    requestAiImport();
                }
            } catch (err) {
                console.error("Error importing Excel:", err);
                showToast({ message: 'Error al importar archivo Excel. Verifica el formato.', status: 'error', severity: 'error' });
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
            const res = await fetch('/api/sgsst/perfil-sociodemografico/import-file', {
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
            if (data.success && data.trabajadores) {
                const nuevosTrabajadores = data.trabajadores.map((t: any) => ({
                    ...EMPTY_WORKER,
                    ...t,
                    id: crypto.randomUUID(),
                    firmaDigital: null,
                    completedByAI: true
                }));

                setTrabajadores(prev => [...prev, ...nuevosTrabajadores]);

                showToast({
                    message: `Se han extraído ${nuevosTrabajadores.length} trabajadores con IA exitosamente.`,
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

    // ─── Save & Generate ────────────────────────────────────────
    const handleDummyData = async () => {
        const dummyWorkers = generateDummyData.perfilSociodemografico();
        setTrabajadores(dummyWorkers);
        showToast({ message: `${dummyWorkers.length} trabajadores de construcción generados con éxito`, status: 'success', severity: 'success' });
        if (token) {
            try {
                const res = await fetch('/api/sgsst/perfil-sociodemografico/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ trabajadores: dummyWorkers }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.trabajadores?.length) setTrabajadores(data.trabajadores);
                    window.dispatchEvent(new CustomEvent('wappy-reload-sgsst-data'));
                }
            } catch (e) {
                // silent
            }
        }
    };

    const handleSaveData = async () => {
        if (!token) return;
        setIsSaving(true);
        try {
            syncWorkersSignaturesToStorage(trabajadores);

            // Auto-calculate and inject Biocentric Score (Índice Biocéntrico Integral)
            const trabajadoresConBio = trabajadores.map(w => {
                const bio = calculateBiocentricFit(w);
                return {
                    ...w,
                    biocentricScore: bio.score,
                    biocentricAlerts: bio.alerts,
                    biocentricIsLethal: bio.isLethal
                };
            });

            const res = await fetch('/api/sgsst/perfil-sociodemografico/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ trabajadores: trabajadoresConBio }),
            });
            if (res.ok) showToast({ message: 'Perfil sociodemográfico guardado', status: 'success', severity: 'success' });
            else throw new Error('Error al guardar');
        } catch (err: any) {
            showToast({ message: err.message, status: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAnalyze = useCallback(async () => {
        if (!trabajadores.length) {
            showToast({ message: 'No hay trabajadores para generar reporte', status: 'warning' });
            return;
        }
        setIsAnalyzing(true);
        try {
            const trabajadoresConRol = trabajadores.map(w => ({
                ...w,
                perfilCargoData: cargosDisponibles.find(c => c.nombreCargo === w.cargo) || null
            }));

            const payload = {
                trabajadores: trabajadoresConRol,
                currentDate: new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' }),
                userName: user?.name || user?.username || 'Usuario',
                modelName: selectedModel,
            };
            const res = await fetch('/api/sgsst/perfil-sociodemografico/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Error al generar informe con IA');
            const data = await res.json();
            setGeneratedReport(data.report);
            editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId('new');
            setReportMessageId(null);
            showToast({ message: 'Informe sociodemográfico generado con éxito', status: 'success', severity: 'success' });
        } catch (err: any) {
            showToast({ message: err.message, status: 'error' });
        } finally {
            setIsAnalyzing(false);
        }
    }, [trabajadores, cargosDisponibles, showToast, token, user, selectedModel]);

    const handleSaveReport = useCallback(async () => {
        const content = editorContentRef.current || generatedReport;
        if (!content || !token) return;
        try {
            const isNew = !conversationId || conversationId === 'new';
            const res = await fetch('/api/sgsst/diagnostico/save-report', {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(isNew ? {
                    content,
                    title: `Perfil Sociodemográfico - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-perfil-sociodemografico'],
                } : { conversationId, messageId: reportMessageId, content }),
            });
            if (res.ok) {
                const data = await res.json();
                if (isNew) { setConversationId(data.conversationId); setReportMessageId(data.messageId); }

                // Synchronize state
                setGeneratedReport(content);
                editorContentRef.current = content;
            liveEditorRef.current?.setHTML(content);

                setRefreshTrigger(prev => prev + 1);
                setIsHistoryOpen(false);
                showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
            }
        } catch (err: any) {
            showToast({ message: err.message, status: 'error' });
        }
    }, [editorContentRef.current, generatedReport, conversationId, reportMessageId, token, showToast]);

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
            setGeneratedReport(content); editorContentRef.current = content;
            liveEditorRef.current?.setHTML(content);
            setConversationId(convId); setReportMessageId(msgId);
            setIsHistoryOpen(false);
        }
    };

    const toggleWorker = (id: string) => {
        setExpandedWorkers(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
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

    // ─── QR: URL corta al perfil público del backend ─────────────────────
    // (data:URI era demasiado grande — QR tiene límite ~4KB)
    const getQrValue = (w: WorkerEntry) => {
        const base = window.location.origin;
        return `${base}/api/sgsst/perfil-sociodemografico/profile/${w.id}?type=health`;
    };

    // ─── QR: Portal de auto-actualización por el propio trabajador ───────
    const getUpdateQrValue = (w: WorkerEntry) => {
        const base = window.location.origin;
        const targetCompanyId = companyInfo?._id || user?.id || '';
        return `${base}/sgsst-public/perfil-update/${targetCompanyId}/${w.id}`;
    };

    // ─── Bio-Fit Engine ──────────────────────────────────────────
    function calculateBiocentricFit(w: WorkerEntry) {
        let score = 100;
        let alerts: string[] = [];
        let isLethal = false;

        const cargo = cargosDisponibles.find(c => c.nombreCargo === w.cargo);
        if (!cargo) return { score: 0, alerts: ['No hay rol asignado'], isLethal: false };

        // Física
        if (cargo.exigenciaFisica === 'Alta') {
            if (w.edad && Number(w.edad) > 55) {
                score -= 15;
                alerts.push('Edad avanzada para Alta Exigencia Física');
            }
            if (w.enfermedades?.trim()) {
                score -= 20;
                alerts.push('Enfermedad detectada en rol de alta carga física');
            }
            if (w.limitacionesBiomecanicas && w.limitacionesBiomecanicas.length > 2 && w.limitacionesBiomecanicas.toLowerCase() !== 'ninguna') {
                score -= 30;
                alerts.push('Alerta Biomecánica: Restricción incompatible con alta exigencia de carga/esfuerzo');
            }
            if (w.presionArterial) {
                const sis = parseInt(w.presionArterial.split('/')[0]);
                if (sis >= 135) {
                    score -= 25;
                    alerts.push('Alerta Cardiovascular: Hipertensión reportada frente a rol de alto impacto físico');
                }
            }
        }

        // Químico / Alergias
        if (w.alergiasQuimicas && w.alergiasQuimicas.length > 2 && w.alergiasQuimicas.toLowerCase() !== 'ninguna') {
             score -= 15;
             alerts.push('Alerta Inmunológica: Sensibilidad química reportada. Aislar de exposición cruzada');
        }

        // Mental/Psicosocial
        if (cargo.exigenciaMental === 'Alta') {
            if (w.terapiaPsicologica === 'Sí') {
                score -= 10;
                alerts.push('Alerta de Burnout: Rol de alta demanda mental + Terapia reportada');
            }
            if (w.personasCargo && Number(w.personasCargo) >= 3 && ['1', '2'].includes(w.estrato)) {
                score -= 10;
                alerts.push('Alerta Psicosocial: Alta carga familiar/económica y rol estresante');
            }
        }

        // Maquinaria (Lethal)
        if (cargo.operaMaquinaria === 'Sí') {
            if (w.medicamentos?.toLowerCase().includes('psiquiátrico') || 
                w.medicamentos?.toLowerCase().includes('dormir') ||
                w.alcohol === 'Sí (Frecuente)') {
                score -= 50;
                isLethal = true;
                alerts.push('BLOQUEO PREVENTIVO: Sustancias/Medicamentos + Maquinaria Peligrosa');
            }
        }

        // Brechas de Entrenamiento
        if (cargo.entrenamientosSeleccionados && cargo.entrenamientosSeleccionados.length > 0) {
            const missing = cargo.entrenamientosSeleccionados.length; // Simplification for now
            if (missing > 0 && !w.curso50h && !w.curso20h) {
                score -= 5;
                alerts.push('Brecha de Entrenamiento detectada');
            }
        }

        return { score: Math.max(0, score), alerts, isLethal };
    };

    // ─── Render ──────────────────────────────────────────────────

    useAutoLoadReport({
        token,
        tags: ['sgsst-perfil-sociodemografico'],
        generatedReport: generatedReport,
        handleSelectReport
    });

    // Auto-load y carga reactiva de la bandeja sociodemográfica
    React.useEffect(() => {
        handleLoadInbox(true); // silent fetch on mount

        // Opcional: Escuchar cuando una notificación en Head nos pida abrir
        const handleOpenInbox = (e: Event) => {
            const { module } = (e as CustomEvent).detail || {};
            if (module === 'perfil_sociodemografico') {
                setShowInboxPerfil(true);
                handleLoadInbox(true);
            }
        };
        window.addEventListener('sgsst-open-inbox', handleOpenInbox);
        return () => window.removeEventListener('sgsst-open-inbox', handleOpenInbox);
    }, []);

    // Load inbox
    async function handleLoadInbox(silent = false) {
        if (!silent) setLoadingInbox(true);
        if (!silent) setShowInboxPerfil(true);
        try {
            const res = await fetch('/api/sgsst/perfil-sociodemografico/data', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            setInboxPerfil(json.actualizacionesPendientes || []);
        } catch (e) {
            showToast({ message: 'Error al cargar actualizaciones pendientes', status: 'error' });
        } finally {
            setLoadingInbox(false);
        }
    };

    // Approve a pending update by hitting endpoint
    const handleApproveUpdate = async (update: any) => {
        const { workerId, changes, id: updateId } = update;
        try {
            const res = await fetch('/api/sgsst/perfil-sociodemografico/inbox/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ updateId, workerId, changes, inboxType: 'social' })
            });
            if (res.ok) {
                const json = await res.json();
                setTrabajadores(prev => prev.map(w => w.id === workerId ? { ...w, ...changes } : w));
                setInboxPerfil(json.actualizacionesPendientes || []);
                showToast({ message: 'Actualización aprobada y guardada permanentemente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            showToast({ message: 'Error al aprobar la actualización', status: 'error' });
        }
    };

    // Dismiss a pending update by hitting endpoint
    const handleDismissUpdate = async (updateId: string) => {
        try {
            const res = await fetch('/api/sgsst/perfil-sociodemografico/inbox/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ updateId, inboxType: 'social' })
            });
            if (res.ok) {
                const json = await res.json();
                setInboxPerfil(json.actualizacionesPendientes || []);
                showToast({ message: 'Solicitud descartada permanentemente', status: 'success', severity: 'success' });
            }
        } catch (e) {
            showToast({ message: 'Error al descartar la solicitud', status: 'error' });
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <SGSSTToolbar
                onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                isHistoryOpen={isHistoryOpen}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSaveLocal={handleSaveData}
                isSavingLocal={isSaving}
                hasContent={!!generatedReport}
                exportContent={editorContentRef.current || generatedReport || ''}
                exportFileName="Perfil_Sociodemografico"
                onDummy={handleDummyData}
                onImportExcel={() => fileInputRef.current?.click()}
                importExcelLabel="Importar Archivo"
                importExcelTitle="Importar desde Excel, PDF, Word o Concepto Médico"
                onExportExcel={handleExportExcel}
                hasData={trabajadores.length > 0}
                customSections={[
                    <div className="flex items-center gap-2">
                        <ToolbarButton
                            id="inbox-perfil"
                            onClick={handleLoadInbox}
                            label={`Reportes (${inboxPerfil.length})`}
                            icon="inbox"
                            badge={inboxPerfil.length || undefined}
                            active={showInboxPerfil}
                        />
                        <ToolbarButton
                            id="portal-perfil-qr"
                            onClick={() => setShowPortalQr(true)}
                            label="Portal Público"
                            icon="qrcode"
                        />
                        <ToolbarButton
                            id="manage-subusers"
                            onClick={() => {
                                setSelectedWorkerDocForSubUser('');
                                setShowSubUserManager(true);
                            }}
                            label="Sub-Usuarios / Accesos"
                            icon="users"
                        />
                    </div>
                ]}
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
                            <ClipboardList className="w-5 h-5 text-teal-300" />
                        </div>
                        <h1 className="text-2xl font-black tracking-tight">Perfil Sociodemográfico</h1>
                    </div>
                    <p className="text-teal-100/80 text-sm max-w-2xl leading-relaxed">
                        Población laboral y caracterización sociodemográfica. Analiza variables demográficas, familiares, habitacionales y de hábitos para identificar factores de vulnerabilidad extralaboral.
                    </p>
                </div>
            </div>

            {/* ═══ Inbox Panel: Pending Profile Updates ═══ */}
            {showInboxPerfil && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowInboxPerfil(false)}>
                    <div className="w-full max-w-5xl rounded-xl border border-cyan-200 bg-surface-primary dark:bg-surface-primary overflow-hidden shadow-2xl p-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg text-cyan-800 dark:text-cyan-400 flex items-center gap-2">
                            <Inbox className="w-5 h-5" /> Actualizaciones de Perfil Recibidas
                        </h3>
                        <button onClick={() => setShowInboxPerfil(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    {loadingInbox ? (
                        <div className="flex items-center justify-center py-8 text-gray-500">
                            <Loader2 className="w-6 h-6 animate-spin mr-2 text-cyan-500" /> Cargando...
                        </div>
                    ) : inboxPerfil.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <CheckCircle className="w-12 h-12 mx-auto text-green-400 mb-3 opacity-50" />
                            <p>No hay actualizaciones pendientes por revisar.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {inboxPerfil.map((item: any, idx: number) => (
                                <div key={idx} className="rounded-xl shadow border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col gap-2">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="font-bold text-sm text-gray-900 dark:text-gray-100">{item.workerName || 'Trabajador'}</p>
                                            <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleDateString('es-CO')}</p>
                                        </div>
                                        <button onClick={() => handleDismissUpdate(item.id)} className="text-gray-400 hover:text-red-500">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-300 max-h-48 overflow-y-auto space-y-1 pr-1 bg-surface-secondary/40 p-2.5 rounded-lg border border-border-light">
                                        {Object.entries(item.changes || {}).map(([k, v]: any) => {
                                            const label = {
                                                edad: 'Edad', genero: 'Género', estadoCivil: 'Estado Civil', nivelEscolaridad: 'Escolaridad',
                                                direccion: 'Dirección', telefono: 'Teléfono', emergenciaContacto: 'Contacto Emergencia',
                                                personasCargo: 'Personas a Cargo', estrato: 'Estrato', vivienda: 'Vivienda',
                                                fechaNacimiento: 'Fecha Nacimiento', lugarNacimiento: 'Lugar Nacimiento', barrio: 'Barrio',
                                                municipioDomicilio: 'Municipio', correoElectronico: 'Correo Electrónico', deporte: 'Actividad Física',
                                                alimentacion: 'Alimentación', riesgoCardiovascular: 'Riesgo Cardiovascular', tipoSangre: 'Tipo de Sangre',
                                                rh: 'RH', enfermedades: 'Enfermedades', medicamentos: 'Medicamentos', fuma: 'Fuma',
                                                alcohol: 'Alcohol', terapiaPsicologica: 'Terapia Psicológica', peso: 'Peso (kg)',
                                                talla: 'Talla', imc: 'IMC', presionArterial: 'Presión Arterial', frecuenciaCardiaca: 'Frec. Cardíaca',
                                                diagnosticoMedico: 'Diagnóstico Médico', limitacionesBiomecanicas: 'Limitaciones Biomecánicas',
                                                alergiasQuimicas: 'Alergias Químicas', fechaExamenMedico: 'Fecha Último Examen',
                                                recomendacionesMedicas: 'Recomendaciones Médicas', fechaSeguimiento: 'Fecha Seguimiento',
                                                fechaCursoAlturasAutorizado: 'Alturas Autorizado', fechaCursoAlturasCoordinador: 'Alturas Coordinador',
                                                soatVencimiento: 'Venc. SOAT', tecnicomecanicaVencimiento: 'Venc. Tecnicomecánica',
                                                licenciaConduccion: 'N° Licencia Conducción', licenciaConduccionVencimiento: 'Venc. Licencia Conducción',
                                                licenciaSST: 'N° Licencia SST', licenciaVencimiento: 'Venc. Licencia SST',
                                                curso50h: 'Curso 50h', curso20h: 'Curso 20h', esCopasst: 'COPASST',
                                                esComiteConvivencia: 'Comité Convivencia', esBrigadista: 'Brigadista', esComiteSeguridadVial: 'Comité Seg. Vial'
                                            }[k] || k;
                                            return (
                                                <p key={k} className="leading-tight"><span className="font-semibold text-text-primary">{label}:</span> <span className="text-teal-700 dark:text-teal-400 font-medium">{String(v || '—')}</span></p>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={() => handleApproveUpdate(item)}
                                        className="mt-auto w-full py-2 rounded-lg text-xs font-bold bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-300 transition-colors shadow-sm"
                                    >
                                        ✓ Aprobar y Aplicar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    </div>
                </div>,
                document.body
            )}

            {/* ═══ History Modal (Popup) ═══ */}
            <ReportHistory
                onSelectReport={handleSelectReport}
                isOpen={isHistoryOpen}
                toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)}
                refreshTrigger={refreshTrigger}
                tags={['sgsst-perfil-sociodemografico']}
            />

            {/* ═══ Workers List ═══ */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-text-secondary">
                        <Loader2 className="h-8 w-8 animate-spin mr-3 text-teal-500" /> Cargando base de datos...
                    </div>
                ) : (
                    <>
                        {trabajadores.map((w, wIdx) => {
                            const score = w.biocentricScore !== undefined ? w.biocentricScore : 100;
                            const sc = SCORE_COLOR(score);
                            const initials = (w.nombre || 'U')[0].toUpperCase();

                            return (
                            <div key={w.id} className={cn("rounded-2xl border border-border-medium bg-surface-secondary shadow-sm transition-all hover:border-teal-500/30", expandedWorkers.has(w.id) ? "overflow-visible" : "overflow-hidden")}>
                                {/* Worker Header */}
                                <div className="flex items-center justify-between p-5 bg-surface-primary/50 cursor-pointer gap-4 border-b border-border-light" onClick={() => toggleWorker(w.id)}>
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="text-teal-500 shrink-0">
                                            {expandedWorkers.has(w.id) ? <AnimatedIcon name="chevron-down" size={20} /> : <AnimatedIcon name="chevron-right" size={20} />}
                                        </div>
                                        <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-black ${sc.ring} ${sc.bg} ${sc.text} shrink-0`}>
                                            {initials}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold text-text-primary text-base truncate">
                                                {wIdx + 1}. {w.nombre || 'Nuevo Trabajador'}
                                            </h3>
                                            <p className="text-xs text-text-secondary hidden md:flex items-center gap-1.5 mt-0.5">
                                                <Briefcase className="w-3.5 h-3.5 shrink-0 text-teal-500" />
                                                {w.cargo || 'Sin cargo asignado'} · CC: {w.identificacion || 'N/A'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        <div className="hidden md:flex flex-col items-end gap-0.5 mr-2">
                                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${sc.badge}`}>
                                                {score}% FIT
                                            </span>
                                            <span className="text-[9px] text-text-secondary font-bold uppercase tracking-tighter">Score Biocéntrico</span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedWorkerDocForSubUser(w.identificacion);
                                                setShowSubUserManager(true);
                                            }}
                                            title="Crear o gestionar acceso de sub-usuario para este trabajador"
                                            className="p-2 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl hover:bg-teal-100 transition-colors shadow-sm">
                                            <UserCheck className="w-[18px] h-[18px]" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedQrWorker(w); }}
                                            className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm">
                                            <AnimatedIcon name="qrcode" size={18} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteWorker(w.id); }}
                                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors shadow-sm">
                                            <AnimatedIcon name="trash" size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Worker Body */}
                                {expandedWorkers.has(w.id) && (
                                    <div className="p-0 border-t border-border-light animate-in fade-in duration-200 bg-surface-primary/30">

                                        {/* Tabs Header */}
                                        <div className="flex items-center overflow-x-auto border-b border-border-light bg-surface-secondary px-4 pt-1 hide-scrollbar">
                                            <button
                                                onClick={(e) => { e.preventDefault(); setWorkerTabs(prev => ({ ...prev, [w.id]: 'general' })); }}
                                                className={cn("px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors", (workerTabs[w.id] || 'general') === 'general' ? "border-teal-500 text-teal-600 dark:text-teal-400" : "border-transparent text-text-secondary hover:text-text-primary")}
                                            > General & Laboral </button>

                                            <button
                                                onClick={(e) => { e.preventDefault(); setWorkerTabs(prev => ({ ...prev, [w.id]: 'roles' })); }}
                                                className={cn("px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors", (workerTabs[w.id] || 'general') === 'roles' ? "border-teal-500 text-teal-600 dark:text-teal-400" : "border-transparent text-text-secondary hover:text-text-primary")}
                                            > Roles & Especialidades </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); setWorkerTabs(prev => ({ ...prev, [w.id]: 'formacion' })); }}
                                                className={cn("px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-colors", (workerTabs[w.id] || 'general') === 'formacion' ? "border-teal-500 text-teal-600 dark:text-teal-400" : "border-transparent text-text-secondary hover:text-text-primary")}
                                            > Formación & Misiones </button>
                                        </div>

                                        {/* Tab Content */}
                                        <div className="p-4">
                                            {/* TAB 1: GENERAL & HABITS SPLIT GRID */}
                                            {(workerTabs[w.id] || 'general') === 'general' && (
                                                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-light gap-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                                    {/* Lado Izquierdo: Información Personal & Familiar */}
                                                    <div className="space-y-4 pr-0 lg:pr-6 pb-6 lg:pb-0">
                                                        <h4 className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5 mb-2">
                                                            <User className="w-4 h-4 text-teal-500" /> Información Personal & Familiar
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Nombre Completo</label>
                                                                <input type="text" value={w.nombre} onChange={e => updateWorkerField(w.id, 'nombre', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary font-medium shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Identificación (CC)</label>
                                                                <input type="text" value={w.identificacion} onChange={e => updateWorkerField(w.id, 'identificacion', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Edad</label>
                                                                <input type="number" value={w.edad} onChange={e => updateWorkerField(w.id, 'edad', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Género</label>
                                                                <SingleSelect value={w.genero || ''} onChange={val => updateWorkerField(w.id, 'genero', val)} placeholder="Seleccione..." options={['Masculino', 'Femenino', 'Otro']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Estado Civil</label>
                                                                <SingleSelect value={w.estadoCivil || ''} onChange={val => updateWorkerField(w.id, 'estadoCivil', val)} placeholder="Seleccione..." options={['Soltero/a', 'Casado/a', 'Unión Libre', 'Separado/a', 'Viudo/a']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Nivel Escolaridad</label>
                                                                <SingleSelect value={w.nivelEscolaridad || ''} onChange={val => updateWorkerField(w.id, 'nivelEscolaridad', val)} placeholder="Seleccione..." options={['Ninguna', 'Primaria', 'Secundaria', 'Técnico', 'Tecnólogo', 'Profesional', 'Especialización / Postgrado']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Fecha Nacimiento</label>
                                                                <input type="date" value={w.fechaNacimiento} onChange={e => updateWorkerField(w.id, 'fechaNacimiento', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Lugar Nacimiento</label>
                                                                <input type="text" value={w.lugarNacimiento} onChange={e => updateWorkerField(w.id, 'lugarNacimiento', e.target.value)}
                                                                    placeholder="Ej: Bogotá" className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Correo Electrónico</label>
                                                                <input type="email" value={w.correoElectronico} onChange={e => updateWorkerField(w.id, 'correoElectronico', e.target.value)}
                                                                    placeholder="Ej: correo@ejemplo.com" className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Teléfono</label>
                                                                <input type="text" value={w.telefono} onChange={e => updateWorkerField(w.id, 'telefono', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Municipio Domicilio</label>
                                                                <input type="text" value={w.municipioDomicilio} onChange={e => updateWorkerField(w.id, 'municipioDomicilio', e.target.value)}
                                                                    placeholder="Ej: Medellín" className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Barrio</label>
                                                                <input type="text" value={w.barrio} onChange={e => updateWorkerField(w.id, 'barrio', e.target.value)}
                                                                    placeholder="Ej: El Poblado" className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1 md:col-span-2">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Dirección (Google Maps)</label>
                                                                <input type="text" value={w.direccion} onChange={e => updateWorkerField(w.id, 'direccion', e.target.value)}
                                                                    placeholder="Ej: Calle 123 #45-67, Medellín"
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Tipo de Vivienda</label>
                                                                <SingleSelect value={w.vivienda || ''} onChange={val => updateWorkerField(w.id, 'vivienda', val)} placeholder="Seleccione..." options={['Propia', 'Arrendada', 'Familiar']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Estrato</label>
                                                                <SingleSelect value={w.estrato || ''} onChange={val => updateWorkerField(w.id, 'estrato', val)} placeholder="Seleccione..." options={['1', '2', '3', '4', '5', '6']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Contacto de Emergencia</label>
                                                                <input type="text" value={w.emergenciaContacto} onChange={e => updateWorkerField(w.id, 'emergenciaContacto', e.target.value)}
                                                                    placeholder="Nombre y Teléfono"
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Personas a Cargo</label>
                                                                <input type="number" value={w.personasCargo} onChange={e => updateWorkerField(w.id, 'personasCargo', e.target.value)}
                                                                    placeholder="Número de personas"
                                                                    className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary shadow-inner focus:ring-2 focus:ring-teal-400 outline-none" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Lado Derecho: Hábitos & Perfil Laboral */}
                                                    <div className="space-y-4 pl-0 lg:pl-6 pt-6 lg:pt-0">
                                                        <h4 className="text-xs font-black uppercase tracking-wider text-text-secondary flex items-center gap-1.5 mb-2">
                                                            <Briefcase className="w-4 h-4 text-indigo-500" /> Hábitos & Perfil Laboral
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="space-y-1 md:col-span-2">
                                                                <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-indigo-500"/> Perfil de Cargo Requerido</label>
                                                                <SingleSelect value={w.cargo || ''} onChange={val => updateWorkerField(w.id, 'cargo', val)} placeholder="Seleccione el Rol..." options={cargosDisponibles.map(c => c.nombreCargo)} />
                                                            </div>

                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Deporte / Actividad Física</label>
                                                                <SingleSelect value={w.deporte || ''} onChange={val => updateWorkerField(w.id, 'deporte', val)} placeholder="Seleccione..." options={['No realiza', '1-2 veces por semana', '3+ veces por semana']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Alimentación</label>
                                                                <SingleSelect value={w.alimentacion || ''} onChange={val => updateWorkerField(w.id, 'alimentacion', val)} placeholder="Seleccione..." options={['Balanceada', 'Alta en grasas/azúcares', 'Vegetariana/Vegana']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Consumo de Tabaco (Fuma)</label>
                                                                <SingleSelect value={w.fuma || ''} onChange={val => updateWorkerField(w.id, 'fuma', val)} placeholder="Seleccione..." options={['No', 'Sí, ocasional', 'Sí, diario']} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Consumo de Alcohol</label>
                                                                <SingleSelect value={w.alcohol || ''} onChange={val => updateWorkerField(w.id, 'alcohol', val)} placeholder="Seleccione..." options={['No', 'Sí (Social)', 'Sí (Frecuente)']} />
                                                            </div>
                                                            <div className="space-y-1 md:col-span-2">
                                                                <label className="text-xs font-bold text-text-secondary uppercase">Acompañamiento Psicológico (Terapia)</label>
                                                                <SingleSelect value={w.terapiaPsicologica || ''} onChange={val => updateWorkerField(w.id, 'terapiaPsicologica', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}



                                            {/* TAB 3: ROLES Y FIRMA */}
                                            {(workerTabs[w.id] || 'general') === 'roles' && (
                                                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                                    
                                                    {/* Alturas (Default) */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase leading-tight">Alturas — Trab. Autorizado</label>
                                                            <input type="date" value={w.fechaCursoAlturasAutorizado} onChange={e => updateWorkerField(w.id, 'fechaCursoAlturasAutorizado', e.target.value)}
                                                                className="w-full text-sm p-2 rounded-xl border border-teal-200 bg-teal-50/10 dark:bg-teal-900/10 text-text-primary" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase leading-tight">Alturas — Coordinador</label>
                                                            <input type="date" value={w.fechaCursoAlturasCoordinador} onChange={e => updateWorkerField(w.id, 'fechaCursoAlturasCoordinador', e.target.value)}
                                                                className="w-full text-sm p-2 rounded-xl border border-teal-200 bg-teal-50/10 dark:bg-teal-900/10 text-text-primary" />
                                                        </div>
                                                    </div>

                                                    {/* Conductor y Licencias de Conducción Múltiples */}
                                                    {((w.cargo && w.cargo.toLowerCase().includes('conductor')) || (w.licenciasConduccion && w.licenciasConduccion.length > 0) || !!w.licenciaConduccion || !!w.soatVencimiento) ? (
                                                        <div className="p-4 border border-blue-200 bg-blue-50/30 dark:bg-blue-900/20 rounded-xl space-y-4">
                                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                                <h4 className="text-blue-700 dark:text-blue-400 font-bold text-sm uppercase flex items-center gap-2">
                                                                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                                    Requisitos de Conductor & Licencias de Conducción
                                                                </h4>
                                                                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 rounded-full">
                                                                    {(w.licenciasConduccion?.length || (w.licenciaConduccion ? 1 : 0))} Licencia(s) Registrada(s)
                                                                </span>
                                                            </div>

                                                            {/* Fechas de SOAT y Tecnicomecánica del vehículo asignado */}
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">Vencimiento SOAT</label>
                                                                    <input type="date" value={w.soatVencimiento} onChange={e => updateWorkerField(w.id, 'soatVencimiento', e.target.value)}
                                                                        className="w-full text-sm p-2 rounded-xl border border-blue-200 bg-white dark:bg-gray-800 text-text-primary" />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">Vencimiento Tecnicomecánica</label>
                                                                    <input type="date" value={w.tecnicomecanicaVencimiento} onChange={e => updateWorkerField(w.id, 'tecnicomecanicaVencimiento', e.target.value)}
                                                                        className="w-full text-sm p-2 rounded-xl border border-blue-200 bg-white dark:bg-gray-800 text-text-primary" />
                                                                </div>
                                                            </div>

                                                            {/* Gestor Dinámico de Licencias (Múltiples Categorías y Vigencias) */}
                                                            <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/40 space-y-3">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-xs font-black text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                                                                        Licencias / Categorías con Fechas de Vigencia Independientes
                                                                    </label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            const currentList: LicenciaConduccionItem[] = (w.licenciasConduccion && w.licenciasConduccion.length > 0)
                                                                                ? [...w.licenciasConduccion]
                                                                                : (w.licenciaConduccion || w.licenciaConduccionVencimiento)
                                                                                    ? [{ id: crypto.randomUUID(), categoria: 'C1', numero: w.licenciaConduccion || '', fechaVencimiento: w.licenciaConduccionVencimiento || '' }]
                                                                                    : [];
                                                                            const newList = [
                                                                                ...currentList,
                                                                                { id: crypto.randomUUID(), categoria: 'B1', numero: w.identificacion || '', fechaVencimiento: '' }
                                                                            ];
                                                                            handleUpdateWorkerLicenses(w.id, newList);
                                                                        }}
                                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/50 dark:hover:bg-blue-800 rounded-lg transition-colors"
                                                                    >
                                                                        <Plus className="w-3.5 h-3.5" />
                                                                        Agregar Licencia / Categoría
                                                                    </button>
                                                                </div>

                                                                {/* Listado de Licencias */}
                                                                {(() => {
                                                                    const currentList: LicenciaConduccionItem[] = (w.licenciasConduccion && w.licenciasConduccion.length > 0)
                                                                        ? w.licenciasConduccion
                                                                        : (w.licenciaConduccion || w.licenciaConduccionVencimiento)
                                                                            ? [{ id: 'leg-1', categoria: 'C1', numero: w.licenciaConduccion || '', fechaVencimiento: w.licenciaConduccionVencimiento || '' }]
                                                                            : [];

                                                                    if (currentList.length === 0) {
                                                                        return (
                                                                            <div className="p-3 bg-white/70 dark:bg-gray-800/50 border border-dashed border-blue-200 dark:border-blue-900 rounded-xl text-center">
                                                                                <p className="text-xs text-text-secondary">No hay licencias registradas para este trabajador.</p>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        handleUpdateWorkerLicenses(w.id, [
                                                                                            { id: crypto.randomUUID(), categoria: 'C1', numero: w.identificacion || '', fechaVencimiento: '' }
                                                                                        ]);
                                                                                    }}
                                                                                    className="mt-1.5 text-xs font-bold text-blue-600 hover:underline"
                                                                                >
                                                                                    + Registrar primera licencia
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <div className="space-y-2">
                                                                            {currentList.map((lic, licIdx) => {
                                                                                const status = getLicenseBadge(lic.fechaVencimiento);
                                                                                return (
                                                                                    <div key={lic.id || `lic-${licIdx}`} className="p-3 bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/60 rounded-xl flex flex-col md:flex-row items-start md:items-center gap-3 shadow-sm">
                                                                                        <div className="w-full md:w-48 shrink-0">
                                                                                            <label className="text-[10px] font-bold text-text-secondary uppercase block mb-1">Categoría</label>
                                                                                            <SingleSelect
                                                                                                value={lic.categoria || 'B1'}
                                                                                                onChange={(val) => {
                                                                                                    const updated = currentList.map((item, idx) => idx === licIdx ? { ...item, categoria: val } : item);
                                                                                                    handleUpdateWorkerLicenses(w.id, updated);
                                                                                                }}
                                                                                                placeholder="Categoría..."
                                                                                                options={CATEGORIAS_LICENCIA}
                                                                                            />
                                                                                        </div>
                                                                                        <div className="w-full md:flex-1">
                                                                                            <label className="text-[10px] font-bold text-text-secondary uppercase block mb-1">N° Licencia / CC</label>
                                                                                            <input
                                                                                                type="text"
                                                                                                value={lic.numero || ''}
                                                                                                onChange={(e) => {
                                                                                                    const updated = currentList.map((item, idx) => idx === licIdx ? { ...item, numero: e.target.value } : item);
                                                                                                    handleUpdateWorkerLicenses(w.id, updated);
                                                                                                }}
                                                                                                placeholder="Ej: 79845123"
                                                                                                className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary"
                                                                                            />
                                                                                        </div>
                                                                                        <div className="w-full md:w-52 shrink-0">
                                                                                            <div className="flex items-center justify-between mb-1">
                                                                                                <label className="text-[10px] font-bold text-text-secondary uppercase block">Vencimiento</label>
                                                                                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", status.color)}>
                                                                                                    {status.label}
                                                                                                </span>
                                                                                            </div>
                                                                                            <input
                                                                                                type="date"
                                                                                                value={lic.fechaVencimiento || ''}
                                                                                                onChange={(e) => {
                                                                                                    const updated = currentList.map((item, idx) => idx === licIdx ? { ...item, fechaVencimiento: e.target.value } : item);
                                                                                                    handleUpdateWorkerLicenses(w.id, updated);
                                                                                                }}
                                                                                                className="w-full text-sm p-2 rounded-xl border border-border-medium bg-surface-primary text-text-primary"
                                                                                            />
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => {
                                                                                                e.preventDefault();
                                                                                                const updated = currentList.filter((_, idx) => idx !== licIdx);
                                                                                                handleUpdateWorkerLicenses(w.id, updated);
                                                                                            }}
                                                                                            className="self-end md:self-center p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors mt-2 md:mt-4"
                                                                                            title="Eliminar esta licencia"
                                                                                        >
                                                                                            <Trash2 className="w-4 h-4" />
                                                                                        </button>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 border border-dashed border-border-medium rounded-xl bg-surface-secondary/30 flex items-center justify-between flex-wrap gap-2">
                                                            <div className="flex items-center gap-2 text-xs text-text-secondary">
                                                                <Briefcase className="w-4 h-4 text-blue-500 shrink-0" />
                                                                <span>¿Este trabajador conduce vehículos o requiere registrar licencias de conducción?</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    handleUpdateWorkerLicenses(w.id, [
                                                                        { id: crypto.randomUUID(), categoria: 'B1', numero: w.identificacion || '', fechaVencimiento: '' }
                                                                    ]);
                                                                }}
                                                                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded"
                                                            >
                                                                + Registrar Licencias de Conducción
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Comités de Apoyo al SG-SST */}
                                                    <div className="p-4 border border-green-200 bg-green-50/30 dark:bg-green-900/20 rounded-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                        <h4 className="md:col-span-4 lg:col-span-4 text-green-700 dark:text-green-400 font-bold text-sm uppercase">Comités de Apoyo al SG-SST</h4>
                                                        <div className="space-y-1 lg:col-span-1">
                                                            <label className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">COPASST</label>
                                                            <SingleSelect value={w.esCopasst || 'No'} onChange={val => updateWorkerField(w.id, 'esCopasst', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                        </div>
                                                        <div className="space-y-1 lg:col-span-1">
                                                            <label className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Convivencia Laboral</label>
                                                            <SingleSelect value={w.esComiteConvivencia || 'No'} onChange={val => updateWorkerField(w.id, 'esComiteConvivencia', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                        </div>
                                                        <div className="space-y-1 lg:col-span-1">
                                                            <label className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Brigada Emergencias</label>
                                                            <SingleSelect value={w.esBrigadista || 'No'} onChange={val => updateWorkerField(w.id, 'esBrigadista', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                        </div>
                                                        <div className="space-y-1 lg:col-span-1">
                                                            <label className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Seguridad Vial</label>
                                                            <SingleSelect value={w.esComiteSeguridadVial || 'No'} onChange={val => updateWorkerField(w.id, 'esComiteSeguridadVial', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                        </div>
                                                    </div>

                                                    {/* SST Conditional */}
                                                    {w.cargo && ['sst', 'hseq', 'seguridad', 'salud', 'ocupacional'].some(kw => w.cargo.toLowerCase().includes(kw)) && (
                                                        <div className="p-4 border border-purple-200 bg-purple-50/30 dark:bg-purple-900/20 rounded-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                            <h4 className="md:col-span-4 lg:col-span-4 text-purple-700 dark:text-purple-400 font-bold text-sm uppercase">Perfil SST Exigido</h4>
                                                            <div className="space-y-1 lg:col-span-2">
                                                                <label className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Nº Licencia SST</label>
                                                                <input type="text" value={w.licenciaSST} onChange={e => updateWorkerField(w.id, 'licenciaSST', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-purple-200 bg-white dark:bg-gray-800 text-text-primary" />
                                                            </div>
                                                            <div className="space-y-1 lg:col-span-2">
                                                                <label className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Vencimiento Licencia</label>
                                                                <input type="date" value={w.licenciaVencimiento} onChange={e => updateWorkerField(w.id, 'licenciaVencimiento', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-purple-200 bg-white dark:bg-gray-800 text-text-primary" />
                                                            </div>
                                                            <div className="space-y-1 lg:col-span-2">
                                                                <label className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Curso de 50 Horas (Expedición)</label>
                                                                <input type="date" value={w.curso50h} onChange={e => updateWorkerField(w.id, 'curso50h', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-purple-200 bg-white dark:bg-gray-800 text-text-primary" />
                                                            </div>
                                                            <div className="space-y-1 lg:col-span-2">
                                                                <label className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Curso de 20 Horas (Expedición)</label>
                                                                <input type="date" value={w.curso20h} onChange={e => updateWorkerField(w.id, 'curso20h', e.target.value)}
                                                                    className="w-full text-sm p-2 rounded-xl border border-purple-200 bg-white dark:bg-gray-800 text-text-primary" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Firma Digital */}
                                                    <div className="space-y-1 lg:col-span-4 p-4 border rounded-xl bg-surface-tertiary/30 border-border-medium">
                                                        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                                                            <div className="space-y-1 w-full md:w-1/2">
                                                                <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase leading-tight">Consentimiento Informado (Firma Digital)</label>
                                                                <SingleSelect value={w.consentimientoFirmaDigital || 'No' || ''} onChange={val => updateWorkerField(w.id, 'consentimientoFirmaDigital', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                                <p className="text-[10px] text-text-secondary mt-1 max-w-[280px]">Muestra la firma en el Código QR y la habilita para reportar.</p>
                                                            </div>

                                                            <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-3 border-2 border-dashed border-border-medium rounded-xl relative hover:bg-surface-secondary/50 transition-colors">
                                                                {w.firmaDigital ? (
                                                                    <div className="relative group w-full flex items-center justify-center">
                                                                        <img src={w.firmaDigital} alt="Firma" className="max-h-16 object-contain" />
                                                                        <button
                                                                            onClick={() => updateWorkerField(w.id, 'firmaDigital', null)}
                                                                            className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2 -translate-y-1/2"
                                                                        >
                                                                            <AnimatedIcon name="trash" size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col gap-2 w-full">
                                                                        <label className="cursor-pointer text-center flex items-center justify-center gap-2 px-3 py-2 bg-surface-hover hover:bg-surface-tertiary rounded-lg text-text-secondary w-full transition-colors font-medium border border-border-light">
                                                                            <ImageIcon size={16} className="text-indigo-400" />
                                                                            <span className="text-xs uppercase">Cargar Archivo</span>
                                                                            <input type="file" accept="image/*" onChange={(e) => handleFirmaUpload(w.id, e)} className="hidden" />
                                                                        </label>
                                                                        <button 
                                                                            onClick={(e) => { e.preventDefault(); setActiveSignatureWorkerId(w.id); }}
                                                                            className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg w-full transition-colors font-medium border border-indigo-200 dark:border-indigo-800"
                                                                        >
                                                                            <PenTool size={16} />
                                                                            <span className="text-xs uppercase">Dibujar en Pantalla</span>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* TAB 4: FORMACIÓN Y MISIONES */}
                                            {(workerTabs[w.id] || 'general') === 'formacion' && (
                                                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                                    <div className="flex flex-col gap-4 p-4 border rounded-xl bg-surface-tertiary/30 border-border-medium min-h-[300px]">
                                                        <div>
                                                            <h4 className="font-bold text-sm text-teal-700 dark:text-teal-400 uppercase tracking-wider">Historial de Capacitación y Competencias</h4>
                                                            <p className="text-xs text-text-secondary">Cursos requeridos por el Perfil de Cargo: <span className="font-bold text-text-primary">{w.cargo || 'Ninguno'}</span></p>
                                                        </div>
                                                        
                                                        {w.cargo && cargosDisponibles.find(c => c.nombreCargo === w.cargo)?.entrenamientosSeleccionados.map((cursoReq, idx) => {
                                                            const forms = w.formacion || [];
                                                            const courseData = forms.find((f:any) => f.curso === cursoReq) || { curso: cursoReq, estado: 'No Realizado', fecha: '' };
                                                            return (
                                                                <div key={`req-${idx}`} className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-surface-primary border border-border-light p-3 rounded-lg w-full">
                                                                    <div className="flex-1 min-w-[200px]">
                                                                        <span className="text-sm font-bold text-text-primary">{cursoReq}</span>
                                                                    </div>
                                                                    <div className="w-full md:w-56 shrink-0">
                                                                        <SingleSelect 
                                                                            value={courseData.estado} 
                                                                            onChange={(val) => {
                                                                                const newF = [...forms.filter((f:any) => f.curso !== cursoReq), { ...courseData, estado: val }];
                                                                                updateWorkerField(w.id, 'formacion', newF);
                                                                            }} 
                                                                            placeholder="Estado..." options={['Realizado', 'No Realizado', 'Pendiente Validación']} />
                                                                    </div>
                                                                    <div className="w-full md:w-48 shrink-0">
                                                                        <input type="date" value={courseData.fecha} 
                                                                            onChange={(e) => {
                                                                                const newF = [...forms.filter((f:any) => f.curso !== cursoReq), { ...courseData, fecha: e.target.value }];
                                                                                updateWorkerField(w.id, 'formacion', newF);
                                                                            }} 
                                                                            className="w-full text-sm p-[9px] rounded-xl border border-border-medium bg-surface-primary text-text-primary" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Extra Cursos */}
                                                        {((w.formacion || []) as any[]).filter(f => {
                                                            const reqs = cargosDisponibles.find(c => c.nombreCargo === w.cargo)?.entrenamientosSeleccionados || [];
                                                            return !reqs.includes(f.curso);
                                                        }).map((extraCourse, eIdx) => (
                                                            <div key={`ex-${eIdx}`} className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-indigo-50/20 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 p-3 rounded-lg w-full relative group">
                                                                <div className="flex-1 min-w-[200px]">
                                                                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{extraCourse.curso}</span>
                                                                    <span className="text-[10px] ml-2 text-indigo-600 uppercase rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5">Extra</span>
                                                                </div>
                                                                <div className="w-full md:w-56 shrink-0">
                                                                    <SingleSelect 
                                                                        value={extraCourse.estado} 
                                                                        onChange={(val) => {
                                                                            const forms = w.formacion || [];
                                                                            const newF = [...forms.filter((f:any) => f.curso !== extraCourse.curso), { ...extraCourse, estado: val }];
                                                                            updateWorkerField(w.id, 'formacion', newF);
                                                                        }} 
                                                                        placeholder="Estado..." options={['Realizado', 'No Realizado']} />
                                                                </div>
                                                                <div className="w-full md:w-48 shrink-0">
                                                                    <input type="date" value={extraCourse.fecha} 
                                                                        onChange={(e) => {
                                                                            const forms = w.formacion || [];
                                                                            const newF = [...forms.filter((f:any) => f.curso !== extraCourse.curso), { ...extraCourse, fecha: e.target.value }];
                                                                            updateWorkerField(w.id, 'formacion', newF);
                                                                        }} 
                                                                        className="w-full text-sm p-[9px] rounded-xl border border-indigo-200 dark:border-indigo-800 bg-surface-primary text-text-primary" />
                                                                </div>
                                                                <button onClick={() => {
                                                                        const newF = (w.formacion || []).filter((f:any) => f.curso !== extraCourse.curso);
                                                                        updateWorkerField(w.id, 'formacion', newF);
                                                                    }}
                                                                    className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="Eliminar curso extra">
                                                                    <AnimatedIcon name="trash" size={14} />
                                                                </button>
                                                            </div>
                                                        ))}

                                                        <div className="pt-2">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    const title = window.prompt('Ingrese el nombre del nuevo curso o competencia específica:');
                                                                    if (title && title.trim()) {
                                                                        const forms = w.formacion || [];
                                                                        const exists = forms.find((f:any) => f.curso.toLowerCase() === title.toLowerCase().trim());
                                                                        if (exists) {
                                                                            alert('El curso ya existe en la lista de este trabajador.');
                                                                        } else {
                                                                            updateWorkerField(w.id, 'formacion', [...forms, { curso: title.trim(), estado: 'Realizado', fecha: '' }]);
                                                                        }
                                                                    }
                                                                }}
                                                                className="flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 px-4 py-2 rounded-xl transition-colors"
                                                            >
                                                                <AnimatedIcon name="plus" size={16} /> Añadir Competencia Extra
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                        })}

                        {/* Add Worker Button */}
                        <button onClick={handleAddWorker}
                            className="w-full p-4 border-2 border-dashed border-border-medium rounded-2xl flex items-center justify-center gap-2 text-text-secondary hover:bg-surface-secondary/50 hover:text-teal-500 transition-all">
                            <AnimatedIcon name="plus" size={20} />
                            <span className="font-bold">Agregar Nuevo Trabajador</span>
                        </button>
                    </>
                )}
            </div>

            {/* ═══ Report Viewer (inline, igual que ResponsableSGSST) ═══ */}
            <div className="mt-8">
                <CollapsibleReportBox
                    onSave={handleSaveReport}
                    onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                    isHistoryOpen={isHistoryOpen}
                    title="Documento de Perfil Sociodemográfico Generado"
                    icon={<AnimatedIcon name="file-text" size={16} className="text-teal-600" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_PerfilSociodemografico"
                            reportType="general"
                        />
                    }
                >
                    <div className="w-full min-w-0">
                        <LiveEditor
                            ref={liveEditorRef}
                            paperMode={true}
                            initialContent={generatedReport || ''}
                            onUpdate={(html) => { editorContentRef.current = html; }}
                            reportSourceData={trabajadores}
                        />
                    </div>
                </CollapsibleReportBox>
            </div>

            {/* Worker Specific QR Modal */}
            {selectedQrWorker && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { setSelectedQrWorker(null); setQrTab('profile'); }}>
                    <div
                        className="bg-white dark:bg-zinc-900 w-full max-w-[385px] min-h-[490px] md:min-h-[530px] max-h-[85vh] md:max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden border border-border-medium/60 flex flex-col animate-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}>
                        {/* Modal Header - Integrated Wappy Style (Compact) */}
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border-light dark:border-border-medium/30 relative shrink-0">
                            <div className="w-10 h-10 rounded-full border-2 border-teal-500/20 bg-teal-50/50 dark:bg-teal-950/30 flex items-center justify-center shrink-0 shadow-inner">
                                <QrCode className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div className="text-left flex-grow min-w-0 pr-6">
                                <h3 className="font-extrabold text-sm text-text-primary tracking-tight truncate">{selectedQrWorker.nombre || 'Trabajador'}</h3>
                                <p className="text-[11px] text-text-secondary font-semibold truncate">{selectedQrWorker.cargo || 'Sin cargo'}</p>
                            </div>
                            <button
                                onClick={() => { setSelectedQrWorker(null); setQrTab('profile'); }}
                                className="absolute top-4 right-5 p-1 rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-all duration-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body - Scrollable */}
                        <div className="p-5 flex flex-col bg-surface-primary dark:bg-zinc-900/10 space-y-4 overflow-y-auto flex-grow">
                            {/* Segmented Pill Switcher (Compact) */}
                            <div className="flex p-0.5 bg-surface-secondary dark:bg-zinc-950/40 rounded-xl border border-border-medium/30 gap-0.5 w-full shrink-0">
                                <button
                                    onClick={() => setQrTab('profile')}
                                    className={cn(
                                        'flex-grow py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-1',
                                        qrTab === 'profile'
                                            ? 'bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400 shadow-sm border border-border-medium/20'
                                            : 'text-text-secondary hover:text-text-primary'
                                    )}
                                >
                                    <UserCircle className="w-3.5 h-3.5" />
                                    Ver Tarjeta
                                </button>
                                <button
                                    onClick={() => setQrTab('update')}
                                    className={cn(
                                        'flex-grow py-1.5 rounded-lg text-[11px] font-bold transition-all duration-300 flex items-center justify-center gap-1',
                                        qrTab === 'update'
                                            ? 'bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-sm border border-border-medium/20'
                                            : 'text-text-secondary hover:text-text-primary'
                                    )}
                                >
                                    <PenTool className="w-3.5 h-3.5" />
                                    Actualizar Datos
                                </button>
                            </div>

                            {qrTab === 'profile' ? (
                                <>
                                    {/* Blue Instruction Card (Wappy Style - Compact) */}
                                    <div className="bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 text-left w-full flex items-start gap-2.5 shrink-0">
                                        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                            <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">Tarjeta de Emergencia Médica</h4>
                                            <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 leading-relaxed font-semibold">
                                                Escanea para ver el tipo de sangre, alergias, contactos de emergencia y recomendaciones médicas.
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="relative group flex flex-col items-center gap-2.5 py-2 shrink-0">
                                        <div id="worker-profile-qr-container" className="p-3 border border-border-medium bg-white rounded-xl shadow-sm">
                                            <QRCodeSVG value={getQrValue(selectedQrWorker)} size={115} className="mx-auto" level="H" includeMargin={false} />
                                        </div>
                                        <button
                                            onClick={() => downloadQR(selectedQrWorker.nombre || 'Trabajador', 'worker-profile-qr-container')}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg text-[10px] font-bold border border-teal-200 dark:border-teal-900/50 hover:bg-teal-100 transition-colors shadow-sm cursor-pointer shrink-0"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Descargar QR
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Blue Instruction Card (Wappy Style - Compact) */}
                                    <div className="bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 text-left w-full flex items-start gap-2.5 shrink-0">
                                        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                            <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <h4 className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">Enlace de Auto-Actualización</h4>
                                            <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 leading-relaxed font-semibold">
                                                Comparte este enlace para que el trabajador pueda actualizar su información sociodemográfica de forma remota.
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="relative group flex flex-col items-center gap-2.5 py-2 shrink-0">
                                        <div id="worker-update-qr-container" className="p-3 border border-border-medium bg-white rounded-xl shadow-sm">
                                            <QRCodeSVG value={getUpdateQrValue(selectedQrWorker)} size={115} className="mx-auto" level="H" includeMargin={false} />
                                        </div>
                                        <button
                                            onClick={() => downloadQR(`${selectedQrWorker.nombre || 'Trabajador'}_Actualizacion`, 'worker-update-qr-container')}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg text-[10px] font-bold border border-teal-200 dark:border-teal-900/50 hover:bg-teal-100 transition-colors shadow-sm cursor-pointer shrink-0"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Descargar QR
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-gray-50 dark:bg-zinc-900/80 border-t border-border-light dark:border-border-medium flex justify-end shrink-0">
                            <button
                                onClick={() => { setSelectedQrWorker(null); setQrTab('profile'); }}
                                className="px-5 py-1.5 rounded-lg font-bold text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-750 transition-all shadow-sm cursor-pointer">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ═══ General Public Portal QR Modal ═══ */}
            {showPortalQr && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowPortalQr(false)}>
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
                                <p className="text-[11px] text-text-secondary font-semibold">Auto-Actualización de Perfil</p>
                            </div>
                            <button
                                onClick={() => setShowPortalQr(false)}
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
                                    <h4 className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">Portal de Autogestión de Perfil</h4>
                                    <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 leading-relaxed font-semibold">
                                        Comparte este código o enlace. Los trabajadores podrán registrar y actualizar su información sociodemográfica y de contacto desde sus celulares.
                                    </p>
                                </div>
                            </div>

                            <div className="relative group flex flex-col items-center gap-2.5 py-2 shrink-0">
                                <div id="portal-public-qr-container" className="p-3 border border-border-medium bg-white rounded-xl shadow-sm">
                                    <QRCodeSVG value={`${window.location.origin}/sgsst-public/perfil-update/${companyInfo?._id || user?.id || ''}`} size={115} className="mx-auto" level="H" includeMargin={false} />
                                </div>
                                <button
                                    onClick={() => downloadQR("Portal_Publico_SGSST", 'portal-public-qr-container')}
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
                                        value={`${window.location.origin}/sgsst-public/perfil-update/${companyInfo?._id || user?.id || ''}`}
                                        className="flex-grow text-[10px] font-mono px-3 py-2.5 bg-surface-secondary dark:bg-zinc-800 border border-border-medium rounded-xl outline-none text-text-secondary"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/sgsst-public/perfil-update/${companyInfo?._id || user?.id || ''}`);
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
                                onClick={() => setShowPortalQr(false)}
                                className="px-5 py-1.5 rounded-lg font-bold text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-750 transition-all shadow-sm cursor-pointer">
                                Cerrar
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
                            Se detectó un documento no estándar, concepto médico o archivo de texto ({pendingFileData?.name}). 
                            ¿Deseas usar la IA (Gemini) de Somos SST para analizar el contenido, extraer los datos demográficos y de aptitud médica, y crear el perfil del trabajador automáticamente?
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
                            Gemini está analizando la información médica y sociodemográfica del documento. Esto puede tardar unos segundos.
                        </p>
                    </div>
                </div>
            )}

            <SignaturePad
                isOpen={!!activeSignatureWorkerId}
                onClose={() => setActiveSignatureWorkerId(null)}
                title={`Firma digital del trabajador`}
                onSave={(base64) => {
                    if (activeSignatureWorkerId) {
                        updateWorkerField(activeSignatureWorkerId, 'firmaDigital', base64);
                    }
                }}
            />

            <SubUserManagerModal
                isOpen={showSubUserManager}
                onClose={() => {
                    setShowSubUserManager(false);
                    setSelectedWorkerDocForSubUser('');
                }}
                initialWorkerDoc={selectedWorkerDocForSubUser}
            />
        </div>
    );
};

export default PerfilSociodemografico;
