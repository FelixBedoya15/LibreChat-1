import React, { memo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, GraduationCap, MessageSquarePlus, LayoutDashboard, User } from 'lucide-react';
import { Avatar } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';

function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthContext();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Detect virtual keyboard on mobile via input/textarea focus
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Determine active tabs based on pathname
  const isSSTActive =
    location.pathname.startsWith('/sgsst') &&
    !location.pathname.startsWith('/sgsst/control') &&
    !location.pathname.startsWith('/sgsst/automatizaciones');

  const isAcademiaActive =
    location.pathname.startsWith('/academia') ||
    location.pathname.startsWith('/training') ||
    location.pathname.startsWith('/ruta-aprendizaje') ||
    location.pathname.startsWith('/blog') ||
    location.pathname.startsWith('/events-meet');

  const isChatActive =
    location.pathname === '/' ||
    location.pathname.startsWith('/c/') ||
    location.pathname === '/c/new';

  const isControlActive =
    location.pathname.startsWith('/control') ||
    location.pathname.startsWith('/kanban') ||
    location.pathname.startsWith('/sgsst/control') ||
    location.pathname.startsWith('/sgsst/automatizaciones');

  const handleOpenChat = () => {
    if (location.pathname !== '/c/new') {
      navigate('/c/new');
    } else {
      // If already in /c/new, focus chat input
      const textarea = document.getElementById('prompt-textarea');
      if (textarea) {
        textarea.focus();
      }
    }
  };

  const handleOpenSettings = () => {
    window.dispatchEvent(new CustomEvent('open-settings'));
  };

  return (
    <nav
      id="wappy-mobile-bottom-nav"
      aria-label="Navegación principal móvil"
      style={{
        paddingBottom: isKeyboardOpen
          ? '0px'
          : 'max(4px, calc(env(safe-area-inset-bottom, 0px) - 10px))',
      }}
      className={cn(
        'md:hidden flex-shrink-0 w-full z-40',
        'bg-surface-primary/95 text-text-primary backdrop-blur-xl',
        'border-t border-border-medium/40',
        'shadow-[0_-2px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_-2px_18px_rgba(0,0,0,0.25)]',
        'transition-all duration-200 ease-out',
        isKeyboardOpen
          ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden border-t-0'
          : 'max-h-20 opacity-100 pointer-events-auto overflow-visible',
      )}
    >
      <div className="flex items-center justify-around px-1 pt-1 pb-0.5 max-w-lg mx-auto relative">
        {/* 1. SOMOS SST */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate('/sgsst')}
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-0.5 px-0.5 rounded-xl transition-colors',
            isSSTActive
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <div className="relative">
            <ShieldCheck
              className={cn(
                'h-5 w-5 transition-transform duration-150',
                isSSTActive && 'scale-110 text-teal-600 dark:text-teal-400',
              )}
            />
            {isSSTActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-teal-500 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[62px]">
            Somos SST
          </span>
        </motion.button>

        {/* 2. ACADEMIA */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate('/academia')}
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-0.5 px-0.5 rounded-xl transition-colors',
            isAcademiaActive
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <div className="relative">
            <GraduationCap
              className={cn(
                'h-5 w-5 transition-transform duration-150',
                isAcademiaActive && 'scale-110 text-teal-600 dark:text-teal-400',
              )}
            />
            {isAcademiaActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-teal-500 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[62px]">
            Academia
          </span>
        </motion.button>

        {/* 3. CHAT (CENTRAL HERO BUTTON) */}
        <div className="flex flex-col items-center justify-center flex-1 -mt-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleOpenChat}
            aria-label="Abrir Chat"
            className={cn(
              'flex items-center justify-center w-11 h-11 rounded-2xl shadow-md transition-all duration-200',
              'bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-400 text-white',
              'ring-2 ring-surface-primary shadow-teal-500/25',
              isChatActive ? 'ring-teal-400/50 shadow-teal-500/40' : '',
            )}
          >
            <MessageSquarePlus className="h-5 w-5 text-white" />
          </motion.button>
          <span
            className={cn(
              'text-[10px] mt-0.5 font-medium tracking-tight',
              isChatActive
                ? 'text-teal-600 dark:text-teal-400 font-semibold'
                : 'text-text-secondary',
            )}
          >
            Chat
          </span>
        </div>

        {/* 4. CENTRO DE CONTROL */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate('/control')}
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-0.5 px-0.5 rounded-xl transition-colors',
            isControlActive
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <div className="relative">
            <LayoutDashboard
              className={cn(
                'h-5 w-5 transition-transform duration-150',
                isControlActive && 'scale-110 text-teal-600 dark:text-teal-400',
              )}
            />
            {isControlActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-teal-500 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[62px]">
            Control
          </span>
        </motion.button>

        {/* 5. PERFIL */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleOpenSettings}
          className="flex flex-col items-center justify-center flex-1 py-0.5 px-0.5 rounded-xl transition-colors text-text-secondary hover:text-text-primary"
        >
          <div className="relative flex items-center justify-center h-5 w-5">
            {user ? (
              <Avatar
                user={user}
                size={20}
                className="rounded-full ring-1 ring-border-medium shadow-2xs"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[62px]">
            Perfil
          </span>
        </motion.button>
      </div>
    </nav>
  );
}

export default memo(MobileBottomNav);
