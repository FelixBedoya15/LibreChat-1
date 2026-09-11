import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  Activity,
  Users,
  QrCode,
  Sparkles,
  Plus,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Download,
  RefreshCw,
  Eye,
  Camera,
  Layers,
} from 'lucide-react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import SGSSTToolbar from './SGSSTToolbar';
import CollapsibleReportBox from './CollapsibleReportBox';
import { QRCodeSVG } from 'qrcode.react';
import cn from '~/utils/cn';

interface EPTStudy {
  _id?: string;
  companyId: string;
  workerId: string;
  workerName: string;
  cargo: string;
  actividad?: string;
  evaluationType?: 'auto' | 'asistida';
  evaluatorName?: string;
  rulaScore?: number;
  rebaScore?: number;
  actionLevel?: string;
  riskLevel?: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  reportHtml?: string;
  telemetry?: any;
  evidences?: Array<{ phase: number; label: string; url: string; telemetry?: any }>;
  createdAt?: string;
}

interface WorkerSimple {
  id?: string;
  nombre: string;
  identificacion: string;
  cargo: string;
}

const RISK_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Crítico: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-800' },
  Alto: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800' },
  Medio: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-800' },
  Bajo: { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-800' },
};

export default function EstudioPuestoTrabajo() {
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  // Selected AI Model (defaults to Gemini 3.7 Flash, synchronized with platform)
  const [selectedModel, setSelectedModel] = useState<string>(
    user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash'
  );

  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('');
  const [studies, setStudies] = useState<EPTStudy[]>([]);
  const [kpis, setKpis] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    criticalPct: 0,
    highPct: 0,
    mediumPct: 0,
    lowPct: 0,
  });

  const [availableWorkers, setAvailableWorkers] = useState<WorkerSimple[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Editor and Report state
  const [activeReportHtml, setActiveReportHtml] = useState<string>('');
  const [selectedStudy, setSelectedStudy] = useState<EPTStudy | null>(null);
  const liveEditorRef = useRef<LiveEditorHandle>(null);
  const editorContentRef = useRef<string>('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // QR Modal State
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);

  // New Study Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [newStudyForm, setNewStudyForm] = useState({
    workerName: '',
    workerId: '',
    cargo: '',
    actividad: '',
    evaluationType: 'auto' as 'auto' | 'asistida',
    evaluatorName: '',
    riskLevel: 'Bajo' as 'Bajo' | 'Medio' | 'Alto' | 'Crítico',
    rulaScore: 3,
    rebaScore: 3,
  });

  // Load Active Company Info
  const loadCompanyInfo = async () => {
    try {
      const res = await fetch('/api/sgsst/company-info/active');
      if (res.ok) {
        const data = await res.json();
        const comp = data.companyInfo || data;
        setCompanyInfo(comp);
        if (comp._id) {
          setActiveCompanyId(comp._id);
        }
      }
    } catch (err) {
      console.warn('[EPT] Error fetching active company:', err);
    }
  };

  // Load Studies and KPIs
  const loadStudies = async (cid: string) => {
    if (!cid) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sgsst/estudio-puesto/company/${cid}`);
      if (res.ok) {
        const data = await res.json();
        setStudies(data.studies || []);
        if (data.kpis) setKpis(data.kpis);
      }
    } catch (err) {
      console.error('[EPT] Error loading studies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load registered workers for autocomplete
  const loadWorkers = async (cid: string) => {
    if (!cid) return;
    try {
      const res = await fetch(`/api/sgsst/estudio-puesto/workers/${cid}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableWorkers(data.workers || []);
      }
    } catch (err) {
      console.warn('[EPT] Error loading workers for autocomplete:', err);
    }
  };

  useEffect(() => {
    loadCompanyInfo();
  }, []);

  useEffect(() => {
    if (activeCompanyId) {
      loadStudies(activeCompanyId);
      loadWorkers(activeCompanyId);
    }
  }, [activeCompanyId]);

  // Filtered studies
  const filteredStudies = useMemo(() => {
    return studies.filter((s) => {
      const matchSearch =
        !searchTerm ||
        s.workerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.workerId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.cargo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.actividad?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchFilter = filterRisk === 'all' || s.riskLevel === filterRisk;
      return matchSearch && matchFilter;
    });
  }, [studies, searchTerm, filterRisk]);

  // Handle selecting a study to view in LiveEditor
  const handleSelectStudyToView = (study: EPTStudy) => {
    setSelectedStudy(study);
    const html = study.reportHtml || '';
    setActiveReportHtml(html);
    editorContentRef.current = html;
    liveEditorRef.current?.setHTML(html);

    // Smooth scroll down to the Live Editor
    setTimeout(() => {
      const el = document.getElementById('ept-live-editor-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  // Autocomplete selection for worker
  const handleSelectWorkerFromList = (doc: string) => {
    const found = availableWorkers.find((w) => String(w.identificacion).trim() === doc.trim());
    if (found) {
      setNewStudyForm((prev) => ({
        ...prev,
        workerName: found.nombre,
        workerId: found.identificacion,
        cargo: found.cargo || prev.cargo,
      }));
    }
  };

  // Generate Report with selected AI model
  const handleGenerateAiReport = async () => {
    if (!newStudyForm.workerName || !newStudyForm.workerId || !newStudyForm.cargo) {
      showToast({ message: 'Por favor completa Nombre, Cédula y Cargo.', status: 'warning' });
      return;
    }

    setIsGeneratingAi(true);
    try {
      const payload = {
        companyId: activeCompanyId,
        workerName: newStudyForm.workerName,
        workerId: newStudyForm.workerId,
        cargo: newStudyForm.cargo,
        actividad: newStudyForm.actividad || 'Evaluación dimensional de puesto y postura',
        evaluationType: newStudyForm.evaluationType,
        evaluatorName: newStudyForm.evaluatorName || (newStudyForm.evaluationType === 'auto' ? 'Auto-reporte asistido por WAPPY Fisio IA' : user?.name),
        riskLevel: newStudyForm.riskLevel,
        rulaScore: newStudyForm.rulaScore,
        rebaScore: newStudyForm.rebaScore,
        actionLevel: newStudyForm.riskLevel === 'Crítico' ? 'Nivel 4 - Acción Inmediata' : newStudyForm.riskLevel === 'Alto' ? 'Nivel 3 - Acción Pronta' : newStudyForm.riskLevel === 'Medio' ? 'Nivel 2 - Requiere Investigación' : 'Nivel 1 - Aceptable',
        model: selectedModel,
      };

      // 1. Guardar primero el registro en la base de datos
      const saveRes = await fetch('/api/sgsst/estudio-puesto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!saveRes.ok) throw new Error('Error al guardar registro inicial');
      const savedData = await saveRes.json();
      const savedStudyId = savedData.study?._id;

      // 2. Generar el informe técnico con el modelo Gemini seleccionado
      const genRes = await fetch('/api/sgsst/estudio-puesto/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, studyId: savedStudyId }),
      });

      if (!genRes.ok) throw new Error('Error al compilar informe con IA');
      const genData = await genRes.json();

      const finalHtml = genData.reportHtml || '';
      setActiveReportHtml(finalHtml);
      editorContentRef.current = finalHtml;
      liveEditorRef.current?.setHTML(finalHtml);

      showToast({ message: '¡Estudio de Puesto generado y vinculado al colaborador!', status: 'success' });
      setShowNewModal(false);
      loadStudies(activeCompanyId);
      loadWorkers(activeCompanyId);

      // Scroll to editor
      setTimeout(() => {
        const el = document.getElementById('ept-live-editor-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err: any) {
      console.error('[EPT] AI generation error:', err);
      showToast({ message: err.message || 'Error al generar estudio.', status: 'error' });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Delete study
  const handleDeleteStudy = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este estudio técnico?')) return;
    try {
      const res = await fetch(`/api/sgsst/estudio-puesto/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast({ message: 'Estudio eliminado correctamente', status: 'success' });
        loadStudies(activeCompanyId);
      }
    } catch (err) {
      console.error('[EPT] Delete error:', err);
    }
  };

  // QR Public Link
  const publicQrLink = `${window.location.origin}/sgsst-public/estudio-puesto/${activeCompanyId}`;

  const copyQrLink = () => {
    navigator.clipboard.writeText(publicQrLink);
    setQrCopied(true);
    setTimeout(() => setQrCopied(false), 2000);
    showToast({ message: 'Enlace copiado al portapapeles', status: 'success' });
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 p-4 md:p-6 space-y-6">
      {/* ─── TOOLBAR SUPERIOR ESTÁNDAR ───────────────────────────────────── */}
      <SGSSTToolbar
        activeModule="estudio_puesto"
        moduleTitle="Estudios de Puesto de Trabajo (EPT Fisio IA)"
        companyInfo={companyInfo}
        onCompanyChange={(newComp) => {
          setCompanyInfo(newComp);
          if (newComp?._id) setActiveCompanyId(newComp._id);
        }}
        rightContent={
          <div className="flex items-center gap-2">
            <ModelSelector
              selectedModel={selectedModel}
              onSelectModel={(m) => setSelectedModel(m)}
            />
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-bold hover:bg-teal-100 transition-all shadow-sm"
              title="Generar código QR de Auto-evaluación para trabajadores"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">QR Trabajadores</span>
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo EPT</span>
            </button>
          </div>
        }
      />

      {/* ─── TARJETAS DE KPIS ERGONÓMICOS Y BIOMECÁNICOS ──────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Total EPTs */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Estudios</span>
            <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{kpis.total}</span>
            <span className="text-[11px] text-slate-500 ml-2 font-medium">expedientes</span>
          </div>
        </div>

        {/* Riesgo Crítico (Nivel 4) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-950/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-600 dark:text-red-400">
            <span className="text-xs font-bold uppercase tracking-wider">Riesgo Crítico</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-red-600 dark:text-red-400">{kpis.critical}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
              {kpis.criticalPct}%
            </span>
          </div>
        </div>

        {/* Riesgo Alto (Nivel 3) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-950/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-xs font-bold uppercase tracking-wider">Riesgo Alto</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{kpis.high}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
              {kpis.highPct}%
            </span>
          </div>
        </div>

        {/* Riesgo Medio (Nivel 2) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-950/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
            <span className="text-xs font-bold uppercase tracking-wider">Riesgo Medio</span>
            <Layers className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{kpis.medium}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {kpis.mediumPct}%
            </span>
          </div>
        </div>

        {/* Conforme / Aceptable (Nivel 1) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-teal-200 dark:border-teal-950/60 shadow-sm flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-teal-600 dark:text-teal-400">
            <span className="text-xs font-bold uppercase tracking-wider">Aceptable</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">{kpis.low}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
              {kpis.lowPct}%
            </span>
          </div>
        </div>
      </div>

      {/* ─── DIRECTORIO DE ESTUDIOS Y TRABAJADORES ──────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Cabecera de búsqueda y filtros */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por trabajador, cédula o cargo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl text-[11px] font-semibold">
              <button
                onClick={() => setFilterRisk('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition-all',
                  filterRisk === 'all'
                    ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400'
                )}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterRisk('Crítico')}
                className={cn(
                  'px-2 py-1 rounded-lg transition-all',
                  filterRisk === 'Crítico'
                    ? 'bg-red-500 text-white font-bold'
                    : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                )}
              >
                Crítico
              </button>
              <button
                onClick={() => setFilterRisk('Alto')}
                className={cn(
                  'px-2 py-1 rounded-lg transition-all',
                  filterRisk === 'Alto'
                    ? 'bg-amber-500 text-white font-bold'
                    : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                )}
              >
                Alto
              </button>
              <button
                onClick={() => setFilterRisk('Bajo')}
                className={cn(
                  'px-2 py-1 rounded-lg transition-all',
                  filterRisk === 'Bajo'
                    ? 'bg-teal-500 text-white font-bold'
                    : 'text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30'
                )}
              >
                Bajo
              </button>
            </div>

            <button
              onClick={() => loadStudies(activeCompanyId)}
              className="p-2 text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 transition-all rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800"
              title="Recargar estudios"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabla responsive de estudios */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-zinc-800">
                <th className="py-3 px-4">Trabajador / Cédula</th>
                <th className="py-3 px-4">Cargo & Actividad</th>
                <th className="py-3 px-4">Modalidad</th>
                <th className="py-3 px-4 text-center">Riesgo / Nivel</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-600" />
                    Cargando estudios de puesto de trabajo...
                  </td>
                </tr>
              ) : filteredStudies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <Activity className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="font-semibold">No se encontraron estudios ergonómicos registrados.</p>
                    <p className="text-[11px] mt-1">
                      Crea un nuevo estudio con el botón superior o comparte el código QR con tus colaboradores.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredStudies.map((s) => {
                  const badge = RISK_BADGES[s.riskLevel || 'Bajo'] || RISK_BADGES.Bajo;
                  const isAuto = s.evaluationType === 'auto';
                  const dateFormatted = s.createdAt
                    ? new Date(s.createdAt).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Reciente';

                  return (
                    <tr
                      key={s._id}
                      className="hover:bg-teal-50/40 dark:hover:bg-zinc-800/40 transition-colors group"
                    >
                      {/* Trabajador */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{s.workerName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                          C.C. {s.workerId}
                        </div>
                      </td>

                      {/* Cargo y Actividad */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-teal-700 dark:text-teal-400 truncate">
                          {s.cargo}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate" title={s.actividad}>
                          {s.actividad || 'Evaluación dimensional de puesto'}
                        </div>
                      </td>

                      {/* Modalidad */}
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1',
                            isAuto
                              ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          )}
                        >
                          {isAuto ? 'Auto-evaluación' : 'Asistida (SST)'}
                        </span>
                      </td>

                      {/* Nivel de Riesgo */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            'px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-block',
                            badge.bg,
                            badge.text,
                            badge.border
                          )}
                        >
                          {s.riskLevel || 'Bajo'}
                        </span>
                        {s.actionLevel && (
                          <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[120px] mx-auto">
                            {s.actionLevel.split('-')[0]}
                          </div>
                        )}
                      </td>

                      {/* Fecha */}
                      <td className="py-3 px-4 text-slate-500 dark:text-zinc-400 text-[11px] whitespace-nowrap">
                        {dateFormatted}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSelectStudyToView(s)}
                            className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-300 hover:bg-teal-100 transition-colors"
                            title="Ver y editar informe en Live Editor"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudy(s._id!)}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-600 transition-colors"
                            title="Eliminar estudio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── LIVE EDITOR DEL INFORME TÉCNICO OFICIAL ──────────────────────── */}
      <div id="ept-live-editor-section" className="space-y-3">
        <CollapsibleReportBox
          title={
            selectedStudy
              ? `Informe EPT: ${selectedStudy.workerName} (${selectedStudy.cargo})`
              : 'Informe Técnico Oficial de Evaluación de Puesto de Trabajo'
          }
          defaultOpen={true}
          actions={
            <ExportDropdown
              content={editorContentRef.current || activeReportHtml || ''}
              fileName={`Informe_EPT_${selectedStudy?.workerName?.replace(/\s+/g, '_') || 'General'}`}
              reportType="general"
            />
          }
        >
          <div className="w-full min-w-0 bg-white dark:bg-zinc-900 rounded-xl overflow-hidden">
            <LiveEditor
              ref={liveEditorRef}
              paperMode={true}
              initialContent={activeReportHtml || ''}
              onUpdate={(html) => {
                editorContentRef.current = html;
              }}
            />
          </div>
        </CollapsibleReportBox>
      </div>

      {/* ─── MODAL: NUEVO ESTUDIO DE PUESTO (MANUAL / ASISTIDO POR IA) ────── */}
      {showNewModal &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => !isGeneratingAi && setShowNewModal(false)}
          >
            <div
              className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-teal-50/50 dark:bg-teal-950/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-md">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Nuevo Estudio de Puesto de Trabajo (EPT)
                    </h3>
                    <p className="text-[10px] text-teal-700 dark:text-teal-400 font-semibold">
                      Fisioterapeuta Laboral IA - {selectedModel}
                    </p>
                  </div>
                </div>
                <button
                  disabled={isGeneratingAi}
                  onClick={() => setShowNewModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-sm font-bold p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
                {/* Autocomplete sugerido de trabajadores existentes */}
                {availableWorkers.length > 0 && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Cargar colaborador de la empresa (Opcional)
                    </label>
                    <select
                      onChange={(e) => handleSelectWorkerFromList(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="">Selecciona un trabajador registrado...</option>
                      {availableWorkers.map((w) => (
                        <option key={w.identificacion} value={w.identificacion}>
                          {w.nombre} (C.C. {w.identificacion}) - {w.cargo || 'Sin cargo'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Juan Carlos Gómez"
                      value={newStudyForm.workerName}
                      onChange={(e) => setNewStudyForm({ ...newStudyForm, workerName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Cédula / Documento *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 1020304050"
                      value={newStudyForm.workerId}
                      onChange={(e) => setNewStudyForm({ ...newStudyForm, workerId: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Cargo / Puesto *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Analista de Operaciones"
                      value={newStudyForm.cargo}
                      onChange={(e) => setNewStudyForm({ ...newStudyForm, cargo: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Modalidad
                    </label>
                    <select
                      value={newStudyForm.evaluationType}
                      onChange={(e) =>
                        setNewStudyForm({ ...newStudyForm, evaluationType: e.target.value as any })
                      }
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="auto">Auto-evaluación en línea</option>
                      <option value="asistida">Evaluación Asistida (Inspector SST)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Descripción de la Actividad Evaluada *
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej: Digitación continua en doble monitor, atención telefónica con diadema y archivo físico ocasional..."
                    value={newStudyForm.actividad}
                    onChange={(e) => setNewStudyForm({ ...newStudyForm, actividad: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Nivel de Riesgo Global
                    </label>
                    <select
                      value={newStudyForm.riskLevel}
                      onChange={(e) =>
                        setNewStudyForm({ ...newStudyForm, riskLevel: e.target.value as any })
                      }
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      <option value="Bajo">Bajo (Nivel 1 - Aceptable)</option>
                      <option value="Medio">Medio (Nivel 2 - Requiere Investigación)</option>
                      <option value="Alto">Alto (Nivel 3 - Acción Pronta)</option>
                      <option value="Crítico">Crítico (Nivel 4 - Acción Inmediata)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Evaluador / Registrado por
                    </label>
                    <input
                      type="text"
                      placeholder={
                        newStudyForm.evaluationType === 'auto'
                          ? 'Auto-reporte asistido por WAPPY Fisio IA'
                          : user?.name || 'Inspector SG-SST'
                      }
                      value={newStudyForm.evaluatorName}
                      onChange={(e) => setNewStudyForm({ ...newStudyForm, evaluatorName: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Nota informativa de sincronización */}
                <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-[11px] text-teal-800 dark:text-teal-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <span>
                    Si la cédula no existe previamente en la empresa, el sistema auto-registrará al
                    trabajador en el <strong>Perfil Sociodemográfico</strong> vinculando su historial ergonómico.
                  </span>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-800/60 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isGeneratingAi}
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isGeneratingAi}
                  onClick={handleGenerateAiReport}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white font-bold text-xs shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {isGeneratingAi ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Compilando con {selectedModel}...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generar Informe Oficial con IA</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ─── MODAL: CÓDIGO QR DE AUTO-EVALUACIÓN EN LÍNEA ────────────────── */}
      {showQrModal &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setShowQrModal(false)}
          >
            <div
              className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col items-center p-6 text-center animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3 shadow-inner">
                <QrCode className="w-6 h-6" />
              </div>

              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Auto-evaluación Ergonómica
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xs">
                Comparte este código o enlace con los colaboradores para que se auto-evalúen en su puesto de trabajo.
              </p>

              {/* QR Code Container */}
              <div className="my-5 p-4 bg-white rounded-2xl shadow-md border border-slate-200">
                <QRCodeSVG value={publicQrLink} size={180} level="M" />
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={copyQrLink}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  {qrCopied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                  <span>{qrCopied ? '¡Enlace Copiado!' : 'Copiar Enlace de Auto-evaluación'}</span>
                </button>

                <button
                  onClick={() => setShowQrModal(false)}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
