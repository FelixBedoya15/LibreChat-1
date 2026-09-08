import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExportPerfilCargoData {
  nombreCargo?: string;
  area?: string;
  nivelCargo?: string;
  sectorOrganizacion?: string;
  tipoContrato?: string;
  jornada?: string;
  jefeInmediato?: string;
  escalasSalarial?: string;
  numVacantes?: string;
  exigenciaFisica?: string;
  exigenciaMental?: string;
  operaMaquinaria?: string;
  contextoAdicional?: string;
  eppSeleccionados?: string[];
  entrenamientosSeleccionados?: string[];
  controlesFuenteSeleccionados?: string[];
  controlesMedioSeleccionados?: string[];
}

const LIST_NIVEL_CARGO = [
  'Estratégico / Directivo',
  'Táctico / Mando Medio',
  'Profesional / Técnico',
  'Operativo',
  'Auxiliar / Asistencial'
];

const LIST_SECTOR = [
  'Sector privado',
  'Sector público',
  'Mixto'
];

const LIST_VINCULACION = [
  'Contrato laboral a término indefinido',
  'Contrato laboral a término fijo',
  'Contrato laboral por obra o labor',
  'Trabajo ocasional, accidental o transitorio',
  'Trabajador en misión — Empresa de Servicios Temporales',
  'Contrato de aprendizaje',
  'Práctica, pasantía o judicatura',
  'Prestación de servicios — persona natural',
  'Empleado público de carrera administrativa',
  'Empleado público con nombramiento provisional',
  'Empleado público de libre nombramiento y remoción',
  'Empleado público de periodo fijo',
  'Empleado público en planta temporal',
  'Trabajador oficial',
  'Trabajador independiente',
  'Trabajador cooperado',
  'Voluntario',
  'Otro tipo de vinculación'
];

const LIST_JORNADA = [
  'Tiempo completo (8 horas/día)',
  'Medio tiempo (4 horas/día)',
  'Turnos rotativos',
  'Turno nocturno',
  'Jornada flexible'
];

const LIST_EXIGENCIA = ['Baja', 'Media', 'Alta'];
const LIST_SI_NO = ['Sí', 'No'];

const CATALOGO_EPP = [
  'Casco de seguridad (Dieléctrico/Tipo I/II)',
  'Gafas de seguridad (Claras/Oscuras/Antiempañantes)',
  'Protección auditiva (Inserción/Copa)',
  'Mascarilla para material particulado (N95/P100)',
  'Respirador con filtros químicos',
  'Guantes de nitrilo/látex/vaqueta/carnaza',
  'Guantes de protección mecánica/corte',
  'Botas de seguridad con puntera (Dieléctrica)',
  'Overol de trabajo / Chaleco reflectivo',
  'Arnés de cuerpo completo (4 argollas)',
  'Eslinga de posicionamiento / Protección de caídas',
  'Protector solar',
  'Capas impermeables'
];

const CATALOGO_ENTRENAMIENTO = [
  'Inducción y Reinducción en SST',
  'Identificación de Peligros y Riesgos (GTC 45)',
  'Uso y Mantenimiento de EPP',
  'Primeros Auxilios Básicos',
  'Prevención y Control de Incendios (Extintores)',
  'Plan de Emergencias y Evacuación',
  'Ergonomía y Pausas Activas',
  'Manejo de Sustancias Químicas (GHS)',
  'Riesgo Psicosocial y Manejo del Estrés',
  'Seguridad Vial (PESV)',
  'Reporte de Actos y Condiciones Inseguras',
  'Trabajador Autorizado para Trabajo en Alturas',
  'Coordinador de Trabajo Seguro en Alturas',
  'Administrador del Programa de Protección Contra Caídas',
  'Trabajador Entrante para Espacios Confinados',
  'Vigía de Seguridad para Espacios Confinados',
  'Supervisor de Trabajo en Espacios Confinados',
  'Administrador de Programa para Espacios Confinados',
  'Manejo Seguro de Herramientas Eléctricas y Manuales',
  'Mantenimiento Preventivo de Equipos',
  'Buenas Prácticas de Manufactura (BPM)'
];

const CATALOGO_CONTROLES_FUENTE = [
  'Mantenimiento preventivo periódico de maquinaria',
  'Aislamiento de la fuente generadora (Cabinas/Encerramientos)',
  'Sustitución de herramientas convencionales por ergonómicas/aisladas',
  'Automatización de procesos críticos o peligrosos',
  'Rediseño del puesto de trabajo o ergonomía física',
  'Protecciones mecánicas fijas o móviles en poleas y partes móviles',
  'Sistemas de parada de emergencia activa',
  'Voltaje extra bajo de seguridad (SELV / VRD en soldadura)'
];

const CATALOGO_CONTROLES_MEDIO = [
  'Sistemas de ventilación mecánica localizada o extracción',
  'Aislamiento acústico de áreas ruidosas',
  'Barandas, delimitación y demarcación de zonas de peligro',
  'Instalación de mamparas, pantallas térmicas o pantallas de soldadura',
  'Sistemas de iluminación artificial focalizada y antideslumbrante',
  'Limpieza profunda y control de polvo en el ambiente de trabajo',
  'Señalización de seguridad fotoluminiscente y advertencia de riesgos',
  'Diseño de rutas de evacuación y pasillos despejados',
  'Monitoreo ambiental periódico de contaminantes (Aire/Vibración/Ruido)'
];

export const exportPerfilesCargoToExcel = async (
  perfiles: ExportPerfilCargoData[],
  fileName: string = 'Perfiles_de_Cargo.xlsx'
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wappy IA';
  wb.lastModifiedBy = 'Wappy IA';
  wb.created = new Date();
  wb.modified = new Date();

  // ============================================================================
  // HOJA 1: PERFILES DE CARGO (CREADA PRIMERO PARA ABRIR DIRECTAMENTE EN EXCEL)
  // ============================================================================
  const ws = wb.addWorksheet('Perfiles de Cargo', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });

  // ============================================================================
  // HOJA 2: LISTAS DE OPCIONES / PESTAÑA DE RESPUESTAS (CATÁLOGOS DESPLEGABLES)
  // ============================================================================
  const wsOptions = wb.addWorksheet('Listas de Opciones', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });

  const optionsHeaders = [
    { header: 'Nivel del Cargo', key: 'nivelCargo', width: 26, data: LIST_NIVEL_CARGO },
    { header: 'Sector Organización', key: 'sector', width: 22, data: LIST_SECTOR },
    { header: 'Tipo de Vinculación', key: 'vinculacion', width: 42, data: LIST_VINCULACION },
    { header: 'Jornada Laboral', key: 'jornada', width: 30, data: LIST_JORNADA },
    { header: 'Exigencia Física', key: 'exigenciaFisica', width: 18, data: LIST_EXIGENCIA },
    { header: 'Exigencia Mental', key: 'exigenciaMental', width: 18, data: LIST_EXIGENCIA },
    { header: 'Opera Maquinaria', key: 'operaMaquinaria', width: 18, data: LIST_SI_NO },
    { header: 'Catálogo EPP (Referencia)', key: 'epp', width: 44, data: CATALOGO_EPP },
    { header: 'Catálogo Entrenamientos', key: 'entrenamientos', width: 46, data: CATALOGO_ENTRENAMIENTO },
    { header: 'Controles en la Fuente', key: 'controlesFuente', width: 48, data: CATALOGO_CONTROLES_FUENTE },
    { header: 'Controles en el Medio', key: 'controlesMedio', width: 48, data: CATALOGO_CONTROLES_MEDIO }
  ];

  wsOptions.columns = optionsHeaders.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width
  }));

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

  ws.columns = [
    { header: 'Nombre del Cargo', key: 'nombreCargo', width: 28 },
    { header: 'Área', key: 'area', width: 22 },
    { header: 'Nivel del Cargo', key: 'nivelCargo', width: 24 },
    { header: 'Sector Organización', key: 'sectorOrganizacion', width: 22 },
    { header: 'Tipo de Vinculación', key: 'tipoContrato', width: 34 },
    { header: 'Jornada', key: 'jornada', width: 26 },
    { header: 'Jefe Inmediato', key: 'jefeInmediato', width: 22 },
    { header: 'Escala Salarial', key: 'escalasSalarial', width: 18 },
    { header: 'Número de Vacantes', key: 'numVacantes', width: 18 },
    { header: 'Exigencia Física', key: 'exigenciaFisica', width: 18 },
    { header: 'Exigencia Mental', key: 'exigenciaMental', width: 18 },
    { header: 'Opera Maquinaria', key: 'operaMaquinaria', width: 18 },
    { header: 'Descripción Detallada', key: 'contextoAdicional', width: 50 },
    { header: 'EPP Requeridos', key: 'eppSeleccionados', width: 36 },
    { header: 'Entrenamientos Requeridos', key: 'entrenamientosSeleccionados', width: 36 },
    { header: 'Controles en la Fuente', key: 'controlesFuenteSeleccionados', width: 36 },
    { header: 'Controles en el Medio', key: 'controlesMedioSeleccionados', width: 36 }
  ];

  const totalRows = perfiles.length > 0 ? perfiles.length + 1 : 2;
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

  const safeJoin = (arr: any) => Array.isArray(arr) ? arr.join(', ') : (arr || '');

  perfiles.forEach((p, index) => {
    const rowNumber = index + 2;
    const addedRow = ws.addRow({
      nombreCargo: p.nombreCargo || '',
      area: p.area || '',
      nivelCargo: p.nivelCargo || '',
      sectorOrganizacion: p.sectorOrganizacion || 'Sector privado',
      tipoContrato: p.tipoContrato || '',
      jornada: p.jornada || '',
      jefeInmediato: p.jefeInmediato || '',
      escalasSalarial: p.escalasSalarial || '',
      numVacantes: p.numVacantes || '',
      exigenciaFisica: p.exigenciaFisica || '',
      exigenciaMental: p.exigenciaMental || '',
      operaMaquinaria: p.operaMaquinaria || '',
      contextoAdicional: p.contextoAdicional || '',
      eppSeleccionados: safeJoin(p.eppSeleccionados),
      entrenamientosSeleccionados: safeJoin(p.entrenamientosSeleccionados),
      controlesFuenteSeleccionados: safeJoin(p.controlesFuenteSeleccionados),
      controlesMedioSeleccionados: safeJoin(p.controlesMedioSeleccionados)
    });

    addedRow.height = 28;
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

      if ([3, 4, 5, 6, 9, 10, 11, 12].includes(colNumber)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });
  });

  // ============================================================================
  // VALIDACIÓN DE DATOS (MENÚS DESPLEGABLES) HASTA LA FILA 500
  // ============================================================================
  const maxValidationRows = Math.max(perfiles.length + 50, 500);

  const validationsMap: Record<string, string> = {
    nivelCargo: `'Listas de Opciones'!$A$2:$A$${LIST_NIVEL_CARGO.length + 1}`,
    sectorOrganizacion: `'Listas de Opciones'!$B$2:$B$${LIST_SECTOR.length + 1}`,
    tipoContrato: `'Listas de Opciones'!$C$2:$C$${LIST_VINCULACION.length + 1}`,
    jornada: `'Listas de Opciones'!$D$2:$D$${LIST_JORNADA.length + 1}`,
    exigenciaFisica: `'Listas de Opciones'!$E$2:$E$${LIST_EXIGENCIA.length + 1}`,
    exigenciaMental: `'Listas de Opciones'!$F$2:$F$${LIST_EXIGENCIA.length + 1}`,
    operaMaquinaria: `'Listas de Opciones'!$G$2:$G$${LIST_SI_NO.length + 1}`
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
        errorTitle: 'Opción no válida',
        error: 'Seleccione una de las opciones predefinidas de la lista desplegable.'
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  saveAs(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
};
