import React, { memo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import type { Dispatch, SetStateAction } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Plus, ShieldCheck } from 'lucide-react';
import store from '~/store';
import { cn } from '~/utils';

interface MobileBottomNavProps {
  navVisible?: boolean;
  setNavVisible?: Dispatch<SetStateAction<boolean>>;
}

// Icono innovador para el Panel Izquierdo (Menú / Navegación)
const LeftPanelIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={cn(
      'h-5 w-5 transition-all duration-200',
      active ? 'text-teal-500 scale-105' : 'text-text-secondary hover:text-text-primary',
    )}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="4" />
    <path d="M9 4.5v15" strokeWidth="2" className={active ? 'stroke-teal-500' : 'stroke-currentColor'} />
    <circle cx="6" cy="9" r="0.9" fill="currentColor" />
    <circle cx="6" cy="12" r="0.9" fill="currentColor" />
    <circle cx="6" cy="15" r="0.9" fill="currentColor" />
  </svg>
);

// Icono innovador para el Panel Derecho (Herramientas / Side Panel)
const RightPanelIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={cn(
      'h-5 w-5 transition-all duration-200',
      active ? 'text-teal-500 scale-105' : 'text-text-secondary hover:text-text-primary',
    )}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="4" />
    <path d="M15 4.5v15" strokeWidth="2" className={active ? 'stroke-teal-500' : 'stroke-currentColor'} />
    <circle cx="18" cy="9" r="0.9" fill="currentColor" />
    <circle cx="18" cy="12" r="0.9" fill="currentColor" />
    <circle cx="18" cy="15" r="0.9" fill="currentColor" />
  </svg>
);

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
    <div
      id="wappy-mobile-bottom-nav-wrapper"
      className={cn(
        'md:hidden flex-shrink-0 w-full z-40 px-3 transition-all duration-200 ease-out',
        isKeyboardOpen
          ? 'max-h-0 opacity-0 pointer-events-none overflow-hidden pb-0'
          : 'max-h-24 opacity-100 pointer-events-auto overflow-visible',
      )}
      style={{
        paddingBottom: isKeyboardOpen
          ? '0px'
          : 'max(8px, calc(env(safe-area-inset-bottom, 0px) - 6px))',
      }}
    >
      <nav
        aria-label="Navegación principal móvil"
        className={cn(
          'relative flex items-center justify-between px-2 py-1 max-w-md mx-auto',
          'bg-surface-primary/90 dark:bg-surface-primary/95 text-text-primary backdrop-blur-2xl',
          'rounded-2xl border border-border-medium/50',
          'shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]',
        )}
      >
        {/* 1. EXTREMO IZQUIERDO: PANEL IZQUIERDO (SIN TEXTO) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={toggleLeftPanel}
          aria-label="Abrir panel izquierdo"
          className={cn(
            'flex items-center justify-center flex-1 py-2 px-1 rounded-xl transition-all',
            navVisible
              ? 'bg-teal-500/10 text-teal-500'
              : 'hover:bg-surface-hover active:bg-surface-hover/80',
          )}
        >
          <LeftPanelIcon active={!!navVisible} />
        </motion.button>

        {/* 2. MANO IZQUIERDA: ACADEMIA */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate('/academia')}
          aria-label="Ir a Academia WAPPY"
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all',
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

        {/* 3. CENTRO DESTACADO: NUEVO CHAT (HERO BUTTON) */}
        <div className="flex flex-col items-center justify-center flex-1 -mt-4">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            onClick={handleNewChat}
            aria-label="Nuevo Chat"
            className={cn(
              'relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-200',
              'bg-gradient-to-tr from-teal-500 via-emerald-400 to-teal-300 text-white',
              'shadow-[0_4px_18px_rgba(20,184,166,0.45)] ring-4 ring-surface-primary',
              'active:shadow-none group',
            )}
          >
            <Plus className="h-6 w-6 text-white stroke-[2.8] transition-transform duration-200 group-active:rotate-90" />
          </motion.button>
          <span className="text-[10px] mt-0.5 font-semibold tracking-tight text-text-primary">
            Nuevo Chat
          </span>
        </div>

        {/* 4. MANO DERECHA: SOMOS SST */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => navigate('/sgsst')}
          aria-label="Ir a Somos SST"
          className={cn(
            'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all',
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
          whileTap={{ scale: 0.88 }}
          onClick={toggleRightPanel}
          aria-label="Abrir panel derecho"
          className={cn(
            'flex items-center justify-center flex-1 py-2 px-1 rounded-xl transition-all',
            isRightPanelOpen
              ? 'bg-teal-500/10 text-teal-500'
              : 'hover:bg-surface-hover active:bg-surface-hover/80',
          )}
        >
          <RightPanelIcon active={isRightPanelOpen} />
        </motion.button>
      </nav>
    </div>
  );
}

export default memo(MobileBottomNav);
