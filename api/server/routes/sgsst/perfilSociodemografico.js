const express = require('express');
const { generateWithKeyRotation, resolveApiKeys } = require('./sgsstGemini');
const router = express.Router();
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AuthKeys } = require('librechat-data-provider');
const { logger } = require('~/config');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getUserKey } = require('~/server/services/UserService');
const CompanyInfo = require('~/models/CompanyInfo');
const { buildStandardHeader, buildCompanyContextString, buildSignatureSection } = require('./reportHeader');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');


// ─── Helper: Obtener Empresa Activa ──────────────────────────────────────────
async function getActiveCompanyId(userId, subUserAssignedCompany = null) {
    if (subUserAssignedCompany) return subUserAssignedCompany;
    let active = await CompanyInfo.findOne({ user: userId, isActive: true });
    if (!active) active = await CompanyInfo.findOne({ user: userId });
    return active ? active._id : null;
}

// ─── Mongoose Schema ─────────────────────────────────────────────────
const WorkerEntrySchema = new mongoose.Schema({
  id: String,
  nombre: String,
  identificacion: String,
  edad: Number,
  genero: String,
  estadoCivil: String,
  nivelEscolaridad: String,
  direccion: String,
  telefono: String,
  cargo: String,
  fechaExamenMedico: String,
  fechaCursoAlturasAutorizado: String,
  fechaCursoAlturasCoordinador: String,
  diagnosticoMedico: String,
  recomendacionesMedicas: String,
  fechaSeguimiento: String,
  completedByAI: { type: Boolean, default: false },
  consentimientoFirmaDigital: { type: String, default: 'No' },
  firmaDigital: { type: String, default: null },
  // New extended sociodemographic fields
  fechaNacimiento: { type: String, default: '' },
  lugarNacimiento: { type: String, default: '' },
  barrio: { type: String, default: '' },
  municipioDomicilio: { type: String, default: '' },
  correoElectronico: { type: String, default: '' },
  emergenciaContacto: { type: String, default: '' },
  tipoSangre: { type: String, default: '' },
  rh: { type: String, default: '' },
  enfermedades: { type: String, default: '' },
  medicamentos: { type: String, default: '' },
  fuma: { type: String, default: '' },
  alcohol: { type: String, default: '' },
  terapiaPsicologica: { type: String, default: '' },
  deporte: { type: String, default: '' },
  alimentacion: { type: String, default: '' },
  riesgoCardiovascular: { type: String, default: '' },
  personasCargo: { type: mongoose.Schema.Types.Mixed, default: '' },
  estrato: { type: String, default: '' },
  vivienda: { type: String, default: '' },
  soatVencimiento: { type: String, default: '' },
  tecnicomecanicaVencimiento: { type: String, default: '' },
  licenciaSST: { type: String, default: '' },
  licenciaVencimiento: { type: String, default: '' },
  curso50h: { type: String, default: '' },
  curso20h: { type: String, default: '' },
  // Biomonitoring / Fisiología
  peso: { type: String, default: '' },
  talla: { type: String, default: '' },
  imc: { type: String, default: '' },
  presionArterial: { type: String, default: '' },
  frecuenciaCardiaca: { type: String, default: '' },
  limitacionesBiomecanicas: { type: String, default: '' },
  alergiasQuimicas: { type: String, default: '' },

  // Bio-Fit Engine (Índice Biocéntrico Integral)
  biocentricScore: { type: Number, default: 100 },
  biocentricAlerts: { type: Array, default: [] },
  biocentricIsLethal: { type: Boolean, default: false },

  // Conducción
  licenciaConduccion: { type: String, default: '' },
  licenciaConduccionVencimiento: { type: String, default: '' },
  licenciasConduccion: { type: Array, default: [] },

  // Comités SG-SST
  esCopasst: { type: String, default: 'No' },
  esComiteConvivencia: { type: String, default: 'No' },
  esBrigadista: { type: String, default: 'No' },
  esComiteSeguridadVial: { type: String, default: 'No' },

  // Formación
  formacion: { type: Array, default: [] },


  // Oráculo Predictivo H1 — Dictamen IA persistido
  dictamenPredictivoH1: { type: String, default: '' },

  // Análisis Semántico IA (Opción B)
  bioScoreIAVersion: { type: String, default: '' },     // hash de campos clínicos al momento de evaluar
  bioScoreIAReason: { type: String, default: '' },       // justificación corta
  bioScoreIADate: { type: Date, default: null },         // fecha de última evaluación IA
  bioTagsIA: { type: Array, default: [] },               // etiquetas clínicas detectadas por la IA (ej: ['Lumbalgia', 'Estrés Moderado'])
  bioScoreIAAptitud: { type: String, default: '' },      // "Apto", "Apto con Restricciones", "No Apto"
}, { _id: false });

const PerfilSociodemograficoDataSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyInfo', required: false },
  trabajadores: [WorkerEntrySchema],
  actualizacionesPendientes: { type: Array, default: [] },
  actualizacionesPendientesSalud: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now },
});

PerfilSociodemograficoDataSchema.index({ user: 1, companyId: 1 }, { unique: true });

const PerfilSociodemograficoData = mongoose.models.PerfilSociodemograficoData || mongoose.model('PerfilSociodemograficoData', PerfilSociodemograficoDataSchema);

// ─── Helper: Get API Key ─────────────────────────────────────────────
async function getApiKey(userId) {
  let resolvedApiKey;
  try {
    const storedKey = await getUserKey({ userId, name: 'google' });
    try {
      const parsed = JSON.parse(storedKey);
      resolvedApiKey = parsed[AuthKeys.GOOGLE_API_KEY] || parsed.GOOGLE_API_KEY;
    } catch {
      resolvedApiKey = storedKey;
    }
  } catch {
    logger.debug('[SGSST PerfilSociodemografico] No user Google key, trying env');
  }
  if (!resolvedApiKey) {
    resolvedApiKey = process.env.GOOGLE_KEY || process.env.GEMINI_API_KEY;
  }
  if (resolvedApiKey && typeof resolvedApiKey === 'string') {
    resolvedApiKey = resolvedApiKey.split(',')[0].trim();
  }
  return resolvedApiKey;
}

// ─── GET /profile/:workerId — Public profile page (for QR scanning) ──────────
// No JWT required — designed to be publicly accessible via QR code scan
router.get('/profile/:workerId', async (req, res) => {
  try {
    const { workerId } = req.params;
    const { type } = req.query; // 'health' or default

    // Search across all users' data for this worker ID
    const allData = await PerfilSociodemograficoData.find({}).lean();
    let worker = null;
    let matchingDoc = null;
    for (const doc of allData) {
      const found = (doc.trabajadores || []).find(t => t.id === workerId);
      if (found) { worker = found; matchingDoc = doc; break; }
    }

    if (!worker) {
      return res.status(404).send('<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:40px;"><h2>Perfil no encontrado</h2><p>El trabajador con ID <strong>' + workerId + '</strong> no existe o fue eliminado.</p></body></html>');
    }

    // Get company info
    let companyName = '';
    let companyLogo = '';
    if (matchingDoc) {
      let company = null;
      if (matchingDoc.companyId) {
        company = await CompanyInfo.findById(matchingDoc.companyId).lean();
      }
      if (!company && matchingDoc.user) {
        company = await CompanyInfo.findOne({ user: matchingDoc.user, isActive: true }).lean()
          || await CompanyInfo.findOne({ user: matchingDoc.user }).lean();
      }
      if (company) {
        companyName = company.companyName || '';
        companyLogo = company.logoBase64 || '';
      }
    }

    let logoSrc = '';
    if (companyLogo) {
      logoSrc = companyLogo.startsWith('data:') ? companyLogo : `data:image/png;base64,${companyLogo}`;
    }

    const mapsLink = worker.direccion
      ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(worker.direccion)
      : null;

    const isHealth = type === 'health';
    const profileTitle = isHealth ? 'Tarjeta de Emergencias o Identificación del Colaborador' : 'Perfil Sociodemográfico';
    const nameStr = worker.nombre || 'Sin Nombre';

    let html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${profileTitle}: ${nameStr}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 0;
  }
  
  .app-container {
    width: 100%;
    max-width: 480px;
    background: #f8fafc;
    min-height: 100vh;
    box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    position: relative;
  }
  
  .app-header {
    background: linear-gradient(135deg, #0d9488, #115e59);
    color: white;
    padding: 24px 20px 60px;
    border-radius: 0 0 24px 24px;
    position: relative;
  }
  
  .company-section {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .company-logo {
    height: 28px;
    max-width: 110px;
    object-fit: contain;
    border-radius: 6px;
    background: white;
    padding: 2px 4px;
  }
  .company-badge {
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 4px 10px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: white;
  }
  .app-title {
    font-size: 13px;
    letter-spacing: 0.08em;
    color: #ccfbf1;
    margin-top: 4px;
    font-weight: 800;
    text-transform: uppercase;
  }
  
  .profile-card {
    background: white;
    border-radius: 20px;
    padding: 20px;
    margin: -40px 16px 20px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    gap: 16px;
    position: relative;
    z-index: 10;
    border: 1px solid #f1f5f9;
  }
  
  .profile-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, ${isHealth ? '#0d9488, #0f766e' : '#0ea5e9, #4f46e5'});
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 800;
    color: white;
    box-shadow: 0 4px 12px ${isHealth ? 'rgba(13, 148, 136, 0.2)' : 'rgba(14, 165, 233, 0.2)'};
    flex-shrink: 0;
  }
  
  .profile-info {
    flex-grow: 1;
    min-width: 0;
  }
  .profile-name {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.25;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .profile-role {
    display: inline-block;
    background: ${isHealth ? '#f0fdfa' : '#f0f9ff'};
    color: ${isHealth ? '#0f766e' : '#0369a1'};
    padding: 4px 12px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: capitalize;
  }
  
  .tab-container {
    padding: 0 16px;
    margin-bottom: 20px;
  }
  .tabs {
    display: flex;
    background: #e2e8f0;
    border-radius: 12px;
    padding: 4px;
    gap: 4px;
  }
  .tab-btn {
    flex: 1;
    border: none;
    background: transparent;
    padding: 10px 4px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .tab-btn.active {
    background: white;
    color: ${isHealth ? '#0f766e' : '#1e40af'};
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
  
  .tab-content {
    display: none;
    padding: 0 16px;
    animation: fadeIn 0.25s ease;
  }
  .tab-content.active {
    display: block;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .info-card {
    background: white;
    border-radius: 16px;
    padding: 18px;
    margin-bottom: 16px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.02);
    border: 1px solid #f1f5f9;
  }
  .card-title {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title-red { color: #dc2626; }
  .title-teal { color: #0d9488; }
  .title-blue { color: #2563eb; }
  .title-purple { color: #7c3aed; }
  .title-orange { color: #ea580c; }
  
  .info-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .info-row:last-child {
    border-bottom: none;
  }
  .icon-wrapper {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .icon-red { background: #fff1f2; color: #f43f5e; }
  .icon-blue { background: #eff6ff; color: #3b82f6; }
  .icon-green { background: #f0fdf4; color: #10b981; }
  .icon-orange { background: #fff7ed; color: #f97316; }
  .icon-purple { background: #faf5ff; color: #a855f7; }
  
  .info-content {
    flex-grow: 1;
    min-width: 0;
  }
  .info-label {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }
  .info-value {
    font-size: 14px;
    font-weight: 700;
    color: #1e293b;
    word-break: break-word;
  }
  
  .emergency-banner {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: white;
    border-radius: 16px;
    padding: 18px;
    margin-bottom: 16px;
    box-shadow: 0 10px 25px rgba(220, 38, 38, 0.2);
  }
  .emergency-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 14px;
    opacity: 0.95;
  }
  .emergency-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .emergency-item {
    display: flex;
    flex-direction: column;
  }
  .emergency-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.8;
    margin-bottom: 4px;
    font-weight: 700;
  }
  .emergency-value {
    font-size: 16px;
    font-weight: 800;
  }
  .emergency-value.blood-type {
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
  }
  .emergency-contact-box {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }
  .emergency-value-contact {
    font-size: 14px;
    font-weight: 800;
  }
  
  .alert-box {
    border-radius: 12px;
    padding: 12px;
    border: 1px solid;
    margin-bottom: 10px;
  }
  .alert-box:last-child {
    margin-bottom: 0;
  }
  .alert-red { background: #fff5f5; border-color: #feb2b2; }
  .alert-red .alert-label { color: #c53030; }
  .alert-red .alert-value { color: #9b2c2c; }
  
  .alert-orange { background: #fffaf0; border-color: #fbd38d; }
  .alert-orange .alert-label { color: #c05621; }
  .alert-orange .alert-value { color: #9c4221; }

  .alert-gray { background: #f8fafc; border-color: #e2e8f0; }
  .alert-gray .alert-label { color: #475569; }
  .alert-gray .alert-value { color: #1e293b; }

  .alert-label {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }
  .alert-value {
    font-size: 13px;
    font-weight: 700;
  }
  
  .safe-card {
    border: 1px solid #d1fae5;
    background: #f0fdf4;
  }
  
  .maps-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
    text-align: center;
    border-radius: 12px;
    text-decoration: none;
    font-weight: 700;
    font-size: 14px;
    margin-top: 16px;
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.15);
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .maps-btn:hover {
    opacity: 0.95;
  }
  
  .app-footer {
    text-align: center;
    padding: 24px 16px;
    font-size: 11px;
    color: #94a3b8;
    margin-top: auto;
    border-top: 1px solid #f1f5f9;
    background: white;
  }
  .app-footer strong {
    color: #64748b;
  }
</style>
</head>
<body>
<div class="app-container">
  
  <!-- Encabezado de la App -->
  <header class="app-header">
    <div class="company-section">
      ${logoSrc ? `<img src="${logoSrc}" alt="${companyName}" class="company-logo">` : ''}
      <span class="company-badge">${companyName || 'SST - WAPPY'}</span>
    </div>
    <div class="app-title">${profileTitle}</div>
  </header>
  
  <!-- Tarjeta del Trabajador -->
  <div class="profile-card">
    <div class="profile-avatar">${nameStr.charAt(0).toUpperCase()}</div>
    <div class="profile-info">
      <h1 class="profile-name" title="${nameStr}">${nameStr}</h1>
      <span class="profile-role">${worker.cargo || 'Sin Cargo'}</span>
    </div>
  </div>

  ${isHealth ? `
  <!-- ================= VISTA MÉDICA / SALUD ================= -->
  
  <!-- Navegación por Pestañas -->
  <div class="tab-container">
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab(event, 'salud-tab')">🩺 Salud</button>
      <button class="tab-btn" onclick="switchTab(event, 'cert-tab')">🎓 Certificados</button>
      <button class="tab-btn" onclick="switchTab(event, 'contact-tab')">📞 Contacto</button>
    </div>
  </div>

  <!-- Pestaña 1: Salud -->
  <div id="salud-tab" class="tab-content active">
    <!-- Información de Emergencia Crítica -->
    <div class="emergency-banner">
      <div class="emergency-header">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
        <span>Información de Emergencia</span>
      </div>
      <div class="emergency-grid">
        <div class="emergency-item">
          <div class="emergency-label">Tipo de Sangre</div>
          <div class="emergency-value blood-type">${worker.tipoSangre || '—'}</div>
        </div>
        <div class="emergency-item">
          <div class="emergency-label">Teléfono</div>
          <div class="emergency-value">${worker.telefono || '—'}</div>
        </div>
      </div>
      ${worker.emergenciaContacto ? `
      <div class="emergency-contact-box">
        <div class="emergency-label">Contacto de Emergencia</div>
        <div class="emergency-value-contact">${worker.emergenciaContacto}</div>
      </div>` : ''}
    </div>

    <!-- Alertas Médicas -->
    ${(worker.alergiasQuimicas || worker.limitacionesBiomecanicas || worker.enfermedades || worker.medicamentos) ? `
    <div class="info-card">
      <h2 class="card-title title-red">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        Alertas Médicas Registradas
      </h2>
      <div style="display: flex; flex-direction: column;">
        ${worker.alergiasQuimicas ? `
        <div class="alert-box alert-red">
          <div class="alert-label">Alergias Químicas</div>
          <div class="alert-value">${worker.alergiasQuimicas}</div>
        </div>` : ''}
        ${worker.limitacionesBiomecanicas ? `
        <div class="alert-box alert-orange">
          <div class="alert-label">Restricciones / Limitaciones</div>
          <div class="alert-value">${worker.limitacionesBiomecanicas}</div>
        </div>` : ''}
        ${worker.enfermedades ? `
        <div class="alert-box alert-gray">
          <div class="alert-label">Enfermedades Preexistentes</div>
          <div class="alert-value">${worker.enfermedades}</div>
        </div>` : ''}
        ${worker.medicamentos ? `
        <div class="alert-box alert-gray">
          <div class="alert-label">Medicamentos de Consumo</div>
          <div class="alert-value">${worker.medicamentos}</div>
        </div>` : ''}
      </div>
    </div>` : `
    <div class="info-card safe-card">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="icon-wrapper icon-green">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        </div>
        <div>
          <div style="font-weight:700; color:#065f46; font-size:14px;">Sin Alertas Médicas</div>
          <div style="font-size:12px; color:#047857;">El trabajador no registra alergias o restricciones.</div>
        </div>
      </div>
    </div>`}
  </div>

  <!-- Pestaña 2: Certificados -->
  <div id="cert-tab" class="tab-content">
    <div class="info-card">
      <h2 class="card-title title-teal">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        Cursos y Exámenes Ocupacionales
      </h2>
      <div style="display: flex; flex-direction: column;">
        <div class="info-row">
          <div class="icon-wrapper icon-green">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 9.172V5L8 4z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Alturas — Trab. Autorizado</div>
            <div class="info-value">${worker.fechaCursoAlturasAutorizado || 'No registra'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-green">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 9.172V5L8 4z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Alturas — Coordinador</div>
            <div class="info-value">${worker.fechaCursoAlturasCoordinador || 'No registra'}</div>
          </div>
        </div>
        ${worker.fechaExamenMedico ? `
        <div class="info-row">
          <div class="icon-wrapper icon-green">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.871 4A17.926 17.926 0 003 12c0 2.871.67 5.586 1.871 8m14.13 0a17.93 17.93 0 001.87-8c0-2.871-.67-5.586-1.87-8M9 9h1.5m2 0H14m-7 4h1.5m2 0H12m-7 4h1.5m2 0H10"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Examen Médico Ocupacional</div>
            <div class="info-value">${worker.fechaExamenMedico}</div>
          </div>
        </div>` : ''}
        ${worker.licenciaSST ? `
        <div class="info-row">
          <div class="icon-wrapper icon-green">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Licencia SST</div>
            <div class="info-value">${worker.licenciaSST}</div>
          </div>
        </div>` : ''}
        ${worker.curso50h ? `
        <div class="info-row">
          <div class="icon-wrapper icon-green">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Curso 50 Horas</div>
            <div class="info-value">${worker.curso50h}</div>
          </div>
        </div>` : ''}
        ${worker.curso20h ? `
        <div class="info-row">
          <div class="icon-wrapper icon-green">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Curso 20 Horas</div>
            <div class="info-value">${worker.curso20h}</div>
          </div>
        </div>` : ''}
      </div>
    </div>

    ${(worker.esCopasst && worker.esCopasst !== 'No') || (worker.esComiteConvivencia && worker.esComiteConvivencia !== 'No') || (worker.esBrigadista && worker.esBrigadista !== 'No') || (worker.esComiteSeguridadVial && worker.esComiteSeguridadVial !== 'No') ? `
    <div class="info-card">
      <h2 class="card-title title-teal">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        Comités y Participación SG-SST
      </h2>
      <div style="display: flex; flex-direction: column;">
        ${(worker.esCopasst && worker.esCopasst !== 'No') ? `
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">COPASST</div>
            <div class="info-value">${worker.esCopasst}</div>
          </div>
        </div>` : ''}
        ${(worker.esComiteConvivencia && worker.esComiteConvivencia !== 'No') ? `
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Comité de Convivencia</div>
            <div class="info-value">${worker.esComiteConvivencia}</div>
          </div>
        </div>` : ''}
        ${(worker.esBrigadista && worker.esBrigadista !== 'No') ? `
        <div class="info-row">
          <div class="icon-wrapper icon-orange">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343m1.414-1.414A8 8 0 0118.657 17.3m-10.6-10.6l10.6 10.6M9 9h.01M15 15h.01M12 12h.01M12 15h.01M12 9h.01M9 12h.01M15 12h.01"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Brigadista de Emergencia</div>
            <div class="info-value">${worker.esBrigadista}</div>
          </div>
        </div>` : ''}
        ${(worker.esComiteSeguridadVial && worker.esComiteSeguridadVial !== 'No') ? `
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Comité de Seguridad Vial</div>
            <div class="info-value">${worker.esComiteSeguridadVial}</div>
          </div>
        </div>` : ''}
      </div>
    </div>` : ''}
  </div>

  <!-- Pestaña 3: Contacto -->
  <div id="contact-tab" class="tab-content">
    <div class="info-card">
      <h2 class="card-title title-blue">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
        Datos de Contacto e Identificación
      </h2>
      <div style="display: flex; flex-direction: column;">
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Identificación (Cédula)</div>
            <div class="info-value">${worker.identificacion || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Teléfono Principal</div>
            <div class="info-value">
              <a href="tel:${worker.telefono}" style="color: inherit; text-decoration: none;">${worker.telefono || '—'}</a>
            </div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Dirección Residencia</div>
            <div class="info-value">${worker.direccion || '—'}</div>
          </div>
        </div>
      </div>
      ${mapsLink ? `
      <a href="${mapsLink}" class="maps-btn" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
        Ver Dirección en Google Maps
      </a>` : ''}
    </div>
  </div>
  ` : `
  <!-- ================= VISTA SOCIODEMOGRÁFICA ================= -->
  
  <!-- Navegación por Pestañas -->
  <div class="tab-container">
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab(event, 'personal-tab')">👤 Personal</button>
      <button class="tab-btn" onclick="switchTab(event, 'socio-tab')">💼 Socioec.</button>
      <button class="tab-btn" onclick="switchTab(event, 'cert-tab')">🎓 Certificados</button>
    </div>
  </div>

  <!-- Pestaña 1: Información Personal -->
  <div id="personal-tab" class="tab-content active">
    <div class="info-card">
      <h2 class="card-title title-blue">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
        Información General
      </h2>
      <div style="display: flex; flex-direction: column;">
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Cédula</div>
            <div class="info-value">${worker.identificacion || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Edad</div>
            <div class="info-value">${worker.edad ? worker.edad + ' años' : '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Género / Sexo</div>
            <div class="info-value">${worker.genero || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Estado Civil</div>
            <div class="info-value">${worker.estadoCivil || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Nivel de Escolaridad</div>
            <div class="info-value">${worker.nivelEscolaridad || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Teléfono</div>
            <div class="info-value">
              <a href="tel:${worker.telefono}" style="color: inherit; text-decoration: none;">${worker.telefono || '—'}</a>
            </div>
          </div>
        </div>
        ${worker.emergenciaContacto ? `
        <div class="info-row">
          <div class="icon-wrapper icon-red">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Contacto de Emergencia</div>
            <div class="info-value">${worker.emergenciaContacto}</div>
          </div>
        </div>` : ''}
        <div class="info-row">
          <div class="icon-wrapper icon-blue">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Dirección Domicilio</div>
            <div class="info-value">${worker.direccion || '—'}</div>
          </div>
        </div>
      </div>
      ${mapsLink ? `
      <a href="${mapsLink}" class="maps-btn" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
        Ver Dirección en Google Maps
      </a>` : ''}
    </div>
  </div>

  <!-- Pestaña 2: Información Socioeconómica -->
  <div id="socio-tab" class="tab-content">
    <div class="info-card">
      <h2 class="card-title title-orange">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        Condiciones Habitacionales
      </h2>
      <div style="display: flex; flex-direction: column;">
        <div class="info-row">
          <div class="icon-wrapper icon-orange">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Tipo de Vivienda</div>
            <div class="info-value">${worker.vivienda || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-orange">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Estrato Habitacional</div>
            <div class="info-value">${worker.estrato || '—'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-orange">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Personas a Cargo</div>
            <div class="info-value">${worker.personasCargo !== undefined && worker.personasCargo !== '' ? worker.personasCargo : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Pestaña 3: Certificados Operativos -->
  <div id="cert-tab" class="tab-content">
    <div class="info-card">
      <h2 class="card-title title-purple">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        Certificaciones e Inducciones
      </h2>
      <div style="display: flex; flex-direction: column;">
        <div class="info-row">
          <div class="icon-wrapper icon-purple">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 9.172V5L8 4z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Alturas — Trab. Autorizado</div>
            <div class="info-value">${worker.fechaCursoAlturasAutorizado || 'N/A'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-purple">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 9.172V5L8 4z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Alturas — Coordinador</div>
            <div class="info-value">${worker.fechaCursoAlturasCoordinador || 'N/A'}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="icon-wrapper icon-purple">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
          </div>
          <div class="info-content">
            <div class="info-label">Firma Digital</div>
            <div class="info-value">${worker.consentimientoFirmaDigital === 'Sí' ? 'Autorizado' : 'No Autorizado'}</div>
          </div>
        </div>
        ${worker.consentimientoFirmaDigital === 'Sí' && worker.firmaDigital ? `
        <div style="margin-top: 15px; text-align: center; background: #f8fafc; border-radius: 12px; padding: 12px; border: 1px dashed #cbd5e1;">
          <span style="display: block; font-size: 10px; color: #64748b; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; letter-spacing:0.05em;">Firma del Trabajador</span>
          <img src="${worker.firmaDigital}" alt="Firma del trabajador" style="max-height: 80px; max-width: 100%; border-radius:4px;" />
        </div>` : ''}
      </div>
    </div>
  </div>
  `}

  <!-- Pie de Página -->
  <footer class="app-footer">
    <div>Ficha generada el ${new Date().toLocaleDateString('es-ES')}</div>
    <div style="margin-top:4px;">SG-SST · Sistema de Gestión · <strong>WAPPY IA</strong></div>
  </footer>
</div>

<script>
  function switchTab(evt, tabId) {
    // Ocultar todos los contenidos de pestaña
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(c => c.classList.remove('active'));
    
    // Desactivar todos los botones de pestaña
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    
    // Mostrar contenido de pestaña activo
    document.getElementById(tabId).classList.add('active');
    
    // Activar botón pulsado
    evt.currentTarget.classList.add('active');
  }
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('[SGSST PerfilSociodemografico] Profile page error:', error);
    res.status(500).send('Error al cargar perfil');
  }
});

// ─── GET /data — Load saved worker data ─────────────────────────────
router.get('/data', requireJwtAuth, async (req, res) => {
  try {
    const isSub = !!req.user.isSubUser;
    const targetUserId = (isSub && req.user.parentUser) ? req.user.parentUser : req.user.id;
    const companyId = await getActiveCompanyId(targetUserId, isSub ? req.user.assignedCompany : null);
    const data = await PerfilSociodemograficoData.findOne({ user: targetUserId, companyId: companyId });
    if (data) {
      // Recalculate scores for all workers to ensure perfect parity with the Matriz
      // This is the canonical source of truth — any view that reads from here gets the same score
      let needsSave = false;
      let finalWorkers = data.trabajadores || [];

      if (data.trabajadores && data.trabajadores.length > 0 && !isSub) {
        try {
          const updatedWorkers = await recalculateAndSyncAllWorkers(targetUserId, companyId, data.trabajadores);
          // Check if any score changed — if so, persist the updated scores
          for (let i = 0; i < updatedWorkers.length; i++) {
            const orig = data.trabajadores[i];
            const updated = updatedWorkers[i];
            if (orig && updated && (orig.biocentricScore !== updated.biocentricScore ||
                JSON.stringify(orig.biocentricAlerts) !== JSON.stringify(updated.biocentricAlerts))) {
              needsSave = true;
              break;
            }
          }
          if (needsSave) {
            data.trabajadores = updatedWorkers;
            data.updatedAt = Date.now();
            await data.save();
          }
          finalWorkers = updatedWorkers;
        } catch (recalcErr) {
          logger.error('[SGSST PerfilSociodemografico] Error recalculating scores on GET /data:', recalcErr);
        }
      }

      // If sub-user only has self permission, filter down to this worker
      if (isSub && !req.user.subUserPermissions?.includes('sgsst:perfil_sociodemografico_all') && req.user.workerDocument) {
        const myDoc = String(req.user.workerDocument).trim();
        finalWorkers = finalWorkers.filter(w => String(w.identificacion).trim() === myDoc);
      }

      return res.json({
        trabajadores: finalWorkers,
        actualizacionesPendientes: isSub ? [] : (data.actualizacionesPendientes || []),
        actualizacionesPendientesSalud: isSub ? [] : (data.actualizacionesPendientesSalud || [])
      });
    } else {
      res.json({ trabajadores: [], actualizacionesPendientes: [], actualizacionesPendientesSalud: [] });
    }
  } catch (error) {
    logger.error('[SGSST PerfilSociodemografico] Load error:', error);
    res.status(500).json({ error: 'Error al cargar datos' });
  }
});


// ─── Helper: Clinical Hash — compares only the text fields the AI analyzes ────
function buildClinicalHash(w) {
  const crypto = require('crypto');
  const fields = [
    w.limitacionesBiomecanicas, w.recomendacionesMedicas, w.diagnosticoMedico,
    w.enfermedades, w.alergiasQuimicas, w.medicamentos, w.cargo
  ].map(v => String(v || '')).join('|');
  return crypto.createHash('md5').update(fields).digest('hex');
}

/**
 * ─── Semantic Tagging via IA ─────────────────────────────────────────────────
 * The AI only reads complex medical text (restrictions, diagnoses, recommendations)
 * and returns structured semantic tags. ALL math (scoring, multipliers) is done
 * by the deterministic system in the frontend (calcFit).
 */
async function runIASemanticTagging(worker, userId) {
  const textFields = [
    worker.limitacionesBiomecanicas,
    worker.recomendacionesMedicas,
    worker.diagnosticoMedico,
    worker.enfermedades,
    worker.alergiasQuimicas,
    worker.medicamentos
  ].filter(v => v && String(v).trim().length > 2 && !String(v).toLowerCase().includes('ninguna') && !String(v).toLowerCase().includes('ninguno'));

  // If all text fields are empty/null, no need to call IA
  if (textFields.length === 0) {
    return { tags: [], razon: 'Sin hallazgos clínicos complejos en texto libre.', aptitud: 'Apto' };
  }

  const prompt = `Eres un médico ocupacional experto del sistema WAPPY. Analiza el siguiente perfil clínico de un trabajador y extrae etiquetas clínicas estandarizadas.

PERFIL DEL TRABAJADOR (${worker.nombre || 'Sin nombre'} — Cargo: ${worker.cargo || 'N/D'}):
- Limitaciones Biomecánicas: "${worker.limitacionesBiomecanicas || 'Ninguna'}"
- Recomendaciones Médicas: "${worker.recomendacionesMedicas || 'Ninguna'}"
- Diagnóstico Médico: "${worker.diagnosticoMedico || 'Ninguno'}"
- Enfermedades Actuales: "${worker.enfermedades || 'Ninguna'}"
- Alergias/Sensibilidades Químicas: "${worker.alergiasQuimicas || 'Ninguna'}"
- Medicamentos actuales: "${worker.medicamentos || 'Ninguno'}"

TU TAREA:
Lee el texto libre de cada campo (aunque no use términos médicos exactos, ej: "dolor en la parte baja" = Lumbalgia) y clasifica cada hallazgo usando el siguiente catálogo de etiquetas:

ETIQUETAS DISPONIBLES (usa EXACTAMENTE estos nombres):
- "Lumbalgia" — dolor lumbar, dolor en la espalda baja, parte baja de la espalda, zona lumbar
- "Hernia_Discal" — hernia de disco, hernia discal, disco degenerado
- "Cervicalgia" — dolor cervical, cuello, nuca, parte superior de la espalda
- "Epicondilitis" — codo de tenista, dolor en el codo, epicondilo
- "Tunel_Carpiano" — túnel carpiano, muñeca, hormigueo en mano
- "Restriccion_Hombro" — manguito rotador, hombro, rotador
- "Restriccion_Rodilla" — rodilla, menisco, ligamento
- "No_Carga_Peso" — no levantar, no cargar, peso máximo, limitación de carga
- "No_Bipedestacion" — no estar de pie, no bipedestación prolongada
- "No_Sedestacion" — no sentarse mucho, no sedestación prolongada
- "Hipoacusia" — pérdida auditiva, hipoacusia, no ruido, protección auditiva
- "Vision_Reducida" — visión reducida, usa lentes, problema de visión
- "HTA" — hipertensión, presión alta, tensión arterial elevada
- "Cardiopatia" — cardiopatía, problema cardíaco, insuficiencia cardíaca, angina
- "Diabetes" — diabetes, glucosa elevada, resistencia a la insulina
- "Epilepsia" — epilepsia, convulsiones, crisis epiléptica
- "Vertigo" — vértigo, mareo, pérdida de equilibrio, no alturas
- "EPOC" — EPOC, bronquitis crónica, enfermedad pulmonar
- "Asma" — asma, dificultad respiratoria, broncoespasmo
- "Alergia_Quimica" — alergia a químicos, dermatitis química, sensibilidad química
- "Medicamento_SNC" — medicamento psiquiátrico, sedante, pastillas para dormir, ansiolítico, antidepresivo
- "Restriccion_Mental" — ansiedad, depresión, estrés severo, psicoterapia activa, no turno nocturno
- "Patologia_Cronica" — enfermedad crónica declarada no clasificada arriba
- "Diagnostico_Reciente" — diagnóstico reciente, nuevo diagnóstico, bajo seguimiento médico
- "Recomendacion_Leve" — pausas activas, fisioterapia, ergonomía, control médico periódico
- "Sin_Hallazgos" — todo normal, sin restricciones, ninguna, sin hallazgos

INSTRUCCIONES ESTRICTAS:
1. Incluye una etiqueta por CADA hallazgo real que encuentres en el texto.
2. Si el texto dice "sin restricciones" o similar, devuelve solo ["Sin_Hallazgos"].
3. Redacta una "razon" profesional de 2-3 líneas explicando los hallazgos clínicos.
4. Determina la "aptitud" global: "Apto", "Apto con Restricciones" o "No Apto".

Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto extra):
{
  "tags": ["Etiqueta1", "Etiqueta2"],
  "razon": "<Texto médico-profesional aquí>",
  "aptitud": "<Apto | Apto con Restricciones | No Apto>"
}`;

  const { generateWithKeyRotation } = require('./sgsstGemini');
  const preferredModel = (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
  const result = await generateWithKeyRotation(preferredModel, userId, prompt);
  let text = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(text);
}

// ─── Helper: Evaluate all workers in a doc using IA tagging ─────────────────
async function triggerIAEvaluation(userId, workerId, apiKey, perfilesList) {
  try {
    const companyId = await getActiveCompanyId(userId);
    const doc = await PerfilSociodemograficoData.findOne({ user: userId, companyId });
    if (!doc) return;
    const worker = (doc.trabajadores || []).find(w => w.id === workerId);
    if (!worker) return;

    const parsed = await runIASemanticTagging(worker, userId);
    const newHash = buildClinicalHash(worker);
    const workerIndex = doc.trabajadores.findIndex(w => w.id === workerId);
    if (workerIndex !== -1) {
      const cur = doc.trabajadores[workerIndex]._doc || doc.trabajadores[workerIndex];
      doc.trabajadores[workerIndex] = {
        ...cur,
        bioTagsIA: parsed.tags || [],
        bioScoreIAReason: parsed.razon || '',
        bioScoreIAAptitud: parsed.aptitud || '',
        bioScoreIAVersion: newHash,
        bioScoreIADate: new Date()
      };
      await doc.save();
      logger.info(`[OraculoH1] IA tags generados para ${worker.nombre}: [${(parsed.tags || []).join(', ')}]`);
    }
    return doc.trabajadores[workerIndex];
  } catch (err) {
    logger.warn(`[OraculoH1] IA tagging failed for worker ${workerId}: ${err.message}`);
    return null;
  }
}

const { extractTextFromFile, cleanAndParseJson } = require('./fileExtractorHelper');

// ─── POST /import-file ──────────────────────────────────────────────────────
router.post('/import-file', requireJwtAuth, express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { fileData, fileName, mimeType, modelName } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No se recibieron datos del archivo.' });

    // 1. Convertir Base64 a Buffer en memoria
    const base64Data = fileData.split(';base64,').pop();
    const buffer = Buffer.from(base64Data, 'base64');

    // 2. Extraer texto según tipo de archivo de forma robusta
    const extractedText = await extractTextFromFile({ buffer, fileName, mimeType });

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: 'No se pudo extraer texto legible del archivo.' });
    }

    // 3. Configurar e invocar a Gemini con rotación de claves y modelos (503/429/403/400)
    const personalization = req.user?.personalization?.geminiModels;
    const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
    const finalModelName = modelName || preferredModel;

    const modelInstance = {
      model: finalModelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              identificacion: { type: 'string' },
              edad: { type: 'string' },
              genero: { type: 'string' },
              estadoCivil: { type: 'string' },
              nivelEscolaridad: { type: 'string' },
              direccion: { type: 'string' },
              telefono: { type: 'string' },
              cargo: { type: 'string' },
              fechaExamenMedico: { type: 'string' },
              diagnosticoMedico: { type: 'string' },
              recomendacionesMedicas: { type: 'string' },
              fechaSeguimiento: { type: 'string' },
              fechaNacimiento: { type: 'string' },
              lugarNacimiento: { type: 'string' },
              barrio: { type: 'string' },
              municipioDomicilio: { type: 'string' },
              correoElectronico: { type: 'string' },
              deporte: { type: 'string' },
              alimentacion: { type: 'string' },
              riesgoCardiovascular: { type: 'string' },
              emergenciaContacto: { type: 'string' },
              tipoSangre: { type: 'string' },
              enfermedades: { type: 'string' },
              medicamentos: { type: 'string' },
              fuma: { type: 'string' },
              alcohol: { type: 'string' },
              terapiaPsicologica: { type: 'string' },
              personasCargo: { type: 'string' },
              estrato: { type: 'string' },
              vivienda: { type: 'string' },
              peso: { type: 'string' },
              talla: { type: 'string' },
              imc: { type: 'string' },
              presionArterial: { type: 'string' },
              frecuenciaCardiaca: { type: 'string' },
              limitacionesBiomecanicas: { type: 'string' },
              alergiasQuimicas: { type: 'string' },
              esCopasst: { type: 'string' },
              esComiteConvivencia: { type: 'string' },
              esBrigadista: { type: 'string' },
              esComiteSeguridadVial: { type: 'string' },
              fechaCursoAlturasAutorizado: { type: 'string' },
              fechaCursoAlturasCoordinador: { type: 'string' },
              soatVencimiento: { type: 'string' },
              tecnicomecanicaVencimiento: { type: 'string' },
              licenciaConduccion: { type: 'string' },
              licenciaConduccionVencimiento: { type: 'string' },
              licenciasConduccion: { type: 'array' },
              licenciaSST: { type: 'string' },
              licenciaVencimiento: { type: 'string' },
              curso50h: { type: 'string' },
              curso20h: { type: 'string' },
              consentimientoFirmaDigital: { type: 'string' }
            },
            required: ['nombre', 'identificacion'],
          },
        },
      },
    };

    const promptText = `
    Eres un experto senior en Salud Ocupacional, Medicina del Trabajo y Seguridad y Salud en el Trabajo (SST) en Colombia.
    Tu tarea es leer el siguiente documento adjunto (que puede ser un concepto de aptitud médica, un certificado médico, un listado sociodemográfico, una encuesta de autoreporte o un reporte clínico) y extraer toda la información sociodemográfica y de condiciones de salud de los trabajadores.
    Para cada trabajador identificado, mapea la información a la estructura JSON solicitada.
    
    Asegúrate de:
    - Retornar un array JSON conteniendo cada trabajador como un objeto.
    - Si encuentras peso y talla, calcula el IMC si no viene explícito.
    - Campos como 'diagnosticoMedico', 'recomendacionesMedicas', 'enfermedades', 'limitacionesBiomecanicas' deben ser extraídos fielmente del concepto médico o reporte para estructurar el perfil epidemiológico del trabajador.
    
    DOCUMENTO A ANALIZAR:
    Nombre del archivo: ${fileName || 'Documento adjunto'}
    
    ${extractedText}
    `;

    const result = await generateWithKeyRotation(modelInstance, req.user?.id || req.user, [{ text: promptText }]);
    const response = await result.response;
    const responseText = response.text();
    const cleanJson = cleanAndParseJson(responseText);

    res.json({ success: true, trabajadores: Array.isArray(cleanJson) ? cleanJson : [cleanJson] });
  } catch (error) {
    logger.error('[SGSST PerfilSociodemografico] Import error:', error);
    res.status(500).json({ error: error.message || 'Error al procesar el archivo con IA' });
  }
});

function cleanHtmlOutput(text) {
  if (!text) return '';
  return text.replace(/```html\n?/g, '').replace(/```\n?/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
    .replace(/<head>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
    .trim();
}

// ─── POST /dictamen/generate — Generación Oficial del Dictamen Predictivo H1 con Encabezado y Firmas ──
router.post('/dictamen/generate', express.json({ limit: '10mb' }), requireJwtAuth, async (req, res) => {
  try {
    const { workerId, worker: fallbackWorker, profile, fit, modelName } = req.body;
    if (!workerId && !fallbackWorker) {
      return res.status(400).json({ error: 'Identificador de trabajador requerido' });
    }

    const isSub = !!req.user.isSubUser;
    const targetUserId = (isSub && req.user.parentUser) ? req.user.parentUser : req.user.id;
    const companyId = await getActiveCompanyId(targetUserId, isSub ? req.user.assignedCompany : null);

    // 1. Cargar el trabajador desde la BD o usar fallback
    let doc = await PerfilSociodemograficoData.findOne({
      user: targetUserId,
      ...(companyId ? { companyId } : {})
    });
    
    let currentWorker = null;
    let workerIndex = -1;
    if (doc && doc.trabajadores) {
      workerIndex = doc.trabajadores.findIndex(w => String(w.id) === String(workerId) || String(w._id) === String(workerId));
      if (workerIndex !== -1) {
        currentWorker = doc.trabajadores[workerIndex].toObject ? doc.trabajadores[workerIndex].toObject() : doc.trabajadores[workerIndex];
      }
    }
    if (!currentWorker && fallbackWorker) {
      currentWorker = fallbackWorker;
    }
    if (!currentWorker) {
      return res.status(404).json({ error: 'Trabajador no encontrado en el sistema' });
    }

    // 2. Cargar información oficial de la empresa
    let loadedCompanyInfo = null;
    try {
      if (companyId) {
        loadedCompanyInfo = await CompanyInfo.findOne({ _id: companyId, user: targetUserId }).lean();
      }
      if (!loadedCompanyInfo) {
        loadedCompanyInfo = await CompanyInfo.findOne({ user: targetUserId, isActive: true }).lean()
          || await CompanyInfo.findOne({ user: targetUserId }).lean();
      }
    } catch (ciErr) {
      logger.warn('[OraculoH1] Error loading company info:', ciErr.message);
    }

    // 3. Obtener API key de Google/Gemini
    const resolvedApiKey = await getApiKey(req.user.id);
    if (!resolvedApiKey) {
      return res.status(400).json({ error: 'No se ha configurado la clave API de Google.' });
    }

    const workerName = currentWorker.nombre || 'Colaborador';
    const cargoName = currentWorker.cargo || profile?.nombreCargo || 'Cargo Operativo';
    const calculatedScore = (currentWorker.biocentricScore !== undefined && currentWorker.biocentricScore !== null)
      ? currentWorker.biocentricScore
      : (fit?.score !== undefined ? fit.score : 85);

    // 4. Construir Encabezado Corporativo Oficial Estándar (Imagen 3)
    const fechaEmision = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const headerHTML = buildStandardHeader({
      title: `DICTAMEN PREDICTIVO DE APTITUD LABORAL - ${workerName.toUpperCase()}`,
      companyInfo: loadedCompanyInfo,
      date: fechaEmision,
      norm: 'Art. 16 Res. 1843 de 2025 / GTC 45:2012 / Dec. 1072 de 2015',
      responsibleName: loadedCompanyInfo?.responsibleSST || 'Responsable SG-SST'
    });

    // 5. Preparar Contexto Detallado del Colaborador y Demandas del Cargo
    const companyContextStr = buildCompanyContextString(loadedCompanyInfo);
    const workerContext = `DATOS BIOMÉDRICOS Y CLÍNICOS DEL COLABORADOR:
- Nombre Completo: ${workerName}
- Identificación: ${currentWorker.identificacion || 'N/A'}
- Cargo: ${cargoName}
- Edad: ${currentWorker.edad || 'N/A'} años | Género: ${currentWorker.genero || 'N/A'}
- Estado Civil: ${currentWorker.estadoCivil || 'N/A'} | Nivel Escolaridad: ${currentWorker.nivelEscolaridad || 'N/A'}
- Examen Médico Ocupacional: Último realizado el ${currentWorker.fechaExamenMedico || 'No registrado'}
- Concepto / Diagnóstico Médico: ${currentWorker.diagnosticoMedico || 'Apto / Sin Hallazgos'}
- Recomendaciones Médicas: ${currentWorker.recomendacionesMedicas || 'Ninguna reportada'}
- Signos Vitales: IMC=${currentWorker.imc || 'N/A'}, PA=${currentWorker.presionArterial || 'N/A'} mmHg, FC=${currentWorker.frecuenciaCardiaca || 'N/A'} lpm
- Enfermedades declaradas: ${currentWorker.enfermedades || 'Ninguna'}
- Medicamentos habituales: ${currentWorker.medicamentos || 'Ninguno'}
- Restricciones Biomecánicas: ${currentWorker.limitacionesBiomecanicas || 'Ninguna'}
- Hábitos: Fuma=${currentWorker.fuma || 'No'}, Alcohol=${currentWorker.alcohol || 'No'}, Terapia Psicológica=${currentWorker.terapiaPsicologica || 'No'}
- Alertas Clínico-Operativas del Sistema: ${(fit?.auditItems || []).map(a => `${a.title}: ${a.description}`).join('; ') || 'Sin alertas críticas'}

DEMANDAS Y EXIGENCIAS DEL PUESTO (${cargoName}):
- Exigencia Física: ${profile?.exigenciaFisica || 'Media'}
- Exigencia Mental / Psicoemocional: ${profile?.exigenciaMental || 'Media'}
- Opera Maquinaria o Vehículos: ${profile?.operaMaquinaria || 'No'}
- Nivel de Cargo: ${profile?.nivelCargo || 'Operativo'}
- Score Biocéntrico Calculado: ${calculatedScore}% FIT`;

    const promptText = `Eres un Médico Especialista en Seguridad y Salud en el Trabajo (SG-SST) y Ergonomía Ocupacional en Colombia.
Tu labor es emitir el DICTAMEN PREDICTIVO DE APTITUD LABORAL Y ANÁLISIS DE VULNERABILIDAD para el siguiente colaborador:

${companyContextStr}

${workerContext}

═══════════════════════════════════════════════════════════════
      REGLAS OBLIGATORIAS Y RESTRICCIONES CRÍTICAS
═══════════════════════════════════════════════════════════════
1. REGLA ESTRICTA DE MARCA: ESTÁ ROTUNDAMENTE PROHIBIDO escribir o mencionar las palabras "Atenea", "Modelo Atenea" o "Colmena" en cualquier parte del informe. Cualquier mención a dichas palabras anula la validez del documento.
2. NO incluyas un título H1 principal al inicio, ni tablas de datos de la empresa al inicio (el sistema ya genera e inyecta el encabezado oficial corporativo).
3. NO incluyas bloques de firma al final (el sistema genera automáticamente el bloque digital interactivo con pads para firma).
4. El informe debe ser en código HTML limpio y semántico (div, h2, h3, p, table, tr, th, td, ul, li, strong, span), con estilos CSS inline legibles y modernos. NO uses bloques markdown \`\`\`html.
5. Usa colores armónicos acordes a la identidad SG-SST: Teal principal (#0f766e, #0d9488), bordes grises suaves (#cbd5e1), texto oscuro (#1e293b).

═══════════════════════════════════════════════════════════════
      ESTRUCTURA OBLIGATORIA DEL DICTAMEN (HTML)
═══════════════════════════════════════════════════════════════

<div style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 24px;">

<!-- SECCIÓN 1: RESUMEN EJECUTIVO Y CALIFICACIÓN DE APTITUD -->
Diseña una tarjeta destacada con fondo #f0fdfa con borde 1px solid #99f6e4, padding 18px, border-radius 12px que presente:
- Nombre del Colaborador, Cargo y Cédula.
- Badge destacado del Score Biocéntrico: ${calculatedScore}% FIT.
- Categoría de Aptitud Legal (Apto Pleno / Apto con Observaciones y Controles Preventivos / Requiere Reubicación o Tratamiento Prioritario).
- Juicio Clínico-Laboral Sintético: Balance entre la capacidad biológica del colaborador y las exigencias del cargo.

<!-- SECCIÓN 2: MATRIZ DE COMPATIBILIDAD OPERATIVA (FACTORES OPERATIVOS Y CAUSALES vs. CAPACIDAD BIOINDIVIDUAL) -->
Crea una tabla estilizada (<table style="width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; margin: 16px 0;">):
- Encabezado: fondo #0f766e, texto blanco, negrita, tamaño 11px, padding 10px.
- Columnas:
  1. Dimensión Operativa del Puesto
  2. Exigencia del Cargo
  3. Condición Bioindividual del Trabajador
  4. Nivel de Compatibilidad (con badges: <span style="background:#dcfce7; color:#15803d; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11px;">COMPATIBLE</span>, <span style="background:#fef9c3; color:#854d0e; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11px;">CONTROL PREVENTIVO</span>, o <span style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11px;">ALERTA CRÍTICA</span>).
- Filas a evaluar (Dimensiones Operativas del Puesto):
  1. Personas (Idoneidad técnica, competencia, resistencia a fatiga)
  2. Procedimientos y Métodos (Pausas, estandarización de tareas, ATS)
  3. Máquinas y Equipos (Interacción mecánica, vibraciones, controles)
  4. Herramientas de Trabajo (Ergonomía de agarre, peso, ofimática)
  5. Elementos de Protección Personal (Compatibilidad EPP y tolerancia)
  6. Gestión Organizacional / Gerencia (Carga mental, turnos, supervisión)
  7. Entorno Ambiental (Ruido, iluminación, estrés térmico, superficies)
  8. Materiales e Insumos (Manipulación manual de cargas, químicos)

<!-- SECCIÓN 3: ANÁLISIS DE VULNERABILIDAD BIOCÉNTRICA Y CAUSALIDAD OPERATIVA -->
- Dimensión Biomecánica / Osteomuscular (posturas, esfuerzos, columna).
- Dimensión Cardiovascular y Fisiológica (tensión, IMC, resistencia aeróbica).
- Dimensión Psicoemocional y Cognitiva (atención, estrés, responsabilidades).
- Análisis Causal Diferenciado:
  * Causa Suficiente: Cuál es el factor operativo primario en la fuente que debe ser intervenido por ingeniería para blindar la salud del trabajador.
  * Causas Coadyuvantes: Factores agravantes en el entorno o hábitos del colaborador.

<!-- SECCIÓN 4: PLAN DE INTERVENCIÓN JERARQUIZADO (Eliminación, Sustitución, Ingeniería, Administrativo, EPP) -->
Recomendaciones concretas y directas para el puesto de trabajo y la empresa.

<!-- SECCIÓN 5: PLAN DE ACCIÓN (PAC 5W2H) Y VIGILANCIA EPIDEMIOLÓGICA A 1 AÑO -->
Tabla con periodicidad de valoraciones médicas, exámenes paraclínicos (audiometría, visiometría, espirometría si aplican), pausas activas y metas de seguimiento.

</div>`;

    const finalModelName = modelName || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
    const genAI = new GoogleGenerativeAI(resolvedApiKey);
    const model = genAI.getGenerativeModel({ model: finalModelName });

    const result = await generateWithKeyRotation(model, req.user?.id || req.user, promptText);
    const responseText = result.response.text();
    const cleanedReport = cleanHtmlOutput(responseText);

    // 6. Ensamblar Encabezado Oficial + Cuerpo IA + Bloque Oficial de Firmas Digitales Interactivas (Imagen 4)
    const signatureHTML = buildSignatureSection(loadedCompanyInfo, currentWorker);
    const fullReport = `${headerHTML}\n<div style="margin-top: 20px; font-family: sans-serif;">\n${cleanedReport}\n</div>\n${signatureHTML}`;

    // 7. Auto-guardar en MongoDB
    try {
      if (doc && workerIndex !== -1) {
        doc.trabajadores[workerIndex].dictamenPredictivoH1 = fullReport;
        doc.markModified('trabajadores');
        await doc.save();
      } else {
        await PerfilSociodemograficoData.updateOne(
          { 
            user: targetUserId, 
            ...(companyId ? { companyId } : {}),
            $or: [
              { 'trabajadores.id': workerId },
              { 'trabajadores._id': workerId }
            ]
          },
          { $set: { 'trabajadores.$.dictamenPredictivoH1': fullReport, updatedAt: new Date() } }
        );
      }
    } catch (saveErr) {
      logger.warn('[OraculoH1] Warning auto-saving dictamen to DB:', saveErr.message);
    }

    return res.json({ dictamen: fullReport });
  } catch (error) {
    logger.error('[OraculoH1] Generate dictamen error:', error);
    return res.status(500).json({ error: error.message || 'Error generando dictamen predictivo' });
  }
});

// ─── POST /worker/:workerId/dictamen — Guardado ultra-rápido del Dictamen Predictivo H1 ──
router.post('/worker/:workerId/dictamen', express.json({ limit: '10mb' }), requireJwtAuth, async (req, res) => {
  try {
    const { workerId } = req.params;
    const { dictamen } = req.body;
    if (dictamen === undefined) {
      return res.status(400).json({ error: 'Dictamen requerido' });
    }

    const isSub = !!req.user.isSubUser;
    const targetUserId = (isSub && req.user.parentUser) ? req.user.parentUser : req.user.id;
    const companyId = await getActiveCompanyId(targetUserId, isSub ? req.user.assignedCompany : null);

    // 1. Intentar actualización posicional directa
    let result = await PerfilSociodemograficoData.updateOne(
      { 
        user: targetUserId, 
        ...(companyId ? { companyId } : {}),
        $or: [
          { 'trabajadores.id': workerId },
          { 'trabajadores.id': isNaN(Number(workerId)) ? workerId : Number(workerId) },
          { 'trabajadores._id': workerId }
        ]
      },
      { $set: { 'trabajadores.$.dictamenPredictivoH1': dictamen, updatedAt: new Date() } }
    );

    // 2. Fallback de seguridad si no encontró coincidencia directa
    if (!result || result.matchedCount === 0) {
      const doc = await PerfilSociodemograficoData.findOne({
        user: targetUserId,
        ...(companyId ? { companyId } : {})
      });
      if (doc && doc.trabajadores) {
        const idx = doc.trabajadores.findIndex(w => String(w.id) === String(workerId) || String(w._id) === String(workerId));
        if (idx !== -1) {
          doc.trabajadores[idx].dictamenPredictivoH1 = dictamen;
          doc.markModified('trabajadores');
          await doc.save();
          result = { matchedCount: 1, modifiedCount: 1 };
        }
      }
    }

    logger.info(`[OraculoH1] Dictamen predictivo guardado exitosamente para trabajador ${workerId}`);
    return res.json({ success: true, matchedCount: result?.matchedCount || 0, modifiedCount: result?.modifiedCount || 0 });
  } catch (error) {
    logger.error('[OraculoH1] Error guardando dictamen:', error);
    return res.status(500).json({ error: error.message || 'Error guardando dictamen' });
  }
});

// ─── POST /save — Save worker data + run IA tagging synchronously ──────────
router.post('/save', express.json({ limit: '100mb' }), requireJwtAuth, async (req, res) => {
  try {
    const { trabajadores } = req.body;
    if (!trabajadores) {
      return res.status(400).json({ error: 'Datos requeridos' });
    }

    const isSub = !!req.user.isSubUser;
    const targetUserId = (isSub && req.user.parentUser) ? req.user.parentUser : req.user.id;
    const companyId = await getActiveCompanyId(targetUserId, isSub ? req.user.assignedCompany : null);

    let workersToSave = trabajadores;

    // Sub-user permission checks
    if (isSub) {
      const perms = req.user.subUserPermissions || [];
      const hasAll = perms.includes('sgsst:perfil_sociodemografico_all');
      const hasSelf = perms.includes('sgsst:perfil_sociodemografico_self');

      if (!hasAll && !hasSelf) {
        return res.status(403).json({ error: 'No tienes permiso para modificar el perfil sociodemográfico' });
      }

      // If only self-edit is granted, merge into the full company list
      if (!hasAll && hasSelf && req.user.workerDocument) {
        const existingDoc = await PerfilSociodemograficoData.findOne({ user: targetUserId, companyId }).lean();
        const currentList = existingDoc?.trabajadores || [];
        const myDoc = String(req.user.workerDocument).trim();
        const incomingMyWorker = trabajadores.find(w => String(w.identificacion).trim() === myDoc) || trabajadores[0];

        if (incomingMyWorker) {
          const index = currentList.findIndex(w => String(w.identificacion).trim() === myDoc);
          if (index >= 0) {
            currentList[index] = { ...currentList[index], ...incomingMyWorker, identificacion: myDoc };
          } else {
            currentList.push(incomingMyWorker);
          }
          workersToSave = currentList;
        } else {
          workersToSave = currentList;
        }
      }
    }

    // First save the raw data with recalculated bio-fit values
    const updatedWithBio = await recalculateAndSyncAllWorkers(targetUserId, companyId, workersToSave);

    await PerfilSociodemograficoData.findOneAndUpdate(
      { user: targetUserId, companyId: companyId },
      { $set: { trabajadores: updatedWithBio, companyId, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    // Sync basic health data to master SgsstWorker profile
    const SgsstWorker = require('../../../models/SgsstWorker');
    for (const w of updatedWithBio) {
      if (!w.identificacion) continue;
      const cleanDoc = String(w.identificacion).trim();
      if (!cleanDoc) continue;
      await SgsstWorker.updateOne(
        { user: targetUserId, companyId, documento: cleanDoc },
        {
          $set: {
            condicionesSalud: [w.enfermedades, w.diagnosticoMedico, w.limitacionesBiomecanicas].filter(Boolean).join('; ') || '',
            fechaNacimiento: w.fechaNacimiento || null,
            genero: w.genero || 'No especificado'
          }
        }
      );
    }

    // ── IA Semantic Tagging (synchronous — awaited so frontend gets results) ──
    // Only runs for workers whose complex text fields have changed
    let updatedWorkers = [...updatedWithBio];
    try {
      const apiKey = await getApiKey(targetUserId);
      if (apiKey) {
        const PerfilesCargo = mongoose.models.PerfilesCargoData;
        const cargoDoc = PerfilesCargo ? await PerfilesCargo.findOne({ user: targetUserId }).lean() : null;
        const perfilesList = cargoDoc?.perfilesList || [];

        // Re-fetch the saved doc to get current IA version hashes
        const savedDoc = await PerfilSociodemograficoData.findOne({ user: targetUserId, companyId }).lean();
        const savedWorkers = savedDoc?.trabajadores || [];

        const evalPromises = updatedWithBio.map(async (w) => {
          if (!w.id) return w;
          const currentHash = buildClinicalHash(w);
          const savedWorker = savedWorkers.find(sw => sw.id === w.id);
          const savedHash = savedWorker?.bioScoreIAVersion || '';
          // Only call IA if text fields changed
          if (currentHash !== savedHash) {
            const result = await runIASemanticTagging(w, targetUserId).catch(() => null);
            if (result) {
              const updated = {
                ...w,
                bioTagsIA: result.tags || [],
                bioScoreIAReason: result.razon || '',
                bioScoreIAAptitud: result.aptitud || '',
                bioScoreIAVersion: currentHash,
                bioScoreIADate: new Date()
              };
              logger.info(`[OraculoH1] IA tags generados para ${w.nombre}: [${(result.tags || []).join(', ')}]`);
              return updated;
            }
          }
          return { ...w, ...(savedWorker ? { bioTagsIA: savedWorker.bioTagsIA, bioScoreIAReason: savedWorker.bioScoreIAReason, bioScoreIAAptitud: savedWorker.bioScoreIAAptitud, bioScoreIAVersion: savedWorker.bioScoreIAVersion, bioScoreIADate: savedWorker.bioScoreIADate } : {}) };
        });

        updatedWorkers = await Promise.all(evalPromises);

        // Recalculate bio score again to reflect any newly generated IA tags
        updatedWorkers = await recalculateAndSyncAllWorkers(targetUserId, companyId, updatedWorkers);

        // Persist the IA tags and updated scores back to DB
        await PerfilSociodemograficoData.findOneAndUpdate(
          { user: targetUserId, companyId },
          { $set: { trabajadores: updatedWorkers, updatedAt: new Date() } },
          { new: true }
        );
      }
    } catch (iaErr) {
      logger.warn('[OraculoH1] IA tagging error (continuing without IA):', iaErr.message);
    }

    let responseWorkers = updatedWorkers;
    if (isSub && !req.user.subUserPermissions?.includes('sgsst:perfil_sociodemografico_all') && req.user.workerDocument) {
      const myDoc = String(req.user.workerDocument).trim();
      responseWorkers = updatedWorkers.filter(w => String(w.identificacion).trim() === myDoc);
    }

    // Return the updated workers (with IA tags and biocentric scores) so frontend can refresh immediately
    res.json({ success: true, trabajadores: responseWorkers });
  } catch (error) {
    logger.error('[SGSST PerfilSociodemografico] Save error:', error);
    res.status(500).json({ error: 'Error al guardar datos' });
  }
});

// ─── POST /evaluate-ia/:workerId — Force IA re-evaluation ───────────────
router.post('/evaluate-ia/:workerId', requireJwtAuth, async (req, res) => {
  try {
    const { workerId } = req.params;
    const apiKey = await getApiKey(req.user.id);
    if (!apiKey) return res.status(400).json({ error: 'No API Key configurada' });

    const companyId = await getActiveCompanyId(req.user.id);
    const PerfilesCargo = mongoose.models.PerfilCargoData || mongoose.model('PerfilCargoData');
    const cargoDoc = PerfilesCargo ? await PerfilesCargo.findOne({ user: req.user.id, ...(companyId ? { companyId } : {}) }).lean() : null;
    const perfilesList = cargoDoc?.perfilesList || [];

    // Run async but wait for it in this case (manual trigger)
    await triggerIAEvaluation(req.user.id, workerId, apiKey, perfilesList);
    res.json({ success: true, message: 'Evaluación IA completada' });
  } catch (error) {
    logger.error('[OraculoH1] evaluate-ia error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /inbox/approve ─────────────────────────────────────────────
router.post('/inbox/approve', requireJwtAuth, async (req, res) => {
  try {
    const { updateId, workerId, changes, inboxType } = req.body;
    if (!updateId || !workerId || !changes || !inboxType) return res.status(400).json({ error: 'Faltan parámetros' });

    const companyId = await getActiveCompanyId(req.user.id);
    const doc = await PerfilSociodemograficoData.findOne({ user: req.user.id, companyId: companyId });
    if (!doc) return res.status(404).json({ error: 'No se encontró la empresa' });

    // Encontrar y actualizar el trabajador
    const workerIndex = doc.trabajadores.findIndex(w =>
      String(w.id || w._id || w.identificacion) === String(workerId) ||
      (w.identificacion && String(w.identificacion).trim() === String(workerId).trim())
    );
    if (workerIndex !== -1) {
      // Merge changes into the existing worker object
      const currentWorker = doc.trabajadores[workerIndex]._doc || doc.trabajadores[workerIndex];
      doc.trabajadores[workerIndex] = { ...currentWorker, ...changes };
    }

    // Remover la petición de la bandeja correspondiente
    if (inboxType === 'social') {
      doc.actualizacionesPendientes = (doc.actualizacionesPendientes || []).filter(u => u.id !== updateId);
    } else if (inboxType === 'health') {
      doc.actualizacionesPendientesSalud = (doc.actualizacionesPendientesSalud || []).filter(u => u.id !== updateId);
    }

    // Recalculate and sync with SgsstWorker on inbox approval
    doc.trabajadores = await recalculateAndSyncAllWorkers(req.user.id, companyId, doc.trabajadores);

    await doc.save();
    res.json({ success: true, actualizacionesPendientes: doc.actualizacionesPendientes, actualizacionesPendientesSalud: doc.actualizacionesPendientesSalud });
  } catch (error) {
    logger.error('Inbox approve error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── POST /inbox/dismiss ─────────────────────────────────────────────
router.post('/inbox/dismiss', requireJwtAuth, async (req, res) => {
  try {
    const { updateId, inboxType } = req.body;
    if (!updateId || !inboxType) return res.status(400).json({ error: 'Faltan parámetros' });

    const companyId = await getActiveCompanyId(req.user.id);
    const doc = await PerfilSociodemograficoData.findOne({ user: req.user.id, companyId: companyId });
    if (!doc) return res.status(404).json({ error: 'No se encontró la empresa' });

    if (inboxType === 'social') {
      doc.actualizacionesPendientes = (doc.actualizacionesPendientes || []).filter(u => u.id !== updateId);
    } else if (inboxType === 'health') {
      doc.actualizacionesPendientesSalud = (doc.actualizacionesPendientesSalud || []).filter(u => u.id !== updateId);
    }
    
    await doc.save();
    res.json({ success: true, actualizacionesPendientes: doc.actualizacionesPendientes, actualizacionesPendientesSalud: doc.actualizacionesPendientesSalud });
  } catch (error) {
    logger.error('Inbox dismiss error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── POST /generate-full — Generate 5 workers with dummy data ────────
router.post('/generate-full', requireJwtAuth, async (req, res) => {
  try {
    const { modelName } = req.body;
    const apiKey = await getApiKey(req.user.id);
    if (!apiKey) return res.status(400).json({ error: 'No API Key' });

    let companyContext = '';
    let ci = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean();
    if (!ci) ci = await CompanyInfo.findOne({ user: req.user.id }).lean();
    if (ci) {
      companyContext = `Empresa: ${ci.companyName || 'Empresa'}\\nActividad: ${ci.economicActivity || 'General'}`;
    }

    const personalization = req.user?.personalization?.geminiModels;
    const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
    const finalModelName = modelName || preferredModel;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: finalModelName });

    const systemPrompt = `Eres un experto en Recursos Humanos y SST en Colombia.
Tu tarea es generar la estructura inicial de un Perfil Sociodemográfico para la siguiente empresa:
${companyContext}

Genera un arreglo JSON de exactamente 5 a 10 trabajadores colombianos ficticios distribuidos en distintos cargos (operativos y administrativos).
Campos para cada trabajador (asegúrate de incluir datos coherentes y de usar direcciones tipo 'Calle 45 # 12-34, Bogotá', o 'Carrera 15 #20-10, Medellín'):
  "nombre": Nombre completo ficticio,
  "identificacion": Cédula ficticia de 8-10 dígitos,
  "edad": Número entre 18 y 60,
  "genero": "Masculino", "Femenino", o "Otro",
  "estadoCivil": "Soltero/a", "Casado/a", "Unión Libre", "Divorciado/a", "Viudo/a",
  "nivelEscolaridad": "Primaria", "Bachiller", "Técnico", "Tecnólogo", "Universitario", "Posgrado",
  "direccion": Dirección de domicilio tipo Colombia,
  "telefono": Teléfono ficticio (ej. 3001234567),
  "cargo": Cargo ficticio dentro de la empresa,
  "fechaExamenMedico": Fecha en formato "YYYY-MM-DD" de su último examen médico ocupacional,
  "fechaCursoAlturasAutorizado": Fecha en formato "YYYY-MM-DD" o nulo/vacío si no aplica para el cargo,
  "fechaCursoAlturasCoordinador": Fecha en formato "YYYY-MM-DD" o nulo/vacío si no aplica para el cargo

Esquema JSON Requerido (DEBES responder solo json, sin markdown):
{
  "trabajadores": [
    { ... }
  ]
}`;

    const result = await generateWithKeyRotation(model, req.user?.id || req.user, systemPrompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\\n?/g, '').replace(/```\\n?/g, '').trim();

    const parsed = JSON.parse(text);

    const finalWorkers = (parsed.trabajadores || []).map(w => ({
      ...w,
      id: w.id || require('crypto').randomUUID(),
      completedByAI: true
    }));

    res.json({ trabajadores: finalWorkers });
  } catch (error) {
    logger.error('[SGSST PerfilSociodemografico] Generate-full error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /analyze — Generate AI Exec Report for Sociodemographic ─────────────────────────────
router.post('/analyze', requireJwtAuth, async (req, res) => {
  try {
    const { trabajadores, currentDate, userName, modelName = (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim() } = req.body;

    if (!trabajadores || !Array.isArray(trabajadores) || trabajadores.length === 0) {
      return res.status(400).json({ error: 'No hay trabajadores para analizar.' });
    }

    const resolvedApiKey = await getApiKey(req.user.id);
    if (!resolvedApiKey) {
      return res.status(400).json({ error: 'No se ha configurado la clave API de Google.' });
    }

    let loadedCompanyInfo = null;
    try {
      loadedCompanyInfo = await CompanyInfo.findOne({ user: req.user.id, isActive: true }).lean()
        || await CompanyInfo.findOne({ user: req.user.id }).lean();
    } catch (ciErr) {
      logger.warn('[SGSST PerfilSociodemografico] Error loading company info:', ciErr.message);
    }

    const genAI = new GoogleGenerativeAI(resolvedApiKey);

    const empresa = loadedCompanyInfo?.companyName || 'EMPRESA';
    const nit = loadedCompanyInfo?.nit || 'NIT';
    const representante = loadedCompanyInfo?.legalRepresentative || userName || 'No registrado';
    const fechaEmision = currentDate || new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

    const headerHTML = buildStandardHeader({
      title: 'INFORME EJECUTIVO DEL PERFIL SOCIODEMOGRÁFICO',
      companyInfo: loadedCompanyInfo,
      date: fechaEmision,
      norm: 'Gestión de Sistema de Seguridad y Salud en el Trabajo',
      responsibleName: representante
    });

    // Pre-process summary for prompt
    let numMen = 0;
    let numWomen = 0;
    let edadPromedio = 0;
    let totalEdades = 0;
    let escolaridades = {};

    let currentDateTrunc = new Date();

    // Calculate some basic warning/expirations
    let vencimientosMedico = [];
    let resumenPatologias = {};

    trabajadores.forEach(w => {
      if (w.genero === 'Masculino') numMen++;
      else if (w.genero === 'Femenino') numWomen++;

      if (w.edad) totalEdades += Number(w.edad);
      if (w.nivelEscolaridad) {
        if (!escolaridades[w.nivelEscolaridad]) escolaridades[w.nivelEscolaridad] = 0;
        escolaridades[w.nivelEscolaridad]++;
      }

      if (w.diagnosticoMedico && w.diagnosticoMedico !== 'Apto / Sin Hallazgos') {
        const cat = w.diagnosticoMedico.split(' - ')[0] || 'Otros';
        resumenPatologias[cat] = (resumenPatologias[cat] || 0) + 1;
      }

      // Exámenes Médicos - Alert if > 1 year
      if (w.fechaExamenMedico) {
        try {
          const diffTime = Math.abs(currentDateTrunc - new Date(w.fechaExamenMedico));
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays >= 300) { // close to 1 year
            vencimientosMedico.push(`${w.nombre} (${w.cargo}) - Último: ${w.fechaExamenMedico}`);
          }
        } catch (e) { }
      } else {
        vencimientosMedico.push(`${w.nombre} (${w.cargo}) - Sin examen reportado`);
      }
    });

    if (trabajadores.length > 0) {
      edadPromedio = Math.round(totalEdades / trabajadores.length);
    }

    const promptText = `Eres un Experto en SST Especializado en perfiles sociodemográficos.
Se ha evaluado la base de datos de los trabajadores de la empresa.

** Resumen de Hallazgos Sociodemográficos:**
                        - Total trabajadores: ${trabajadores.length}
                        - Hombres: ${numMen}, Mujeres: ${numWomen}
                        - Edad Promedio: ${edadPromedio} años
                        - Escolaridad principal: ${JSON.stringify(escolaridades)}
                        - Resumen de Hallazgos Médicos por categoría: ${JSON.stringify(resumenPatologias)}
                        - Trabajadores con alerta sobre examen médico periódico: ${vencimientosMedico.length}

                        ** Atención Especial Requerida(Examenes médicos prontos a vencer / Vencidos o no reportados):**
                        ${vencimientosMedico.slice(0, 10).map(v => '- ' + v).join('\n')}

                        ** Tu tarea:**
                        Escribe un INFORME EJECUTIVO profesional(en formato HTML) que analice este perfil sociodemográfico de la empresa y dé recomendaciones al área de Talento Humano y SST.
ESTRUSTRA EXACTA REQUERIDA(en div y HTML limpio sin markdown):
                             1. Un resumen analítico del capital humano, enfocándose en la distribución de género, edad y escolaridad. (Ej.Qué implica tener una población madura vs joven, o riesgos relativos al estado de la escolaridad).
                             2. Análisis de las Condiciones de Salud: Interpreta el "Resumen de Hallazgos Médicos por categoría" y explica los riesgos para la productividad y el bienestar. No menciones nombres propios aquí, habla de tendencias.
                             3. Plan de Acción SST: Basado en los hallazgos médicos y exámenes vencidos, propón actividades de P&P (Promoción y Prevención).
                             4. Asegúrese de referenciar obligaciones en SST sobre Cursos de Alturas si se requiere.
                             5. Recomendaciones finales orientadas al bienestar social y físico.

Usa un tono corporativo.Retorna SOLAMENTE CÓDIGO HTML VÁLIDO SIN etiquetas markdown de bloque HTML.No incluyas un título principal(<code>h1</code>) porque ya está en el encabezado.

** ESTILOS OBLIGATORIOS(CSS INLINE) - PRECAUCIÓN MODO OSCURO:**
- ** Regla Crítica:** NO uses clases de Tailwind, usa exclusivamente CSS inline.
- Los contenedores principales(divs, cajas, tarjetas) deben tener style = "width: 100%; box-sizing: border-box;" para no quedar angostos.
- Cada vez que apliques un background - color a un elemento(tr, td, div), ** DEBES OBLIGATORIAMENTE ** especificar color: #000; o color: #fff;.
                        - Títulos(h2, h3): Color azul oscuro(#0f766e) con color: #0f766e; explícito.
- Tablas generadas por la IA DEBEN estar envueltas dentro de un < div style = "overflow-x: auto; width: 100%; margin-bottom: 20px;" >.La tabla debe tener los estilos: width: 100 %; min - width: 700px; border - collapse: separate; border - spacing: 0; border - radius: 12px; border: 1px solid #ddd;, th con background - color="#0f766e" y color = "white".
- Celdas(td): padding = "10px", border - bottom="1px solid #ddd"(sin background - color predeterminado para que hereden el modo oscuro).`;

    const personalization = req.user?.personalization?.geminiModels;
    const preferredModel = personalization?.sstManagement || (process.env.GOOGLE_MODELS || 'gemini-3.5-flash').split(',')[0].trim();
    const finalModelName = modelName || preferredModel;
    const model = genAI.getGenerativeModel({ model: finalModelName });
    const result = await generateWithKeyRotation(model, req.user?.id || req.user, promptText);
    let aiHtml = result.response.text().trim();
    aiHtml = aiHtml.replace(/```html\n?/gi, '').replace(/```\n?/gi, '').trim();

    const bodyMatch = aiHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        aiHtml = bodyMatch[1].trim();
    }
    aiHtml = aiHtml
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
        .replace(/<head>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .trim();

    let fullReport = `${headerHTML}
                        <div class="mt-8 space-y-6">
                            ${aiHtml}
                        </div>`;

    if (loadedCompanyInfo) {
      fullReport += buildSignatureSection(loadedCompanyInfo);
    }

    res.json({ report: fullReport });
  } catch (error) {
    logger.error('[SGSST PerfilSociodemografico] Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ─── Bio-Fit Engine Backend ──────────────────────────────────────────────────
function findMatchingCargo(workerCargo, perfilesList) {
  if (!workerCargo) return null;
  const clean = String(workerCargo).trim().toLowerCase();
  // 1. Direct match
  let match = (perfilesList || []).find(c => String(c.nombreCargo || '').trim().toLowerCase() === clean);
  if (match) return match;
  // 2. Partial match
  match = (perfilesList || []).find(c => {
    const cargoClean = String(c.nombreCargo || '').trim().toLowerCase();
    return cargoClean && (clean.includes(cargoClean) || cargoClean.includes(clean));
  });
  if (match) return match;
  // 3. Fallback standard profile
  return {
    nombreCargo: workerCargo,
    exigenciaFisica: 'Media',
    exigenciaMental: 'Media',
    operaMaquinaria: 'No',
    entrenamientosSeleccionados: []
  };
}

// ─── Bio-Fit Engine Backend (Calibración Biocéntrica Integral H1) ─────────────
function calculateBiocentricFitBackend(w, perfilesList) {
  let score = 100;
  let alerts = [];
  let isLethal = false;
  const auditItems = [];

  const addAudit = (cat, title, desc, pts, sev) => {
    score -= pts;
    alerts.push(title);
    auditItems.push({ category: cat, title, description: desc, pointsDeducted: pts, severity: sev });
  };

  const cargo = findMatchingCargo(w.cargo, perfilesList);
  if (!cargo) {
    return { score: 100, alerts: ['Línea Base General'], auditItems: [], isLethal: false };
  }

  // 1. BIOMETRÍA Y SIGNOS VITALES (Graduación Clínica OMS / AHA)
  if (w.imc) {
    const imc = parseFloat(w.imc);
    if (!isNaN(imc)) {
      if (imc >= 35) {
        addAudit('Clínico', 'Obesidad Severa (Grado II/III)', `IMC ${imc} — Alto riesgo cardiovascular, metabólico y sobrecarga articular.`, 10, 'critical');
      } else if (imc >= 30) {
        addAudit('Clínico', 'Obesidad (Grado I)', `IMC ${imc} — Requiere monitoreo nutricional y acondicionamiento físico.`, 6, 'warning');
      } else if (imc >= 25) {
        addAudit('Clínico', 'Sobrepeso Leve', `IMC ${imc} — Monitoreo preventivo en programa de estilo de vida saludable.`, 3, 'info');
      } else if (imc < 18.5) {
        addAudit('Clínico', 'Bajo Peso', `IMC ${imc} — Sugiere déficit nutricional o fatiga temprana ante esfuerzo.`, 4, 'info');
      }
    }
  }

  if (w.presionArterial) {
    const [sisStr, diaStr] = w.presionArterial.split('/');
    const sis = parseInt(sisStr || '0', 10);
    const dia = parseInt(diaStr || '0', 10);
    if (!isNaN(sis) && !isNaN(dia)) {
      if (sis >= 160 || dia >= 100) {
        addAudit('Clínico', 'Hipertensión Severa (Estadio 2)', `Presión Arterial ${w.presionArterial} mmHg. Alto riesgo vascular en esfuerzos intensos.`, 15, 'critical');
      } else if (sis >= 140 || dia >= 90) {
        addAudit('Clínico', 'Hipertensión (Estadio 1)', `Presión Arterial ${w.presionArterial} mmHg. Requiere control médico ocupacional.`, 8, 'warning');
      } else if (sis >= 130 || dia >= 85) {
        addAudit('Clínico', 'Tensión Arterial Elevada', `Presión Arterial ${w.presionArterial} mmHg. Monitoreo preventivo de estrés y sal.`, 4, 'info');
      }
    }
  }

  if (w.frecuenciaCardiaca) {
    const fc = parseInt(w.frecuenciaCardiaca, 10);
    if (!isNaN(fc)) {
      if (fc > 100) {
        addAudit('Clínico', 'Taquicardia en Reposo', `FC ${fc} lpm — Posible sobrecarga cardiovascular, estrés o deshidratación.`, 8, 'warning');
      } else if (fc < 50) {
        const isAthlete = w.deporte && (w.deporte.toLowerCase().includes('sí') || w.deporte.toLowerCase().includes('frecuente') || w.deporte.toLowerCase().includes('diario'));
        if (!isAthlete) {
          addAudit('Clínico', 'Bradicardia en Reposo', `FC ${fc} lpm — Sugiere valoración médica si se acompaña de mareos.`, 4, 'info');
        } else {
          addAudit('Preventivo', 'Bradicardia Sinusal Fisiológica', `FC ${fc} lpm — Respuesta cardíaca eficiente adaptada al acondicionamiento físico.`, 0, 'info');
        }
      }
    }
  }

  // 2. HÁBITOS Y ESTILO DE VIDA
  if (w.fuma === 'Sí, diario') {
    addAudit('Clínico', 'Tabaquismo Activo Diario', 'Reduce la capacidad de difusión pulmonar y la resistencia aeróbica.', 6, 'warning');
  }
  if (w.alcohol === 'Sí (Frecuente)') {
    if (cargo.operaMaquinaria === 'Sí') {
      addAudit('Psicosocial', '🛑 Consumo Frecuente de Alcohol + Maquinaria', 'Alto riesgo de accidentabilidad grave en labores mecanizadas.', 25, 'critical');
    } else {
      addAudit('Psicosocial', 'Consumo Frecuente de Alcohol', 'Vigilancia preventiva y programa de prevención de adicciones.', 10, 'warning');
    }
  }

  // 3. MAPEO CLÍNICO SEMÁNTICO (9 DOMINIOS BIOINDIVIDUALES)
  const TAG_RULES_CS = {
    Lumbalgia:            { pts: 10, sev: 'warning',  cat: 'Osteomuscular',      label: 'Lumbalgia Mecánica',          desc: 'Restricción lumbar. Requiere control de levantamiento de cargas y pausas.' },
    Hernia_Discal:        { pts: 15, sev: 'critical', cat: 'Osteomuscular',      label: 'Hernia Discal / Discopatía',  desc: 'Condición discal que puede agravarse con esfuerzos mecánicos intensos.' },
    Cervicalgia:          { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',      label: 'Cervicalgia Ocupacional',     desc: 'Restricción cervical. Requiere evitar posturas estáticas de cuello.' },
    Epicondilitis:        { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',      label: 'Epicondilitis / Tendinitis',  desc: 'Inflamación articular. Limita movimientos repetitivos de flexo-extensión.' },
    Tunel_Carpiano:       { pts: 8,  sev: 'warning',  cat: 'Osteomuscular',      label: 'Síndrome de Túnel Carpiano',  desc: 'Compresión nerviosa en muñeca. Limita digitación y agarre de fuerza prolongado.' },
    Restriccion_Hombro:   { pts: 10, sev: 'warning',  cat: 'Osteomuscular',      label: 'Manguito Rotador / Hombro',   desc: 'Limitación glenohumeral. Evitar trabajos con brazos por encima de los hombros.' },
    Restriccion_Rodilla:  { pts: 10, sev: 'warning',  cat: 'Osteomuscular',      label: 'Restricción Articular Rodilla',desc: 'Limitación en rodillas. Evitar cuclillas, escaleras continuas y cargas.' },
    No_Carga_Peso:        { pts: 8,  sev: 'warning',  cat: 'Restricción Física', label: 'Restricción de Levantamiento',desc: 'Límite estricto de carga de peso según concepto médico ocupacional.' },
    No_Bipedestacion:     { pts: 5,  sev: 'info',     cat: 'Restricción Física', label: 'Restricción Bipedestación',   desc: 'Requiere alternancia postural para evitar sobrecarga vascular y articular.' },
    No_Sedestacion:       { pts: 5,  sev: 'info',     cat: 'Restricción Física', label: 'Restricción Sedestación',     desc: 'Requiere pausas activas y estaciones de trabajo dinámicas.' },
    Hipoacusia:           { pts: 8,  sev: 'warning',  cat: 'Sensorial',          label: 'Hipoacusia Neurosensorial',   desc: 'Disminución auditiva. Protección auditiva de alta atenuación obligatoria.' },
    Vision_Reducida:      { pts: 5,  sev: 'info',     cat: 'Sensorial',          label: 'Defecto de Refracción Visual',desc: 'Requiere lentes de seguridad con prescripción óptica verificada.' },
    HTA:                  { pts: 10, sev: 'warning',  cat: 'Cardiovascular',     label: 'Hipertensión Diagnosticada',  desc: 'Enfermedad cardiovascular bajo tratamiento médico.' },
    Cardiopatia:          { pts: 20, sev: 'critical', cat: 'Cardiovascular',     label: 'Cardiopatía / Arritmia',      desc: 'Condición cardíaca mayor. Incompatible con sobreesfuerzos físicos extremos.' },
    Diabetes:             { pts: 10, sev: 'warning',  cat: 'Metabólico',         label: 'Diabetes Mellitus',           desc: 'Requiere control glucémico, hidratación y prevención de fatiga súbita.' },
    Epilepsia:            { pts: 25, sev: 'critical', cat: 'Neurológico',        label: 'Epilepsia / Síndrome Convulsivo', desc: 'Alto riesgo de pérdida de conciencia. Bloqueo en alturas y maquinaria.' },
    Vertigo:              { pts: 18, sev: 'critical', cat: 'Neurológico',        label: 'Síndrome Vertiginoso / Mareo',desc: 'Riesgo de desequilibrio. Restricción en alturas y plataformas elevadas.' },
    EPOC:                 { pts: 15, sev: 'warning',  cat: 'Respiratorio',       label: 'EPOC / Enfisema Pulmonar',    desc: 'Limitación ventilatoria crónica. Evitar polvos, humos y químicos volátiles.' },
    Asma:                 { pts: 10, sev: 'warning',  cat: 'Respiratorio',       label: 'Asma Ocupacional / Bronquial',desc: 'Hiperreactividad bronquial ante alergenos e irritantes ambientales.' },
    Alergia_Quimica:      { pts: 10, sev: 'warning',  cat: 'Inmunológico',       label: 'Alergia Química / Dermatitis',desc: 'Hipersensibilidad de contacto. EPP de barrera química obligatorio.' },
    Medicamento_SNC:      { pts: 15, sev: 'critical', cat: 'Farmacológico',      label: 'Fármaco Depresor del SNC',    desc: 'Sedantes o ansiolíticos que alteran tiempos de reacción y alerta motora.' },
    Restriccion_Mental:   { pts: 12, sev: 'warning',  cat: 'Psicoemocional',     label: 'Afección Psicoemocional',     desc: 'Condición que compromete tolerancia a la sobrecarga mental o turnos nocturnos.' },
    Patologia_Cronica:    { pts: 8,  sev: 'warning',  cat: 'Clínico',            label: 'Patología Crónica de Base',   desc: 'Enfermedad diagnosticada que requiere vigilancia epidemiológica.' },
    Diagnostico_Reciente: { pts: 4,  sev: 'info',     cat: 'Clínico',            label: 'Diagnóstico Clínico Reciente',desc: 'Seguimiento preventivo y verificación de adherencia al tratamiento.' },
    Recomendacion_Leve:   { pts: 2,  sev: 'info',     cat: 'Preventivo',         label: 'Recomendación Preventiva',    desc: 'Medida ergonómica o de autocuidado emitida por medicina laboral.' },
  };

  const iaTags = w.bioTagsIA || [];
  const hasIATags = iaTags.length > 0 && !iaTags.includes('Sin_Hallazgos');
  const hasAnyText = [
    w.limitacionesBiomecanicas, w.recomendacionesMedicas,
    w.diagnosticoMedico, w.enfermedades, w.alergiasQuimicas, w.medicamentos
  ].some(v => v && String(v).trim().length > 2 && !String(v).toLowerCase().includes('ninguna') && !String(v).toLowerCase().includes('ninguno'));

  if (hasAnyText) {
    if (hasIATags) {
      iaTags.forEach(tag => {
        const rule = TAG_RULES_CS[tag];
        if (!rule) return;
        let pts = rule.pts;
        if ((tag === 'Lumbalgia' || tag === 'Hernia_Discal' || tag === 'Restriccion_Hombro' || tag === 'Restriccion_Rodilla') && cargo.exigenciaFisica === 'Alta') {
          pts = Math.round(pts * 1.5);
        }
        if ((tag === 'Epilepsia' || tag === 'Vertigo' || tag === 'Medicamento_SNC') && cargo.operaMaquinaria === 'Sí') {
          pts = Math.round(pts * 2.0);
          isLethal = true;
        }
        if (tag === 'Restriccion_Mental' && cargo.exigenciaMental === 'Alta') {
          pts = Math.round(pts * 1.5);
        }
        addAudit(rule.cat, rule.label, rule.desc + (pts !== rule.pts ? ' ⚠️ Agravado por exigencias del puesto.' : ''), pts, rule.sev);
      });
    } else {
      const hasEnf = w.enfermedades && w.enfermedades.trim() && !w.enfermedades.toLowerCase().includes('ninguna');
      const hasDiag = w.diagnosticoMedico && w.diagnosticoMedico.trim() && !w.diagnosticoMedico.toLowerCase().includes('ninguno') && !w.diagnosticoMedico.toLowerCase().includes('apto');
      const hasRestr = w.limitacionesBiomecanicas && w.limitacionesBiomecanicas.trim() && !w.limitacionesBiomecanicas.toLowerCase().includes('ninguna');
      const hasRec = w.recomendacionesMedicas && w.recomendacionesMedicas.trim() && !w.recomendacionesMedicas.toLowerCase().includes('ninguna');
      const hasAl = w.alergiasQuimicas && w.alergiasQuimicas.trim() && !w.alergiasQuimicas.toLowerCase().includes('ninguna');
      
      if (hasEnf) addAudit('Clínico', 'Patología Base Declarada', `${w.enfermedades}`, 8, 'warning');
      if (hasDiag && !hasEnf) addAudit('Clínico', 'Diagnóstico Médico Ocupacional', `${w.diagnosticoMedico}`, 5, 'info');
      if (hasRestr) addAudit('Osteomuscular', 'Restricción Biomecánica', `${w.limitacionesBiomecanicas}`, 8, 'warning');
      if (hasRec) addAudit('Preventivo', 'Recomendación Médica Ocupacional', `${w.recomendacionesMedicas}`, 3, 'info');
      if (hasAl) addAudit('Inmunológico', 'Alergia Química Declarada', `${w.alergiasQuimicas}`, 6, 'warning');
    }
  }

  // 4. VULNERABILIDAD SOCIAL Y FAMILIAR (Alertas Éticas — 0 puntos de penalización para evitar discriminación)
  let vulnerabilidadSocial = 0;
  let socialDesc = [];
  if (['1', '2'].includes(String(w.estrato || ''))) {
    vulnerabilidadSocial++;
    socialDesc.push('estrato socioeconómico bajo');
  }
  if (w.personasCargo && Number(w.personasCargo) >= 3) {
    vulnerabilidadSocial++;
    socialDesc.push('alta carga de dependientes');
  }
  if (w.estadoCivil && (w.estadoCivil.toLowerCase().includes('solter') || w.estadoCivil.toLowerCase().includes('viud') || w.estadoCivil.toLowerCase().includes('divorciad'))) {
    if (w.personasCargo && Number(w.personasCargo) > 0) {
      vulnerabilidadSocial++;
      socialDesc.push('monoparentalidad');
    }
  }
  if (w.vivienda && (w.vivienda.toLowerCase().includes('arrendada') || w.vivienda.toLowerCase().includes('invasión'))) {
    vulnerabilidadSocial++;
    socialDesc.push('inestabilidad habitacional');
  }

  if (vulnerabilidadSocial >= 3) {
    addAudit('Vigilancia Epidemiológica', 'Vulnerabilidad Sociodemográfica', `Factores estresores: ${socialDesc.join(', ')}. Sugerido programa de bienestar psicosocial.`, 0, 'info');
  } else if (vulnerabilidadSocial >= 2) {
    addAudit('Vigilancia Epidemiológica', 'Factores Psicosociales Externos', `Factores detectados: ${socialDesc.join(', ')}.`, 0, 'info');
  }
  if (w.nivelEscolaridad && w.nivelEscolaridad.toLowerCase().includes('primaria')) {
    addAudit('Vigilancia Epidemiológica', 'Escolaridad Básica', 'Requiere métodos de inducción visuales y acompañamiento cercano en SST.', 0, 'info');
  }

  // 5. CRUCE CON EXIGENCIAS CRÍTICAS DEL CARGO
  if (cargo.exigenciaFisica === 'Alta') {
    if (w.edad && Number(w.edad) > 55) {
      addAudit('Preventivo', 'Alerta de Carga Fisiológica por Edad', 'Colaborador mayor de 55 años en rol de alta exigencia física. Monitoreo ergonómico preventivo.', 0, 'info');
    }
  }

  if (cargo.exigenciaMental === 'Alta') {
    if (w.terapiaPsicologica === 'Sí') {
      addAudit('Psicoemocional', 'Vigilancia de Sobrecarga y Burnout', 'Rol de alta tensión mental sumado a acompañamiento psicológico activo.', 10, 'warning');
    }
  }

  if (cargo.operaMaquinaria === 'Sí' && !hasIATags) {
    const medLower = (w.medicamentos || '').toLowerCase();
    const hasMedsLethal = medLower.includes('psiquiátrico') || medLower.includes('dormir') || medLower.includes('sedante') || medLower.includes('ansiolítico');
    if (hasMedsLethal) {
      isLethal = true;
      addAudit('Operativo', '🛑 BLOQUEO PREVENTIVO: Sedantes + Maquinaria', 'Uso de fármacos depresores del SNC incompatible con operación de maquinaria.', 35, 'critical');
    }
  }

  // 6. FORMACIÓN Y HABILITACIÓN LEGAL REAL
  if (cargo.entrenamientosSeleccionados && cargo.entrenamientosSeleccionados.length > 0) {
    const list = cargo.entrenamientosSeleccionados;
    // Verificar Alturas
    const requiresAlturas = list.some(c => String(c).toLowerCase().includes('alturas'));
    const hasAlturas = !!(w.fechaCursoAlturasAutorizado || w.fechaCursoAlturasCoordinador);
    if (requiresAlturas && !hasAlturas) {
      addAudit('Entrenamiento', 'Falta Certificación de Alturas', 'El cargo exige trabajo en alturas y no registra curso vigente acreditado.', 10, 'critical');
    }

    // Verificar Cursos Generales SST (50h / 20h)
    const requiresSST = list.some(c => String(c).toLowerCase().includes('50') || String(c).toLowerCase().includes('20') || String(c).toLowerCase().includes('sst'));
    const hasSST = !!(w.curso50h || w.curso20h);
    if (requiresSST && !hasSST) {
      addAudit('Entrenamiento', 'Pendiente Curso 50h/20h SG-SST', 'Curso legal obligatorio de SG-SST pendiente por certificar.', 5, 'warning');
    }
  }

  return { score: Math.max(0, score), alerts: Array.from(new Set(alerts)), auditItems, isLethal };
}

async function recalculateAndSyncAllWorkers(userId, companyId, trabajadoresList) {
  try {
    const PerfilesCargo = mongoose.models.PerfilCargoData;
    const cargoDoc = PerfilesCargo ? await PerfilesCargo.findOne({ user: userId, companyId }).lean() : null;
    const perfilesList = cargoDoc?.perfilesList || [];

    const SgsstWorker = require('../../../models/SgsstWorker');

    const updatedWorkers = trabajadoresList.map(w => {
      const rawWorker = w._doc || w;
      
      const fitResult = calculateBiocentricFitBackend(rawWorker, perfilesList);
      
      return {
        ...rawWorker,
        biocentricScore: fitResult.score,
        biocentricAlerts: fitResult.alerts,
        biocentricIsLethal: fitResult.isLethal
      };
    });

    // Sincronizar en lote a SgsstWorker
    for (const w of updatedWorkers) {
      if (!w.identificacion) continue;
      const cleanDoc = String(w.identificacion).trim();
      if (!cleanDoc) continue;

      const conditionsStr = [w.enfermedades, w.diagnosticoMedico, w.limitacionesBiomecanicas]
        .filter(Boolean)
        .join('; ') || '';

      await SgsstWorker.updateOne(
        { user: userId, companyId, documento: cleanDoc },
        {
          $set: {
            nombre: w.nombre,
            genero: w.genero || 'No especificado',
            fechaNacimiento: w.fechaNacimiento || null,
            condicionesSalud: conditionsStr,
            fitScore: w.biocentricScore,
            fitAlerts: w.biocentricAlerts,
            updatedAt: Date.now()
          }
        }
      );
    }

    return updatedWorkers;
  } catch (err) {
    logger.error('[SGSST BioFit Backend] recalculateAndSyncAllWorkers error:', err);
    return trabajadoresList;
  }
}

router.recalculateAndSyncAllWorkers = recalculateAndSyncAllWorkers;

module.exports = router;
