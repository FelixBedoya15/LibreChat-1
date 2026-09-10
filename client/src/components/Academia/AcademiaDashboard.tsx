import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  GraduationCap, 
  BookOpen, 
  Building2, 
  Video, 
  Newspaper,
  Shield,
  Layers,
  Plus
} from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { OpenSidebar } from '~/components/Chat/Menus';
import type { ContextType } from '~/common';
import TrainingDashboard from '~/components/Training/TrainingDashboard';
import RutaAprendizajeDashboard from '~/components/RutaAprendizaje/RutaAprendizajeDashboard';
import EventsMeetDashboard from '~/components/EventsMeet/EventsMeetDashboard';
import BlogDashboard from '~/components/Blog/BlogDashboard';

export type AcademiaTab = 'cursos' | 'rutas' | 'meet' | 'blog';

export default function AcademiaDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthContext();
  const ADMIN_EMAILS = ['cristhian@mauricioposadac.com', 'mauricioposadac@gmail.com', 'felix.bedoya15@gmail.com'];
  const isAdmin = user?.role === 'ADMIN' || (!!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
  const isProOrAdmin = isAdmin || user?.role === 'USER_PRO' || user?.role === 'USER_CUSTOM' || Boolean(user?.isSubUser);
  const outletContext = useOutletContext<ContextType>();
  const navVisible = outletContext?.navVisible ?? true;
  const setNavVisible = outletContext?.setNavVisible ?? (() => {});

  const getInitialTab = (): AcademiaTab => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'rutas' || tabParam === 'empresa') return 'rutas';
    if (tabParam === 'meet' || tabParam === 'envivo' || tabParam === 'clases') return 'meet';
    if (tabParam === 'blog' || tabParam === 'articulos') return 'blog';
    if (tabParam === 'cursos' || tabParam === 'aula') return 'cursos';

    if (location.pathname.startsWith('/ruta-aprendizaje')) return 'rutas';
    if (location.pathname.startsWith('/events-meet')) return 'meet';
    if (location.pathname.startsWith('/blog')) return 'blog';
    if (location.pathname.startsWith('/training')) return 'cursos';
    return 'cursos';
  };

  const [activeTab, setActiveTab] = useState<AcademiaTab>(getInitialTab);
  const canManageCurrentTab = activeTab === 'rutas' ? isProOrAdmin : isAdmin;

  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [location.pathname, searchParams]);

  const handleTabChange = (tab: AcademiaTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const getAdminPath = () => {
    switch (activeTab) {
      case 'cursos':
        return '/training/admin';
      case 'rutas':
        return '/ruta-aprendizaje/admin';
      case 'meet':
        return '/events-meet/admin';
      case 'blog':
        return '/blog/admin';
      default:
        return '/training/admin';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen h-auto bg-surface-primary relative overflow-x-hidden">
      {/* Master Top Header: Ultra-translucent & Crystal Clear Glassmorphism Overlay */}
      <header className="absolute top-0 left-0 right-0 z-50 bg-transparent px-4 sm:px-6 pt-4 sm:pt-5 pb-3 transition-all duration-300 pointer-events-none">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pointer-events-auto">
          
          {/* Header Left: Badge, Title & Subtitle con máxima transparencia */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              {!navVisible && (
                <div className="hidden md:block mr-1">
                  <OpenSidebar setNavVisible={setNavVisible} />
                </div>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-black/25 text-emerald-400 border border-emerald-400/25 backdrop-blur-md uppercase tracking-wider shadow-sm">
                <Layers className="w-3 h-3 text-emerald-400" />
                Módulo de Formación & Conocimiento
              </span>
            </div>
            
            <h1 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2.5 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] tracking-tight">
              <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 shrink-0 filter drop-shadow" />
              Academia WAPPY
            </h1>
            <p className="text-xs text-white/80 mt-0.5 hidden sm:block font-medium drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              Centro integral de capacitación continua, rutas corporativas, eventos sincrónicos y blog técnico.
            </p>
          </div>

          {/* Header Right: Master Tabs Selector Ultra-Translúcido + Admin Button */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full lg:w-auto">
            {/* Master Tabs Container */}
            <div className="flex items-center bg-black/30 backdrop-blur-md p-1 rounded-2xl border border-white/15 shrink-0 w-full sm:w-auto overflow-x-auto no-scrollbar shadow-lg">
              <button
                onClick={() => handleTabChange('cursos')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  activeTab === 'cursos'
                    ? 'bg-white/20 text-white shadow border border-white/25 backdrop-blur-md'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cursos Abiertos</span>
              </button>

              <button
                onClick={() => handleTabChange('rutas')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  activeTab === 'rutas'
                    ? 'bg-white/20 text-white shadow border border-white/25 backdrop-blur-md'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-teal-300" />
                <span>Plan Empresa</span>
              </button>

              <button
                onClick={() => handleTabChange('meet')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  activeTab === 'meet'
                    ? 'bg-white/20 text-white shadow border border-white/25 backdrop-blur-md'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-purple-300" />
                <span>Clases en Vivo</span>
              </button>

              <button
                onClick={() => handleTabChange('blog')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  activeTab === 'blog'
                    ? 'bg-white/20 text-white shadow border border-white/25 backdrop-blur-md'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5 text-indigo-300" />
                <span>Artículos & Blog</span>
              </button>
            </div>

            {/* Administrar / Crear Curso / Iniciar Sesión Button */}
            {canManageCurrentTab ? (
              <div className="flex items-center gap-2 shrink-0">
                {activeTab === 'rutas' && (
                  <button
                    onClick={() => navigate('/ruta-aprendizaje/admin/courses/new')}
                    className="group flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-2xl transition-all duration-200 shadow-lg cursor-pointer shrink-0 text-xs font-bold uppercase tracking-wider"
                    title="Crear un nuevo curso o ruta de aprendizaje"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear Curso</span>
                  </button>
                )}
                <button
                  onClick={() => navigate(getAdminPath())}
                  className="group flex items-center justify-center gap-2 bg-black/30 hover:bg-black/50 backdrop-blur-md px-3.5 py-2 border border-white/20 text-white hover:border-emerald-400/40 rounded-2xl transition-all duration-200 shadow-lg cursor-pointer shrink-0 text-xs font-bold uppercase tracking-wider"
                  title="Administrar sección actual"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Administrar</span>
                </button>
              </div>
            ) : !user ? (
              <button
                onClick={() => navigate('/login')}
                className="bg-emerald-500/80 hover:bg-emerald-600 backdrop-blur-md text-white px-4 py-2 rounded-2xl transition-all duration-200 font-bold text-xs uppercase tracking-wider shadow-lg shrink-0"
              >
                Iniciar Sesión
              </button>
            ) : null}
          </div>

        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 flex flex-col relative">
        {activeTab === 'cursos' && (
          <div className="flex-1 animate-in fade-in duration-200">
            <TrainingDashboard hideFloatingHeader={true} />
          </div>
        )}
        {activeTab === 'rutas' && (
          <div className="flex-1 animate-in fade-in duration-200">
            <RutaAprendizajeDashboard hideFloatingHeader={true} />
          </div>
        )}
        {activeTab === 'meet' && (
          <div className="flex-1 animate-in fade-in duration-200">
            <EventsMeetDashboard hideFloatingHeader={true} />
          </div>
        )}
        {activeTab === 'blog' && (
          <div className="flex-1 animate-in fade-in duration-200">
            <BlogDashboard hideFloatingHeader={true} />
          </div>
        )}
      </main>
    </div>
  );
}
