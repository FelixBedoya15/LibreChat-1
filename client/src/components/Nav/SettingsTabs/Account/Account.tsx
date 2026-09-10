import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { Input, Label, Button, useToastContext } from '@librechat/client';
import { 
  Eye, 
  EyeOff, 
  MessageSquare, 
  Copy, 
  Sparkles, 
  Briefcase, 
  Award, 
  Quote, 
  RefreshCw, 
  CheckCircle2, 
  ExternalLink,
  UserCheck
} from 'lucide-react';
import axios from 'axios';
import { formatDateForInput } from '~/utils/dateHelpers';

import DisplayUsernameMessages from './DisplayUsernameMessages';
import EmailNotificationsToggle from './EmailNotificationsToggle';
import DeleteAccount from './DeleteAccount';
import Avatar from './Avatar';
import EnableTwoFactorItem from './TwoFactorAuthentication';
import BackupCodesItem from './BackupCodesItem';
import WhatsAppConnect from './WhatsAppConnect';
import GoogleDriveConnect from './GoogleDriveConnect';
import OneDriveConnect from './OneDriveConnect';
import GoogleAIConnect from './GoogleAIConnect';
import TicketForm from '~/components/Tickets/TicketForm';
import ReferralPanel from './ReferralPanel';


function Account() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { user, setUser, token } = useAuthContext();
  const { showToast } = useToastContext();

  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [desktopToken, setDesktopToken] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    inactiveAt: '',
    phoneNumber: '',
  });

  // SST Professional Profile State (for Ambassador Landing Page & IA)
  const [sstProfile, setSstProfile] = useState({
    profession: '',
    yearsExperience: '',
    sstExperience: '',
    specialties: '',
    quote: '',
    storyParagraph1: '',
    storyParagraph2: '',
  });
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isSavingSstProfile, setIsSavingSstProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        username: user.username || '',
        password: '',
        confirmPassword: '',
        inactiveAt: formatDateForInput(user.inactiveAt),
        phoneNumber: user.phoneNumber || '',
      });
      setSstProfile({
        profession: (user as any).profession || '',
        yearsExperience: (user as any).yearsExperience || '',
        sstExperience: (user as any).sstExperience || (user as any).bio || '',
        specialties: Array.isArray((user as any).specialties) ? (user as any).specialties.join(', ') : '',
        quote: (user as any).quote || '',
        storyParagraph1: (user as any).storyParagraph1 || '',
        storyParagraph2: (user as any).storyParagraph2 || '',
      });
    }
  }, [user]);

  const handleGenerateBioWithAI = async () => {
    if (!sstProfile.sstExperience && !sstProfile.profession) {
      showToast({ message: 'Por favor escribe tu profesión o un resumen de tu experiencia en SST primero.', status: 'warning' });
      return;
    }
    try {
      setIsGeneratingBio(true);
      const res = await axios.post('/api/referrals/profile/generate-bio', {
        name: formData.name || user?.name,
        profession: sstProfile.profession,
        yearsExperience: sstProfile.yearsExperience,
        sstExperience: sstProfile.sstExperience,
      });
      const data = res.data?.data;
      if (data) {
        setSstProfile(prev => ({
          ...prev,
          profession: data.profession || prev.profession,
          yearsExperience: data.yearsExperience || prev.yearsExperience,
          specialties: Array.isArray(data.specialties) ? data.specialties.join(', ') : prev.specialties,
          quote: data.quote || prev.quote,
          storyParagraph1: data.storyParagraph1 || prev.storyParagraph1,
          storyParagraph2: data.storyParagraph2 || prev.storyParagraph2,
        }));
        showToast({ message: '¡Perfil profesional generado y pulido con IA con éxito!', status: 'success' });
      }
    } catch (err: any) {
      showToast({ message: err.response?.data?.message || 'Error al generar perfil con IA.', status: 'error' });
    } finally {
      setIsGeneratingBio(false);
    }
  };

  const handleSaveSstProfile = async () => {
    try {
      setIsSavingSstProfile(true);
      const specsArray = sstProfile.specialties
        ? sstProfile.specialties.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const payload = {
        profession: sstProfile.profession,
        yearsExperience: sstProfile.yearsExperience,
        sstExperience: sstProfile.sstExperience,
        bio: sstProfile.sstExperience,
        specialties: specsArray,
        quote: sstProfile.quote,
        storyParagraph1: sstProfile.storyParagraph1,
        storyParagraph2: sstProfile.storyParagraph2,
      };

      const res = await axios.post('/api/user/update', payload);
      setUser(res.data.user);
      queryClient.invalidateQueries([QueryKeys.memories]);
      showToast({ message: '¡Perfil profesional y memoria IA guardados correctamente!', status: 'success' });
    } catch (err: any) {
      showToast({ message: err.response?.data?.message || 'Error al guardar perfil profesional.', status: 'error' });
    } finally {
      setIsSavingSstProfile(false);
    }
  };

  useEffect(() => {
    const fetchDesktopToken = async () => {
      try {
        const response = await axios.get('/api/sgsst/canvas/desktop-token');
        setDesktopToken(response.data.token);
      } catch (error) {
        console.error('Error fetching desktop token:', error);
      }
    };
    if (user) {
      fetchDesktopToken();
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password && formData.password !== formData.confirmPassword) {
      showToast({ message: localize('com_auth_password_not_match'), status: 'error' });
      return;
    }

    try {
      const payload: Record<string, string> = {
        name: formData.name,
        username: formData.username,
        phoneNumber: formData.phoneNumber,
      };
      if (formData.password) {
        payload.password = formData.password;
      }

      const response = await axios.post('/api/user/update', payload);
      setUser(response.data.user);
      setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
      showToast({ message: localize('com_ui_profile_update_success'), status: 'success' });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      const status = error.response?.status;
      const serverMessage = error.response?.data?.message;
      showToast({
        message: `(${status || 'N/A'}) ${serverMessage || localize('com_ui_profile_update_error')}`,
        status: 'error'
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-2 text-sm text-text-primary">
      {/* Sub-user Informative Banner */}
      {user?.isSubUser && (
        <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-500/30 text-teal-900 dark:text-teal-200">
          <UserCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <span>Cuenta de Sub-Usuario Vinculada</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-700 dark:text-teal-300 font-semibold">
                Activa
              </span>
            </h4>
            <p className="text-xs text-teal-800/80 dark:text-teal-300/80 leading-relaxed">
              Esta cuenta pertenece a una empresa colaboradora y está autorizada para registrar evidencias operativas en Somos SST. Si tu rol es exclusivamente de carga de datos y deseas interactuar con los agentes de IA de forma autónoma, puedes ingresar tu propia <strong>clave API personal</strong> en la sección <em>Conexiones e Integraciones</em> abajo.
            </p>
          </div>
        </div>
      )}

      {/* TOP: Opciones de Cuenta (full width) */}
      <div className="flex flex-col gap-1 p-5 rounded-2xl border border-border-light bg-surface-primary shadow-sm">
        <h3 className="text-base font-bold text-text-primary mb-1 pb-3 border-b border-border-light">Opciones de Cuenta</h3>
        <div className="py-2"><Avatar /></div>
        <div className="h-px bg-border-light w-full my-1"></div>
        <div className="py-2"><DisplayUsernameMessages /></div>
        <div className="h-px bg-border-light w-full my-1"></div>
        <div className="py-2"><EmailNotificationsToggle /></div>
      </div>

      {/* MIDDLE: Editar Perfil */}
      <div className="flex flex-col gap-6 p-5 rounded-2xl border border-border-light bg-surface-primary shadow-sm h-fit">
        <div>
          <h3 className="text-xl font-bold text-text-primary mb-1">{localize('com_ui_edit_profile')}</h3>
          <p className="text-sm text-text-secondary mb-5">Actualiza tu información personal y verifica el estado de tu cuenta.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-xs font-bold text-text-secondary uppercase">{localize('com_auth_full_name')}</Label>
            <Input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="username" className="text-xs font-bold text-text-secondary uppercase">{localize('com_auth_username')}</Label>
            <Input
              id="username"
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="phoneNumber" className="text-xs font-bold text-text-secondary uppercase">{localize('com_auth_phone_number_label')}</Label>
            <Input
              id="phoneNumber"
              type="text"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleChange}
              placeholder={localize('com_auth_phone_number_placeholder')}
              className="mt-1"
            />
          </div>
          {/* Dates stacked on mobile, side-by-side on larger screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="createdAt" className="text-xs font-bold text-text-secondary uppercase">{localize('com_ui_registration_date')}</Label>
              <Input
                id="createdAt"
                type="text"
                value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
                disabled
                className="mt-1 bg-surface-secondary text-text-secondary opacity-70 cursor-not-allowed"
              />
            </div>
            <div>
              <Label htmlFor="inactiveAt" className="text-xs font-bold text-text-secondary uppercase">{localize('com_ui_inactivation_date')}</Label>
              <Input
                id="inactiveAt"
                type="date"
                name="inactiveAt"
                value={formData.inactiveAt}
                disabled
                className="mt-1 bg-surface-secondary text-text-secondary opacity-70 cursor-not-allowed text-xs"
              />
            </div>
          </div>
          <p className="text-xs text-text-tertiary">
            {user?.role === 'USER'
              ? 'Indefinida'
              : formData.inactiveAt
                ? localize('com_ui_account_will_deactivate') + ' ' + new Date(formData.inactiveAt).toLocaleDateString()
                : localize('com_ui_account_active_indefinitely')}
          </p>

          <div className="border-t border-border-light pt-6 mt-6">
            <h4 className="text-sm font-bold text-text-primary mb-3">Seguridad y Acceso</h4>
            <div className="space-y-4">
              <div className="relative">
                <Label htmlFor="password" className="text-xs font-bold text-text-secondary uppercase">{localize('com_ui_change_password')}</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={localize('com_ui_leave_blank_keep_current')}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-tertiary hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {formData.password && (
                <div className="relative">
                  <Label htmlFor="confirmPassword" className="text-xs font-bold text-text-secondary uppercase">{localize('com_auth_password_confirm')}</Label>
                  <div className="relative mt-1">
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-tertiary hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 cursor-pointer">
              {localize('com_ui_save_changes')}
            </Button>
          </div>
        </form>
      </div>

      {/* SST PROFESSIONAL PROFILE & AMBASSADOR LANDING */}
      <div className="flex flex-col gap-4 p-4 sm:p-6 rounded-2xl border border-teal-500/30 bg-surface-primary shadow-sm relative overflow-hidden">
        {/* Header */}
        <div className="flex flex-col gap-2 pb-3 border-b border-border-light">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-text-primary">
              Perfil Profesional & Experiencia SST
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 whitespace-nowrap">
              Landing de Embajador
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Personaliza tu presentación profesional. Esta información y tu avatar se mostrarán en tu enlace de embajador en la sección <strong className="text-text-primary font-semibold">"Mucho gusto, soy..."</strong>.
          </p>
        </div>

        {/* AI Assistant Banner & Action */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-teal-500/10 border border-teal-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-text-primary text-xs">Asistente de Redacción IA (Gemini)</p>
              <p className="text-[11px] text-text-secondary truncate">Escribe tu trayectoria o profesión y genera tu presentación con un clic.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateBioWithAI}
            disabled={isGeneratingBio}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02] active:scale-98 disabled:opacity-50 shrink-0 whitespace-nowrap"
            title="Genera tu biografía y cita profesional automáticamente con IA"
          >
            {isGeneratingBio ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generando con IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Redactar / Pulir con IA</span>
              </>
            )}
          </button>
        </div>

        <div className="space-y-4 pt-1">
          {/* Row 1: Profession & Years Experience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold text-text-secondary uppercase">
                Profesión / Especialidad en SST <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="text"
                value={sstProfile.profession}
                onChange={(e) => setSstProfile({ ...sstProfile, profession: e.target.value })}
                placeholder="Ej. Psicólogo Especialista SST, Profesional SST..."
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-text-secondary uppercase">
                Años de Experiencia en el Sector
              </Label>
              <Input
                type="text"
                value={sstProfile.yearsExperience}
                onChange={(e) => setSstProfile({ ...sstProfile, yearsExperience: e.target.value })}
                placeholder="Ej. +8 Años de Experiencia, +5 Años..."
                className="mt-1"
              />
            </div>
          </div>

          {/* Row 2: Detailed SST Experience */}
          <div>
            <Label className="text-xs font-bold text-text-secondary uppercase">
              Tu Trayectoria, Sectores y Experiencia en SST
            </Label>
            <textarea
              rows={3}
              value={sstProfile.sstExperience}
              onChange={(e) => setSstProfile({ ...sstProfile, sstExperience: e.target.value })}
              placeholder="Cuéntanos brevemente quién eres: sectores en los que has trabajado (salud, construcción, eléctrico...), licencias, matrices que dominas o tu enfoque preventivo. La IA usará esto para redactar tu presentación."
              className="w-full mt-1 bg-surface-secondary border border-border-light rounded-xl p-3 text-xs text-text-primary outline-none focus:border-teal-500 font-normal leading-relaxed resize-y"
            />
          </div>

          {/* Row 3: Specialties / Badges */}
          <div>
            <Label className="text-xs font-bold text-text-secondary uppercase">
              Especialidades / Insignias (Separadas por comas)
            </Label>
            <Input
              type="text"
              value={sstProfile.specialties}
              onChange={(e) => setSstProfile({ ...sstProfile, specialties: e.target.value })}
              placeholder="Ej. Especialista SG-SST, Auditor de Riesgos, Asesor IA en SST, Embajador Líder"
              className="mt-1"
            />
          </div>

          {/* Row 4: Quote */}
          <div>
            <Label className="text-xs font-bold text-text-secondary uppercase flex items-center gap-1.5">
              <Quote className="w-3.5 h-3.5 text-teal-600" />
              <span>Frase / Cita Profesional Representativa</span>
            </Label>
            <Input
              type="text"
              value={sstProfile.quote}
              onChange={(e) => setSstProfile({ ...sstProfile, quote: e.target.value })}
              placeholder="Ej. Al unir la tecnología y la IA con la SST, optimizamos la gestión preventiva..."
              className="mt-1 font-medium italic"
            />
          </div>

          {/* Row 5: Story Paragraph 1 & 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold text-text-secondary uppercase">
                Párrafo 1: Tu Trayectoria Profesional
              </Label>
              <textarea
                rows={4}
                value={sstProfile.storyParagraph1}
                onChange={(e) => setSstProfile({ ...sstProfile, storyParagraph1: e.target.value })}
                placeholder="Primer párrafo de tu historia que verán los clientes en la landing page..."
                className="w-full mt-1 bg-surface-secondary border border-border-light rounded-xl p-3 text-xs text-text-primary outline-none focus:border-teal-500 font-normal leading-relaxed resize-y"
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-text-secondary uppercase">
                Párrafo 2: Tu Visión & WAPPY IA
              </Label>
              <textarea
                rows={4}
                value={sstProfile.storyParagraph2}
                onChange={(e) => setSstProfile({ ...sstProfile, storyParagraph2: e.target.value })}
                placeholder="Segundo párrafo explicando cómo impulsas a profesionales y empresas con WAPPY IA..."
                className="w-full mt-1 bg-surface-secondary border border-border-light rounded-xl p-3 text-xs text-text-primary outline-none focus:border-teal-500 font-normal leading-relaxed resize-y"
              />
            </div>
          </div>

          {/* LIVE PREVIEW BOX */}
          <div className="bg-surface-secondary/70 border border-border-light rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-text-secondary uppercase pb-2 border-b border-border-light">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Vista Previa en tu Landing Page
              </span>
              <span className="text-[10px] text-text-tertiary font-medium lowercase truncate">
                wappy.club/portafolio?ref={user?.username || 'tu-codigo'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-teal-500/40 p-0.5 shrink-0 overflow-hidden bg-surface-primary">
                <img
                  src={user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user?.name || 'Usuario')}`}
                  alt={user?.name || 'Avatar'}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>

              <div className="space-y-2 text-center sm:text-left flex-1 min-w-0 w-full">
                <div className="text-[11px] font-black uppercase text-teal-600 dark:text-teal-400">
                  Embajador Oficial WAPPY
                </div>
                <h4 className="text-base sm:text-lg font-black text-text-primary">
                  Mucho gusto, soy <span className="text-teal-600 dark:text-teal-400">{formData.name || user?.name || 'Tu Nombre'}</span>
                </h4>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  {(sstProfile.specialties ? sstProfile.specialties.split(',') : [sstProfile.profession || 'Profesional SST', sstProfile.yearsExperience || '+5 Años Exp.']).map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20"
                    >
                      {tag.trim()}
                    </span>
                  ))}
                </div>

                {sstProfile.quote && (
                  <p className="text-xs italic text-text-secondary bg-surface-primary p-2.5 rounded-xl border border-border-light/60 mt-1">
                    "{sstProfile.quote}"
                  </p>
                )}

                <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                  {sstProfile.storyParagraph1 || 'Aquí aparecerá tu historia profesional y experiencia en SST redactada para tus clientes.'}
                </p>
              </div>
            </div>
          </div>

          {/* SAVE BUTTON */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={handleSaveSstProfile}
              disabled={isSavingSstProfile}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 w-full sm:w-auto"
            >
              {isSavingSstProfile ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{isSavingSstProfile ? 'Guardando...' : 'Guardar Perfil Profesional SST'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* CONNECTIONS AND INTEGRATIONS */}
      <div className="flex flex-col gap-1 p-5 rounded-2xl border border-border-light bg-surface-primary shadow-sm">
        <h3 className="text-base font-bold text-text-primary mb-1 pb-3 border-b border-border-light">Conexiones e Integraciones</h3>
        <div className="py-2"><GoogleAIConnect /></div>
        <div className="h-px bg-border-light w-full my-1"></div>
        
        {/* Token de Seguridad (JWT) para Agente Local */}
        <div className="py-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-sm font-bold text-text-primary">
                Token de Seguridad (JWT) para Agente Local
              </Label>
              <p className="text-xs text-text-secondary">
                Usa este token para conectar las carpetas de tu computadora con WAPPY de forma segura.
              </p>
              <div className="relative mt-2 flex gap-2 max-w-xl">
                <div className="relative flex-1">
                  <Input
                    id="mcpToken"
                    type={showToken ? 'text' : 'password'}
                    value={desktopToken || token}
                    readOnly
                    className="pr-10 font-mono text-xs select-all bg-surface-secondary text-text-secondary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-tertiary hover:text-text-primary"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-border-light hover:bg-surface-secondary flex items-center gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(desktopToken || token);
                    showToast({ message: 'Token copiado al portapapeles', status: 'success' });
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-secondary">Descargar Aplicativo "Somos SST - WappyClub":</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-green-600/30 bg-green-500/5 hover:bg-green-500/10 text-green-600 dark:text-green-400 font-bold text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    onClick={() => {
                      window.open('/download/somos-sst-wappyclub/windows', '_blank');
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Descargar para Windows (.exe)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-blue-600/30 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer"
                    onClick={() => {
                      window.open('/download/somos-sst-wappyclub/mac', '_blank');
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Descargar para macOS (.dmg)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-border-light w-full my-1"></div>
        <div className="py-2"><GoogleDriveConnect /></div>
        <div className="h-px bg-border-light w-full my-1"></div>
        <div className="py-2"><OneDriveConnect /></div>

        {user?.provider === 'local' && (
          <>
            <div className="h-px bg-border-light w-full my-1"></div>
            <div className="py-2"><EnableTwoFactorItem /></div>
            {user?.twoFactorEnabled && (
              <div className="pb-2">
                <BackupCodesItem />
              </div>
            )}
            
            {user?.role === 'ADMIN' && (
              <>
                <div className="h-px bg-border-light w-full my-1"></div>
                <div className="py-2"><WhatsAppConnect /></div>
              </>
            )}
          </>
        )}
      </div>

      {/* REFERRAL & PARTNERS SYSTEM */}
      <ReferralPanel />

      {/* BOTTOM: Zona de Peligro */}
      <div className="flex flex-col gap-2 p-5 rounded-2xl border border-red-500/20 bg-red-500/5 shadow-sm h-fit">
        <h3 className="text-base font-bold text-red-500 border-b border-red-500/20 pb-3 mb-4">Zona de Peligro</h3>
        <div className="py-2"><DeleteAccount /></div>
        <div className="h-px bg-red-500/10 w-full my-4"></div>
        {user?.role === 'ADMIN' ? (
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent('switch-settings-tab', { detail: { mainTab: 'admin', subTab: 'pqrs' } });
              window.dispatchEvent(event);
            }}
            className="flex w-full items-center justify-between py-3 px-4 rounded-xl border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-all text-orange-600 dark:text-orange-400 group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-transform" />
              <span className="font-bold font-sans">Panel Administrativo: Responder Tickets PQRS activo</span>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </div>
          </button>
        ) : (
          <div className="py-2"><TicketForm /></div>
        )}
      </div>
    </div>
  );
}

export default React.memo(Account);
