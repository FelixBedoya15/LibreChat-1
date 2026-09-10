const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('~/config');
const CompanyInfo = require('~/models/CompanyInfo');
const Notification = require('~/models/Notification');

const router = express.Router();

// ─── Helper: Resolver Empresa Activa ─────────────────────────────────────────
async function resolveActiveCompany(companyId) {
  if (!mongoose.Types.ObjectId.isValid(companyId)) return null;

  // 1. Intentar buscar por el _id directo de la empresa (si ya viene resuelto)
  let company = await CompanyInfo.findById(companyId).lean();
  if (company) return company;

  // 2. Si no se encuentra, asumir que es el ID del usuario (propietario) y buscar la empresa activa
  company = await CompanyInfo.findOne({ user: companyId, isActive: true }).lean();

  // 3. Fallback: Si no hay empresa activa explícita, devolver la primera empresa de ese usuario
  if (!company) {
    company = await CompanyInfo.findOne({ user: companyId }).lean();
  }

  return company;
}

// ─── Helper: Resolver Empresa y Perfil Multi-Empresa para un Trabajador ───────
async function resolveCompanyAndWorker(companyId, { cedula, workerId } = {}) {
  let company = await resolveActiveCompany(companyId);
  if (!company) return { company: null, perfil: null, worker: null };

  const PerfilSociodemograficoData = mongoose.models.PerfilSociodemograficoData;
  if (!PerfilSociodemograficoData) return { company, perfil: null, worker: null };

  const formatStr = (s) => String(s || '').trim().toLowerCase();

  // 1. Buscar en la empresa resuelta directamente
  let perfil = await PerfilSociodemograficoData.findOne({
    user: new mongoose.Types.ObjectId(company.user),
    $or: [
      { companyId: company._id },
      { companyId: company._id.toString() },
      { companyId: { $exists: false } },
      { companyId: null },
    ],
  }).lean();

  let worker = null;
  if (perfil && Array.isArray(perfil.trabajadores) && perfil.trabajadores.length > 0) {
    if (workerId && workerId !== 'undefined') {
      worker = perfil.trabajadores.find((t) => String(t.id) === String(workerId));
    }
    if (!worker && cedula) {
      worker = perfil.trabajadores.find(
        (t) => formatStr(t.identificacion) === formatStr(cedula),
      );
    }
  }

  // Si encontramos al trabajador, o no se proporcionó cédula/workerId para filtrar, devolver
  if (worker || (!cedula && (!workerId || workerId === 'undefined'))) {
    return { company, perfil, worker };
  }

  // 2. Fallback Multi-Empresa inteligente:
  // Si no se encontró el trabajador en esta empresa, buscar en todas las demás empresas del mismo usuario
  try {
    const allCompanies = await CompanyInfo.find({ user: company.user }).lean();
    for (const altCompany of allCompanies) {
      if (String(altCompany._id) === String(company._id)) continue;

      const altPerfil = await PerfilSociodemograficoData.findOne({
        user: new mongoose.Types.ObjectId(altCompany.user),
        $or: [
          { companyId: altCompany._id },
          { companyId: altCompany._id.toString() },
          { companyId: { $exists: false } },
          { companyId: null },
        ],
      }).lean();

      if (altPerfil && Array.isArray(altPerfil.trabajadores) && altPerfil.trabajadores.length > 0) {
        let altWorker = null;
        if (workerId && workerId !== 'undefined') {
          altWorker = altPerfil.trabajadores.find((t) => String(t.id) === String(workerId));
        }
        if (!altWorker && cedula) {
          altWorker = altPerfil.trabajadores.find(
            (t) => formatStr(t.identificacion) === formatStr(cedula),
          );
        }

        if (altWorker) {
          return { company: altCompany, perfil: altPerfil, worker: altWorker };
        }
      }
    }
  } catch (err) {
    logger.warn('[Public SGSST] Multi-company worker search error:', err.message);
  }

  return { company, perfil, worker };
}

// ─── GET /api/public-sgsst/company/:companyId ─────────────────────────────
// Get public details of the company (Name, Logo, Cargos) to show in the portal
router.get('/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await resolveActiveCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Also fetch unique cargos from the workers list
    const PerfilSociodemograficoData = mongoose.models.PerfilSociodemograficoData;
    let cargos = [];
    if (PerfilSociodemograficoData) {
      const perfil = await PerfilSociodemograficoData.findOne({
        user: new mongoose.Types.ObjectId(company.user),
        $or: [
          { companyId: company._id },
          { companyId: company._id.toString() },
          { companyId: { $exists: false } },
          { companyId: null },
        ],
      }).lean();
      if (perfil?.trabajadores?.length) {
        const set = new Set();
        perfil.trabajadores.forEach((t) => {
          if (t.cargo && t.cargo.trim()) set.add(t.cargo.trim());
        });
        cargos = [...set].sort();
      }
    }

    return res.json({
      _id: company._id,
      user: company.user,
      companyName: company.companyName || 'Empresa Registrada',
      nit: company.nit || '',
      logo: company.logoBase64 || null,
      cargos,
    });
  } catch (error) {
    logger.error('[Public SGSST] Company fetch error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── POST /api/public-sgsst/validate-worker/:companyId ─────────────────────
// Validar tempranamente que el trabajador sí existe en el Perfil Sociodemográfico
router.post('/validate-worker/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { cedula, nombre } = req.body;

    if (!cedula || !nombre) {
      return res.status(400).json({ error: 'Nombre y Cédula son obligatorios' });
    }

    const { company, perfil, worker: workerFound } = await resolveCompanyAndWorker(companyId, { cedula });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    if (!perfil || !perfil.trabajadores || perfil.trabajadores.length === 0) {
      return res
        .status(404)
        .json({ error: 'La empresa no cuenta con un Perfil Sociodemográfico registrado' });
    }

    if (!workerFound) {
      return res.status(403).json({
        error: 'Cédula no encontrada en la base de datos de esta empresa. No tiene autorización.',
      });
    }

    const formatStr = (s) => String(s || '').trim().toLowerCase();
    const workerNameParts = formatStr(workerFound.nombre)
      .split(' ')
      .filter((p) => p.length > 2);
    const inputNameFormat = formatStr(nombre);

    const nameMatches = workerNameParts.some((part) => inputNameFormat.includes(part));
    if (!nameMatches && workerFound.nombre) {
      return res
        .status(403)
        .json({ error: 'El nombre ingresado no coincide con el registrado para esta cédula.' });
    }

    return res.json({
      success: true,
      message: 'Validación exitosa',
      companyId: company._id,
      companyName: company.companyName || 'Empresa',
    });
  } catch (error) {
    logger.error('[Public SGSST] Worker validation error:', error);
    res.status(500).json({ error: 'Error al procesar la validación' });
  }
});

// ─── POST /api/public-sgsst/reporte-acto/:companyId ───────────────────────
// Submit a new Incident/Act report from a worker
router.post('/reporte-acto/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { cedula, nombre, data, esTercero } = req.body;

    if (!cedula || !nombre) {
      return res.status(400).json({ error: 'Nombre y Cédula son obligatorios para el reporte' });
    }

    const { company, perfil, worker: workerFound } = await resolveCompanyAndWorker(companyId, { cedula });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const ReporteActosData = mongoose.models.ReporteActosData;
    if (!ReporteActosData) {
      return res.status(500).json({ error: 'Los modelos de datos no están listos' });
    }

    if (!esTercero) {
      if (!perfil || !perfil.trabajadores || perfil.trabajadores.length === 0) {
        return res.status(404).json({
          error: 'La empresa no cuenta con un Perfil Sociodemográfico registrado',
        });
      }

      if (!workerFound) {
        return res.status(403).json({
          error:
            'Cédula no encontrada en la base de datos de esta empresa. No tiene autorización para reportar.',
        });
      }

      const formatStr = (s) => String(s || '').trim().toLowerCase();
      const workerNameParts = formatStr(workerFound.nombre)
        .split(' ')
        .filter((p) => p.length > 2);
      const inputNameFormat = formatStr(nombre);

      const nameMatches = workerNameParts.some((part) => inputNameFormat.includes(part));
      if (!nameMatches && workerFound.nombre) {
        return res.status(403).json({
          error: 'El nombre ingresado no coincide en absoluto con el registrado para esta cédula.',
        });
      }
    }

    // 2. Crear el objeto para el Inbox
    const newInboxItem = {
      id: new mongoose.Types.ObjectId().toString(),
      trabajador: {
        nombre: esTercero ? nombre : workerFound.nombre,
        cedula: esTercero ? cedula : workerFound.identificacion,
        cargo: esTercero ? 'Tercero / Externo' : workerFound.cargo || 'No especificado',
      },
      data: data || {}, // contains descripcion, fecha, hora, fotos
      esTercero: !!esTercero,
      createdAt: new Date(),
    };

    // 3. Guardar en el Inbox Público de ReporteActosData
    await ReporteActosData.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(company.user), companyId: company._id },
      { $push: { inboxPublico: newInboxItem }, $set: { updatedAt: Date.now() } },
      { upsert: true, new: true },
    );

    // ─── Crear notificación de sistema ───
    try {
      await Notification.create({
        user: new mongoose.Types.ObjectId(company.user),
        type: 'sgsst_reporte_acto',
        title: 'Nuevo Reporte de Acto Inseguro',
        body: `${esTercero ? nombre : workerFound.nombre} (${esTercero ? 'Tercero' : 'Trabajador'} - ${company.companyName || 'Empresa'}) ha reportado un acto o condición insegura desde el portal público.`,
        metadata: { module: 'reporte_actos', reportId: newInboxItem.id, companyId: company._id },
      });
    } catch (notifErr) {
      logger.warn('[Public SGSST] Could not create notification:', notifErr.message);
    }

    res.json({ success: true, message: 'Reporte radicado de forma exitosa y segura.' });
  } catch (error) {
    logger.error('[Public SGSST] Report submission error:', error);
    res.status(500).json({ error: 'Error al procesar el reporte' });
  }
});

// ─── GET /api/public-sgsst/debug-ipevar/:companyId (TEMPORAL) ───────────────────────
router.get('/debug-ipevar/:companyId', async (req, res) => {
  try {
    const ParticipacionIpevarData = mongoose.models.ParticipacionIpevarData;
    const docs = await ParticipacionIpevarData.collection.find({}).toArray();
    return res.json({
      count: docs.length,
      docs: docs.map((d) => ({
        id: d._id,
        user: d.user,
        userType: typeof d.user,
        userConstructor: d.user?.constructor?.name,
        inboxCount: d.inboxPublico?.length || 0,
      })),
    });
  } catch (e) {
    return res.json({ error: e.message });
  }
});

// ─── POST /api/public-sgsst/participacion-ipevar/:companyId ───────────────────────
// Submit a new Participacion IPEVAR Trabajadores report from a worker
router.post('/participacion-ipevar/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { cedula, nombre, data } = req.body;

    if (!cedula || !nombre) {
      return res
        .status(400)
        .json({ error: 'Nombre y Cédula son obligatorios para la participación' });
    }

    const { company, perfil, worker: workerFound } = await resolveCompanyAndWorker(companyId, { cedula });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const ParticipacionIpevarData = mongoose.models.ParticipacionIpevarData;
    if (!ParticipacionIpevarData) {
      return res.status(500).json({ error: 'Los modelos de datos no están listos' });
    }

    // 1. Validar identidad cruzada con el Perfil Sociodemográfico
    if (!perfil || !perfil.trabajadores || perfil.trabajadores.length === 0) {
      return res.status(404).json({
        error: 'La empresa no cuenta con un Perfil Sociodemográfico registrado',
      });
    }

    if (!workerFound) {
      return res.status(403).json({
        error: 'Cédula no encontrada en la base de datos de esta empresa. No tiene autorización.',
      });
    }

    const formatStr = (s) => String(s || '').trim().toLowerCase();
    const workerNameParts = formatStr(workerFound.nombre)
      .split(' ')
      .filter((p) => p.length > 2);
    const inputNameFormat = formatStr(nombre);

    const nameMatches = workerNameParts.some((part) => inputNameFormat.includes(part));
    if (!nameMatches && workerFound.nombre) {
      return res.status(403).json({
        error: 'El nombre ingresado no coincide con el registrado para esta cédula.',
      });
    }

    // 2. Crear el objeto para el Inbox
    const newInboxItem = {
      id: new mongoose.Types.ObjectId().toString(),
      trabajador: {
        nombre: workerFound.nombre,
        cedula: workerFound.identificacion,
        cargo: workerFound.cargo || 'No especificado',
      },
      data: data || {}, // contains foto, tarea, peligros, controlesExistentes, etc
      createdAt: new Date(),
    };

    // 3. Guardar en el Inbox Público de ParticipacionIpevarData
    await ParticipacionIpevarData.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(company.user), companyId: company._id },
      { $push: { inboxPublico: newInboxItem }, $set: { updatedAt: Date.now() } },
      { upsert: true, new: true },
    );

    // ─── Crear notificación de sistema ───
    try {
      await Notification.create({
        user: new mongoose.Types.ObjectId(company.user),
        type: 'sgsst_participacion_ipevar',
        title: 'Nueva Participación IPEVAR Recibida',
        body: `${workerFound.nombre} (${company.companyName || 'Empresa'}) ha enviado su identificación de peligros y participación IPEVAR.`,
        metadata: { module: 'participacion_ipevar', reportId: newInboxItem.id, companyId: company._id },
      });
    } catch (notifErr) {
      logger.warn('[Public SGSST] Could not create notification:', notifErr.message);
    }

    res.json({
      success: true,
      message: 'Su participación ha sido enviada exitosamente al equipo SGSST.',
    });
  } catch (error) {
    logger.error('[Public SGSST] Participacion IPEVAR submission error:', error);
    res.status(500).json({ error: 'Error al procesar la participación' });
  }
});

// ─── POST /api/public-sgsst/investigacion-atel/testimonio/:companyId ─────────
// Submit a new testimony from a witness for an ATEL investigation
router.post('/investigacion-atel/testimonio/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { cedula, nombre, data, investigacionId } = req.body;

    if (!cedula || !nombre) {
      return res.status(400).json({ error: 'Nombre y Cédula son obligatorios' });
    }

    const { company } = await resolveCompanyAndWorker(companyId, { cedula });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const InvestigacionAtelData = mongoose.models.InvestigacionAtelData;
    if (!InvestigacionAtelData) {
      return res.status(500).json({ error: 'Modelo InvestigacionAtelData no encontrado' });
    }

    // Create the testimony object for the inbox
    const newInboxItem = {
      id: new mongoose.Types.ObjectId().toString(),
      testigo: {
        nombre,
        cedula,
        cargo: data?.cargo || 'Testigo Externo / No especificado',
      },
      testimonio: data?.testimonio || '',
      media: {
        foto1: data?.foto1 || null,
        foto2: data?.foto2 || null,
        video: data?.video || null,
      },
      createdAt: new Date(),
      status: 'pending',
    };

    // Find the correct investigation to push the testimony into
    let targetDoc = null;
    if (investigacionId) {
      targetDoc = await InvestigacionAtelData.findOne({
        user: new mongoose.Types.ObjectId(company.user),
        companyId: company._id,
        id: investigacionId
      });
    }

    if (!targetDoc) {
      // Fallback: get the most recent investigation for this company
      targetDoc = await InvestigacionAtelData.findOne({
        user: new mongoose.Types.ObjectId(company.user),
        companyId: company._id
      }).sort({ updatedAt: -1 });
    }

    if (targetDoc) {
      await InvestigacionAtelData.findByIdAndUpdate(
        targetDoc._id,
        { 
          $push: { inboxTestimonios: newInboxItem }, 
          $set: { updatedAt: Date.now() } 
        }
      );
    } else {
      // Fallback: create a new investigation if none exists at all
      await InvestigacionAtelData.findOneAndUpdate(
        { user: new mongoose.Types.ObjectId(company.user), companyId: company._id },
        { 
          $push: { inboxTestimonios: newInboxItem }, 
          $set: { 
            id: new mongoose.Types.ObjectId().toString(), 
            updatedAt: Date.now(),
            formData: {
              tipoEvento: 'Incidente',
              fechaEvento: new Date().toISOString().split('T')[0],
              horaEvento: '08:00',
              descripcionHechos: 'Creado automáticamente al recibir primer testimonio.'
            }
          } 
        },
        { upsert: true, new: true }
      );
    }

    res.json({
      success: true,
      message: 'Su testimonio ha sido radicado exitosamente en el sistema de investigación.',
    });

    // ─── Crear notificación de sistema ───
    try {
      await Notification.create({
        user: new mongoose.Types.ObjectId(company.user),
        type: 'sgsst_testimonio_atel',
        title: 'Nuevo Testimonio de Testigo',
        body: `${nombre} (${company.companyName || 'Empresa'}) ha radicado su testimonio en la investigación ATEL desde el portal público.`,
        metadata: { module: 'investigacion_atel', reportId: newInboxItem.id, companyId: company._id },
      });
    } catch (notifErr) {
      logger.warn('[Public SGSST] Could not create ATEL testimony notification:', notifErr.message);
    }
  } catch (error) {
    logger.error('[Public SGSST] ATEL Testimony submission error:', error);
    res.status(500).json({ error: 'Error al procesar el testimonio' });
  }
});

// ─── ALTA DIRECCIÓN: HELPERS & ROUTES ───────────────────────────────────────

const GERENCIA_KEYWORDS = [
  'gerente',
  'representante legal',
  'director',
  'presidente',
  'ceo',
  'vicepresidente',
  'subgerente',
  'directora',
  'gerencia',
  'junta directiva',
  'copropietario',
  'administrador',
  'socios',
];

function isGerenciaRole(cargo) {
  if (!cargo) return false;
  const lc = cargo.toLowerCase().trim();
  return GERENCIA_KEYWORDS.some((kw) => lc.includes(kw));
}

// POST /api/public-sgsst/validate-alta-direccion/:companyId
router.post('/validate-alta-direccion/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { cedula, nombre } = req.body;

    const { company, perfil, worker } = await resolveCompanyAndWorker(companyId, { cedula });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    if (!perfil || !perfil.trabajadores || perfil.trabajadores.length === 0)
      return res.status(404).json({
        error:
          'Empresa sin trabajadores registrados. Asegúrese de haber guardado el Perfil Sociodemográfico.',
      });

    if (!worker) return res.status(403).json({ error: 'Cédula no encontrada en el sistema.' });

    if (!isGerenciaRole(worker.cargo)) {
      return res.status(403).json({
        error: `Acceso denegado. Cargo: "${worker.cargo}". Solo personal de Gerencia/Dirección puede acceder a este portal.`,
      });
    }
    res.json({
      success: true,
      companyId: company._id,
      companyName: company.companyName || 'Empresa',
      trabajador: { nombre: worker.nombre, cargo: worker.cargo, cedula: worker.identificacion },
    });
  } catch (error) {
    logger.error('[Public AltaDireccion] Validation error:', error);
    res.status(500).json({ error: 'Error al validar' });
  }
});

// POST /api/public-sgsst/alta-direccion/:companyId
router.post('/alta-direccion/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { cedula, data } = req.body;

    const { company, perfil, worker } = await resolveCompanyAndWorker(companyId, { cedula });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const AltaDireccionData = mongoose.models.AltaDireccionData;
    if (!AltaDireccionData) {
      return res.status(500).json({
        error: 'Modelos no encontrados. Asegúrese de que el sistema esté completamente cargado.',
      });
    }

    if (!worker || !isGerenciaRole(worker.cargo))
      return res.status(403).json({ error: 'No autorizado.' });

    const newReport = {
      id: new mongoose.Types.ObjectId().toString(),
      trabajador: { nombre: worker.nombre, cargo: worker.cargo, cedula: worker.identificacion },
      data: data,
      status: 'pending',
      createdAt: new Date(),
    };

    await AltaDireccionData.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(company.user), companyId: company._id },
      { $push: { inboxPublico: newReport }, $set: { updatedAt: Date.now() } },
      { upsert: true, new: true },
    );

    // ─── Crear notificación de sistema ───
    try {
      await Notification.create({
        user: new mongoose.Types.ObjectId(company.user),
        type: 'sgsst_alta_direccion',
        title: 'Nueva Evaluación de Alta Dirección',
        body: `${worker.nombre} (${worker.cargo} - ${company.companyName || 'Empresa'}) ha enviado su revisión por la Alta Dirección desde el portal público.`,
        metadata: { module: 'alta_direccion', reportId: newReport.id, companyId: company._id },
      });
    } catch (notifErr) {
      logger.warn('[Public AltaDireccion] Could not create notification:', notifErr.message);
    }

    res.json({
      success: true,
      message: 'Evaluación enviada correctamente. El administrador SST recibirá una notificación.',
    });
  } catch (error) {
    logger.error('[Public AltaDireccion] Submission error:', error);
    res.status(500).json({ error: 'Error al enviar' });
  }
});

// ─── GET /api/public-sgsst/perfil-update/:companyId/:workerId ──────────────
// Fetch current worker profile data to pre-fill the self-update form
router.get('/perfil-update/:companyId/:workerId?', async (req, res) => {
  try {
    const { companyId, workerId } = req.params;
    const { cedula } = req.query;

    const { company, perfil, worker } = await resolveCompanyAndWorker(companyId, { cedula, workerId });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    if (!perfil || !perfil.trabajadores || perfil.trabajadores.length === 0) {
      return res
        .status(404)
        .json({ error: 'La empresa no cuenta con un Perfil Sociodemográfico registrado' });
    }

    if (!worker) {
      return res
        .status(404)
        .json({ error: 'Trabajador no encontrado o identificación incorrecta.' });
    }

    return res.json({
      _id: company._id,
      companyName: company.companyName || 'Empresa',
      logo: company.logoBase64 || null,
      worker: {
        id: worker.id,
        nombre: worker.nombre,
        cargo: worker.cargo,
        identificacion: worker.identificacion,
        edad: worker.edad || '',
        genero: worker.genero || '',
        estadoCivil: worker.estadoCivil || '',
        nivelEscolaridad: worker.nivelEscolaridad || '',
        direccion: worker.direccion || '',
        telefono: worker.telefono || '',
        emergenciaContacto: worker.emergenciaContacto || '',
        tipoSangre: worker.tipoSangre || '',
        rh: worker.rh || '',
        enfermedades: worker.enfermedades || '',
        medicamentos: worker.medicamentos || '',
        fuma: worker.fuma || '',
        alcohol: worker.alcohol || '',
        terapiaPsicologica: worker.terapiaPsicologica || '',
        personasCargo: worker.personasCargo ?? '',
        estrato: worker.estrato || '',
        vivienda: worker.vivienda || '',
        soatVencimiento: worker.soatVencimiento || '',
        tecnicomecanicaVencimiento: worker.tecnicomecanicaVencimiento || '',
        licenciaSST: worker.licenciaSST || '',
        licenciaVencimiento: worker.licenciaVencimiento || '',
        curso50h: worker.curso50h || '',
        curso20h: worker.curso20h || '',
        fechaNacimiento: worker.fechaNacimiento || '',
        lugarNacimiento: worker.lugarNacimiento || '',
        barrio: worker.barrio || '',
        municipioDomicilio: worker.municipioDomicilio || '',
        correoElectronico: worker.correoElectronico || '',
        licenciaConduccion: worker.licenciaConduccion || '',
        licenciaConduccionVencimiento: worker.licenciaConduccionVencimiento || '',
        esCopasst: worker.esCopasst || 'No',
        esComiteConvivencia: worker.esComiteConvivencia || 'No',
        esBrigadista: worker.esBrigadista || 'No',
        esComiteSeguridadVial: worker.esComiteSeguridadVial || 'No',
        deporte: worker.deporte || '',
        alimentacion: worker.alimentacion || '',
        peso: worker.peso || '',
        talla: worker.talla || '',
        imc: worker.imc || '',
        presionArterial: worker.presionArterial || '',
        frecuenciaCardiaca: worker.frecuenciaCardiaca || '',
        diagnosticoMedico: worker.diagnosticoMedico || '',
        limitacionesBiomecanicas: worker.limitacionesBiomecanicas || '',
        alergiasQuimicas: worker.alergiasQuimicas || '',
        riesgoCardiovascular: worker.riesgoCardiovascular || '',
        fechaExamenMedico: worker.fechaExamenMedico || '',
        recomendacionesMedicas: worker.recomendacionesMedicas || '',
        fechaSeguimiento: worker.fechaSeguimiento || '',
        fechaCursoAlturasAutorizado: worker.fechaCursoAlturasAutorizado || '',
        fechaCursoAlturasCoordinador: worker.fechaCursoAlturasCoordinador || '',
      },
    });
  } catch (err) {
    logger.error('[Public Perfil Update GET]', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─── POST /api/public-sgsst/perfil-update/:companyId/:workerId ─────────────
// Worker self-submits profile data update; stored in pending inbox for admin approval
router.post('/perfil-update/:companyId/:workerId?', async (req, res) => {
  try {
    const { companyId, workerId: paramWorkerId } = req.params;
    const { updates, cedula } = req.body;

    const { company, worker } = await resolveCompanyAndWorker(companyId, { cedula, workerId: paramWorkerId });
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const PerfilSociodemograficoData = mongoose.models.PerfilSociodemograficoData;
    const perfil = await PerfilSociodemograficoData.findOne({
      user: new mongoose.Types.ObjectId(company.user),
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: { $exists: false } },
        { companyId: null },
      ],
    });
    if (!perfil)
      return res
        .status(404)
        .json({ error: 'Perfil sociodemográfico no encontrado para esta empresa' });

    if (!worker) return res.status(404).json({ error: 'Trabajador no encontrado' });

    const workerId = worker.id; // Use the real ID found

    // Separate fields into Social and Health categories
    const socialKeys = [
      'edad',
      'genero',
      'estadoCivil',
      'nivelEscolaridad',
      'direccion',
      'telefono',
      'emergenciaContacto',
      'personasCargo',
      'estrato',
      'vivienda',
      'soatVencimiento',
      'tecnicomecanicaVencimiento',
      'licenciaSST',
      'licenciaVencimiento',
      'curso50h',
      'curso20h',
      'licenciaConduccion',
      'licenciaConduccionVencimiento',
      'esCopasst',
      'esComiteConvivencia',
      'esBrigadista',
      'esComiteSeguridadVial',
      'fechaNacimiento',
      'lugarNacimiento',
      'barrio',
      'municipioDomicilio',
      'correoElectronico',
      'fechaCursoAlturasAutorizado',
      'fechaCursoAlturasCoordinador',
    ];
    const healthKeys = [
      'tipoSangre',
      'rh',
      'enfermedades',
      'medicamentos',
      'fuma',
      'alcohol',
      'terapiaPsicologica',
      'deporte',
      'alimentacion',
      'peso',
      'talla',
      'imc',
      'presionArterial',
      'frecuenciaCardiaca',
      'diagnosticoMedico',
      'limitacionesBiomecanicas',
      'alergiasQuimicas',
      'riesgoCardiovascular',
      'fechaExamenMedico',
      'recomendacionesMedicas',
      'fechaSeguimiento',
    ];

    const socialUpdates = {};
    const healthUpdates = {};

    for (const [key, value] of Object.entries(updates || {})) {
      if (socialKeys.includes(key)) socialUpdates[key] = value;
      if (healthKeys.includes(key)) healthUpdates[key] = value;
    }

    // Store in the corresponding pending inboxes
    if (Object.keys(socialUpdates).length > 0) {
      if (!perfil.actualizacionesPendientes) perfil.actualizacionesPendientes = [];
      perfil.actualizacionesPendientes.push({
        id: new mongoose.Types.ObjectId().toString(),
        workerId,
        workerName: worker.nombre, // Standardized key
        workerCargo: worker.cargo,
        changes: socialUpdates, // Social changes only
        status: 'pending',
        createdAt: new Date(),
      });
    }

    if (Object.keys(healthUpdates).length > 0) {
      if (!perfil.actualizacionesPendientesSalud) perfil.actualizacionesPendientesSalud = [];
      perfil.actualizacionesPendientesSalud.push({
        id: new mongoose.Types.ObjectId().toString(),
        workerId,
        workerName: worker.nombre, // Standardized key
        workerCargo: worker.cargo,
        changes: healthUpdates, // Health changes only
        status: 'pending',
        createdAt: new Date(),
      });
    }

    await perfil.save();

    // Notify admin
    try {
      const Notif = require('~/models/Notification');
      await Notif.create({
        user: new mongoose.Types.ObjectId(company.user),
        type: 'sgsst_perfil_update',
        title: 'Actualización de Perfil y Salud Recibida',
        body: `${worker.nombre} ha solicitado actualizar sus datos de perfil sociodemográfico y condiciones de salud.`,
        metadata: { module: 'perfil_socio', workerId },
      });
    } catch (notifErr) {
      logger.warn('[Public Perfil Update] Could not create notification:', notifErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[Public Perfil Update POST]', err);
    res.status(500).json({ error: 'Error al enviar actualización' });
  }
});

// ─── TERMÓMETRO PSICOSOCIAL (MOOD TELEMETRY) ──────────────────────────────────

// POST /api/public-sgsst/mood/:companyId
// Registra de forma anónima la respuesta inicial del estado de ánimo del trabajador
router.post('/mood/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { mood, department, deviceId } = req.body;

    if (!mood || !['happy', 'neutral', 'sad'].includes(mood)) {
      return res.status(400).json({ error: 'Estado de ánimo inválido o ausente.' });
    }

    const company = await resolveActiveCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    const MoodTelemetry = require('~/models/MoodTelemetry');

    // Validación de 1 reporte por día por dispositivo / equipo
    if (deviceId && typeof deviceId === 'string' && deviceId.trim()) {
      const cleanDeviceId = deviceId.trim();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const existingRecord = await MoodTelemetry.findOne({
        companyId: company._id,
        deviceId: cleanDeviceId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      });

      if (existingRecord) {
        return res.status(429).json({
          error: 'Ya has registrado tu estado de ánimo el día de hoy desde este equipo.',
          alreadyReportedToday: true,
        });
      }
    }

    const telemetry = new MoodTelemetry({
      companyId: company._id,
      mood,
      department: department || '',
      deviceId: deviceId ? String(deviceId).trim() : '',
    });

    await telemetry.save();
    return res.json({ success: true, telemetryId: telemetry._id });
  } catch (error) {
    logger.error('[Public SGSST] Mood telemetry error:', error);
    res.status(500).json({ error: 'Error al registrar estado de ánimo.' });
  }
});

// POST /api/public-sgsst/mood/update/:telemetryId
// Actualiza la telemetría agregando los estresores detectados y resumen de la conversación
router.post('/mood/update/:telemetryId', async (req, res) => {
  try {
    const { telemetryId } = req.params;
    const { stressors, details } = req.body;

    if (!mongoose.Types.ObjectId.isValid(telemetryId)) {
      return res.status(400).json({ error: 'ID de telemetría inválido.' });
    }

    const MoodTelemetry = require('~/models/MoodTelemetry');
    await MoodTelemetry.findByIdAndUpdate(telemetryId, {
      $set: { stressors: stressors || [], details: details || '' },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error('[Public SGSST] Mood update error:', error);
    res.status(500).json({ error: 'Error al actualizar telemetría.' });
  }
});

// POST /api/public-sgsst/mood/chat/:companyId
// Genera un token JWT temporal y anónimo para hablar con el Terapeuta / Psicólogo
router.post('/mood/chat/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const company = await resolveActiveCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }

    let Agent = mongoose.models.Agent;
    if (!Agent) {
      try {
        Agent = require('~/db/models').Agent;
      } catch (e) {}
    }
    if (!Agent) {
      const AgentSchema = new mongoose.Schema(
        {
          id: String,
          name: String,
          category: String,
          model: String,
        },
        { strict: false, collection: 'agents' },
      );
      Agent = mongoose.models.AgentPublicLookup || mongoose.model('AgentPublicLookup', AgentSchema);
    }

    // 1. Buscar prioritariamente por nombres oficiales de salud mental y bienestar
    let agent = await Agent.findOne({
      $or: [
        { name: /Terapeuta en Salud Mental/i },
        { name: /Terapeuta/i },
        { name: /Salud Mental/i },
        { name: /Psic[oó]logo SST/i },
        { name: /Psic[oó]logo/i },
        { name: /Psicosocial/i },
      ],
    }).lean();

    // 2. Fallback por categoría si no coincide por nombre
    if (!agent) {
      agent = await Agent.findOne({ category: 'ergonomia_salud_bienestar' }).lean();
    }

    // 3. Fallback a agentes generales de SST
    if (!agent) {
      agent = await Agent.findOne({
        $or: [
          { name: /Profesional SST/i },
          { name: /Consultor SG-SST/i },
          { name: /SST/i },
        ],
      }).lean();
    }

    // 4. Fallback a cualquier agente registrado en el sistema
    if (!agent) {
      agent = await Agent.findOne({}).lean();
    }

    if (!agent) {
      return res
        .status(404)
        .json({ error: 'No se encontró ningún agente disponible para la sesión de orientación.' });
    }

    // Resolver ID de agente compatible con LibreChat
    let resolvedAgentId = agent.id;
    if (!resolvedAgentId && agent._id) {
      resolvedAgentId = agent._id.toString();
      try {
        await Agent.updateOne({ _id: agent._id }, { $set: { id: resolvedAgentId } });
      } catch (e) {}
    }

    // Resolver usuario válido para firmar JWT
    let userId = company.user ? company.user.toString() : null;
    let User = mongoose.models.User;
    if (!User) {
      try {
        User = require('~/db/models').User;
      } catch (e) {}
    }
    if (User) {
      let validUser = null;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        validUser = await User.findById(userId).lean();
      }
      if (!validUser) {
        validUser =
          (await User.findOne({ role: 'ADMIN' }).lean()) ||
          (await User.findOne({}).lean());
        if (validUser) {
          userId = validUser._id.toString();
        }
      }
    }
    if (!userId) {
      userId = company._id.toString();
    }

    // Firmar un token temporal con los privilegios del administrador de la empresa (restringido a 1 hora)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    const crypto = require('crypto');
    const conversationId = crypto.randomUUID();

    return res.json({
      success: true,
      token,
      agentId: resolvedAgentId,
      agentName: agent.name || 'Terapeuta en Salud Mental',
      agentModel: agent.model || undefined,
      conversationId,
    });
  } catch (error) {
    logger.error('[Public SGSST] Mood chat generation error:', error);
    res.status(500).json({ error: 'Error al generar sesión de chat con el terapeuta.' });
  }
});

module.exports = router;
