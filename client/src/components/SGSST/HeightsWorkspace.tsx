import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuthContext } from '~/hooks';
import { useToastContext } from '@librechat/client';
import { 
  Shield, 
  User, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Plus, 
  FileText, 
  Search, 
  FileSignature, 
  Printer, 
  Wrench, 
  ClipboardList,
  FileSpreadsheet,
  Download,
  ChevronDown,
  ChevronRight,
  X,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { exportHeightsToExcel } from './exportHeights';
import { saveAs } from 'file-saver';
import { SGSSTToolbar } from './SGSSTToolbar';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import CollapsibleReportBox from './CollapsibleReportBox';
import ExportDropdown from './ExportDropdown';
import { UpgradeWall } from './UpgradeWall';

interface EquipoAlturas {
  id: string;
  nombre: string;
  marca: string;
  referencia: string;
  serial: string;
  fechaFabricacion: string;
  fechaCompra: string;
  fechaUltimaInspeccion: string;
  fechaProximaInspeccion: string;
  inspeccionadoPor: string;
  resultadoInspeccion: 'Aprobado' | 'Rechazado' | 'N/A';
  estado: 'Vigente' | 'Vencido' | 'Requiere Inspección' | 'Retirado';
  firmaTrabajador?: string;
  observaciones?: string;
}

interface WorkerHeightsDoc {
  workerId: string;
  nombreTrabajador: string;
  cargo: string;
  equipos: EquipoAlturas[];
}

interface SocioWorker {
  id: string;
  nombre: string;
  identificacion: string;
  cargo: string;
  firmaDigital?: string;
}

export default function HeightsWorkspace() {
  const { token, user } = useAuthContext();
  const { showToast } = useToastContext();

  const [workers, setWorkers] = useState<SocioWorker[]>([]);
  const [heightsDocs, setHeightsDocs] = useState<WorkerHeightsDoc[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<SocioWorker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Collapsible states
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

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
  const selectedDoc = heightsDocs.find(d => d.workerId === selectedWorker?.id);

  const handleGenerate = useCallback(async () => {
    if (!selectedWorker) {
      showToast({ message: 'Seleccione un trabajador primero', status: 'warning' });
      return;
    }
    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-heights`, { headers: { Authorization: `Bearer ${token}` } });
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
      const response = await fetch('/api/sgsst/heights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          workerId: selectedWorker.id, 
          nombreTrabajador: selectedWorker.nombre, 
          cargo: selectedWorker.cargo, 
          equipos: selectedDoc?.equipos || [], 
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
  }, [selectedWorker, selectedDoc, selectedModel, token, isPro, conversationId, showToast]);

  const handleSave = useCallback(async () => {
    const contentToSave = editorContentRef.current || generatedReport;
    if (!contentToSave || !token) return;

    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-heights`, { headers: { Authorization: `Bearer ${token}` } });
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
          title: `Informe Alturas - ${selectedWorker?.nombre} - ${new Date().toLocaleDateString('es-CO')}`,
          tags: ['sgsst-heights'],
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
  }, [generatedReport, conversationId, reportMessageId, token, isPro, selectedWorker, showToast]);

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
  const [formNombre, setFormNombre] = useState('Arnés de cuerpo entero (4 argollas)');
  const [formMarca, setFormMarca] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formFechaFabricacion, setFormFechaFabricacion] = useState('');
  const [formFechaCompra, setFormFechaCompra] = useState('');
  const [formFechaUltimaInspeccion, setFormFechaUltimaInspeccion] = useState('');
  const [formFechaProximaInspeccion, setFormFechaProximaInspeccion] = useState('');
  const [formInspeccionadoPor, setFormInspeccionadoPor] = useState('');
  const [formResultado, setFormResultado] = useState<'Aprobado' | 'Rechazado' | 'N/A'>('N/A');
  const [formEstado, setFormEstado] = useState<'Vigente' | 'Vencido' | 'Requiere Inspección' | 'Retirado'>('Vigente');
  const [formSignature, setFormSignature] = useState<string | null>(null);
  const [formObservaciones, setFormObservaciones] = useState('');

  // Fetch data
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const wRes = await fetch('/api/sgsst/perfil-sociodemografico/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const wData = await wRes.json();
      setWorkers(wData.trabajadores || []);

      const hRes = await fetch('/api/sgsst/heights/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const hData = await hRes.json();
      setHeightsDocs(hData || []);
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al cargar hojas de vida de alturas', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const resetForm = () => {
    setFormNombre('Arnés de cuerpo entero (4 argollas)');
    setFormMarca('');
    setFormReferencia('');
    setFormSerial('');
    setFormFechaFabricacion('');
    setFormFechaCompra('');
    setFormFechaUltimaInspeccion('');
    setFormFechaProximaInspeccion('');
    setFormInspeccionadoPor('');
    setFormResultado('N/A');
    setFormEstado('Vigente');
    setFormSignature(null);
    setFormObservaciones('');
  };

  const handleLastInspectionChange = (dateVal: string) => {
    setFormFechaUltimaInspeccion(dateVal);
    if (dateVal) {
      const d = new Date(dateVal + 'T12:00:00');
      d.setFullYear(d.getFullYear() + 1); // Vence en 1 año
      setFormFechaProximaInspeccion(d.toISOString().substring(0, 10));
    }
  };

  // Guardar Equipo
  const handleSaveEquipment = async () => {
    if (!selectedWorker) return;
    if (!formSerial || !formMarca) {
      showToast({ message: 'Marca y Serial son obligatorios', status: 'warning' });
      return;
    }

    setLoading(true);

    const newEquip: EquipoAlturas = {
      id: crypto.randomUUID(),
      nombre: formNombre,
      marca: formMarca,
      referencia: formReferencia,
      serial: formSerial,
      fechaFabricacion: formFechaFabricacion,
      fechaCompra: formFechaCompra,
      fechaUltimaInspeccion: formFechaUltimaInspeccion,
      fechaProximaInspeccion: formFormularyProximaInspeccion(),
      inspeccionadoPor: formInspeccionadoPor,
      resultadoInspeccion: formResultado,
      estado: formEstado,
      firmaTrabajador: formSignature || selectedWorker.firmaDigital,
      observaciones: formObservaciones
    };

    const currentEquipos = selectedDoc ? selectedDoc.equipos : [];
    const updatedEquipos = [...currentEquipos, newEquip];

    const payload = {
      workerId: selectedWorker.id,
      nombreTrabajador: selectedWorker.nombre,
      cargo: selectedWorker.cargo || '',
      equipos: updatedEquipos
    };

    try {
      const res = await fetch('/api/sgsst/heights/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast({ message: 'Equipo de alturas guardado correctamente', status: 'success' });
        // Recargar localmente
        const docExists = heightsDocs.some(d => d.workerId === selectedWorker.id);
        if (docExists) {
          setHeightsDocs(heightsDocs.map(d => d.workerId === selectedWorker.id ? data.data : d));
        } else {
          setHeightsDocs([...heightsDocs, data.data]);
        }
        setIsModalOpen(false);
        resetForm();
      } else {
        showToast({ message: data.error || 'Error al guardar equipo', status: 'error' });
      }
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error de servidor al guardar equipo', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  function formFormularyProximaInspeccion() {
    if (formFechaProximaInspeccion) return formFechaProximaInspeccion;
    if (formFechaUltimaInspeccion) {
      const d = new Date(formFechaUltimaInspeccion + 'T12:00:00');
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().substring(0, 10);
    }
    return '';
  };

  const handleExportExcel = async () => {
    try {
      showToast({ message: 'Generando reporte de Excel...', status: 'info' });
      await exportHeightsToExcel(heightsDocs);
      showToast({ message: 'Reporte Excel generado correctamente', status: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al exportar a Excel', status: 'error' });
    }
  };

  const buildHtmlFicha = (worker: SocioWorker, doc: WorkerHeightsDoc) => {
    let tableRows = '';
    doc.equipos.forEach(eq => {
      tableRows += `
        <tr>
          <td>${eq.nombre}</td>
          <td>${eq.marca}</td>
          <td>${eq.referencia || 'N/A'}</td>
          <td>${eq.serial}</td>
          <td>${eq.fechaProximaInspeccion || 'N/A'}</td>
          <td>${eq.estado}</td>
          <td style="text-align:center;">
            ${eq.firmaTrabajador ? `<img src="${eq.firmaTrabajador}" style="max-height: 40px; max-width: 100px;" />` : '<span style="color:#ef4444; font-size:10px;">Firma Faltante</span>'}
          </td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Hoja de Vida de Alturas — ${worker.nombre}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 40px; font-size: 13px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d9488; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #0f766e; text-align: right; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 15px; border-radius: 10px; }
          .meta-label { font-weight: bold; text-transform: uppercase; font-size: 10px; color: #64748b; margin-bottom: 2px; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .table th { background: #0f766e; color: white; padding: 8px 12px; font-size: 11px; text-transform: uppercase; text-align: left; }
          .table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
          .signature-box { width: 45%; border-top: 1px solid #94a3b8; text-align: center; padding-top: 10px; }
          .signature-img { max-height: 60px; max-width: 200px; display: block; margin: 0 auto 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Hoja de Vida de Equipos Contra Caídas<br><span style="font-size:11px; font-weight:normal; color:#64748b;">SG-SST Resolución 4272 de 2021</span></div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Trabajador</div><strong>${worker.nombre}</strong></div>
          <div class="meta-item"><div class="meta-label">Identificación</div><strong>${worker.identificacion}</strong></div>
          <div class="meta-item"><div class="meta-label">Cargo</div><strong>${worker.cargo || 'Sin cargo'}</strong></div>
          <div class="meta-item"><div class="meta-label">Fecha Emisión</div><strong>${new Date().toLocaleDateString('es-CO')}</strong></div>
        </div>

        <h3 style="color:#0f766e; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:15px; text-transform:uppercase; font-size:14px;">Equipos de Alturas Asignados</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Equipo</th>
              <th>Marca</th>
              <th>Referencia</th>
              <th>Serial</th>
              <th>Próxima Inspección</th>
              <th>Estado</th>
              <th style="text-align:center;">Firma Recibido</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="signatures">
          <div class="signature-box">
            ${worker.firmaDigital ? `<img class="signature-img" src="${worker.firmaDigital}" />` : '<div style="height:60px;"></div>'}
            <strong>${worker.nombre}</strong><br>Trabajador / Recibí Conforme
          </div>
          <div class="signature-box">
            <div style="height:60px;"></div>
            <strong>Responsable de Alturas (Coordinador)</strong><br>Entregado / Certificado
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintFicha = () => {
    if (!selectedWorker || !selectedDoc) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let html = buildHtmlFicha(selectedWorker, selectedDoc);
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
    if (!selectedWorker || !selectedDoc) return;
    const html = buildHtmlFicha(selectedWorker, selectedDoc);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `Ficha_Vida_Alturas_${selectedWorker.nombre.replace(/\s+/g, '_')}.html`);
  };

  const filteredWorkers = workers.filter(w => 
    w.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.identificacion.includes(searchQuery)
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col xl:flex-row h-[780px] w-full border border-border-light dark:border-white/10 rounded-3xl bg-surface-primary shadow-lg overflow-hidden animate-in fade-in duration-200">
      
      {/* SECTOR IZQUIERDO: LISTA TRABAJADORES */}
      <div className="w-full xl:w-96 border-r border-border-light dark:border-white/10 flex flex-col bg-surface-secondary/40 shrink-0">
        <div className="p-5 border-b border-border-light dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-teal-500" /> Trabajadores (Alturas)
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border-medium hover:border-[#0d9488]/40 hover:bg-[#0d9488]/10 text-teal-600 dark:text-teal-400 font-extrabold text-2xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <span className="bg-teal-500/10 text-teal-400 text-xs px-2.5 py-1 rounded-full font-bold">
                {workers.length}
              </span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-text-secondary" />
            <input
              type="text"
              placeholder="Buscar trabajador..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredWorkers.map(w => {
            const isSelected = selectedWorker?.id === w.id;
            const hasEquip = heightsDocs.some(d => d.workerId === w.id && d.equipos.length > 0);
            return (
              <button
                key={w.id}
                onClick={() => {
                  setSelectedWorker(w);
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
                  <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-teal-500/20 text-teal-400' : 'bg-surface-secondary text-text-secondary'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-sm text-text-primary truncate">{w.nombre}</p>
                    <p className="text-xs text-text-secondary truncate mt-0.5">{w.cargo || 'Sin cargo'}</p>
                  </div>
                </div>
                {hasEquip && (
                  <Shield className="w-4 h-4 text-teal-500 shrink-0 ml-2" fill="currentColor" fillOpacity={0.2} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTOR DERECHO: DETALLE E INVENTARIO */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface-primary">
        {selectedWorker ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-secondary/20">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-text-primary">{selectedWorker.nombre}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-text-secondary">
                  <span>C.C. {selectedWorker.identificacion}</span>
                  <span>•</span>
                  <span className="text-teal-500">{selectedWorker.cargo || 'Sin cargo'}</span>
                </div>
              </div>

                <SGSSTToolbar
                  onAnalyze={handleGenerate}
                  isAnalyzing={isGenerating}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  exportContent={selectedWorker && selectedDoc && selectedDoc.equipos && selectedDoc.equipos.length > 0 ? buildHtmlFicha(selectedWorker, selectedDoc) : ''}
                  exportFileName={`Ficha_Vida_Alturas_${selectedWorker.nombre.replace(/\s+/g, '_')}`}
                  persistenceButtons={[
                    {
                      id: 'add-equipment',
                      onClick: () => setIsModalOpen(true),
                      label: 'Registrar Equipo',
                      title: 'Registrar nuevo equipo de alturas para el trabajador',
                      icon: Plus,
                      variant: 'ai'
                    }
                  ]}
                  onExportExcel={handleExportExcel}
                />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Inventario de Equipos */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isHistoryExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Wrench className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Equipos Contra Caídas Asignados</span>
                  </div>
                </button>
                {isHistoryExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                    <div className="border border-border-light dark:border-white/5 rounded-2xl overflow-hidden shadow-sm bg-surface-primary">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-surface-secondary text-text-secondary font-bold border-b border-border-light dark:border-white/5">
                            <th className="p-3">Equipo</th>
                            <th className="p-3">Marca</th>
                            <th className="p-3">Referencia</th>
                            <th className="p-3">Serial</th>
                            <th className="p-3 text-center">Última Inspección</th>
                            <th className="p-3 text-center">Próxima Inspección</th>
                            <th className="p-3 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDoc?.equipos.map((eq, idx) => (
                            <tr key={idx} className="border-b border-border-light dark:border-white/5 hover:bg-surface-hover/30 transition-colors">
                              <td className="p-3 font-semibold text-text-primary">{eq.nombre}</td>
                              <td className="p-3 text-text-secondary">{eq.marca}</td>
                              <td className="p-3 text-text-secondary">{eq.referencia || 'N/A'}</td>
                              <td className="p-3 text-text-secondary font-mono">{eq.serial}</td>
                              <td className="p-3 text-center text-text-secondary">{eq.fechaUltimaInspeccion || 'N/A'}</td>
                              <td className="p-3 text-center text-text-secondary">{eq.fechaProximaInspeccion || 'N/A'}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  eq.estado === 'Vigente' ? 'bg-green-500/10 text-green-400' :
                                  eq.estado === 'Requiere Inspección' ? 'bg-amber-500/10 text-amber-400' :
                                  'bg-red-500/10 text-red-400'
                                }`}>
                                  {eq.estado}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {(!selectedDoc || selectedDoc.equipos.length === 0) && (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-text-tertiary italic">
                                No se han registrado equipos de alturas para este trabajador.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-text-tertiary">
            <Wrench className="w-16 h-16 mb-4 text-teal-600 opacity-20" />
            <p className="text-sm font-semibold">Seleccione un trabajador para administrar sus equipos de alturas.</p>
          </div>
        )}
      </div>
    </div>

      {/* Editor de Informe de Alturas (Nivel Raíz — Siempre Visible a Todo Ancho) */}
      <CollapsibleReportBox
        onSave={handleSave}
        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        isHistoryOpen={isHistoryOpen}
        title="Informe IA - Control de Equipos de Alturas"
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <ExportDropdown
            content={editorContentRef.current || generatedReport || ''}
            fileName={`Informe_Alturas_${selectedWorker?.nombre ? selectedWorker.nombre.replace(/\s+/g, '_') : 'General'}`}
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
            reportSourceData={{ worker: selectedWorker, doc: selectedDoc }}
          />
        </div>
      </CollapsibleReportBox>

      {/* Modal: Registrar Equipo */}
      {isModalOpen && selectedWorker && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface-primary border border-border-light dark:border-white/10 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex justify-between items-center bg-surface-secondary/40">
              <h3 className="text-base font-extrabold text-text-primary flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-500" /> Registrar Equipo de Alturas
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-2xs uppercase font-bold text-text-secondary">Nombre del Equipo</label>
                <select value={formNombre} onChange={e => setFormNombre(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                  <option value="Arnés de cuerpo entero (4 argollas)">Arnés de cuerpo entero (4 argollas)</option>
                  <option value="Eslinga de posicionamiento regulable">Eslinga de posicionamiento regulable</option>
                  <option value="Eslinga doble con absorbedor de choque">Eslinga doble con absorbedor de choque</option>
                  <option value="Línea de vida vertical (Cuerda)">Línea de vida vertical (Cuerda)</option>
                  <option value="Mosquetón de seguridad automático">Mosquetón de seguridad automático</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Marca *</label>
                  <input type="text" value={formMarca} onChange={e => setFormMarca(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Referencia</label>
                  <input type="text" value={formReferencia} onChange={e => setFormReferencia(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Serial / Lote *</label>
                  <input type="text" value={formSerial} onChange={e => setFormSerial(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Fecha Fabricación</label>
                  <input type="date" value={formFechaFabricacion} onChange={e => setFormFechaFabricacion(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border-light dark:border-white/5 pt-3">
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Última Inspección</label>
                  <input type="date" value={formFechaUltimaInspeccion} onChange={e => handleLastInspectionChange(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Próxima Inspección (Anual)</label>
                  <input type="date" value={formFechaProximaInspeccion} onChange={e => setFormFechaProximaInspeccion(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Resultado Inspección</label>
                  <select value={formResultado} onChange={e => setFormResultado(e.target.value as any)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                    <option value="N/A">Sin evaluación</option>
                    <option value="Aprobado">Aprobado para Servicio</option>
                    <option value="Rechazado">Rechazado / Retirar</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Estado General</label>
                  <select value={formEstado} onChange={e => setFormEstado(e.target.value as any)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                    <option value="Vigente">Vigente</option>
                    <option value="Vencido">Vencido</option>
                    <option value="Requiere Inspección">Requiere Inspección</option>
                    <option value="Retirado">Retirado del Servicio</option>
                  </select>
                </div>
              </div>

              {/* Firma Aceptación */}
              <div className="p-3 border border-border-light dark:border-white/5 rounded-2xl bg-surface-secondary/20 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xs uppercase font-bold text-text-secondary">Firma del Trabajador (Recibido)</span>
                  {selectedWorker.firmaDigital ? (
                    <span className="bg-teal-500/10 text-teal-400 font-bold px-2 py-0.5 rounded text-[10px]">Guardada</span>
                  ) : (
                    <button onClick={() => setIsSignatureOpen(true)} className="text-xs text-teal-500 font-bold hover:underline">
                      {formSignature ? 'Cambiar Firma' : 'Firmar en Pantalla'}
                    </button>
                  )}
                </div>
                {formSignature ? (
                  <div className="flex items-center gap-4 bg-teal-500/5 p-2 rounded-lg border border-teal-500/20">
                    <img src={formSignature} style={{ maxHeight: '35px' }} className="bg-white rounded p-1" />
                    <button onClick={() => setFormSignature(null)} className="text-red-400 text-xs ml-auto font-bold hover:underline">Remover</button>
                  </div>
                ) : selectedWorker.firmaDigital ? (
                  <div className="flex items-center gap-4 bg-teal-500/5 p-2 rounded-lg border border-teal-500/20">
                    <img src={selectedWorker.firmaDigital} style={{ maxHeight: '35px' }} className="bg-white rounded p-1" />
                    <p className="text-[10px] text-text-secondary leading-relaxed">Se vinculará la firma registrada en sociodemográfico.</p>
                  </div>
                ) : (
                  <div className="p-4 text-center border border-dashed border-border-medium rounded-lg text-xs text-text-tertiary">
                    Ninguna firma capturada
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-2xs uppercase font-bold text-text-secondary">Observaciones</label>
                <textarea
                  value={formObservaciones}
                  onChange={e => setFormObservaciones(e.target.value)}
                  className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs"
                  rows={2}
                />
              </div>
            </div>

            <div className="p-6 border-t border-border-light dark:border-white/10 bg-surface-secondary/40 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border-medium text-text-primary rounded-xl font-bold text-xs">Cancelar</button>
              <button onClick={handleSaveEquipment} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs">Registrar Equipo</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <SignaturePad
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onSave={setFormSignature}
        title={`Firma de Conformidad: ${selectedWorker?.nombre}`}
      />

      <ReportHistory 
        onSelectReport={handleSelectReport} 
        isOpen={isHistoryOpen} 
        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)} 
        refreshTrigger={refreshTrigger} 
        tags={['sgsst-heights']} 
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
