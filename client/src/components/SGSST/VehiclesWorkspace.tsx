import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuthContext } from '~/hooks';
import { useToastContext } from '@librechat/client';
import { 
  Car, 
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
import { exportVehiclesToExcel } from './exportVehicles';
import { saveAs } from 'file-saver';
import { SGSSTToolbar } from './SGSSTToolbar';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import CollapsibleReportBox from './CollapsibleReportBox';
import ExportDropdown from './ExportDropdown';
import { UpgradeWall } from './UpgradeWall';

interface InspeccionVehicular {
  fecha: string;
  kilometraje: number;
  luces: 'Bueno' | 'Malo';
  frenos: 'Bueno' | 'Malo';
  llantas: 'Bueno' | 'Malo';
  direccion: 'Bueno' | 'Malo';
  cinturones: 'Bueno' | 'Malo';
  resultado: 'Aprobado' | 'Rechazado';
  firmaConductor?: string;
  observaciones?: string;
}

interface VehicleDoc {
  placa: string;
  marca: string;
  referencia: string;
  modelo: string;
  anio?: number;
  tipo: string;
  conductorId: string;
  conductorNombre: string;
  soatVencimiento: string;
  tecnomecanicaVencimiento?: string;
  ultimoMantenimiento?: string;
  proximoMantenimiento?: string;
  kilometrajeActual: number;
  inspecciones: InspeccionVehicular[];
}

interface SocioWorker {
  id: string;
  nombre: string;
  identificacion: string;
  cargo: string;
}

export default function VehiclesWorkspace() {
  const { token, user } = useAuthContext();
  const { showToast } = useToastContext();

  const [vehicles, setVehicles] = useState<VehicleDoc[]>([]);
  const [workers, setWorkers] = useState<SocioWorker[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDoc | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewVehModalOpen, setIsNewVehModalOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Collapsible states
  const [isDatesExpanded, setIsDatesExpanded] = useState(true);
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

  const handleGenerate = useCallback(async () => {
    if (!selectedVehicle) {
      showToast({ message: 'Seleccione un vehículo primero', status: 'warning' });
      return;
    }
    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-vehicles`, { headers: { Authorization: `Bearer ${token}` } });
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
      const response = await fetch('/api/sgsst/vehicles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          placa: selectedVehicle.placa,
          marca: selectedVehicle.marca,
          referencia: selectedVehicle.referencia,
          modelo: selectedVehicle.modelo,
          anio: selectedVehicle.anio,
          tipo: selectedVehicle.tipo,
          conductorNombre: selectedVehicle.conductorNombre,
          soatVencimiento: selectedVehicle.soatVencimiento,
          tecnomecanicaVencimiento: selectedVehicle.tecnomecanicaVencimiento,
          ultimoMantenimiento: selectedVehicle.ultimoMantenimiento,
          proximoMantenimiento: selectedVehicle.proximoMantenimiento,
          kilometrajeActual: selectedVehicle.kilometrajeActual,
          inspecciones: selectedVehicle.inspecciones || [],
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
  }, [selectedVehicle, selectedModel, token, isPro, conversationId, showToast]);

  const handleSave = useCallback(async () => {
    const contentToSave = editorContentRef.current || generatedReport;
    if (!contentToSave || !token) return;

    const isNew = !conversationId || conversationId === 'new';
    if (!isPro && isNew) {
      try {
        const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-vehicles`, { headers: { Authorization: `Bearer ${token}` } });
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
          title: `Informe Vehículo - ${selectedVehicle?.placa} - ${new Date().toLocaleDateString('es-CO')}`,
          tags: ['sgsst-vehicles'],
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
  }, [generatedReport, conversationId, reportMessageId, token, isPro, selectedVehicle, showToast]);

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

  // Form states (Pre-operacional)
  const [formFecha, setFormFecha] = useState(new Date().toISOString().substring(0, 10));
  const [formKilometraje, setFormKilometraje] = useState<number>(0);
  const [formLuces, setFormLuces] = useState<'Bueno' | 'Malo'>('Bueno');
  const [formFrenos, setFormFrenos] = useState<'Bueno' | 'Malo'>('Bueno');
  const [formLlantas, setFormLlantas] = useState<'Bueno' | 'Malo'>('Bueno');
  const [formDireccion, setFormDireccion] = useState<'Bueno' | 'Malo'>('Bueno');
  const [formCinturones, setFormCinturones] = useState<'Bueno' | 'Malo'>('Bueno');
  const [formResultado, setFormResultado] = useState<'Aprobado' | 'Rechazado'>('Aprobado');
  const [formSignature, setFormSignature] = useState<string | null>(null);
  const [formObservaciones, setFormObservaciones] = useState('');

  // New Vehicle states
  const [newPlaca, setNewPlaca] = useState('');
  const [newMarca, setNewMarca] = useState('');
  const [newReferencia, setNewReferencia] = useState('');
  const [newModelo, setNewModelo] = useState('');
  const [newAnio, setNewAnio] = useState<number>(new Date().getFullYear());
  const [newTipo, setNewTipo] = useState('Automóvil');
  const [newConductorIdx, setNewConductorIdx] = useState<number>(0);
  const [newSoat, setNewSoat] = useState('');
  const [newTecno, setNewTecno] = useState('');
  const [newUltMaint, setNewUltMaint] = useState('');
  const [newProxMaint, setNewProxMaint] = useState('');
  const [newKm, setNewKm] = useState<number>(0);

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

      const vRes = await fetch('/api/sgsst/vehicles/data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const vData = await vRes.json();
      setVehicles(vData || []);
    } catch (err) {
      console.error('[Vehicles Workspace] Fetch error:', err);
      showToast({ message: 'Error al cargar los datos de vehículos', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const resetForm = () => {
    setFormFecha(new Date().toISOString().substring(0, 10));
    setFormKilometraje(selectedVehicle?.kilometrajeActual || 0);
    setFormLuces('Bueno');
    setFormFrenos('Bueno');
    setFormLlantas('Bueno');
    setFormDireccion('Bueno');
    setFormCinturones('Bueno');
    setFormResultado('Aprobado');
    setFormSignature(null);
    setFormObservaciones('');
  };

  const resetNewVehForm = () => {
    setNewPlaca('');
    setNewMarca('');
    setNewReferencia('');
    setNewModelo('');
    setNewAnio(new Date().getFullYear());
    setNewTipo('Automóvil');
    setNewConductorIdx(0);
    setNewSoat('');
    setNewTecno('');
    setNewUltMaint('');
    setNewProxMaint('');
    setNewKm(0);
  };

  // Guardar Pre-operacional
  const handleSaveInspection = async () => {
    if (!selectedVehicle) return;
    if (!formKilometraje) {
      showToast({ message: 'Ingrese el kilometraje actual', status: 'warning' });
      return;
    }
    if (!formSignature) {
      showToast({ message: 'Se requiere la firma del conductor', status: 'warning' });
      return;
    }

    setLoading(true);

    const newInsp: InspeccionVehicular = {
      fecha: formFecha,
      kilometraje: Number(formKilometraje),
      luces: formLuces,
      frenos: formFrenos,
      llantas: formLlantas,
      direccion: formDireccion,
      cinturones: formCinturones,
      resultado: formResultado,
      firmaConductor: formSignature,
      observaciones: formObservaciones
    };

    const updatedInspecciones = [...selectedVehicle.inspecciones, newInsp];
    const payload = {
      ...selectedVehicle,
      kilometrajeActual: Number(formKilometraje),
      inspecciones: updatedInspecciones
    };

    try {
      const res = await fetch('/api/sgsst/vehicles/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast({ message: 'Inspección pre-operacional guardada correctamente', status: 'success' });
        // Recargar
        const updatedList = vehicles.map(v => v.placa === selectedVehicle.placa ? data.data : v);
        setVehicles(updatedList);
        setSelectedVehicle(data.data);
        setIsModalOpen(false);
        resetForm();
      } else {
        showToast({ message: data.error || 'Error al guardar inspección', status: 'error' });
      }
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error de servidor al guardar inspección', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Crear nuevo vehículo
  const handleCreateVehicle = async () => {
    if (!newPlaca || !newMarca || !newSoat) {
      showToast({ message: 'Placa, Marca y SOAT son requeridos', status: 'warning' });
      return;
    }
    const cond = workers[newConductorIdx];
    if (!cond) {
      showToast({ message: 'Seleccione un conductor válido', status: 'warning' });
      return;
    }

    setLoading(true);
    const payload = {
      placa: newPlaca.trim().toUpperCase(),
      marca: newMarca,
      referencia: newReferencia,
      modelo: newModelo,
      anio: Number(newAnio),
      tipo: newTipo,
      conductorId: cond.id,
      conductorNombre: cond.nombre,
      soatVencimiento: newSoat,
      tecnomecanicaVencimiento: newTecno,
      ultimoMantenimiento: newUltMaint,
      proximoMantenimiento: newProxMaint,
      kilometrajeActual: Number(newKm),
      inspecciones: []
    };

    try {
      const res = await fetch('/api/sgsst/vehicles/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast({ message: 'Vehículo registrado exitosamente', status: 'success' });
        setVehicles([...vehicles, data.data]);
        setSelectedVehicle(data.data);
        setIsNewVehModalOpen(false);
        resetNewVehForm();
      } else {
        showToast({ message: data.error || 'Error al guardar vehículo', status: 'error' });
      }
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error de servidor al registrar vehículo', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      showToast({ message: 'Generando reporte de Excel...', status: 'info' });
      await exportVehiclesToExcel(vehicles);
      showToast({ message: 'Reporte Excel generado correctamente', status: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Error al exportar a Excel', status: 'error' });
    }
  };

  const buildHtmlActa = (veh: VehicleDoc, insp: InspeccionVehicular) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Inspección Pre-Operacional — ${veh.placa}</title>
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
          <div class="title">Lista de Chequeo Pre-operacional PESV<br><span style="font-size:11px; font-weight:normal; color:#64748b;">SG-SST Ley 1503 de 2011</span></div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Vehículo / Placa</div><strong>${veh.placa} (${veh.marca} ${veh.modelo})</strong></div>
          <div class="meta-item"><div class="meta-label">Conductor</div><strong>${veh.conductorNombre}</strong></div>
          <div class="meta-item"><div class="meta-label">Fecha Inspección</div><strong>${insp.fecha}</strong></div>
          <div class="meta-item"><div class="meta-label">Kilometraje</div><strong>${insp.kilometraje} Km</strong></div>
        </div>

        <h3 style="color:#0f766e; border-bottom:1px solid #e2e8f0; padding-bottom:5px; margin-bottom:15px; text-transform:uppercase; font-size:14px;">Evaluación de Sistemas Críticos</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Sistema / Aspecto Evaluado</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Sistema de Luces (Altas, bajas, direccionales, freno)</td><td><strong>${insp.luces}</strong></td></tr>
            <tr><td>Sistema de Frenos (Freno de pedal y de mano)</td><td><strong>${insp.frenos}</strong></td></tr>
            <tr><td>Llantas (Labrado, desgaste y presión de aire)</td><td><strong>${insp.llantas}</strong></td></tr>
            <tr><td>Dirección y Amortiguación</td><td><strong>${insp.direccion}</strong></td></tr>
            <tr><td>Cinturones de Seguridad y Apoyacabezas</td><td><strong>${insp.cinturones}</strong></td></tr>
            <tr><td><strong>Resultado General de la Inspección</strong></td><td><strong>${insp.resultado}</strong></td></tr>
          </tbody>
        </table>

        <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:30px;">
          <strong>Observaciones:</strong> ${insp.observaciones || 'Ninguna.'}
        </div>

        <div class="signatures">
          <div class="signature-box">
            ${insp.firmaConductor ? `<img class="signature-img" src="${insp.firmaConductor}" />` : '<div style="height:60px;"></div>'}
            <strong>${veh.conductorNombre}</strong><br>Conductor / Declaro Conforme
          </div>
          <div class="signature-box">
            <div style="height:60px;"></div>
            <strong>Responsable de Flota / PESV</strong><br>Verificado
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintInspection = (insp: InspeccionVehicular) => {
    if (!selectedVehicle) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let html = buildHtmlActa(selectedVehicle, insp);
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

  const handleDownloadInspectionHtml = (insp: InspeccionVehicular) => {
    if (!selectedVehicle) return;
    const html = buildHtmlActa(selectedVehicle, insp);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `Inspeccion_PESV_${selectedVehicle.placa}_${insp.fecha}.html`);
  };

  const filteredVehicles = vehicles.filter(v => 
    v.placa.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.conductorNombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col xl:flex-row h-[780px] w-full border border-border-light dark:border-white/10 rounded-3xl bg-surface-primary shadow-lg overflow-hidden animate-in fade-in duration-200">
      
      {/* ── SECTOR IZQUIERDO: LISTA DE VEHÍCULOS ── */}
      <div className="w-full xl:w-96 border-r border-border-light dark:border-white/10 flex flex-col bg-surface-secondary/40 shrink-0">
        <div className="p-5 border-b border-border-light dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
              <Car className="w-5 h-5 text-teal-500" /> Vehículos PESV
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border-medium hover:border-[#0d9488]/40 hover:bg-[#0d9488]/10 text-teal-600 dark:text-teal-400 font-extrabold text-2xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <span className="bg-teal-500/10 text-teal-400 text-xs px-2.5 py-1 rounded-full font-bold">
                {vehicles.length}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-text-secondary" />
              <input
                type="text"
                placeholder="Buscar placa o conductor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-primary border border-border-medium rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all"
              />
            </div>
            <button
              onClick={() => setIsNewVehModalOpen(true)}
              className="p-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm transition-colors"
              title="Registrar nuevo vehículo"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredVehicles.map(v => {
            const isSelected = selectedVehicle?.placa === v.placa;
            return (
              <button
                key={v.placa}
                onClick={() => {
                  setSelectedVehicle(v);
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
                    <Car className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-sm text-text-primary truncate">{v.placa}</p>
                    <p className="text-xs text-text-secondary truncate mt-0.5">{v.conductorNombre}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SECTOR DERECHO: DETALLE DEL VEHÍCULO ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface-primary">
        {selectedVehicle ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-secondary/20">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-text-primary">{selectedVehicle.placa}</h2>
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-text-secondary">
                  <span>{selectedVehicle.marca} {selectedVehicle.modelo}</span>
                  <span>•</span>
                  <span>Conductor: <strong className="text-teal-500">{selectedVehicle.conductorNombre}</strong></span>
                </div>
              </div>

                <SGSSTToolbar
                  onAnalyze={handleGenerate}
                  isAnalyzing={isGenerating}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                  exportContent={selectedVehicle && selectedVehicle.inspecciones && selectedVehicle.inspecciones.length > 0 ? buildHtmlActa(selectedVehicle, selectedVehicle.inspecciones[selectedVehicle.inspecciones.length - 1]) : ''}
                  exportFileName={`Inspeccion_PESV_${selectedVehicle.placa}`}
                  persistenceButtons={[
                    {
                      id: 'add-inspection',
                      onClick: () => setIsModalOpen(true),
                      label: 'Inspección Pre-operacional',
                      title: 'Registrar nueva inspección pre-operacional del vehículo',
                      icon: Plus,
                      variant: 'ai'
                    }
                  ]}
                  onExportExcel={handleExportExcel}
                />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Fechas Importantes */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsDatesExpanded(!isDatesExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isDatesExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Calendar className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Fechas Importantes</span>
                  </div>
                </button>
                {isDatesExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border border-border-light dark:border-white/5 rounded-xl bg-surface-secondary/20 space-y-1">
                      <span className="text-3xs uppercase font-bold text-text-secondary">Vencimiento SOAT</span>
                      <p className="text-sm font-bold text-text-primary">{selectedVehicle.soatVencimiento}</p>
                    </div>
                    <div className="p-4 border border-border-light dark:border-white/5 rounded-xl bg-surface-secondary/20 space-y-1">
                      <span className="text-3xs uppercase font-bold text-text-secondary">Vencimiento Técnico-Mecánica</span>
                      <p className="text-sm font-bold text-text-primary">{selectedVehicle.tecnomecanicaVencimiento || 'No registrado'}</p>
                    </div>
                    <div className="p-4 border border-border-light dark:border-white/5 rounded-xl bg-surface-secondary/20 space-y-1">
                      <span className="text-3xs uppercase font-bold text-text-secondary">Próximo Mantenimiento</span>
                      <p className="text-sm font-bold text-text-primary">{selectedVehicle.proximoMantenimiento || 'No registrado'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Historial de Inspecciones */}
              <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
                <button 
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} 
                  className="w-full flex items-center justify-between p-4 bg-surface-tertiary"
                >
                  <div className="flex items-center gap-2">
                    {isHistoryExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <ClipboardList className="w-5 h-5 text-teal-500" />
                    <span className="font-semibold text-text-primary">Historial de Inspecciones Pre-operacionales</span>
                  </div>
                </button>
                {isHistoryExpanded && (
                  <div className="p-5 border-t border-border-medium bg-surface-primary space-y-3.5">
                    <div className="border border-border-light dark:border-white/5 rounded-2xl overflow-hidden shadow-sm bg-surface-primary">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-surface-secondary text-text-secondary font-bold border-b border-border-light dark:border-white/5">
                            <th className="p-3">Fecha</th>
                            <th className="p-3">Kilometraje</th>
                            <th className="p-3 text-center">Luces</th>
                            <th className="p-3 text-center">Frenos</th>
                            <th className="p-3 text-center">Llantas</th>
                            <th className="p-3 text-center">Resultado</th>
                            <th className="p-3 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedVehicle.inspecciones.map((insp, idx) => (
                            <tr key={idx} className="border-b border-border-light dark:border-white/5 hover:bg-surface-hover/30 transition-colors">
                              <td className="p-3 font-semibold text-text-primary">{insp.fecha}</td>
                              <td className="p-3 text-text-secondary">{insp.kilometraje} Km</td>
                              <td className="p-3 text-center">{insp.luces === 'Bueno' ? '✅' : '❌'}</td>
                              <td className="p-3 text-center">{insp.frenos === 'Bueno' ? '✅' : '❌'}</td>
                              <td className="p-3 text-center">{insp.llantas === 'Bueno' ? '✅' : '❌'}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${insp.resultado === 'Aprobado' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                  {insp.resultado}
                                </span>
                              </td>
                              <td className="p-3 text-right space-x-2">
                                <button
                                  onClick={() => handlePrintInspection(insp)}
                                  className="text-teal-500 hover:text-teal-400 font-bold hover:underline"
                                >
                                  PDF
                                </button>
                                <button
                                  onClick={() => handleDownloadInspectionHtml(insp)}
                                  className="text-blue-500 hover:text-blue-400 font-bold hover:underline"
                                >
                                  HTML
                                </button>
                              </td>
                            </tr>
                          ))}
                          {selectedVehicle.inspecciones.length === 0 && (
                            <tr>
                              <td colSpan={7} className="p-6 text-center text-text-tertiary italic">
                                No se han registrado inspecciones pre-operacionales para este vehículo.
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
            <Car className="w-16 h-16 mb-4 text-teal-600 opacity-20" />
            <p className="text-sm font-semibold">Seleccione un vehículo de la lista o registre uno nuevo para comenzar.</p>
          </div>
        )}
      </div>
    </div>

      {/* Editor de Informe de Vehículo (Nivel Raíz — Siempre Visible a Todo Ancho) */}
      <CollapsibleReportBox
        onSave={handleSave}
        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        isHistoryOpen={isHistoryOpen}
        title="Informe IA - Control Vehicular (PESV)"
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <ExportDropdown
            content={editorContentRef.current || generatedReport || ''}
            fileName={`Informe_Vehiculo_${selectedVehicle?.placa || 'General'}`}
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
            reportSourceData={{ vehicle: selectedVehicle }}
          />
        </div>
      </CollapsibleReportBox>

      {/* Modal: Registrar Inspección Pre-operacional */}
      {isModalOpen && selectedVehicle && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface-primary border border-border-light dark:border-white/10 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex justify-between items-center bg-surface-secondary/40">
              <h3 className="text-base font-extrabold text-text-primary flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-teal-500" /> Inspección: {selectedVehicle.placa}
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
                  <label className="text-2xs uppercase font-bold text-text-secondary">Fecha</label>
                  <input
                    type="date"
                    value={formFecha}
                    onChange={e => setFormFecha(e.target.value)}
                    className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Kilometraje Actual</label>
                  <input
                    type="number"
                    value={formKilometraje}
                    onChange={e => setFormKilometraje(Number(e.target.value))}
                    className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs outline-none"
                  />
                </div>
              </div>

              {/* Checks */}
              <div className="space-y-2 border-t border-b border-border-light dark:border-white/5 py-4">
                <div className="flex justify-between items-center text-xs">
                  <span>Luces (Altas, bajas, freno)</span>
                  <div className="space-x-2">
                    <button onClick={() => setFormLuces('Bueno')} className={`px-2 py-1 rounded font-bold ${formLuces === 'Bueno' ? 'bg-green-500/20 text-green-400' : 'bg-surface-secondary'}`}>Bueno</button>
                    <button onClick={() => setFormLuces('Malo')} className={`px-2 py-1 rounded font-bold ${formLuces === 'Malo' ? 'bg-red-500/20 text-red-400' : 'bg-surface-secondary'}`}>Malo</button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>Sistema de Frenos</span>
                  <div className="space-x-2">
                    <button onClick={() => setFormFrenos('Bueno')} className={`px-2 py-1 rounded font-bold ${formFrenos === 'Bueno' ? 'bg-green-500/20 text-green-400' : 'bg-surface-secondary'}`}>Bueno</button>
                    <button onClick={() => setFormFrenos('Malo')} className={`px-2 py-1 rounded font-bold ${formFrenos === 'Malo' ? 'bg-red-500/20 text-red-400' : 'bg-surface-secondary'}`}>Malo</button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>Llantas (Presión y Labrado)</span>
                  <div className="space-x-2">
                    <button onClick={() => setFormLlantas('Bueno')} className={`px-2 py-1 rounded font-bold ${formLlantas === 'Bueno' ? 'bg-green-500/20 text-green-400' : 'bg-surface-secondary'}`}>Bueno</button>
                    <button onClick={() => setFormLlantas('Malo')} className={`px-2 py-1 rounded font-bold ${formLlantas === 'Malo' ? 'bg-red-500/20 text-red-400' : 'bg-surface-secondary'}`}>Malo</button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>Dirección y Suspensión</span>
                  <div className="space-x-2">
                    <button onClick={() => setFormDireccion('Bueno')} className={`px-2 py-1 rounded font-bold ${formDireccion === 'Bueno' ? 'bg-green-500/20 text-green-400' : 'bg-surface-secondary'}`}>Bueno</button>
                    <button onClick={() => setFormDireccion('Malo')} className={`px-2 py-1 rounded font-bold ${formDireccion === 'Malo' ? 'bg-red-500/20 text-red-400' : 'bg-surface-secondary'}`}>Malo</button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>Cinturones de Seguridad</span>
                  <div className="space-x-2">
                    <button onClick={() => setFormCinturones('Bueno')} className={`px-2 py-1 rounded font-bold ${formCinturones === 'Bueno' ? 'bg-green-500/20 text-green-400' : 'bg-surface-secondary'}`}>Bueno</button>
                    <button onClick={() => setFormCinturones('Malo')} className={`px-2 py-1 rounded font-bold ${formCinturones === 'Malo' ? 'bg-red-500/20 text-red-400' : 'bg-surface-secondary'}`}>Malo</button>
                  </div>
                </div>
              </div>

              {/* Resultado General */}
              <div className="space-y-1">
                <label className="text-2xs uppercase font-bold text-text-secondary">Dictamen General</label>
                <select
                  value={formResultado}
                  onChange={e => setFormResultado(e.target.value as 'Aprobado' | 'Rechazado')}
                  className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs"
                >
                  <option value="Aprobado">Aprobado para Transitar</option>
                  <option value="Rechazado">No Conforme - Detener Operación</option>
                </select>
              </div>

              {/* Firma del Conductor */}
              <div className="p-3 border border-border-light dark:border-white/5 rounded-2xl bg-surface-secondary/20 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xs uppercase font-bold text-text-secondary">Firma del Conductor</span>
                  <button onClick={() => setIsSignatureOpen(true)} className="text-xs text-teal-500 font-bold hover:underline">
                    {formSignature ? 'Cambiar Firma' : 'Firmar en Pantalla'}
                  </button>
                </div>
                {formSignature ? (
                  <div className="flex items-center gap-4 bg-teal-500/5 p-2 rounded-lg border border-teal-500/20">
                    <img src={formSignature} style={{ maxHeight: '35px' }} className="bg-white rounded p-1" />
                    <button onClick={() => setFormSignature(null)} className="text-red-400 text-xs ml-auto font-bold hover:underline">Remover</button>
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
              <button onClick={handleSaveInspection} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs">Guardar Inspección</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Nuevo Vehículo */}
      {isNewVehModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-surface-primary border border-border-light dark:border-white/10 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-border-light dark:border-white/10 flex justify-between items-center bg-surface-secondary/40">
              <h3 className="text-base font-extrabold text-text-primary flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-500" /> Registrar Vehículo PESV
              </h3>
              <button 
                onClick={() => setIsNewVehModalOpen(false)}
                className="rounded-xl p-2 text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Placa *</label>
                  <input type="text" placeholder="ABC-123" value={newPlaca} onChange={e => setNewPlaca(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Tipo de Vehículo</label>
                  <select value={newTipo} onChange={e => setNewTipo(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                    <option value="Automóvil">Automóvil</option>
                    <option value="Motocicleta">Motocicleta</option>
                    <option value="Camioneta">Camioneta</option>
                    <option value="Camión">Camión</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Marca *</label>
                  <input type="text" value={newMarca} onChange={e => setNewMarca(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Modelo / Año</label>
                  <input type="number" value={newAnio} onChange={e => setNewAnio(Number(e.target.value))} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-2xs uppercase font-bold text-text-secondary">Conductor Asignado *</label>
                <select value={newConductorIdx} onChange={e => setNewConductorIdx(Number(e.target.value))} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs">
                  {workers.map((w, idx) => (
                    <option key={w.id} value={idx}>{w.nombre} (C.C. {w.identificacion})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Vencimiento SOAT *</label>
                  <input type="date" value={newSoat} onChange={e => setNewSoat(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Vencimiento Técnico-Mecánica</label>
                  <input type="date" value={newTecno} onChange={e => setNewTecno(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Kilometraje Actual</label>
                  <input type="number" value={newKm} onChange={e => setNewKm(Number(e.target.value))} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-2xs uppercase font-bold text-text-secondary">Próximo Mantenimiento</label>
                  <input type="date" value={newProxMaint} onChange={e => setNewProxMaint(e.target.value)} className="w-full p-2 bg-surface-secondary border border-border-medium rounded-lg text-xs" />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border-light dark:border-white/10 bg-surface-secondary/40 flex justify-end gap-3">
              <button onClick={() => setIsNewVehModalOpen(false)} className="px-4 py-2 border border-border-medium text-text-primary rounded-xl font-bold text-xs">Cancelar</button>
              <button onClick={handleCreateVehicle} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs">Registrar Vehículo</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <SignaturePad
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onSave={setFormSignature}
        title={`Firma Conductor: ${selectedVehicle?.conductorNombre}`}
      />

      <ReportHistory 
        onSelectReport={handleSelectReport} 
        isOpen={isHistoryOpen} 
        toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)} 
        refreshTrigger={refreshTrigger} 
        tags={['sgsst-vehicles']} 
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
