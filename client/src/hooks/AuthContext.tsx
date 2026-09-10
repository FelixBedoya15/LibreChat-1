import {
  useRef,
  useMemo,
  useState,
  useEffect,
  ReactNode,
  useContext,
  useCallback,
  createContext,
} from 'react';
import { debounce } from 'lodash';
import { useRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { setTokenHeader, SystemRoles } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import {
  useGetRole,
  useGetUserQuery,
  useLoginUserMutation,
  useLogoutUserMutation,
  useRefreshTokenMutation,
} from '~/data-provider';
import { TAuthConfig, TUserContext, TAuthContext, TResError } from '~/common';
import useTimeout from './useTimeout';
import store from '~/store';

const AuthContext = createContext<TAuthContext | undefined>(undefined);

const AuthContextProvider = ({
  authConfig,
  children,
}: {
  authConfig?: TAuthConfig;
  children: ReactNode;
}) => {
  const [user, setUser] = useRecoilState(store.user);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const logoutRedirectRef = useRef<string | undefined>(undefined);

  const { data: userRole = null } = useGetRole(SystemRoles.USER, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: adminRole = null } = useGetRole(SystemRoles.ADMIN, {
    enabled: !!(isAuthenticated && user?.role === SystemRoles.ADMIN),
  });
  const { data: userGoRole = null } = useGetRole(SystemRoles.USER_GO, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: userPlusRole = null } = useGetRole(SystemRoles.USER_PLUS, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: userProRole = null } = useGetRole(SystemRoles.USER_PRO, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: userIpevarRole = null } = useGetRole(SystemRoles.USER_IPEVAR, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: userCustomRole = null } = useGetRole(SystemRoles.USER_CUSTOM, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });

  const navigate = useNavigate();

  const getLoginRedirectUrl = useCallback((baseUrl: string = '/login') => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    return `${baseUrl}${search}`;
  }, []);

  const setUserContext = useMemo(
    () =>
      debounce((userContext: TUserContext) => {
        const { token, isAuthenticated, user, redirect } = userContext;
        setUser(user);
        setToken(token);
        //@ts-ignore - ok for token to be undefined initially
        setTokenHeader(token);
        setIsAuthenticated(isAuthenticated);

        // Use a custom redirect if set
        const finalRedirect = logoutRedirectRef.current || redirect;
        // Clear the stored redirect
        logoutRedirectRef.current = undefined;

        if (finalRedirect == null) {
          return;
        }

        if (finalRedirect.startsWith('http://') || finalRedirect.startsWith('https://')) {
          window.location.href = finalRedirect;
        } else {
          navigate(finalRedirect, { replace: true });
        }
      }, 50),
    [navigate, setUser],
  );
  const doSetError = useTimeout({ callback: (error) => setError(error as string | undefined) });

  const loginUser = useLoginUserMutation({
    onSuccess: (data: t.TLoginResponse) => {
      const { user, token, twoFAPending, tempToken } = data;
      if (twoFAPending) {
        // Redirect to the two-factor authentication route.
        navigate(`/login/2fa?tempToken=${tempToken}`, { replace: true });
        return;
      }
      setError(undefined);
      let redirectUrl = '/c/new';
      if (user?.isSubUser) {
        const subPerms = user.subUserPermissions || [];
        const hasChat = subPerms.includes('chat:wappy_general') || subPerms.includes('chat:sst_specialist');
        if (!hasChat) {
          redirectUrl = '/sgsst';
        }
      }
      setUserContext({ token, isAuthenticated: true, user, redirect: redirectUrl });
    },
    onError: (error: TResError | unknown) => {
      const resError = error as TResError;
      const message = resError.response?.data?.message || resError.message;
      doSetError(message);
      navigate(getLoginRedirectUrl('/login'), { replace: true });
    },
  });
  const logoutUser = useLogoutUserMutation({
    onSuccess: (data) => {
      setUserContext({
        token: undefined,
        isAuthenticated: false,
        user: undefined,
        redirect: data.redirect ?? '/login',
      });
    },
    onError: (error) => {
      doSetError((error as Error).message);
      setUserContext({
        token: undefined,
        isAuthenticated: false,
        user: undefined,
        redirect: '/login',
      });
    },
  });
  const refreshToken = useRefreshTokenMutation();

  const logout = useCallback(
    (redirect?: string) => {
      if (redirect) {
        logoutRedirectRef.current = redirect;
      }
      logoutUser.mutate(undefined);
    },
    [logoutUser],
  );

  const userQuery = useGetUserQuery({ enabled: !!(token ?? '') });

  const login = (data: t.TLoginUser) => {
    loginUser.mutate(data);
  };

  const isPublicRoute = useCallback((pathname: string) => {
    const publicPaths = ['/planes', '/contactanos', '/privacy', '/terms', '/about', '/register', '/login', '/comunidad', '/comunidadmp', '/wappyvital', '/portafolio', '/portafolio.html', '/embajadores', '/embajadores.html', '/mauricioposada', '/mauricioposada.html'];
    if (publicPaths.includes(pathname)) {
      return true;
    }
    if (pathname.startsWith('/comunidad/') || pathname === '/comunidad') {
      return true;
    }
    if (pathname.startsWith('/comunidadmp/') || pathname === '/comunidadmp') {
      return true;
    }
    if (pathname.startsWith('/wappyvital/') || pathname === '/wappyvital') {
      return true;
    }
    if ((pathname === '/blog' || pathname.startsWith('/blog/')) && !pathname.startsWith('/blog/admin')) {
      return true;
    }
    if ((pathname === '/training' || pathname.startsWith('/training/')) && !pathname.startsWith('/training/admin')) {
      return true;
    }
    return false;
  }, []);

  const silentRefresh = useCallback(() => {
    if (authConfig?.test === true) {
      console.log('Test mode. Skipping silent refresh.');
      return;
    }
    refreshToken.mutate(undefined, {
      onSuccess: (data: t.TRefreshTokenResponse | undefined) => {
        const { user, token = '' } = data ?? {};
        if (token) {
          setUserContext({ token, isAuthenticated: true, user });
        } else {
          console.log('Token is not present. User is not authenticated.');
          if (authConfig?.test === true) {
            return;
          }
          if (!isPublicRoute(window.location.pathname)) {
            navigate(getLoginRedirectUrl('/login'));
          }
        }
      },
      onError: (error) => {
        console.log('refreshToken mutation error:', error);
        if (authConfig?.test === true) {
          return;
        }
        if (!isPublicRoute(window.location.pathname)) {
          navigate(getLoginRedirectUrl('/login'));
        }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLoginRedirectUrl, isPublicRoute]);

  useEffect(() => {
    if (userQuery.data) {
      setUser(userQuery.data);
    } else if (userQuery.isError) {
      doSetError((userQuery.error as Error).message);
      navigate(getLoginRedirectUrl('/login'), { replace: true });
    }
    if (error != null && error && isAuthenticated) {
      doSetError(undefined);
    }
    if (token == null || !token || !isAuthenticated) {
      silentRefresh();
    }
  }, [
    token,
    isAuthenticated,
    userQuery.data,
    userQuery.isError,
    userQuery.error,
    error,
    setUser,
    navigate,
    silentRefresh,
    setUserContext,
  ]);

  useEffect(() => {
    const handleTokenUpdate = (event) => {
      console.log('tokenUpdated event received event');
      const newToken = event.detail;
      setUserContext({
        token: newToken,
        isAuthenticated: true,
        user: user,
      });
    };

    window.addEventListener('tokenUpdated', handleTokenUpdate);

    return () => {
      window.removeEventListener('tokenUpdated', handleTokenUpdate);
    };
  }, [setUserContext, user]);

  // Make the provider update only when it should
  const memoedValue = useMemo(
    () => ({
      user,
      token,
      error,
      login,
      logout,
      setError,
      setUser,
      roles: {
        [SystemRoles.USER]: userRole,
        [SystemRoles.USER_GO]: userGoRole,
        [SystemRoles.ADMIN]: adminRole,
        [SystemRoles.USER_PLUS]: userPlusRole,
        [SystemRoles.USER_PRO]: userProRole,
        [SystemRoles.USER_IPEVAR]: userIpevarRole,
        [SystemRoles.USER_CUSTOM]: userCustomRole,
      },
      isAuthenticated,
    }),

    [user, error, isAuthenticated, token, userRole, adminRole, userGoRole, userPlusRole, userProRole, userIpevarRole, userCustomRole],
  );

  return <AuthContext.Provider value={memoedValue}>{children}</AuthContext.Provider>;
};

const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuthContext should be used inside AuthProvider');
  }

  return context;
};

export { AuthContextProvider, useAuthContext, AuthContext };
