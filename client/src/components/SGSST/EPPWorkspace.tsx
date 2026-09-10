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
  Trash2, 
  Search, 
  FileSignature, 
  Printer, 
  Wrench, 
  ArrowRight,
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
import { exportEppToExcel } from './exportEpp';
import { saveAs } from 'file-saver';
import { SGSSTToolbar } from './SGSSTToolbar';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import CollapsibleReportBox from './CollapsibleReportBox';
import ExportDropdown from './ExportDropdown';
import { UpgradeWall } from './UpgradeWall';

interface EppItem {
  id: string;
  nombre: string;
  tipo: 'Regular' | 'Alturas';
  marca?: string;
  referencia?: string;
  serial?: string;
  fechaUltimaInspeccion?: string;
  fechaProximaInspeccion?: string;
  inspeccionadoPor?: string;
  resultadoInspeccion?: 'Aprobado' | 'Rechazado' | 'N/A';
  fechaEntrega: string;
  fechaVencimiento?: string;
  cantidad: number;
  estado: 'Entregado' | 'Vencido' | 'Inspección Requerida' | 'Fuera de Servicio';
  firmaTrabajador?: string;
  observaciones?: string;
}

interface WorkerEppDoc {
  workerId: string;
  documento: string;
  nombreTrabajador: string;
  cargo: string;
  entregas: EppItem[];
}

interface SocioWorker {
  id: string;
  nombre: string;
  identificacion: string;
  cargo: string;
  firmaDigital?: string;
  consentimientoFirmaDigital?: string;
}

interface CargoProfile {
  id: string;
  nombreCargo: string;
  eppSeleccionados?: string[];
}

export default function EPPWorkspace() {
  const { token, user } = useAuthContext();
  const { showToast } = useToastContext();

  // State
  const [workers, setWorkers] = useState<SocioWorker[]>([]);
  const [cargoProfiles, setCargoProfiles] = useState<CargoProfile[]>([]);
  const [eppDocs, setEppDocs] = useState<WorkerEppDoc[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<SocioWorker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Collapsible states
  const [isCargoExpanded, setIsCargoExpanded] = useState(true);
  const [isAlturasExpanded, setIsAlturasExpanded] = useState(true);
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

  // Calculations for selected worker
  const selectedDoc = eppDocs.find(doc => doc.workerId === selectedWorker?.id);
  const activeCargoProfile = cargoProfiles.find(profile => 
    profile.nombreCargo.toLowerCase().trim() === selectedWorker?.cargo?.toLowerCase()?.trim() ||
    profile.id === selectedWorker?.id // fallback link
  );
  const recommendedEpps = activeCargoProfile?.eppSeleccionados || [];

  const handleGenerate = useCallback(async () => {
    if (!selectedWorker) {
      showToast({ message: 'Seleccione un trabajador primero', status: 'warning' });
      return;
    }
    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-epp`, { headers: { Authorization: `Bearer ${token}` } });
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
      const response = await fetch('/api/sgsst/epp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          workerId: selectedWorker.id, 
          nombreTrabajador: selectedWorker.nombre, 
          cargo: selectedWorker.cargo, 
          entregas: selectedDoc?.entregas || [], 
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
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-epp`, { headers: { Authorization: `Bearer ${token}` } });
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
          title: `Informe EPP - ${selectedWorker?.nombre} - ${new Date().toLocaleDateString('es-CO')}`,
          tags: ['sgsst-epp'],
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

  // New EPP Form state
  const [formEppName, setFormEppName] = useState('');
  const [formTipo, setFormTipo] = useState<'Regular' | 'Alturas'>('Regular');
  const [formCantidad, setFormCantidad] = useState(1);
  const [formFechaEntrega, setFormFechaEntrega] = useState(new Date().toISOString().substring(0, 10));
  const [formVencimientoInterval, setFormVencimientoInterval] = useState('6'); // months
  const [formMarca, setFormMarca] = useState('');
  const [formReferencia, setFormReferencia] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formFechaUltimaInspeccion, setFormFechaUltimaInspeccion] = useState('');
  const [formFechaProximaInspeccion, setFormFechaProximaInspeccion] = useState('');
  const [formInspeccionadoPor, setFormInspeccionadoPor] = useState('');
  const [formResultadoInspeccion, setFormResultadoInspeccion] = useState<'Aprobado' | 'Rechazado' | 'N/A'>('N/A');
  const [formSignature, setFormSignature] = useState<string | null>(null);
  const [formObservaciones, setFormObservaciones] = useState('');

  // Fetch initial data
  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Fetch Workers
      const workersRes = await fetch('/api/sgsst/perfil-sociodemografico/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const workersData = await workersRes.json();
      setWorkers(workersData.trabajadores || []);

      // 2. Fetch Cargo Profiles
      const cargoRes = await fetch('/api/sgsst/perfiles-cargo/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const cargoData = await cargoRes.json();
      setCargoProfiles(cargoData.perfilesList || []);

      // 3. Fetch EPP Deliveries
      const eppRes = await fetch('/api/sgsst/epp/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const eppData = await eppRes.json();
      setEppDocs(eppData || []);
    } catch (err) {
      console.error('[EPP Workspace] Fetch error:', err);
      showToast({ message: 'Error al cargar los datos del módulo EPP', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Autocomplete suggestions
  const standardEppSuggestions = [
    'Casco dieléctrico con barbuquejo',
    'Gafas de seguridad con filtro UV',
    'Protectores auditivos tipo copa',
    'Protectores auditivos de inserción',
    'Mascarilla de protección respiratoria N95',
    'Guantes de nitrilo',
    'Guantes de vaqueta reforzada',
    'Botas de seguridad con puntera de acero',
    'Arnés de cuerpo entero (4 argollas)',
    'Eslinga de posicionamiento regulable',
    'Eslinga doble con absorbedor de choque',
    'Conector de anclaje (Cinta webbing)',
    'Mosquetón de seguridad automatico'
  ];

  const suggestionsList = Array.from(new Set([...recommendedEpps, ...standardEppSuggestions]));

  // Auto-calculate dates on inspection/delivery date change
  const handleFechaEntregaChange = (dateVal: string) => {
    setFormFechaEntrega(dateVal);
    if (formVencimientoInterval && formVencimientoInterval !== 'never') {
      const deliveryDate = new Date(dateVal + 'T12:00:00');
      deliveryDate.setMonth(deliveryDate.getMonth() + parseInt(formVencimientoInterval, 10));
      setFormVencimientoInterval(formVencimientoInterval);
    }
  };

  const handleIntervalChange = (months: string) => {
    setFormVencimientoInterval(months);
    if (months === 'never') return;
    const deliveryDate = new Date(formFechaEntrega + 'T12:00:00');
    deliveryDate.setMonth(deliveryDate.getMonth() + parseInt(months, 10));
  };

  const handleLastInspeccionChange = (dateVal: string) => {
    setFormFechaUltimaInspeccion(dateVal);
    if (dateVal) {
      const inspDate = new Date(dateVal + 'T12:00:00');
      inspDate.setFullYear(inspDate.getFullYear() + 1); // Inspección anual (1 año)
      setFormFechaProximaInspeccion(inspDate.toISOString().substring(0, 10));
    }
  };

  // Submit delivery form
  const handleSaveEpp = async () => {
    if (!selectedWorker) return;
    if (!formEppName) {
      showToast({ message: 'Por favor, ingrese el nombre del EPP', status: 'warning' });
      return;
    }

    setLoading(true);

    // Calculate dates
    let expiryDate = '';
    if (formVencimientoInterval !== 'never') {
      const d = new Date(formFechaEntrega + 'T12:00:00');
      d.setMonth(d.getMonth() + parseInt(formVencimientoInterval, 10));
      expiryDate = d.toISOString().substring(0, 10);
    }

    const newEppItem: EppItem = {
      id: 'EPP-' + Date.now(),
      nombre: formEppName,
      tipo: formTipo,
      fechaEntrega: formFechaEntrega,
      fechaVencimiento: expiryDate || undefined,
      cantidad: formCantidad,
      estado: 'Entregado',
      firmaTrabajador: formSignature || selectedWorker.firmaDigital || undefined,
      observaciones: formObservaciones
    };

    if (formTipo === 'Alturas') {
      newEppItem.marca = formMarca;
      newEppItem.referencia = formReferencia;
      newEppItem.serial = formSerial;
      newEppItem.fechaUltimaInspeccion = formFechaUltimaInspeccion || undefined;
      newEppItem.fechaProximaInspeccion = formFechaProximaInspeccion || undefined;
      newEppItem.inspeccionadoPor = formInspeccionadoPor || undefined;
      newEppItem.resultadoInspeccion = formResultadoInspeccion;
    }

    const currentDeliveries = selectedDoc ? [...selectedDoc.entregas] : [];
    
    // Add or replace
    const updatedDeliveries = [...currentDeliveries, newEppItem];

    try {
      const res = await fetch('/api/sgsst/epp/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          workerId: selectedWorker.id,
          documento: selectedWorker.identificacion,
          nombreTrabajador: selectedWorker.nombre,
          cargo: selectedWorker.cargo || 'Sin cargo',
          entregas: updatedDeliveries
        })
      });

      if (!res.ok) throw new Error('Save failed');

      showToast({ message: 'EPP registrado y sincronizado exitosamente con IPEVAR', status: 'success' });
      setIsModalOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al registrar la entrega de EPP', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Delete EPP item
  const handleDeleteEpp = async (itemId: string) => {
    if (!selectedWorker || !selectedDoc) return;
    if (!confirm('¿Está seguro de eliminar este registro de entrega?')) return;

    setLoading(true);
    const updatedDeliveries = selectedDoc.entregas.filter(item => item.id !== itemId);

    try {
      const res = await fetch('/api/sgsst/epp/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          workerId: selectedWorker.id,
          documento: selectedWorker.identificacion,
          nombreTrabajador: selectedWorker.nombre,
          cargo: selectedWorker.cargo || 'Sin cargo',
          entregas: updatedDeliveries
        })
      });

      if (!res.ok) throw new Error('Save failed');

      showToast({ message: 'Registro eliminado exitosamente', status: 'success' });
      loadData();
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al eliminar el registro', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  function resetForm() {
    setFormEppName('');
    setFormTipo('Regular');
    setFormCantidad(1);
    setFormFechaEntrega(new Date().toISOString().substring(0, 10));
    setFormVencimientoInterval('6');
    setFormMarca('');
    setFormReferencia('');
    setFormSerial('');
    setFormFechaUltimaInspeccion('');
    setFormFechaProximaInspeccion('');
    setFormInspeccionadoPor('');
    setFormResultadoInspeccion('N/A');
    setFormSignature(null);
    setFormObservaciones('');
  };

  // Helper to generate the HTML for print/download
  const buildReceiptHtml = (
    worker: SocioWorker,
    doc: WorkerEppDoc,
    signature: string | undefined,
    logo: string,
    todayStr: string
  ) => {
    let tableRows = '';
    doc.entregas.forEach(ent => {
      tableRows += `
        <tr>
          <td>${ent.nombre}</td>
          <td>${ent.tipo === 'Alturas' ? 'Alturas' : 'Regular'}</td>
          <td>${ent.cantidad}</td>
          <td>${ent.fechaEntrega}</td>
          <td>${ent.fechaVencimiento || 'N/A'}</td>
          <td>${ent.serial || 'N/A'}</td>
          <td style="text-align:center;">
            ${ent.firmaTrabajador ? `<img src="${ent.firmaTrabajador}" style="max-height: 40px; max-width: 100px;" />` : '<span style="color:#ef4444; font-size:10px;">Firma Faltante</span>'}
          </td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Acta de Entrega de EPP — ${worker.nombre}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 40px; font-size: 13px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0d9488; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { max-height: 50px; }
          .title { font-size: 18px; font-weight: bold; text-transform: uppercase; color: #0f766e; text-align: right; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; background: #f8fafc; padding: 15px; border-radius: 10px; }
          .meta-item { font-size: 13px; }
          .meta-label { font-weight: bold; text-transform: uppercase; font-size: 10px; color: #64748b; margin-bottom: 2px; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .table th { background: #0f766e; color: white; padding: 8px 12px; font-size: 11px; text-transform: uppercase; text-align: left; }
          .table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
          .legal-text { font-size: 11px; color: #64748b; text-align: justify; margin-bottom: 50px; line-height: 1.6; border: 1px solid #e2e8f0; padding: 15px; border-radius: 10px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
          .signature-box { width: 45%; border-top: 1px solid #94a3b8; text-align: center; padding-top: 10px; }
          .signature-img { max-height: 60px; max-width: 200px; display: block; margin: 0 auto 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="logo" src="${logo}" />
          <div class="title">Acta de Entrega de EPP y Alturas<br><span style="font-size:11px; font-weight:normal; color:#64748b;">SG-SST Resolución 0312</span></div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Trabajador</div><strong>${worker.nombre}</strong></div>
          <div class="meta-item"><div class="meta-label">Documento</div><strong>${worker.identificacion}</strong></div>
          <div class="meta-item"><div class="meta-label">Cargo</div><strong>${worker.cargo || 'Sin cargo'}</strong></div>
          <div class="meta-item"><div class="meta-label">Fecha de Impresión</div><strong>${todayStr}</strong></div>
        </div>

        <h3 style="color:#0f766e; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:15px; text-transform:uppercase; font-size:14px;">EPP e Inspecciones de Alturas Entregados</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Elemento / EPP</th>
              <th>Tipo</th>
              <th>Cant.</th>
              <th>Fecha Entrega</th>
              <th>Fecha Vencimiento</th>
              <th>Serial (Alturas)</th>
              <th style="text-align:center;">Firma Recibido</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="legal-text">
          <strong>COMPROMISO DEL TRABAJADOR:</strong> Manifiesto que he recibido a entera satisfacción los Elementos de Protección Personal (EPP) detallados en la tabla anterior, y que he recibido la capacitación correspondiente para su correcto uso, cuidado, mantenimiento e inspección diaria. Me comprometo a utilizarlos de forma obligatoria durante el desempeño de mis labores, reportar inmediatamente cualquier desgaste o anomalía en los mismos a fin de solicitar su cambio, y no realizar modificaciones o alteraciones a los equipos suministrados (especialmente a los equipos de protección contra caídas en alturas). Lo anterior de conformidad con el Art. 85 de la Ley 9 de 1979 y normas complementarias del SG-SST en Colombia.
        </div>

        <div class="signatures">
          <div class="signature-box">
            ${signature ? `<img class="signature-img" src="${signature}" />` : '<div style="height:60px;"></div>'}
            <strong>${worker.nombre}</strong><br>Trabajador / Recibí Conforme
          </div>
          <div class="signature-box">
            <div style="height:60px;"></div>
            <strong>Responsable SG-SST</strong><br>Entrega Autorizada
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Print Delivery Receipt PDF window
  const handlePrintReceipt = () => {
    if (!selectedWorker || !selectedDoc) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const companyLogo = localStorage.getItem('wappy_sst_global_logo') || 'https://wappy.club/assets/logo.png';
    const todayStr = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const lastSignature = selectedDoc.entregas.filter(e => e.firmaTrabajador).slice(-1)[0]?.firmaTrabajador || selectedWorker.firmaDigital;

    let receiptHtml = buildReceiptHtml(selectedWorker, selectedDoc, lastSignature, companyLogo, todayStr);
    
    // Add print trigger script before body closing tag
    receiptHtml = receiptHtml.replace('</body>', `
      <script>
        window.onload = function() {
          window.focus();
          window.print();
        }
      </script>
      </body>
    `);

    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  // Download delivery receipt in HTML format
  const handleDownloadHtml = () => {
    if (!selectedWorker || !selectedDoc) return;

    const companyLogo = localStorage.getItem('wappy_sst_global_logo') || 'https://wappy.club/assets/logo.png';
    const todayStr = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const lastSignature = selectedDoc.entregas.filter(e => e.firmaTrabajador).slice(-1)[0]?.firmaTrabajador || selectedWorker.firmaDigital;

    const receiptHtml = buildReceiptHtml(selectedWorker, selectedDoc, lastSignature, companyLogo, todayStr);

    const blob = new Blob([receiptHtml], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `Acta_Entrega_EPP_${selectedWorker.nombre.replace(/\s+/g, '_')}.html`);
  };

  // Export general EPP records for all workers to Excel
  const handleExportExcel = async () => {
    try {
      showToast({ message: 'Generando reporte de Excel...', status: 'info' });
      await exportEppToExcel(eppDocs, workers);
      showToast({ message: 'Reporte Excel generado correctamente', status: 'success' });
    } catch (err) {
      console.error('[EPP Workspace] Excel export error:', err);
      showToast({ message: 'Error al exportar a Excel', status: 'error' });
    }
  };

  // Filters workers list based on search
  const filteredWorkers = workers.filter(w => 
    w.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.identificacion.includes(searchQuery)
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col xl:flex-row h-[780px] w-full border border-border-light dark:border-white/10 rounded-3xl bg-surface-primary shadow-lg overflow-hidden animate-in fade-in duration-200">
      
      {/* ── SECTOR IZQUIERDO: LISTA DE TRABAJADORES ── */}
      <div className="w-full xl:w-96 border-r border-border-light dark:border-white/10 flex flex-col bg-surface-secondary/40 shrink-0">
        <div className="p-5 border-b border-border-light dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-teal-500" /> Trabajadores
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border-medium hover:border-[#0d9488]/40 hover:bg-[#0d9488]/10 text-teal-600 dark:text-teal-400 font-extrabold text-2xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
                title="Descargar base de datos general de entregas de EPP en Excel"
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
              className="w-full pl-10 pr-4 py-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredWorkers.map(w => {
            const hasDoc = eppDocs.some(doc => doc.workerId === w.id && doc.entregas.length > 0);
            const isSelected = selectedWorker?.id === w.id;

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

                {hasDoc && (
                  <Shield className="w-4 h-4 text-teal-500 shrink-0 ml-2" fill="currentColor" fillOpacity={0.2} />
                )}
              </button>
            );
          })}

          {filteredWorkers.length === 0 && (
            <div className="text-center py-10 text-text-tertiary">
              <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No se encontraron trabajadores</p>
            </div>
          )}
        </div>
      </div>

      {/* ── SECTOR DERECHO: DETALLE DE EPP Y SEGUIMIENTO ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface-primary">
        {selectedWorker ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Cabecera del trabajador */}
            <div className="p-6 border-b border-border-light dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-secondary/20">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-text-primary">{selectedWorker.nombre}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-text-secondary">
                  <span>C.C. {selectedWorker.identificacion}</span>
                  <span>•</span>
                  <span className="text-teal-500">{selectedWorker.cargo || 'Cargo no asignado'}</span>
                </div>
              </div>

              <div className="-my-2">
                <SGSSTToolbar
                  onAnalyze={handleGenerate}
                  isAnalyzing={isGenerating}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  exportContent={selectedDoc && selectedDoc.entregas && selectedDoc.entregas.length > 0 ? buildReceiptHtml(
                    selectedWorker,
                    selectedDoc,
                    selectedDoc.entregas.filter(e => e.firmaTrabajador).slice(-1)[0]?.firmaTrabajador || selectedWorker.firmaDigital,
                    localStorage.getItem('wappy_sst_global_logo') || 'https://wappy.club/assets/logo.png',
                    new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
                  ) : ''}
                  exportFileName={`Acta_Entrega_EPP_${selectedWorker.nombre.replace(/\s+/g, '_')}`}
                  persistenceButtons={[
                    {
                      id: 'add-delivery',
                      onClick: () => setIsModalOpen(true),
                      label: 'Registrar Entrega',
                      title: 'Registrar nueva entrega de EPP',
                      icon: Plus,
                      variant: 'ai'
                    }
                  ]}
                  onExportExcel={handleExportExcel}
                />
              </div>
            </div>

            {/* Contenido principal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* EPP Sugeridos del Cargo */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsCargoExpanded(!isCargoExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isCargoExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Shield className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">EPP Requeridos por el Cargo</span>
                  </div>
                </button>
                {isCargoExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                    {recommendedEpps.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {recommendedEpps.map((epp, idx) => (
                          <span key={idx} className="bg-surface-secondary border border-border-light dark:border-white/5 text-text-primary text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-teal-500" /> {epp}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary font-medium">Este cargo no tiene EPPs específicos asignados en el Perfil de Cargo. Se aplica la protección estándar básica.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Trazabilidad de Alturas (Pestaña integrada) */}
              {selectedDoc?.entregas.some(ent => ent.tipo === 'Alturas') && (
                <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setIsAlturasExpanded(!isAlturasExpanded)} 
                    className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                  >
                    <div className="flex items-center gap-2">
                      {isAlturasExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      <Wrench className="w-5 h-5 text-blue-500" />
                      <span className="font-semibold text-text-primary">Control Anual de Equipos de Alturas</span>
                    </div>
                  </button>
                  {isAlturasExpanded && (
                    <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedDoc.entregas.filter(ent => ent.tipo === 'Alturas').map(ent => {
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          const proxDate = ent.fechaProximaInspeccion ? new Date(ent.fechaProximaInspeccion + 'T12:00:00') : null;
                          const isVencido = proxDate && proxDate < today;

                          return (
                            <div key={ent.id} className="p-4 border border-border-light dark:border-white/5 bg-surface-secondary/20 rounded-xl space-y-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-extrabold text-sm text-text-primary">{ent.nombre}</p>
                                  <p className="text-xs text-text-secondary mt-0.5">Serial: <strong>{ent.serial || 'S/N'}</strong></p>
                                </div>
                                <span className={`badge ${isVencido ? 'badge-danger' : 'badge-warning'}`}>
                                  {isVencido ? 'Inspección Vencida' : 'Inspección Vigente'}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-border-light dark:border-white/5 text-text-secondary">
                                <div>Marca: <strong>{ent.marca || 'N/A'}</strong></div>
                                <div>Referencia: <strong>{ent.referencia || 'N/A'}</strong></div>
                                <div>Última insp: <strong>{ent.fechaUltimaInspeccion || 'S/N'}</strong></div>
                                <div>Próxima insp: <strong className={isVencido ? 'text-red-400' : 'text-text-primary'}>{ent.fechaProximaInspeccion || 'S/N'}</strong></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tabla de Historial de Entregas */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isHistoryExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <FileText className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Registro Completo de Entregas</span>
                  </div>
                </button>
                {isHistoryExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                    {selectedDoc && selectedDoc.entregas.length > 0 ? (
                      <div className="border border-border-light dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-surface-secondary text-text-secondary font-bold text-2xs uppercase tracking-wider">
                              <th className="p-3.5">Elemento / EPP</th>
                              <th className="p-3.5">Tipo</th>
                              <th className="p-3.5">Cant.</th>
                              <th className="p-3.5">Fecha Entrega</th>
                              <th className="p-3.5">Vencimiento</th>
                              <th className="p-3.5 text-center">Firma Recibido</th>
                              <th className="p-3.5 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-light dark:divide-white/5">
                            {selectedDoc.entregas.map(ent => {
                              const today = new Date();
                              today.setHours(0,0,0,0);
                              const vto = ent.fechaVencimiento ? new Date(ent.fechaVencimiento + 'T12:00:00') : null;
                              const isVencido = vto && vto < today;

                              return (
                                <tr key={ent.id} className="hover:bg-surface-secondary/30 transition-colors text-text-primary">
                                  <td className="p-3.5 font-bold">{ent.nombre}</td>
                                  <td className="p-3.5">
                                    <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${ent.tipo === 'Alturas' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-text-secondary'}`}>
                                      {ent.tipo}
                                    </span>
                                  </td>
                                  <td className="p-3.5 font-bold">{ent.cantidad}</td>
                                  <td className="p-3.5">{ent.fechaEntrega}</td>
                                  <td className="p-3.5">
                                    {ent.fechaVencimiento ? (
                                      <span className={isVencido ? 'text-red-400 font-bold' : ''}>
                                        {ent.fechaVencimiento} {isVencido && '⚠️'}
                                      </span>
                                    ) : 'Vitalicio'}
                                  </td>
                                  <td className="p-3.5 align-middle text-center">
                                    {ent.firmaTrabajador ? (
                                      <div className="inline-flex items-center gap-1 text-teal-500 font-bold">
                                        <CheckCircle className="w-3.5 h-3.5" /> Registrada
                                      </div>
                                    ) : (
                                      <span className="text-red-400 font-bold">Faltante</span>
                                    )}
                                  </td>
                                  <td className="p-3.5 text-right">
                                    <button
                                      onClick={() => handleDeleteEpp(ent.id)}
                                      className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                      title="Eliminar registro"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-16 border border-dashed border-border-medium rounded-2xl text-text-tertiary">
                        <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-semibold">No se han registrado entregas para este trabajador</p>
                        <button
                          onClick={() => setIsModalOpen(true)}
                          className="mt-3.5 text-xs font-bold text-teal-500 hover:underline flex items-center gap-1 mx-auto"
                        >
                          Registrar primera entrega <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-tertiary">
            <Shield className="w-16 h-16 mb-4 text-teal-500 opacity-20" />
            <h3 className="text-lg font-extrabold text-text-primary">Módulo de Entrega y Control de EPP</h3>
            <p className="text-sm text-text-secondary max-w-sm mt-2">Seleccione un trabajador de la lista de la izquierda para comenzar a gestionar el equipamiento de protección personal y controlar las revisiones anuales de alturas.</p>
          </div>
        )}
      </div>
    </div>

      {/* Editor de Informe de EPP (Nivel Raíz — Siempre Visible a Todo Ancho) */}
      <CollapsibleReportBox
        onSave={handleSave}
        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        isHistoryOpen={isHistoryOpen}
        title="Informe IA - Entrega de EPP"
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <ExportDropdown
            content={editorContentRef.current || generatedReport || ''}
            fileName={`Informe_EPP_${selectedWorker?.nombre ? selectedWorker.nombre.replace(/\s+/g, '_') : 'General'}`}
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

      {/* ── MODAL: REGISTRAR NUEVA ENTREGA ── */}
      {isModalOpen && selectedWorker && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface-primary border border-border-light dark:border-white/10 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex justify-between items-center bg-surface-secondary/40">
              <h3 className="font-extrabold text-lg text-text-primary flex items-center gap-2">
                <Shield className="w-5 h-5 text-teal-500" /> Registrar Entrega de EPP
              </h3>
              <button 
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="rounded-xl p-2 text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 max-h-[500px]">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-text-secondary">Trabajador</label>
                  <input type="text" readOnly value={selectedWorker.nombre} className="w-full p-2.5 bg-surface-secondary border border-border-medium rounded-xl text-sm font-semibold text-text-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-text-secondary">Identificación</label>
                  <input type="text" readOnly value={selectedWorker.identificacion} className="w-full p-2.5 bg-surface-secondary border border-border-medium rounded-xl text-sm font-semibold text-text-primary outline-none" />
                </div>
              </div>

              {/* Nombre EPP (con datalist de sugerencias) */}
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-bold text-text-secondary">Nombre del EPP / Elemento</label>
                <input
                  list="epp-suggestions"
                  placeholder="Ej. Gafas de seguridad"
                  value={formEppName}
                  onChange={e => setFormEppName(e.target.value)}
                  className="w-full p-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                />
                <datalist id="epp-suggestions">
                  {suggestionsList.map((item, idx) => (
                    <option key={idx} value={item} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-text-secondary">Tipo de EPP</label>
                  <select
                    value={formTipo}
                    onChange={e => setFormTipo(e.target.value as 'Regular' | 'Alturas')}
                    className="w-full p-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-semibold"
                  >
                    <option value="Regular">Regular (Estándar)</option>
                    <option value="Alturas">Protección Alturas (Arnés/Eslinga)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-text-secondary">Cantidad Suministrada</label>
                  <input
                    type="number"
                    min={1}
                    value={formCantidad}
                    onChange={e => setFormCantidad(parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-text-secondary">Fecha de Entrega</label>
                  <input
                    type="date"
                    value={formFechaEntrega}
                    onChange={e => handleFechaEntregaChange(e.target.value)}
                    className="w-full p-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-text-secondary">Frecuencia de Cambio (Meses)</label>
                  <select
                    value={formVencimientoInterval}
                    onChange={e => handleIntervalChange(e.target.value)}
                    className="w-full p-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all font-semibold"
                  >
                    <option value="3">Cada 3 Meses</option>
                    <option value="6">Cada 6 Meses (Estándar)</option>
                    <option value="12">Cada 12 Meses</option>
                    <option value="never">Vitalicio / Sin Vencimiento</option>
                  </select>
                </div>
              </div>

              {/* CAMPOS ADICIONALES PARA EQUIPOS DE ALTURAS */}
              {formTipo === 'Alturas' && (
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <h4 className="text-xs uppercase font-extrabold text-blue-400 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" /> Datos de Trazabilidad Alturas (Resolución 4272)
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Marca</label>
                      <input
                        type="text"
                        placeholder="Ej. Petzl"
                        value={formMarca}
                        onChange={e => setFormMarca(e.target.value)}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Referencia</label>
                      <input
                        type="text"
                        placeholder="Ej. Newton"
                        value={formReferencia}
                        onChange={e => setFormReferencia(e.target.value)}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Serial Único</label>
                      <input
                        type="text"
                        placeholder="Ej. S12345-2026"
                        value={formSerial}
                        onChange={e => setFormSerial(e.target.value)}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Última Inspección</label>
                      <input
                        type="date"
                        value={formFechaUltimaInspeccion}
                        onChange={e => handleLastInspeccionChange(e.target.value)}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Próxima Inspección Anual</label>
                      <input
                        type="date"
                        value={formFechaProximaInspeccion}
                        onChange={e => setFormFechaProximaInspeccion(e.target.value)}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none font-bold text-blue-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Inspector Competente</label>
                      <input
                        type="text"
                        placeholder="Nombre del inspector"
                        value={formInspeccionadoPor}
                        onChange={e => setFormInspeccionadoPor(e.target.value)}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-2xs uppercase font-bold text-text-secondary">Resultado de Inspección</label>
                      <select
                        value={formResultadoInspeccion}
                        onChange={e => setFormResultadoInspeccion(e.target.value as 'Aprobado' | 'Rechazado' | 'N/A')}
                        className="w-full p-2 bg-surface-primary border border-border-medium rounded-lg text-xs text-text-primary outline-none font-semibold"
                      >
                        <option value="Aprobado">Aprobado para Servicio</option>
                        <option value="Rechazado">Rechazado / Retirar</option>
                        <option value="N/A">Sin evaluación</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* FIRMA DE CONFORMIDAD DEL TRABAJADOR */}
              <div className="p-4 border border-border-light dark:border-white/5 bg-surface-secondary/20 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs uppercase font-bold text-text-primary flex items-center gap-1.5">
                    <FileSignature className="w-4 h-4 text-teal-500" /> Firma de Recibido y Compromiso
                  </h4>
                  {formSignature ? (
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded text-[10px]">
                        Firma Dibujada Activa
                      </span>
                      {selectedWorker.firmaDigital && (
                        <button
                          onClick={() => setFormSignature(null)}
                          className="text-xs font-bold text-teal-500 hover:underline"
                        >
                          Usar Registrada
                        </button>
                      )}
                    </div>
                  ) : selectedWorker.firmaDigital ? (
                    <div className="flex items-center gap-2">
                      <span className="bg-teal-500/10 text-teal-400 font-bold px-2 py-0.5 rounded text-[10px]">
                        Firma Registrada Vinculada
                      </span>
                      <button
                        onClick={() => setIsSignatureOpen(true)}
                        className="text-xs font-bold text-teal-500 hover:underline"
                      >
                        Dibujar Alternativa
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsSignatureOpen(true)}
                      className="text-xs font-bold text-teal-500 hover:underline"
                    >
                      {formSignature ? 'Cambiar Firma' : 'Dibujar Firma en Pantalla'}
                    </button>
                  )}
                </div>

                {formSignature ? (
                  <div className="flex items-center gap-4 bg-teal-500/5 p-3 rounded-xl border border-teal-500/20">
                    <img src={formSignature} style={{ maxHeight: '40px' }} className="bg-white rounded p-1" />
                    <p className="text-2xs text-text-secondary leading-relaxed">
                      Firma manuscrita capturada en pantalla para esta entrega.
                    </p>
                    <button 
                      onClick={() => setFormSignature(null)} 
                      className="text-red-400 font-bold text-xs hover:underline ml-auto"
                    >
                      Remover
                    </button>
                  </div>
                ) : selectedWorker.firmaDigital ? (
                  <div className="flex items-center gap-4 bg-teal-500/5 p-3 rounded-xl border border-teal-500/20">
                    <img src={selectedWorker.firmaDigital} style={{ maxHeight: '40px' }} className="bg-white rounded p-1" />
                    <p className="text-2xs text-text-secondary leading-relaxed">
                      Se utilizará automáticamente la firma digital registrada en su ficha sociodemográfica como recibí conforme.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-5 border border-dashed border-border-medium rounded-xl text-center text-text-tertiary">
                    <div className="space-y-1.5">
                      <AlertCircle className="w-5 h-5 mx-auto text-amber-500 opacity-80" />
                      <p className="text-xs font-semibold">El trabajador no tiene firma guardada ni firma manuscrita para esta entrega.</p>
                      <button 
                        onClick={() => setIsSignatureOpen(true)}
                        className="text-xs text-teal-500 font-bold hover:underline block mt-1"
                      >
                        Dibujar firma ahora
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-bold text-text-secondary">Observaciones / Detalles</label>
                <textarea
                  placeholder="Ej. Talla M, entregado sin novedad."
                  value={formObservaciones}
                  onChange={e => setFormObservaciones(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
                />
              </div>

            </div>

            <div className="p-6 border-t border-border-light dark:border-white/10 bg-surface-secondary/40 flex justify-end gap-3">
              <button
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                disabled={loading}
                className="px-4 py-2 border border-border-medium hover:bg-surface-hover text-text-primary rounded-xl font-bold text-sm transition-colors shadow-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEpp}
                disabled={loading}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                Guardar Registro
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Signature Pad Portal */}
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
        tags={['sgsst-epp']} 
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
