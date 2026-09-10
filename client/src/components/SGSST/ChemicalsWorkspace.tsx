import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuthContext } from '~/hooks';
import { useToastContext } from '@librechat/client';
import { 
  Shield, 
  User, 
  Plus, 
  FileText, 
  Search, 
  Printer, 
  ClipboardList,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  X,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { exportChemicalsToExcel } from './exportChemicals';
import { saveAs } from 'file-saver';
import { SGSSTToolbar } from './SGSSTToolbar';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import CollapsibleReportBox from './CollapsibleReportBox';
import ExportDropdown from './ExportDropdown';
import { UpgradeWall } from './UpgradeWall';

interface ChemicalProduct {
  id: string;
  nombre: string;
  fabricante: string;
  estadoFisico: 'Líquido' | 'Sólido' | 'Gaseoso';
  pictogramasSga: string[];
  claseOnu: string;
  ubicacion: string;
  cantidadAlmacenada: string;
  tieneFds: 'Sí' | 'No';
  tieneRotuloSga: 'Sí' | 'No';
  requisitosAlmacenamiento: string;
  incompatibilidades: string[];
  trabajadoresExpuestos: string[]; // array of workerIds
  observaciones?: string;
}

interface SocioWorker {
  id: string;
  nombre: string;
  identificacion: string;
  cargo: string;
}

export default function ChemicalsWorkspace() {
  const { token, user } = useAuthContext();
  const { showToast } = useToastContext();

  const [chemicals, setChemicals] = useState<ChemicalProduct[]>([]);
  const [workers, setWorkers] = useState<SocioWorker[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ChemicalProduct | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Collapsible states
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(true);
  const [isPictogramsExpanded, setIsPictogramsExpanded] = useState(true);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [isRequirementsExpanded, setIsRequirementsExpanded] = useState(true);

  // AI Report States
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3.7-flash');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const liveEditorRef = useRef<LiveEditorHandle>(null);
  const editorContentRef = useRef<string | null>(null);

  const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);

  const handleGenerate = useCallback(async () => {
    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-chemicals`, { headers: { Authorization: `Bearer ${token}` } });
        if (resCount.ok) {
          const data = await resCount.json();
          if (data.conversations?.length >= 1) {
            setShowUpgradeModal(true);
            return;
          }
        }
      } catch (e) {}
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/sgsst/chemicals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          selectedProduct, 
          chemicals, 
          modelName: selectedModel 
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al generar el informe');
      }
      const data = await response.json();
      setGeneratedReport(data.report);
      editorContentRef.current = data.report;
      liveEditorRef.current?.setHTML(data.report);
      setConversationId(null);
      setReportMessageId(null);
      showToast({ message: 'Informe generado exitosamente', status: 'success' });
    } catch (error: any) {
      showToast({ message: error.message || 'Error al generar informe', status: 'error' });
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProduct, chemicals, selectedModel, token, isPro, conversationId, showToast]);

  const handleSave = useCallback(async () => {
    const contentToSave = editorContentRef.current || generatedReport;
    if (!contentToSave || !token) return;

    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-chemicals`, { headers: { Authorization: `Bearer ${token}` } });
        if (resCount.ok) {
          const data = await resCount.json();
          if (data.conversations?.length >= 1) {
            setShowUpgradeModal(true);
            return;
          }
        }
      } catch (e) {}
    }

    try {
      if (conversationId && conversationId !== 'new' && reportMessageId) {
        const res = await fetch('/api/sgsst/diagnostico/save-report', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ conversationId, messageId: reportMessageId, content: contentToSave }),
        });
        if (res.ok) { 
          setRefreshTrigger(p => p + 1); 
          showToast({ message: 'Informe actualizado exitosamente', status: 'success' }); 
        }
        return;
      }
      const res = await fetch('/api/sgsst/diagnostico/save-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          content: contentToSave,
          title: selectedProduct 
            ? `Informe FDS - ${selectedProduct.nombre} - ${new Date().toLocaleDateString('es-CO')}`
            : `Informe Auditoría Química - ${new Date().toLocaleDateString('es-CO')}`,
          tags: ['sgsst-chemicals'],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversationId(data.conversationId);
        setReportMessageId(data.messageId);
        setRefreshTrigger(p => p + 1);
        showToast({ message: 'Guardado exitosamente', status: 'success' });
      }
    } catch (error: any) {
      showToast({ message: `Error: ${error.message}`, status: 'error' });
    }
  }, [generatedReport, conversationId, reportMessageId, token, isPro, selectedProduct, showToast]);

  const handleSelectReport = useCallback(async (selectedConvoId: string) => {
    if (!selectedConvoId) return;
    try {
      const res = await fetch(`/api/messages/${selectedConvoId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const messages = await res.json();
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.text) {
        setGeneratedReport(lastMsg.text);
        editorContentRef.current = lastMsg.text;
        liveEditorRef.current?.setHTML(lastMsg.text);
        setConversationId(selectedConvoId);
        setReportMessageId(lastMsg.messageId);
        showToast({ message: 'Informe cargado correctamente', status: 'success' });
      }
    } catch (e) {
      showToast({ message: 'Error al cargar el informe', status: 'error' });
    }
    setIsHistoryOpen(false);
  }, [token, showToast]);

  // Form states
  const [formNombre, setFormNombre] = useState('');
  const [formFabricante, setFormFabricante] = useState('');
  const [formEstadoFisico, setFormEstadoFisico] = useState<'Líquido' | 'Sólido' | 'Gaseoso'>('Líquido');
  const [formPictogramas, setFormPictogramas] = useState<string[]>([]);
  const [formClaseOnu, setFormClaseOnu] = useState('');
  const [formUbicacion, setFormUbicacion] = useState('');
  const [formCantidad, setFormCantidad] = useState('');
  const [formTieneFds, setFormTieneFds] = useState<'Sí' | 'No'>('No');
  const [formTieneRotulo, setFormTieneRotulo] = useState<'Sí' | 'No'>('No');
  const [formRequisitos, setFormRequisitos] = useState('');
  const [formIncompatibilidades, setFormIncompatibilidades] = useState<string[]>([]);
  const [formExpuestos, setFormExpuestos] = useState<string[]>([]);
  const [formObservaciones, setFormObservaciones] = useState('');

  // Available SGA Pictograms
  const sgaOptions = [
    { label: '🔥 Inflamable', value: 'Inflamable' },
    { label: '💥 Explosivo', value: 'Explosivo' },
    { label: '🌀 comburente', value: 'Comburente' },
    { label: '💨 Gas Comprimido', value: 'Gas Comprimido' },
    { label: '🧪 Corrosivo', value: 'Corrosivo' },
    { label: '💀 Toxicidad Aguda', value: 'Toxicidad Aguda' },
    { label: '⚠️ Irritación Cutánea', value: 'Irritación' },
    { label: '🧠 Peligro para la Salud', value: 'Peligro Salud' },
    { label: '🐟 Peligro Medio Ambiente', value: 'Medio Ambiente' }
  ];

  // Chemical list for incompatibility checkboxes
  const commonIncompatibilities = [
    'Ácidos fuertes',
    'Bases fuertes',
    'Agentes oxidantes',
    'Agentes reductores',
    'Agua (reacción violenta)',
    'Materiales combustibles',
    'Metales activos'
  ];

  // Fetch initial data
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const wRes = await fetch('/api/sgsst/perfil-sociodemografico/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const wData = await wRes.json();
      setWorkers(wData.trabajadores || []);

      const cRes = await fetch('/api/sgsst/chemicals/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const cData = await cRes.json();
      setChemicals(cData || []);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al cargar inventario químico', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const resetForm = () => {
    setFormNombre('');
    setFormFabricante('');
    setFormEstadoFisico('Líquido');
    setFormPictogramas([]);
    setFormClaseOnu('');
    setFormUbicacion('');
    setFormCantidad('');
    setFormTieneFds('No');
    setFormTieneRotulo('No');
    setFormRequisitos('');
    setFormIncompatibilidades([]);
    setFormExpuestos([]);
    setFormObservaciones('');
  };

  const handleTogglePictograma = (val: string) => {
    if (formPictogramas.includes(val)) {
      setFormPictogramas(formPictogramas.filter(x => x !== val));
    } else {
      setFormPictogramas([...formPictogramas, val]);
    }
  };

  const handleToggleIncompatibility = (val: string) => {
    if (formIncompatibilidades.includes(val)) {
      setFormIncompatibilidades(formIncompatibilidades.filter(x => x !== val));
    } else {
      setFormIncompatibilidades([...formIncompatibilidades, val]);
    }
  };

  const handleToggleWorker = (id: string) => {
    if (formExpuestos.includes(id)) {
      setFormExpuestos(formExpuestos.filter(x => x !== id));
    } else {
      setFormExpuestos([...formExpuestos, id]);
    }
  };

  // Guardar Producto
  const handleSaveProduct = async () => {
    if (!formNombre) {
      showToast({ message: 'El nombre del producto es requerido', status: 'warning' });
      return;
    }

    setLoading(true);

    const newProduct: ChemicalProduct = {
      id: selectedProduct ? selectedProduct.id : crypto.randomUUID(),
      nombre: formNombre,
      fabricante: formFabricante,
      estadoFisico: formEstadoFisico,
      pictogramasSga: formPictogramas,
      claseOnu: formClaseOnu,
      ubicacion: formUbicacion,
      cantidadAlmacenada: formCantidad,
      tieneFds: formTieneFds,
      tieneRotuloSga: formTieneRotulo,
      requisitosAlmacenamiento: formRequisitos,
      incompatibilidades: formIncompatibilidades,
      trabajadoresExpuestos: formExpuestos,
      observaciones: formObservaciones
    };

    let updatedList: ChemicalProduct[] = [];
    if (selectedProduct) {
      updatedList = chemicals.map(p => p.id === selectedProduct.id ? newProduct : p);
    } else {
      updatedList = [...chemicals, newProduct];
    }

    try {
      const res = await fetch('/api/sgsst/chemicals/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ productos: updatedList })
      });
      const data = await res.json();
      if (data.success) {
        showToast({ message: 'Inventario químico actualizado correctamente', status: 'success' });
        setChemicals(data.data);
        setSelectedProduct(newProduct);
        setIsModalOpen(false);
        resetForm();
      } else {
        showToast({ message: data.error || 'Error al guardar producto', status: 'error' });
      }
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al actualizar base de datos química', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    if (!selectedProduct) return;
    setFormNombre(selectedProduct.nombre);
    setFormFabricante(selectedProduct.fabricante);
    setFormEstadoFisico(selectedProduct.estadoFisico);
    setFormPictogramas(selectedProduct.pictogramasSga || []);
    setFormClaseOnu(selectedProduct.claseOnu || '');
    setFormUbicacion(selectedProduct.ubicacion || '');
    setFormCantidad(selectedProduct.cantidadAlmacenada || '');
    setFormTieneFds(selectedProduct.tieneFds);
    setFormTieneRotulo(selectedProduct.tieneRotuloSga);
    setFormRequisitos(selectedProduct.requisitosAlmacenamiento || '');
    setFormIncompatibilidades(selectedProduct.incompatibilidades || []);
    setFormExpuestos(selectedProduct.trabajadoresExpuestos || []);
    setFormObservaciones(selectedProduct.observaciones || '');
    setIsModalOpen(true);
  };

  const handleExportExcel = async () => {
    try {
      showToast({ message: 'Generando reporte de Excel...', status: 'info' });
      await exportChemicalsToExcel(chemicals, workers);
      showToast({ message: 'Inventario Excel generado correctamente', status: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al exportar a Excel', status: 'error' });
    }
  };

  const buildHtmlFicha = (prod: ChemicalProduct) => {
    const sgaBadges = (prod.pictogramasSga || []).map(p => `<span style="background:#f1f5f9; border:1px solid #cbd5e1; padding:4px 8px; border-radius:5px; font-weight:bold; font-size:11px; margin-right:5px; display:inline-block;">${p}</span>`).join('');
    const incompatList = (prod.incompatibilidades || []).map(i => `<li>${i}</li>`).join('') || '<li>Ninguna identificada.</li>';
    
    // Nombres expuestos
    const exposedNames = (prod.trabajadoresExpuestos || []).map(id => {
      const w = workers.find(work => work.id === id);
      return w ? w.nombre : '';
    }).filter(Boolean).map(name => `<li>${name}</li>`).join('') || '<li>Ningún trabajador asignado aún.</li>';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ficha Química SGA — ${prod.nombre}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 40px; font-size: 13px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d9488; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #0f766e; text-align: right; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 15px; border-radius: 10px; }
          .meta-label { font-weight: bold; text-transform: uppercase; font-size: 10px; color: #64748b; margin-bottom: 2px; }
          .section-title { color:#0f766e; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-top:25px; margin-bottom:15px; text-transform:uppercase; font-size:14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Ficha Informativa de Seguridad Química<br><span style="font-size:11px; font-weight:normal; color:#64748b;">SG-SST Decreto 1496 de 2018 (SGA)</span></div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Nombre del Producto</div><strong>${prod.nombre}</strong></div>
          <div class="meta-item"><div class="meta-label">Proveedor / Fabricante</div><strong>${prod.fabricante || 'No registrado'}</strong></div>
          <div class="meta-item"><div class="meta-label">Ubicación / Bodega</div><strong>${prod.ubicacion || 'General'}</strong></div>
          <div class="meta-item"><div class="meta-label">Estado Físico</div><strong>${prod.estadoFisico}</strong></div>
        </div>

        <h3 class="section-title">Clasificación SGA y Peligros</h3>
        <div style="margin-bottom:20px;">
          <div style="font-weight:bold; font-size:10px; color:#64748b; text-transform:uppercase; margin-bottom:5px;">Pictogramas de Peligro Activos:</div>
          ${sgaBadges || '<em>Ninguno seleccionado.</em>'}
        </div>
        <div style="margin-bottom:20px;">
          <strong>Clase ONU:</strong> ${prod.claseOnu || 'N/A'}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:30px;">
          <div>
            <h4 style="margin:0 0 10px 0; color:#0f766e; font-size:12px;">INCOMPATIBILIDADES DE ALMACENAMIENTO</h4>
            <ul>${incompatList}</ul>
          </div>
          <div>
            <h4 style="margin:0 0 10px 0; color:#0f766e; font-size:12px;">PERSONAL EXPUESTO REGISTRADO</h4>
            <ul>${exposedNames}</ul>
          </div>
        </div>

        <h3 class="section-title">Medidas y Requisitos de Almacenamiento</h3>
        <div style="background:#f8fafc; padding:15px; border-radius:10px; font-size:12px; margin-bottom:30px;">
          <strong>Requisitos:</strong> ${prod.requisitosAlmacenamiento || 'Ninguno especificado.'}
        </div>

        <div style="font-size:11px; color:#64748b; border:1px solid #e2e8f0; padding:12px; border-radius:8px;">
          <strong>Nota de Seguridad:</strong> Se confirma que este disolvente/producto químico dispone de su respectiva Ficha de Datos de Seguridad (FDS) e inspección de etiquetado SGA en conformidad con el Sistema Globalmente Armonizado.
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintFicha = () => {
    if (!selectedProduct) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let html = buildHtmlFicha(selectedProduct);
    html = html.replace('</body>', `
      <script>
        window.onload = function() { window.focus(); window.print(); }
      </script>
      </body>
    `);

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleDownloadFichaHtml = () => {
    if (!selectedProduct) return;
    const html = buildHtmlFicha(selectedProduct);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `Ficha_Seguridad_SGA_${selectedProduct.nombre.replace(/\s+/g, '_')}.html`);
  };

  const filteredChemicals = chemicals.filter(p => 
    p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.fabricante.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col xl:flex-row h-[780px] w-full border border-border-light dark:border-white/10 rounded-3xl bg-surface-primary shadow-lg overflow-hidden animate-in fade-in duration-200">
      
      {/* SECTOR IZQUIERDO: LISTADO */}
      <div className="w-full xl:w-96 border-r border-border-light dark:border-white/10 flex flex-col bg-surface-secondary/40 shrink-0">
        <div className="p-5 border-b border-border-light dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-teal-500" /> Inventario Químico
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border-medium hover:border-[#0d9488]/40 hover:bg-[#0d9488]/10 text-teal-600 dark:text-teal-400 font-extrabold text-2xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <span className="bg-teal-500/10 text-teal-400 text-xs px-2.5 py-1 rounded-full font-bold">
                {chemicals.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-text-secondary" />
              <input
                type="text"
                placeholder="Buscar químico..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
              />
            </div>
            <button
              onClick={() => { resetForm(); setSelectedProduct(null); setIsModalOpen(true); }}
              className="p-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm transition-colors"
              title="Registrar producto químico"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredChemicals.map(p => {
            const isSelected = selectedProduct?.id === p.id;
            const hasAlert = p.tieneFds === 'No' || p.tieneRotuloSga === 'No';
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedProduct(p);
                  resetForm();
                  setGeneratedReport(null);
                  editorContentRef.current = null;
                  setConversationId(null);
                  setReportMessageId(null);
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all hover:scale-[1.01] ${
                  isSelected 
                    ? 'bg-teal-500/10 border-teal-500 text-teal-400' 
                    : 'bg-surface-primary border-border-light dark:border-white/5 text-text-primary hover:bg-surface-secondary'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="truncate">
                    <p className="font-bold text-sm text-text-primary truncate">{p.nombre}</p>
                    <p className="text-xs text-text-secondary truncate mt-0.5">{p.fabricante || 'Fabricante desconocido'}</p>
                  </div>
                </div>
                {hasAlert && (
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0 ml-2" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTOR DERECHO: DETALLE PRODUCTO */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface-primary">
        {selectedProduct ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-secondary/20">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-text-primary">{selectedProduct.nombre}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-text-secondary">
                  <span>Fabricante: {selectedProduct.fabricante || 'Sin registrar'}</span>
                  <span>•</span>
                  <span>Estado: {selectedProduct.estadoFisico}</span>
                </div>
              </div>

                <SGSSTToolbar
                  onAnalyze={handleGenerate}
                  isAnalyzing={isGenerating}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  exportContent={selectedProduct ? buildHtmlFicha(selectedProduct) : ''}
                  exportFileName={`Ficha_Seguridad_SGA_${selectedProduct.nombre.replace(/\s+/g, '_')}`}
                  persistenceButtons={[
                    {
                      id: 'edit-product',
                      onClick: handleEditClick,
                      label: 'Editar Producto',
                      title: 'Editar datos de este producto químico',
                      icon: Plus,
                      variant: 'ai'
                    }
                  ]}
                  onExportExcel={handleExportExcel}
                />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Checklist FDS & Rotulación */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsChecklistExpanded(!isChecklistExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isChecklistExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Shield className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Ficha de Seguridad y Rotulado SGA</span>
                  </div>
                </button>
                {isChecklistExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 border rounded-xl flex items-center justify-between ${selectedProduct.tieneFds === 'Sí' ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                      <div>
                        <span className="text-3xs uppercase font-bold text-text-secondary">Ficha de Seguridad (FDS)</span>
                        <p className="text-sm font-extrabold text-text-primary">{selectedProduct.tieneFds === 'Sí' ? 'Disponible' : 'Faltante ❌'}</p>
                      </div>
                    </div>
                    <div className={`p-4 border rounded-xl flex items-center justify-between ${selectedProduct.tieneRotuloSga === 'Sí' ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                      <div>
                        <span className="text-3xs uppercase font-bold text-text-secondary">Etiquetado Rótulo SGA</span>
                        <p className="text-sm font-extrabold text-text-primary">{selectedProduct.tieneRotuloSga === 'Sí' ? 'Conforme SGA' : 'Inconforme / Faltante ❌'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pictogramas SGA Activos */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsPictogramsExpanded(!isPictogramsExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isPictogramsExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <span className="font-semibold text-text-primary">Pictogramas GHS de Peligro</span>
                  </div>
                </button>
                {isPictogramsExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.pictogramasSga && selectedProduct.pictogramasSga.length > 0 ? (
                        selectedProduct.pictogramasSga.map((pic, idx) => (
                          <span key={idx} className="bg-surface-secondary border border-border-medium text-text-primary px-3 py-1.5 rounded-xl font-bold text-xs">
                            {pic}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-text-tertiary italic">Sin pictogramas de peligro seleccionados (Sustancia de bajo riesgo).</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Incompatibilidades & Expuestos */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsDetailsExpanded(!isDetailsExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isDetailsExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <ClipboardList className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Incompatibilidades y Trabajadores Expuestos</span>
                  </div>
                </button>
                {isDetailsExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Incompatibilidades */}
                    <div className="p-5 border border-border-light dark:border-white/5 rounded-xl bg-surface-secondary/20 space-y-3">
                      <h3 className="font-extrabold text-sm text-text-primary">Incompatibilidades de Almacenamiento</h3>
                      <ul className="list-disc pl-5 text-xs text-text-secondary space-y-1">
                        {selectedProduct.incompatibilidades && selectedProduct.incompatibilidades.length > 0 ? (
                          selectedProduct.incompatibilidades.map((inc, idx) => <li key={idx}>{inc}</li>)
                        ) : (
                          <li className="italic text-text-tertiary">Ninguna incompatibilidad de mezcla registrada.</li>
                        )}
                      </ul>
                    </div>

                    {/* Expuestos */}
                    <div className="p-5 border border-border-light dark:border-white/5 rounded-xl bg-surface-secondary/20 space-y-3">
                      <h3 className="font-extrabold text-sm text-text-primary">Trabajadores Expuestos</h3>
                      <ul className="list-disc pl-5 text-xs text-text-secondary space-y-1">
                        {selectedProduct.trabajadoresExpuestos && selectedProduct.trabajadoresExpuestos.length > 0 ? (
                          selectedProduct.trabajadoresExpuestos.map(id => {
                            const w = workers.find(work => work.id === id);
                            return w ? <li key={id}>{w.nombre} ({w.cargo || 'Sin cargo'})</li> : null;
                          })
                        ) : (
                          <li className="italic text-text-tertiary">Ningún trabajador registrado con exposición a esta sustancia.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Requisitos */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsRequirementsExpanded(!isRequirementsExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isRequirementsExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <FileText className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Requisitos Especiales de Almacenamiento</span>
                  </div>
                </button>
                {isRequirementsExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                    <div className="p-4 border border-border-light dark:border-white/5 bg-surface-secondary/20 rounded-xl text-xs text-text-secondary leading-relaxed">
                      {selectedProduct.requisitosAlmacenamiento || 'Ninguno especificado en el inventario.'}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-text-tertiary">
            <ClipboardList className="w-16 h-16 mb-4 text-teal-600 opacity-20" />
            <p className="text-sm font-semibold">Seleccione un producto químico de la lista o registre uno nuevo para comenzar.</p>
          </div>
        )}
      </div>
    </div>

      {/* Editor de Informe de Químicos (Nivel Raíz — Siempre Visible a Todo Ancho) */}
      <CollapsibleReportBox
        onSave={handleSave}
        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        isHistoryOpen={isHistoryOpen}
        title="Informe IA - Control de Sustancias Químicas (SGA)"
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <ExportDropdown
            content={editorContentRef.current || generatedReport || ''}
            fileName={selectedProduct ? `Informe_Quimico_${selectedProduct.nombre.replace(/\s+/g, '_')}` : `Informe_Auditoria_Quimica`}
            reportType="general"
          />
        }
      >
        <div className="w-full min-w-0">
          <LiveEditor
            ref={liveEditorRef}
            paperMode={true}
            initialContent={generatedReport}
            onUpdate={(html) => { editorContentRef.current = html; }}
            reportSourceData={{ product: selectedProduct, allProducts: chemicals }}
          />
        </div>
      </CollapsibleReportBox>

      {/* Modal: Registrar/Editar Producto */}
      {isModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface-primary border border-border-light dark:border-white/10 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex justify-between items-center bg-surface-secondary/40">
              <h3 className="text-base font-extrabold text-text-primary flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-500" /> Registrar Sustancia Química (SGA)
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Nombre del Producto *</label>
                  <input type="text" placeholder="Ej. Acetona, Cloro" value={formNombre} onChange={e => setFormNombre(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Fabricante / Proveedor</label>
                  <input type="text" placeholder="Ej. BASF" value={formFabricante} onChange={e => setFormFabricante(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Estado Físico</label>
                  <select value={formEstadoFisico} onChange={e => setFormEstadoFisico(e.target.value as any)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                    <option value="Líquido">Líquido</option>
                    <option value="Sólido">Sólido</option>
                    <option value="Gaseoso">Gaseoso</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Clase Peligro ONU</label>
                  <input type="text" placeholder="Ej. Clase 3" value={formClaseOnu} onChange={e => setFormClaseOnu(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Ubicación Bodega</label>
                  <input type="text" placeholder="Ej. Estante A" value={formUbicacion} onChange={e => setFormUbicacion(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Cantidad en Almacén</label>
                  <input type="text" placeholder="Ej. 10 Galones" value={formCantidad} onChange={e => setFormCantidad(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
              </div>

              {/* FDS & Rotulado */}
              <div className="grid grid-cols-2 gap-4 border-t border-border-light dark:border-white/5 pt-3">
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">¿Tiene FDS (Ficha)?</label>
                  <select value={formTieneFds} onChange={e => setFormTieneFds(e.target.value as any)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                    <option value="Sí">Sí</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">¿Tiene Rótulo SGA?</label>
                  <select value={formTieneRotulo} onChange={e => setFormTieneRotulo(e.target.value as any)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                    <option value="Sí">Sí</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>

              {/* Pictogramas SGA */}
              <div className="space-y-2 border-t border-border-light dark:border-white/5 pt-3">
                <label className="text-2xs uppercase font-bold text-text-secondary block">Pictogramas de Peligro SGA</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {sgaOptions.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 p-2 bg-surface-secondary/50 hover:bg-surface-secondary rounded-lg cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={formPictogramas.includes(opt.value)}
                        onChange={() => handleTogglePictograma(opt.value)}
                        className="rounded border-border-medium text-teal-600 focus:ring-teal-500"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Incompatibilidades */}
              <div className="space-y-2 border-t border-border-light dark:border-white/5 pt-3">
                <label className="text-2xs uppercase font-bold text-text-secondary block">Incompatibilidades químicas de contacto</label>
                <div className="grid grid-cols-2 gap-2">
                  {commonIncompatibilities.map(inc => (
                    <label key={inc} className="flex items-center gap-2 p-2 bg-surface-secondary/50 hover:bg-surface-secondary rounded-lg cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={formIncompatibilidades.includes(inc)}
                        onChange={() => handleToggleIncompatibility(inc)}
                        className="rounded border-border-medium text-teal-600 focus:ring-teal-500"
                      />
                      <span>{inc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Trabajadores Expuestos */}
              <div className="space-y-2 border-t border-border-light dark:border-white/5 pt-3">
                <label className="text-2xs uppercase font-bold text-text-secondary block">Trabajadores Expuestos o Manipuladores</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-border-medium rounded-xl p-3">
                  {workers.map(w => (
                    <label key={w.id} className="flex items-center gap-3 p-1.5 hover:bg-surface-hover/30 rounded-lg cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={formExpuestos.includes(w.id)}
                        onChange={() => handleToggleWorker(w.id)}
                        className="rounded border-border-medium text-teal-600 focus:ring-teal-500"
                      />
                      <span>{w.nombre} ({w.cargo || 'Sin cargo'})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-2xs uppercase font-bold text-text-secondary">Requisitos de Almacenamiento</label>
                <textarea
                  value={formRequisitos}
                  onChange={e => setFormRequisitos(e.target.value)}
                  className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs"
                  rows={2}
                  placeholder="Ej. Almacenar lejos del calor, mantener bajo llave."
                />
              </div>
            </div>

            <div className="p-6 border-t border-border-light dark:border-white/10 bg-surface-secondary/40 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border-medium text-text-primary rounded-xl font-bold text-xs">Cancelar</button>
              <button onClick={handleSaveProduct} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs">Guardar Producto</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <ReportHistory 
        onSelectReport={handleSelectReport} 
        isOpen={isHistoryOpen} 
        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)} 
        refreshTrigger={refreshTrigger} 
        tags={['sgsst-chemicals']} 
      />

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="relative max-w-sm w-full animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowUpgradeModal(false)} 
              className="absolute -top-10 right-0 text-white hover:text-gray-300 font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-md text-sm"
            >
              Cerrar [X]
            </button>
            <UpgradeWall 
              isCompact={true}
              title="Actualizar a Somos SST Pro"
              description="Has alcanzado el límite de 1 informe gratuito en el plan básico. Actualiza a Pro para generar informes ilimitados con Inteligencia Artificial."
            />
          </div>
        </div>
      )}
    </div>
  );
}
