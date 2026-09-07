/**
 * excelWorkerMapper.ts — Normalizador inteligente de encuestas y registros de trabajadores
 * Mapea de forma resiliente cualquier Excel / Google Forms / Microsoft Forms / SGSST export.
 */

export interface RawRow {
  [key: string]: any;
}

/**
 * Convierte fechas numéricas seriales de Excel (ej: 34768) o cadenas de texto a YYYY-MM-DD
 */
export function excelSerialToDate(val: any): string {
  if (val === undefined || val === null || val === '') return '';

  // Si ya es formato YYYY-MM-DD
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return val.trim();
  }

  // Si es DD/MM/YYYY o DD-MM-YYYY
  if (typeof val === 'string') {
    const dmyMatch = val.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
  }

  // Si es un número o número en string (serial Excel)
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const utcDays = Math.floor(num - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const year = dateInfo.getUTCFullYear();
    const month = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateInfo.getUTCDate()).padStart(2, '0');
    if (year >= 1920 && year <= 2100) {
      return `${year}-${month}-${day}`;
    }
  }

  return String(val).trim();
}

/**
 * Normaliza nombres en formato "Apellido(s), Nombre(s)" a "Nombre(s) Apellido(s)"
 */
export function formatWorkerName(rawName: string): string {
  if (!rawName) return '';
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return trimmed;
}

/**
 * Normaliza la estatura en metros (ej: '1,63' -> '1.63', '163' -> '1.63')
 */
export function formatHeightMeters(rawVal: string): string {
  if (!rawVal) return '';
  let clean = rawVal.trim().replace(',', '.');
  const num = parseFloat(clean);
  if (isNaN(num) || num <= 0) return rawVal.trim();
  if (num > 50 && num < 250) {
    // Está en centímetros (ej: 163 -> 1.63)
    return (num / 100).toFixed(2);
  }
  if (num > 0.5 && num < 2.5) {
    return num.toFixed(2);
  }
  return clean;
}

/**
 * Busca el valor de una fila según lista de patrones priorizados en los nombres de columna
 */
export function findRowValue(row: RawRow, patterns: string[], excludePatterns: string[] = []): string {
  const keys = Object.keys(row);

  for (const pattern of patterns) {
    const cleanPattern = pattern
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

    for (const key of keys) {
      const cleanKey = key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

      // Chequeo de exclusión
      const isExcluded = excludePatterns.some(ex => {
        const cleanEx = ex
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
        return cleanKey.includes(cleanEx);
      });

      if (isExcluded) continue;

      if (cleanKey.includes(cleanPattern)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }

  return '';
}

/**
 * Mapea filas importadas desde un archivo Excel a la lista de trabajadores completa
 */
export function smartMapExcelToWorkers(importedRows: RawRow[], emptyWorkerTemplate: any): any[] {
  if (!Array.isArray(importedRows) || importedRows.length === 0) {
    return [];
  }

  return importedRows.map((row, idx) => {
    // 1. Nombre
    const rawNombre = findRowValue(row, [
      'nombresyapellidos',
      'apellidosynombres',
      'nombrecompleto',
      'nombresyapellido',
      'apellidosynombre',
      'nombretrabajador',
      'colaborador',
      'empleado',
      'nombre',
    ]);
    const nombre = formatWorkerName(rawNombre);

    // 2. Identificación / Cédula
    let rawDoc = findRowValue(row, [
      'nodeidentificacion',
      'nodedocumento',
      'numerodedocumento',
      'numerodecedula',
      'nodecedula',
      'cedula',
      'identificacion',
      'documento',
      'cc',
    ]);
    // Limpiar puntos y espacios de documento
    const identificacion = rawDoc.replace(/\./g, '').trim() || (rawNombre ? `TEMP-${idx + 1}` : '');

    // 3. Cargo / Ocupación
    let cargo = findRowValue(
      row,
      [
        'cargodesempenado',
        'cargodesempena',
        'cargoposicion',
        'cargolaboral',
        'cargoactual',
        'cargos',
        'puestodetrabajo',
        'puesto',
        'ocupacion',
        'cargo',
      ],
      ['antiguedad', 'personasacargo', 'a cargo']
    );

    // Si no viene cargo o vino antigüedad ("Inferior a 1 año"), buscar en título obtenido o área
    if (
      !cargo ||
      cargo.toLowerCase().includes('inferior') ||
      cargo.toLowerCase().includes('año') ||
      cargo.toLowerCase().includes('mes')
    ) {
      const fallbackCargo = findRowValue(
        row,
        ['tituloobtenido', 'profesion', 'titulouniversitario', 'areaproceso', 'area', 'proceso'],
        ['antiguedad']
      );
      if (fallbackCargo) cargo = fallbackCargo;
    }

    // 4. Género / Sexo
    const rawGenero = findRowValue(row, ['genero', 'sexo']);
    let genero = rawGenero;
    if (rawGenero.toLowerCase().startsWith('f')) genero = 'Femenino';
    else if (rawGenero.toLowerCase().startsWith('m')) genero = 'Masculino';

    // 5. Fecha de Nacimiento & Edad
    const rawFechaNac = findRowValue(row, ['fechadenacimiento', 'fechanacimiento', 'nacimiento']);
    const fechaNacimiento = excelSerialToDate(rawFechaNac);
    let edad = findRowValue(row, ['edadencumplidos', 'edadenanios', 'anioscumplidos', 'edad']);

    // Si no viene edad pero sí fecha de nacimiento, calcularla
    if (!edad && fechaNacimiento && fechaNacimiento.includes('-')) {
      const nacDate = new Date(fechaNacimiento);
      const hoy = new Date();
      if (!isNaN(nacDate.getTime())) {
        let diffYears = hoy.getFullYear() - nacDate.getFullYear();
        const m = hoy.getMonth() - nacDate.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nacDate.getDate())) diffYears--;
        if (diffYears > 0 && diffYears < 120) edad = String(diffYears);
      }
    }

    // 6. Contacto & Domicilio
    const direccion = findRowValue(row, ['direcciondelacasa', 'direcciondondevive', 'direccionresidencia', 'direccion']);
    const municipioDomicilio = findRowValue(row, ['enqueciudadvive', 'ciudaddondevive', 'ciudad', 'municipiodomicilio', 'municipio']);
    const barrio = findRowValue(row, ['barriodondevive', 'barrio']);
    const telefono = findRowValue(row, ['numerotelefonico', 'telefonofamiliar', 'telefonocelular', 'telefono', 'celular', 'movil']);
    const correoElectronico = findRowValue(row, ['correocorporativo', 'correoinstitucional', 'correoelectronico', 'correo', 'email']);

    // 7. Datos Sociodemográficos
    const estadoCivil = findRowValue(row, ['estadocivil']);
    const personasCargo = findRowValue(row, ['personasacargo', 'personascargo']);
    const estrato = findRowValue(row, ['estrato']);
    const vivienda = findRowValue(row, ['tenenciadevivienda', 'tipodevivienda', 'vivienda']);
    const nivelEscolaridad = findRowValue(row, ['formacionacademica', 'nivelescolaridad', 'escolaridad', 'estudios', 'tituloobtenido']);

    // 8. Datos Médicos & Fisiológicos
    const rawPeso = findRowValue(row, ['cualessupeso', 'pesokg', 'peso']);
    const peso = rawPeso.replace(/kg/i, '').trim();

    const rawTalla = findRowValue(row, ['cualessualtura', 'alturamts', 'altura', 'estatura', 'talla']);
    const talla = formatHeightMeters(rawTalla);

    // Cálculo de IMC si hay peso y talla
    let imc = findRowValue(row, ['imc', 'indicemasacorporal']);
    if (!imc && peso && talla) {
      const pNum = parseFloat(peso.replace(',', '.'));
      const tNum = parseFloat(talla.replace(',', '.'));
      if (!isNaN(pNum) && !isNaN(tNum) && tNum > 0.5 && tNum < 2.5) {
        imc = (pNum / (tNum * tNum)).toFixed(1);
      }
    }

    const enfermedades = findRowValue(row, ['enfermedadesdiagnosticadas', 'enfermedadesactuales', 'diagnostico', 'enfermedades']);
    const medicamentos = findRowValue(row, ['medicamentosqueconsume', 'medicamentos']);
    const fuma = findRowValue(row, ['fuma']);
    const alcohol = findRowValue(row, ['ingierebebidasalcoholicas', 'bebidasalcoholicas', 'alcohol']);
    const deporte = findRowValue(row, ['praticaalgundeporte', 'practicaalgundeporte', 'actividadfisica', 'deporte', 'pasatiempo']);
    const alimentacion = findRowValue(row, ['calidaddealimentacion', 'alimentacion', 'dieta']);
    const riesgoCardiovascular = findRowValue(row, ['riesgocardiovascular', 'cardiovascular']);

    // 9. Contacto de Emergencia
    const emergenciaContacto = findRowValue(row, [
      'nombrecompletoy熟arentescodeunfamiliar',
      'nombrecompletoyfamiliar',
      'parentescodeunfamiliar',
      'contactodeemergencia',
      'emergenciacontacto',
      'familiar'
    ]);

    // 10. Salud Ocupacional & Exámenes
    const fechaExamenMedico = excelSerialToDate(findRowValue(row, ['fechaexamenmedico', 'examenmedico', 'fechaexamen']));
    const diagnosticoMedico = findRowValue(row, ['diagnosticomedico', 'conceptomedico', 'aptitudmedica']);
    const recomendacionesMedicas = findRowValue(row, ['recomendacionesmedicas', 'restriccionesmedicas', 'recomendaciones']);
    const limitacionesBiomecanicas = findRowValue(row, ['limitacionesbiomecanicas', 'limitacionfisica']);
    const tipoSangre = findRowValue(row, ['tipodesangre', 'gruposanguineo', 'rh', 'sangre']);

    // 11. Conducción y Licencias
    const rawLicencia = row['Licencia(s) Conducción'] || row['Licencia Conducción'] || row['Licencia de Conducción'] || row.licenciaConduccion || findRowValue(row, ['licenciaconduccion', 'licencia']) || '';
    const rawVencLicencia = row['Vencimiento(s) Licencia'] || row['Vencimiento Licencia Cond'] || row['Vencimiento Licencia'] || row.licenciaConduccionVencimiento || findRowValue(row, ['vencimientolicenciacond', 'vencimientolicencia']) || '';
    const soatVencimiento = excelSerialToDate(row['Vencimiento SOAT'] || row.soatVencimiento || findRowValue(row, ['vencimientosoat', 'soat']));
    const tecnicomecanicaVencimiento = excelSerialToDate(row['Vencimiento Tecnicomecánica'] || row.tecnicomecanicaVencimiento || findRowValue(row, ['vencimientotecnicomecanica', 'tecnomecanica', 'rtm']));
    
    // Parsear licencias múltiples si vienen delimitadas por coma o barra vertical
    const parsedLicencias: Array<{ id?: string; categoria: string; numero?: string; fechaVencimiento: string }> = [];
    if (rawLicencia || rawVencLicencia) {
      if (rawVencLicencia.includes('|')) {
        const parts = rawVencLicencia.split('|').map((p: string) => p.trim());
        parts.forEach((p: string, idx: number) => {
          const [cat, dateVal] = p.split(':').map((s: string) => s.trim());
          if (cat) {
            parsedLicencias.push({
              id: crypto.randomUUID(),
              categoria: cat,
              numero: identificacion || '',
              fechaVencimiento: excelSerialToDate(dateVal || '')
            });
          }
        });
      } else if (rawLicencia.includes(',')) {
        const cats = rawLicencia.split(',').map((s: string) => s.trim());
        cats.forEach((c: string) => {
          parsedLicencias.push({
            id: crypto.randomUUID(),
            categoria: c.replace(/\(.*\)/, '').trim() || 'B1',
            numero: identificacion || '',
            fechaVencimiento: excelSerialToDate(rawVencLicencia)
          });
        });
      } else {
        parsedLicencias.push({
          id: crypto.randomUUID(),
          categoria: rawLicencia.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'C1',
          numero: rawLicencia || identificacion || '',
          fechaVencimiento: excelSerialToDate(rawVencLicencia)
        });
      }
    }

    const licenciaConduccion = rawLicencia;
    const licenciaConduccionVencimiento = excelSerialToDate(rawVencLicencia);

    // 12. SST, Alturas y Comités
    const licenciaSST = row['N° Licencia SGSST'] || row.licenciaSST || findRowValue(row, ['licenciasst', 'licenciasgsst']) || '';
    const licenciaVencimiento = excelSerialToDate(row['Venc. Licencia SGSST'] || row.licenciaVencimiento || findRowValue(row, ['venclicenciasst', 'vencimientolicenciasst']));
    const curso50h = excelSerialToDate(row['Curso 50h'] || row.curso50h || findRowValue(row, ['curso50h', 'curso50horas']));
    const curso20h = excelSerialToDate(row['Curso 20h'] || row.curso20h || findRowValue(row, ['curso20h', 'curso20horas']));
    const fechaCursoAlturasAutorizado = excelSerialToDate(row['Curso Alturas Autorizado'] || row.fechaCursoAlturasAutorizado || findRowValue(row, ['cursoalturasautorizado', 'alturasautorizado']));
    const fechaCursoAlturasCoordinador = excelSerialToDate(row['Curso Alturas Coordinador'] || row.fechaCursoAlturasCoordinador || findRowValue(row, ['cursoalturascoordinador', 'alturascoordinador']));
    const esCopasst = row['COPASST'] || row.esCopasst || findRowValue(row, ['copasst']) || 'No';
    const esComiteConvivencia = row['Comité Convivencia'] || row.esComiteConvivencia || findRowValue(row, ['comiteconvivencia', 'convivencia']) || 'No';
    const esBrigadista = row['Brigadista'] || row.esBrigadista || findRowValue(row, ['brigadista', 'brigada']) || 'No';
    const esComiteSeguridadVial = row['Comité Seg. Vial'] || row.esComiteSeguridadVial || findRowValue(row, ['comiteseguridadvial', 'comitesegvial', 'pesv']) || 'No';
    const consentimientoFirmaDigital = row['Consentimiento Firma'] || row.consentimientoFirmaDigital || findRowValue(row, ['consentimientofirma', 'firmadigital']) || 'No';

    return {
      ...emptyWorkerTemplate,
      id: crypto.randomUUID(),
      nombre: nombre || row['Nombre'] || row.nombre || '',
      identificacion: identificacion || row['Identificación'] || row.identificacion || '',
      cargo: cargo || row['Cargo'] || row.cargo || '',
      genero: genero || row['Género'] || row.genero || '',
      edad: edad || row['Edad'] || row.edad || '',
      fechaNacimiento: fechaNacimiento || row['Fecha de Nacimiento'] || row.fechaNacimiento || '',
      direccion: direccion || row['Dirección'] || row.direccion || '',
      municipioDomicilio: municipioDomicilio || row['Municipio'] || row.municipioDomicilio || '',
      barrio: barrio || row['Barrio'] || row.barrio || '',
      telefono: telefono || row['Teléfono'] || row.telefono || '',
      correoElectronico: correoElectronico || row['Correo Electrónico'] || row.correoElectronico || '',
      estadoCivil: estadoCivil || row['Estado Civil'] || row.estadoCivil || '',
      personasCargo: personasCargo || row['Personas a Cargo'] || row.personasCargo || '',
      estrato: estrato || row['Estrato'] || row.estrato || '',
      vivienda: vivienda || row['Tipo de Vivienda'] || row.vivienda || '',
      nivelEscolaridad: nivelEscolaridad || row['Nivel Escolaridad'] || row.nivelEscolaridad || '',
      peso: peso || row['Peso (kg)'] || row.peso || '',
      talla: talla || row['Talla (m)'] || row.talla || '',
      imc: imc || row['IMC'] || row.imc || '',
      enfermedades: enfermedades || row['Enfermedades Actuales'] || row.enfermedades || '',
      medicamentos: medicamentos || row['Medicamentos'] || row.medicamentos || '',
      fuma: fuma || row['Fuma'] || row.fuma || '',
      alcohol: alcohol || row['Alcohol'] || row.alcohol || '',
      deporte: deporte || row['Deporte / Actividad Física'] || row.deporte || '',
      alimentacion: alimentacion || row['Calidad de Alimentación'] || row.alimentacion || '',
      riesgoCardiovascular: riesgoCardiovascular || row['Riesgo Cardiovascular'] || row.riesgoCardiovascular || '',
      emergenciaContacto: emergenciaContacto || row['Contacto de Emergencia'] || row.emergenciaContacto || '',
      fechaExamenMedico: fechaExamenMedico || row['Fecha Examen Médico'] || row.fechaExamenMedico || '',
      diagnosticoMedico: diagnosticoMedico || row['Diagnóstico Médico'] || row.diagnosticoMedico || '',
      recomendacionesMedicas: recomendacionesMedicas || row['Recomendaciones Medicas'] || row.recomendacionesMedicas || '',
      limitacionesBiomecanicas: limitacionesBiomecanicas || row['Limitaciones Biomecánicas'] || row.limitacionesBiomecanicas || '',
      tipoSangre: tipoSangre || row['Tipo de Sangre'] || row.tipoSangre || '',
      soatVencimiento: soatVencimiento || '',
      tecnicomecanicaVencimiento: tecnicomecanicaVencimiento || '',
      licenciaConduccion: licenciaConduccion || '',
      licenciaConduccionVencimiento: licenciaConduccionVencimiento || '',
      licenciasConduccion: parsedLicencias,
      licenciaSST: licenciaSST || '',
      licenciaVencimiento: licenciaVencimiento || '',
      curso50h: curso50h || '',
      curso20h: curso20h || '',
      fechaCursoAlturasAutorizado: fechaCursoAlturasAutorizado || '',
      fechaCursoAlturasCoordinador: fechaCursoAlturasCoordinador || '',
      esCopasst: esCopasst || 'No',
      esComiteConvivencia: esComiteConvivencia || 'No',
      esBrigadista: esBrigadista || 'No',
      esComiteSeguridadVial: esComiteSeguridadVial || 'No',
      consentimientoFirmaDigital: consentimientoFirmaDigital || 'No',
      completedByAI: false,
    };
  });
}
