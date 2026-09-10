import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
    Users,
    UserPlus,
    Shield,
    Key,
    CheckCircle2,
    XCircle,
    Trash2,
    Edit3,
    Building2,
    AlertCircle,
    Eye,
    EyeOff,
    RefreshCw,
    Lock,
    UserCheck,
    Search,
    X,
    Check,
    HelpCircle,
    Sparkles,
    ChevronRight
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';

export interface SubUser {
    _id: string;
    name: string;
    email: string;
    workerDocument: string;
    workerId?: string;
    assignedCompany: string;
    company?: {
        _id: string;
        companyName: string;
        nit: string;
    };
    subUserPermissions: string[];
    subUserStatus: 'active' | 'suspended';
    createdAt: string;
    updatedAt: string;
}

export interface AvailableWorker {
    id: string;
    identificacion: string;
    nombre: string;
    email: string;
    cargo: string;
    companyId: string;
    companyName: string;
    hasSubUser: boolean;
    subUserId?: string;
    subUserEmail?: string;
    subUserStatus?: string;
}

export interface CompanyItem {
    _id: string;
    companyName: string;
    nit: string;
    isActive?: boolean;
}

export type PermissionCategory = 
    | 'IA & Chat WAPPY' 
    | 'Somos SST Operativo' 
    | 'Matrices & Legal' 
    | 'Academia & LMS' 
    | 'Gestión ACPM & Auditoría' 
    | 'Comunidad & Blog';

export interface PermissionOption {
    id: string;
    label: string;
    description: string;
    category: PermissionCategory;
    icon?: string;
}

export const AVAILABLE_PERMISSIONS: PermissionOption[] = [
    // ─── 1. IA & Chat WAPPY ──────────────────────────────────────────────
    {
        id: 'chat:wappy_general',
        label: 'Chat Principal & Agentes WAPPY',
        description: 'Conversar con el asistente de IA general y agentes especializados de WAPPY.',
        category: 'IA & Chat WAPPY'
    },
    {
        id: 'chat:sst_specialist',
        label: 'Chat Consultor SST Especializado',
        description: 'Consultas inteligentes normativas y técnicas con el agente experto en SST.',
        category: 'IA & Chat WAPPY'
    },
    {
        id: 'ai:live_analysis',
        label: 'Live Analysis & Editor LIVA',
        description: 'Análisis en tiempo real de documentos y redacción colaborativa con IA.',
        category: 'IA & Chat WAPPY'
    },

    // ─── 2. Somos SST Operativo ──────────────────────────────────────────
    {
        id: 'sgsst:perfil_sociodemografico_self',
        label: 'Auto-reporte Sociodemográfico (Propio)',
        description: 'Llenar y actualizar su propia ficha médica, sociodemográfica y firma digital.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:perfil_sociodemografico_all',
        label: 'Gestión Sociodemográfica Completa',
        description: 'Ver y registrar la información de todos los trabajadores de la empresa.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:reporte_actos',
        label: 'Reporte de Actos y Condiciones',
        description: 'Diligenciar y consultar reportes de actos o condiciones inseguras.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:permiso_alturas',
        label: 'Permisos de Trabajo en Alturas',
        description: 'Crear, consultar y firmar permisos de trabajo seguro en alturas y listas de chequeo.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:analisis_trabajo_seguro',
        label: 'Análisis de Trabajo Seguro (ATS)',
        description: 'Diligenciar y revisar análisis de trabajo seguro por tarea u oficio.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:participacion_ipevar',
        label: 'Participación IPEVAR / Peligros',
        description: 'Reportar riesgos y participar en la identificación continua de peligros.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:epp',
        label: 'Gestión y Entrega de EPP',
        description: 'Control de dotación, entrega de elementos de protección personal y firmas.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:vehiculos',
        label: 'Inspección de Vehículos & Flota',
        description: 'Preoperacionales e inspecciones periódicas de vehículos y maquinaria.',
        category: 'Somos SST Operativo'
    },
    {
        id: 'sgsst:investigacion_atel',
        label: 'Investigación de Accidentes (ATEL)',
        description: 'Registro, caracterización e investigación de incidentes y accidentes de trabajo.',
        category: 'Somos SST Operativo'
    },

    // ─── 3. Matrices & Legal ─────────────────────────────────────────────
    {
        id: 'sgsst:matriz_peligros',
        label: 'Matriz de Peligros GTC-45 / IPEVAR',
        description: 'Acceso de consulta y edición a la matriz de riesgos general de la empresa.',
        category: 'Matrices & Legal'
    },
    {
        id: 'sgsst:matriz_legal',
        label: 'Matriz Legal & Normatividad',
        description: 'Consulta, evaluación y seguimiento al cumplimiento de requisitos legales.',
        category: 'Matrices & Legal'
    },
    {
        id: 'sgsst:matriz_pesv',
        label: 'Matriz PESV (Seguridad Vial)',
        description: 'Evaluación y gestión de riesgos viales conforme a la Resolución 40595.',
        category: 'Matrices & Legal'
    },
    {
        id: 'sgsst:matriz_compatibilidad',
        label: 'Matriz de Compatibilidad Química (SGA)',
        description: 'Inventario de sustancias químicas, clasificación ONU y matriz de almacenamiento.',
        category: 'Matrices & Legal'
    },

    // ─── 4. Academia & LMS ───────────────────────────────────────────────
    {
        id: 'lms:aula_estudio',
        label: 'Aula de Estudio & Cursos LMS',
        description: 'Acceso a los cursos interactivos, lecciones multimedia y evaluaciones.',
        category: 'Academia & LMS'
    },
    {
        id: 'lms:ruta_aprendizaje',
        label: 'Rutas de Aprendizaje Guiadas',
        description: 'Seguimiento de progreso y metas en planes de formación estructurados.',
        category: 'Academia & LMS'
    },
    {
        id: 'sgsst:programa_capacitaciones',
        label: 'Programa de Capacitaciones SST',
        description: 'Cronograma anual de capacitaciones de la empresa y registro de asistencias.',
        category: 'Academia & LMS'
    },

    // ─── 5. Gestión ACPM & Auditoría ────────────────────────────────────
    {
        id: 'kanban:acpm',
        label: 'Tablero Kanban ACPM',
        description: 'Gestión ágil de acciones correctivas, preventivas y oportunidades de mejora.',
        category: 'Gestión ACPM & Auditoría'
    },
    {
        id: 'audit:checklist',
        label: 'Diagnóstico & Auditoría Res. 0312',
        description: 'Evaluación de estándares mínimos y listas de verificación de auditoría.',
        category: 'Gestión ACPM & Auditoría'
    },
    {
        id: 'events:calendar',
        label: 'Eventos, Reuniones & Calendario SST',
        description: 'Programación de reuniones de comités (COPASST/COCOLA) y eventos SST.',
        category: 'Gestión ACPM & Auditoría'
    },

    // ─── 6. Comunidad & Blog ────────────────────────────────────────────
    {
        id: 'community:blog',
        label: 'Blog SST & Artículos de Conocimiento',
        description: 'Lectura de guías, artículos técnicos y biblioteca de conocimiento WAPPY.',
        category: 'Comunidad & Blog'
    }
];

export interface PresetRole {
    id: string;
    name: string;
    description: string;
    hasAi: boolean;
    badgeLabel: string;
    permissions: string[];
}

const PRESET_ROLES: PresetRole[] = [
    {
        id: 'data_entry_field',
        name: 'Operativo SST / Carga de Datos',
        description: 'Carga de evidencias en campo: Alturas, ATS, EPP, Vehículos, Reporte de Actos, IPEVAR, Capacitaciones y Sociodemográfico.',
        hasAi: false,
        badgeLabel: 'Sin IA (Solo Datos)',
        permissions: [
            'sgsst:perfil_sociodemografico_self',
            'sgsst:perfil_sociodemografico_all',
            'sgsst:reporte_actos',
            'sgsst:permiso_alturas',
            'sgsst:analisis_trabajo_seguro',
            'sgsst:participacion_ipevar',
            'sgsst:epp',
            'sgsst:vehiculos',
            'sgsst:programa_capacitaciones'
        ]
    },
    {
        id: 'matrices_audit_no_ai',
        name: 'Gestor de Matrices & Auditoría',
        description: 'Mantenimiento de Matriz de Peligros GTC-45, Legal, PESV, SGA, Investigación ATEL, Kanban ACPM y Auditoría 0312.',
        hasAi: false,
        badgeLabel: 'Sin IA (Solo Datos)',
        permissions: [
            'sgsst:matriz_peligros',
            'sgsst:matriz_legal',
            'sgsst:matriz_pesv',
            'sgsst:matriz_compatibilidad',
            'sgsst:investigacion_atel',
            'kanban:acpm',
            'audit:checklist',
            'events:calendar',
            'community:blog'
        ]
    },
    {
        id: 'self_only',
        name: 'Auto-reporte & Cursos LMS',
        description: 'Ficha médica sociodemográfica propia, firma digital y cursos interactivos del Aula de Estudio LMS.',
        hasAi: false,
        badgeLabel: 'Sin IA (Solo Datos)',
        permissions: ['sgsst:perfil_sociodemografico_self', 'lms:aula_estudio', 'community:blog']
    },
    {
        id: 'field_inspector',
        name: 'Inspector SST de Campo (Con IA)',
        description: 'Operativo de campo completo más asistencia del Chat Consultor SST Especializado.',
        hasAi: true,
        badgeLabel: 'Con IA Consultora',
        permissions: [
            'sgsst:perfil_sociodemografico_self',
            'sgsst:reporte_actos',
            'sgsst:permiso_alturas',
            'sgsst:analisis_trabajo_seguro',
            'sgsst:participacion_ipevar',
            'sgsst:epp',
            'sgsst:vehiculos',
            'chat:sst_specialist'
        ]
    },
    {
        id: 'sst_coordinator',
        name: 'Coordinador SST Integral (Con IA)',
        description: 'Control operativo total, matrices técnicas, Kanban ACPM, auditorías y Chat SST Especializado.',
        hasAi: true,
        badgeLabel: 'Con IA Consultora',
        permissions: [
            'sgsst:perfil_sociodemografico_self',
            'sgsst:perfil_sociodemografico_all',
            'sgsst:reporte_actos',
            'sgsst:permiso_alturas',
            'sgsst:analisis_trabajo_seguro',
            'sgsst:participacion_ipevar',
            'sgsst:matriz_peligros',
            'sgsst:matriz_legal',
            'sgsst:matriz_pesv',
            'sgsst:matriz_compatibilidad',
            'sgsst:investigacion_atel',
            'sgsst:epp',
            'sgsst:vehiculos',
            'sgsst:programa_capacitaciones',
            'kanban:acpm',
            'audit:checklist',
            'events:calendar',
            'community:blog',
            'chat:sst_specialist'
        ]
    },
    {
        id: 'student_lms',
        name: 'Estudiante LMS (Con IA)',
        description: 'Aula de Estudio, rutas de aprendizaje guiadas, capacitaciones y Chat WAPPY General.',
        hasAi: true,
        badgeLabel: 'Con IA General',
        permissions: [
            'lms:aula_estudio',
            'lms:ruta_aprendizaje',
            'sgsst:programa_capacitaciones',
            'community:blog',
            'chat:wappy_general'
        ]
    },
    {
        id: 'full_platform',
        name: 'Acceso Total WAPPY (Con IA)',
        description: 'Acceso ilimitado a todos los aplicativos, herramientas de IA (General, Consultor y Live), matrices y LMS.',
        hasAi: true,
        badgeLabel: 'Con IA Total',
        permissions: AVAILABLE_PERMISSIONS.map(p => p.id)
    },
    {
        id: 'custom',
        name: 'Personalizado',
        description: 'Configuración a medida con selección manual de cada aplicativo y módulo.',
        hasAi: false,
        badgeLabel: 'A medida',
        permissions: []
    }
];

interface SubUserManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialWorkerDoc?: string;
}

export default function SubUserManagerModal({ isOpen, onClose, initialWorkerDoc }: SubUserManagerModalProps) {
    const { token } = useAuthContext();
    const { showToast } = useToastContext();

    const [activeTab, setActiveTab] = useState<'list' | 'create' | 'edit'>('list');
    const [subUsers, setSubUsers] = useState<SubUser[]>([]);
    const [availableWorkers, setAvailableWorkers] = useState<AvailableWorker[]>([]);
    const [companies, setCompanies] = useState<CompanyItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // Form state for creating / editing
    const [editingSubUser, setEditingSubUser] = useState<SubUser | null>(null);
    const [selectedWorkerDoc, setSelectedWorkerDoc] = useState<string>('');
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [selectedPresetRole, setSelectedPresetRole] = useState<string>('data_entry_field');
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
        'sgsst:perfil_sociodemografico_self',
        'sgsst:perfil_sociodemografico_all',
        'sgsst:reporte_actos',
        'sgsst:permiso_alturas',
        'sgsst:analisis_trabajo_seguro',
        'sgsst:participacion_ipevar',
        'sgsst:epp',
        'sgsst:vehiculos',
        'sgsst:programa_capacitaciones'
    ]);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('Todas');
    const [formStatus, setFormStatus] = useState<'active' | 'suspended'>('active');

    // Limits and Plan state
    const [subUserLimit, setSubUserLimit] = useState<number | null>(null);
    const [userPlanName, setUserPlanName] = useState<string>('free');
    const [canCreateSubUser, setCanCreateSubUser] = useState<boolean>(true);

    // Load initial data
    const loadData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [subRes, workersRes, compRes, limitsRes] = await Promise.all([
                fetch('/api/sgsst/subusers', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/sgsst/subusers/available-workers', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/sgsst/company-info/all', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/sgsst/subusers/limits', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (subRes.ok) {
                const subData = await subRes.json();
                setSubUsers(Array.isArray(subData) ? subData : []);
            }
            if (workersRes.ok) {
                const workersData = await workersRes.json();
                setAvailableWorkers(Array.isArray(workersData) ? workersData : []);
            }
            if (compRes.ok) {
                const compData = await compRes.json();
                setCompanies(Array.isArray(compData) ? compData : []);
                if (compData.length > 0 && !selectedCompanyId) {
                    const activeComp = compData.find((c: CompanyItem) => c.isActive) || compData[0];
                    setSelectedCompanyId(activeComp._id);
                }
            }
            if (limitsRes.ok) {
                const limitsData = await limitsRes.json();
                setSubUserLimit(typeof limitsData.limit === 'number' ? limitsData.limit : null);
                setUserPlanName(limitsData.plan || 'free');
                setCanCreateSubUser(!!limitsData.canCreate);
            }
        } catch (error) {
            console.error('[SubUserManagerModal] Error loading data:', error);
            showToast({ message: 'Error al cargar información de sub-usuarios', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [token, showToast, selectedCompanyId]);

    useEffect(() => {
        if (isOpen) {
            loadData();
            if (initialWorkerDoc) {
                // Pre-select worker if triggered from a specific row
                handleStartCreateForWorker(initialWorkerDoc);
            }
        }
    }, [isOpen, initialWorkerDoc]);

    const effectiveLimit = useMemo(() => {
        if (['admin', 'custom'].includes(userPlanName)) return 999;
        if (subUserLimit !== null && subUserLimit !== undefined) return subUserLimit;
        if (userPlanName === 'pro') return 1;
        return 0;
    }, [userPlanName, subUserLimit]);

    const isLimitReached = useMemo(() => {
        if (['admin', 'custom'].includes(userPlanName)) return false;
        return subUsers.length >= effectiveLimit;
    }, [userPlanName, subUsers.length, effectiveLimit]);

    const isNonPro = useMemo(() => {
        if (['admin', 'custom'].includes(userPlanName)) return false;
        if (subUserLimit !== null && subUserLimit !== undefined && subUserLimit > 0) return false;
        return effectiveLimit <= 0;
    }, [userPlanName, subUserLimit, effectiveLimit]);

    const handleStartCreateForWorker = (doc: string) => {
        if (isNonPro) {
            showToast({ message: 'La creación de sub-usuarios es una función exclusiva del Plan Wappy Pro.', type: 'warning' });
            return;
        }
        if (isLimitReached) {
            showToast({ message: `Has alcanzado el límite de ${effectiveLimit} sub-usuario(s) para tu cuenta. Solicita una ampliación al administrador.`, type: 'warning' });
            return;
        }
        const worker = availableWorkers.find(w => w.identificacion === doc);
        setSelectedWorkerDoc(doc);
        if (worker) {
            setFormName(worker.nombre || '');
            setFormEmail(worker.email || '');
            setSelectedCompanyId(worker.companyId || (companies[0]?._id || ''));
        }
        setFormPassword(doc); // Default password as document number
        setShowPassword(false);
        const defaultRole = PRESET_ROLES.find(r => r.id === 'data_entry_field');
        setSelectedPresetRole('data_entry_field');
        setSelectedPermissions(defaultRole ? [...defaultRole.permissions] : ['sgsst:perfil_sociodemografico_self']);
        setEditingSubUser(null);
        setActiveTab('create');
    };

    const handleStartCreateNew = () => {
        if (isNonPro) {
            showToast({ message: 'La creación de sub-usuarios es una función exclusiva del Plan Wappy Pro.', type: 'warning' });
            return;
        }
        if (isLimitReached) {
            showToast({ message: `Has alcanzado el límite de ${effectiveLimit} sub-usuario(s) para tu cuenta. Solicita una ampliación al administrador.`, type: 'warning' });
            return;
        }
        setEditingSubUser(null);
        setSelectedWorkerDoc('');
        setFormName('');
        setFormEmail('');
        setFormPassword('');
        setShowPassword(false);
        const defaultRole = PRESET_ROLES.find(r => r.id === 'data_entry_field');
        setSelectedPresetRole('data_entry_field');
        setSelectedPermissions(defaultRole ? [...defaultRole.permissions] : ['sgsst:perfil_sociodemografico_self']);
        setFormStatus('active');
        setActiveTab('create');
    };

    const handleStartEdit = (su: SubUser) => {
        setEditingSubUser(su);
        setSelectedWorkerDoc(su.workerDocument);
        setSelectedCompanyId(su.assignedCompany);
        setFormName(su.name || '');
        setFormEmail(su.email || '');
        setFormPassword(''); // Empty means don't change
        setShowPassword(false);
        setSelectedPermissions(su.subUserPermissions || []);
        setFormStatus(su.subUserStatus || 'active');

        // Check if permissions match any preset
        const matchingPreset = PRESET_ROLES.find(preset => {
            if (preset.id === 'custom') return false;
            if (preset.permissions.length !== su.subUserPermissions.length) return false;
            return preset.permissions.every(p => su.subUserPermissions.includes(p));
        });
        setSelectedPresetRole(matchingPreset ? matchingPreset.id : 'custom');

        setActiveTab('edit');
    };

    const handleSelectWorker = (doc: string) => {
        setSelectedWorkerDoc(doc);
        const worker = availableWorkers.find(w => w.identificacion === doc);
        if (worker) {
            setFormName(worker.nombre || '');
            if (worker.email && !formEmail) {
                setFormEmail(worker.email);
            }
            if (worker.companyId) {
                setSelectedCompanyId(worker.companyId);
            }
            if (!formPassword) {
                setFormPassword(doc);
            }
        }
    };

    const handlePresetRoleChange = (roleId: string) => {
        setSelectedPresetRole(roleId);
        const preset = PRESET_ROLES.find(r => r.id === roleId);
        if (preset && preset.id !== 'custom') {
            setSelectedPermissions([...preset.permissions]);
        }
    };

    const handleTogglePermission = (permId: string) => {
        setSelectedPresetRole('custom');
        setSelectedPermissions(prev => {
            if (prev.includes(permId)) {
                return prev.filter(p => p !== permId);
            } else {
                return [...prev, permId];
            }
        });
    };

    const handleGenerateRandomPassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
        let pass = '';
        for (let i = 0; i < 10; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setFormPassword(pass);
        setShowPassword(true);
    };

    const handleSaveSubUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        if (activeTab === 'create') {
            if (isNonPro) {
                showToast({ message: 'La creación de sub-usuarios es una función exclusiva del Plan Wappy Pro.', type: 'error' });
                return;
            }
            if (isLimitReached) {
                showToast({ message: `Has alcanzado el límite de ${effectiveLimit} sub-usuario(s) permitido(s) para tu cuenta.`, type: 'error' });
                return;
            }
        }

        if (!formEmail || !formEmail.includes('@')) {
            showToast({ message: 'Ingrese un correo electrónico válido', type: 'warning' });
            return;
        }

        if (activeTab === 'create' && (!formPassword || formPassword.length < 6)) {
            showToast({ message: 'La contraseña debe tener al menos 6 caracteres', type: 'warning' });
            return;
        }

        if (!selectedWorkerDoc) {
            showToast({ message: 'Debe seleccionar un trabajador registrado en el Perfil Sociodemográfico', type: 'warning' });
            return;
        }

        if (!selectedCompanyId) {
            showToast({ message: 'Debe seleccionar una empresa asignada', type: 'warning' });
            return;
        }

        setIsSaving(true);
        try {
            if (activeTab === 'create') {
                const res = await fetch('/api/sgsst/subusers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        email: formEmail,
                        password: formPassword,
                        name: formName,
                        workerDocument: selectedWorkerDoc,
                        assignedCompany: selectedCompanyId,
                        subUserPermissions: selectedPermissions
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Error al crear sub-usuario');
                }

                showToast({ message: 'Sub-usuario creado exitosamente', type: 'success' });
            } else if (activeTab === 'edit' && editingSubUser) {
                const payload: any = {
                    name: formName,
                    assignedCompany: selectedCompanyId,
                    subUserPermissions: selectedPermissions,
                    subUserStatus: formStatus
                };
                if (formPassword && formPassword.trim().length >= 6) {
                    payload.password = formPassword.trim();
                }

                const res = await fetch(`/api/sgsst/subusers/${editingSubUser._id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Error al actualizar sub-usuario');
                }

                showToast({ message: 'Sub-usuario actualizado exitosamente', type: 'success' });
            }

            await loadData();
            setActiveTab('list');
        } catch (error: any) {
            console.error('[SubUserManagerModal] Error saving subuser:', error);
            showToast({ message: error.message || 'Error al guardar sub-usuario', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSubUser = async (subUser: SubUser) => {
        if (!token) return;
        const confirmDelete = window.confirm(`¿Estás seguro de eliminar el acceso de ${subUser.name} (${subUser.email})? El trabajador seguirá registrado en el Perfil Sociodemográfico pero ya no podrá ingresar a la plataforma.`);
        if (!confirmDelete) return;

        try {
            const res = await fetch(`/api/sgsst/subusers/${subUser._id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al eliminar');
            }

            showToast({ message: 'Acceso de sub-usuario eliminado', type: 'success' });
            await loadData();
        } catch (error: any) {
            console.error('[SubUserManagerModal] Error deleting subuser:', error);
            showToast({ message: error.message || 'Error al eliminar sub-usuario', type: 'error' });
        }
    };

    const handleToggleStatus = async (subUser: SubUser) => {
        if (!token) return;
        const nextStatus = subUser.subUserStatus === 'active' ? 'suspended' : 'active';
        try {
            const res = await fetch(`/api/sgsst/subusers/${subUser._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ subUserStatus: nextStatus })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al cambiar estado');
            }

            showToast({
                message: nextStatus === 'active' ? 'Sub-usuario activado' : 'Sub-usuario suspendido temporalmente',
                type: 'success'
            });
            await loadData();
        } catch (error: any) {
            showToast({ message: error.message || 'Error al actualizar estado', type: 'error' });
        }
    };

    // Filter subusers list
    const filteredSubUsers = useMemo(() => {
        if (!searchFilter.trim()) return subUsers;
        const q = searchFilter.toLowerCase().trim();
        return subUsers.filter(su =>
            su.name?.toLowerCase().includes(q) ||
            su.email?.toLowerCase().includes(q) ||
            su.workerDocument?.includes(q) ||
            su.company?.companyName?.toLowerCase().includes(q)
        );
    }, [subUsers, searchFilter]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl bg-surface-secondary border border-border-medium rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto text-text-primary">
                
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border-medium bg-surface-tertiary">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 shadow-sm">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2">
                                Gestión de Sub-Usuarios y Accesos
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700">
                                    Somos SST
                                </span>
                            </h2>
                            <p className="text-xs text-text-secondary">
                                Otorga accesos a trabajadores del Perfil Sociodemográfico para diligenciar información y reportes.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 text-text-secondary hover:text-text-primary rounded-xl hover:bg-surface-hover transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs Navigation */}
                <div className="shrink-0 flex flex-wrap items-center justify-between px-5 sm:px-6 py-3 border-b border-border-medium bg-surface-primary/60 gap-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActiveTab('list')}
                            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                                activeTab === 'list'
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : 'text-text-secondary hover:bg-surface-hover'
                            }`}
                        >
                            <Users className="w-4 h-4" />
                            Sub-usuarios Activos ({subUsers.length} / {effectiveLimit >= 999 ? '∞' : effectiveLimit})
                        </button>

                        <button
                            onClick={handleStartCreateNew}
                            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                                activeTab === 'create'
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : (isNonPro || isLimitReached)
                                        ? 'text-text-secondary/70 hover:bg-surface-hover'
                                        : 'text-text-secondary hover:bg-surface-hover'
                            }`}
                            title={
                                isNonPro
                                    ? 'Función exclusiva de Wappy Pro'
                                    : isLimitReached
                                        ? `Límite de ${effectiveLimit} sub-usuario(s) alcanzado`
                                        : 'Crear nuevo sub-usuario'
                            }
                        >
                            <UserPlus className="w-4 h-4" />
                            Crear Nuevo Acceso
                        </button>

                        {activeTab === 'edit' && editingSubUser && (
                            <button
                                className="flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-xl bg-teal-600 text-white shadow-sm"
                            >
                                <Edit3 className="w-4 h-4" />
                                Editando: {editingSubUser.name}
                            </button>
                        )}
                    </div>

                    {activeTab === 'list' && (
                        <div className="relative w-full sm:w-64 mt-2 sm:mt-0">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, cédula o email..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-primary border border-border-medium rounded-xl text-text-primary placeholder-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 bg-surface-secondary/40">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-secondary">
                            <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
                            <p className="text-sm">Cargando sub-usuarios y trabajadores...</p>
                        </div>
                    ) : activeTab === 'list' ? (
                        /* List Tab */
                        <div>
                            {isNonPro && (
                                <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-900 dark:text-amber-200">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                                    <div className="text-xs">
                                        <p className="font-bold text-sm">Función exclusiva Wappy Pro</p>
                                        <p className="mt-0.5 text-text-secondary leading-relaxed">
                                            La creación de sub-usuarios y delegación de accesos es una herramienta exclusiva para cuentas <strong>Wappy Pro</strong> (incluye 1 sub-usuario por defecto). Actualiza tu plan a Wappy Pro para habilitar accesos a tus trabajadores o solicita una asignación de cupos al administrador.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {!isNonPro && isLimitReached && (
                                <div className="mb-4 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-start justify-between gap-3 text-blue-900 dark:text-blue-200">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                                        <div className="text-xs">
                                            <p className="font-bold">Límite de sub-usuarios alcanzado ({subUsers.length} de {effectiveLimit})</p>
                                            <p className="mt-0.5 text-text-secondary leading-relaxed">
                                                Has utilizado el cupo de sub-usuarios disponible para tu cuenta ({userPlanName === 'pro' ? 'Wappy Pro: 1 sub-usuario' : `Límite asignado: ${effectiveLimit}`}). Si requieres habilitar más colaboradores con acceso independiente, solicita una ampliación de cupos al administrador.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {filteredSubUsers.length === 0 ? (
                                <div className="text-center py-14 border border-dashed border-border-medium rounded-2xl bg-surface-primary/40 p-6">
                                    <Shield className="w-12 h-12 text-teal-500 mx-auto mb-3 opacity-60" />
                                    <h3 className="text-base font-semibold text-text-primary mb-1">
                                        No hay sub-usuarios registrados aún
                                    </h3>
                                    <p className="text-xs text-text-secondary max-w-md mx-auto mb-5">
                                        Crea cuentas de acceso para tus trabajadores registrados en el Perfil Sociodemográfico para que puedan ingresar y reportar su información.
                                    </p>
                                    <button
                                        onClick={handleStartCreateNew}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-colors cursor-pointer"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        Crear Primer Sub-Usuario
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredSubUsers.map((su) => {
                                        const isSuspended = su.subUserStatus === 'suspended';
                                        return (
                                            <div
                                                key={su._id}
                                                className={`border rounded-2xl p-4 transition-all flex flex-col justify-between ${
                                                    isSuspended
                                                        ? 'border-red-200 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/10 opacity-80'
                                                        : 'border-border-medium bg-surface-primary hover:shadow-md'
                                                }`}
                                            >
                                                <div>
                                                    {/* Card Top */}
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white ${
                                                                isSuspended ? 'bg-gray-500' : 'bg-gradient-to-br from-teal-500 to-emerald-600'
                                                            }`}>
                                                                {su.name ? su.name.substring(0, 2).toUpperCase() : 'SU'}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-semibold text-text-primary leading-tight">
                                                                    {su.name}
                                                                </h4>
                                                                <p className="text-xs text-text-secondary">
                                                                    {su.email}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                                            isSuspended
                                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                        }`}>
                                                            {isSuspended ? (
                                                                <>
                                                                    <XCircle className="w-3 h-3" />
                                                                    Suspendido
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <CheckCircle2 className="w-3 h-3" />
                                                                    Activo
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>

                                                    {/* Worker & Company info */}
                                                    <div className="space-y-1 my-3 text-xs text-text-secondary bg-surface-secondary/80 p-2.5 rounded-xl border border-border-light">
                                                        <div className="flex items-center gap-1.5">
                                                            <UserCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                                            <span>Cédula / Doc: <strong className="font-medium text-text-primary">{su.workerDocument}</strong></span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Building2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                                            <span>Empresa: <strong className="font-medium text-text-primary">{su.company?.companyName || 'Empresa Asignada'}</strong></span>
                                                        </div>
                                                    </div>

                                                    {/* Badges of Permissions */}
                                                    <div className="mb-3">
                                                        {(() => {
                                                            const hasSubUserAi = (su.subUserPermissions || []).some(p => 
                                                                p === 'chat:wappy_general' || p === 'chat:sst_specialist' || p === 'ai:live_analysis'
                                                            );
                                                            return (
                                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                    <p className="text-[11px] font-medium text-text-secondary">
                                                                        Módulos Autorizados ({su.subUserPermissions?.length || 0}):
                                                                    </p>
                                                                    {hasSubUserAi ? (
                                                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                                                                            <Sparkles className="w-2.5 h-2.5 text-indigo-500" /> Con IA
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                                            🌿 Sin IA (Solo Datos)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                        <div className="flex flex-wrap gap-1">
                                                            {(su.subUserPermissions || []).slice(0, 4).map((p) => {
                                                                const permInfo = AVAILABLE_PERMISSIONS.find(ap => ap.id === p);
                                                                return (
                                                                    <span
                                                                        key={p}
                                                                        className="text-[10px] px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60"
                                                                    >
                                                                        {permInfo ? permInfo.label.split('(')[0].trim() : p}
                                                                    </span>
                                                                );
                                                            })}
                                                            {(su.subUserPermissions?.length || 0) > 4 && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-surface-tertiary text-text-secondary">
                                                                    +{su.subUserPermissions.length - 4} más
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center justify-between pt-3 border-t border-border-light mt-2">
                                                    <button
                                                        onClick={() => handleToggleStatus(su)}
                                                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                                            isSuspended
                                                                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                                                : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                                        }`}
                                                    >
                                                        {isSuspended ? 'Activar Acceso' : 'Suspender Acceso'}
                                                    </button>

                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleStartEdit(su)}
                                                            className="p-1.5 text-text-secondary hover:text-teal-600 hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
                                                            title="Editar permisos y clave"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteSubUser(su)}
                                                            className="p-1.5 text-text-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                                                            title="Eliminar cuenta de acceso"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Create / Edit Form */
                        <form onSubmit={handleSaveSubUser} className="space-y-6 max-w-3xl mx-auto">
                            {activeTab === 'create' && isNonPro && (
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-900 dark:text-amber-200">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                                    <div className="text-xs">
                                        <p className="font-bold text-sm">Función exclusiva Wappy Pro</p>
                                        <p className="mt-0.5 text-text-secondary leading-relaxed">
                                            Tu cuenta actual no dispone de cupo para crear sub-usuarios. Actualiza tu suscripción al plan <strong>Wappy Pro</strong> para disponer de 1 sub-usuario incluido, o contacta a soporte/administrador para solicitar cupos adicionales.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'create' && !isNonPro && isLimitReached && (
                                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3 text-blue-900 dark:text-blue-200">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                                    <div className="text-xs">
                                        <p className="font-bold text-sm">Límite de sub-usuarios alcanzado ({subUsers.length} de {effectiveLimit})</p>
                                        <p className="mt-0.5 text-text-secondary leading-relaxed">
                                            Has alcanzado el límite máximo de sub-usuarios permitido para tu cuenta ({userPlanName === 'pro' ? 'Plan Wappy Pro: 1 sub-usuario' : `Límite: ${effectiveLimit}`}). Para dar de alta a otro colaborador, solicita una ampliación al administrador o elimina/suspende un acceso previo.
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {/* Step 1: Worker & Company Selection */}
                            <div className="bg-surface-primary p-4 sm:p-5 rounded-2xl border border-border-medium space-y-4">
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                    <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    1. Selección de Trabajador del Perfil Sociodemográfico
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Company Selector */}
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                                            Empresa Asignada:
                                        </label>
                                        <select
                                            value={selectedCompanyId}
                                            onChange={(e) => setSelectedCompanyId(e.target.value)}
                                            className="w-full px-3 py-2 text-xs bg-surface-secondary border border-border-medium rounded-xl text-text-primary focus:ring-1 focus:ring-teal-500 focus:outline-none"
                                            required
                                        >
                                            {companies.map(c => (
                                                <option key={c._id} value={c._id}>
                                                    {c.companyName} ({c.nit})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Worker Selector */}
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                                            Trabajador Registrado:
                                        </label>
                                        {activeTab === 'create' ? (
                                            <select
                                                value={selectedWorkerDoc}
                                                onChange={(e) => handleSelectWorker(e.target.value)}
                                                className="w-full px-3 py-2 text-xs bg-surface-secondary border border-border-medium rounded-xl text-text-primary focus:ring-1 focus:ring-teal-500 focus:outline-none"
                                                required
                                            >
                                                <option value="">-- Selecciona un trabajador --</option>
                                                {availableWorkers
                                                    .filter(w => !selectedCompanyId || w.companyId === selectedCompanyId)
                                                    .map(w => (
                                                        <option key={w.identificacion} value={w.identificacion} disabled={w.hasSubUser}>
                                                            {w.nombre} (CC: {w.identificacion}) {w.cargo ? `- ${w.cargo}` : ''} {w.hasSubUser ? '✓ (Ya tiene cuenta)' : ''}
                                                        </option>
                                                    ))}
                                            </select>
                                        ) : (
                                            <div className="px-3 py-2 text-xs bg-surface-secondary border border-border-medium rounded-xl text-text-primary font-medium">
                                                {formName} (Cédula: {selectedWorkerDoc})
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Step 2: Credentials */}
                            <div className="bg-surface-primary p-4 sm:p-5 rounded-2xl border border-border-medium space-y-4">
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                    <Key className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                    2. Credenciales de Inicio de Sesión
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                                            Nombre Completo:
                                        </label>
                                        <input
                                            type="text"
                                            value={formName}
                                            onChange={(e) => setFormName(e.target.value)}
                                            className="w-full px-3 py-2 text-xs bg-surface-secondary border border-border-medium rounded-xl text-text-primary focus:ring-1 focus:ring-teal-500 focus:outline-none"
                                            placeholder="Nombre del colaborador"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                                            Correo Electrónico (Login):
                                        </label>
                                        <input
                                            type="email"
                                            value={formEmail}
                                            onChange={(e) => setFormEmail(e.target.value)}
                                            disabled={activeTab === 'edit'}
                                            className="w-full px-3 py-2 text-xs bg-surface-secondary border border-border-medium rounded-xl text-text-primary focus:ring-1 focus:ring-teal-500 focus:outline-none disabled:opacity-60"
                                            placeholder="ejemplo@empresa.com"
                                            required
                                        />
                                    </div>

                                    <div className="md:col-span-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs font-semibold text-text-secondary">
                                                {activeTab === 'create' ? 'Contraseña Inicial:' : 'Nueva Contraseña (Dejar en blanco para conservar):'}
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => selectedWorkerDoc && setFormPassword(selectedWorkerDoc)}
                                                    className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-medium cursor-pointer"
                                                >
                                                    Usar Cédula como Clave
                                                </button>
                                                <span className="text-border-medium">|</span>
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateRandomPassword}
                                                    className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                                                >
                                                    <Sparkles className="w-3 h-3" /> Generar Clave Segura
                                                </button>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={formPassword}
                                                onChange={(e) => setFormPassword(e.target.value)}
                                                className="w-full pl-3 pr-10 py-2 text-xs bg-surface-secondary border border-border-medium rounded-xl text-text-primary focus:ring-1 focus:ring-teal-500 focus:outline-none"
                                                placeholder={activeTab === 'create' ? 'Mínimo 6 caracteres' : '•••••••• (conservar actual)'}
                                                required={activeTab === 'create'}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step 3: Preset Roles & Granular Permissions */}
                            <div className="bg-surface-primary p-4 sm:p-5 rounded-2xl border border-border-medium space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                        3. Roles y Permisos de los Aplicativos WAPPY ({selectedPermissions.length} seleccionados)
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedPresetRole('full_platform');
                                                setSelectedPermissions(AVAILABLE_PERMISSIONS.map(p => p.id));
                                            }}
                                            className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                                        >
                                            Marcar Todos
                                        </button>
                                        <span className="text-border-medium">|</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedPresetRole('custom');
                                                setSelectedPermissions([]);
                                            }}
                                            className="text-[11px] font-semibold text-text-secondary hover:underline cursor-pointer"
                                        >
                                            Desmarcar Todos
                                        </button>
                                    </div>
                                </div>

                                {/* Info Banner for AI Separation and Own Keys */}
                                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-indigo-500/5 border border-teal-500/20 text-xs text-text-secondary flex items-start gap-3">
                                    <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0">
                                        <Sparkles className="w-4 h-4" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-semibold text-text-primary text-xs">
                                            Separación Operativa & Claves API Propias
                                        </p>
                                        <p className="text-[11px] leading-relaxed">
                                            Los roles marcados como <strong className="text-emerald-600 dark:text-emerald-400">"Sin IA"</strong> están diseñados para carga masiva de evidencias operativas y matrices sin consumir tokens de la empresa. Además, <strong>los sub-usuarios pueden configurar sus propias claves API</strong> (Google Gemini, OpenAI, etc.) en Configuración para chatear con IA de manera autónoma.
                                        </p>
                                    </div>
                                </div>

                                {/* Presets Selector */}
                                <div>
                                    <label className="block text-xs font-semibold text-text-secondary mb-2">
                                        Plantillas de Roles Rápidos:
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                        {PRESET_ROLES.map(role => {
                                            const isSelected = selectedPresetRole === role.id;
                                            return (
                                                <button
                                                    key={role.id}
                                                    type="button"
                                                    onClick={() => handlePresetRoleChange(role.id)}
                                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                                        isSelected
                                                            ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/40 text-text-primary shadow-sm ring-1 ring-teal-500'
                                                            : 'border-border-medium bg-surface-secondary hover:bg-surface-hover text-text-secondary'
                                                    }`}
                                                >
                                                    <div>
                                                        <div className="flex items-start justify-between mb-1 gap-1">
                                                            <span className="font-bold text-xs text-text-primary leading-tight">{role.name}</span>
                                                            {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />}
                                                        </div>
                                                        <p className="text-[10px] text-text-secondary line-clamp-2 leading-tight mb-2.5">
                                                            {role.description}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-md border ${
                                                            role.hasAi
                                                                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                                        }`}>
                                                            {role.badgeLabel}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Category Pills & Granular Checkboxes */}
                                <div className="space-y-3 pt-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-light pb-2.5">
                                        <label className="text-xs font-semibold text-text-secondary">
                                            Módulos Específicos por Aplicativo:
                                        </label>

                                        {/* Category Filter Pills */}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {(['Todas', 'IA & Chat WAPPY', 'Somos SST Operativo', 'Matrices & Legal', 'Academia & LMS', 'Gestión ACPM & Auditoría', 'Comunidad & Blog'] as const).map(cat => {
                                                const isCatActive = selectedCategoryFilter === cat;
                                                const count = cat === 'Todas' 
                                                    ? AVAILABLE_PERMISSIONS.length 
                                                    : AVAILABLE_PERMISSIONS.filter(p => p.category === cat).length;
                                                return (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        onClick={() => setSelectedCategoryFilter(cat)}
                                                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                                                            isCatActive
                                                                ? 'bg-teal-600 text-white shadow-xs'
                                                                : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover border border-border-medium/60'
                                                        }`}
                                                    >
                                                        {cat} ({count})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Permissions Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {AVAILABLE_PERMISSIONS
                                            .filter(p => selectedCategoryFilter === 'Todas' || p.category === selectedCategoryFilter)
                                            .map((perm) => {
                                                const isChecked = selectedPermissions.includes(perm.id);
                                                return (
                                                    <div
                                                        key={perm.id}
                                                        onClick={() => handleTogglePermission(perm.id)}
                                                        className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex items-start gap-2.5 ${
                                                            isChecked
                                                                ? 'border-teal-500/80 bg-teal-50/40 dark:bg-teal-950/20 text-text-primary shadow-xs'
                                                                : 'border-border-medium bg-surface-secondary text-text-secondary opacity-75 hover:opacity-100 hover:border-teal-500/30'
                                                        }`}
                                                    >
                                                        <div className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                                                            isChecked
                                                                ? 'bg-teal-600 border-teal-600 text-white'
                                                                : 'border-border-medium bg-surface-primary'
                                                        }`}>
                                                            {isChecked && <Check className="w-3 h-3" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                                <span className="text-xs font-bold leading-tight text-text-primary truncate">{perm.label}</span>
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-tertiary text-text-secondary shrink-0 font-medium">
                                                                    {perm.category.replace(' & ', '/')}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-text-secondary leading-snug">
                                                                {perm.description}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            </div>

                            {/* Form Footer Buttons */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-medium">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('list')}
                                    className="px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || (activeTab === 'create' && (isNonPro || isLimitReached))}
                                    className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {isSaving ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            {activeTab === 'create' ? 'Crear Cuenta de Sub-Usuario' : 'Guardar Cambios'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
