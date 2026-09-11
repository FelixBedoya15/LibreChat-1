import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import type { ContextType } from '~/common';
import {
  useSearchEnabled,
  useAssistantsMap,
  useAuthContext,
  useAgentsMap,
  useFileMap,
  useLocalize,
} from '~/hooks';
import {
  PromptGroupsProvider,
  AssistantsMapContext,
  AgentsMapContext,
  SetConvoProvider,
  FileMapContext,
} from '~/Providers';
import { useUserTermsQuery, useGetStartupConfig } from '~/data-provider';
import { TermsAndConditionsModal, RequiredInfoModal } from '~/components/ui';
import { Nav, MobileBottomNav } from '~/components/Nav';
import { useHealthCheck } from '~/data-provider';
import { Banner } from '~/components/Banners';
import InactiveAccount from '~/components/Auth/InactiveAccount';
import TenshiChat from '~/components/Tenshi/TenshiChat';

const playStartupSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    // Play a soft, pleasant chord (C major 7th: C, E, G, B)
    const frequencies = [523.25, 659.25, 783.99, 987.77]; // C5, E5, G5, B5

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Envelope
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1 + (i * 0.05));
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + (i * 0.05));
      osc.stop(ctx.currentTime + 1.5);
    });

  } catch (e) {
    console.warn('Startup sound could not be played:', e);
  }
};

export default function Root() {
  const localize = useLocalize();
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [navVisible, setNavVisible] = useState(() => {
    // On mobile (≤768px), always start with nav hidden so users see the chat
    const isMobile = window.innerWidth <= 768;
    if (isMobile) return false;
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const { isAuthenticated, logout, user } = useAuthContext();

  // Global health check - runs once per authenticated session
  useHealthCheck(isAuthenticated);

  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });

  const { data: config } = useGetStartupConfig();
  const { data: termsData } = useUserTermsQuery({
    enabled: isAuthenticated && config?.interface?.termsOfService?.modalAcceptance === true,
  });

  useSearchEnabled(isAuthenticated);

  // Listen to LiveEditor fullscreen to remove overflow-hidden from layout wrappers
  useEffect(() => {
    const enter = () => setIsEditorFullscreen(true);
    const exit = () => setIsEditorFullscreen(false);
    window.addEventListener('live-editor-fullscreen-enter', enter);
    window.addEventListener('live-editor-fullscreen-exit', exit);
    return () => {
      window.removeEventListener('live-editor-fullscreen-enter', enter);
      window.removeEventListener('live-editor-fullscreen-exit', exit);
    };
  }, []);

  // Capture referral parameter
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const referral = searchParams.get('ref');
      if (referral) {
        localStorage.setItem('wappy_ref', referral.trim());
      }
    } catch (e) {
      console.warn('Error capturing referral parameter:', e);
    }
  }, []);

  useEffect(() => {
    if (termsData) {
      setShowTerms(!termsData.termsAccepted);
    }
  }, [termsData]);

  // Attempt to play startup sound once the component is ready and authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Many browsers block audio without human interaction,
      // but we'll try our best here.
      playStartupSound();
    }
  }, [isAuthenticated]);

  const handleAcceptTerms = () => {
    setShowTerms(false);
  };

  const handleDeclineTerms = () => {
    setShowTerms(false);
    logout('/login?redirect=false');
  };

  const isPublicRoute = (pathname: string) => {
    const publicPaths = ['/planes', '/contactanos', '/privacy', '/terms', '/about', '/register', '/login', '/comunidad', '/comunidadmp', '/wappyvital', '/portafolio', '/portafolio.html', '/embajadores', '/embajadores.html', '/mauricioposada', '/mauricioposada.html'];
    if (publicPaths.includes(pathname)) {
      return true;
    }
    if ((pathname === '/blog' || pathname.startsWith('/blog/')) && !pathname.startsWith('/blog/admin')) {
      return true;
    }
    if ((pathname === '/training' || pathname.startsWith('/training/')) && !pathname.startsWith('/training/admin')) {
      return true;
    }
    return false;
  };

  if (!isAuthenticated) {
    if (isPublicRoute(window.location.pathname)) {
      return (
        <div className="flex h-screen w-screen bg-surface-primary text-text-primary">
          <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
            <Outlet context={{ navVisible: false, setNavVisible: () => {} } satisfies ContextType} />
          </div>
        </div>
      );
    }
    return null;
  }

  if (user?.accountStatus === 'inactive') {
    return <InactiveAccount />;
  }

  return (
    <SetConvoProvider>
      <FileMapContext.Provider value={fileMap}>
        <AssistantsMapContext.Provider value={assistantsMap}>
          <AgentsMapContext.Provider value={agentsMap}>
            <PromptGroupsProvider>
              <Banner onHeightChange={setBannerHeight} />
              <div className="flex" style={{ height: `calc(100dvh - ${bannerHeight}px)` }}>
                <div className={`relative z-0 flex h-full w-full ${isEditorFullscreen ? '' : 'overflow-hidden'}`}>
                  <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
                  <div className={`relative flex h-full max-w-full flex-1 flex-col ${isEditorFullscreen ? '' : 'overflow-hidden'}`}>
                    <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden pt-[env(safe-area-inset-top,0px)] md:pt-0">
                      <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
                    </div>
                    <MobileBottomNav navVisible={navVisible} setNavVisible={setNavVisible} />
                  </div>
                </div>
              </div>
            </PromptGroupsProvider>
          </AgentsMapContext.Provider>
          {config?.interface?.termsOfService?.modalAcceptance === true && (
            <TermsAndConditionsModal
              open={showTerms}
              onOpenChange={setShowTerms}
              onAccept={handleAcceptTerms}
              onDecline={handleDeclineTerms}
              title={localize('com_ui_terms_title')}
              modalContent={localize('com_ui_terms_content')}
            />
          )}
          {(() => {
            const isPhoneMissing =
              !user?.phoneNumber ||
              user.phoneNumber.trim() === '' ||
              user.phoneNumber === 'No registrado' ||
              user.phoneNumber === 'N/A';

            const userDept = (user as any)?.departamento || (user as any)?.department;
            const isDeptMissing =
              !userDept ||
              userDept.trim() === '' ||
              userDept === 'No registrado' ||
              userDept === 'N/A';

            const userCity = (user as any)?.ciudad || (user as any)?.city;
            const isCityMissing =
              !userCity ||
              userCity.trim() === '' ||
              userCity === 'No registrado' ||
              userCity === 'N/A';

            const isInfoMissing = isPhoneMissing || isDeptMissing || isCityMissing;

            return isAuthenticated && user && isInfoMissing ? (
              <RequiredInfoModal />
            ) : null;
          })()}
          <TenshiChat />
        </AssistantsMapContext.Provider>
      </FileMapContext.Provider>
    </SetConvoProvider>
  );
}
