import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    // Dar suficiente tiempo (3.5s) al silentRefresh para verificar la sesión en cookies antes de redirigir a login
    const timeout = setTimeout(() => {
      if (!isAuthenticated) {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        navigate(`/login${search}`, { replace: true });
      }
    }, 3500);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate]);

  return {
    user,
    isAuthenticated,
  };
}
