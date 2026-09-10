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
        let search = typeof window !== 'undefined' ? window.location.search : '';
        if (!search) {
          try {
            const savedRef = localStorage.getItem('wappy_ref');
            if (savedRef) {
              search = `?ref=${encodeURIComponent(savedRef)}`;
            }
          } catch (e) {}
        }
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
