import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface LicenciaConduccionItem {
  id?: string;
  categoria: string;
  numero?: string;
  fechaVencimiento: string;
}

export interface ExportWorkerEntry {
  nombre?: string;
  identificacion?: string;
  edad?: number | string;
  genero?: string;
  estadoCivil?: string;
  nivelEscolaridad?: string;
  direccion?: string;
  telefono?: string;
  cargo?: string;
  fechaNacimiento?: string;
  lugarNacimiento?: string;
  barrio?: string;
  municipioDomicilio?: string;
  correoElectronico?: string;
  deporte?: string;
  alimentacion?: string;
  riesgoCardiovascular?: string;
  emergenciaContacto?: string;
  tipoSangre?: string;
  personasCargo?: number | string;
  estrato?: string;
  vivienda?: string;
  fechaExamenMedico?: string;
  fechaCursoAlturasAutorizado?: string;
  fechaCursoAlturasCoordinador?: string;
  diagnosticoMedico?: string;
  recomendacionesMedicas?: string;
  enfermedades?: string;
  medicamentos?: string;
  fuma?: string;
  alcohol?: string;
  terapiaPsicologica?: string;
  fechaSeguimiento?: string;
  soatVencimiento?: string;
  tecnicomecanicaVencimiento?: string;
  licenciaConduccion?: string;
  licenciaConduccionVencimiento?: string;
  licenciasConduccion?: LicenciaConduccionItem[];
  licenciaSST?: string;
  licenciaVencimiento?: string;
  curso50h?: string;
  curso20h?: string;
  esCopasst?: string;
  esComiteConvivencia?: string;
  esBrigadista?: string;
  esComiteSeguridadVial?: string;
  peso?: string | number;
  talla?: string | number;
  imc?: string | number;
  presionArterial?: string;
  frecuenciaCardiaca?: string;
  limitacionesBiomecanicas?: string;
  alergiasQuimicas?: string;
  consentimientoFirmaDigital?: string;
}

const DEFAULT_CARGOS = [
  'Director de Proyecto / Gerente de Obra',
  'Ingeniero Residente de Estructuras',
  'Inspector SISO / Coordinador SST de Obra',
  'Maestro General de Obra',
  'Oficial de Encofrados y Formaleta',
  'Fierrero / Armador de Acero Estructural',
  'Oficial de Albañilería y Mampostería',
  'Operador de Grúa Torre',
  'Operador de Excavadora y Retroexcavadora',
  'Conductor de Mixer y Volqueta Doble Troque',
  'Soldador Estructural en Alturas (SMAW/MIG)',
  'Electricista de Redes y Acometidas de Obra',
  'Pintor de Fachadas y Trabajos en Suspensión',
  'Oficial de Instalaciones Hidrosanitarias y Redes',
  'Oficial de Acabados, Yeso y Drywall',
  'Topógrafo de Obra Civil',
  'Almacenista de Materiales y Herramientas',
  'Ayudante Práctico de Obra',
  'Conductor',
  'Coordinador SST / HSEQ',
  'Asistente Administrativo',
  'Servicios Generales'
];

export const exportPerfilSociodemograficoToExcel = async (
  trabajadores: ExportWorkerEntry[],
  fileName: string = 'Perfil_Sociodemografico.xlsx',
  cargosList?: string[]
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wappy IA';
  wb.lastModifiedBy = 'Wappy IA';
  wb.created = new Date();
  wb.modified = new Date();

  // ============================================================================
  // HOJA 2: LISTAS DE OPCIONES / PESTAÑA DE RESPUESTAS
  // ============================================================================
  const wsOptions = wb.addWorksheet('Listas de Opciones', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });

  // Catálogos Normalizados
  const listGenero = ['Masculino', 'Femenino', 'Otro'];
  const listEstadoCivil = ['Soltero/a', 'Casado/a', 'Unión Libre', 'Separado/a', 'Viudo/a'];
  const listEscolaridad = [
    'Ninguna',
    'Primaria',
    'Secundaria',
    'Bachiller',
    'Técnico',
    'Tecnólogo',
    'Profesional',
    'Especialización / Postgrado',
    'Maestría',
    'Doctorado'
  ];

  // Consolidar cargos disponibles únicos
  const mergedCargos = Array.from(
    new Set([
      ...(cargosList || []).filter(Boolean),
      ...trabajadores.map(w => w.cargo).filter(Boolean) as string[],
      ...DEFAULT_CARGOS
    ])
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const listDeporte = ['No realiza', '1-2 veces por semana', '3+ veces por semana'];
  const listAlimentacion = ['Balanceada', 'Alta en grasas/azúcares', 'Vegetariana/Vegana'];
  const listFuma = ['No', 'Sí, ocasional', 'Sí, diario'];
  const listAlcohol = ['No', 'Sí (Social)', 'Sí (Frecuente)'];
  const listTerapia = ['No', 'Sí', 'Anteriormente'];
  const listEstrato = ['1', '2', '3', '4', '5', '6'];
  const listVivienda = ['Propia', 'Arrendada', 'Familiar'];
  const listSangre = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
  const listRiesgoCardio = ['Bajo', 'Medio', 'Alto'];
  const listDiagnostico = [
    'Apto / Sin Hallazgos / Ninguno',
    'Espalda: Lumbalgia / Cervicalgia / Hernias',
    'M. Superiores: Túnel carpiano / Epicondilitis / Manguito',
    'Vicios de refracción',
    'Hipoacusia',
    'Otros Clínicos'
  ];
  const listCategoriasLicencia = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
  const listSiNo = ['Sí', 'No'];

  const optionsHeaders = [
    { header: 'Género', key: 'genero', width: 16, data: listGenero },
    { header: 'Estado Civil', key: 'estadoCivil', width: 18, data: listEstadoCivil },
    { header: 'Nivel Escolaridad', key: 'nivelEscolaridad', width: 28, data: listEscolaridad },
    { header: 'Cargos Disponibles', key: 'cargos', width: 45, data: mergedCargos },
    { header: 'Deporte / Actividad', key: 'deporte', width: 24, data: listDeporte },
    { header: 'Alimentación', key: 'alimentacion', width: 26, data: listAlimentacion },
    { header: 'Fuma', key: 'fuma', width: 16, data: listFuma },
    { header: 'Alcohol', key: 'alcohol', width: 18, data: listAlcohol },
    { header: 'Acompañ. Psicológico', key: 'terapia', width: 24, data: listTerapia },
    { header: 'Estrato', key: 'estrato', width: 12, data: listEstrato },
    { header: 'Tipo Vivienda', key: 'vivienda', width: 18, data: listVivienda },
    { header: 'Tipo Sangre', key: 'tipoSangre', width: 14, data: listSangre },
    { header: 'Riesgo Cardiovascular', key: 'riesgoCardio', width: 22, data: listRiesgoCardio },
    { header: 'Diagnóstico Ocupacional', key: 'diagnostico', width: 45, data: listDiagnostico },
    { header: 'Cat. Licencia Conducción', key: 'catLicencia', width: 24, data: listCategoriasLicencia },
    { header: 'Opciones Sí / No', key: 'sino', width: 16, data: listSiNo }
  ];

  wsOptions.columns = optionsHeaders.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width
  }));

  // Estilo Header de Opciones
  const optHeaderRow = wsOptions.getRow(1);
  optHeaderRow.height = 32;
  optHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Segoe UI' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF042F2E' } },
      left: { style: 'thin', color: { argb: 'FF042F2E' } },
      bottom: { style: 'medium', color: { argb: 'FF042F2E' } },
      right: { style: 'thin', color: { argb: 'FF042F2E' } }
    };
  });

  // Llenar datos de opciones por filas
  const maxOptionItems = Math.max(...optionsHeaders.map(h => h.data.length));
  for (let r = 0; r < maxOptionItems; r++) {
    const rowValues: Record<string, string> = {};
    optionsHeaders.forEach(col => {
      rowValues[col.key] = col.data[r] || '';
    });
    const addedRow = wsOptions.addRow(rowValues);
    addedRow.height = 20;
    const isEven = (r + 2) % 2 === 0;
    addedRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }

  // ============================================================================
  // HOJA 1: TRABAJADORES (PERFIL SOCIODEMOGRÁFICO Y CONDICIONES DE SALUD)
  // ============================================================================
  const ws = wb.addWorksheet('Trabajadores', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });

  ws.columns = [
    { header: 'Nombre', key: 'nombre', width: 28 },
    { header: 'Identificación', key: 'identificacion', width: 18 },
    { header: 'Edad', key: 'edad', width: 10 },
    { header: 'Género', key: 'genero', width: 16 },
    { header: 'Estado Civil', key: 'estadoCivil', width: 18 },
    { header: 'Nivel Escolaridad', key: 'nivelEscolaridad', width: 22 },
    { header: 'Dirección', key: 'direccion', width: 26 },
    { header: 'Teléfono', key: 'telefono', width: 18 },
    { header: 'Cargo', key: 'cargo', width: 32 },
    { header: 'Fecha de Nacimiento', key: 'fechaNacimiento', width: 20 },
    { header: 'Lugar de Nacimiento', key: 'lugarNacimiento', width: 22 },
    { header: 'Barrio', key: 'barrio', width: 20 },
    { header: 'Municipio', key: 'municipioDomicilio', width: 20 },
    { header: 'Correo Electrónico', key: 'correoElectronico', width: 28 },
    { header: 'Deporte / Actividad Física', key: 'deporte', width: 24 },
    { header: 'Calidad de Alimentación', key: 'alimentacion', width: 24 },
    { header: 'Riesgo Cardiovascular', key: 'riesgoCardiovascular', width: 22 },
    { header: 'Contacto de Emergencia', key: 'emergenciaContacto', width: 24 },
    { header: 'Tipo de Sangre', key: 'tipoSangre', width: 16 },
    { header: 'Personas a Cargo', key: 'personasCargo', width: 18 },
    { header: 'Estrato', key: 'estrato', width: 12 },
    { header: 'Tipo de Vivienda', key: 'vivienda', width: 18 },
    { header: 'Fecha Examen Médico', key: 'fechaExamenMedico', width: 22 },
    { header: 'Curso Alturas Autorizado', key: 'fechaCursoAlturasAutorizado', width: 24 },
    { header: 'Curso Alturas Coordinador', key: 'fechaCursoAlturasCoordinador', width: 24 },
    { header: 'Diagnóstico Médico', key: 'diagnosticoMedico', width: 32 },
    { header: 'Recomendaciones Medicas', key: 'recomendacionesMedicas', width: 32 },
    { header: 'Enfermedades Actuales', key: 'enfermedades', width: 28 },
    { header: 'Medicamentos', key: 'medicamentos', width: 24 },
    { header: 'Fuma', key: 'fuma', width: 16 },
    { header: 'Alcohol', key: 'alcohol', width: 18 },
    { header: 'Terapia Psicológica', key: 'terapiaPsicologica', width: 20 },
    { header: 'Fecha Seguimiento', key: 'fechaSeguimiento', width: 20 },
    { header: 'Vencimiento SOAT', key: 'soatVencimiento', width: 20 },
    { header: 'Vencimiento Tecnicomecánica', key: 'tecnicomecanicaVencimiento', width: 26 },
    { header: 'Licencia(s) Conducción', key: 'licenciaConduccion', width: 30 },
    { header: 'Vencimiento(s) Licencia', key: 'licenciaConduccionVencimiento', width: 32 },
    { header: 'N° Licencia SGSST', key: 'licenciaSST', width: 20 },
    { header: 'Venc. Licencia SGSST', key: 'licenciaVencimiento', width: 22 },
    { header: 'Curso 50h', key: 'curso50h', width: 14 },
    { header: 'Curso 20h', key: 'curso20h', width: 14 },
    { header: 'COPASST', key: 'esCopasst', width: 14 },
    { header: 'Comité Convivencia', key: 'esComiteConvivencia', width: 20 },
    { header: 'Brigadista', key: 'esBrigadista', width: 14 },
    { header: 'Comité Seg. Vial', key: 'esComiteSeguridadVial', width: 18 },
    { header: 'Peso (kg)', key: 'peso', width: 14 },
    { header: 'Talla (m)', key: 'talla', width: 14 },
    { header: 'IMC', key: 'imc', width: 12 },
    { header: 'Presión Arterial', key: 'presionArterial', width: 18 },
    { header: 'Frecuencia Cardíaca', key: 'frecuenciaCardiaca', width: 20 },
    { header: 'Limitaciones Biomecánicas', key: 'limitacionesBiomecanicas', width: 28 },
    { header: 'Alergias / Sensibilidad Química', key: 'alergiasQuimicas', width: 30 },
    { header: 'Consentimiento Firma', key: 'consentimientoFirmaDigital', width: 22 }
  ];

  const totalRows = trabajadores.length > 0 ? trabajadores.length + 1 : 2;
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: totalRows, column: ws.columns.length }
  };

  const headerRow = ws.getRow(1);
  headerRow.height = 36;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF042F2E' } },
      left: { style: 'thin', color: { argb: 'FF042F2E' } },
      bottom: { style: 'medium', color: { argb: 'FF042F2E' } },
      right: { style: 'thin', color: { argb: 'FF042F2E' } }
    };
  });

  const formatLicensesText = (w: ExportWorkerEntry): { licenciaStr: string; vencimientoStr: string } => {
    if (w.licenciasConduccion && w.licenciasConduccion.length > 0) {
      const licText = w.licenciasConduccion
        .map(l => `${l.categoria}${l.numero ? ` (N° ${l.numero})` : ''}`)
        .join(', ');
      const vencText = w.licenciasConduccion
        .map(l => `${l.categoria}: ${l.fechaVencimiento || 'Sin fecha'}`)
        .join(' | ');
      return { licenciaStr: licText, vencimientoStr: vencText };
    }
    return {
      licenciaStr: w.licenciaConduccion || '',
      vencimientoStr: w.licenciaConduccionVencimiento || ''
    };
  };

  // Agregar filas con datos de trabajadores
  trabajadores.forEach((w, index) => {
    const rowNumber = index + 2;
    const { licenciaStr, vencimientoStr } = formatLicensesText(w);

    const addedRow = ws.addRow({
      nombre: w.nombre || '',
      identificacion: w.identificacion || '',
      edad: w.edad ?? '',
      genero: w.genero || '',
      estadoCivil: w.estadoCivil || '',
      nivelEscolaridad: w.nivelEscolaridad || '',
      direccion: w.direccion || '',
      telefono: w.telefono || '',
      cargo: w.cargo || '',
      fechaNacimiento: w.fechaNacimiento || '',
      lugarNacimiento: w.lugarNacimiento || '',
      barrio: w.barrio || '',
      municipioDomicilio: w.municipioDomicilio || '',
      correoElectronico: w.correoElectronico || '',
      deporte: w.deporte || '',
      alimentacion: w.alimentacion || '',
      riesgoCardiovascular: w.riesgoCardiovascular || '',
      emergenciaContacto: w.emergenciaContacto || '',
      tipoSangre: w.tipoSangre || '',
      personasCargo: w.personasCargo ?? '',
      estrato: w.estrato || '',
      vivienda: w.vivienda || '',
      fechaExamenMedico: w.fechaExamenMedico || '',
      fechaCursoAlturasAutorizado: w.fechaCursoAlturasAutorizado || '',
      fechaCursoAlturasCoordinador: w.fechaCursoAlturasCoordinador || '',
      diagnosticoMedico: w.diagnosticoMedico || '',
      recomendacionesMedicas: w.recomendacionesMedicas || '',
      enfermedades: w.enfermedades || '',
      medicamentos: w.medicamentos || '',
      fuma: w.fuma || '',
      alcohol: w.alcohol || '',
      terapiaPsicologica: w.terapiaPsicologica || '',
      fechaSeguimiento: w.fechaSeguimiento || '',
      soatVencimiento: w.soatVencimiento || '',
      tecnicomecanicaVencimiento: w.tecnicomecanicaVencimiento || '',
      licenciaConduccion: licenciaStr,
      licenciaConduccionVencimiento: vencimientoStr,
      licenciaSST: w.licenciaSST || '',
      licenciaVencimiento: w.licenciaVencimiento || '',
      curso50h: w.curso50h || '',
      curso20h: w.curso20h || '',
      esCopasst: w.esCopasst || 'No',
      esComiteConvivencia: w.esComiteConvivencia || 'No',
      esBrigadista: w.esBrigadista || 'No',
      esComiteSeguridadVial: w.esComiteSeguridadVial || 'No',
      peso: w.peso || '',
      talla: w.talla || '',
      imc: w.imc || '',
      presionArterial: w.presionArterial || '',
      frecuenciaCardiaca: w.frecuenciaCardiaca || '',
      limitacionesBiomecanicas: w.limitacionesBiomecanicas || '',
      alergiasQuimicas: w.alergiasQuimicas || '',
      consentimientoFirmaDigital: w.consentimientoFirmaDigital || 'No'
    });

    addedRow.height = 24;
    const isEven = rowNumber % 2 === 0;
    const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if ([2, 3, 4, 19, 20, 21, 23, 24, 25, 30, 31, 33, 34, 35, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 53].includes(colNumber)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });
  });

  // ============================================================================
  // VALIDACIÓN DE DATOS (MENÚS DESPLEGABLES) HASTA LA FILA 500
  // ============================================================================
  const maxValidationRows = Math.max(trabajadores.length + 50, 500);

  const validationsMap: Record<string, string> = {
    genero: `'Listas de Opciones'!$A$2:$A$${listGenero.length + 1}`,
    estadoCivil: `'Listas de Opciones'!$B$2:$B$${listEstadoCivil.length + 1}`,
    nivelEscolaridad: `'Listas de Opciones'!$C$2:$C$${listEscolaridad.length + 1}`,
    cargo: `'Listas de Opciones'!$D$2:$D$${mergedCargos.length + 1}`,
    deporte: `'Listas de Opciones'!$E$2:$E$${listDeporte.length + 1}`,
    alimentacion: `'Listas de Opciones'!$F$2:$F$${listAlimentacion.length + 1}`,
    fuma: `'Listas de Opciones'!$G$2:$G$${listFuma.length + 1}`,
    alcohol: `'Listas de Opciones'!$H$2:$H$${listAlcohol.length + 1}`,
    terapiaPsicologica: `'Listas de Opciones'!$I$2:$I$${listTerapia.length + 1}`,
    estrato: `'Listas de Opciones'!$J$2:$J$${listEstrato.length + 1}`,
    vivienda: `'Listas de Opciones'!$K$2:$K$${listVivienda.length + 1}`,
    tipoSangre: `'Listas de Opciones'!$L$2:$L$${listSangre.length + 1}`,
    riesgoCardiovascular: `'Listas de Opciones'!$M$2:$M$${listRiesgoCardio.length + 1}`,
    diagnosticoMedico: `'Listas de Opciones'!$N$2:$N$${listDiagnostico.length + 1}`,
    esCopasst: `'Listas de Opciones'!$P$2:$P$${listSiNo.length + 1}`,
    esComiteConvivencia: `'Listas de Opciones'!$P$2:$P$${listSiNo.length + 1}`,
    esBrigadista: `'Listas de Opciones'!$P$2:$P$${listSiNo.length + 1}`,
    esComiteSeguridadVial: `'Listas de Opciones'!$P$2:$P$${listSiNo.length + 1}`,
    consentimientoFirmaDigital: `'Listas de Opciones'!$P$2:$P$${listSiNo.length + 1}`
  };

  for (const [key, formula] of Object.entries(validationsMap)) {
    const col = ws.getColumn(key);
    if (!col || !col.letter) continue;
    const letter = col.letter;

    for (let r = 2; r <= maxValidationRows; r++) {
      const cell = ws.getCell(`${letter}${r}`);
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Valor no estándar',
        error: 'Seleccione una opción válida de la lista desplegable.'
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  saveAs(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
};
