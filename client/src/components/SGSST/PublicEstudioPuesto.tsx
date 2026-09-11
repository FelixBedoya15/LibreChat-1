import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Camera,
  Upload,
  User,
  Briefcase,
  Sparkles,
  AlertCircle,
  Building2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface CompanyData {
  id: string;
  name: string;
  logo: string | null;
  city: string;
}

interface WorkerBasic {
  nombre: string;
  identificacion: string;
  cargo: string;
}

export default function PublicEstudioPuesto() {
  const { companyId } = useParams<{ companyId: string }>();

  const [company, setCompany] = useState<CompanyData | null>(null);
  const [workers, setWorkers] = useState<WorkerBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [step, setStep] = useState<number>(1);
  const [workerName, setWorkerName] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [cargo, setCargo] = useState('');
  const [actividad, setActividad] = useState('');

  // Ergonomic Quick Checks
  const [pantallaOjos, setPantallaOjos] = useState<boolean | null>(null);
  const [piesApoyados, setPiesApoyados] = useState<boolean | null>(null);
  const [codosAngulo, setCodosAngulo] = useState<boolean | null>(null);
  const [soporteLumbar, setSoporteLumbar] = useState<boolean | null>(null);

  // Photo
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setError('Enlace inválido o incompleto.');
      setLoading(false);
      return;
    }

    const fetchCompanyData = async () => {
      try {
        const res = await fetch(`/api/public-sgsst/estudio-puesto/${companyId}`);
        if (!res.ok) throw new Error('Empresa no encontrada.');
        const data = await res.json();
        setCompany(data.company);
        setWorkers(data.workers || []);
      } catch (err: any) {
        setError(err.message || 'No fue posible validar la empresa.');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyData();
  }, [companyId]);

  // Autocomplete matching by Cédula
  const handleCedulaChange = (val: string) => {
    setWorkerId(val);
    const clean = val.trim();
    if (clean.length >= 5) {
      const match = workers.find((w) => String(w.identificacion).trim() === clean);
      if (match) {
        setWorkerName(match.nombre);
        if (match.cargo) setCargo(match.cargo);
      }
    }
  };

  // Image Upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit Auto-evaluation
  const handleSubmit = async () => {
    if (!workerName || !workerId || !cargo) {
      alert('Por favor completa Nombre, Cédula y Cargo.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Calculate estimated action level based on quick checks
      const checks = [pantallaOjos, piesApoyados, codosAngulo, soporteLumbar];
      const falseCount = checks.filter((c) => c === false).length;
      let calculatedRisk: 'Bajo' | 'Medio' | 'Alto' = 'Bajo';
      let actionLevel = 'Nivel 1 - Aceptable';

      if (falseCount >= 3) {
        calculatedRisk = 'Alto';
        actionLevel = 'Nivel 3 - Acción Pronta Requerida';
      } else if (falseCount >= 1) {
        calculatedRisk = 'Medio';
        actionLevel = 'Nivel 2 - Requiere Ajustes Posturales';
      }

      const evidences = photoBase64
        ? [
            {
              phase: 1,
              label: 'Auto-reporte de Puesto',
              url: photoBase64,
              telemetry: {
                pantallaOjos: pantallaOjos ? 'Adecuada' : 'Inadecuada',
                piesApoyados: piesApoyados ? 'Apoyo completo' : 'Pies colgando',
                codosAngulo: codosAngulo ? '90 grados' : 'Sin apoyo',
                soporteLumbar: soporteLumbar ? 'Con soporte' : 'Sin soporte',
              },
            },
          ]
        : [];

      const notes = `Verificación ergonómica auto-reportada:
- Pantalla a nivel de ojos: ${pantallaOjos ? 'Sí' : 'No'}
- Pies planos en el suelo: ${piesApoyados ? 'Sí' : 'No'}
- Codos a 90°: ${codosAngulo ? 'Sí' : 'No'}
- Soporte lumbar en la silla: ${soporteLumbar ? 'Sí' : 'No'}`;

      const res = await fetch(`/api/public-sgsst/estudio-puesto/${companyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerName,
          workerId,
          cargo,
          actividad: actividad || 'Labor cotidiana en puesto de trabajo',
          evidences,
          riskLevel: calculatedRisk,
          actionLevel,
          notes,
        }),
      });

      if (!res.ok) throw new Error('Error al enviar la auto-evaluación.');
      setSubmitted(true);
    } catch (err: any) {
      alert(err.message || 'Error al enviar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
          Cargando portal de auto-evaluación...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-red-200 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Enlace no disponible</h2>
          <p className="text-xs text-slate-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/50 via-slate-50 to-slate-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4 py-8 flex flex-col items-center justify-center text-slate-800 dark:text-zinc-100 font-sans">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden">
        {/* Cabecera Corporativa de la Empresa */}
        <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-700 p-6 text-white text-center relative">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center overflow-hidden shadow-lg">
            {company?.logo ? (
              <img src={company.logo} alt="Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <Building2 className="w-7 h-7 text-white" />
            )}
          </div>
          <h1 className="text-sm font-black uppercase tracking-wider">{company?.name || 'EMPRESA'}</h1>
          <p className="text-[11px] text-teal-100 font-medium mt-1">
            Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST)
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[10px] font-bold tracking-wide">
            <Activity className="w-3.5 h-3.5" />
            <span>Auto-evaluación Ergonómica de Puesto (EPT)</span>
          </div>
        </div>

        {/* Pantalla de Éxito al culminar */}
        {submitted ? (
          <div className="p-8 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-950/60 text-teal-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              ¡Auto-evaluación Recibida!
            </h2>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Muchas gracias, <strong>{workerName}</strong>. Tu informe ergonómico ha sido enviado y
              sincronizado exitosamente con el área de SG-SST de <strong>{company?.name}</strong>.
            </p>

            <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-left text-xs space-y-2">
              <p className="font-bold text-teal-800 dark:text-teal-300">💡 Recomendaciones Inmediatas:</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-zinc-400 text-[11px]">
                <li>Realiza pausas activas cada 2 horas (estiramiento de cuello y hombros).</li>
                <li>Mantén la mirada al frente alineada con el tercio superior de tu pantalla.</li>
                <li>Apoya siempre los antebrazos sobre la mesa al digitar.</li>
              </ul>
            </div>

            <button
              onClick={() => {
                setSubmitted(false);
                setStep(1);
                setPhotoBase64(null);
              }}
              className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
            >
              Realizar otra evaluación
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5 text-xs">
            {/* Indicador de Pasos */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 1
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400'
                }`}
              >
                1
              </div>
              <div className="w-8 h-0.5 bg-slate-200 dark:bg-zinc-800" />
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 2
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-400 dark:bg-zinc-800'
                }`}
              >
                2
              </div>
            </div>

            {/* PASO 1: Identificación del Colaborador */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="text-center mb-2">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    1. Identificación del Trabajador
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ingresa tus datos para vincular el estudio a tu expediente laboral.
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Cédula / Documento de Identidad *
                  </label>
                  <input
                    type="text"
                    placeholder="Digita tu número de documento"
                    value={workerId}
                    onChange={(e) => handleCedulaChange(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    placeholder="Tu nombre completo"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Cargo o Puesto de Trabajo *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Auxiliar Administrativo, Analista, Operario"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Descripción de tu labor cotidiana (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Digitación en computador, llamadas y archivo"
                    value={actividad}
                    onChange={(e) => setActividad(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 focus:ring-2 focus:ring-teal-500 focus:outline-none text-xs"
                  />
                </div>

                <button
                  type="button"
                  disabled={!workerId || !workerName || !cargo}
                  onClick={() => setStep(2)}
                  className="w-full mt-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <span>Siguiente: Chequeo Ergonómico</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* PASO 2: Chequeo Ergonómico y Foto del Puesto */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="text-center mb-2">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    2. Chequeo de Tu Puesto de Trabajo
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Responde con sinceridad cómo sientes tu estación de trabajo actual.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Pregunta 1: Pantalla */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                    <span className="text-xs font-semibold pr-2">
                      ¿El borde superior de tu pantalla está a la altura de tus ojos?
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPantallaOjos(true)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          pantallaOjos === true
                            ? 'bg-teal-600 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setPantallaOjos(false)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          pantallaOjos === false
                            ? 'bg-red-500 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* Pregunta 2: Pies */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                    <span className="text-xs font-semibold pr-2">
                      ¿Tus pies descansan completamente planos sobre el piso o reposapiés?
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPiesApoyados(true)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          piesApoyados === true
                            ? 'bg-teal-600 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setPiesApoyados(false)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          piesApoyados === false
                            ? 'bg-red-500 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* Pregunta 3: Codos */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                    <span className="text-xs font-semibold pr-2">
                      ¿Tus antebrazos y muñecas quedan apoyados de forma recta al escribir?
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCodosAngulo(true)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          codosAngulo === true
                            ? 'bg-teal-600 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setCodosAngulo(false)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          codosAngulo === false
                            ? 'bg-red-500 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* Pregunta 4: Soporte Lumbar */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-between">
                    <span className="text-xs font-semibold pr-2">
                      ¿Tu silla te brinda un buen soporte en la espalda baja (zona lumbar)?
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSoporteLumbar(true)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          soporteLumbar === true
                            ? 'bg-teal-600 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setSoporteLumbar(false)}
                        className={`px-3 py-1 rounded-lg font-bold text-xs ${
                          soporteLumbar === false
                            ? 'bg-red-500 text-white'
                            : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>

                {/* Subir Foto del Puesto */}
                <div className="pt-2">
                  <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Foto de tu puesto de trabajo (Opcional pero recomendado)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    className="hidden"
                  />

                  {photoBase64 ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-700 max-h-48 flex items-center justify-center bg-black">
                      <img
                        src={photoBase64}
                        alt="Foto Puesto"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoBase64(null)}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[10px] font-bold"
                      >
                        Cambiar foto
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-4 rounded-2xl border-2 border-dashed border-teal-300 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20 hover:bg-teal-50 flex flex-col items-center justify-center text-teal-700 dark:text-teal-300 transition-colors"
                    >
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="font-bold">Tomar foto o subir imagen de tu puesto</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">Captura lateral o frontal</span>
                    </button>
                  )}
                </div>

                {/* Botones de Navegación */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setStep(1)}
                    className="w-1/3 py-3 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold text-slate-600 dark:text-zinc-300 text-xs"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmit}
                    className="w-2/3 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enviando al SG-SST...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Enviar Auto-evaluación</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-[10px] text-slate-400">
        Gestión Inteligente de Seguridad y Salud en el Trabajo • WAPPY IA
      </div>
    </div>
  );
}
