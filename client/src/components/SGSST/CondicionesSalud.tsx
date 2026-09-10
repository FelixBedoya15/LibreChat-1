import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
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
    Activity,
    Stethoscope,
    UserCircle,
    HeartPulse,
    User,
    QrCode,
    Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import SignaturePad from '~/components/SGSST/SignaturePad';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import { NotificationSeverity } from '~/common';

const SCORE_COLOR = (s: number) => {
    if (s >= 80) return { ring: 'border-green-400', text: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
    if (s >= 60) return { ring: 'border-amber-400', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    return { ring: 'border-red-400', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
};
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import SingleSelect from './SingleSelect';
import ReportHistory from '~/components/Liva/ReportHistory';
import { QRCodeSVG } from 'qrcode.react';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import SGSSTToolbar, { ToolbarButton } from './SGSSTToolbar';
import cn from '~/utils/cn';
import { exportPerfilSociodemograficoToExcel, type LicenciaConduccionItem } from './exportPerfilSociodemografico';
import CollapsibleReportBox from './CollapsibleReportBox';
import BioFitAuditModal from './BioFitAuditModal';
import { smartMapExcelToWorkers } from './excelWorkerMapper';

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

const CondicionesSalud = () => {
    const { token, user } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
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
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // QR Code Modal State
    const [selectedQrWorker, setSelectedQrWorker] = useState<WorkerEntry | null>(null);
    const [qrTab, setQrTab] = useState<'profile' | 'update'>('profile');
    const [activeAuditWorker, setActiveAuditWorker] = useState<WorkerEntry | null>(null);

    // Inbox: pending profile updates from workers
    const [showInboxPerfil, setShowInboxPerfil] = useState(false);
    const [inboxPerfil, setInboxPerfil] = useState<any[]>([]);
    const [loadingInbox, setLoadingInbox] = useState(false);

    // Public portal QR modal state
    const [showPortalQr, setShowPortalQr] = useState(false);
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

        window.addEventListener('wappy-reload-sgsst-data', loadData);
        return () => window.removeEventListener('wappy-reload-sgsst-data', loadData);
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
        if (!isPro && trabajadores.length >= 3) {
            setShowUpgradeModal(true);
            return;
        }
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

    const handleExportExcel = async () => {
        try {
            await exportPerfilSociodemograficoToExcel(
                trabajadores,
                'Perfil_Sociodemografico.xlsx',
                cargosDisponibles.map(c => c.nombreCargo)
            );
            showToast({ message: 'Archivo Excel exportado exitosamente con pestañas de respuestas', severity: NotificationSeverity.SUCCESS });
        } catch (error: any) {
            console.error('Error exportando Excel:', error);
            showToast({ message: `Error al exportar Excel: ${error?.message || error}`, severity: NotificationSeverity.ERROR });
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
                        // Validar límites de versión Pro
                        let dataToProcess = parsed;
                        if (!isPro) {
                            const remainingSlots = Math.max(0, 3 - trabajadores.length);
                            if (remainingSlots === 0) {
                                setShowUpgradeModal(true);
                                return;
                            }
                            if (dataToProcess.length > remainingSlots) {
                                dataToProcess = dataToProcess.slice(0, remainingSlots);
                                setTimeout(() => setShowUpgradeModal(true), 500);
                            }
                        }

                        // Formato estándar
                        const nuevosTrabajadores = dataToProcess.map((t: any) => ({
                            ...EMPTY_WORKER,
                            ...t,
                            id: t.id || crypto.randomUUID(),
                            firmaDigital: t.firmaDigital || null,
                            completedByAI: t.completedByAI || false
                        }));
                        setTrabajadores(prev => [...prev, ...nuevosTrabajadores]);
                        showToast({ message: `${nuevosTrabajadores.length} trabajadores importados desde backup`, severity: NotificationSeverity.SUCCESS });
                    } else {
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

        // Si es Excel (.xlsx, .xls), procesamos con mapeador inteligente y fallback a IA
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

                // Normalización inteligente de columnas
                let newWorkers: WorkerEntry[] = smartMapExcelToWorkers(importedData, EMPTY_WORKER);
                let validWorkers = newWorkers.filter(w => (w.nombre && w.nombre.trim()) || (w.identificacion && w.identificacion.trim()));

                if (validWorkers.length > 0) {
                    // Validar límites de versión Pro
                    if (!isPro) {
                        const remainingSlots = Math.max(0, 3 - trabajadores.length);
                        if (remainingSlots === 0) {
                            setShowUpgradeModal(true);
                            return;
                        }
                        if (validWorkers.length > remainingSlots) {
                            validWorkers = validWorkers.slice(0, remainingSlots);
                            setTimeout(() => setShowUpgradeModal(true), 500);
                        }
                    }

                    setTrabajadores(prev => [...prev, ...validWorkers]);
                    showToast({ message: `${validWorkers.length} trabajadores importados correctamente`, severity: NotificationSeverity.SUCCESS });
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
                // Validar límites de versión Pro
                let dataToProcess = data.trabajadores;
                if (!isPro) {
                    const remainingSlots = Math.max(0, 3 - trabajadores.length);
                    if (remainingSlots === 0) {
                        setShowUpgradeModal(true);
                        return;
                    }
                    if (dataToProcess.length > remainingSlots) {
                        dataToProcess = dataToProcess.slice(0, remainingSlots);
                        setTimeout(() => setShowUpgradeModal(true), 500);
                    }
                }

                const nuevosTrabajadores = dataToProcess.map((t: any) => ({
                    ...EMPTY_WORKER,
                    ...t,
                    id: crypto.randomUUID(),
                    firmaDigital: null,
                    completedByAI: true
                }));

                setTrabajadores(prev => [...prev, ...nuevosTrabajadores]);

                showToast({
                    message: `Se han extraído ${nuevosTrabajadores.length} trabajadores con IA exitosamente.`,
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

    // ─── Save & Generate ────────────────────────────────────────
    const handleDummyData = async () => {
        const dummyWorkers = generateDummyData.perfilSociodemografico();
        setTrabajadores(dummyWorkers as any[]);
        showToast({ message: `${dummyWorkers.length} trabajadores de construcción generados con éxito`, severity: NotificationSeverity.SUCCESS });
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
            const res = await fetch('/api/sgsst/perfil-sociodemografico/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ trabajadores }),
            });
            if (res.ok) {
                const data = await res.json();
                // Update workers with IA tags returned from backend
                if (data.trabajadores?.length) setTrabajadores(data.trabajadores);
                window.dispatchEvent(new CustomEvent('wappy-reload-sgsst-data'));
                showToast({ message: 'Perfil guardado ✔️ Análisis IA aplicado', severity: NotificationSeverity.SUCCESS });
            } else throw new Error('Error al guardar');
        } catch (err: any) {
            showToast({ message: err.message, severity: NotificationSeverity.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAnalyze = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-condiciones-salud`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
        if (!trabajadores.length) {
            showToast({ message: 'No hay trabajadores para generar reporte', severity: NotificationSeverity.WARNING });
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
            showToast({ message: 'Informe sociodemográfico generado con éxito', severity: NotificationSeverity.SUCCESS });
        } catch (err: any) {
            showToast({ message: err.message, severity: NotificationSeverity.ERROR });
        } finally {
            setIsAnalyzing(false);
        }
    }, [trabajadores, cargosDisponibles, showToast, token, user, selectedModel]);

    const handleSaveReport = useCallback(async () => {
        const content = editorContentRef.current || generatedReport;
        if (!content || !token) return;
        
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-condiciones-salud`, { headers: { Authorization: `Bearer ${token}` } });
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
                    content,
                    title: `Informe Condiciones de Salud - ${new Date().toLocaleDateString('es-CO')}`,
                    tags: ['sgsst-condiciones-salud'],
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
                showToast({ message: 'Guardado exitosamente', severity: NotificationSeverity.SUCCESS });
            }
        } catch (err: any) {
            showToast({ message: err.message, severity: NotificationSeverity.ERROR });
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
    const calculateBiocentricFit = (w: WorkerEntry) => {
        let score = 100;
        let alerts: string[] = [];
        let isLethal = false;
        const auditItems: { category: string, title: string, description: string, pointsDeducted: number, severity: 'info'|'warning'|'critical' }[] = [];

        const addAudit = (cat: string, title: string, desc: string, pts: number, sev: 'info'|'warning'|'critical') => {
            score -= pts;
            alerts.push(title);
            auditItems.push({ category: cat, title, description: desc, pointsDeducted: pts, severity: sev });
        };

        const cargo = cargosDisponibles.find(c => c.nombreCargo === w.cargo);
        if (!cargo) return { score: 0, alerts: ['No hay rol asignado'], auditItems: [], isLethal: false };

        // 1. Biometría y Signos Vitales
        if (w.imc) {
            const imc = parseFloat(w.imc);
            if (imc >= 30) addAudit('Clínico', 'Obesidad detectada', `El IMC de ${imc} indica obesidad, aumentando el riesgo cardiovascular y metabólico.`, 10, 'warning');
            else if (imc < 18.5) addAudit('Clínico', 'Bajo peso', `El IMC de ${imc} sugiere déficit nutricional o patología subyacente.`, 5, 'info');
        }

        if (w.presionArterial) {
            const [sisStr, diaStr] = w.presionArterial.split('/');
            const sis = parseInt(sisStr || '0');
            const dia = parseInt(diaStr || '0');
            if (sis >= 135 || dia >= 90) addAudit('Clínico', 'Riesgo de Hipertensión', `Presión de ${w.presionArterial} por encima de rangos óptimos. Requiere seguimiento médico.`, 15, 'warning');
        }

        if (w.frecuenciaCardiaca) {
            const fc = parseInt(w.frecuenciaCardiaca);
            if (fc > 100) addAudit('Clínico', 'Taquicardia en reposo', `Frecuencia cardíaca de ${fc} lpm indica posible estrés cardiovascular o metabólico.`, 10, 'warning');
            else if (fc < 50) addAudit('Clínico', 'Bradicardia', `Frecuencia inusualmente baja (${fc} lpm), puede requerir valoración cardiológica.`, 5, 'info');
        }

        // 2. Hábitos
        if (w.fuma === 'Sí, diario') addAudit('Clínico', 'Tabaquismo Activo', 'Consumo diario de tabaco impacta la capacidad pulmonar y oxigenación celular.', 10, 'warning');
        if (w.alcohol === 'Sí (Frecuente)') addAudit('Psicosocial', 'Etilismo Frecuente', 'Aumenta significativamente la accidentabilidad y vulnerabilidad hepática.', 15, 'warning');

        // 3. CAMPOS DE TEXTO LIBRE → IA SEMÁNTICA (sincronizado con OraculoPredictivoH1)
        // TAG_RULES must stay in sync with OraculoPredictivoH1.tsx
        const TAG_RULES_CS: Record<string, { pts: number; sev: 'info'|'warning'|'critical'; cat: string; label: string; desc: string }> = {
            Lumbalgia:            { pts: 10, sev: 'warning',  cat: 'Osteomuscular',      label: 'Lumbalgia',                   desc: 'Restricción lumbar. Limita carga de peso y posturas prolongadas.' },
            Hernia_Discal:        { pts: 15, sev: 'critical', cat: 'Osteomuscular',      label: 'Hernia Discal',               desc: 'Condición discal que puede agravarse con esfuerzo físico.' },
            Cervicalgia:          { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',      label: 'Cervicalgia',                 desc: 'Restricción cervical. Limita posiciones de cuello sostenidas.' },
            Epicondilitis:        { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',      label: 'Epicondilitis',               desc: 'Inflamación en el codo. Limita movimientos repetitivos del antebrazo.' },
            Tunel_Carpiano:       { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',      label: 'Túnel Carpiano',              desc: 'Compresión del nervio mediano. Limita trabajo manual repetitivo.' },
            Restriccion_Hombro:   { pts: 10, sev: 'warning',  cat: 'Osteomuscular',      label: 'Restricción de Hombro',       desc: 'Limitación en el complejo del hombro.' },
            Restriccion_Rodilla:  { pts: 10, sev: 'warning',  cat: 'Osteomuscular',      label: 'Restricción de Rodilla',      desc: 'Limitación articular en rodilla.' },
            No_Carga_Peso:        { pts: 8,  sev: 'warning',  cat: 'Restricción Física', label: 'No Carga de Peso',            desc: 'Restricción médica explícita de levantamiento o carga.' },
            No_Bipedestacion:     { pts: 5,  sev: 'info',     cat: 'Restricción Física', label: 'No Bipedestación',            desc: 'Limitación para permanecer de pie por períodos extendidos.' },
            No_Sedestacion:       { pts: 5,  sev: 'info',     cat: 'Restricción Física', label: 'No Sedestación',              desc: 'Limitación para permanecer sentado por períodos extendidos.' },
            Hipoacusia:           { pts: 8,  sev: 'warning',  cat: 'Sensorial',          label: 'Hipoacusia',                  desc: 'Pérdida auditiva. Requiere protección auditiva y evaluación.' },
            Vision_Reducida:      { pts: 5,  sev: 'info',     cat: 'Sensorial',          label: 'Visión Reducida',             desc: 'Disminución visual. Requiere corrección óptica adecuada.' },
            HTA:                  { pts: 15, sev: 'warning',  cat: 'Clínico',            label: 'Hipertensión Arterial',       desc: 'Tensión arterial elevada. Requiere seguimiento médico.' },
            Cardiopatia:          { pts: 20, sev: 'critical', cat: 'Clínico',            label: 'Cardiopatía',                 desc: 'Condición cardíaca. Limita esfuerzos físicos intensos.' },
            Diabetes:             { pts: 10, sev: 'warning',  cat: 'Clínico',            label: 'Diabetes',                    desc: 'Condición metabólica que requiere control glucémico.' },
            Epilepsia:            { pts: 25, sev: 'critical', cat: 'Neurológico',        label: 'Epilepsia / Convulsiones',    desc: 'Alto riesgo en maquinaria y alturas.' },
            Vertigo:              { pts: 18, sev: 'critical', cat: 'Neurológico',        label: 'Vértigo / Mareo',             desc: 'Riesgo de caída o desequilibrio durante operación de equipos.' },
            EPOC:                 { pts: 15, sev: 'warning',  cat: 'Respiratorio',       label: 'EPOC / Bronquitis',           desc: 'Enfermedad pulmonar. Limita exposición a polvo y químicos.' },
            Asma:                 { pts: 10, sev: 'warning',  cat: 'Respiratorio',       label: 'Asma',                        desc: 'Hipersensibilidad bronquial. Limita exposición a irritantes.' },
            Alergia_Quimica:      { pts: 10, sev: 'warning',  cat: 'Inmunológico',       label: 'Alergia Química',             desc: 'Sensibilidad a químicos. Requiere EPP específico.' },
            Medicamento_SNC:      { pts: 15, sev: 'critical', cat: 'Farmacológico',      label: 'Medicamento Depresor SNC',    desc: 'Sedantes incompatibles con maquinaria. Alerta de seguridad.' },
            Restriccion_Mental:   { pts: 12, sev: 'warning',  cat: 'Psicosocial',        label: 'Restricción de Salud Mental', desc: 'Condición mental que puede afectar concentración y decisiones.' },
            Patologia_Cronica:    { pts: 10, sev: 'warning',  cat: 'Clínico',            label: 'Patología Crónica',           desc: 'Enfermedad crónica base que requiere vigilancia epidemiológica.' },
            Diagnostico_Reciente: { pts: 5,  sev: 'info',     cat: 'Clínico',            label: 'Diagnóstico Reciente',        desc: 'Diagnóstico médico reciente. Amerita seguimiento.' },
            Recomendacion_Leve:   { pts: 3,  sev: 'info',     cat: 'Preventivo',         label: 'Recomendación Médica',        desc: 'Recomendación preventiva activa que debe gestionarse por SST.' },
        };

        const iaTags: string[] = (w as any).bioTagsIA || [];
        const hasIATags = iaTags.length > 0 && !iaTags.includes('Sin_Hallazgos');
        const hasAnyText = [
            w.limitacionesBiomecanicas, w.recomendacionesMedicas,
            w.diagnosticoMedico, w.enfermedades, w.alergiasQuimicas, w.medicamentos
        ].some(v => v && String(v).trim().length > 2 && !String(v).toLowerCase().includes('ninguna') && !String(v).toLowerCase().includes('ninguno'));

        if (hasAnyText) {
            if (hasIATags) {
                iaTags.forEach(tag => {
                    const rule = TAG_RULES_CS[tag];
                    if (!rule) return;
                    let pts = rule.pts;
                    if ((tag === 'Lumbalgia' || tag === 'Hernia_Discal' || tag === 'Restriccion_Hombro' || tag === 'Restriccion_Rodilla') && cargo.exigenciaFisica === 'Alta') pts = Math.round(pts * 1.5);
                    if ((tag === 'Epilepsia' || tag === 'Vertigo' || tag === 'Medicamento_SNC' || tag === 'Restriccion_Mental') && cargo.operaMaquinaria === 'Sí') pts = Math.round(pts * 2.0);
                    if (tag === 'Restriccion_Mental' && cargo.exigenciaMental === 'Alta') pts = Math.round(pts * 1.5);
                    addAudit(rule.cat, rule.label, rule.desc + (pts !== rule.pts ? ' ⚠️ Agravado por exigencias del cargo.' : ''), pts, rule.sev);
                });
            } else {
                // Fallback genérico mientras IA procesa los campos de texto
                const hasEnf = w.enfermedades?.trim() && !w.enfermedades.toLowerCase().includes('ninguna');
                const hasDiag = w.diagnosticoMedico?.trim() && !w.diagnosticoMedico.toLowerCase().includes('ninguno') && !w.diagnosticoMedico.toLowerCase().includes('apto');
                const hasRestr = w.limitacionesBiomecanicas?.trim() && !w.limitacionesBiomecanicas.toLowerCase().includes('ninguna');
                const hasRec = w.recomendacionesMedicas?.trim() && !w.recomendacionesMedicas.toLowerCase().includes('ninguna');
                const hasAl = w.alergiasQuimicas?.trim() && !w.alergiasQuimicas.toLowerCase().includes('ninguna');
                if (hasEnf) addAudit('Clínico', 'Patología Base (pendiente IA)', `${w.enfermedades}`, 10, 'warning');
                if (hasDiag && !hasEnf) addAudit('Clínico', 'Diagnóstico Médico (pendiente IA)', `${w.diagnosticoMedico}`, 5, 'info');
                if (hasRestr) addAudit('Físico', 'Restricción Biomecánica (pendiente IA)', `${w.limitacionesBiomecanicas}`, 8, 'warning');
                if (hasRec) addAudit('Preventivo', 'Recomendación Médica (pendiente IA)', `${w.recomendacionesMedicas}`, 3, 'info');
                if (hasAl) addAudit('Clínico', 'Alergia Química (pendiente IA)', `${w.alergiasQuimicas}`, 8, 'warning');
            }
        }

        // Variables for cargo cross-checks below
        const hasEnfermedad = !hasIATags && w.enfermedades?.trim() && !w.enfermedades.toLowerCase().includes('ninguna');
        const hasDiagnostico = !hasIATags && w.diagnosticoMedico?.trim() && !w.diagnosticoMedico.toLowerCase().includes('ninguno') && !w.diagnosticoMedico.toLowerCase().includes('apto');
        const hasBiomecanica = !hasIATags && w.limitacionesBiomecanicas && w.limitacionesBiomecanicas.length > 2 && !w.limitacionesBiomecanicas.toLowerCase().includes('ninguna');

        // 4. Vulnerabilidad Sociodemográfica y Psicosocial
        // NOTA: Para evitar sesgos discriminatorios (Ley y OIT), estos factores NO restan puntos al "Fit" (pts = 0).
        // Se mantienen únicamente como Alertas de Vigilancia Epidemiológica para el prevencionista SST.
        let vulnerabilidadSocial = 0;
        let socialDesc: string[] = [];
        if (['1', '2'].includes(w.estrato)) { vulnerabilidadSocial++; socialDesc.push('estrato socioeconómico bajo'); }
        if (w.personasCargo && Number(w.personasCargo) >= 3) { vulnerabilidadSocial++; socialDesc.push('alta carga de dependientes'); }
        if (w.estadoCivil?.toLowerCase().includes('solter') || w.estadoCivil?.toLowerCase().includes('viud') || w.estadoCivil?.toLowerCase().includes('divorciad')) {
            if (w.personasCargo && Number(w.personasCargo) > 0) { vulnerabilidadSocial++; socialDesc.push('monoparentalidad'); }
        }
        if (w.vivienda?.toLowerCase().includes('arrendada') || w.vivienda?.toLowerCase().includes('invasión')) { vulnerabilidadSocial++; socialDesc.push('inestabilidad habitacional'); }
        
        if (vulnerabilidadSocial >= 3) {
            addAudit('Vigilancia Epidemiológica', 'Vulnerabilidad Sociodemográfica', `Factores estresores: ${socialDesc.join(', ')}. Sugerido apoyo psicosocial.`, 0, 'info');
        } else if (vulnerabilidadSocial >= 2) {
            addAudit('Vigilancia Epidemiológica', 'Factores Psicosociales Externos', `Factores detectados: ${socialDesc.join(', ')}.`, 0, 'info');
        }

        if (w.nivelEscolaridad?.toLowerCase().includes('primaria')) {
            addAudit('Vigilancia Epidemiológica', 'Escolaridad Básica', 'Puede requerir métodos de capacitación más visuales y acompañamiento cercano en SST.', 0, 'info');
        }

        // 5. Cruce vs. Exigencias del Cargo
        if (cargo.exigenciaFisica === 'Alta') {
            if (w.edad && Number(w.edad) > 55) addAudit('Preventivo', 'Alerta Ergonómica por Edad', 'La edad avanzada requiere monitoreo preventivo ante altas exigencias físicas.', 0, 'info');
            if (hasEnfermedad || hasDiagnostico) addAudit('Operativo', 'Patología en Rol Exigente', 'La carga física intensa puede agravar la patología base.', 10, 'critical');
            if (hasBiomecanica) addAudit('Operativo', 'Restricción Biomecánica Crítica', 'Peligro inminente de lesión osteomuscular por incompatibilidad con el esfuerzo.', 20, 'critical');
        }

        if (cargo.exigenciaMental === 'Alta') {
            if (w.terapiaPsicologica === 'Sí') addAudit('Psicosocial', 'Alerta de Burnout', 'Rol de alta tensión mental sumado a necesidad clínica de psicoterapia.', 15, 'critical');
            if (vulnerabilidadSocial >= 2) addAudit('Vigilancia Epidemiológica', 'Contexto Psicosocial Estresante', 'La vulnerabilidad social sumada al rol estresante requiere vigilancia activa.', 0, 'info');
        }

        if (cargo.operaMaquinaria === 'Sí' && !hasIATags) {
            const medLower = (w.medicamentos || '').toLowerCase();
            const hasMedsLethal = medLower.includes('psiquiátrico') || medLower.includes('dormir') || medLower.includes('sedante') || medLower.includes('ansiolítico');
            if (hasMedsLethal || w.alcohol === 'Sí (Frecuente)') {
                isLethal = true;
                addAudit('Operativo', '🛑 BLOQUEO PREVENTIVO', 'Uso de sustancias depresoras del SNC es incompatible con operación de maquinaria.', 40, 'critical');
            }
        }

        // 6. Entrenamiento y Formación Legal
        if (cargo.entrenamientosSeleccionados && cargo.entrenamientosSeleccionados.length > 0) {
            const req = cargo.entrenamientosSeleccionados.length;
            if (req > 0 && !w.curso50h && !w.curso20h) {
                let penalty = 5; // Base
                penalty += req; // +1 por cada curso
                const criticalKeywords = ['alturas', 'confinado', '50 horas', '50h', '20 horas', '20h', 'licencia', 'emergencia', 'rescate', 'primeros auxilios', 'coordinador'];
                const hasCritical = cargo.entrenamientosSeleccionados.some((c: string) => criticalKeywords.some(k => c.toLowerCase().includes(k)));
                if (hasCritical) penalty += 5; // +5 adicional si falta un curso legal crítico
                addAudit('Entrenamiento', 'Brecha Formativa SST', `Cursos obligatorios sin acreditar: ${cargo.entrenamientosSeleccionados.join(', ')}.`, penalty, 'warning');
            }
        }

        return { score: Math.max(0, score), alerts: Array.from(new Set(alerts)), auditItems, isLethal };
    };

    // ─── Render ──────────────────────────────────────────────────

    useAutoLoadReport({
        token,
        tags: ['sgsst-condiciones-salud'],
        generatedReport: generatedReport,
        handleSelectReport
    });

    // Auto-load y carga reactiva de la bandeja biomédica
    React.useEffect(() => {
        handleLoadInbox(true); // silent fetch on mount

        // Opcional: Escuchar cuando una notificación en Head nos pida abrir
        const handleOpenInbox = (e: Event) => {
            const { module } = (e as CustomEvent).detail || {};
            if (module === 'condiciones_salud') {
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
            setInboxPerfil(json.actualizacionesPendientesSalud || []);
        } catch (e) {
            showToast({ message: 'Error al cargar actualizaciones pendientes', severity: NotificationSeverity.ERROR });
        } finally {
            setLoadingInbox(false);
        }
    };

    // Approve a pending health update by hitting endpoint
    const handleApproveUpdate = async (update: any) => {
        const { workerId, changes, id: updateId } = update;
        try {
            const res = await fetch('/api/sgsst/perfil-sociodemografico/inbox/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ updateId, workerId, changes, inboxType: 'health' })
            });
            if (res.ok) {
                const json = await res.json();
                setTrabajadores(prev => prev.map(w => w.id === workerId ? { ...w, ...changes } : w));
                setInboxPerfil(json.actualizacionesPendientesSalud || []);
                showToast({ message: 'Condición médica actualizada permanentemente', severity: NotificationSeverity.SUCCESS });
            }
        } catch (e) {
            showToast({ message: 'Error al actualizar', severity: NotificationSeverity.ERROR });
        }
    };

    // Dismiss a pending health update by hitting endpoint
    const handleDismissUpdate = async (updateId: string) => {
        try {
            const res = await fetch('/api/sgsst/perfil-sociodemografico/inbox/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ updateId, inboxType: 'health' })
            });
            if (res.ok) {
                const json = await res.json();
                setInboxPerfil(json.actualizacionesPendientesSalud || []);
                showToast({ message: 'Solicitud descartada permanentemente', severity: NotificationSeverity.SUCCESS });
            }
        } catch (e) {
            showToast({ message: 'Error al descartar', severity: NotificationSeverity.ERROR });
        }
    };

    return (
        <>
        {/* ── WAPPY IA Loading Overlay ── */}
        {isSaving && ReactDOM.createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="relative flex flex-col items-center gap-6 px-8 py-10 rounded-2xl bg-surface-secondary border border-border-medium shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                    {/* Logo Wappy animado */}
                    <div className="relative flex items-center justify-center w-24 h-24">
                        <div className="absolute inset-0 rounded-full bg-teal-500/20 animate-ping" />
                        <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/30 overflow-hidden bg-white">
                            <img src="/assets/logo-bg.png" alt="Wappy" className="w-full h-full object-cover" />
                        </div>
                    </div>
                    {/* Texto */}
                    <div className="text-center space-y-1.5">
                        <p className="text-lg font-black text-text-primary tracking-tight">Analizando perfil clínico</p>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            El Oráculo H1 está procesando los hallazgos médicos con inteligencia semántica.<br/>
                            Esto puede tomar unos segundos.
                        </p>
                    </div>
                    {/* Barra de progreso animada */}
                    <div className="w-full h-1.5 bg-border-light rounded-full overflow-hidden mt-2">
                        <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full animate-pulse" style={{ width: '75%' }} />
                    </div>
                    {/* Puntos animados */}
                    <div className="flex items-center gap-1.5 mt-2">
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className="w-2.5 h-2.5 rounded-full bg-teal-500"
                                style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                            />
                        ))}
                    </div>
                    <p className="text-[10px] text-text-secondary/60 font-medium uppercase tracking-widest mt-2">Motor Bio-Fit WAPPY · IA Semántica</p>
                </div>
            </div>,
            document.body
        )}
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
                    </div>
                ]}
            />

            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-900 via-teal-800 to-cyan-900 p-8 text-white shadow-2xl">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-teal-400 blur-3xl -mr-20 -mt-20 opacity-10" />
                    <div className="absolute bottom-0 left-0 w-60 h-60 rounded-full bg-cyan-400 blur-3xl -ml-10 -mb-10 opacity-10" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-teal-400/20 backdrop-blur-sm border border-teal-400/30 flex items-center justify-center">
                            <HeartPulse className="w-5 h-5 text-teal-300" />
                        </div>
                        <h1 className="text-2xl font-black tracking-tight">Condiciones de Salud (Huella Biocéntrica)</h1>
                    </div>
                    <p className="text-teal-100/80 text-sm max-w-2xl leading-relaxed">
                        Seguimiento médico-clínico y vigilancia epidemiológica. Registra signos vitales, diagnósticos de ingreso/periódicos, recomendaciones y restricciones biomecánicas del trabajador.
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
                tags={['sgsst-condiciones-salud']}
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
                            const fitData = calculateBiocentricFit(w);
                            const scoreColor = fitData.score >= 80 ? 'text-green-500' : fitData.score >= 60 ? 'text-yellow-500' : 'text-red-500';
                            const scoreBg = fitData.score >= 80 ? 'bg-green-50 dark:bg-green-900/20 shadow-green-500/20' : fitData.score >= 60 ? 'bg-yellow-50 dark:bg-yellow-900/20 shadow-yellow-500/20' : 'bg-red-50 dark:bg-red-900/20 shadow-red-500/20';
                            const colors = SCORE_COLOR(fitData.score);
                            const initials = (w.nombre?.trim() || 'U')[0].toUpperCase();
                            
                            return (
                            <div key={w.id} className={cn("rounded-2xl border border-border-medium bg-surface-secondary shadow-sm border-l-4 border-l-teal-500 transition-all", expandedWorkers.has(w.id) ? "overflow-visible" : "overflow-hidden")}>
                                {/* Worker Header */}
                                <div className="flex items-center justify-between p-5 bg-surface-primary/50 cursor-pointer gap-4" onClick={() => toggleWorker(w.id)}>
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className="text-teal-500 shrink-0">
                                            {expandedWorkers.has(w.id) ? <AnimatedIcon name="chevron-down" size={20} /> : <AnimatedIcon name="chevron-right" size={20} />}
                                        </div>
                                        <div className={`w-14 h-14 rounded-2xl border-2 ${colors.ring} ${colors.bg} ${colors.text} flex items-center justify-center text-xl font-black shrink-0 shadow-sm`}>
                                            {initials}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-black text-text-primary text-base truncate flex items-center gap-2">
                                                {wIdx + 1}. {w.nombre || 'Nuevo Trabajador'}
                                            </h3>
                                            <div className="hidden md:flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary mt-1">
                                                <span className="font-bold text-teal-600 dark:text-teal-400">{w.cargo || 'Sin cargo asignado'}</span>
                                                <span>•</span>
                                                <span>CC: {w.identificacion || 'N/A'}</span>
                                                <span className="hidden sm:inline">•</span>
                                                <span className="hidden sm:inline">{w.genero || '—'}</span>
                                                <span className="hidden sm:inline">•</span>
                                                <span className="hidden sm:inline">{w.edad ? `${w.edad} años` : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        <div className={`hidden md:block px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${colors.badge} shadow-sm mr-1`}>
                                            {fitData.score}% FIT
                                        </div>
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

                                {/* Worker Body, Premium Medical Dashboard UI */}
                                {expandedWorkers.has(w.id) && (
                                    <div className="p-0 border-t border-border-light animate-in fade-in duration-300 bg-surface-primary/20 relative">
                                        
                                        {/* Bio-Fit Radar Premium Card */}
                                        {w.cargo && cargosDisponibles.length > 0 && (
                                            <div className="p-5 md:p-8 border-b border-border-light bg-gradient-to-br from-surface-secondary/80 to-surface-primary relative overflow-hidden">
                                                <div className={`absolute top-0 right-0 w-64 h-64 rounded-full mix-blend-multiply filter blur-[80px] opacity-20 pointer-events-none ${scoreBg}`}></div>
                                                
                                                <div className={`p-6 rounded-[2rem] border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] backdrop-blur-md transition-all duration-500 hover:shadow-lg relative overflow-hidden bg-white/40 dark:bg-[#1a1a1a]/40 group`}>
                                                    <div className={`absolute top-0 left-0 w-1.5 h-full transition-all duration-700 ${fitData.score >= 80 ? 'bg-gradient-to-b from-green-400 to-emerald-600' : fitData.score >= 60 ? 'bg-gradient-to-b from-yellow-400 to-orange-500' : 'bg-gradient-to-b from-red-500 to-rose-700'}`}></div>

                                                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 pl-4">
                                                        <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
                                                            <div 
                                                                className="relative group-hover:scale-110 transition-transform duration-500 cursor-pointer"
                                                                onClick={() => setActiveAuditWorker(w)}
                                                                title="Ver Auditoría Detallada"
                                                            >
                                                                <svg className="w-28 h-28 transform -rotate-90 filter drop-shadow-md">
                                                                    <circle cx="56" cy="56" r="50" fill="none" stroke="currentColor" strokeWidth="6" className="text-border-light dark:text-white/5" />
                                                                    <circle cx="56" cy="56" r="50" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="314.159" strokeDashoffset={314.159 - (fitData.score / 100) * 314.159} className={`transition-all duration-1000 ease-out ${scoreColor}`} strokeLinecap="round" />
                                                                </svg>
                                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                    <span className={`text-3xl font-black tracking-tighter ${scoreColor}`}>{fitData.score}%</span>
                                                                    <span className="text-[9px] uppercase font-bold tracking-widest text-text-secondary">FIT</span>
                                                                </div>
                                                            </div>

                                                            <div className="text-center md:text-left cursor-pointer" onClick={() => setActiveAuditWorker(w)}>
                                                                <h4 className="text-lg font-black text-text-primary uppercase tracking-wider mb-2 flex items-center justify-center md:justify-start gap-2 hover:text-teal-600 transition-colors">
                                                                    <Activity className="w-5 h-5 text-teal-600 dark:text-teal-400 animate-pulse"/> Índice Biocéntrico Integral
                                                                </h4>
                                                                <p className="text-sm font-medium text-text-secondary leading-relaxed max-w-sm">Evaluación clínica vs exigencias del rol: <span className="font-bold text-text-primary p-1 bg-surface-secondary rounded-md border border-border-light">{w.cargo}</span>.</p>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-2.5 w-full md:flex-1 md:max-w-md">
                                                            {fitData.alerts.length === 0 ? (
                                                                <div className="flex items-center gap-3 text-sm font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 p-4 rounded-2xl shadow-sm">
                                                                    <div className="p-2 bg-green-100 dark:bg-green-800/50 rounded-full"><CheckCircle className="w-5 h-5"/></div>
                                                                    Aptitud Operativa Óptima.
                                                                </div>
                                                            ) : (
                                                                fitData.alerts.map((alert, idx) => (
                                                                    <div key={idx} className={`flex text-xs font-bold px-4 py-3 rounded-2xl gap-3 items-center border transition-all duration-300 hover:-translate-x-1 ${alert.includes('BLOQUEO') ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg animate-[pulse_2s_ease-in-out_infinite] border-red-400' : 'text-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50'}`}>
                                                                         <AlertTriangle className="w-5 h-5 flex-shrink-0 opacity-90"/> <span className="leading-tight">{alert}</span>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Split Clinical Grid */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-light border-b border-border-light">
                                            
                                            {/* COLUMNA IZQUIERDA: SIGNOS VITALES Y BIOMETRÍA */}
                                            <div className="p-5 md:p-8 space-y-6">
                                                <div className="flex items-center gap-2 pb-3 border-b border-border-light">
                                                    <div className="p-2 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-lg">
                                                        <Stethoscope className="w-4 h-4" />
                                                    </div>
                                                    <h4 className="font-black text-xs text-text-primary uppercase tracking-wider">Fisiología & Biometría</h4>
                                                </div>

                                                <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-2xl bg-surface-secondary/50 border border-border-light">
                                                    {/* Dial Circular de Score Biomédico Centralizado */}
                                                    <div className="relative shrink-0 w-24 h-24 flex items-center justify-center">
                                                        <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                                                            <circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" strokeWidth="5" className="text-border-light dark:text-white/5" />
                                                            <circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="263.89" strokeDashoffset={263.89 - (fitData.score / 100) * 263.89} className={`transition-all duration-1000 ease-out ${scoreColor}`} strokeLinecap="round" />
                                                        </svg>
                                                        <div className="flex flex-col items-center justify-center">
                                                            <span className={`text-2xl font-black tracking-tighter ${scoreColor}`}>{fitData.score}%</span>
                                                            <span className="text-[8px] uppercase font-bold tracking-widest text-text-secondary">FIT</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-center sm:text-left space-y-1">
                                                        <h5 className="font-bold text-sm text-text-primary">Aptitud Clínica</h5>
                                                        <p className="text-xs text-text-secondary leading-relaxed">Monitoreo dinámico del estado fisiológico del trabajador frente a sus funciones asignadas.</p>
                                                    </div>
                                                </div>

                                                {/* Cuadrícula 2x2 */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-surface-primary rounded-xl p-3 border border-border-light text-center shadow-inner hover:scale-[1.02] transition-transform flex flex-col justify-between">
                                                        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block mb-2">Peso (kg)</label>
                                                        <input type="number" value={w.peso} onChange={e => updateWorkerField(w.id, 'peso', e.target.value)}
                                                            className="w-full text-center text-sm py-1.5 px-2 rounded-lg border border-border-medium bg-surface-secondary focus:border-teal-400 focus:ring-1 focus:ring-teal-400/20 text-text-primary font-bold outline-none shadow-inner" />
                                                    </div>
                                                    <div className="bg-surface-primary rounded-xl p-3 border border-border-light text-center shadow-inner hover:scale-[1.02] transition-transform flex flex-col justify-between">
                                                        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block mb-2">Talla (m)</label>
                                                        <input type="number" value={w.talla} onChange={e => updateWorkerField(w.id, 'talla', e.target.value)} step="0.01" placeholder="Ej: 1.75"
                                                            className="w-full text-center text-sm py-1.5 px-2 rounded-lg border border-border-medium bg-surface-secondary focus:border-teal-400 focus:ring-1 focus:ring-teal-400/20 text-text-primary font-bold outline-none shadow-inner" />
                                                    </div>
                                                    <div className="bg-surface-primary rounded-xl p-3 border border-border-light text-center shadow-inner hover:scale-[1.02] transition-transform flex flex-col justify-between">
                                                        <label className="text-[10px] font-black text-teal-600 dark:text-teal-400 tracking-widest block mb-2 uppercase">IMC (Calculado)</label>
                                                        <input type="text" readOnly value={w.imc} placeholder="Automático"
                                                            className={`w-full text-center text-sm font-black py-1.5 px-2 rounded-lg border outline-none ${w.imc && parseFloat(w.imc) > 25 ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 shadow-[inset_0_2px_6px_rgba(251,146,60,0.15)]' : 'border-border-light bg-surface-tertiary text-text-tertiary'}`} />
                                                    </div>
                                                    <div className="bg-surface-primary rounded-xl p-3 border border-border-light text-center shadow-inner hover:scale-[1.02] transition-transform flex flex-col justify-between">
                                                        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest block mb-2">Tipo Sangre</label>
                                                        <div className="text-left">
                                                            <SingleSelect value={w.tipoSangre || ''} onChange={val => updateWorkerField(w.id, 'tipoSangre', val)} placeholder="Seleccione..." options={['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Presión Arterial</label>
                                                        <input type="text" value={w.presionArterial} onChange={e => updateWorkerField(w.id, 'presionArterial', e.target.value)}
                                                            placeholder="Ej: 120/80" className="w-full text-sm py-2 px-3 rounded-xl border border-border-medium bg-surface-secondary focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 text-text-primary outline-none shadow-inner" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Frec. Cardíaca (lpm)</label>
                                                        <input type="number" value={w.frecuenciaCardiaca} onChange={e => updateWorkerField(w.id, 'frecuenciaCardiaca', e.target.value)}
                                                            placeholder="Ej: 75" className="w-full text-sm py-2 px-3 rounded-xl border border-border-medium bg-surface-secondary focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 text-text-primary outline-none shadow-inner" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* COLUMNA DERECHA: RESTRICCIONES Y PATOLOGÍAS */}
                                            <div className="p-5 md:p-8 space-y-6">
                                                <div className="flex items-center gap-2 pb-3 border-b border-border-light">
                                                    <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg">
                                                        <Activity className="w-4 h-4" />
                                                    </div>
                                                    <h4 className="font-black text-xs text-text-primary uppercase tracking-wider">Patologías & Hallazgos</h4>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Alergias Químicas / Asma</label>
                                                        <input type="text" value={w.alergiasQuimicas} onChange={e => updateWorkerField(w.id, 'alergiasQuimicas', e.target.value)}
                                                            placeholder="Riesgo de choque anafiláctico..."
                                                            className="w-full text-sm py-2.5 px-3 rounded-xl border border-rose-200/50 bg-rose-50/20 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-text-primary dark:border-rose-900/30 dark:bg-rose-900/10 dark:focus:bg-surface-primary outline-none shadow-inner" />
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Limitaciones Biomecánicas</label>
                                                        <input type="text" value={w.limitacionesBiomecanicas} onChange={e => updateWorkerField(w.id, 'limitacionesBiomecanicas', e.target.value)}
                                                            placeholder="Hernia, manguito rotador, rodillas..."
                                                            className="w-full text-sm py-2.5 px-3 rounded-xl border border-rose-200/50 bg-rose-50/20 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-text-primary dark:border-rose-900/30 dark:bg-rose-900/10 dark:focus:bg-surface-primary outline-none shadow-inner" />
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Enfermedades Preexistentes Diagnosticadas</label>
                                                    <input type="text" value={w.enfermedades} onChange={e => updateWorkerField(w.id, 'enfermedades', e.target.value)}
                                                        placeholder="Patologías metabólicas, diabetes, cardíacas..."
                                                        className="w-full text-sm py-2.5 px-3 rounded-xl border border-rose-200/50 bg-rose-50/20 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-text-primary dark:border-rose-900/30 dark:bg-rose-900/10 dark:focus:bg-surface-primary outline-none shadow-inner" />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Hallazgos Examen Ocupacional</label>
                                                        <div className="[&>div>div]:border-rose-200/50 dark:[&>div>div]:border-rose-900/30 [&>div>div]:bg-rose-50/20 dark:[&>div>div]:bg-rose-900/10 font-bold">
                                                            <SingleSelect value={w.diagnosticoMedico || ''} onChange={val => updateWorkerField(w.id, 'diagnosticoMedico', val)} placeholder="Seleccione dictamen..." options={['Apto / Sin Hallazgos / Ninguno', 'Espalda: Lumbalgia / Cervicalgia / Hernias', 'M. Superiores: Túnel carpiano / Epicondilitis / Manguito', 'Vicios de refracción', 'Hipoacusia', 'Otros Clínicos']} />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Medicamentos de Consumo</label>
                                                        <input type="text" value={w.medicamentos} onChange={e => updateWorkerField(w.id, 'medicamentos', e.target.value)}
                                                            placeholder="Sedantes, psiquiátricos, etc..."
                                                            className="w-full text-sm py-2.5 px-3 rounded-xl border border-rose-200/50 bg-rose-50/20 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 text-text-primary dark:border-rose-900/30 dark:bg-rose-900/10 dark:focus:bg-surface-primary outline-none shadow-inner" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Fila 2: Recomendaciones, Estilos de Vida & Firma */}
                                        <div className="p-5 md:p-8 space-y-6 bg-surface-secondary/10">
                                            
                                            {/* Recomendaciones y Fecha Evaluación */}
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                                <div className="space-y-1.5 md:col-span-3">
                                                    <label className="text-[11px] font-bold text-orange-500 uppercase tracking-wider">Recomendaciones & Restricciones Médicas (SST)</label>
                                                    <input type="text" value={w.recomendacionesMedicas || ''} onChange={e => updateWorkerField(w.id, 'recomendacionesMedicas', e.target.value)}
                                                        placeholder="Pautas del médico para reubicación laboral..."
                                                        className="w-full text-sm py-2.5 px-3 rounded-xl border border-orange-200/50 bg-orange-50/20 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 text-text-primary dark:border-orange-900/30 dark:bg-orange-900/10 dark:focus:bg-surface-primary outline-none shadow-inner" />
                                                </div>

                                                <div className="space-y-1.5 md:col-span-1">
                                                    <label className="text-[11px] font-bold text-orange-500 uppercase tracking-wider">Fecha Evaluación</label>
                                                    <input type="date" value={w.fechaExamenMedico} onChange={e => updateWorkerField(w.id, 'fechaExamenMedico', e.target.value)}
                                                        className="w-full text-sm py-2.5 px-3 rounded-xl border border-orange-200/50 bg-orange-50/20 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 text-text-primary dark:border-orange-900/30 dark:bg-orange-900/10 dark:focus:bg-surface-primary outline-none shadow-inner" />
                                                </div>
                                            </div>

                                            {/* Estilos de Vida & Carga Mental */}
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 pb-2 border-b border-border-light">
                                                    <div className="p-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg">
                                                        <UserCircle className="w-4 h-4" />
                                                    </div>
                                                    <h4 className="font-black text-xs text-text-primary uppercase tracking-wider">Estilos de Vida & Acompañamiento</h4>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider block truncate">Tabaquismo</label>
                                                        <div className="[&>div>div]:border-amber-200/50 [&>div>div]:bg-amber-50/20 dark:[&>div>div]:border-amber-900/30 dark:[&>div>div]:bg-amber-900/10">
                                                            <SingleSelect value={w.fuma || ''} onChange={val => updateWorkerField(w.id, 'fuma', val)} placeholder="Seleccione..." options={['No', 'Sí, diario', 'Ocasional']} />
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider block truncate">Etilismo (Alcohol)</label>
                                                        <div className="[&>div>div]:border-amber-200/50 [&>div>div]:bg-amber-50/20 dark:[&>div>div]:border-amber-900/30 dark:[&>div>div]:bg-amber-900/10">
                                                            <SingleSelect value={w.alcohol || ''} onChange={val => updateWorkerField(w.id, 'alcohol', val)} placeholder="Riesgo Letal..." options={['No', 'Mensual', 'Semanal', 'Sí (Frecuente)']} />
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider block truncate">Acompañ. Psicológico</label>
                                                        <div className="[&>div>div]:border-indigo-200/50 [&>div>div]:bg-indigo-50/20 dark:[&>div>div]:border-indigo-900/30 dark:[&>div>div]:bg-indigo-900/10">
                                                            <SingleSelect value={w.terapiaPsicologica || ''} onChange={val => updateWorkerField(w.id, 'terapiaPsicologica', val)} placeholder="Burnout..." options={['No', 'Sí', 'Anteriormente']} />
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-1.5">
                                                        <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block truncate">Próximo Seguimiento</label>
                                                        <input type="date" value={w.fechaSeguimiento} onChange={e => updateWorkerField(w.id, 'fechaSeguimiento', e.target.value)}
                                                            className="w-full text-sm py-2 px-3 rounded-xl border border-border-medium bg-surface-secondary focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 text-text-primary outline-none shadow-inner" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Firma Digital Card */}
                                            <div className="p-4 border rounded-2xl bg-surface-primary border-border-medium shadow-sm">
                                                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                                                    <div className="space-y-1.5 w-full md:w-1/2">
                                                        <label className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Consentimiento Informado (Firma Digital)</label>
                                                        <div className="[&>div>div]:bg-indigo-50/10 dark:[&>div>div]:bg-indigo-900/10 font-bold">
                                                            <SingleSelect value={w.consentimientoFirmaDigital || 'No' || ''} onChange={val => updateWorkerField(w.id, 'consentimientoFirmaDigital', val)} placeholder="Seleccione..." options={['Sí', 'No']} />
                                                        </div>
                                                        <p className="text-[10px] text-text-secondary mt-1 max-w-[280px]">Habilita la firma del trabajador en su credencial de emergencia y reportes.</p>
                                                    </div>

                                                    <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-4 border-2 border-dashed border-border-medium rounded-xl relative hover:bg-surface-secondary/50 transition-colors bg-surface-secondary/35">
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
                                                                    <span className="text-xs uppercase font-bold">Cargar Archivo</span>
                                                                    <input type="file" accept="image/*" onChange={(e) => handleFirmaUpload(w.id, e)} className="hidden" />
                                                                </label>
                                                                <button 
                                                                    onClick={(e) => { e.preventDefault(); setActiveSignatureWorkerId(w.id); }}
                                                                    className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg w-full transition-colors font-medium border border-indigo-200 dark:border-indigo-800"
                                                                >
                                                                    <PenTool size={16} />
                                                                    <span className="text-xs uppercase font-bold">Dibujar en Pantalla</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
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
                    title="Documento de Perfil Epidemiológico Generado"
                    icon={<AnimatedIcon name="file-text" size={16} className="text-teal-600" />}
                    actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_PerfilEpidemiologico"
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
                                                Comparte este enlace para que el trabajador pueda actualizar sus condiciones de salud de forma remota.
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

                                    <div className="w-full space-y-1.5 pt-1 shrink-0">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400 text-center opacity-70">Enlace de acceso personal</p>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                readOnly
                                                value={getUpdateQrValue(selectedQrWorker)}
                                                className="flex-grow text-[9px] font-mono px-3 py-2.5 bg-surface-secondary dark:bg-zinc-800 border border-border-medium rounded-xl outline-none text-text-secondary"
                                            />
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(getUpdateQrValue(selectedQrWorker));
                                                    showToast({ message: 'Enlace copiado al portapapeles', severity: NotificationSeverity.SUCCESS });
                                                }}
                                                className="px-3.5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-[9px] font-bold rounded-lg transition-colors shadow-sm shrink-0"
                                            >
                                                Copiar
                                            </button>
                                        </div>
                                        <p className="text-[8px] text-text-secondary text-center font-bold tracking-tight opacity-75">
                                            ⚠️ Las actualizaciones requerirán aprobación de SST en bandeja.
                                        </p>
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
                                    <h4 className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">Portal de Autogestión Médica</h4>
                                    <p className="text-[10px] text-indigo-600/90 dark:text-indigo-400/90 leading-relaxed font-semibold">
                                        Comparte este código o enlace. Los trabajadores podrán actualizar sus condiciones de salud e incompatibilidades clínicas de forma rápida desde sus celulares.
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
                                            showToast({ message: 'Enlace copiado al portapapeles', severity: NotificationSeverity.SUCCESS });
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

            <BioFitAuditModal 
                isOpen={!!activeAuditWorker}
                onClose={() => setActiveAuditWorker(null)}
                workerName={activeAuditWorker?.nombre || 'Trabajador'}
                cargoName={activeAuditWorker?.cargo || 'Sin cargo'}
                score={activeAuditWorker ? calculateBiocentricFit(activeAuditWorker).score : 100}
                auditItems={activeAuditWorker ? calculateBiocentricFit(activeAuditWorker).auditItems : []}
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
    </>
    );
};

export default CondicionesSalud;
