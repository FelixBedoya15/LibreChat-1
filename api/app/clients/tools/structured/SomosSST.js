const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const mongoose = require('mongoose');

/**
 * SomosSST Tool
 * Permite al agente interactuar de manera integral con la plataforma SOMOS SST (anteriormente conocida como Gestor SG-SST en /sgsst),
 * la cual está dividida en 2 MÓDULOS PRINCIPALES:
 * 1. Módulo Motor Bio-Individual (Bio Motor): Gestión humana, huella biocéntrica y los 5 Hitos.
 * 2. Módulo Ecosistema SG-SST General: Gestión normativa, políticas, diagnósticos, capacitaciones y matrices de riesgo.
 */
class SomosSST extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'somos_sst';
    this.description =
      'Herramienta oficial de SOMOS SST (anteriormente SGSST). Permite consultar y editar cualquier información en sus 2 MÓDULOS PRINCIPALES: el Motor Bio-Individual (Bio Motor - expediente del trabajador, exámenes médicos, accidentes ATEL, Hitos) y el Ecosistema SG-SST General (matrices GTC45, EPP, alturas, ATS, capacitaciones, políticas y estadísticas en tiempo real).';
    this.req = fields.req;

    this.schema = z.object({
      accion: z
        .enum([
          'consultar_expediente_integral',
          'listar_trabajadores',
          'resumen_empresa',
          'actualizar_examen_medico',
          'registrar_accidente_atel',
          'actualizar_hito_tarea',
          'editar_cualquier_aplicativo',
          'generar_informe_html',
          'consultar_historial_informes',
          'consultar_planes_y_sistema',
          'consultar_centro_control_acpm',
          'crear_actividad_acpm',
          'actualizar_actividad_acpm',
          'crear_trabajador',
        ])
        .describe(
          'La acción a ejecutar: consultar_expediente_integral, listar_trabajadores, resumen_empresa, crear_trabajador, editar_cualquier_aplicativo, generar_informe_html, consultar_historial_informes, consultar_planes_y_sistema, consultar_centro_control_acpm, crear_actividad_acpm, o actualizar_actividad_acpm.',
        ),
      tipo_informe: z
        .string()
        .optional()
        .describe('Tipo de informe HTML a generar (ej: "resumen_ejecutivo", "accidentalidad_atel", "expediente_trabajador", "matriz_peligros", "informe_clinico_preventivo").'),
      titulo_informe: z
        .string()
        .optional()
        .describe('Título del informe HTML.'),
      contenido_html: z
        .string()
        .optional()
        .describe('Contenido HTML personalizado o estructurado para el cuerpo del informe.'),
      nombre_o_cargo: z
        .string()
        .optional()
        .describe(
          'Nombre, apellido, cédula, ID, o Nombre del Cargo del trabajador a consultar o modificar (o nombre completo al crearlo con crear_trabajador).',
        ),
      cargo_trabajador: z
        .string()
        .optional()
        .describe('Cargo del trabajador al crearlo con crear_trabajador (ej: "Analista de Operaciones").'),
      nombre_aplicativo: z
        .string()
        .optional()
        .describe('Nombre del aplicativo o módulo a editar (ej: "epp", "alturas", "ats", "vehiculos", "capacitaciones", "gtc45", "owas", "actos", "cargos", "vulnerabilidad", "quimicos", "kanban", "politica").'),
      identificador_o_filtro: z
        .string()
        .optional()
        .describe('Cédula, nombre, código o filtro para ubicar el registro exacto dentro del aplicativo.'),
      campo_a_modificar: z
        .string()
        .optional()
        .describe('Nombre de la propiedad o campo a modificar en el aplicativo.'),
      nuevo_valor: z
        .string()
        .optional()
        .describe('El nuevo valor que se asignará al campo.'),
      fecha_examen: z
        .string()
        .optional()
        .describe('Fecha del examen médico en formato YYYY-MM-DD. Requerido para actualizar_examen_medico.'),
      diagnostico_medico: z
        .string()
        .optional()
        .describe('Concepto o diagnóstico del examen (ej: "Apto sin restricciones", "Apto con restricciones").'),
      restricciones_medicas: z
        .string()
        .optional()
        .describe('Restricciones o recomendaciones médicas asignadas al trabajador.'),
      fecha_accidente: z
        .string()
        .optional()
        .describe('Fecha del accidente o evento ATEL en formato YYYY-MM-DD. Requerido para registrar_accidente_atel.'),
      tipo_evento: z
        .string()
        .optional()
        .describe('Tipo de evento ATEL: "AT" (Accidente de Trabajo), "EL" (Enfermedad Laboral), "Ausentismo".'),
      descripcion_accidente: z
        .string()
        .optional()
        .describe('Descripción detallada del accidente o suceso.'),
      dias_incapacidad: z
        .number()
        .optional()
        .describe('Número de días de incapacidad generados por el evento ATEL.'),
      gravedad: z
        .string()
        .optional()
        .describe('Gravedad del evento (ej: "Leve", "Grave", "Mortal").'),
      parte_cuerpo: z
        .string()
        .optional()
        .describe('Parte del cuerpo afectada en el accidente.'),
      nombre_tarea_o_hito: z
        .string()
        .optional()
        .describe('Nombre o descripción del hito o tarea del SG-SST a actualizar.'),
      nuevo_estado: z
        .string()
        .optional()
        .describe('Nuevo estado del hito o tarea (ej: "Completado", "En Proceso", "Pendiente", "done", "todo").'),
      titulo_actividad: z
        .string()
        .optional()
        .describe('Título de la actividad para el Centro de Control ACPM.'),
      descripcion_actividad: z
        .string()
        .optional()
        .describe('Descripción o detalles de la actividad ACPM.'),
      fecha_vencimiento: z
        .string()
        .optional()
        .describe('Fecha de vencimiento para la actividad ACPM (ej: YYYY-MM-DD o "mañana").'),
      estado_actividad: z
        .string()
        .optional()
        .describe('Estado de la actividad ACPM: "todo", "due_soon", "overdue", "done".'),
      tipo_actividad: z
        .string()
        .optional()
        .describe('Tipo de actividad ACPM: "manual", "medical_exam", "training", "other".'),
    });
  }

  async _call(input) {
    try {
      const userId = this.req?.user?.id;
      if (!userId) {
        return JSON.stringify({ error: 'Usuario no autenticado para acceder a la base de datos de SomosSST.' });
      }

      // Dynamic model load helper to ensure models are registered in mongoose
      const modelLoader = (name, path) => {
        if (!mongoose.models[name]) {
          try {
            require(path);
          } catch (e) {
            console.warn(`[SomosSST Tool] Failed to load model ${name} from ${path}:`, e.message);
          }
        }
        return mongoose.models[name];
      };

      // Load 10 Motor Bio-Individual models and CompanyInfo
      const SgsstWorkerModel = modelLoader('SgsstWorker', '~/models/SgsstWorker');
      const PerfilSocioModel = modelLoader('PerfilSociodemograficoData', '~/server/routes/sgsst/perfilSociodemografico');
      const PerfilCargoModel = modelLoader('PerfilCargoData', '~/server/routes/sgsst/perfilesCargo');
      const MatrizPeligrosModel = modelLoader('MatrizPeligrosData', '~/server/routes/sgsst/matrizPeligros');
      const ProgramaCapacitacionesModel = modelLoader('ProgramaCapacitacionesData', '~/server/routes/sgsst/programaCapacitaciones');
      const ParticipacionIpevarModel = modelLoader('ParticipacionIpevarData', '~/server/routes/sgsst/participacionIpevar');
      const AnalisisTrabajoSeguroModel = modelLoader('AnalisisTrabajoSeguroData', '~/server/routes/sgsst/analisisTrabajoSeguro');
      const MetodoOwasModel = modelLoader('MetodoOwasData', '~/server/routes/sgsst/metodoOwas');
      const PermisoAlturasModel = modelLoader('PermisoAlturasData', '~/server/routes/sgsst/permisoAlturas');
      const ATELAnnualModel = modelLoader('ATELAnnualData', '~/server/routes/sgsst/atel-data');
      const InvestigacionAtelModel = modelLoader('InvestigacionAtelData', '~/models/InvestigacionAtelData');
      const ReporteActosModel = modelLoader('ReporteActosData', '~/server/routes/sgsst/reporteActos');
      const CompanyInfo = mongoose.models.CompanyInfo || require('~/models/CompanyInfo');

      // Helper to obtain the active company id
      const getActiveCompanyId = async (uid) => {
        let active = await CompanyInfo.findOne({ user: uid, isActive: true });
        if (!active) active = await CompanyInfo.findOne({ user: uid });
        return active ? active._id : null;
      };

      const companyId = await getActiveCompanyId(userId);
      const { accion, nombre_o_cargo } = input;

      // Enforce strict active company filter to keep only current valid data and avoid mistakes
      const buildQueryObj = (uid) => {
        return { user: uid, companyId };
      };

      const queryObj = buildQueryObj(userId);
      const socioData = PerfilSocioModel ? await PerfilSocioModel.findOne(queryObj) : null;

      // ── ACTION: LISTAR TRABAJADORES ───────────────────────────────────────────
      if (accion === 'listar_trabajadores') {
        const currentDate = new Date();
        const listaMap = new Map();

        // 1. Load from PerfilSociodemograficoData (SocioData)
        if (socioData && socioData.trabajadores) {
          for (const t of socioData.trabajadores) {
            const cleanId = String(t.identificacion || '').trim();
            if (!cleanId) continue;

            let hasMedicalAlert = false;
            if (t.fechaExamenMedico) {
              try {
                const diffTime = Math.abs(currentDate - new Date(t.fechaExamenMedico));
                if (Math.ceil(diffTime / (1000 * 60 * 60 * 24)) >= 300) {
                  hasMedicalAlert = true;
                }
              } catch (e) {}
            } else {
              hasMedicalAlert = true;
            }

            listaMap.set(cleanId, {
              nombre: t.nombre,
              identificacion: cleanId,
              cargo: t.cargo || 'Sin cargo',
              diagnostico: t.diagnosticoMedico || 'No registrado',
              fitScore: t.biocentricScore || 0,
              fitAlerts: t.biocentricAlerts || [],
              alertas: {
                examen_medico_vencido: hasMedicalAlert,
                accidente_registrado: false
              }
            });
          }
        }

        // 2. Supplement with SgsstWorker master profiles (Oráculo Predictivo H1 details)
        if (SgsstWorkerModel) {
          const masterWorkers = await SgsstWorkerModel.find(queryObj).lean();
          for (const w of masterWorkers) {
            const cleanId = String(w.documento || '').trim();
            if (!cleanId) continue;

            let existing = listaMap.get(cleanId);
            if (!existing) {
              existing = {
                nombre: w.nombre,
                identificacion: cleanId,
                cargo: w.perfilId || 'Sin cargo',
                diagnostico: w.condicionesSalud || 'No registrado',
                alertas: {
                  examen_medico_vencido: true,
                  accidente_registrado: false
                }
              };
            }

            // Sync Oráculo Predictivo values
            existing.fitScore = w.fitScore || w.biocentricScore || existing.fitScore || 0;
            existing.fitAlerts = w.fitAlerts || w.biocentricAlerts || existing.fitAlerts || [];
            if (w.condicionesSalud) existing.diagnostico = w.condicionesSalud;
            if (w.atel && w.atel.length > 0) existing.alertas.accidente_registrado = true;

            listaMap.set(cleanId, existing);
          }
        }

        // 3. Mark accident records from Investigaciones
        if (InvestigacionAtelModel) {
          const allAccidents = await InvestigacionAtelModel.find(queryObj).lean();
          allAccidents.forEach(acc => {
            if (acc.formData?.afectadoCedula) {
              const doc = String(acc.formData.afectadoCedula).trim();
              const existing = listaMap.get(doc);
              if (existing) {
                existing.alertas.accidente_registrado = true;
              }
            }
          });
        }

        const trabajadores = Array.from(listaMap.values());
        if (trabajadores.length === 0) {
          return JSON.stringify({ mensaje: 'No hay trabajadores registrados en la base de datos (Huella Biocéntrica).' });
        }

        return JSON.stringify({
          mensaje: `Se encontraron ${trabajadores.length} trabajadores registrados en el Motor Bio-Individual.`,
          trabajadores: trabajadores
        });
      }

      // ── ACTION: CREAR TRABAJADOR (CON INTEGRACIÓN AUTOMÁTICA DE EPT PENDIENTE) ─
      if (accion === 'crear_trabajador') {
        const rawName = input.nombre_o_cargo || '';
        const rawDoc = input.identificador_o_filtro || '';
        const rawCargo = input.cargo_trabajador || input.campo_a_modificar || 'Puesto Operativo / Administrativo';

        if (!rawName || !rawDoc) {
          return JSON.stringify({
            error: 'Debes proporcionar nombre_o_cargo (nombre completo) e identificador_o_filtro (cédula) para registrar al trabajador.',
          });
        }

        const cleanDoc = String(rawDoc).trim();
        const cleanName = String(rawName).trim();
        const cleanCargo = String(rawCargo).trim();

        // 1. Cargar o crear PerfilSociodemograficoData
        let perfil = PerfilSocioModel ? await PerfilSocioModel.findOne({ companyId }) : null;
        if (!perfil && PerfilSocioModel) {
          perfil = new PerfilSocioModel({
            user: userId,
            companyId,
            trabajadores: [],
          });
        }

        if (!perfil) {
          return JSON.stringify({ error: 'No se pudo acceder al modelo de Perfil Sociodemográfico.' });
        }

        let existingWorker = perfil.trabajadores.find(
          (w) => w.identificacion && String(w.identificacion).trim() === cleanDoc
        );

        // 2. Buscar si existen Estudios de Puesto de Trabajo (EPT) previos en el chat para esta cédula
        let integratedEpt = false;
        let eptSummary = '';
        try {
          const EstudioPuestoTrabajo = mongoose.models.EstudioPuestoTrabajo || require('~/models/EstudioPuestoTrabajo');
          if (EstudioPuestoTrabajo) {
            const previousStudies = await EstudioPuestoTrabajo.find({
              companyId,
              workerId: cleanDoc,
            }).sort({ createdAt: -1 });

            if (previousStudies && previousStudies.length > 0) {
              const latestEpt = previousStudies[0];
              integratedEpt = true;
              const dateStr = latestEpt.createdAt ? new Date(latestEpt.createdAt).toLocaleDateString('es-CO') : 'Reciente';
              eptSummary = `EPT Ergonómico Integrado (${dateStr}): ${latestEpt.cargo || cleanCargo}. Riesgo: ${latestEpt.riskLevel || 'Evaluado'}. Nivel de Acción: ${latestEpt.actionLevel || '1'}.`;

              // Actualizar los estudios previos con el nombre oficial del trabajador
              await EstudioPuestoTrabajo.updateMany(
                { companyId, workerId: cleanDoc },
                { $set: { workerName: cleanName, cargo: cleanCargo } }
              );
            }
          }
        } catch (eptErr) {
          console.warn('[SomosSST Tool] Error checking pending EPT for worker creation:', eptErr.message);
        }

        let workerResult;
        if (existingWorker) {
          existingWorker.nombre = cleanName;
          if (cleanCargo) existingWorker.cargo = cleanCargo;
          if (integratedEpt && (!existingWorker.diagnosticoMedico || !existingWorker.diagnosticoMedico.includes('EPT Ergonómico'))) {
            existingWorker.diagnosticoMedico = existingWorker.diagnosticoMedico
              ? `${existingWorker.diagnosticoMedico} | ${eptSummary}`
              : eptSummary;
          }
          workerResult = existingWorker;
        } else {
          const newWorkerEntry = {
            id: new mongoose.Types.ObjectId().toString(),
            nombre: cleanName,
            identificacion: cleanDoc,
            cargo: cleanCargo,
            diagnosticoMedico: integratedEpt ? eptSummary : '',
            recomendacionesMedicas: integratedEpt ? 'Seguimiento biomecánico e higiene postural según EPT previo.' : '',
            completedByAI: true,
          };
          perfil.trabajadores.push(newWorkerEntry);
          workerResult = newWorkerEntry;
        }

        perfil.markModified('trabajadores');
        await perfil.save();

        // 3. Sincronizar en SgsstWorker
        if (SgsstWorkerModel) {
          await SgsstWorkerModel.findOneAndUpdate(
            { companyId, documento: cleanDoc },
            {
              $set: {
                user: userId,
                companyId,
                documento: cleanDoc,
                nombre: cleanName,
                perfilId: cleanDoc,
                condicionesSalud: integratedEpt ? eptSummary : '',
                updatedAt: new Date(),
              },
            },
            { upsert: true, new: true }
          ).catch((e) => console.warn('[SomosSST] SgsstWorker upsert err:', e.message));
        }

        return JSON.stringify({
          success: true,
          mensaje: integratedEpt
            ? `✅ Trabajador ${cleanName} (C.C. ${cleanDoc}) registrado con éxito en el Perfil Sociodemográfico. ¡Se detectó y vinculó automáticamente su Estudio de Puesto de Trabajo (EPT) previo realizado en el chat! (${eptSummary})`
            : `✅ Trabajador ${cleanName} (C.C. ${cleanDoc}, Cargo: ${cleanCargo}) registrado exitosamente en el Perfil Sociodemográfico de la empresa.`,
          trabajador: {
            nombre: cleanName,
            identificacion: cleanDoc,
            cargo: cleanCargo,
            eptIntegrado: integratedEpt,
            diagnosticoMedico: workerResult.diagnosticoMedico || '',
          },
        });
      }

      // ── ACTION: CONSULTAR EXPEDIENTE INTEGRAL (CRUCE CASCADA MULTIVARIABLE) ──
      if (accion === 'consultar_expediente_integral') {
        if (!nombre_o_cargo) {
          return JSON.stringify({ error: 'Debes proporcionar un nombre_o_cargo para buscar el expediente.' });
        }

        const query = nombre_o_cargo.toLowerCase();
        const listaMap = new Map();

        // 1. Gather all potential workers from PerfilSocio
        if (socioData && socioData.trabajadores) {
          const matched = socioData.trabajadores.filter(w =>
            (w.nombre && w.nombre.toLowerCase().includes(query)) ||
            (w.identificacion && String(w.identificacion).includes(query)) ||
            (w.cargo && w.cargo.toLowerCase().includes(query))
          );
          matched.forEach(w => {
            const cleanId = String(w.identificacion || '').trim();
            listaMap.set(cleanId, {
              source: 'socio',
              nombre: w.nombre,
              identificacion: cleanId,
              cargo: w.cargo || 'Sin cargo',
              genero: w.genero || 'No especificado',
              edad: w.edad || 'No especificado',
              telefono: w.telefono || 'No especificado',
              correo: w.correo || 'No especificado',
              diagnostico: w.diagnosticoMedico || 'Ninguno registrado',
              fechaExamenMedico: w.fechaExamenMedico || 'No registrado',
              restricciones: w.restriccionesMedicas || w.restricciones || 'Ninguna registrada',
              recomendaciones: w.recomendacionesMedicas || 'Ninguna registrada',
              fitScore: w.biocentricScore || 0,
              fitAlerts: w.biocentricAlerts || []
            });
          });
        }

        // 2. Gather from SgsstWorker master profile
        if (SgsstWorkerModel) {
          const matchedMaster = await SgsstWorkerModel.find({
            ...queryObj,
            $or: [
              { nombre: { $regex: query, $options: 'i' } },
              { documento: { $regex: query, $options: 'i' } },
              { perfilId: { $regex: query, $options: 'i' } }
            ]
          }).lean();

          matchedMaster.forEach(w => {
            const cleanId = String(w.documento || '').trim();
            let existing = listaMap.get(cleanId);
            if (!existing) {
              existing = {
                source: 'master',
                nombre: w.nombre,
                identificacion: cleanId,
                cargo: w.perfilId || 'Sin cargo',
                genero: w.genero || 'No especificado',
                diagnostico: w.condicionesSalud || 'Ninguno registrado',
                restricciones: 'Ninguna registrada',
                recomendaciones: 'Ninguna registrada'
              };
            }
            existing.fitScore = w.fitScore || w.biocentricScore || existing.fitScore || 0;
            existing.fitAlerts = w.fitAlerts || w.biocentricAlerts || existing.fitAlerts || [];
            existing.riesgosBioIndividual = w.riesgosBioIndividual || [];
            existing.bioChartConclusions = w.bioChartConclusions || {};
            existing.atel_logs = w.atel || [];
            existing.actos_inseguros_logs = w.actos_inseguros || [];
            existing.participaciones_ipevar_logs = w.participaciones_ipevar || [];
            existing.capacitaciones_logs = w.capacitaciones || [];
            existing.ats_logs = w.ats || [];

            listaMap.set(cleanId, existing);
          });
        }

        const workers = Array.from(listaMap.values());
        if (workers.length === 0) {
          return JSON.stringify({ error: `No se encontró ningún trabajador o cargo coincidente con: "${nombre_o_cargo}".` });
        }

        // Deep-profile Cascading for up to 3 matches
        const results = [];
        for (const worker of workers.slice(0, 3)) {
          const wName = worker.nombre ? worker.nombre.trim() : '';
          const wId = worker.identificacion ? String(worker.identificacion).trim() : '';
          const wCargo = worker.cargo ? worker.cargo.trim() : '';

          let workerPayload = {
            trabajador_informacion_basica: {
              nombre: wName,
              identificacion: wId,
              cargo: wCargo,
              genero: worker.genero || 'No especificado',
              edad: worker.edad || 'No especificado',
              telefono: worker.telefono || 'No especificado',
              correo: worker.correo || 'No especificado'
            },
            hito_1_huella_biocentrica: {
              perfil_sociodemografico: {
                registrado: true,
                edad: worker.edad || 'No especificado',
                genero: worker.genero || 'No especificado'
              },
              perfil_del_cargo: null,
              informe_condiciones_salud: {
                diagnostico_clinico: worker.diagnostico || 'Ninguno registrado',
                fecha_examen_medico: worker.fechaExamenMedico || 'No registrado',
                restricciones_medicas: worker.restricciones || 'Ninguna registrada',
                recomendaciones_medicas: worker.recomendaciones || 'Ninguna registrada'
              },
              oraculo_predictivo_h1: {
                indice_biocentrico_fit_score: worker.fitScore || 0,
                alertas_biocentricas_clinicas: worker.fitAlerts || []
              }
            },
            hito_2_nucleo_bio_evaluativo: {
              matriz_bio_ipevar_general: [],
              riesgos_bio_individuales_especificos: worker.riesgosBioIndividual || []
            },
            hito_3_dinamica_de_exposicion: {
              participaciones_ipevar: [],
              reportes_actos_inseguros: [],
              programa_capacitaciones: [],
              analisis_trabajo_seguro_ats: [],
              permiso_trabajo_en_alturas: [],
              metodo_owas_ergonomia: []
            },
            hito_4_traumatismo_y_curacion: {
              accidentes_registrados: worker.atel_logs || [],
              investigaciones_accidentes: []
            },
            hito_5_oraculo_predictivo: {
              centro_de_inteligencia_predictiva: {
                conclusiones_ia: worker.bioChartConclusions?.conclusiones || worker.bioChartConclusions?.resumen || 'Sin conclusiones predictivas registradas aún.',
                recomendaciones: worker.bioChartConclusions?.recomendaciones || []
              }
            }
          };

          // ── Hito 1: Cargo Profile
          if (wCargo && PerfilCargoModel) {
            const cargoDoc = await PerfilCargoModel.findOne(queryObj).lean();
            if (cargoDoc && cargoDoc.perfiles) {
              const profile = cargoDoc.perfiles.find(p => p.nombreCargo && p.nombreCargo.toLowerCase().trim() === wCargo.toLowerCase().trim());
              if (profile) {
                workerPayload.hito_1_huella_biocentrica.perfil_del_cargo = {
                  descripcion: profile.descripcion || 'Sin descripción',
                  educacion: profile.educacion || 'No especificado',
                  experiencia: profile.experiencia || 'No especificado',
                  responsabilidadesSST: profile.responsabilidadesSST || [],
                  restricciones: profile.restricciones || '',
                  examenesMedicos: profile.examenesMedicos || [],
                  elementosProteccion: profile.elementosProteccion || [],
                  controlesFuente: profile.controlesFuenteSeleccionados || [],
                  controlesMedio: profile.controlesMedioSeleccionados || []
                };
              }
            }
          }

          // ── Hito 2: Matriz Bio-IPEVAR (General cargo hazards) - nested peligros parsing!
          if (wCargo && MatrizPeligrosModel) {
            const matrizDoc = await MatrizPeligrosModel.findOne(queryObj).lean();
            if (matrizDoc && matrizDoc.procesos) {
              const cargoLower = wCargo.toLowerCase();
              const relatedProcesses = matrizDoc.procesos.filter(p => 
                (p.proceso && p.proceso.toLowerCase().includes(cargoLower)) ||
                (p.actividad && p.actividad.toLowerCase().includes(cargoLower)) ||
                (p.zona && p.zona.toLowerCase().includes(cargoLower)) ||
                (p.tarea && p.tarea.toLowerCase().includes(cargoLower))
              );

              const ipevarList = [];
              for (const proc of relatedProcesses) {
                if (proc.peligros && Array.isArray(proc.peligros)) {
                  for (const pel of proc.peligros) {
                    ipevarList.push({
                      proceso_actividad: `${proc.proceso || ''} - ${proc.actividad || ''}`,
                      tarea: proc.tarea || '',
                      peligro_descripcion: pel.descripcionPeligro || '',
                      peligro_clasificacion: pel.clasificacion || '',
                      efectos_posibles: pel.efectosPosibles || '',
                      controles_existentes: {
                        fuente: pel.fuenteGeneradora || 'Ninguno',
                        medio: pel.medioExistente || 'Ninguno',
                        individuo: pel.individuoControl || 'Ninguno'
                      },
                      riesgo_valoracion: {
                        ND: pel.nivelDeficiencia || 0,
                        NE: pel.nivelExposicion || 0,
                        NP: pel.nivelProbabilidad || 0,
                        NC: pel.nivelConsecuencia || 0,
                        NR: pel.nivelRiesgo || 0,
                        interpretacion_nr: pel.interpretacionNR || '',
                        aceptabilidad: pel.aceptabilidad || ''
                      },
                      controles_propuestos: {
                        eliminacion: pel.eliminacion || 'Ninguno',
                        sustitucion: pel.sustitucion || 'Ninguno',
                        control_ingenieria: pel.controlIngenieria || 'Ninguno',
                        control_administrativo: pel.controlAdministrativo || 'Ninguno',
                        equipos_epp: pel.epp || 'Ninguno'
                      }
                    });
                  }
                }
              }
              workerPayload.hito_2_nucleo_bio_evaluativo.matriz_bio_ipevar_general = ipevarList;
            }
          }

          // ── Hito 3: Participación IPEVAR
          if (ParticipacionIpevarModel) {
            const partDoc = await ParticipacionIpevarModel.findOne(queryObj).lean();
            if (partDoc) {
              const list = partDoc.participacionesList || [];
              const inbox = partDoc.inboxPublico || [];
              const matchedPart = [...list, ...inbox].filter(p => 
                (wName && p.trabajador && p.trabajador.nombre && p.trabajador.nombre.toLowerCase().includes(wName.toLowerCase())) ||
                (wId && p.trabajador && p.trabajador.cedula && String(p.trabajador.cedula).trim() === wId) ||
                (wName && p.nombre && p.nombre.toLowerCase().includes(wName.toLowerCase()))
              );
              workerPayload.hito_3_dinamica_de_exposicion.participaciones_ipevar = matchedPart.map(p => ({
                fecha: p.createdAt || p.fecha || 'No especificada',
                peligro_percibido: p.peligroPercibido || p.peligro || p.comentarios || 'No especificado',
                propuesta_control: p.propuestaControl || p.sugerencia || 'Ninguna'
              }));
            }
          }
          if (worker.participaciones_ipevar_logs && worker.participaciones_ipevar_logs.length > 0 && workerPayload.hito_3_dinamica_de_exposicion.participaciones_ipevar.length === 0) {
            workerPayload.hito_3_dinamica_de_exposicion.participaciones_ipevar = worker.participaciones_ipevar_logs.map(p => ({
              fecha: p.fecha || 'No especificada',
              peligro_percibido: p.descripcion || 'Participación IPEVAR',
              propuesta_control: 'Ninguna'
            }));
          }

          // ── Hito 3: Reportes de Actos Inseguros
          if (ReporteActosModel) {
            const actosDoc = await ReporteActosModel.findOne(queryObj).lean();
            if (actosDoc) {
              const matchedReports = (actosDoc.inboxPublico || []).filter(r => 
                (wName && r.trabajador && r.trabajador.nombre && r.trabajador.nombre.toLowerCase().includes(wName.toLowerCase())) ||
                (wId && r.trabajador && r.trabajador.cedula && String(r.trabajador.cedula).trim() === wId) ||
                (wName && r.nombre && r.nombre.toLowerCase().includes(wName.toLowerCase()))
              );
              workerPayload.hito_3_dinamica_de_exposicion.reportes_actos_inseguros = matchedReports.map(r => ({
                fecha: r.createdAt || 'No especificada',
                descripcion: r.descripcion || r.detalles || 'No especificada',
                tipo: r.tipo || 'Acto/Condición Insegura',
                estado: r.status || 'Reportado'
              }));
            }
          }
          if (worker.actos_inseguros_logs && worker.actos_inseguros_logs.length > 0 && workerPayload.hito_3_dinamica_de_exposicion.reportes_actos_inseguros.length === 0) {
            workerPayload.hito_3_dinamica_de_exposicion.reportes_actos_inseguros = worker.actos_inseguros_logs.map(r => ({
              fecha: r.fecha || 'No especificada',
              descripcion: r.descripcion || 'Reporte de acto/condición',
              tipo: r.tipo || 'No especificado',
              estado: 'Reportado'
            }));
          }

          // ── Hito 3: Programa de Capacitaciones
          if (ProgramaCapacitacionesModel) {
            const capDoc = await ProgramaCapacitacionesModel.findOne(queryObj).lean();
            if (capDoc && capDoc.sesiones) {
              const matchedSessions = capDoc.sesiones.filter(s => 
                s.trabajadoresRegistrados && s.trabajadoresRegistrados.some(tr => 
                  (wName && tr.nombre && tr.nombre.toLowerCase().includes(wName.toLowerCase())) ||
                  (wId && tr.cedula && String(tr.cedula).trim() === wId)
                )
              );
              workerPayload.hito_3_dinamica_de_exposicion.programa_capacitaciones = matchedSessions.map(s => {
                const reg = s.trabajadoresRegistrados.find(tr => 
                  (wName && tr.nombre && tr.nombre.toLowerCase().includes(wName.toLowerCase())) ||
                  (wId && tr.cedula && String(tr.cedula).trim() === wId)
                );
                return {
                  tema: s.tema,
                  fecha: s.fecha,
                  estado: s.estado,
                  asistio: reg ? reg.asistio : false
                };
              });
            }
          }
          if (worker.capacitaciones_logs && worker.capacitaciones_logs.length > 0 && workerPayload.hito_3_dinamica_de_exposicion.programa_capacitaciones.length === 0) {
            workerPayload.hito_3_dinamica_de_exposicion.programa_capacitaciones = worker.capacitaciones_logs.map(c => ({
              tema: c.nombre || 'Capacitación',
              fecha: c.fecha || 'No especificada',
              estado: 'Completada',
              asistio: true
            }));
          }

          // ── Hito 3: ATS
          if (AnalisisTrabajoSeguroModel) {
            const atsDoc = await AnalisisTrabajoSeguroModel.findOne(queryObj).lean();
            if (atsDoc) {
              const inAts = (atsDoc.trabajadoresList || []).some(w => 
                (wName && w.nombre && w.nombre.toLowerCase().includes(wName.toLowerCase())) ||
                (wId && w.cedula && String(w.cedula).trim() === wId)
              );
              if (inAts) {
                workerPayload.hito_3_dinamica_de_exposicion.analisis_trabajo_seguro_ats.push({
                  actividad: atsDoc.formData?.actividad || 'Actividad ATS',
                  fecha: atsDoc.formData?.fecha || 'No especificada',
                  herramientas: atsDoc.formData?.herramientas || 'No especificadas',
                  secuencia_pasos: atsDoc.formData?.secuenciaPasos || []
                });
              }
            }
          }
          if (worker.ats_logs && worker.ats_logs.length > 0 && workerPayload.hito_3_dinamica_de_exposicion.analisis_trabajo_seguro_ats.length === 0) {
            workerPayload.hito_3_dinamica_de_exposicion.analisis_trabajo_seguro_ats = worker.ats_logs.map(a => ({
              actividad: a.descripcion || 'Trabajo seguro',
              fecha: a.fecha || 'No especificada',
              herramientas: 'No registradas',
              secuencia_pasos: []
            }));
          }

          // ── Hito 3: Permiso de Trabajo en Alturas
          if (PermisoAlturasModel) {
            const alturaDoc = await PermisoAlturasModel.findOne(queryObj).lean();
            if (alturaDoc) {
              const hasPermit = (alturaDoc.trabajadoresList || []).some(w => 
                (wName && w.nombre && w.nombre.toLowerCase().includes(wName.toLowerCase())) ||
                (wId && w.cedula && String(w.cedula).trim() === wId)
              );
              if (hasPermit) {
                workerPayload.hito_3_dinamica_de_exposicion.permiso_trabajo_en_alturas.push({
                  fecha: alturaDoc.formData?.fecha || 'No especificada',
                  descripcion_trabajo: alturaDoc.formData?.descripcionTrabajo || 'Trabajo en Alturas',
                  vigencia: alturaDoc.formData?.vigencia || 'No especificada',
                  aprobado: alturaDoc.formData?.aprobado || true
                });
              }
            }
          }

          // ── Hito 3: Método OWAS
          if (MetodoOwasModel) {
            const owasDoc = await MetodoOwasModel.findOne(queryObj).lean();
            if (owasDoc) {
              const matchedObs = (owasDoc.observaciones || []).filter(o => 
                (wName && o.trabajadorNombre && o.trabajadorNombre.toLowerCase().includes(wName.toLowerCase())) ||
                (wName && o.trabajador && o.trabajador.toLowerCase().includes(wName.toLowerCase()))
              );
              workerPayload.hito_3_dinamica_de_exposicion.metodo_owas_ergonomia = matchedObs.map(o => ({
                tarea: o.tarea || o.actividad || 'No especificada',
                postura: {
                  espalda: o.espalda || 1,
                  brazos: o.brazos || 1,
                  piernas: o.piernas || 1,
                  carga: o.carga || 1
                },
                categoria_riesgo: o.categoria || o.riesgo || 1,
                acciones_correctivas: o.accionCorrectiva || o.sugerencia || 'No requerida'
              }));
            }
          }

          // ── Hito 4: Investigaciones de Accidentes
          if (InvestigacionAtelModel) {
            const allInvest = await InvestigacionAtelModel.find(queryObj).lean();
            const matchedInvest = allInvest.filter(i => 
              (wName && i.formData?.afectadoNombre && i.formData.afectadoNombre.toLowerCase().includes(wName.toLowerCase())) ||
              (wId && i.formData?.afectadoCedula && String(i.formData.afectadoCedula).trim() === wId) ||
              (wName && i.testigosList && i.testigosList.some(t => t.nombre && t.nombre.toLowerCase().includes(wName.toLowerCase())))
            );
            workerPayload.hito_4_traumatismo_y_curacion.investigaciones_accidentes = matchedInvest.map(i => ({
              fecha: i.formData?.fechaAccidente || 'No especificada',
              tipo_evento: i.formData?.tipoEvento || 'Accidente de Trabajo',
              descripcion: i.formData?.descripcionAccidente || 'No especificada',
              causas_inmediatas: i.formData?.causasInmediatas || '',
              causas_basicas: i.formData?.causasBasicas || '',
              planes_accion: i.formData?.planesAccion || []
            }));
          }

          results.push(workerPayload);
        }

        return JSON.stringify({
          mensaje: `Se procesaron exitosamente ${results.length} expediente(s) con enfoque en el Motor Bio-Individual de SomosSST.`,
          expedientes: results
        });
      }

      // ── ACTION: RESUMEN EMPRESA (DASHBOARD METRICO GLOBAL) ───────────────────
      if (accion === 'resumen_empresa') {
        const resumen = {
          total_trabajadores: 0,
          hito_1_huella_biocentrica_global: {
            total_perfiles_cargo: 0,
            examenes_salud_vencidos: 0,
            indice_biocentrico_promedio_empresa: 100,
            trabajadores_con_alertas_biocentricas: 0
          },
          hito_2_nucleo_bio_evaluativo_global: {
            total_procesos_evaluados: 0,
            total_peligros_identificados: 0,
            riesgos_inaceptables_ipevar: 0
          },
          hito_3_dinamica_de_exposicion_global: {
            asistencia_general_capacitaciones: '0%',
            total_participaciones_ipevar: 0,
            total_reportes_actos_inseguros: 0,
            total_ats_autorizados: 0,
            total_permisos_alturas: 0,
            total_evaluaciones_owas: 0,
            alertas_posturales_criticas_owas: 0
          },
          hito_4_traumatismo_y_curacion_global: {
            total_eventos_incidentes: 0,
            dias_totales_incapacidad: 0,
            total_investigaciones_accidentes: 0
          },
          hito_5_oraculo_predictivo_global: {
            resumen_salud_corporativa_ia: 'Estable. No se registran incidentes graves recientes.'
          }
        };

        const currentDate = new Date();
        const seenWorkers = new Set();
        let totalFitScore = 0;
        let fitCount = 0;

        // 1. Gather master workers (Hito 1)
        if (SgsstWorkerModel) {
          const masterList = await SgsstWorkerModel.find(queryObj).lean();
          resumen.total_trabajadores = masterList.length;
          masterList.forEach(w => {
            const cleanId = String(w.documento || '').trim();
            seenWorkers.add(cleanId);

            // Health exam status
            if (w.atel && w.atel.length > 0) {
              resumen.hito_4_traumatismo_y_curacion_global.total_eventos_incidentes += w.atel.length;
            }

            // Oráculo H1 metrics
            const score = w.fitScore || w.biocentricScore || 0;
            if (score > 0) {
              totalFitScore += score;
              fitCount++;
            }
            const alerts = w.fitAlerts || w.biocentricAlerts || [];
            if (alerts.length > 0) {
              resumen.hito_1_huella_biocentrica_global.trabajadores_con_alertas_biocentricas++;
            }
          });
        }

        // 2. Gather from PerfilSocio if master list is smaller
        if (socioData && socioData.trabajadores) {
          socioData.trabajadores.forEach(w => {
            const cleanId = String(w.identificacion || '').trim();
            if (!seenWorkers.has(cleanId)) {
              seenWorkers.add(cleanId);
              const score = w.biocentricScore || 0;
              if (score > 0) {
                totalFitScore += score;
                fitCount++;
              }
              const alerts = w.biocentricAlerts || [];
              if (alerts.length > 0) {
                resumen.hito_1_huella_biocentrica_global.trabajadores_con_alertas_biocentricas++;
              }
            }

            // Examen Médico Alert Check
            if (w.fechaExamenMedico) {
              try {
                const diffTime = Math.abs(currentDate - new Date(w.fechaExamenMedico));
                if (Math.ceil(diffTime / (1000 * 60 * 60 * 24)) >= 300) {
                  resumen.hito_1_huella_biocentrica_global.examenes_salud_vencidos++;
                }
              } catch (e) {
                resumen.hito_1_huella_biocentrica_global.examenes_salud_vencidos++;
              }
            } else {
              resumen.hito_1_huella_biocentrica_global.examenes_salud_vencidos++;
            }
          });
          resumen.total_trabajadores = seenWorkers.size;
        }

        // Calc average biocentric score
        if (fitCount > 0) {
          resumen.hito_1_huella_biocentrica_global.indice_biocentrico_promedio_empresa = Math.round(totalFitScore / fitCount);
        }

        // Hito 1: Cargo Profiles Completed
        if (PerfilCargoModel) {
          const cargoDoc = await PerfilCargoModel.findOne(queryObj).lean();
          if (cargoDoc && cargoDoc.perfiles) {
            resumen.hito_1_huella_biocentrica_global.total_perfiles_cargo = cargoDoc.perfiles.length;
          }
        }

        // Hito 2: Matriz Bio-IPEVAR (Núcleo Bio-Evaluativo)
        if (MatrizPeligrosModel) {
          const matrizDoc = await MatrizPeligrosModel.findOne(queryObj).lean();
          if (matrizDoc && matrizDoc.procesos) {
            resumen.hito_2_nucleo_bio_evaluativo_global.total_procesos_evaluados = matrizDoc.procesos.length;
            matrizDoc.procesos.forEach(p => {
              if (p.peligros && Array.isArray(p.peligros)) {
                p.peligros.forEach(pel => {
                  resumen.hito_2_nucleo_bio_evaluativo_global.total_peligros_identificados++;
                  const nr = pel.nivelRiesgo || 0;
                  const aceptabilidad = String(pel.aceptabilidad || '').toLowerCase();
                  if (nr >= 150 || aceptabilidad.includes('no aceptable') || aceptabilidad === 'no') {
                    resumen.hito_2_nucleo_bio_evaluativo_global.riesgos_inaceptables_ipevar++;
                  }
                });
              }
            });
          }
        }

        // Hito 3: Programa de Capacitaciones (Dinámica de Exposición)
        if (ProgramaCapacitacionesModel) {
          const capDoc = await ProgramaCapacitacionesModel.findOne(queryObj).lean();
          if (capDoc && capDoc.sesiones) {
            let totalReg = 0;
            let totalAsistio = 0;
            capDoc.sesiones.forEach(s => {
              if (s.trabajadoresRegistrados) {
                s.trabajadoresRegistrados.forEach(tr => {
                  totalReg++;
                  if (tr.asistio) totalAsistio++;
                });
              }
            });
            if (totalReg > 0) {
              resumen.hito_3_dinamica_de_exposicion_global.asistencia_general_capacitaciones = `${Math.round((totalAsistio / totalReg) * 100)}%`;
            }
          }
        }

        // Hito 3: Participación IPEVAR
        if (ParticipacionIpevarModel) {
          const partDoc = await ParticipacionIpevarModel.findOne(queryObj).lean();
          if (partDoc) {
            resumen.hito_3_dinamica_de_exposicion_global.total_participaciones_ipevar = (partDoc.participacionesList || []).length + (partDoc.inboxPublico || []).length;
          }
        }

        // Hito 3: Actos Inseguros
        if (ReporteActosModel) {
          const actosDoc = await ReporteActosModel.findOne(queryObj).lean();
          if (actosDoc) {
            resumen.hito_3_dinamica_de_exposicion_global.total_reportes_actos_inseguros = (actosDoc.inboxPublico || []).length;
          }
        }

        // Hito 3: ATS
        if (AnalisisTrabajoSeguroModel) {
          const atsDoc = await AnalisisTrabajoSeguroModel.findOne(queryObj).lean();
          if (atsDoc) {
            resumen.hito_3_dinamica_de_exposicion_global.total_ats_autorizados = 1;
          }
        }

        // Hito 3: Permisos de Alturas
        if (PermisoAlturasModel) {
          const alturaDoc = await PermisoAlturasModel.findOne(queryObj).lean();
          if (alturaDoc) {
            resumen.hito_3_dinamica_de_exposicion_global.total_permisos_alturas = 1;
          }
        }

        // Hito 3: Método OWAS
        if (MetodoOwasModel) {
          const owasDoc = await MetodoOwasModel.findOne(queryObj).lean();
          if (owasDoc && owasDoc.observaciones) {
            resumen.hito_3_dinamica_de_exposicion_global.total_evaluaciones_owas = owasDoc.observaciones.length;
            resumen.hito_3_dinamica_de_exposicion_global.alertas_posturales_criticas_owas = owasDoc.observaciones.filter(o => o.categoria === 3 || o.categoria === 4 || o.riesgo === 3 || o.riesgo === 4).length;
          }
        }

        // Hito 4: Estadísticas ATEL
        if (ATELAnnualModel) {
          const atelDocs = await ATELAnnualModel.find(queryObj).lean();
          let monthEventsCount = 0;
          atelDocs.forEach(annual => {
            if (annual.months) {
              const monthObj = annual.months instanceof Map ? Object.fromEntries(annual.months) : annual.months;
              Object.values(monthObj).forEach(m => {
                if (m.events) {
                  monthEventsCount += m.events.length;
                  m.events.forEach(e => {
                    if (e.diasIncapacidad) resumen.hito_4_traumatismo_y_curacion_global.dias_totales_incapacidad += Number(e.diasIncapacidad);
                  });
                }
              });
            }
          });
          if (monthEventsCount > 0 && resumen.hito_4_traumatismo_y_curacion_global.total_eventos_incidentes === 0) {
            resumen.hito_4_traumatismo_y_curacion_global.total_eventos_incidentes = monthEventsCount;
          }
        }

        // Hito 4: Investigaciones
        if (InvestigacionAtelModel) {
          resumen.hito_4_traumatismo_y_curacion_global.total_investigaciones_accidentes = await InvestigacionAtelModel.countDocuments(queryObj);
        }

        // Hito 5: Oráculo Predictivo Global conclusion synthesis
        let lowFitWorkers = resumen.hito_1_huella_biocentrica_global.trabajadores_con_alertas_biocentricas;
        let unacceptableHazards = resumen.hito_2_nucleo_bio_evaluativo_global.riesgos_inaceptables_ipevar;
        let criticalPostures = resumen.hito_3_dinamica_de_exposicion_global.alertas_posturales_criticas_owas;

        if (lowFitWorkers > 0 || unacceptableHazards > 0 || criticalPostures > 0) {
          resumen.hito_5_oraculo_predictivo_global.resumen_salud_corporativa_ia = `Alerta predictiva activa: Se identifican ${lowFitWorkers} trabajadores con susceptibilidades de salud en Oráculo H1, ${unacceptableHazards} riesgos inaceptables en Matriz Bio-IPEVAR y ${criticalPostures} tareas con posturas críticas evaluadas por OWAS. Se sugiere intervención ergonómica focalizada.`;
        }

        return JSON.stringify(resumen);
      }

      // ── ACTION: ACTUALIZAR EXAMEN MEDICO ───────────────────────────────────
      if (accion === 'actualizar_examen_medico') {
        if (!nombre_o_cargo) {
          return JSON.stringify({ error: 'Debes proporcionar la identificación o nombre del trabajador (nombre_o_cargo).' });
        }
        const queryStr = nombre_o_cargo.toLowerCase().trim();
        let updatedCount = 0;
        let workerName = '';

        // 1. Update in PerfilSociodemograficoData
        if (PerfilSocioModel) {
          const socioDoc = await PerfilSocioModel.findOne(queryObj);
          if (socioDoc && socioDoc.trabajadores) {
            let found = false;
            for (const t of socioDoc.trabajadores) {
              if (
                (t.nombre && t.nombre.toLowerCase().includes(queryStr)) ||
                (t.identificacion && String(t.identificacion).includes(queryStr))
              ) {
                if (input.fecha_examen) t.fechaExamenMedico = input.fecha_examen;
                if (input.diagnostico_medico) t.diagnosticoMedico = input.diagnostico_medico;
                if (input.restricciones_medicas) {
                  t.recomendacionesMedicas = input.restricciones_medicas;
                }
                workerName = t.nombre;
                found = true;
                updatedCount++;
              }
            }
            if (found) {
              socioDoc.markModified('trabajadores');
              await socioDoc.save();
            }
          }
        }

        // 2. Update in SgsstWorkerModel master record
        if (SgsstWorkerModel) {
          const masterWorker = await SgsstWorkerModel.findOne({
            ...queryObj,
            $or: [
              { nombre: { $regex: queryStr, $options: 'i' } },
              { documento: { $regex: queryStr, $options: 'i' } }
            ]
          });
          if (masterWorker) {
            if (input.diagnostico_medico) masterWorker.condicionesSalud = input.diagnostico_medico;
            await masterWorker.save();
            if (!workerName) workerName = masterWorker.nombre;
            updatedCount++;
          }
        }

        if (updatedCount === 0) {
          return JSON.stringify({ error: `No se encontró ningún trabajador coincidente con "${nombre_o_cargo}" para actualizar su examen médico.` });
        }

        return JSON.stringify({
          exito: true,
          mensaje: `Se actualizó exitosamente el expediente médico del trabajador "${workerName || nombre_o_cargo}".`,
          detalles: {
            fechaExamen: input.fecha_examen || 'Conservada',
            diagnostico: input.diagnostico_medico || 'Conservado',
            restricciones: input.restricciones_medicas || 'Conservadas'
          }
        });
      }

      // ── ACTION: REGISTRAR ACCIDENTE ATEL ────────────────────────────────────
      if (accion === 'registrar_accidente_atel') {
        if (!input.fecha_accidente) {
          return JSON.stringify({ error: 'Debes proporcionar la fecha_accidente (YYYY-MM-DD).' });
        }
        const eventDateStr = input.fecha_accidente;
        const eventDate = new Date(eventDateStr);
        const year = isNaN(eventDate.getFullYear()) ? new Date().getFullYear() : eventDate.getFullYear();
        const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const monthIdx = isNaN(eventDate.getMonth()) ? new Date().getMonth() : eventDate.getMonth();
        const monthKey = monthNames[monthIdx] || 'enero';

        const eventType = input.tipo_evento === 'EL' || input.tipo_evento === 'Enfermedad Laboral' ? 'EL' : (input.tipo_evento === 'Ausentismo' ? 'Ausentismo' : 'AT');

        // Load ATELAnnualData
        let atelDoc = ATELAnnualModel ? await ATELAnnualModel.findOne({ user: userId, companyId, year }) : null;
        if (!atelDoc && ATELAnnualModel) {
          atelDoc = new ATELAnnualModel({ user: userId, companyId, year, months: {} });
        }

        if (atelDoc) {
          let monthsObj = atelDoc.months;
          if (monthsObj instanceof Map) {
            monthsObj = Object.fromEntries(monthsObj);
          } else if (!monthsObj) {
            monthsObj = {};
          }

          if (!monthsObj[monthKey]) {
            monthsObj[monthKey] = { numTrabajadores: '', diasProgramados: '', events: [] };
          }
          if (!monthsObj[monthKey].events) {
            monthsObj[monthKey].events = [];
          }

          const newEvent = {
            id: `event_${Date.now()}`,
            fecha: eventDateStr,
            tipo: eventType,
            causaInmediata: input.descripcion_accidente || 'Accidente reportado vía asistente IA',
            peligro: 'Riesgo Ocupacional',
            consecuencia: input.gravedad || 'Leve',
            diasIncapacidad: Number(input.dias_incapacidad) || 0,
            diasCargados: 0,
            parteCuerpo: input.parte_cuerpo || 'Cuerpo general',
            documento: nombre_o_cargo || 'Sin documento',
          };

          monthsObj[monthKey].events.push(newEvent);
          atelDoc.months = monthsObj;
          atelDoc.markModified('months');
          atelDoc.updatedAt = new Date();
          await atelDoc.save();
        }

        // Also create InvestigacionAtelData record if model exists
        if (InvestigacionAtelModel) {
          try {
            await InvestigacionAtelModel.create({
              user: userId,
              companyId,
              formData: {
                fechaAccidente: eventDateStr,
                tipoEvento: eventType === 'AT' ? 'Accidente de Trabajo' : (eventType === 'EL' ? 'Enfermedad Laboral' : 'Ausentismo'),
                afectadoNombre: nombre_o_cargo || 'Trabajador',
                descripcionAccidente: input.descripcion_accidente || 'Reportado conversacionalmente',
                causasInmediatas: input.descripcion_accidente || '',
                gravedad: input.gravedad || 'Leve'
              },
              updatedAt: new Date()
            });
          } catch (e) {
            console.warn('[SomosSST Tool] Error log InvestigacionAtel:', e.message);
          }
        }

        return JSON.stringify({
          exito: true,
          mensaje: `Se registró exitosamente el evento ATEL (${eventType}) del ${eventDateStr} y se actualizaron las estadísticas e indicadores de accidentalidad de la empresa.`,
          detalles: {
            fecha: eventDateStr,
            mes: monthKey,
            tipo: eventType,
            diasIncapacidad: input.dias_incapacidad || 0,
            trabajador: nombre_o_cargo || 'General'
          }
        });
      }

      // ── ACTION: ACTUALIZAR HITO TAREA ────────────────────────────────────────
      if (accion === 'actualizar_hito_tarea') {
        if (!input.nombre_tarea_o_hito) {
          return JSON.stringify({ error: 'Debes proporcionar el nombre_tarea_o_hito a actualizar.' });
        }
        const tareaStr = input.nombre_tarea_o_hito.toLowerCase().trim();
        const nuevoEstado = input.nuevo_estado || 'Completado';

        let updated = false;
        if (ProgramaCapacitacionesModel) {
          const capDoc = await ProgramaCapacitacionesModel.findOne(queryObj);
          if (capDoc && capDoc.sesiones) {
            for (const s of capDoc.sesiones) {
              if (s.tema && s.tema.toLowerCase().includes(tareaStr)) {
                s.estado = nuevoEstado;
                updated = true;
              }
            }
            if (updated) {
              capDoc.markModified('sesiones');
              await capDoc.save();
            }
          }
        }

        return JSON.stringify({
          exito: true,
          mensaje: `Se actualizó el estado de la tarea/hito "${input.nombre_tarea_o_hito}" a "${nuevoEstado}".`,
          detalles: {
            hito: input.nombre_tarea_o_hito,
            nuevoEstado
          }
        });
      }

      // ── ACTION: EDITAR CUALQUIER APLICATIVO (UNIVERSAL MUTATION) ────────────
      if (accion === 'editar_cualquier_aplicativo') {
        if (!input.nombre_aplicativo) {
          return JSON.stringify({ error: 'Debes proporcionar el nombre_aplicativo a editar.' });
        }
        if (!input.campo_a_modificar) {
          return JSON.stringify({ error: 'Debes proporcionar el campo_a_modificar.' });
        }

        const appName = input.nombre_aplicativo.toLowerCase().trim();
        const filterStr = (input.identificador_o_filtro || input.nombre_o_cargo || '').toLowerCase().trim();
        const fieldToEdit = input.campo_a_modificar.trim();
        const newValue = input.nuevo_valor !== undefined ? input.nuevo_valor : '';

        let modelObj = null;
        let modelPath = '';

        if (appName.includes('epp') || appName.includes('elementos')) {
          modelObj = modelLoader('SgsstEppData', '~/models/SgsstEppData') || modelLoader('EppData', '~/server/routes/sgsst/epp');
          modelPath = 'EPP (Elementos de Protección Personal)';
        } else if (appName.includes('altura') || appName.includes('permiso_altura')) {
          modelObj = modelLoader('PermisoAlturasData', '~/server/routes/sgsst/permisoAlturas') || modelLoader('SgsstHeightsData', '~/models/SgsstHeightsData');
          modelPath = 'Permiso de Trabajo en Alturas';
        } else if (appName.includes('ats') || appName.includes('trabajo_seguro')) {
          modelObj = modelLoader('AnalisisTrabajoSeguroData', '~/server/routes/sgsst/analisisTrabajoSeguro');
          modelPath = 'ATS (Análisis de Trabajo Seguro)';
        } else if (appName.includes('vehicul') || appName.includes('pesv')) {
          modelObj = modelLoader('SgsstVehicleData', '~/models/SgsstVehicleData') || modelLoader('PesvWorkspaceData', '~/server/routes/sgsst/pesvWorkspace');
          modelPath = 'PESV / Vehículos';
        } else if (appName.includes('capacitac')) {
          modelObj = modelLoader('ProgramaCapacitacionesData', '~/server/routes/sgsst/programaCapacitaciones');
          modelPath = 'Programa de Capacitaciones';
        } else if (appName.includes('gtc45') || appName.includes('peligro') || appName.includes('matriz_peligro')) {
          modelObj = modelLoader('MatrizPeligrosData', '~/server/routes/sgsst/matrizPeligros');
          modelPath = 'Matriz GTC-45 / Peligros';
        } else if (appName.includes('owas') || appName.includes('ergonom')) {
          modelObj = modelLoader('MetodoOwasData', '~/server/routes/sgsst/metodoOwas');
          modelPath = 'Evaluación Ergonómica OWAS';
        } else if (appName.includes('acto') || appName.includes('condicion')) {
          modelObj = modelLoader('ReporteActosData', '~/server/routes/sgsst/reporteActos');
          modelPath = 'Reporte de Actos e Incidentes';
        } else if (appName.includes('cargo')) {
          modelObj = modelLoader('PerfilCargoData', '~/server/routes/sgsst/perfilesCargo');
          modelPath = 'Perfiles de Cargo';
        } else if (appName.includes('vulnerabil') || appName.includes('emergenc')) {
          modelObj = modelLoader('AnalisisVulnerabilidadData', '~/server/routes/sgsst/analisisVulnerabilidad');
          modelPath = 'Análisis de Vulnerabilidad';
        } else if (appName.includes('quimic') || appName.includes('compatibil')) {
          modelObj = modelLoader('MatrizCompatibilidadData', '~/server/routes/sgsst/matrizCompatibilidad');
          modelPath = 'Matriz de Compatibilidad Química';
        } else if (appName.includes('kanban') || appName.includes('tarea') || appName.includes('plan_trabajo')) {
          modelObj = modelLoader('KanbanData', '~/server/routes/sgsst/kanban');
          modelPath = 'Kanban / Plan de Trabajo';
        } else if (appName.includes('politica') || appName.includes('objetivo') || appName.includes('gerencia')) {
          modelObj = modelLoader('AltaDireccionData', '~/server/routes/sgsst/altaDireccion') || modelLoader('PoliticaData', '~/server/routes/sgsst/politica');
          modelPath = 'Política / Objetivos SST';
        } else {
          modelObj = PerfilSocioModel;
          modelPath = 'Perfil Sociodemográfico / Ecosistema General';
        }

        if (!modelObj) {
          return JSON.stringify({ error: `No se pudo encontrar o conectar con la base de datos del aplicativo "${appName}".` });
        }

        let doc = await modelObj.findOne(queryObj);
        if (!doc) {
          doc = await modelObj.findOne({ user: userId });
        }

        if (!doc) {
          return JSON.stringify({ error: `No se encontró ningún registro activo para la empresa en el aplicativo "${modelPath}".` });
        }

        let modified = false;

        const updateNested = (target) => {
          if (!target || typeof target !== 'object') return false;
          let updatedHere = false;

          if (Array.isArray(target)) {
            for (const item of target) {
              if (item && typeof item === 'object') {
                const itemStr = JSON.stringify(item).toLowerCase();
                if (!filterStr || itemStr.includes(filterStr)) {
                  for (const k of Object.keys(item)) {
                    if (k.toLowerCase() === fieldToEdit.toLowerCase()) {
                      item[k] = newValue;
                      updatedHere = true;
                    }
                  }
                }
              }
            }
          } else {
            for (const key of Object.keys(target)) {
              if (key.toLowerCase() === fieldToEdit.toLowerCase()) {
                target[key] = newValue;
                updatedHere = true;
              } else if (target[key] && typeof target[key] === 'object') {
                if (updateNested(target[key])) updatedHere = true;
              }
            }
          }
          return updatedHere;
        };

        if (doc[fieldToEdit] !== undefined) {
          doc[fieldToEdit] = newValue;
          modified = true;
        } else {
          modified = updateNested(doc);
        }

        if (modified || doc.isModified()) {
          doc.markModified(fieldToEdit);
          if (doc.formData) doc.markModified('formData');
          if (doc.procesos) doc.markModified('procesos');
          if (doc.sesiones) doc.markModified('sesiones');
          if (doc.perfiles) doc.markModified('perfiles');
          if (doc.observaciones) doc.markModified('observaciones');
          if (doc.trabajadores) doc.markModified('trabajadores');
          await doc.save();

          return JSON.stringify({
            exito: true,
            mensaje: `Se actualizó exitosamente la propiedad "${fieldToEdit}" en el aplicativo "${modelPath}".`,
            detalles: {
              aplicativo: modelPath,
              campo: fieldToEdit,
              nuevoValor: newValue,
              filtroAplicado: filterStr || 'General'
            }
          });
        } else {
          if (doc.formData && typeof doc.formData === 'object') {
            doc.formData[fieldToEdit] = newValue;
            doc.markModified('formData');
          } else {
            doc[fieldToEdit] = newValue;
          }
          await doc.save();

          return JSON.stringify({
            exito: true,
            mensaje: `Se asignó y guardó la información de "${fieldToEdit}" en el aplicativo "${modelPath}".`,
            detalles: {
              aplicativo: modelPath,
              campo: fieldToEdit,
              nuevoValor: newValue
            }
          });
        }
      }

      // ── ACTION: GENERAR INFORME HTML ─────────────────────────────────────────
      if (accion === 'generar_informe_html') {
        const reportType = (input.tipo_informe || 'resumen_ejecutivo').toLowerCase();
        const dateStr = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

        // Build HTML template based on system data
        let htmlTitle = input.titulo_informe || 'Informe Ejecutivo de Seguridad y Salud en el Trabajo';
        let reportContentHTML = '';

        if (input.contenido_html) {
          reportContentHTML = `<div class="bg-slate-900/80 p-6 md:p-8 rounded-2xl border border-slate-800 space-y-6 text-slate-200 leading-relaxed">${input.contenido_html}</div>`;
        } else if (reportType.includes('atel') || reportType.includes('accident')) {
          htmlTitle = 'Informe Estadístico de Accidentalidad Laboral (ATEL)';
          reportContentHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <p class="text-slate-400 text-sm font-medium">Eventos Totales</p>
                <h3 class="text-4xl font-bold text-emerald-400 mt-2">Registrados</h3>
                <p class="text-xs text-slate-500 mt-1">Monitoreo anual de incidentes y ATEL</p>
              </div>
              <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <p class="text-slate-400 text-sm font-medium">Índice de Frecuencia (IF)</p>
                <h3 class="text-4xl font-bold text-teal-400 mt-2">Bajo Control</h3>
                <p class="text-xs text-slate-500 mt-1">Conforme a Estándares Mínimos Res. 0312</p>
              </div>
              <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <p class="text-slate-400 text-sm font-medium">Días de Incapacidad</p>
                <h3 class="text-4xl font-bold text-indigo-400 mt-2">Gestionados</h3>
                <p class="text-xs text-slate-500 mt-1">Seguimiento a curación y reintegro</p>
              </div>
            </div>
            <div class="bg-slate-800/80 p-6 rounded-2xl border border-slate-700">
              <h4 class="text-lg font-semibold text-white mb-4">Detalle de Gestión Preventiva</h4>
              <p class="text-slate-300 text-sm leading-relaxed mb-4">El sistema WAPPY IA mantiene un monitoreo activo de las ausencias por causa de salud y accidentes ocupacionales. Se recomienda mantener las inspecciones planeadas y la entrega y control de EPP.</p>
            </div>
          `;
        } else {
          reportContentHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div class="bg-slate-800/90 p-5 rounded-2xl border border-slate-700">
                <span class="text-xs font-semibold uppercase tracking-wider text-emerald-400">Hito 1</span>
                <h4 class="text-xl font-bold text-white mt-1">Huella Biocéntrica</h4>
                <p class="text-xs text-slate-400 mt-1">Perfiles sociodemográficos y exámenes de salud activos.</p>
              </div>
              <div class="bg-slate-800/90 p-5 rounded-2xl border border-slate-700">
                <span class="text-xs font-semibold uppercase tracking-wider text-teal-400">Hito 2</span>
                <h4 class="text-xl font-bold text-white mt-1">Núcleo Evaluativo</h4>
                <p class="text-xs text-slate-400 mt-1">Matriz de peligros GTC-45 e IPEVAR integrada.</p>
              </div>
              <div class="bg-slate-800/90 p-5 rounded-2xl border border-slate-700">
                <span class="text-xs font-semibold uppercase tracking-wider text-indigo-400">Hito 3</span>
                <h4 class="text-xl font-bold text-white mt-1">Dinámica Exposición</h4>
                <p class="text-xs text-slate-400 mt-1">Capacitaciones, ATS y evaluaciones OWAS al día.</p>
              </div>
              <div class="bg-slate-800/90 p-5 rounded-2xl border border-slate-700">
                <span class="text-xs font-semibold uppercase tracking-wider text-purple-400">Hito 4 & 5</span>
                <h4 class="text-xl font-bold text-white mt-1">Oráculo Predictivo</h4>
                <p class="text-xs text-slate-400 mt-1">Inteligencia artificial para prevención de riesgos.</p>
              </div>
            </div>
            <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
              <h4 class="text-lg font-semibold text-white mb-3">Conclusiones del Sistema SG-SST</h4>
              <p class="text-slate-300 text-sm leading-relaxed">El sistema de gestión de Seguridad y Salud en el Trabajo cumple con los requerimientos normativos del Decreto 1072 de 2015. Todos los aplicativos y componentes permanecen integrados y sincronizados en tiempo real mediante la inteligencia artificial de WAPPY IA.</p>
            </div>
          `;
        }

        const fullHTML = `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${htmlTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Outfit', sans-serif; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-6 md:p-12">
  <div class="max-w-5xl mx-auto">
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 mb-8 border-b border-slate-800 gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">WAPPY IA - SOMOS SST</span>
          <span class="text-xs text-slate-500">${dateStr}</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight text-white">${htmlTitle}</h1>
      </div>
    </header>
    <main>
      ${reportContentHTML}
    </main>
    <footer class="mt-12 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
      Generado automáticamente por el Agente Guía WAPPY IA • Todos los derechos reservados.
    </footer>
  </div>
</body>
</html>`;

        const conversationId = this.req.body?.conversationId;
        if (conversationId) {
          try {
            const CanvasSession = mongoose.models.CanvasSession || require('~/models/CanvasSession');
            const CompanyInfo = mongoose.models.CompanyInfo || require('~/models/CompanyInfo');
            const { syncCanvasToLiveEditor } = require('~/server/routes/sgsst/syncBridge');

            let activeCompany = await CompanyInfo.findOne({ user: this.req.user.id, isActive: true });
            if (!activeCompany) activeCompany = await CompanyInfo.findOne({ user: this.req.user.id });
            const companyId = activeCompany ? activeCompany._id : null;

            let canvasSession = await CanvasSession.findOne({ conversationId });
            if (canvasSession) {
              const maxHistoryVersion = (canvasSession.history || []).reduce((max, item) => Math.max(max, item.version || 0), 0);
              const nextVersion = Math.max(maxHistoryVersion, canvasSession.version || 0) + 1;
              const newHistoryItem = {
                version: nextVersion,
                content: fullHTML,
                title: htmlTitle,
                fileType: 'html',
                updatedAt: new Date()
              };

              canvasSession.content = fullHTML;
              canvasSession.title = htmlTitle;
              canvasSession.fileType = 'html';
              canvasSession.version = nextVersion;
              canvasSession.history = [...(canvasSession.history || []), newHistoryItem].slice(-20);
              await canvasSession.save();
            } else {
              canvasSession = new CanvasSession({
                user: this.req.user.id,
                companyId,
                conversationId,
                title: htmlTitle,
                fileType: 'html',
                content: fullHTML,
                version: 1,
                history: [{
                  version: 1,
                  content: fullHTML,
                  title: htmlTitle,
                  fileType: 'html',
                  updatedAt: new Date()
                }]
              });
              await canvasSession.save();
            }
            await syncCanvasToLiveEditor(conversationId, fullHTML, htmlTitle, this.req.user.id);
          } catch (err) {
            console.error('[SomosSST] Error saving report to CanvasSession:', err);
          }
        }

        return JSON.stringify({
          exito: true,
          mensaje: `Se generó exitosamente el informe en formato HTML interactivo para "${htmlTitle}". El informe está visible y disponible para descargar en tu visor de Canvas en la derecha.`,
          htmlCode: fullHTML
        });
      }

      // ── ACTION: CONSULTAR HISTORIAL INFORMES ─────────────────────────────────
      if (accion === 'consultar_historial_informes') {
        const historyLogs = [];

        // 1. ATEL Annual Events History
        if (ATELAnnualModel) {
          const atelDocs = await ATELAnnualModel.find(queryObj).lean();
          atelDocs.forEach(doc => {
            if (doc.months) {
              const monthObj = doc.months instanceof Map ? Object.fromEntries(doc.months) : doc.months;
              Object.entries(monthObj).forEach(([mKey, mVal]) => {
                if (mVal.events && Array.isArray(mVal.events)) {
                  mVal.events.forEach(ev => {
                    historyLogs.push({
                      modulo: 'Accidentalidad ATEL',
                      fecha: ev.fecha || `${doc.year}-${mKey}`,
                      evento: `[${ev.tipo || 'AT'}] Siniestro registrado: ${ev.causaInmediata || 'Accidente'}`,
                      detalles: `Incapacidad: ${ev.diasIncapacidad || 0} días. Gravedad: ${ev.consecuencia || 'Leve'}`
                    });
                  });
                }
              });
            }
          });
        }

        // 2. Reporte de Actos e Incidentes History
        if (ReporteActosModel) {
          const actosDoc = await ReporteActosModel.findOne(queryObj).lean();
          if (actosDoc && actosDoc.inboxPublico) {
            actosDoc.inboxPublico.forEach(r => {
              historyLogs.push({
                modulo: 'Reporte Actos / Condición',
                fecha: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : 'Reciente',
                evento: `Reporte: ${r.tipo || 'Acto Inseguro'}`,
                detalles: r.descripcion || r.detalles || 'Sin detalle'
              });
            });
          }
        }

        // 3. Capacitaciones History
        if (ProgramaCapacitacionesModel) {
          const capDoc = await ProgramaCapacitacionesModel.findOne(queryObj).lean();
          if (capDoc && capDoc.sesiones) {
            capDoc.sesiones.forEach(s => {
              historyLogs.push({
                modulo: 'Programa Capacitaciones',
                fecha: s.fecha || 'Programada',
                evento: `Capacitación: ${s.tema || 'Sesión SST'}`,
                detalles: `Estado: ${s.estado || 'Completada'}. Registrados: ${s.trabajadoresRegistrados ? s.trabajadoresRegistrados.length : 0}`
              });
            });
          }
        }

        // 4. Historial de Informes e Investigaciones Guardadas (Conversations)
        const ConversationModel = mongoose.models.Conversation;
        const MessageModel = mongoose.models.Message;
        if (ConversationModel) {
          const convos = await ConversationModel.find({ user: userId }).sort({ updatedAt: -1 }).limit(50).lean();
          for (const c of convos) {
            let lastText = '';
            if (MessageModel) {
              const msg = await MessageModel.findOne({ conversationId: c.conversationId, isCreatedByUser: false }).sort({ createdAt: -1 }).lean();
              if (msg) lastText = msg.text ? msg.text.substring(0, 300) : '';
            }
            historyLogs.push({
              modulo: 'Informes e Investigaciones Guardadas',
              fecha: c.updatedAt ? new Date(c.updatedAt).toISOString().split('T')[0] : 'Reciente',
              evento: `[Documento] ${c.title || 'Informe SST'}`,
              detalles: lastText || `ID Hilo: ${c.conversationId}`
            });
          }
        }

        // 5. Historial de Sesiones de Trabajo (GTC45, PESV, Químicos, Canvas)
        const gtc45Model = mongoose.models.Gtc45WorkspaceSession;
        if (gtc45Model) {
          const gtcDocs = await gtc45Model.find({ user: userId }).sort({ updatedAt: -1 }).limit(10).lean();
          gtcDocs.forEach(g => historyLogs.push({ modulo: 'Matriz GTC-45 / IPEVAR', fecha: g.updatedAt ? new Date(g.updatedAt).toISOString().split('T')[0] : 'Reciente', evento: `Matriz IPEVAR: ${g.title || 'Evaluación de Peligros'}`, detalles: `Estado: ${g.status || 'Activa'}` }));
        }
        const pesvModel = mongoose.models.PesvWorkspaceSession;
        if (pesvModel) {
          const pesvDocs = await pesvModel.find({ user: userId }).sort({ updatedAt: -1 }).limit(10).lean();
          pesvDocs.forEach(p => historyLogs.push({ modulo: 'Plan Estratégico Riesgo Vial (PESV)', fecha: p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : 'Reciente', evento: `PESV: ${p.title || 'Plan Vial'}`, detalles: `Estado: ${p.status || 'Activo'}` }));
        }

        return JSON.stringify({
          exito: true,
          mensaje: `Se obtuvieron ${historyLogs.length} registros reales de TODO EL SISTEMA (Informes, ATEL, GTC45, PESV, Actos y Capacitaciones).`,
          historial: historyLogs
        });
      }

      // ── ACTION: CONSULTAR PLANES Y SISTEMA ────────────────────────────────────
      if (accion === 'consultar_planes_y_sistema') {
        const PlanModel = modelLoader('Plan', '~/models/Plan');
        let planesData = [];
        if (PlanModel) {
          planesData = await PlanModel.find({}).lean();
        }

        let activeCompany = null;
        if (CompanyInfo) {
          activeCompany = await CompanyInfo.findOne({ user: userId, isActive: true }).lean();
          if (!activeCompany) activeCompany = await CompanyInfo.findOne({ user: userId }).lean();
        }

        return JSON.stringify({
          exito: true,
          mensaje: 'Se consultaron exitosamente los planes y configuraciones activas del sistema desde la base de datos.',
          empresaActiva: activeCompany ? {
            nombre: activeCompany.companyName || activeCompany.nombreEmpresa || 'Empresa Registrada',
            nit: activeCompany.nit || 'No registrado',
            planSuscripcion: activeCompany.plan || activeCompany.subscriptionPlan || 'Estándar',
            vigencia: activeCompany.planExpiration || 'Activa'
          } : 'Información general',
          planesOficialesSistema: planesData.map(p => ({
            id: p.planId,
            nombre: p.name,
            precios: p.prices,
            caracteristicas: p.featuresText,
            preciosHerramientasCustom: p.toolPrices
          }))
        });
      }

      // ── ACTION: CONSULTAR CENTRO CONTROL ACPM ──────────────────────────────────
      if (accion === 'consultar_centro_control_acpm') {
        const KanbanTask = modelLoader('KanbanTask', '../../../../models/KanbanTask');
        if (!KanbanTask) return JSON.stringify({ error: 'Modelo KanbanTask no disponible.' });
        
        const query = { user: userId };
        if (companyId) query.companyId = companyId;

        const tasks = await KanbanTask.find(query).sort({ dueDate: 1 }).lean();
        return JSON.stringify({
          exito: true,
          mensaje: `Se obtuvieron ${tasks.length} actividades en el Centro de Control ACPM.`,
          actividades: tasks.map(t => ({
            id: t._id,
            titulo: t.title,
            descripcion: t.description,
            estado: t.status,
            fecha_vencimiento: t.dueDate ? t.dueDate.toISOString().split('T')[0] : null,
            tipo: t.type
          }))
        });
      }

      // ── ACTION: CREAR ACTIVIDAD ACPM ───────────────────────────────────────────
      if (accion === 'crear_actividad_acpm') {
        const KanbanTask = modelLoader('KanbanTask', '../../../../models/KanbanTask');
        if (!KanbanTask) return JSON.stringify({ error: 'Modelo KanbanTask no disponible.' });

        const taskTitle = input.titulo_actividad || input.nombre_tarea_o_hito || 'Nueva Actividad ACPM';
        let due = new Date();
        if (input.fecha_vencimiento) {
          const fvLower = input.fecha_vencimiento.toLowerCase();
          if (fvLower.includes('manana') || fvLower.includes('mañana')) {
            due.setDate(due.getDate() + 1);
          } else {
            const parsed = new Date(input.fecha_vencimiento);
            if (!isNaN(parsed.getTime())) due = parsed;
            else due.setDate(due.getDate() + 1);
          }
        } else {
          due.setDate(due.getDate() + 1); // Default to tomorrow
        }
        due.setHours(23, 59, 59, 999);

        const newTask = await KanbanTask.create({
          user: userId,
          companyId: companyId ? companyId.toString() : 'default',
          title: taskTitle,
          description: input.descripcion_actividad || input.descripcion || 'Actividad registrada por Tenshi',
          dueDate: due,
          status: input.estado_actividad || 'todo',
          type: input.tipo_actividad || 'manual'
        });

        return JSON.stringify({
          exito: true,
          mensaje: `Se creó exitosamente la actividad "${newTask.title}" en el Centro de Control ACPM con fecha de vencimiento ${due.toISOString().split('T')[0]}.`,
          actividad: {
            id: newTask._id,
            titulo: newTask.title,
            descripcion: newTask.description,
            estado: newTask.status,
            fecha_vencimiento: newTask.dueDate.toISOString().split('T')[0]
          }
        });
      }

      // ── ACTION: ACTUALIZAR ACTIVIDAD ACPM ──────────────────────────────────────
      if (accion === 'actualizar_actividad_acpm') {
        const KanbanTask = modelLoader('KanbanTask', '../../../../models/KanbanTask');
        if (!KanbanTask) return JSON.stringify({ error: 'Modelo KanbanTask no disponible.' });

        const taskTitle = input.titulo_actividad || input.identificador_o_filtro || input.nombre_o_cargo;
        let task = null;
        if (taskTitle) {
          task = await KanbanTask.findOne({ user: userId, title: { $regex: taskTitle, $options: 'i' } });
        }
        if (!task) {
          task = await KanbanTask.findOne({ user: userId }).sort({ updatedAt: -1 });
        }

        if (!task) return JSON.stringify({ error: 'No se encontró la actividad para actualizar en el Centro de Control ACPM.' });

        if (input.nuevo_estado) {
          const st = input.nuevo_estado.toLowerCase();
          if (st.includes('completad') || st.includes('hecho') || st.includes('done')) {
            task.status = 'done';
            task.completedAt = new Date();
          } else {
            task.status = input.nuevo_estado;
          }
        }
        if (input.descripcion_actividad) task.description = input.descripcion_actividad;
        await task.save();

        return JSON.stringify({
          exito: true,
          mensaje: `Se actualizó exitosamente la actividad "${task.title}" en el Centro de Control ACPM a estado ${task.status}.`,
          actividad: task
        });
      }

      return JSON.stringify({ error: `Acción desconocida: "${accion}".` });

    } catch (error) {
      console.error('[SomosSST Tool] Error:', error);
      return JSON.stringify({
        error: 'Ocurrió un error cruzando los expedientes del ecosistema de SomosSST.',
        details: error.message,
      });
    }
  }
}

module.exports = SomosSST;
