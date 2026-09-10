import { useEffect, useState } from 'react';
import { ErrorTypes } from 'librechat-data-provider';
import { OpenIDIcon, useToastContext } from '@librechat/client';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { TLoginLayoutContext } from '~/common';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import SocialButton from '~/components/Auth/SocialButton';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import { getLoginError } from '~/utils';
import LoginForm from './LoginForm';
import AmbassadorLandingBanner from './AmbassadorLandingBanner';

function Login() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { error, setError, login } = useAuthContext();
  const { startupConfig, startupConfigError, isFetching } = useOutletContext<TLoginLayoutContext>();

  const [searchParams, setSearchParams] = useSearchParams();
  // Determine if auto-redirect should be disabled based on the URL parameter
  const disableAutoRedirect = searchParams.get('redirect') === 'false';

  // Persist the disable flag locally so that once detected, auto-redirect stays disabled.
  const [isAutoRedirectDisabled, setIsAutoRedirectDisabled] = useState(disableAutoRedirect);

  useEffect(() => {
    const oauthError = searchParams?.get('error');
    if (oauthError && oauthError === 'account_exists') {
      showToast({
        message: localize('com_auth_error_account_exists'),
        status: 'error',
      });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      setSearchParams(newParams, { replace: true });
    } else if (oauthError && oauthError === ErrorTypes.AUTH_FAILED) {
      showToast({
        message: localize('com_auth_error_oauth_failed'),
        status: 'error',
      });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, localize]);

  // Once the disable flag is detected, update local state and remove the parameter from the URL.
  useEffect(() => {
    if (disableAutoRedirect) {
      setIsAutoRedirectDisabled(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('redirect');
      setSearchParams(newParams, { replace: true });
    }
  }, [disableAutoRedirect, searchParams, setSearchParams]);

  // Determine whether we should auto-redirect to OpenID.
  const shouldAutoRedirect =
    startupConfig?.openidLoginEnabled &&
    startupConfig?.openidAutoRedirect &&
    startupConfig?.serverDomain &&
    !isAutoRedirectDisabled;

  useEffect(() => {
    if (shouldAutoRedirect) {
      console.log('Auto-redirecting to OpenID provider...');
      const safeDomain = (startupConfig.serverDomain || '')
        .replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club')
        .replace(/\/+$/, '') || (typeof window !== 'undefined' ? window.location.origin : 'https://wappy.club');
      window.location.href = `${safeDomain}/oauth/openid`;
    }
  }, [shouldAutoRedirect, startupConfig]);

  // Render fallback UI if auto-redirect is active.
  if (shouldAutoRedirect) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-lg font-semibold">
          {localize('com_ui_redirecting_to_provider', { 0: startupConfig.openidLabel })}
        </p>
        <div className="mt-4">
          <SocialButton
            key="openid"
            enabled={startupConfig.openidLoginEnabled}
            serverDomain={startupConfig.serverDomain}
            oauthPath="openid"
            Icon={() =>
              startupConfig.openidImageUrl ? (
                <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
              ) : (
                <OpenIDIcon />
              )
            }
            label={startupConfig.openidLabel}
            id="openid"
          />
        </div>
      </div>
    );
  }

  if (!isFetching && startupConfigError) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="mb-4 rounded-full bg-red-500/10 p-3 text-red-500 dark:bg-red-500/20 animate-pulse">
          <svg
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          Error de Conexión
        </h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400 max-w-xs px-2">
          No pudimos conectar con el servidor de WAPPY IA. Por favor, revisa tu conexión o intenta recargar.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-4 py-3 font-bold text-white hover:bg-[#16a34a] transition-all hover:scale-[1.02] shadow-lg shadow-green-500/20 active:scale-95"
        >
          Recargar Página
        </button>
      </div>
    );
  }

  return (
    <>
      <AmbassadorLandingBanner />
      {error != null && <ErrorMessage>{localize(getLoginError(error))}</ErrorMessage>}
      {startupConfig?.emailLoginEnabled === true && (
        <LoginForm
          onSubmit={login}
          startupConfig={startupConfig}
          error={error}
          setError={setError}
        />
      )}
      {startupConfig?.registrationEnabled === true && (
        <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
          {' '}
          {localize('com_auth_no_account')}{' '}
          <a
            href={(() => {
              const activeRef = searchParams.get('ref') || searchParams.get('referral');
              return activeRef ? `/register?ref=${encodeURIComponent(activeRef.trim())}` : '/register';
            })()}
            className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          >
            {localize('com_auth_sign_up')}
          </a>
        </p>
      )}
    </>
  );
}

export default Login;
