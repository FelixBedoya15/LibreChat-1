import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
    Stethoscope, Shield, AlertTriangle, CheckCircle, User, Phone, Droplet,
    Activity, Heart, Car, Briefcase, Home, Users, Loader2, Send, Key, Plus, Trash2
} from 'lucide-react';
import axios from 'axios';
import SingleSelect from './SingleSelect';
import type { LicenciaConduccionItem } from './exportPerfilSociodemografico';

// ─── Types ────────────────────────────────────────────────────────────
interface WorkerData {
    id: string; nombre: string; cargo: string; identificacion: string;
    edad: string; genero: string; estadoCivil: string; nivelEscolaridad: string; direccion: string;
    telefono: string; emergenciaContacto: string; tipoSangre: string;
    enfermedades: string; medicamentos: string; fuma: string; alcohol: string;
    terapiaPsicologica: string; personasCargo: string | number;
    estrato: string; vivienda: string; soatVencimiento: string;
    tecnicomecanicaVencimiento: string; licenciaSST: string;
    licenciaVencimiento: string; curso50h: string; curso20h: string;
    
    // New fields
    fechaNacimiento?: string; lugarNacimiento?: string; barrio?: string; municipioDomicilio?: string; correoElectronico?: string;
    licenciaConduccion?: string; licenciaConduccionVencimiento?: string; licenciasConduccion?: LicenciaConduccionItem[];
    esCopasst?: string; esComiteConvivencia?: string; esBrigadista?: string; esComiteSeguridadVial?: string;
    deporte?: string; alimentacion?: string;
    peso?: string; talla?: string; imc?: string; presionArterial?: string; frecuenciaCardiaca?: string;
    diagnosticoMedico?: string; limitacionesBiomecanicas?: string; alergiasQuimicas?: string; riesgoCardiovascular?: string;
    fechaExamenMedico?: string; recomendacionesMedicas?: string; fechaSeguimiento?: string;
    fechaCursoAlturasAutorizado?: string; fechaCursoAlturasCoordinador?: string;
}

// ─── Section component ─────────────────────────────────────────────
const SectionTitle = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
        <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-teal-600" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">{label}</span>
    </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
        {children}
    </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
        {...props}
        className="w-full border border-gray-200 rounded-xl text-sm bg-gray-50 px-3 py-2.5 focus:ring-2 focus:ring-teal-400 focus:border-teal-400 outline-none transition-all font-medium placeholder-gray-300"
    />
);


// ─── Main Component ────────────────────────────────────────────────
export default function PublicPerfilUpdate() {
    const { companyId, workerId } = useParams<{ companyId: string; workerId: string }>();

    const [company, setCompany] = useState<any>(null);
    const [workerData, setWorkerData] = useState<WorkerData | null>(null);
    const [loadingCompany, setLoadingCompany] = useState(true);
    const [step, setStep] = useState(1); // 1: verify, 2: fill form, 3: success
    const [cedula, setCedula] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const [formData, setFormData] = useState<Partial<WorkerData>>({});
    const [submitting, setSubmitting] = useState(false);
    const [habeasData, setHabeasData] = useState(false);

    // Load company
    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get(`/api/public-sgsst/company/${companyId}`);
                setCompany(res.data);
            } catch {
                // no-op
            } finally {
                setLoadingCompany(false);
            }
        })();
    }, [companyId]);

    const isDriver = (cargo: string) => {
        const c = (cargo || '').toLowerCase();
        return c.includes('conductor') || c.includes('chofer') || c.includes('driver');
    };

    const isSSTRole = (cargo: string) => {
        const c = (cargo || '').toLowerCase();
        return c.includes('sst') || c.includes('sgsst') || c.includes('seguridad') || c.includes('salud') || c.includes('higiene');
    };

    const calculateIMC = (pesoStr?: string, tallaStr?: string) => {
        const p = parseFloat(pesoStr || '');
        const t = parseFloat(tallaStr || '');
        if (p > 0 && t > 0) {
            const tallaMetros = t > 3 ? t / 100 : t; // Soporta tanto 170 (cm) como 1.70 (m)
            return (p / (tallaMetros * tallaMetros)).toFixed(1);
        }
        return '';
    };

    const handleVerify = async () => {
        if (!cedula.trim()) { setVerifyError('Ingresa tu cédula.'); return; }
        setVerifying(true);
        setVerifyError('');
        try {
            // Include cedula as query param just in case workerId is undefined
            const res = await axios.get(`/api/public-sgsst/perfil-update/${companyId}/${workerId}?cedula=${cedula}`);
            if (res.data.companyName) {
                setCompany({
                    _id: res.data._id || company?._id || companyId,
                    companyName: res.data.companyName,
                    logo: res.data.logo
                });
            }
            const w: WorkerData = res.data.worker;
            
            // If we have a specific workerId in URL, still cross-check for extra security
            if (workerId && workerId !== 'undefined' && String(w.identificacion).trim() !== String(cedula).trim()) {
                setVerifyError('La cédula ingresada no coincide con este perfil. Por favor verifica e intenta de nuevo.');
                return;
            }
            
            const initialImc = w.imc || calculateIMC(w.peso, w.talla);

            setWorkerData(w);
            setFormData({
                id: w.id, // Store real ID
                edad: w.edad, genero: w.genero, estadoCivil: w.estadoCivil, nivelEscolaridad: w.nivelEscolaridad, direccion: w.direccion,
                telefono: w.telefono, emergenciaContacto: w.emergenciaContacto,
                tipoSangre: w.tipoSangre, enfermedades: w.enfermedades,
                medicamentos: w.medicamentos, fuma: w.fuma, alcohol: w.alcohol,
                terapiaPsicologica: w.terapiaPsicologica,
                personasCargo: w.personasCargo, estrato: w.estrato, vivienda: w.vivienda,
                soatVencimiento: w.soatVencimiento, tecnicomecanicaVencimiento: w.tecnicomecanicaVencimiento,
                licenciaSST: w.licenciaSST, licenciaVencimiento: w.licenciaVencimiento,
                curso50h: w.curso50h, curso20h: w.curso20h,
                
                // New fields mapping
                fechaNacimiento: w.fechaNacimiento, lugarNacimiento: w.lugarNacimiento, barrio: w.barrio, 
                municipioDomicilio: w.municipioDomicilio, correoElectronico: w.correoElectronico,
                licenciaConduccion: w.licenciaConduccion, licenciaConduccionVencimiento: w.licenciaConduccionVencimiento,
                licenciasConduccion: w.licenciasConduccion || [],
                esCopasst: w.esCopasst, esComiteConvivencia: w.esComiteConvivencia, esBrigadista: w.esBrigadista, esComiteSeguridadVial: w.esComiteSeguridadVial,
                deporte: w.deporte, alimentacion: w.alimentacion,
                peso: w.peso, talla: w.talla, imc: initialImc, presionArterial: w.presionArterial, frecuenciaCardiaca: w.frecuenciaCardiaca,
                diagnosticoMedico: w.diagnosticoMedico, limitacionesBiomecanicas: w.limitacionesBiomecanicas, alergiasQuimicas: w.alergiasQuimicas, riesgoCardiovascular: w.riesgoCardiovascular,
                fechaExamenMedico: w.fechaExamenMedico, recomendacionesMedicas: w.recomendacionesMedicas, fechaSeguimiento: w.fechaSeguimiento,
                fechaCursoAlturasAutorizado: w.fechaCursoAlturasAutorizado, fechaCursoAlturasCoordinador: w.fechaCursoAlturasCoordinador
            });
            setStep(2);
        } catch (err: any) {
            setVerifyError(err.response?.data?.error || 'No se pudo cargar el perfil. Intenta de nuevo.');
        } finally {
            setVerifying(false);
        }
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            // Use URL param if available, otherwise fallback to workerData.id found during verification
            const targetCompanyId = company?._id || companyId;
            const targetWorkerId = (workerId && workerId !== 'undefined') ? workerId : workerData?.id;
            await axios.post(`/api/public-sgsst/perfil-update/${targetCompanyId}/${targetWorkerId}`, {
                updates: formData,
                cedula: cedula // Fallback for backend finding logic
            });
            setStep(3);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Error al enviar. Intenta de nuevo.');
        } finally {
            setSubmitting(false);
        }
    };

    const upd = (field: keyof WorkerData, value: string) => {
        setFormData(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'peso' || field === 'talla') {
                const pesoVal = field === 'peso' ? value : String(next.peso || '');
                const tallaVal = field === 'talla' ? value : String(next.talla || '');
                next.imc = calculateIMC(pesoVal, tallaVal);
            }
            return next;
        });
    };

    // ─── Loading ────────────────────────────────────────────────────
    if (loadingCompany) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="w-12 h-12 text-teal-500 animate-spin mb-4" />
            <h2 className="text-lg font-bold text-gray-800">Cargando portal...</h2>
        </div>
    );

    if (!company) return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-14 h-14 text-red-500 mb-4" />
            <h2 className="text-xl font-bold">Enlace Inválido</h2>
            <p className="text-gray-500 mt-2 text-sm">El QR no está asociado a una empresa válida.</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-cyan-50 font-sans text-gray-800 flex flex-col">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur border-b border-gray-100 sticky top-0 z-10 px-5 py-3 shrink-0">
                <div className="flex items-center gap-3 max-w-md mx-auto">
                    {company.logo ? (
                        <img src={company.logo} alt="Logo" className="w-9 h-9 rounded-xl object-contain border border-gray-200 bg-white p-0.5" />
                    ) : (
                        <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                            <Shield className="w-4 h-4 text-teal-600" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="font-bold text-sm text-gray-900 leading-tight truncate">{company.companyName}</h1>
                        <p className="text-[11px] text-gray-400">Actualización de Perfil Sociodemográfico</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-5 pb-10 w-full max-w-md mx-auto flex flex-col">

                {/* ─── STEP 1: Verify Identity ─────────────────── */}
                {step === 1 && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-6 text-teal-600">
                            <div className="w-10 h-10 bg-teal-50 rounded-2xl flex items-center justify-center">
                                <Key className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Verificar Identidad</h2>
                                <p className="text-xs text-gray-400">Ingresa tu cédula para acceder a tu perfil</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Field label="Número de Cédula">
                                <Input
                                    type="number"
                                    placeholder="Sin puntos ni comas"
                                    value={cedula}
                                    onChange={e => setCedula(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleVerify()}
                                />
                            </Field>
                        </div>

                        {verifyError && (
                            <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-r text-sm text-red-700">
                                {verifyError}
                            </div>
                        )}

                        <button
                            onClick={handleVerify}
                            disabled={verifying}
                            className="mt-6 w-full bg-gray-900 hover:bg-black text-white py-3.5 rounded-xl font-bold tracking-wide shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : 'Acceder a mi Perfil'}
                        </button>

                        <p className="text-[11px] text-gray-400 text-center mt-4 leading-relaxed">
                            Tus datos son verificados de forma segura.<br />Ninguna información personal es compartida con terceros.
                        </p>
                    </div>
                )}

                {/* ─── STEP 2: Update Form ─────────────────────── */}
                {step === 2 && workerData && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Worker Header */}
                        <div className="flex items-center gap-3 mb-5 p-4 bg-teal-50 rounded-2xl border border-teal-100">
                            <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center text-white font-black text-xl shrink-0">
                                {workerData.nombre.charAt(0)}
                            </div>
                            <div className="min-w-0">
                                <p className="font-black text-gray-900 truncate leading-tight">{workerData.nombre}</p>
                                <p className="text-xs text-teal-700 font-semibold">{workerData.cargo}</p>
                                <p className="text-[11px] text-gray-400">Cédula: {workerData.identificacion}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            
                            {/* Datos Básicos */}
                            <SectionTitle icon={User} label="Datos Básicos y Domicilio" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Edad (Ej: 35)">
                                    <Input type="number" value={formData.edad || ''} onChange={e => upd('edad', e.target.value)} />
                                </Field>
                                <Field label="Género">
                                    <SingleSelect value={formData.genero || ''} onChange={val => upd('genero', val)} placeholder="Seleccionar" options={['Masculino', 'Femenino', 'Otro']} />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Estado Civil">
                                    <SingleSelect value={formData.estadoCivil || ''} onChange={val => upd('estadoCivil', val)} placeholder="Seleccionar" options={['Soltero/a', 'Casado/a', 'Unión Libre', 'Separado/a', 'Viudo/a']} />
                                </Field>
                                <Field label="Escolaridad">
                                    <SingleSelect value={formData.nivelEscolaridad || ''} onChange={val => upd('nivelEscolaridad', val)} placeholder="Seleccionar" options={['Ninguna', 'Primaria', 'Secundaria', 'Técnico', 'Tecnólogo', 'Profesional', 'Posgrado']} />
                                </Field>
                            </div>
                            <Field label="Dirección de Domicilio">
                                <Input value={formData.direccion || ''} onChange={e => upd('direccion', e.target.value)} placeholder="Ej: Calle Principal 123, Ciudad" />
                            </Field>

                            {/* Contacto y Emergencia */}
                            <SectionTitle icon={Phone} label="Contacto y Emergencia" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Teléfono">
                                    <Input type="tel" value={formData.telefono || ''} onChange={e => upd('telefono', e.target.value)} placeholder="3001234567" />
                                </Field>
                                <Field label="Tipo de Sangre">
                                    <SingleSelect value={formData.tipoSangre || ''} onChange={val => upd('tipoSangre', val)} placeholder="Seleccionar" options={['O+','O-','A+','A-','B+','B-','AB+','AB-']} />
                                </Field>
                            </div>
                            <Field label="Contacto de Emergencia (Nombre y Teléfono)">
                                <Input value={formData.emergenciaContacto || ''} onChange={e => upd('emergenciaContacto', e.target.value)} placeholder="Ej: Esposa - 3154567890" />
                            </Field>

                            {/* Health */}
                            <SectionTitle icon={Activity} label="Salud y Hábitos" />
                            <Field label="Enfermedades Actuales">
                                <Input value={formData.enfermedades || ''} onChange={e => upd('enfermedades', e.target.value)} placeholder="Ej: Hipertensión, Diabetes" />
                            </Field>
                            <Field label="Medicamentos Actuales">
                                <Input value={formData.medicamentos || ''} onChange={e => upd('medicamentos', e.target.value)} placeholder="Ej: Metformina 500mg" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Fuma">
                                    <SingleSelect value={formData.fuma || ''} onChange={val => upd('fuma', val)} placeholder="Seleccionar" options={['No', 'Sí, diario', 'Sí, ocasional']} />
                                </Field>
                                <Field label="Consume Alcohol">
                                    <SingleSelect value={formData.alcohol || ''} onChange={val => upd('alcohol', val)} placeholder="Seleccionar" options={['No', 'Ocasional', 'Semanal', 'Frecuente']} />
                                </Field>
                            </div>
                            <Field label="Terapia Psicológica">
                                <SingleSelect value={formData.terapiaPsicologica || ''} onChange={val => upd('terapiaPsicologica', val)} placeholder="Seleccionar" options={['No', 'Sí, actualmente', 'Sí, en el pasado']} />
                            </Field>

                            {/* Socioeconomic */}
                            <SectionTitle icon={Home} label="Vivienda y Económico" />
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Estrato">
                                    <SingleSelect value={formData.estrato || ''} onChange={val => upd('estrato', val)} placeholder="—" options={['1','2','3','4','5','6']} />
                                </Field>
                                <Field label="Vivienda">
                                    <SingleSelect value={formData.vivienda || ''} onChange={val => upd('vivienda', val)} placeholder="—" options={['Propia', 'Arrendada', 'Familiar']} />
                                </Field>
                                <Field label="Personas a cargo">
                                    <Input type="number" min={0} max={20} value={formData.personasCargo as string || ''} onChange={e => upd('personasCargo', e.target.value)} placeholder="0" />
                                </Field>
                            </div>

                            {/* Datos de Origen y Contacto Adicional */}
                            <SectionTitle icon={Home} label="Origen, Residencia y Contacto" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Fecha de Nacimiento">
                                    <Input type="date" value={formData.fechaNacimiento || ''} onChange={e => upd('fechaNacimiento', e.target.value)} />
                                </Field>
                                <Field label="Lugar de Nacimiento">
                                    <Input value={formData.lugarNacimiento || ''} onChange={e => upd('lugarNacimiento', e.target.value)} placeholder="Ej: Medellín" />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Barrio">
                                    <Input value={formData.barrio || ''} onChange={e => upd('barrio', e.target.value)} placeholder="Ej: El Poblado" />
                                </Field>
                                <Field label="Municipio">
                                    <Input value={formData.municipioDomicilio || ''} onChange={e => upd('municipioDomicilio', e.target.value)} placeholder="Ej: Medellín" />
                                </Field>
                            </div>
                            <Field label="Correo Electrónico">
                                <Input type="email" value={formData.correoElectronico || ''} onChange={e => upd('correoElectronico', e.target.value)} placeholder="correo@ejemplo.com" />
                            </Field>

                            {/* Hábitos adicionales */}
                            <SectionTitle icon={Activity} label="Hábitos de Vida y Bienestar" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Actividad Física (Deporte)">
                                    <SingleSelect value={formData.deporte || ''} onChange={val => upd('deporte', val)} placeholder="Seleccionar" options={['No practica', 'Ocasional (1x/sem)', 'Regular (2–3x/sem)', 'Frecuente (4+x/sem)']} />
                                </Field>
                                <Field label="Calidad de Alimentación">
                                    <SingleSelect value={formData.alimentacion || ''} onChange={val => upd('alimentacion', val)} placeholder="Seleccionar" options={['Muy mala', 'Regular', 'Buena', 'Muy buena']} />
                                </Field>
                            </div>

                            {/* Biometría y constantes vitales */}
                            <SectionTitle icon={Heart} label="Biometría y Constantes Vitales" />
                            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mb-1">
                                <p className="text-[11px] text-blue-600 font-medium">Completa estos datos si cuentas con los resultados de tu último examen médico o valoración en la empresa.</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Peso (kg)">
                                    <Input type="number" value={formData.peso || ''} onChange={e => upd('peso', e.target.value)} placeholder="Ej: 70" />
                                </Field>
                                <Field label="Talla (cm)">
                                    <Input type="number" value={formData.talla || ''} onChange={e => upd('talla', e.target.value)} placeholder="Ej: 170" />
                                </Field>
                                <Field label="IMC (Auto)">
                                    <input
                                        type="text"
                                        readOnly
                                        value={formData.imc ? `${formData.imc}${parseFloat(formData.imc) < 18.5 ? ' (Bajo)' : parseFloat(formData.imc) <= 24.9 ? ' (Normal)' : parseFloat(formData.imc) <= 29.9 ? ' (Sobrepeso)' : ' (Obesidad)'}` : ''}
                                        placeholder="Automático"
                                        className={`w-full border rounded-xl text-xs px-2 py-2.5 outline-none font-bold transition-all text-center cursor-not-allowed ${formData.imc && parseFloat(formData.imc) > 25 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-teal-50/60 border-teal-200 text-teal-800'}`}
                                    />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Presión Arterial">
                                    <Input value={formData.presionArterial || ''} onChange={e => upd('presionArterial', e.target.value)} placeholder="Ej: 120/80" />
                                </Field>
                                <Field label="Frecuencia Cardíaca">
                                    <Input value={formData.frecuenciaCardiaca || ''} onChange={e => upd('frecuenciaCardiaca', e.target.value)} placeholder="Ej: 72 bpm" />
                                </Field>
                            </div>

                            {/* Alertas médicas */}
                                                        {/* Exámenes Médicos y Alturas */}
                            <SectionTitle icon={Stethoscope} label="Exámenes Médicos Ocupacionales" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Fecha Último Examen">
                                    <Input type="date" value={formData.fechaExamenMedico || ''} onChange={e => upd('fechaExamenMedico', e.target.value)} />
                                </Field>
                                <Field label="Fecha de Seguimiento">
                                    <Input type="date" value={formData.fechaSeguimiento || ''} onChange={e => upd('fechaSeguimiento', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="Recomendaciones Médicas">
                                <Input value={formData.recomendacionesMedicas || ''} onChange={e => upd('recomendacionesMedicas', e.target.value)} placeholder="Ej: Pausas activas visuales cada 2h" />
                            </Field>

                            <SectionTitle icon={Briefcase} label="Trabajo en Alturas" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Venc. Curso Autorizado">
                                    <Input type="date" value={formData.fechaCursoAlturasAutorizado || ''} onChange={e => upd('fechaCursoAlturasAutorizado', e.target.value)} />
                                </Field>
                                <Field label="Venc. Curso Coordinador">
                                    <Input type="date" value={formData.fechaCursoAlturasCoordinador || ''} onChange={e => upd('fechaCursoAlturasCoordinador', e.target.value)} />
                                </Field>
                            </div>

<SectionTitle icon={AlertTriangle} label="Alertas Médicas" />
                            <Field label="Diagnóstico Médico">
                                <Input value={formData.diagnosticoMedico || ''} onChange={e => upd('diagnosticoMedico', e.target.value)} placeholder="Ej: Hernia discal L4-L5" />
                            </Field>
                            <Field label="Limitaciones Biomecánicas">
                                <Input value={formData.limitacionesBiomecanicas || ''} onChange={e => upd('limitacionesBiomecanicas', e.target.value)} placeholder="Ej: No levantar >10 kg" />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Alergias Químicas">
                                    <Input value={formData.alergiasQuimicas || ''} onChange={e => upd('alergiasQuimicas', e.target.value)} placeholder="Ej: Látex, Penicilina" />
                                </Field>
                                <Field label="Riesgo Cardiovascular">
                                    <SingleSelect value={formData.riesgoCardiovascular || ''} onChange={val => upd('riesgoCardiovascular', val)} placeholder="Seleccionar" options={['Bajo', 'Moderado', 'Alto', 'Muy Alto']} />
                                </Field>
                            </div>

                            {/* Comités SGSST */}
                            <SectionTitle icon={Users} label="Participación en Comités SG-SST" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Copasst">
                                    <SingleSelect value={formData.esCopasst || ''} onChange={val => upd('esCopasst', val)} placeholder="Seleccionar" options={['No', 'Sí (Principal)', 'Sí (Suplente)']} />
                                </Field>
                                <Field label="Comité Convivencia">
                                    <SingleSelect value={formData.esComiteConvivencia || ''} onChange={val => upd('esComiteConvivencia', val)} placeholder="Seleccionar" options={['No', 'Sí (Principal)', 'Sí (Suplente)']} />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Brigadista">
                                    <SingleSelect value={formData.esBrigadista || ''} onChange={val => upd('esBrigadista', val)} placeholder="Seleccionar" options={['No', 'Sí']} />
                                </Field>
                                <Field label="Comité Seg. Vial">
                                    <SingleSelect value={formData.esComiteSeguridadVial || ''} onChange={val => upd('esComiteSeguridadVial', val)} placeholder="Seleccionar" options={['No', 'Sí (Principal)', 'Sí (Suplente)']} />
                                </Field>
                            </div>

                            {/* Driver section */}
                            {isDriver(workerData.cargo) && (
                                <>
                                    <SectionTitle icon={Briefcase} label="Conductor — Documentos y Licencias" />
                                    
                                    <div className="space-y-3 mb-3 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Licencias de Conducción</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const cur = formData.licenciasConduccion && formData.licenciasConduccion.length > 0
                                                        ? [...formData.licenciasConduccion]
                                                        : (formData.licenciaConduccion || formData.licenciaConduccionVencimiento)
                                                            ? [{ id: crypto.randomUUID(), categoria: 'C1', numero: formData.licenciaConduccion || '', fechaVencimiento: formData.licenciaConduccionVencimiento || '' }]
                                                            : [];
                                                    const updated = [...cur, { id: crypto.randomUUID(), categoria: 'B1', numero: formData.identificacion || '', fechaVencimiento: '' }];
                                                    const summary = updated.map(l => `${l.categoria}${l.numero ? ` (N° ${l.numero})` : ''}`).join(', ');
                                                    const dates = updated.map(l => l.fechaVencimiento).filter(Boolean).sort();
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        licenciasConduccion: updated,
                                                        licenciaConduccion: summary,
                                                        licenciaConduccionVencimiento: dates[0] || ''
                                                    }));
                                                }}
                                                className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> + Agregar Licencia
                                            </button>
                                        </div>

                                        {(() => {
                                            const list = formData.licenciasConduccion && formData.licenciasConduccion.length > 0
                                                ? formData.licenciasConduccion
                                                : [{ id: 'init-1', categoria: 'C1', numero: formData.licenciaConduccion || '', fechaVencimiento: formData.licenciaConduccionVencimiento || '' }];
                                            
                                            return list.map((lic, idx) => (
                                                <div key={lic.id || idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 relative">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-500 uppercase block">Categoría</label>
                                                        <SingleSelect
                                                            value={lic.categoria || 'C1'}
                                                            onChange={(val) => {
                                                                const updated = list.map((item, i) => i === idx ? { ...item, categoria: val } : item);
                                                                const summary = updated.map(l => `${l.categoria}${l.numero ? ` (N° ${l.numero})` : ''}`).join(', ');
                                                                const dates = updated.map(l => l.fechaVencimiento).filter(Boolean).sort();
                                                                setFormData(prev => ({ ...prev, licenciasConduccion: updated, licenciaConduccion: summary, licenciaConduccionVencimiento: dates[0] || '' }));
                                                            }}
                                                            options={['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-gray-500 uppercase block">N° Licencia</label>
                                                        <Input
                                                            value={lic.numero || ''}
                                                            onChange={(e) => {
                                                                const updated = list.map((item, i) => i === idx ? { ...item, numero: e.target.value } : item);
                                                                const summary = updated.map(l => `${l.categoria}${l.numero ? ` (N° ${l.numero})` : ''}`).join(', ');
                                                                setFormData(prev => ({ ...prev, licenciasConduccion: updated, licenciaConduccion: summary }));
                                                            }}
                                                            placeholder="Ej: 1234567"
                                                        />
                                                    </div>
                                                    <div className="flex items-end gap-1">
                                                        <div className="flex-1">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase block">Vencimiento</label>
                                                            <Input
                                                                type="date"
                                                                value={lic.fechaVencimiento || ''}
                                                                onChange={(e) => {
                                                                    const updated = list.map((item, i) => i === idx ? { ...item, fechaVencimiento: e.target.value } : item);
                                                                    const dates = updated.map(l => l.fechaVencimiento).filter(Boolean).sort();
                                                                    setFormData(prev => ({ ...prev, licenciasConduccion: updated, licenciaConduccionVencimiento: dates[0] || '' }));
                                                                }}
                                                            />
                                                        </div>
                                                        {list.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const updated = list.filter((_, i) => i !== idx);
                                                                    const summary = updated.map(l => `${l.categoria}${l.numero ? ` (N° ${l.numero})` : ''}`).join(', ');
                                                                    const dates = updated.map(l => l.fechaVencimiento).filter(Boolean).sort();
                                                                    setFormData(prev => ({ ...prev, licenciasConduccion: updated, licenciaConduccion: summary, licenciaConduccionVencimiento: dates[0] || '' }));
                                                                }}
                                                                className="p-2 text-red-500 hover:text-red-700 rounded-lg"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Venc. SOAT">
                                            <Input type="date" value={formData.soatVencimiento || ''} onChange={e => upd('soatVencimiento', e.target.value)} />
                                        </Field>
                                        <Field label="Venc. Tecnicomecánica">
                                            <Input type="date" value={formData.tecnicomecanicaVencimiento || ''} onChange={e => upd('tecnicomecanicaVencimiento', e.target.value)} />
                                        </Field>
                                    </div>
                                </>
                            )}

                            {/* SST role section */}
                            {isSSTRole(workerData.cargo) && (
                                <>
                                    <SectionTitle icon={Shield} label="SG-SST — Licencia y Cursos" />
                                    <Field label="N° Licencia SST">
                                        <Input value={formData.licenciaSST || ''} onChange={e => upd('licenciaSST', e.target.value)} placeholder="Ej: LIC-SST-12345" />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Venc. Licencia">
                                            <Input type="date" value={formData.licenciaVencimiento || ''} onChange={e => upd('licenciaVencimiento', e.target.value)} />
                                        </Field>
                                        <Field label="Curso 50 horas">
                                            <Input type="date" value={formData.curso50h || ''} onChange={e => upd('curso50h', e.target.value)} />
                                        </Field>
                                    </div>
                                    <Field label="Curso 20 horas">
                                        <Input type="date" value={formData.curso20h || ''} onChange={e => upd('curso20h', e.target.value)} />
                                    </Field>
                                </>
                            )}
                        </div>

                        <div className="mt-8 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                            <label className="flex items-start gap-3 cursor-pointer group">
                                <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                                    <input type="checkbox" checked={habeasData} onChange={e => setHabeasData(e.target.checked)} className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-gray-300 bg-white checked:border-teal-600 checked:bg-teal-600 transition-all" />
                                    <Shield className="absolute pointer-events-none w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                                </div>
                                <div className="text-[11px] text-gray-500 leading-relaxed font-medium">
                                    <strong className="text-gray-700 block mb-1">Aceptación de Tratamiento de Datos (Ley 1581 Habeas Data)</strong>
                                    Autorizo a la empresa el tratamiento de mis datos personales, sociodemográficos y médicos (sensibles) con fines exclusivos del Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST) bajo la normativa colombiana vigente.
                                </div>
                            </label>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !habeasData}
                            className="mt-7 w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:opacity-90 text-white py-4 rounded-xl font-bold shadow-lg shadow-teal-500/25 tracking-wide transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : <><Send className="w-5 h-5" /> Enviar Actualización</>}
                        </button>
                        <p className="text-[11px] text-gray-400 text-center mt-3 leading-relaxed">
                            Tu solicitud será revisada por el administrador SST antes de ser aprobada.
                        </p>
                    </div>
                )}

                {/* ─── STEP 3: Success ─────────────────────────── */}
                {step === 3 && (
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mt-4 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
                        <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mb-5">
                            <CheckCircle className="w-10 h-10 text-teal-600" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 mb-2">¡Datos Enviados!</h2>
                        <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                            Tu solicitud de actualización fue recibida con éxito. El equipo SG-SST la revisará y aprobará próximamente.
                        </p>
                        <div className="mt-6 w-full p-4 bg-teal-50 rounded-2xl border border-teal-100 text-left">
                            <p className="text-xs font-bold text-teal-800 mb-1">¿Qué sigue?</p>
                            <ul className="text-xs text-teal-700 space-y-1 list-disc list-inside">
                                <li>El responsable SST revisará tu solicitud</li>
                                <li>Los datos serán actualizados en el sistema</li>
                                <li>Recibirás confirmación si hay cambios</li>
                            </ul>
                        </div>
                    </div>
                )}
            </main>

            <footer className="shrink-0 p-4 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    <Shield className="w-3 h-3 text-teal-500" /> Portal Seguro · Wappy
                </div>
            </footer>
        </div>
    );
}
