import React, { useState, useEffect, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import type { TLoginUser, TStartupConfig } from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import { useResendVerificationEmail, useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Eye, EyeOff } from 'lucide-react';


type TLoginFormProps = {
  onSubmit: (data: TLoginUser) => void;
  startupConfig: TStartupConfig;
  error: Pick<TAuthContext, 'error'>['error'];
  setError: Pick<TAuthContext, 'setError'>['setError'];
};

const LoginForm: React.FC<TLoginFormProps> = ({ onSubmit, startupConfig, error, setError }) => {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TLoginUser>();
  const [showResendLink, setShowResendLink] = useState<boolean>(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const navigate = useNavigate();
  const [loginMode, setLoginMode] = useState<'regular' | 'worker'>('regular');
  const [workerCompany, setWorkerCompany] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [workerCedula, setWorkerCedula] = useState('');
  const [workerSubmitting, setWorkerSubmitting] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const handleWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerCompany.trim() || !workerName.trim() || !workerCedula.trim()) {
      setWorkerError('Todos los campos son obligatorios.');
      return;
    }

    setWorkerSubmitting(true);
    setWorkerError(null);
    try {
      const response = await axios.post('/api/ruta-aprendizaje/public/login', {
        nitOrName: workerCompany.trim(),
        nombre: workerName.trim(),
        cedula: workerCedula.trim(),
      });

      if (response.data?.success) {
        const sessionData = {
          companyId: response.data.companyId,
          companyName: response.data.companyName,
          nombre: response.data.worker.nombre,
          cedula: response.data.worker.cedula,
          cargo: response.data.worker.cargo || 'Trabajador',
        };
        localStorage.setItem('wappy_worker_session', JSON.stringify(sessionData));
        navigate(`/sgsst-public/ruta-aprendizaje/${response.data.companyId}`);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Identificación o datos incorrectos. Por favor verifique.';
      setWorkerError(errMsg);
    } finally {
      setWorkerSubmitting(false);
    }
  };


  const { data: config } = useGetStartupConfig();
  const useUsernameLogin = config?.ldap?.username;
  const validTheme = isDark(theme) ? 'dark' : 'light';
  const requireCaptcha = Boolean(startupConfig.turnstile?.siteKey);

  useEffect(() => {
    if (error && error.includes('422') && !showResendLink) {
      setShowResendLink(true);
    }
  }, [error, showResendLink]);

  const resendLinkMutation = useResendVerificationEmail({
    onMutate: () => {
      setError(undefined);
      setShowResendLink(false);
    },
  });

  if (!startupConfig) {
    return null;
  }

  const renderError = (fieldName: string) => {
    const errorMessage = errors[fieldName]?.message;
    return errorMessage ? (
      <span role="alert" className="mt-1 text-sm text-red-500 dark:text-red-900">
        {String(errorMessage)}
      </span>
    ) : null;
  };

  const handleResendEmail = () => {
    const email = getValues('email');
    if (!email) {
      return setShowResendLink(false);
    }
    resendLinkMutation.mutate({ email });
  };

  return (
    <>
      {showResendLink && (
        <div className="mt-2 rounded-md border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200">
          {localize('com_auth_email_verification_resend_prompt')}
          <button
            type="button"
            className="ml-2 text-blue-600 hover:underline"
            onClick={handleResendEmail}
            disabled={resendLinkMutation.isLoading}
          >
            {localize('com_auth_email_resend_link')}
          </button>
        </div>
      )}

      {/* Login Mode Tabs */}
      <div className="flex rounded-xl bg-gray-100 dark:bg-slate-900 p-1 mt-6 mb-4">
        <button
          type="button"
          onClick={() => { setLoginMode('regular'); setError(undefined); }}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
            loginMode === 'regular'
              ? 'bg-white dark:bg-slate-800 text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Acceso Personal
        </button>
        <button
          type="button"
          onClick={() => { setLoginMode('worker'); setWorkerError(null); }}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
            loginMode === 'worker'
              ? 'bg-white dark:bg-slate-800 text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Soy Trabajador
        </button>
      </div>

      {loginMode === 'worker' ? (
        <form className="mt-4" onSubmit={handleWorkerSubmit}>
          {workerError && (
            <div className="mb-4 rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {workerError}
            </div>
          )}
          
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                id="workerCompany"
                value={workerCompany}
                onChange={(e) => setWorkerCompany(e.target.value)}
                required
                className="webkit-dark-styles peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
                placeholder=" "
              />
              <label
                htmlFor="workerCompany"
                className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
              >
                NIT o Nombre de la Empresa
              </label>
            </div>
          </div>

          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                id="workerName"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                required
                className="webkit-dark-styles peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
                placeholder=" "
              />
              <label
                htmlFor="workerName"
                className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
              >
                Tu Nombre Completo
              </label>
            </div>
          </div>

          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                id="workerCedula"
                value={workerCedula}
                onChange={(e) => setWorkerCedula(e.target.value)}
                required
                className="webkit-dark-styles peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
                placeholder=" "
              />
              <label
                htmlFor="workerCedula"
                className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
              >
                Cédula de Ciudadanía
              </label>
            </div>
          </div>

          <div className="mt-6">
            <Button
              aria-label="Continuar"
              type="submit"
              disabled={workerSubmitting}
              variant="submit"
              className="h-12 w-full rounded-2xl animate-fade-in"
            >
              {workerSubmitting ? <Spinner /> : 'Ingresar'}
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="mt-4"
          aria-label="Login form"
          method="POST"
          onSubmit={handleSubmit((data) => {
            if (data.email) {
              data.email = data.email.trim();
            }
            onSubmit(data);
          })}
        >
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                id="email"
                autoComplete="username"
                aria-label={localize('com_auth_email')}
                {...register('email', {
                  required: localize('com_auth_email_required'),
                  maxLength: { value: 120, message: localize('com_auth_email_max_length') },
                  pattern: {
                    value: /\S+/,
                    message: localize('com_auth_email_pattern'),
                  },
                })}
                aria-invalid={!!errors.email}
                className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
                placeholder=" "
              />
              <label
                htmlFor="email"
                className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
              >
                Correo o Usuario
              </label>
            </div>
            {renderError('email')}
          </div>
          <div className="mb-2">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="current-password"
                aria-label={localize('com_auth_password')}
                {...register('password', {
                  required: localize('com_auth_password_required'),
                  minLength: {
                    value: startupConfig?.minPasswordLength || 8,
                    message: localize('com_auth_password_min_length'),
                  },
                  maxLength: { value: 128, message: localize('com_auth_password_max_length') },
                })}
                aria-invalid={!!errors.password}
                className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
                placeholder=" "
              />
              <label
                htmlFor="password"
                className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
              >
                {localize('com_auth_password')}
              </label>
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary-alt hover:text-text-primary focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {renderError('password')}
          </div>

          {startupConfig.passwordResetEnabled && (
            <a
              href="/forgot-password"
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_auth_password_forgot')}
            </a>
          )}

          {requireCaptcha && (
            <div className="my-4 flex justify-center">
              <Turnstile
                siteKey={startupConfig.turnstile!.siteKey}
                options={{
                  ...startupConfig.turnstile!.options,
                  theme: validTheme,
                }}
                onSuccess={setTurnstileToken}
                onError={() => setTurnstileToken(null)}
                onExpire={() => setTurnstileToken(null)}
              />
            </div>
          )}

          <div className="mt-6">
            <Button
              aria-label={localize('com_auth_continue')}
              data-testid="login-button"
              type="submit"
              disabled={(requireCaptcha && !turnstileToken) || isSubmitting}
              variant="submit"
              className="h-12 w-full rounded-2xl"
            >
              {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
            </Button>
          </div>
        </form>
      )}
    </>
  );
};

export default LoginForm;
