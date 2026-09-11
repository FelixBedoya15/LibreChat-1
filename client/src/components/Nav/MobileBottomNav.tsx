import React, { memo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import type { Dispatch, SetStateAction } from 'react';
import { motion } from 'framer-motion';
import {
  PanelLeft,
  GraduationCap,
  Plus,
  ShieldCheck,
  PanelRight,
} from 'lucide-react';
import store from '~/store';
import { cn } from '~/utils';

interface MobileBottomNavProps {
  navVisible?: boolean;
  setNavVisible?: Dispatch<SetStateAction<boolean>>;
}

function MobileBottomNav({ navVisible, setNavVisible }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const setIsCollapsed = useSetRecoilState(store.sidePanelCollapsed);
  const setFullCollapse = useSetRecoilState(store.sidePanelFullCollapse);
  const isRightCollapsed = useRecoilValue(store.sidePanelCollapsed);
  const isRightPanelOpen = !isRightCollapsed;

  // Toggle left side drawer
  const toggleLeftPanel = () => {
    if (setNavVisible) {
      setNavVisible((prev) => {
        localStorage.setItem('navVisible', JSON.stringify(!prev));
        return !prev;
      });
    }
  };

  // Toggle right side drawer
  const toggleRightPanel = () => {
    setIsCollapsed((prev) => !prev);
    setFullCollapse((prev) => !prev);
  };

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

  // Determine active states based on current route
  const isAcademiaActive =
    location.pathname.startsWith('/academia') ||
    location.pathname.startsWith('/training') ||
    location.pathname.startsWith('/ruta-aprendizaje') ||
    location.pathname.startsWith('/blog') ||
    location.pathname.startsWith('/events-meet');

  const isSSTActive =
    location.pathname.startsWith('/sgsst') &&
    !location.pathname.startsWith('/sgsst/control') &&
    !location.pathname.startsWith('/sgsst/automatizaciones');

  const handleNewChat = () => {
    if (location.pathname !== '/c/new') {
      navigate('/c/new');
    } else {
      const textarea = document.getElementById('prompt-textarea');
      if (textarea) {
        textarea.focus();
      }
    }
  };

  return (
    <nav
      id="wappy-mobile-bottom-nav"
      aria-label="Navegación principal móvil"
      style={{
        paddingBottom: isKeyboardOpen
          ? '0px'
          : 'max(6px, calc(env(safe-area-inset-bottom, 0px) - 8px))',
      }}
      className={cn(
        'md:hidden flex-shrink-0 w-full z-40',
        'bg-surface-primary/95 text-text-primary backdrop-blur-xl',
        'border-t border-border-medium/35',
        'shadow-[0_-2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_-2px_18px_rgba(0,0,0,0.25)]',
        'transition-all duration-200 ease-out',
        isKeyboardOpen
          ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden border-t-0'
          : 'max-h-20 opacity-100 pointer-events-auto overflow-visible',
      )}
    >
      <div className="flex items-center justify-between px-2 pt-1 pb-0.5 max-w-md mx-auto relative">
        {/* 1. EXTREMO IZQUIERDO: PANEL IZQUIERDO (SIN TEXTO) */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleLeftPanel}
          aria-label="Abrir panel izquierdo"
          className={cn(
            'flex items-center justify-center flex-1 py-2 px-1 rounded-xl transition-colors',
            navVisible
              ? 'text-teal-600 dark:text-teal-400'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <PanelLeft className="h-[22px] w-[22px] transition-transform duration-150" />
        </motion.button>

        {/* 2. MANO IZQUIERDA: ACADEMIA */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/academia')}
          aria-label="Ir a Academia WAPPY"
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-0.5 px-0.5 rounded-xl transition-colors',
            isAcademiaActive
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <div className="relative flex items-center justify-center h-5 w-5">
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
          <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[62px] font-medium">
            Academia
          </span>
        </motion.button>

        {/* 3. CENTRO DESTACADO: NUEVO CHAT */}
        <div className="flex flex-col items-center justify-center flex-1 -mt-3">
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleNewChat}
            aria-label="Nuevo Chat"
            className={cn(
              'flex items-center justify-center w-11 h-11 rounded-2xl shadow-md transition-all duration-200',
              'bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-400 text-white',
              'ring-2 ring-surface-primary shadow-teal-500/25 active:shadow-none',
            )}
          >
            <Plus className="h-6 w-6 text-white stroke-[2.5]" />
          </motion.button>
          <span className="text-[10px] mt-0.5 font-medium tracking-tight text-text-primary">
            Nuevo Chat
          </span>
        </div>

        {/* 4. MANO DERECHA: SOMOS SST */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/sgsst')}
          aria-label="Ir a Somos SST"
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-0.5 px-0.5 rounded-xl transition-colors',
            isSSTActive
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <div className="relative flex items-center justify-center h-5 w-5">
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
          <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[62px] font-medium">
            Somos SST
          </span>
        </motion.button>

        {/* 5. EXTREMO DERECHO: PANEL DERECHO (SIN TEXTO) */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleRightPanel}
          aria-label="Abrir panel derecho"
          className={cn(
            'flex items-center justify-center flex-1 py-2 px-1 rounded-xl transition-colors',
            isRightPanelOpen
              ? 'text-teal-600 dark:text-teal-400'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          <PanelRight className="h-[22px] w-[22px] transition-transform duration-150" />
        </motion.button>
      </div>
    </nav>
  );
}

export default memo(MobileBottomNav);
