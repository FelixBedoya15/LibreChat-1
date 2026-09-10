import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { formatDateForInput } from '~/utils/dateHelpers';
import axios from 'axios';
import { 
    Award, Users, DollarSign, Landmark, Shield, 
    Mail, Phone, Lock, Calendar, Clock, Loader, AlertTriangle, MessageSquare,
    Building2, MapPin, Cpu
} from 'lucide-react';
import { DEPARTAMENTOS_LIST, getCitiesForDepartment } from '~/utils/colombiaLocations';

export default function EditUserModal({ isOpen, onClose, user, onUserUpdated }) {
    const localize = useLocalize();
    const { showToast } = useToastContext();
    const [activeTab, setActiveTab] = useState<'account' | 'referrals'>('account');
    
    const [formData, setFormData] = useState({
        userId: '',
        name: '',
        username: '',
        email: '',
        role: 'USER',
        accountStatus: 'active',
        password: '', // Optional
        inactiveAt: '',
        activeAt: '',
        phoneNumber: '',
        departamento: '',
        ciudad: '',
        companyLimit: '' as any,
        automationLimit: '' as any,
        subUserLimit: '' as any,
    });

    const [createdCompaniesCount, setCreatedCompaniesCount] = useState<number>(0);
    const [createdAutomationsCount, setCreatedAutomationsCount] = useState<number>(0);
    const [createdSubUsersCount, setCreatedSubUsersCount] = useState<number>(0);

    // Referral details from backend
    const [loadingReferrals, setLoadingReferrals] = useState(false);
    const [referralDetails, setReferralDetails] = useState({
        pointsBalance: 0,
        partner: null as any,
        commissionsStats: { pending: 0, approved: 0, requested: 0, paid: 0 },
        payoutRequests: [] as any[]
    });

    // Referral adjustments
    const [commercialTier, setCommercialTier] = useState<'none' | 'partner' | 'embajador'>('none');
    const [partnerSlug, setPartnerSlug] = useState('');
    const [partnerPaymentDetails, setPartnerPaymentDetails] = useState('');
    const [partnerSupportContact, setPartnerSupportContact] = useState('');
    const [pointsAdjustment, setPointsAdjustment] = useState<number>(0);

    // Available ambassadors for assignment
    const [ambassadors, setAmbassadors] = useState<any[]>([]);
    const [selectedAmbassadorId, setSelectedAmbassadorId] = useState<string>('');

    useEffect(() => {
        if (user) {
            setFormData({
                userId: user._id,
                name: user.name || '',
                username: user.username || '',
                email: user.email || '',
                role: user.role || 'USER',
                accountStatus: user.accountStatus || 'active',
                password: '',
                inactiveAt: formatDateForInput(user.inactiveAt),
                activeAt: formatDateForInput(user.activeAt),
                phoneNumber: user.phoneNumber || '',
                departamento: user.departamento || user.department || '',
                ciudad: user.ciudad || user.city || '',
                companyLimit: '',
                automationLimit: '',
                subUserLimit: '',
            });
            setCreatedCompaniesCount(0);
            setCreatedAutomationsCount(0);
            setCreatedSubUsersCount(0);

            // Reset tab and adjustments
            setActiveTab('account');
            setPointsAdjustment(0);
            
            // Load user referral/partner details
            const loadReferralDetails = async () => {
                try {
                    setLoadingReferrals(true);
                    const response = await axios.get(`/api/admin/users/${user._id}/referral-details`);
                    setReferralDetails(response.data);
                    
                    setFormData(prev => ({
                        ...prev,
                        companyLimit: response.data.companyLimit !== null && response.data.companyLimit !== undefined 
                            ? response.data.companyLimit 
                            : '',
                        automationLimit: response.data.automationLimit !== null && response.data.automationLimit !== undefined 
                            ? response.data.automationLimit 
                            : '',
                        subUserLimit: response.data.subUserLimit !== null && response.data.subUserLimit !== undefined 
                            ? response.data.subUserLimit 
                            : '',
                    }));
                    setCreatedCompaniesCount(response.data.createdCompaniesCount || 0);
                    setCreatedAutomationsCount(response.data.createdAutomationsCount || 0);
                    setCreatedSubUsersCount(response.data.createdSubUsersCount || 0);
                    setSelectedAmbassadorId(response.data.referredByPartner || '');

                    if (response.data.partner) {
                        setCommercialTier(response.data.partner.type || 'partner');
                        setPartnerSlug(response.data.partner.slug || '');
                        setPartnerPaymentDetails(response.data.partner.paymentDetails || '');
                        setPartnerSupportContact(response.data.partner.supportContact || '');
                    } else {
                        setCommercialTier('none');
                        setPartnerSlug('');
                        setPartnerPaymentDetails('');
                        setPartnerSupportContact('');
                    }
                } catch (err: any) {
                    console.error('Error loading user referral details:', err);
                } finally {
                    setLoadingReferrals(false);
                }
            };
            loadReferralDetails();
        }
    }, [user]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    useEffect(() => {
        if (isOpen) {
            const fetchAmbassadors = async () => {
                try {
                    const response = await axios.get('/api/admin/ambassadors');
                    setAmbassadors(response.data);
                } catch (err) {
                    console.error('Error fetching ambassadors:', err);
                }
            };
            fetchAmbassadors();
        }
    }, [isOpen]);

    // Auto-update status based on dates (only for USER_PRO / paid roles)
    useEffect(() => {
        const parseLocal = (s) => {
            if (!s) return null;
            const [y, m, d] = s.split('-').map(Number);
            return new Date(y, m - 1, d);
        };
        const inactiveAt = parseLocal(formData.inactiveAt);
        const nowStartOfDay = new Date();
        nowStartOfDay.setHours(0, 0, 0, 0);

        const freeRoles = ['USER', 'ADMIN', 'USER_IPEVAR', 'IPEVAR'];
        if (!freeRoles.includes(formData.role) && inactiveAt && nowStartOfDay >= inactiveAt && formData.accountStatus !== 'inactive') {
            setFormData(prev => ({ ...prev, accountStatus: 'inactive' }));
        }
    }, [formData.inactiveAt, formData.activeAt, formData.role]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload: any = { 
                ...formData,
                commercialTier,
                partnerSlug: commercialTier !== 'none' ? partnerSlug : '',
                partnerPaymentDetails: commercialTier !== 'none' ? partnerPaymentDetails : '',
                partnerSupportContact: commercialTier === 'embajador' ? partnerSupportContact : '',
                pointsAdjustment: pointsAdjustment,
                companyLimit: formData.companyLimit === '' ? null : formData.companyLimit,
                automationLimit: formData.automationLimit === '' ? null : formData.automationLimit,
                subUserLimit: formData.subUserLimit === '' ? null : formData.subUserLimit,
                referredByPartner: selectedAmbassadorId
            };
            if (!payload.password) delete payload.password; // TypeScript safe with typing as 'any'

            await axios.post('/api/admin/users/update', payload);
            showToast({ message: localize('com_ui_user_updated_success' as any) || 'Usuario actualizado con éxito', status: 'success' });
            onUserUpdated();
            onClose();
        } catch (error: any) {
            console.error('Error updating user:', error);
            showToast({ message: error.response?.data?.message || localize('com_ui_user_update_error' as any) || 'Error al actualizar usuario', status: 'error' });
        }
    };

    return (
        <Transition appear show={isOpen} as={React.Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild
                    as={React.Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </TransitionChild>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={React.Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-850 p-6 text-left align-middle shadow-xl transition-all border border-gray-150 dark:border-gray-800">
                                
                                {/* Header */}
                                <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
                                    <div>
                                        <DialogTitle as="h3" className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                                            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            <span>Editar Usuario</span>
                                        </DialogTitle>
                                        <p className="text-xs text-text-secondary mt-0.5">Administración de credenciales, roles y programas comerciales.</p>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={onClose} 
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors text-sm font-bold bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* TAB NAVIGATION */}
                                <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-2xl mb-6">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('account')}
                                        className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                            activeTab === 'account' 
                                                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-white shadow-sm border border-gray-150/40 dark:border-gray-800/50' 
                                                : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                    >
                                        <Users className="w-4 h-4" />
                                        <span>Datos de Cuenta</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('referrals')}
                                        className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                            activeTab === 'referrals' 
                                                ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-white shadow-sm border border-gray-150/40 dark:border-gray-800/50' 
                                                : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                    >
                                        <Award className="w-4 h-4 animate-pulse" />
                                        <span>Afiliación y Puntos</span>
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    
                                    {/* TAB 1: DATOS DE CUENTA */}
                                    {activeTab === 'account' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{localize('com_ui_name' as any)}</label>
                                                <input
                                                    type="text"
                                                    name="name"
                                                    value={formData.name}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{localize('com_ui_username' as any)}</label>
                                                <input
                                                    type="text"
                                                    name="username"
                                                    value={formData.username}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{localize('com_ui_email' as any)}</label>
                                                <input
                                                    type="email"
                                                    name="email"
                                                    value={formData.email}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Phone className="w-3.5 h-3.5" /> Teléfono / Contacto
                                                </label>
                                                <input
                                                    type="text"
                                                    name="phoneNumber"
                                                    value={formData.phoneNumber}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <MapPin className="w-3.5 h-3.5" /> Departamento
                                                </label>
                                                <select
                                                    name="departamento"
                                                    value={formData.departamento}
                                                    onChange={(e) => {
                                                        const newDept = e.target.value;
                                                        setFormData(prev => ({ ...prev, departamento: newDept, ciudad: '' }));
                                                    }}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="">-- Seleccionar Departamento --</option>
                                                    {DEPARTAMENTOS_LIST.map((dept) => (
                                                        <option key={dept} value={dept}>
                                                            {dept}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Building2 className="w-3.5 h-3.5" /> Ciudad / Municipio
                                                </label>
                                                {formData.departamento && getCitiesForDepartment(formData.departamento).length > 0 ? (
                                                    <select
                                                        name="ciudad"
                                                        value={formData.ciudad}
                                                        onChange={handleChange}
                                                        className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none cursor-pointer"
                                                    >
                                                        <option value="">-- Seleccionar Ciudad --</option>
                                                        {getCitiesForDepartment(formData.departamento).map((c) => (
                                                            <option key={c} value={c}>
                                                                {c}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        name="ciudad"
                                                        placeholder="Escribe la ciudad o municipio"
                                                        value={formData.ciudad}
                                                        onChange={handleChange}
                                                        className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                    />
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Shield className="w-3.5 h-3.5" /> Rol de Acceso
                                                </label>
                                                <select
                                                    name="role"
                                                    value={formData.role}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="USER">Invitado (USER)</option>
                                                    <option value="USER_GO">Go (USER_GO)</option>
                                                    <option value="USER_PLUS">Plus (USER_PLUS)</option>
                                                    <option value="USER_PRO">Wappy Pro (USER_PRO)</option>
                                                    <option value="USER_IPEVAR">Wappy Vital (USER_IPEVAR)</option>
                                                    <option value="IPEVAR">Wappy Vital Legacy (IPEVAR)</option>
                                                    <option value="USER_CUSTOM">A la Medida (USER_CUSTOM)</option>
                                                    <option value="ADMIN">Admin (ADMIN)</option>
                                                </select>
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado de Cuenta</label>
                                                <select
                                                    name="accountStatus"
                                                    value={formData.accountStatus}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none cursor-pointer"
                                                >
                                                    <option value="active">Activo</option>
                                                    <option value="pending">Pendiente</option>
                                                    <option value="inactive">Inactivo</option>
                                                </select>
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" /> Fecha de Activación
                                                </label>
                                                <input
                                                    type="date"
                                                    name="activeAt"
                                                    value={formData.activeAt}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" /> Fecha de Inactivación
                                                </label>
                                                <input
                                                    type="date"
                                                    name="inactiveAt"
                                                    value={formData.inactiveAt}
                                                    onChange={handleChange}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Building2 className="w-3.5 h-3.5" /> Empresas Creadas
                                                </label>
                                                <input
                                                    type="text"
                                                    value={createdCompaniesCount}
                                                    disabled={true}
                                                    readOnly={true}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80 px-4 py-2.5 text-xs text-text-primary outline-none opacity-80 cursor-not-allowed"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Building2 className="w-3.5 h-3.5" /> Límite de Empresas
                                                </label>
                                                <input
                                                    type="number"
                                                    name="companyLimit"
                                                    value={formData.companyLimit}
                                                    onChange={handleChange}
                                                    placeholder="Por defecto del plan"
                                                    min={0}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Cpu className="w-3.5 h-3.5" /> Automatizaciones Creadas
                                                </label>
                                                <input
                                                    type="text"
                                                    value={createdAutomationsCount}
                                                    disabled={true}
                                                    readOnly={true}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80 px-4 py-2.5 text-xs text-text-primary outline-none opacity-80 cursor-not-allowed"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Cpu className="w-3.5 h-3.5" /> Límite Automatizaciones
                                                </label>
                                                <input
                                                    type="number"
                                                    name="automationLimit"
                                                    value={formData.automationLimit}
                                                    onChange={handleChange}
                                                    placeholder="Por defecto del plan (Pro: 1)"
                                                    min={0}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Users className="w-3.5 h-3.5" /> Sub-Usuarios Creados
                                                </label>
                                                <input
                                                    type="text"
                                                    value={createdSubUsersCount}
                                                    disabled={true}
                                                    readOnly={true}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80 px-4 py-2.5 text-xs text-text-primary outline-none opacity-80 cursor-not-allowed"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Users className="w-3.5 h-3.5" /> Límite de Sub-Usuarios
                                                </label>
                                                <input
                                                    type="number"
                                                    name="subUserLimit"
                                                    value={formData.subUserLimit}
                                                    onChange={handleChange}
                                                    placeholder="Por defecto del plan (Pro: 1)"
                                                    min={0}
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>

                                            <div className="col-span-1 md:col-span-2 bg-gray-50 dark:bg-gray-800/35 border border-gray-100 dark:border-gray-800/60 p-4 rounded-2xl mt-2">
                                                <h5 className="text-xs font-bold text-text-primary flex items-center gap-1 mb-1">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Nota sobre Inactivación
                                                </h5>
                                                <p className="text-[11px] text-text-secondary leading-relaxed">
                                                    Los roles libres (<strong>USER, ADMIN, USER_IPEVAR, IPEVAR</strong>) nunca se inactivarán por fecha de expiración, garantizando acceso gratis permanente. Solo los roles comerciales/premium (como <strong>USER_PRO</strong>) caducarán al expirar la fecha indicada.
                                                </p>
                                            </div>

                                            <div className="flex flex-col gap-1.5 col-span-1 md:col-span-2 border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
                                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Lock className="w-3.5 h-3.5" /> Cambiar Contraseña (Opcional)
                                                </label>
                                                <input
                                                    type="password"
                                                    name="password"
                                                    value={formData.password}
                                                    onChange={handleChange}
                                                    placeholder="Dejar en blanco para conservar contraseña actual"
                                                    className="block w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-text-primary focus:border-blue-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* TAB 2: AFILIACIÓN Y PUNTOS */}
                                    {activeTab === 'referrals' && (
                                        <div className="space-y-5 animate-fadeIn">
                                            {loadingReferrals ? (
                                                <div className="flex flex-col items-center justify-center py-10 gap-2">
                                                    <Loader className="w-6 h-6 text-blue-500 animate-spin" />
                                                    <span className="text-xs text-text-secondary">Cargando datos comerciales del usuario...</span>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* PUNTOS WAPPY */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] p-5 rounded-2xl border border-emerald-500/25">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black shadow-md shadow-emerald-500/10">
                                                                🎁
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wide">Asociados: Puntos Wappy</h4>
                                                                <p className="text-[10px] text-text-secondary">Balance acumulado para canjes de PRO gratis.</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 justify-start md:justify-end">
                                                            <div className="text-left md:text-right">
                                                                <span className="text-[10px] text-text-tertiary">Balance Actual</span>
                                                                <h4 className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">{referralDetails.pointsBalance} <span className="text-xs font-normal text-text-secondary">pts</span></h4>
                                                            </div>
                                                            <div className="flex flex-col gap-1 w-24">
                                                                <span className="text-[9px] text-text-tertiary">Ajustar Saldo</span>
                                                                <input
                                                                    type="number"
                                                                    placeholder="+/- pts"
                                                                    value={pointsAdjustment === 0 ? '' : pointsAdjustment}
                                                                    onChange={(e) => setPointsAdjustment(parseInt(e.target.value) || 0)}
                                                                    className="w-full text-center border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl py-1 text-xs text-text-primary outline-none focus:border-emerald-500"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* ASIGNACIÓN DE EMBAJADOR */}
                                                    <div className="flex flex-col gap-2 bg-purple-500/[0.02] dark:bg-purple-500/[0.04] p-5 rounded-2xl border border-purple-500/25">
                                                        <label className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                                                            💎 Embajador / Promotor Asignado
                                                        </label>
                                                        <p className="text-[10px] text-text-secondary mb-1">
                                                            Selecciona el embajador o socio comercial que apoya a esta empresa.
                                                        </p>
                                                        <select
                                                            value={selectedAmbassadorId}
                                                            onChange={(e) => setSelectedAmbassadorId(e.target.value)}
                                                            className="block w-full rounded-2xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800 px-4 py-2.5 text-xs text-text-primary focus:border-purple-500 outline-none cursor-pointer"
                                                        >
                                                            <option value="">Ningún Embajador (Sin Referido)</option>
                                                            {ambassadors.map((amb) => (
                                                                <option key={amb._id} value={amb._id}>
                                                                    {amb.name} ({amb.email}) — [{amb.type === 'embajador' ? 'Embajador' : 'Partner'}]
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    {/* SELECTOR DE ROL COMERCIAL */}
                                                    <div className="flex flex-col gap-2.5 bg-gray-50/50 dark:bg-gray-800/40 p-5 rounded-2xl border border-gray-150 dark:border-gray-800">
                                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                            🚀 Tipo de Afiliado Comercial
                                                        </span>
                                                        <div className="grid grid-cols-3 gap-2 mt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setCommercialTier('none')}
                                                                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                                                                    commercialTier === 'none' 
                                                                        ? 'border-gray-400 bg-gray-100 dark:bg-gray-700 text-text-primary' 
                                                                        : 'border-border-light bg-white dark:bg-gray-800/40 text-text-secondary hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                No Socio (Asociado)
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => setCommercialTier('partner')}
                                                                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                                                                    commercialTier === 'partner' 
                                                                        ? 'border-amber-500 bg-amber-500/10 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/20' 
                                                                        : 'border-border-light bg-white dark:bg-gray-800/40 text-text-secondary hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                Embajador Estándar (20% - 25%)
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => setCommercialTier('embajador')}
                                                                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                                                                    commercialTier === 'embajador' 
                                                                        ? 'border-purple-500 bg-purple-500/10 text-purple-950 dark:text-purple-100 ring-2 ring-purple-500/20' 
                                                                        : 'border-border-light bg-white dark:bg-gray-800/40 text-text-secondary hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                Embajador Líder (30% + 5% Red)
                                                            </button>
                                                        </div>

                                                        {/* EXPLICACIÓN DE REGLAS DE COMISIÓN */}
                                                        {commercialTier === 'partner' && (
                                                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 font-medium animate-fadeIn">
                                                                <span className="font-bold">✨ Comisión Estándar:</span> 20% base en todas las ventas. Sube automáticamente al <span className="font-bold">25%</span> al lograr más de 3 ventas en el mismo mes de Wappy PRO Semestral o Anual.
                                                            </div>
                                                        )}
                                                        {commercialTier === 'embajador' && (
                                                            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-[11px] text-purple-800 dark:text-purple-300 font-medium animate-fadeIn">
                                                                <span className="font-bold">👑 Comisión Líder:</span> 30% base en ventas directas + <span className="font-bold">5% adicional</span> sobre ventas de su red cuando el embajador estándar cumple la meta del mes.
                                                            </div>
                                                        )}

                                                        {/* CAMPOS COMERCIALES COMPLEMENTARIOS */}
                                                        {commercialTier !== 'none' && (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 border-t border-gray-100 dark:border-gray-800/50 pt-4 animate-fadeIn">
                                                                <div className="flex flex-col gap-1.5">
                                                                    <label className="text-[11px] font-bold text-text-secondary uppercase">Código de Recomendado (Slug)</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="ej: felix-socio"
                                                                        value={partnerSlug}
                                                                        onChange={(e) => setPartnerSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
                                                                        required={true}
                                                                        className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-text-primary focus:border-amber-500 outline-none"
                                                                    />
                                                                </div>

                                                                <div className="flex flex-col gap-1.5">
                                                                    <label className="text-[11px] font-bold text-text-secondary uppercase flex items-center gap-1">
                                                                        <Landmark className="w-3.5 h-3.5" /> Cuenta de Cobro / Banco
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Cuenta de cobro o banco"
                                                                        value={partnerPaymentDetails}
                                                                        onChange={(e) => setPartnerPaymentDetails(e.target.value)}
                                                                        className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-text-primary focus:border-amber-500 outline-none"
                                                                    />
                                                                </div>

                                                                {commercialTier === 'embajador' && (
                                                                    <div className="flex flex-col gap-1.5 col-span-1 md:col-span-2 animate-fadeIn">
                                                                        <label className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase flex items-center gap-1">
                                                                            <MessageSquare className="w-3.5 h-3.5" /> Canal de Soporte para sus Referidos
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Número de WhatsApp o canal de contacto"
                                                                            value={partnerSupportContact}
                                                                            onChange={(e) => setPartnerSupportContact(e.target.value)}
                                                                            className="block w-full rounded-xl border border-purple-500/20 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-text-primary focus:border-purple-500 outline-none"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* RESUMEN DE COMISIONES DEL SOCIO */}
                                                    {referralDetails.partner && (
                                                        <div className="flex flex-col gap-3 p-5 rounded-2xl border border-gray-150 dark:border-gray-800">
                                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                                                <DollarSign className="w-4 h-4" /> Resumen de Comisiones (Socio)
                                                            </span>
                                                            <div className="grid grid-cols-4 gap-2.5 text-center mt-1">
                                                                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800/50">
                                                                    <span className="text-[9px] text-text-tertiary uppercase">En Hold</span>
                                                                    <h5 className="text-xs font-bold text-text-primary mt-1">${(referralDetails.commissionsStats.pending / 100).toLocaleString('es-CO')}</h5>
                                                                </div>
                                                                <div className="p-2.5 rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10">
                                                                    <span className="text-[9px] text-blue-600 dark:text-blue-400 uppercase">Aprobado</span>
                                                                    <h5 className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1">${(referralDetails.commissionsStats.approved / 100).toLocaleString('es-CO')}</h5>
                                                                </div>
                                                                <div className="p-2.5 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10">
                                                                    <span className="text-[9px] text-amber-600 dark:text-amber-400 uppercase">Solicitado</span>
                                                                    <h5 className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-1">${(referralDetails.commissionsStats.requested / 100).toLocaleString('es-CO')}</h5>
                                                                </div>
                                                                <div className="p-2.5 rounded-xl bg-green-500/5 dark:bg-green-500/10 border border-green-500/10">
                                                                    <span className="text-[9px] text-green-600 dark:text-green-400 uppercase">Pagado</span>
                                                                    <h5 className="text-xs font-bold text-green-600 dark:text-green-400 mt-1">${(referralDetails.commissionsStats.paid / 100).toLocaleString('es-CO')}</h5>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* HISTORIAL DE RETIROS DEL SOCIO */}
                                                    {referralDetails.partner && referralDetails.payoutRequests.length > 0 && (
                                                        <div className="flex flex-col gap-2">
                                                            <span className="text-xs font-bold text-text-secondary uppercase flex items-center gap-1">
                                                                <Clock className="w-3.5 h-3.5" /> Historial de Retiros Solicitados
                                                            </span>
                                                            <div className="max-h-32 overflow-y-auto border border-gray-150 dark:border-gray-800 rounded-xl bg-gray-50/20 divide-y divide-gray-100 dark:divide-gray-800">
                                                                {referralDetails.payoutRequests.map((req: any) => (
                                                                    <div key={req._id} className="flex justify-between items-center py-2 px-3 text-[11px]">
                                                                        <div className="flex flex-col">
                                                                            <span className="font-semibold text-text-primary">Monto: ${(req.amount / 100).toLocaleString('es-CO')} COP</span>
                                                                            <span className="text-[9px] text-text-tertiary">Bco: {req.paymentDetails}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] text-text-tertiary">{new Date(req.createdAt).toLocaleDateString()}</span>
                                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                                                req.status === 'paid' 
                                                                                    ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                                                                                    : req.status === 'approved' 
                                                                                    ? 'bg-blue-500/10 text-blue-600'
                                                                                    : req.status === 'rejected'
                                                                                    ? 'bg-red-500/10 text-red-600'
                                                                                    : 'bg-amber-500/10 text-amber-600'
                                                                            }`}>
                                                                                {req.status}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-2xl border border-transparent bg-gray-100 dark:bg-gray-850 hover:bg-gray-200 dark:hover:bg-gray-800 px-5 py-2.5 text-xs font-bold text-gray-900 dark:text-white focus:outline-none cursor-pointer transition-colors active:scale-95"
                                            onClick={onClose}
                                        >
                                            {localize('com_ui_cancel' as any)}
                                        </button>
                                        <button
                                            type="submit"
                                            className="inline-flex justify-center rounded-2xl border border-transparent bg-blue-600 hover:bg-blue-700 active:scale-95 px-5 py-2.5 text-xs font-bold text-white focus:outline-none shadow-md shadow-blue-600/10 transition-colors cursor-pointer"
                                        >
                                            {localize('com_ui_save_changes' as any)}
                                        </button>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
