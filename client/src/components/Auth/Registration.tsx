import { useForm } from 'react-hook-form';
import React, { useContext, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize, TranslationKeys } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';
import { Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import AmbassadorLandingBanner from './AmbassadorLandingBanner';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching } = useOutletContext<TLoginLayoutContext>();

  const {
    watch,
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const validTheme = isDark(theme) ? 'dark' : 'light';

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);

  const [checkoutLoadingText, setCheckoutLoadingText] = useState<string>('');

  const handleWompiCheckout = async (name: string, email: string, phone: string) => {
    setCheckoutLoadingText('Creando tu registro de pago en WAPPY...');
    try {
      const couponParam = queryParams.get('coupon');
      const { data } = await axios.post('/api/comunidad/checkout', {
        fullName: name,
        email: email,
        phone: phone,
        funnelKey: 'wappyvital',
        discountCode: couponParam || undefined
      });

      if (data.alreadyPaid || data.freeAccess) {
        setCheckoutLoadingText('¡Pago confirmado! Redirigiéndote a Wappy...');
        localStorage.setItem('wappy_comunidad_email_wappyvital', email);
        localStorage.setItem('wappy_comunidad_phone_wappyvital', phone);
        setTimeout(() => {
          navigate('/c/new', { replace: true });
        }, 1500);
        return;
      }

      setCheckoutLoadingText('Abriendo pasarela de pago Wompi...');

      if (!window.WidgetCheckout) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.wompi.co/widget.js';
          script.async = true;
          document.body.appendChild(script);
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('No se pudo cargar la pasarela de pago.'));
        });
      }

      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents: data.amountInCents,
        reference: data.reference,
        publicKey: data.publicKey,
        signature: data.signature ? { integrity: data.signature } : undefined,
        redirectUrl: window.location.origin + '/wappyvital?wompi_redirect=1'
      });

      setCheckoutLoadingText('Pasarela de pago abierta. Completa tu pago.');

      checkout.open(async (result: any) => {
        const transaction = result.transaction;
        if (transaction.status === 'APPROVED') {
          setCheckoutLoadingText('Verificando pago...');
          try {
            await axios.post('/api/comunidad/verify', { transactionId: transaction.id, funnelKey: 'wappyvital' });
            localStorage.setItem('wappy_comunidad_email_wappyvital', email);
            localStorage.setItem('wappy_comunidad_phone_wappyvital', phone);
            setCheckoutLoadingText('¡Pago Aprobado! Redirigiéndote...');
            setTimeout(() => {
              navigate('/c/new', { replace: true });
            }, 1000);
          } catch (verifyErr) {
            console.error(verifyErr);
            navigate('/c/new', { replace: true });
          }
        } else if (transaction.status === 'PENDING') {
          alert('Tu pago está pendiente de aprobación. Podrás acceder tan pronto se confirme.');
          navigate('/c/new', { replace: true });
        } else {
          alert('El pago no fue aprobado. Puedes intentar de nuevo en la sección de planes.');
          navigate('/c/new', { replace: true });
        }
      });

    } catch (err: any) {
      console.error('[Registration Wompi error]', err);
      const msg = err.response?.data?.error || err.message || 'Error al iniciar el pago con Wompi.';
      setErrorMessage(msg);
      setCheckoutLoadingText('');
      setTimeout(() => {
        navigate('/c/new', { replace: true });
      }, 3000);
    }
  };

  const handleStandardWompiCheckout = async (name: string, email: string, phone: string, planId: string, interval: string, promoCode?: string) => {
    setCheckoutLoadingText('Creando tu registro de suscripción en WAPPY...');
    try {
      const { data } = await axios.post('/api/wompi/create-transaction', {
        plan: planId + '|' + interval,
        promoCode
      });

      setCheckoutLoadingText('Abriendo pasarela de pago Wompi...');

      if (!window.WidgetCheckout) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.wompi.co/widget.js';
          script.async = true;
          document.body.appendChild(script);
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('No se pudo cargar la pasarela de pago.'));
        });
      }

      const checkout = new window.WidgetCheckout({
        currency: 'COP',
        amountInCents: data.amountInCents,
        reference: data.reference,
        publicKey: data.publicKey,
        signature: data.signature ? { integrity: data.signature } : undefined,
        redirectUrl: window.location.origin + `/planes?success=1&plan=${planId}`
      });

      setCheckoutLoadingText('Pasarela de pago abierta. Completa tu pago.');

      checkout.open(async (result: any) => {
        const transaction = result.transaction;
        if (transaction.status === 'APPROVED') {
          setCheckoutLoadingText('Verificando pago...');
          try {
            await axios.post('/api/wompi/verify-transaction', { transactionId: transaction.id });
            setCheckoutLoadingText('¡Pago Aprobado! Redirigiéndote...');
            setTimeout(() => {
              navigate(`/planes?success=1&plan=${planId}`, { replace: true });
            }, 1000);
          } catch (verifyErr) {
            console.error(verifyErr);
            navigate(`/planes?success=1&plan=${planId}`, { replace: true });
          }
        } else if (transaction.status === 'PENDING') {
          alert('Tu pago está pendiente de aprobación. Podrás acceder tan pronto se confirme.');
          navigate('/planes', { replace: true });
        } else {
          alert('El pago no fue aprobado. Puedes intentar de nuevo.');
          navigate('/planes', { replace: true });
        }
      });

    } catch (err: any) {
      console.error('[Registration Standard Wompi error]', err);
      const msg = err.response?.data?.error || err.message || 'Error al iniciar el pago con Wompi.';
      setErrorMessage(msg);
      setCheckoutLoadingText('');
      setTimeout(() => {
        navigate('/planes', { replace: true });
      }, 3000);
    }
  };

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: () => {
      setIsSubmitting(false);

      const planParam = queryParams.get('plan');
      if (planParam === 'vital') {
        const values = getValues();
        handleWompiCheckout(values.name, values.email || '', values.phoneNumber || '');
        return;
      } else if (planParam === 'pro') {
        const values = getValues();
        const intervalParam = queryParams.get('interval') || 'annual';
        const couponParam = queryParams.get('coupon') || undefined;
        handleStandardWompiCheckout(values.name, values.email || '', values.phoneNumber || '', 'pro', intervalParam, couponParam);
        return;
      }

      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            navigate('/c/new', { replace: true });
            return 0;
          } else {
            return prevCountdown - 1;
          }
        });
      }, 1000);
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if ((error as TError).response?.data?.message) {
        setErrorMessage((error as TError).response?.data?.message ?? '');
      }
    },
  });

  const renderInput = (id: string, label: TranslationKeys, type: string, validation: object) => {
    const isPassword = type === 'password';
    const isConfirmPassword = id === 'confirm_password';
    let currentType = type;
    if (isPassword) {
      if (isConfirmPassword) {
        currentType = showConfirmPassword ? 'text' : 'password';
      } else {
        currentType = showPassword ? 'text' : 'password';
      }
    }

    return (
      <div className="mb-4">
        <div className="relative">
          <input
            id={id}
            type={currentType}
            autoComplete={id}
            aria-label={localize(label)}
            {...register(
              id as 'name' | 'email' | 'username' | 'password' | 'confirm_password' | 'phoneNumber',
              validation,
            )}
            aria-invalid={!!errors[id]}
            className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
            placeholder=" "
            data-testid={id}
          />
          <label
            htmlFor={id}
            className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
          >
            {localize(label)}
          </label>
          {isPassword && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary-alt hover:text-text-primary focus:outline-none"
              onClick={() => {
                if (isConfirmPassword) {
                  setShowConfirmPassword(!showConfirmPassword);
                } else {
                  setShowPassword(!showPassword);
                }
              }}
              aria-label={
                (isConfirmPassword ? showConfirmPassword : showPassword)
                  ? 'Hide password'
                  : 'Show password'
              }
            >
              {(isConfirmPassword ? showConfirmPassword : showPassword) ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          )}
        </div>
        {errors[id] && (
          <span role="alert" className="mt-1 text-sm text-red-500">
            {String(errors[id]?.message) ?? ''}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {checkoutLoadingText && (
        <div
          className="rounded-md border border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2 mb-4"
          role="alert"
        >
          <Spinner className="h-4 w-4 shrink-0" />
          <span>{checkoutLoadingText}</span>
        </div>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
          role="alert"
        >
          {localize(
            startupConfig?.emailEnabled
              ? 'com_auth_registration_success_generic'
              : 'com_auth_registration_success_insecure',
          ) +
            ' ' +
            localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </div>
      )}
      {!startupConfigError && !isFetching && (
        <>
          <AmbassadorLandingBanner />
          <form
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) => {
              const referral = localStorage.getItem('wappy_ref') || undefined;
              registerUser.mutate({
                ...data,
                token: token ?? undefined,
                ref: referral,
              } as any);
            })}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: {
                value: 3,
                message: localize('com_auth_name_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_name_max_length'),
              },
            })}
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: {
                value: 2,
                message: localize('com_auth_username_min_length'),
              },
              maxLength: {
                value: 20,
                message: localize('com_auth_username_max_length'),
              },
            })}
            {renderInput('phoneNumber', 'com_auth_phone_number_label', 'text', {
              required: 'El número de contacto es obligatorio',
              pattern: {
                value: /^\+?[0-9\s-]{7,20}$/,
                message: 'Número de teléfono inválido',
              },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 1,
                message: localize('com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize('com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            {renderInput('password', 'com_auth_password', 'password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: {
                value: 128,
                message: localize('com_auth_password_max_length'),
              },
            })}
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value: string) =>
                value === password || localize('com_auth_password_not_match'),
            })}

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{
                    ...startupConfig.turnstile.options,
                    theme: validTheme,
                  }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-4 flex items-start gap-3 px-1">
              <div className="flex h-5 items-center">
                <input
                  id="terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="h-4 w-4 rounded border-border-medium bg-surface-primary text-green-600 focus:ring-green-500 cursor-pointer"
                />
              </div>
              <label htmlFor="terms" className="text-sm text-text-secondary">
                Acepto los <a href="/terms" className="font-semibold text-green-600 hover:text-green-500 hover:underline" target="_blank" rel="noopener noreferrer">Términos de Servicio</a> y la <a href="/privacy" className="font-semibold text-green-600 hover:text-green-500 hover:underline" target="_blank" rel="noopener noreferrer">Política de Privacidad</a> de WAPPY IA.
              </label>
            </div>

            <div className="mt-6">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  (requireCaptcha && !turnstileToken) ||
                  !termsAccepted ||
                  !!checkoutLoadingText
                }
                type="submit"
                aria-label="Submit registration"
                variant="submit"
                className="h-12 w-full rounded-2xl"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>

          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
            {localize('com_auth_already_have_account')}{' '}
            <a
              href={(() => {
                const activeRef =
                  queryParams.get('ref') ||
                  queryParams.get('referral') ||
                  (typeof window !== 'undefined' ? localStorage.getItem('wappy_ref') : null);
                return activeRef ? `/login?ref=${encodeURIComponent(activeRef.trim())}` : '/login';
              })()}
              aria-label="Login"
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_auth_login')}
            </a>
          </p>
        </>
      )}
    </>
  );
};

export default Registration;
