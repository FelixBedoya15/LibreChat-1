import React, { useState, useEffect, useRef } from 'react';
import { 
  Eye, 
  Code2, 
  Download, 
  Play, 
  Split, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Cpu, 
  Plus,
  Lock,
  Maximize,
  Minimize
} from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { PREMIUM_SST_COMPONENTS } from './sstTemplates';

interface CanvasHtmlEditorProps {
  initialContent: string;
  onUpdate: (content: string) => void;
  title: string;
  isMaximized?: boolean;
  onRegisterDownload?: (fn: () => void) => void;
}

const renderIcon = (type: string, colorClass: string) => {
  switch (type) {
    case 'Cpu':
      return <Cpu className={`h-4 w-4 ${colorClass}`} />;
    case 'Layers':
      return <Layers className={`h-4 w-4 ${colorClass}`} />;
    case 'Plus':
      return <Plus className={`h-4 w-4 ${colorClass}`} />;
    case 'Eye':
      return <Eye className={`h-4 w-4 ${colorClass}`} />;
    case 'Sparkles':
      return <Sparkles className={`h-4 w-4 ${colorClass}`} />;
    default:
      return <Cpu className={`h-4 w-4 ${colorClass}`} />;
  }
};


const CanvasHtmlEditor: React.FC<CanvasHtmlEditorProps> = ({ 
  initialContent, 
  onUpdate, 
  title, 
  isMaximized = false, 
  onRegisterDownload 
}) => {
  const { user } = useAuthContext();
  const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO';
  const [code, setCode] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'split' | 'code' | 'preview'>(isMaximized ? 'split' : 'preview');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = iframeContainerRef.current || containerRef.current;
    if (!document.fullscreenElement) {
      try {
        if (el?.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as any).webkitRequestFullscreen) {
          await (el as any).webkitRequestFullscreen();
        }
      } catch (err) {
        console.error('Fullscreen request failed:', err);
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      } catch (err) {
        console.error('Exit fullscreen failed:', err);
      }
    }
  };

  // Safely fallback activeTab to "preview" if not maximized or on mobile screen and currently in "split"
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 640;
      if ((!isMaximized || isMobile) && activeTab === 'split') {
        setActiveTab('preview');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMaximized, activeTab]);

  // Load content with Tailwind CDN included by default for instant premium styling
  useEffect(() => {
    if (initialContent) {
      setCode(initialContent);
    } else {
      setCode(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Plantilla Informativa SST</title>
  <!-- Tailwind CSS CDN for premium utility styling -->
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      background: linear-gradient(135deg, #0f172a 0%, #020617 100%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: .9; transform: scale(0.99); }
    }
  </style>
</head>
<body class="p-6 sm:p-12">
  <div class="max-w-xl text-center bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-md shadow-2xl">
    <div class="w-16 h-16 mx-auto rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(20,184,166,0.15)]">
      <svg class="w-8 h-8 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
      </svg>
    </div>
    <h1 class="text-2xl font-black bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-3">
      Prototipo de Código WAPPY
    </h1>
    <p class="text-xs text-slate-400 leading-relaxed mb-6">
      Bienvenido al sandbox interactivo de prototipos en HTML. Inserta componentes premium de SST desde la barra lateral izquierda y observa cómo cobran vida en tiempo real en la vista previa.
    </p>
    <div class="inline-flex gap-2">
      <span class="h-2 w-2 rounded-full bg-teal-500 animate-ping"></span>
      <span class="text-[10px] text-teal-400 font-bold uppercase tracking-widest">Listo para Inyectar</span>
    </div>
  </div>
</body>
</html>`);
    }
  }, [initialContent]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCode(val);
    onUpdate(val);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'canvas-preview'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (onRegisterDownload) {
      onRegisterDownload(handleDownloadHtml);
    }
  }, [onRegisterDownload, code, title]);

  const showSidebar = isMaximized && sidebarOpen;

  return (
    <div ref={containerRef} className="flex-1 h-full flex overflow-hidden relative bg-surface-primary border border-border-medium rounded-2xl shadow-sm">
      
      {/* Mobile Sidebar Backdrop Overlay */}
      {isMaximized && sidebarOpen && (
        <div 
          className="sm:hidden absolute inset-0 bg-black/30 backdrop-blur-[2px] z-[440] transition-opacity duration-300 animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Left Column: SST Component Library Sidebar */}
      {isMaximized && (
        <div 
          className={`flex-shrink-0 border-r border-border-medium bg-surface-secondary flex flex-col transition-all duration-300 absolute inset-y-0 left-0 z-[450] sm:relative sm:z-0 ${
            sidebarOpen ? 'w-[280px] sm:w-[320px]' : 'w-0 overflow-hidden border-r-0'
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-border-medium flex items-center justify-between shrink-0 bg-surface-primary">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-teal-600 animate-pulse" />
              <span className="text-sm font-bold bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent">Biblioteca SST</span>
            </div>
            <span className="text-[10px] bg-teal-500/10 text-teal-600 px-2 py-0.5 rounded-full font-bold">HTML5</span>
          </div>

          {/* scrolling list of codes to insert */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider px-1 mb-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-yellow-500" />
              Aplicativos Inyectables
            </div>
            
            <div className="space-y-3">
              {PREMIUM_SST_COMPONENTS.map((comp) => (
                <button
                  key={comp.id}
                  onClick={() => {
                    if (!isPro) {
                      alert('Este aplicativo premium es exclusivo para usuarios Pro de Wappy. Por favor actualice su suscripción.');
                      return;
                    }
                    if (code && code.trim() !== '' && !code.includes('Prototipo de Código WAPPY')) {
                      if (!window.confirm(`¿Deseas reemplazar el código actual por el aplicativo "${comp.title}"? Se perderán las modificaciones no guardadas.`)) {
                        return;
                      }
                    }
                    setCode(comp.code);
                    onUpdate(comp.code);
                  }}
                  className="w-full text-left rounded-xl border border-border-medium/60 p-3 bg-surface-primary hover:border-teal-500/40 hover:shadow-md hover:shadow-teal-500/5 transition-all duration-300 group flex items-start gap-2.5 cursor-pointer animate-in fade-in duration-200"
                >
                  <div className="h-8 w-8 rounded-lg bg-surface-secondary flex items-center justify-center border border-border-medium/40 shrink-0 group-hover:scale-105 transition-transform">
                    {renderIcon(comp.iconType, comp.color)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-text-primary group-hover:text-teal-600 transition-colors">
                        {comp.title}
                      </h4>
                      {!isPro ? (
                        <span className="flex items-center gap-1 text-[8px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                          <Lock className="h-2 w-2" />
                          PRO
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-teal-500 bg-teal-500/5 px-1 py-0.2 rounded border border-teal-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          + Insertar
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1 leading-snug line-clamp-2">
                      {comp.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Toggle Button for Sidebar - ONLY visible when maximized */}
      {isMaximized && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`absolute top-1/2 -translate-y-1/2 z-[460] h-14 w-5 bg-surface-primary border border-border-medium hover:bg-surface-hover shadow-md rounded-r-lg flex items-center justify-center transition-all duration-300 ${
            sidebarOpen 
              ? 'left-[279px] sm:left-[319px]' 
              : 'left-0 border-l-0'
          }`}
          title={sidebarOpen ? 'Contraer Panel Lateral' : 'Expandir Panel Lateral'}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3.5 w-3.5 text-text-secondary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />
          )}
        </button>
      )}

      {/* Right Column: Code Editor & Iframe Preview Container */}
      <div className="flex-1 flex flex-col h-full bg-surface-primary text-text-primary overflow-hidden">
        {/* Editor Menu & Controls */}
        <div className="flex items-center justify-between p-3 border-b border-border-medium bg-surface-secondary">
          {/* Split/Code/Preview tabs switcher */}
          <div className="flex items-center gap-1 bg-surface-primary border border-border-medium rounded-xl p-1 shadow-sm">
            {isMaximized && (
              <button
                onClick={() => setActiveTab('split')}
                className={`hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 hover:scale-105 hover:-rotate-1 ${
                  activeTab === 'split' ? 'bg-surface-secondary text-text-primary shadow-inner font-extrabold' : 'text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <Split className="h-3.5 w-3.5" />
                <span>Dividido</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 hover:scale-105 hover:-rotate-1 ${
                activeTab === 'code' ? 'bg-surface-secondary text-text-primary shadow-inner font-extrabold' : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Código</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 hover:scale-105 hover:-rotate-1 ${
                activeTab === 'preview' ? 'bg-surface-secondary text-text-primary shadow-inner font-extrabold' : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Vista Previa</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {(activeTab === 'preview' || activeTab === 'split') && (
              <button
                onClick={toggleFullscreen}
                className="group flex flex-shrink-0 items-center justify-center h-10 px-2.5 min-w-[40px] transition-all duration-300 shadow-sm shrink-0 cursor-pointer border outline-none rounded-xl hover:-rotate-3 hover:scale-105 bg-surface-primary border-border-medium hover:bg-surface-hover text-text-primary"
                title={isFullscreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}
              >
                <div className="relative flex-shrink-0 flex items-center justify-center text-text-primary">
                  {isFullscreen ? <Minimize className="h-4 w-4 text-text-primary" /> : <Maximize className="h-4 w-4 text-text-primary" />}
                </div>
                <div className="flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                  <span className="text-sm font-bold tracking-wide text-text-primary">
                    {isFullscreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}
                  </span>
                </div>
              </button>
            )}

            <button
              onClick={handleDownloadHtml}
              className="group flex flex-shrink-0 items-center justify-center h-10 px-2.5 min-w-[40px] transition-all duration-300 shadow-sm shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border outline-none rounded-xl hover:-rotate-3 hover:scale-105 bg-surface-primary border-border-medium hover:bg-surface-hover text-text-primary"
              aria-label="Descargar HTML"
            >
              <div className="relative flex-shrink-0 flex items-center justify-center text-text-primary">
                <Download className="h-4 w-4 text-text-primary" />
              </div>
              <div className="flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                <span className="text-sm font-bold tracking-wide text-text-primary">
                  Descargar HTML
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Main Workspace splits */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side: Code Editor */}
          {(activeTab === 'split' || activeTab === 'code') && (
            <div className="flex-1 h-full relative border-r border-border-medium">
              <textarea
                ref={textareaRef}
                value={code}
                onChange={handleCodeChange}
                className="w-full h-full p-4 font-mono text-xs bg-slate-950 text-slate-200 resize-none outline-none leading-relaxed overflow-auto scrollbar-thin"
                spellCheck="false"
                placeholder="Introduce tu código HTML/CSS/JS aquí..."
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold bg-slate-900 border border-slate-800 text-slate-400 rounded-lg shadow select-none">
                <Play className="h-3 w-3 text-emerald-400 animate-pulse" />
                <span>Auto-refreshing</span>
              </div>
            </div>
          )}

          {/* Right Side: Iframe Live Preview */}
          {(activeTab === 'split' || activeTab === 'preview') && (
            <div ref={iframeContainerRef} className="flex-1 h-full bg-white relative">
              <iframe
                title="Canvas Live View"
                className="w-full h-full border-none bg-white"
                sandbox="allow-scripts allow-modals allow-same-origin allow-forms"
                srcDoc={code}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CanvasHtmlEditor;
