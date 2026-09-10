import React, { useState, useCallback, useRef } from 'react';
import { UpgradeWall } from './UpgradeWall';
import {
    Loader2,
    ChevronDown,
    ChevronRight,
    Camera,
    X,
    Plus,
    Trash2,
    Activity,
    AlertCircle,
    Download,
    Video,
    Film,
    Save,
} from 'lucide-react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import LiveEditor, { type LiveEditorHandle } from '~/components/Liva/Editor/LiveEditor';
import ReportHistory from '~/components/Liva/ReportHistory';
import ModelSelector from './ModelSelector';
import ExportDropdown from './ExportDropdown';
import { AnimatedIcon } from '~/components/ui/AnimatedIcon';
import { DummyGenerateButton } from '~/components/ui/DummyGenerateButton';
import { generateDummyData } from '~/utils/dummyDataGenerator';
import { useAutoLoadReport } from './useAutoLoadReport';
import SGSSTToolbar from './SGSSTToolbar';
import SingleSelect from './SingleSelect';
import CollapsibleReportBox from './CollapsibleReportBox';

// ─── OWAS Risk Category Table (server-side mirror for instant UI feedback) ───
const OWAS_TABLE: Record<string, number> = {
  '1111':1,'1112':1,'1113':1,'1121':1,'1122':1,'1123':1,'1131':1,'1132':1,'1133':1,
  '1141':1,'1142':1,'1143':1,'1151':1,'1152':1,'1153':1,'1161':1,'1162':1,'1163':1,
  '1171':1,'1172':1,'1173':1,'1211':1,'1212':1,'1213':1,'1221':1,'1222':1,'1223':1,
  '1231':1,'1232':1,'1233':1,'1241':1,'1242':1,'1243':1,'1251':1,'1252':1,'1253':1,
  '1261':1,'1262':1,'1263':1,'1271':1,'1272':1,'1273':1,'1311':1,'1312':1,'1313':1,
  '1321':1,'1322':1,'1323':1,'1331':1,'1332':1,'1333':1,'1341':1,'1342':1,'1343':1,
  '1351':1,'1352':1,'1353':1,'1361':1,'1362':1,'1363':1,'1371':1,'1372':1,'1373':1,
  '2111':2,'2112':2,'2113':3,'2121':2,'2122':2,'2123':3,'2131':2,'2132':2,'2133':3,
  '2141':2,'2142':2,'2143':3,'2151':2,'2152':2,'2153':3,'2161':2,'2162':2,'2163':3,
  '2171':2,'2172':2,'2173':3,'2211':2,'2212':2,'2213':3,'2221':2,'2222':2,'2223':3,
  '2231':2,'2232':2,'2233':3,'2241':2,'2242':2,'2243':3,'2251':2,'2252':2,'2253':3,
  '2261':2,'2262':2,'2263':3,'2271':2,'2272':2,'2273':3,'2311':2,'2312':3,'2313':3,
  '2321':2,'2322':3,'2323':3,'2331':2,'2332':3,'2333':4,'2341':2,'2342':3,'2343':4,
  '2351':2,'2352':3,'2353':4,'2361':2,'2362':3,'2363':4,'2371':2,'2372':3,'2373':4,
  '3111':1,'3112':1,'3113':1,'3121':1,'3122':1,'3123':2,'3131':1,'3132':1,'3133':2,
  '3141':1,'3142':1,'3143':2,'3151':1,'3152':1,'3153':2,'3161':1,'3162':1,'3163':2,
  '3171':1,'3172':1,'3173':2,'3211':1,'3212':1,'3213':2,'3221':1,'3222':1,'3223':2,
  '3231':1,'3232':1,'3233':2,'3241':1,'3242':1,'3243':2,'3251':1,'3252':1,'3253':2,
  '3261':1,'3262':1,'3263':2,'3271':1,'3272':1,'3273':2,'3311':1,'3312':1,'3313':2,
  '3321':1,'3322':1,'3323':2,'3331':1,'3332':1,'3333':2,'3341':1,'3342':1,'3343':2,
  '3351':1,'3352':1,'3353':2,'3361':1,'3362':1,'3363':2,'3371':1,'3372':1,'3373':2,
  '4111':2,'4112':3,'4113':3,'4121':2,'4122':3,'4123':3,'4131':2,'4132':3,'4133':4,
  '4141':2,'4142':3,'4143':4,'4151':2,'4152':3,'4153':4,'4161':2,'4162':3,'4163':4,
  '4171':2,'4172':3,'4173':4,'4211':2,'4212':3,'4213':4,'4221':2,'4222':3,'4223':4,
  '4231':2,'4232':3,'4233':4,'4241':2,'4242':3,'4243':4,'4251':2,'4252':3,'4253':4,
  '4261':2,'4262':3,'4263':4,'4271':2,'4272':3,'4273':4,'4311':2,'4312':3,'4313':4,
  '4321':2,'4322':3,'4323':4,'4331':2,'4332':3,'4333':4,'4341':2,'4342':3,'4343':4,
  '4351':2,'4352':3,'4353':4,'4361':2,'4362':3,'4363':4,'4371':2,'4372':3,'4373':4,
};

function getOwasCategory(back: number, arms: number, legs: number, load: number): number {
  const key = `${back}${arms}${legs}${load}`;
  return OWAS_TABLE[key] || 1;
}

const ESPALDA_OPTIONS = [
  { value: 1, label: '1 – Derecha / Recta' },
  { value: 2, label: '2 – Inclinada hacia adelante' },
  { value: 3, label: '3 – Girada / Inclinada lateral' },
  { value: 4, label: '4 – Inclinada y girada' },
];
const BRAZOS_OPTIONS = [
  { value: 1, label: '1 – Ambos brazos por debajo del hombro' },
  { value: 2, label: '2 – Un brazo por encima del hombro' },
  { value: 3, label: '3 – Ambos brazos por encima del hombro' },
];
const PIERNAS_OPTIONS = [
  { value: 1, label: '1 – Sentado' },
  { value: 2, label: '2 – De pie, piernas rectas' },
  { value: 3, label: '3 – De pie, peso en una pierna' },
  { value: 4, label: '4 – De pie, rodillas flexionadas' },
  { value: 5, label: '5 – De pie, con una rodilla flexionada' },
  { value: 6, label: '6 – Arrodillado' },
  { value: 7, label: '7 – Caminando / en movimiento' },
];
const CARGA_OPTIONS = [
  { value: 1, label: '1 – Menos de 10 kg' },
  { value: 2, label: '2 – Entre 10 y 20 kg' },
  { value: 3, label: '3 – Más de 20 kg' },
];

const CAT_CONFIG: Record<number, { label: string; color: string; bg: string; border: string; action: string }> = {
  1: { label: 'Categoría 1', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', action: 'Sin riesgo. No se requieren acciones correctivas.' },
  2: { label: 'Categoría 2', color: '#ca8a04', bg: '#fefce8', border: '#fde68a', action: 'Riesgo moderado. Acciones correctivas en el corto plazo.' },
  3: { label: 'Categoría 3', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', action: 'Riesgo alto. Corregir tan pronto como sea posible.' },
  4: { label: 'Categoría 4', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', action: '¡Riesgo crítico! Medidas correctoras INMEDIATAS.' },
};

type Observacion = {
  id: string;
  descripcion: string;
  espalda: number;
  brazos: number;
  piernas: number;
  carga: number;
  espaldaLabel: string;
  brazosLabel: string;
  piernasLabel: string;
  cargaLabel: string;
};

const WorkerAutocomplete = ({
  value, onChange, onSelect, data, searchKey, placeholder, className, wrapperClassName
}: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: any) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = data.filter((w: any) => {
    const v = w[searchKey];
    if (!value) return true;
    return v && String(v).toLowerCase().includes(String(value).toLowerCase());
  });
  const exact = value && filtered.find((w: any) => String(w[searchKey]).toLowerCase() === String(value).toLowerCase());

  return (
    <div className={`relative ${wrapperClassName || 'w-full'}`} ref={wrapperRef}>
      <input type="text" value={value} onChange={e => { onChange(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} className={className} placeholder={placeholder} autoComplete="off" />
      {isOpen && filtered.length > 0 && !exact && (
        <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-auto bg-surface-primary border border-border-medium rounded-xl shadow-xl py-1 text-left">
          {filtered.map((w: any, idx: number) => (
            <li key={idx} className="px-4 py-2 text-sm cursor-pointer hover:bg-surface-hover" onClick={() => { if (onSelect) onSelect(w); else onChange(w[searchKey]); setIsOpen(false); }}>
              <div className="font-semibold">{w.nombre}</div>
              <div className="text-xs text-text-secondary">CC: {w.identificacion} {w.cargo ? `• ${w.cargo}` : ''}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const MetodoOwas = () => {
  const { showToast } = useToastContext();
  const { user, token } = useAuthContext();
    const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO' || Boolean(user?.isSubUser);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [formData, setFormData] = useState({
    cargo: '',
    area: '',
    tareaDescripcion: '',
    frecuenciaObservacion: 'Cada 30 segundos',
    actividadGlobal: '',
    foto1Desc: '', foto2Desc: '', foto3Desc: '',
    fecha: new Date().toISOString().split('T')[0],
    horaInicio: new Date().toTimeString().slice(0, 5),
  });

  const [observaciones, setObservaciones] = useState<Observacion[]>([]);
  const [currentObs, setCurrentObs] = useState<Partial<Observacion>>({
    descripcion: '', espalda: 1, brazos: 1, piernas: 1, carga: 1
  });

  const [images, setImages] = useState<{ [k: string]: string | null }>({ foto1: null, foto2: null, foto3: null });
  const [video, setVideo] = useState<string | null>(null);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [trabajadoresList, setTrabajadoresList] = useState([{ nombre: '', cedula: '' }]);
  const [responsablesList, setResponsablesList] = useState([{ nombre: '', cedula: '', rol: '' }]);
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);

  const [selectedModel, setSelectedModel] = useState(user?.personalization?.geminiModels?.sstManagement || 'gemini-3.7-flash');
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const editorContentRef = useRef<string>('');
    const liveEditorRef = useRef<LiveEditorHandle>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  React.useEffect(() => {
    if (user?.personalization?.geminiModels?.sstManagement) {
      setSelectedModel(user.personalization.geminiModels.sstManagement);
    }
  }, [user?.personalization?.geminiModels?.sstManagement]);
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);

  React.useEffect(() => {
    if (!token) return;
    fetch('/api/sgsst/perfil-sociodemografico/data', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.trabajadores?.length) setAvailableWorkers(d.trabajadores); })
      .catch(() => {});
  }, [token]);

  React.useEffect(() => {
    if (!token) return;
    fetch('/api/sgsst/metodo-owas/data', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (Object.keys(d.formData || {}).length > 0) setFormData(prev => ({ ...prev, ...d.formData }));
        if (d.observaciones?.length) setObservaciones(d.observaciones);
        if (d.trabajadoresList?.length) setTrabajadoresList(d.trabajadoresList);
        if (d.responsablesList?.length) setResponsablesList(d.responsablesList);
        if (d.images) setImages(d.images);
        if (d.video) setVideo(d.video);
      }).catch(() => {});
  }, [token]);

  const handleDummyData = () => {
    const dummy = generateDummyData.metodoOwas();
    setFormData(prev => ({
      ...prev,
      cargo: dummy.registros[0]?.cargoAnalizado || 'Operario de Embalaje',
      area: 'Planta de Producción – Línea 3',
      tareaDescripcion: 'Empaque manual de cajas y paletizado en banda transportadora',
      frecuenciaObservacion: 'Cada 30 segundos',
      actividadGlobal: 'Evaluación ergonómica realizada durante jornada completa. El operario realiza ciclos repetitivos de levantamiento, inclinación de tronco y colocación de cajas con peso promedio de 12 kg. Ambiente: temperatura 24°C, ritmo de trabajo medio-alto (180 ciclos/hora aproximadamente).',
    }));
    // Pre-load OWAS observations from the dummy generator
    const obsFromDummy: Observacion[] = dummy.registros.map((r: any, i: number) => ({
      id: (Date.now() + i).toString(),
      descripcion: r.tarea,
      espalda: parseInt(r.espalda),
      brazos: parseInt(r.brazos),
      piernas: parseInt(r.piernas),
      carga: parseInt(r.carga),
      espaldaLabel: ESPALDA_OPTIONS.find(o => o.value === parseInt(r.espalda))?.label || r.espalda,
      brazosLabel: BRAZOS_OPTIONS.find(o => o.value === parseInt(r.brazos))?.label || r.brazos,
      piernasLabel: PIERNAS_OPTIONS.find(o => o.value === parseInt(r.piernas))?.label || r.piernas,
      cargaLabel: CARGA_OPTIONS.find(o => o.value === parseInt(r.carga))?.label || r.carga,
    }));
    setObservaciones(obsFromDummy);
    setTrabajadoresList([{ nombre: 'Juan Carlos Mendoza', cedula: '12345678' }]);
    setResponsablesList([{ nombre: 'Ing. Marcela Salcedo', cedula: '98765432', rol: 'Responsable Ergonómica SST' }]);
    showToast({ message: `Datos OWAS simulados generados: ${obsFromDummy.length} observaciones cargadas.`, status: 'success', severity: 'success' });
  };

  const handleSaveData = async (silent = false) => {
    if (!token) return;
    try {
      const res = await fetch('/api/sgsst/metodo-owas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ formData, observaciones, trabajadoresList, responsablesList, images, video })
      });
      if (res.ok && !silent) showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' });
    } catch { if (!silent) showToast({ message: 'Error al guardar.', status: 'error' }); }
  };

  const handleVoiceInput = () => {
    if (isListening) { try { recognitionRef.current?.stop(); } catch {} setIsListening(false); setInterimText(''); return; }
    // @ts-ignore
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast({ message: 'Navegador no soporta voz. Use Chrome.', status: 'error' }); return; }
    try {
      const r = new SR(); recognitionRef.current = r;
      r.lang = 'es-CO'; r.continuous = true; r.interimResults = true;
      r.onstart = () => { setIsListening(true); setInterimText(''); };
      r.onresult = (e: any) => {
        let interim = '', finalText = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        if (finalText) setFormData(p => ({ ...p, actividadGlobal: p.actividadGlobal + (p.actividadGlobal && !p.actividadGlobal.endsWith(' ') ? ' ' : '') + finalText }));
        setInterimText(interim);
      };
      r.onerror = () => { setIsListening(false); setInterimText(''); };
      r.onend = () => { setIsListening(false); setInterimText(''); };
      r.start();
    } catch { setIsListening(false); }
  };

  const addObservacion = () => {
    const e = currentObs.espalda || 1;
    const a = currentObs.brazos || 1;
    const l = currentObs.piernas || 1;
    const c = currentObs.carga || 1;
    const newObs: Observacion = {
      id: Date.now().toString(),
      descripcion: currentObs.descripcion || '',
      espalda: e, brazos: a, piernas: l, carga: c,
      espaldaLabel: ESPALDA_OPTIONS.find(o => o.value === e)?.label || String(e),
      brazosLabel: BRAZOS_OPTIONS.find(o => o.value === a)?.label || String(a),
      piernasLabel: PIERNAS_OPTIONS.find(o => o.value === l)?.label || String(l),
      cargaLabel: CARGA_OPTIONS.find(o => o.value === c)?.label || String(c),
    };
    setObservaciones(prev => [...prev, newObs]);
    setCurrentObs({ descripcion: '', espalda: 1, brazos: 1, piernas: 1, carga: 1 });
  };

  const removeObservacion = (id: string) => setObservaciones(prev => prev.filter(o => o.id !== id));

  const handleImageUpload = (field: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const MAX = 1200;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        setImages(prev => ({ ...prev, [field]: canvas.toDataURL('image/jpeg', 0.6) }));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit size to ~20MB for safety (10 seconds shouldn't exceed this)
    if (file.size > 20 * 1024 * 1024) {
      showToast({ message: 'El video es demasiado pesado. Máximo 20MB.', status: 'error' });
      return;
    }

    setIsVideoUploading(true);
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';

    videoElement.onloadedmetadata = () => {
      window.URL.revokeObjectURL(videoElement.src);
      const duration = videoElement.duration;

      if (duration > 10.5) {
        showToast({ message: 'El video no debe superar los 10 segundos para evidencia.', status: 'error' });
        setIsVideoUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        setVideo(ev.target?.result as string);
        setIsVideoUploading(false);
        showToast({ message: 'Video de evidencia cargado (Máx 10s).', status: 'success', severity: 'success' });
      };
      reader.onerror = () => setIsVideoUploading(false);
      reader.readAsDataURL(file);
    };

    videoElement.onerror = () => {
      showToast({ message: 'Error al procesar el video.', status: 'error' });
      setIsVideoUploading(false);
    };

    videoElement.src = URL.createObjectURL(file);
  }, [showToast]);

  const removeVideo = () => {
    setVideo(null);
  };

  const stats = React.useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    observaciones.forEach(o => {
      const cat = getOwasCategory(o.espalda, o.brazos, o.piernas, o.carga);
      counts[cat as 1|2|3|4]++;
    });
    const total = observaciones.length;
    const dominant = total > 0 ? Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a)[0] : '1';
    return { counts, total, dominant: parseInt(dominant) };
  }, [observaciones]);

  const currentCategory = getOwasCategory(
    currentObs.espalda || 1, currentObs.brazos || 1, currentObs.piernas || 1, currentObs.carga || 1
  );

  const handleGenerate = useCallback(async () => {

        if (!isPro && (!conversationId || conversationId === 'new')) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-owas`, { headers: { Authorization: `Bearer ${token}` } });
                if (resCount.ok) {
                    const data = await resCount.json();
                    if (data.conversations?.length >= 1) {
                        setShowUpgradeModal(true);
                        return;
                    }
                }
            } catch (e) {}
        }
    if (observaciones.length === 0) {
      showToast({ message: 'Debe registrar al menos una observación OWAS antes de generar el informe.', status: 'warning' });
      return;
    }
    setIsGenerating(true);
    handleSaveData(true);
    try {
      const response = await fetch('/api/sgsst/metodo-owas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ formData, observaciones, trabajadoresList, responsablesList, images, video, modelName: selectedModel }),
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Error al generar'); }
      const data = await response.json();
      setGeneratedReport(data.report);
      editorContentRef.current = data.report;
            liveEditorRef.current?.setHTML(data.report);
            setConversationId(null);
            setReportMessageId(null);
            setIsFormExpanded(false);
      showToast({ message: 'Informe OWAS generado exitosamente', status: 'success', severity: 'success' });
    } catch (error: any) {
      showToast({ message: error.message || 'Error al generar el informe OWAS', status: 'error' });
    } finally { setIsGenerating(false); }
  }, [formData, observaciones, images, video, selectedModel, token, trabajadoresList, responsablesList, showToast, handleSaveData]);

  const handleSave = useCallback(async () => {
    const content = editorContentRef.current || generatedReport;
    if (!content || !token) return;
    
        const isNew = !conversationId || conversationId === 'new';
        if (!isPro && isNew) {
            try {
                const resCount = await fetch(`/api/sgsst/diagnostico/report-history?tags=sgsst-owas`, { headers: { Authorization: `Bearer ${token}` } });
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
        const res = await fetch('/api/sgsst/diagnostico/save-report', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ conversationId, messageId: reportMessageId, content }) });
        if (res.ok) { setRefreshTrigger(p => p + 1); showToast({ message: 'OWAS actualizado', status: 'success', severity: 'success' }); }
        return;
      }
      const res = await fetch('/api/sgsst/diagnostico/save-report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ content, title: `OWAS – ${new Date().toLocaleDateString('es-CO')}`, tags: ['sgsst-owas'] }) });
      if (res.ok) { const d = await res.json(); setConversationId(d.conversationId); setReportMessageId(d.messageId); setRefreshTrigger(p => p + 1); showToast({ message: 'Guardado exitosamente', status: 'success', severity: 'success' }); }
    } catch (e: any) { showToast({ message: `Error: ${e.message}`, status: 'error' }); }
  }, [editorContentRef.current, generatedReport, conversationId, reportMessageId, token, showToast]);

  const handleSelectReport = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/messages/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const messages = await res.json();
      const last = messages[messages.length - 1];
      if (last?.text) { setGeneratedReport(last.text); editorContentRef.current = last.text; liveEditorRef.current?.setHTML(last.text); setConversationId(id); setReportMessageId(last.messageId);
            
            setIsFormExpanded(false); showToast({ message: 'OWAS cargado', status: 'success', severity: 'success' }); }
    } catch { showToast({ message: 'Error al cargar', status: 'error' }); }
    setIsHistoryOpen(false);
  }, [token, showToast]);

  const catCfg = CAT_CONFIG[stats.dominant] || CAT_CONFIG[1];
  const currentCatCfg = CAT_CONFIG[currentCategory];

  useAutoLoadReport({
      token,
      tags: ['sgsst-owas'],
      generatedReport,
      handleSelectReport
  });

  return (
    <div className="flex flex-col gap-4">
            <SGSSTToolbar
                onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                isHistoryOpen={isHistoryOpen}
                onAnalyze={handleGenerate}
                isAnalyzing={isGenerating}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                onSaveLocal={() => handleSaveData()}
                hasContent={!!(editorContentRef.current || generatedReport)}
                exportContent={editorContentRef.current || generatedReport || ''}
                exportFileName="Evaluacion_Ergonomica_OWAS"
                onDummy={handleDummyData}
            />

      {isHistoryOpen && (
        <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
          <ReportHistory onSelectReport={handleSelectReport} isOpen={isHistoryOpen} toggleOpen={() => setIsHistoryOpen(!isHistoryOpen)} refreshTrigger={refreshTrigger} tags={['sgsst-owas']} />
        </div>
      )}

      {/* Main form */}
      <div className="rounded-2xl border border-border-medium bg-surface-secondary shadow-sm overflow-hidden">
        <button onClick={() => setIsFormExpanded(!isFormExpanded)} className="w-full flex items-center justify-between p-4 bg-surface-tertiary">
          <div className="flex items-center gap-2">
            {isFormExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <Activity className="h-5 w-5 text-purple-700" />
            <span className="font-semibold">Evaluación Ergonómica – Método OWAS (Ovako Working Posture Analysing System)</span>
          </div>
          {stats.total > 0 && (
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ backgroundColor: catCfg.bg, color: catCfg.color, border: `1px solid ${catCfg.border}` }}>
              {stats.total} obs. · {catCfg.label} dominante
            </span>
          )}
        </button>

        {isFormExpanded && (
          <div className="p-6 space-y-6">
            {/* Workers */}
            <div className="space-y-4 border rounded-xl p-4 bg-surface-tertiary/20">
              <h4 className="font-semibold text-sm text-text-primary">Trabajador(es) Evaluado(s)</h4>
              {trabajadoresList.map((t, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-3">
                  <WorkerAutocomplete value={t.nombre} onChange={(v: string) => { const n = [...trabajadoresList]; n[idx].nombre = v; const m = availableWorkers.find(w => w.nombre === v); if (m) n[idx].cedula = m.identificacion; setTrabajadoresList(n); }} onSelect={(w: any) => { const n = [...trabajadoresList]; n[idx].nombre = w.nombre; n[idx].cedula = w.identificacion; setTrabajadoresList(n); }} data={availableWorkers} searchKey="nombre" placeholder="Nombre completo" wrapperClassName="w-full md:w-1/2" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                  <div className="flex w-full md:w-1/2 gap-2">
                    <WorkerAutocomplete value={t.cedula} onChange={(v: string) => { const n = [...trabajadoresList]; n[idx].cedula = v; const m = availableWorkers.find(w => w.identificacion === v); if (m && !n[idx].nombre) n[idx].nombre = m.nombre; setTrabajadoresList(n); }} onSelect={(w: any) => { const n = [...trabajadoresList]; n[idx].cedula = w.identificacion; if (!n[idx].nombre) n[idx].nombre = w.nombre; setTrabajadoresList(n); }} data={availableWorkers} searchKey="identificacion" placeholder="Cédula" wrapperClassName="w-full" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                    <button onClick={() => setTrabajadoresList(trabajadoresList.filter((_, i) => i !== idx))} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl" disabled={trabajadoresList.length === 1}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => setTrabajadoresList([...trabajadoresList, { nombre: '', cedula: '' }])} className="flex items-center gap-1 text-sm text-purple-700 hover:text-purple-800 font-medium"><Plus className="h-4 w-4" /> Añadir Trabajador</button>
            </div>

            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-1">
                <label className="text-sm font-medium">Fecha</label>
                <input type="date" value={formData.fecha} onChange={e => setFormData(p => ({ ...p, fecha: e.target.value }))} className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Cargo / Puesto evaluado</label>
                <input type="text" value={formData.cargo} onChange={e => setFormData(p => ({ ...p, cargo: e.target.value }))} placeholder="Ej: Operario Línea 3" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Área / Proceso</label>
                <input type="text" value={formData.area} onChange={e => setFormData(p => ({ ...p, area: e.target.value }))} placeholder="Ej: Almacén, Producción" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Descripción de la Tarea Evaluada</label>
                <input type="text" value={formData.tareaDescripcion} onChange={e => setFormData(p => ({ ...p, tareaDescripcion: e.target.value }))} placeholder="Ej: Empaque manual de cajas en banda" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Frecuencia de Observación</label>
                <SingleSelect value={formData.frecuenciaObservacion} onChange={val => setFormData(p => ({ ...p, frecuenciaObservacion: val }))} placeholder="Seleccione..." options={['Cada 30 segundos', 'Cada 1 minuto', 'Cada 2 minutos', 'Irregular / Según criterio']} />
              </div>
            </div>

            {/* Supervisors */}
            <div className="space-y-3 pt-3 border-t">
              <label className="text-sm font-medium">Evaluador / Ergónomo / Responsable SST</label>
              {responsablesList.map((r, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-3">
                  <WorkerAutocomplete value={r.nombre} onChange={(v: string) => { const n = [...responsablesList]; n[idx].nombre = v; const m = availableWorkers.find(w => w.nombre === v); if (m) { n[idx].cedula = m.identificacion; if (!n[idx].rol && m.cargo) n[idx].rol = m.cargo; } setResponsablesList(n); }} onSelect={(w: any) => { const n = [...responsablesList]; n[idx].nombre = w.nombre; n[idx].cedula = w.identificacion; if (!n[idx].rol && w.cargo) n[idx].rol = w.cargo; setResponsablesList(n); }} data={availableWorkers} searchKey="nombre" placeholder="Nombre" wrapperClassName="w-full md:w-1/3" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                  <input type="text" value={r.rol} onChange={e => { const n = [...responsablesList]; n[idx].rol = e.target.value; setResponsablesList(n); }} className="w-full md:w-1/3 rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary" placeholder="Rol" />
                  <div className="flex w-full md:w-1/3 gap-2">
                    <WorkerAutocomplete value={r.cedula} onChange={(v: string) => { const n = [...responsablesList]; n[idx].cedula = v; const m = availableWorkers.find(w => w.identificacion === v); if (m && !n[idx].nombre) { n[idx].nombre = m.nombre; if (!n[idx].rol && m.cargo) n[idx].rol = m.cargo; } setResponsablesList(n); }} onSelect={(w: any) => { const n = [...responsablesList]; n[idx].cedula = w.identificacion; if (!n[idx].nombre) { n[idx].nombre = w.nombre; if (!n[idx].rol && w.cargo) n[idx].rol = w.cargo; } setResponsablesList(n); }} data={availableWorkers} searchKey="identificacion" placeholder="Cédula" wrapperClassName="w-full" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                    <button onClick={() => setResponsablesList(responsablesList.filter((_, i) => i !== idx))} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <button onClick={() => setResponsablesList([...responsablesList, { nombre: '', cedula: '', rol: '' }])} className="flex items-center gap-1 text-sm text-purple-700 font-medium"><Plus className="h-4 w-4" /> Añadir Evaluador</button>
            </div>

            {/* ═══════════ OWAS CALCULATOR ═══════════ */}
            <div className="pt-4 border-t border-border-medium space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-700" /> Registro de Observaciones Posturales OWAS
              </h4>
              <p className="text-xs text-text-secondary">Codifique la postura del trabajador en el momento de cada observación. El sistema calcula automáticamente la Categoría de Riesgo.</p>

              {/* Current observation builder */}
              <div className="rounded-xl border-2 border-purple-200 bg-purple-50/20 dark:bg-purple-900/10 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-purple-800 dark:text-purple-300">➕ Nueva Observación #{observaciones.length + 1}</span>
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ backgroundColor: currentCatCfg.bg, color: currentCatCfg.color, border: `1px solid ${currentCatCfg.border}` }}>
                    Código: {currentObs.espalda}{currentObs.brazos}{currentObs.piernas}{currentObs.carga} → {currentCatCfg.label}
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Descripción breve de la postura observada</label>
                  <input type="text" value={currentObs.descripcion || ''} onChange={e => setCurrentObs(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Trabajador inclinado cogiendo caja del suelo" className="w-full rounded-xl border px-3 py-2 text-sm bg-surface-primary text-text-primary focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-700">ESPALDA (1er dígito)</label>
                    <SingleSelect value={ESPALDA_OPTIONS.find(o => o.value === currentObs.espalda)?.label || ''} onChange={val => { const opt = ESPALDA_OPTIONS.find(o => o.label === val); if (opt) setCurrentObs(p => ({ ...p, espalda: opt.value })); }} placeholder="Seleccione..." options={ESPALDA_OPTIONS.map(o => o.label)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-700">BRAZOS (2do dígito)</label>
                    <SingleSelect value={BRAZOS_OPTIONS.find(o => o.value === currentObs.brazos)?.label || ''} onChange={val => { const opt = BRAZOS_OPTIONS.find(o => o.label === val); if (opt) setCurrentObs(p => ({ ...p, brazos: opt.value })); }} placeholder="Seleccione..." options={BRAZOS_OPTIONS.map(o => o.label)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-700">PIERNAS (3er dígito)</label>
                    <SingleSelect value={PIERNAS_OPTIONS.find(o => o.value === currentObs.piernas)?.label || ''} onChange={val => { const opt = PIERNAS_OPTIONS.find(o => o.label === val); if (opt) setCurrentObs(p => ({ ...p, piernas: opt.value })); }} placeholder="Seleccione..." options={PIERNAS_OPTIONS.map(o => o.label)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-700">CARGA / FUERZA (4to dígito)</label>
                    <SingleSelect value={CARGA_OPTIONS.find(o => o.value === currentObs.carga)?.label || ''} onChange={val => { const opt = CARGA_OPTIONS.find(o => o.label === val); if (opt) setCurrentObs(p => ({ ...p, carga: opt.value })); }} placeholder="Seleccione..." options={CARGA_OPTIONS.map(o => o.label)} />
                  </div>
                </div>
                <div className="rounded-xl p-3 text-sm font-medium" style={{ backgroundColor: currentCatCfg.bg, color: currentCatCfg.color, border: `1px solid ${currentCatCfg.border}` }}>
                  <AlertCircle className="inline h-4 w-4 mr-2" />
                  {currentCatCfg.action}
                </div>
                <button onClick={addObservacion} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-semibold text-sm transition-colors shadow">
                  <Plus className="h-4 w-4" /> Registrar Esta Observación
                </button>
              </div>

              {/* Observations list */}
              {observaciones.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-sm">{observaciones.length} Observación(es) Registradas</h5>
                    <div className="flex gap-2 text-xs font-bold">
                      {Object.entries(stats.counts).map(([cat, count]) => count > 0 && (
                        <span key={cat} className="px-2 py-1 rounded-full" style={{ backgroundColor: CAT_CONFIG[parseInt(cat)].bg, color: CAT_CONFIG[parseInt(cat)].color, border: `1px solid ${CAT_CONFIG[parseInt(cat)].border}` }}>
                          C{cat}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-auto rounded-xl border border-border-medium">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-purple-700 text-white">
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Descripción</th>
                          <th className="px-3 py-2 text-center">Espalda</th>
                          <th className="px-3 py-2 text-center">Brazos</th>
                          <th className="px-3 py-2 text-center">Piernas</th>
                          <th className="px-3 py-2 text-center">Carga</th>
                          <th className="px-3 py-2 text-center">Código</th>
                          <th className="px-3 py-2 text-center">Categoría</th>
                          <th className="px-3 py-2 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observaciones.map((obs, idx) => {
                          const cat = getOwasCategory(obs.espalda, obs.brazos, obs.piernas, obs.carga);
                          const cfg = CAT_CONFIG[cat];
                          return (
                            <tr key={obs.id} className="border-t border-border-light" style={{ backgroundColor: cat >= 3 ? cfg.bg : undefined }}>
                              <td className="px-3 py-2 font-bold text-center">{idx + 1}</td>
                              <td className="px-3 py-2 max-w-32 truncate">{obs.descripcion || '–'}</td>
                              <td className="px-3 py-2 text-center">{obs.espalda}</td>
                              <td className="px-3 py-2 text-center">{obs.brazos}</td>
                              <td className="px-3 py-2 text-center">{obs.piernas}</td>
                              <td className="px-3 py-2 text-center">{obs.carga}</td>
                              <td className="px-3 py-2 text-center font-mono font-bold">{obs.espalda}{obs.brazos}{obs.piernas}{obs.carga}</td>
                              <td className="px-3 py-2 text-center">
                                <span className="font-bold text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>Cat. {cat}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => removeObservacion(obs.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Description / notes with voice */}
            <div className="space-y-3 pt-4 border-t border-border-medium">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Observaciones Adicionales del Entorno / Tarea (Texto o Voz)</h4>
                <button onClick={handleVoiceInput} className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border transition-all ${isListening ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-surface-secondary hover:bg-surface-hover text-text-primary border-border-light'}`}>
                  <span className="relative flex h-3 w-3">{isListening && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}<span className={`relative inline-flex rounded-full h-3 w-3 ${isListening ? 'bg-red-500' : 'bg-purple-700'}`}></span></span>
                  {isListening ? 'Escuchando...' : 'Activar Micrófono'}
                </button>
              </div>
              <textarea
                value={formData.actividadGlobal + (interimText ? (formData.actividadGlobal.endsWith(' ') ? '' : ' ') + interimText : '')}
                onChange={e => { if (!isListening) setFormData(p => ({ ...p, actividadGlobal: e.target.value })); }}
                readOnly={isListening}
                className={`w-full rounded-xl border-2 ${isListening ? 'border-red-300 bg-red-50/10' : 'border-dashed border-purple-200 bg-purple-50/10 focus:border-purple-400'} p-4 text-sm text-text-primary min-h-[120px] resize-y focus:outline-none transition-colors`}
                placeholder="Describa el contexto general del puesto, condiciones del entorno, herramientas utilizadas, ritmo de trabajo, duración de la jornada..."
              />
            </div>

            {/* Photos */}
            <div className="space-y-3 pt-4 border-t border-border-medium">
              <h4 className="font-semibold text-sm">Registro Fotográfico del Puesto de Trabajo</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {['foto1', 'foto2', 'foto3'].map((foto, idx) => {
                  const labels = ['Puesto de Trabajo (Vista General)', 'Postura durante la Tarea', 'Herramientas / Entorno'];
                  const f = foto as 'foto1' | 'foto2' | 'foto3';
                  return (
                    <div key={foto} className="flex flex-col items-center gap-2">
                      <span className="font-semibold text-xs text-center">{labels[idx]}</span>
                      <div className="relative w-full aspect-square bg-surface-tertiary rounded-xl border-2 border-dashed border-purple-200 flex flex-col items-center justify-center overflow-hidden hover:bg-surface-hover transition-colors">
                        {images[f] ? (
                          <><img src={images[f] as string} className="w-full h-full object-cover" alt={foto} /><button onClick={() => setImages(p => ({ ...p, [f]: null }))} className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500"><X className="h-4 w-4" /></button></>
                        ) : (
                          <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-purple-700">
                            <Camera className="h-8 w-8 mb-2" />
                            <span className="text-xs text-center px-4">Tocar para tomar/subir foto</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(f, e)} />
                          </label>
                        )}
                      </div>
                      <input type="text" placeholder="Descripción breve..." value={(formData as any)[`${foto}Desc`]} onChange={e => setFormData(p => ({ ...p, [`${foto}Desc`]: e.target.value }))} className="w-full rounded border px-2 py-1 text-xs bg-surface-primary text-text-primary" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Video Evidence */}
            <div className="space-y-4 pt-4 border-t border-border-medium">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Film className="h-4 w-4 text-purple-700" /> Video de Evidencia Dinámica (Opcional)
                </h4>
                <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold uppercase">Máximo 10 Segundos</span>
              </div>
              
              <div className="bg-surface-tertiary/10 border-2 border-dashed border-purple-200 rounded-2xl p-6 transition-all hover:bg-surface-tertiary/20">
                {!video ? (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-purple-600">
                      {isVideoUploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Video className="h-8 w-8" />}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-text-primary">Sube un video corto de la tarea</p>
                      <p className="text-xs text-text-secondary mt-1">Formatos permitidos: MP4, WebM (Evidencia real)</p>
                    </div>
                    <label className="cursor-pointer bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95">
                      {isVideoUploading ? 'Procesando...' : 'Seleccionar Video'}
                      <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={isVideoUploading} />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-md mx-auto shadow-2xl border-2 border-purple-400">
                      <video src={video} controls className="w-full h-full" />
                      <button onClick={removeVideo} className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 transition-colors z-10">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-center text-xs text-purple-600 font-medium bg-purple-50 py-2 rounded-lg border border-purple-100 italic">
                      "Evidencia en video cargada correctamente para análisis multimodal"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Generate button */}
            <div className="flex justify-center pt-4 gap-4">
              <button onClick={handleGenerate} disabled={isGenerating || observaciones.length === 0} className="group flex items-center px-5 py-3 bg-purple-700 hover:bg-purple-800 border border-purple-700 text-white rounded-full transition-all duration-300 shadow-lg hover:shadow-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5">
                {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <AnimatedIcon name="sparkles" size={20} />}
                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 transition-all duration-300 whitespace-nowrap group-hover:ml-2">
                  {observaciones.length === 0 ? 'Registre observaciones primero' : 'Generar Informe OWAS con IA'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generated report editor */}
        <CollapsibleReportBox onSave={handleSave}
                        onHistory={() => setIsHistoryOpen(!isHistoryOpen)}
                        isHistoryOpen={isHistoryOpen}
            title="Método OWAS"
            icon={<Activity className="h-5 w-5 text-purple-700" />}
            actions={
                        <ExportDropdown
                            content={editorContentRef.current || generatedReport || ''}
                            fileName="Informe_MetodoOwas"
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
              reportSourceData={{ formData, observaciones }}
            />
          </div>
        </CollapsibleReportBox>
    
            {/* Upgrade Modal (Freemium Teaser) */}
            {showUpgradeModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <div className="relative max-w-sm w-full animate-in zoom-in-95 duration-300">
                        <button 
                            onClick={() => setShowUpgradeModal(false)} 
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-md text-sm"
                        >
                            Cerrar ✕
                        </button>
                        <div className="bg-surface-primary rounded-3xl shadow-2xl overflow-hidden">
                            <UpgradeWall
                                title="Límite Gratuito Alcanzado"
                                description="Has alcanzado el límite para este módulo. Adquiere Premium para generar registros ilimitados."
                                plan="USER_IPEVAR"
                                isCompact={true}
                                hideFeatures={true}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
  );
};

export default MetodoOwas;
