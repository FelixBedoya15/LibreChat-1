import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

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

export const exportVehiclesToExcel = async (vehiclesList: VehicleDoc[]) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wappy IA';
  wb.lastModifiedBy = 'Wappy IA';
  wb.created = new Date();
  wb.modified = new Date();

  // ============================================================================
  // HOJA 3: LISTAS DE OPCIONES (PESV - RESOLUCIÓN 20223040040595)
  // ============================================================================
  const wsOptions = wb.addWorksheet('Listas de Opciones', {
    views: [{ showGridLines: true }]
  });

  const listTiposVehiculo = [
    'Automóvil',
    'Camioneta',
    'Camión',
    'Motocicleta',
    'Furgón',
    'Bus / Microbús',
    'Maquinaria Amarilla',
    'Remolque / Semirremolque',
    'Otro'
  ];
  const listEstadoGeneral = ['Conforme', 'Alerta / No Conforme'];
  const listEstadoComponente = ['Bueno', 'Malo'];
  const listResultadoInspeccion = ['Aprobado', 'Rechazado'];
  const listSiNo = ['Sí', 'No'];

  const optionsHeaders = [
    { header: 'Tipo de Vehículo', key: 'tipoVehiculo', width: 26, data: listTiposVehiculo },
    { header: 'Estado General Flota', key: 'estadoGeneral', width: 24, data: listEstadoGeneral },
    { header: 'Estado Componente', key: 'estadoComponente', width: 22, data: listEstadoComponente },
    { header: 'Resultado Inspección', key: 'resultadoInspeccion', width: 24, data: listResultadoInspeccion },
    { header: 'Opciones Sí / No', key: 'sino', width: 18, data: listSiNo }
  ];

  wsOptions.columns = optionsHeaders.map(col => ({
    header: col.header,
    key: col.key,
    width: col.width
  }));

  const optHeaderRow = wsOptions.getRow(1);
  optHeaderRow.height = 30;
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

  // ============================================================================
  // HOJA 1: RESUMEN DE FLOTA
  // ============================================================================
  const wsFleet = wb.addWorksheet('Resumen de Flota', {
    views: [{ showGridLines: true }]
  });

  // Título Hero
  wsFleet.mergeCells('A1:L2');
  const titleCell = wsFleet.getCell('A1');
  titleCell.value = '🚗 PLAN ESTRATÉGICO DE SEGURIDAD VIAL (PESV) - HOJAS DE VIDA';
  titleCell.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Dark Teal
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Fila de Info
  wsFleet.mergeCells('A3:L3');
  const infoCell = wsFleet.getCell('A3');
  infoCell.value = `Generado el: ${new Date().toLocaleDateString('es-CO')} | Normatividad: PESV Ley 1503 de 2011 / Res. 20223040040595`;
  infoCell.font = { size: 10, italic: true, color: { argb: 'FF475569' } };
  infoCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Headers
  const fleetHeaders = [
    'Placa',
    'Tipo',
    'Marca',
    'Referencia',
    'Modelo',
    'Año',
    'Conductor Asignado',
    'Kilometraje',
    'Vencimiento SOAT 📄',
    'Vencimiento RTM 🔧',
    'Próximo Mantenimiento',
    'Estado'
  ];

  const headerRow1 = wsFleet.addRow(fleetHeaders);
  headerRow1.height = 25;
  headerRow1.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } }; // Teal Oscuro
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF042F2E' } },
      left: { style: 'thin', color: { argb: 'FF042F2E' } },
      bottom: { style: 'medium', color: { argb: 'FF042F2E' } },
      right: { style: 'thin', color: { argb: 'FF042F2E' } }
    };
  });

  const today = new Date();
  today.setHours(0,0,0,0);

  // Llenar Datos
  vehiclesList.forEach((veh) => {
    // Calcular si está vencido
    let isExpired = false;
    if (veh.soatVencimiento) {
      const soat = new Date(veh.soatVencimiento + 'T12:00:00');
      if (soat < today) isExpired = true;
    }
    if (veh.tecnomecanicaVencimiento) {
      const rtm = new Date(veh.tecnomecanicaVencimiento + 'T12:00:00');
      if (rtm < today) isExpired = true;
    }
    const ultInsp = (veh.inspecciones || []).slice(-1)[0];
    if (ultInsp && ultInsp.resultado === 'Rechazado') {
      isExpired = true;
    }

    const estadoStr = isExpired ? 'Alerta / No Conforme' : 'Conforme';

    const dataRow = wsFleet.addRow([
      veh.placa,
      veh.tipo,
      veh.marca,
      veh.referencia || 'N/A',
      veh.modelo || 'N/A',
      veh.anio || 'N/A',
      veh.conductorNombre,
      veh.kilometrajeActual,
      veh.soatVencimiento,
      veh.tecnomecanicaVencimiento || 'N/A',
      veh.proximoMantenimiento || 'N/A',
      estadoStr
    ]);

    dataRow.height = 22;
    dataRow.eachCell((cell, colNum) => {
      cell.font = { size: 10, name: 'Segoe UI' };
      
      if (colNum === 1 || colNum === 6 || colNum === 8 || colNum === 12) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // Resaltado de Estado
      if (colNum === 12) {
        if (isExpired) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 10, name: 'Segoe UI' };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
          cell.font = { color: { argb: 'FF166534' }, size: 10, name: 'Segoe UI' };
        }
      }
    });
  });

  // Validaciones en Hoja 1
  const applyFleetValidation = (colLetter: string, optionsRange: string, promptTitle: string, prompt: string) => {
    const totalRows = Math.max(vehiclesList.length + 50, 500);
    for (let r = 5; r <= totalRows; r++) {
      const cell = wsFleet.getCell(`${colLetter}${r}`);
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [optionsRange],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Valor no válido',
        error: 'Por favor seleccione una de las opciones desplegables autorizadas.',
        showInputMessage: false,
        promptTitle,
        prompt
      };
    }
  };

  applyFleetValidation('B', `'Listas de Opciones'!$A$2:$A$${listTiposVehiculo.length + 1}`, 'Tipo de Vehículo', 'Seleccione el tipo de vehículo');
  applyFleetValidation('L', `'Listas de Opciones'!$B$2:$B$${listEstadoGeneral.length + 1}`, 'Estado Flota', 'Seleccione el estado de conformidad');

  // Ajustar anchos Hoja 1
  wsFleet.columns.forEach((col) => {
    let maxLen = 0;
    col.eachCell!({ includeEmpty: true }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(35, Math.max(12, maxLen + 2));
  });

  // ============================================================================
  // HOJA 2: HISTORIAL DE INSPECCIONES PRE-OPERACIONALES
  // ============================================================================
  const wsInspecciones = wb.addWorksheet('Inspecciones Pre-operacionales', {
    views: [{ showGridLines: true }]
  });

  // Título
  wsInspecciones.mergeCells('A1:L2');
  const titleCell2 = wsInspecciones.getCell('A1');
  titleCell2.value = '📋 LISTAS DE CHEQUEO PRE-OPERACIONALES DE CONDUCTORES';
  titleCell2.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  titleCell2.alignment = { vertical: 'middle', horizontal: 'center' };

  // Headers
  const inspHeaders = [
    'Placa',
    'Conductor',
    'Fecha Inspección',
    'Kilometraje',
    'Luces',
    'Frenos',
    'Llantas',
    'Dirección',
    'Cinturones',
    'Resultado',
    '¿Firmado?',
    'Observaciones'
  ];

  const headerRow2 = wsInspecciones.addRow(inspHeaders);
  headerRow2.height = 25;
  headerRow2.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF042F2E' } },
      left: { style: 'thin', color: { argb: 'FF042F2E' } },
      bottom: { style: 'medium', color: { argb: 'FF042F2E' } },
      right: { style: 'thin', color: { argb: 'FF042F2E' } }
    };
  });

  let totalInspCount = 0;
  vehiclesList.forEach((veh) => {
    (veh.inspecciones || []).forEach((insp) => {
      totalInspCount++;
      const dataRow = wsInspecciones.addRow([
        veh.placa,
        veh.conductorNombre,
        insp.fecha,
        insp.kilometraje,
        insp.luces,
        insp.frenos,
        insp.llantas,
        insp.direccion,
        insp.cinturones,
        insp.resultado,
        insp.firmaConductor ? 'Sí' : 'No',
        insp.observaciones || ''
      ]);

      dataRow.height = 22;
      dataRow.eachCell((cell, colNum) => {
        cell.font = { size: 10, name: 'Segoe UI' };
        
        if (colNum >= 3 && colNum <= 11) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        // Resaltado de fallos
        if (['luces', 'frenos', 'llantas', 'direccion', 'cinturones'].includes(inspHeaders[colNum-1].toLowerCase()) && cell.value === 'Malo') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { bold: true, color: { argb: 'FF991B1B' } };
        }

        if (colNum === 10) {
          if (cell.value === 'Rechazado') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { bold: true, color: { argb: 'FF991B1B' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
            cell.font = { color: { argb: 'FF166534' } };
          }
        }
      });
    });
  });

  if (totalInspCount === 0) {
    wsInspecciones.addRow(['No se han registrado inspecciones pre-operacionales aún']);
    wsInspecciones.mergeCells('A4:L4');
    wsInspecciones.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    wsInspecciones.getCell('A4').font = { italic: true, name: 'Segoe UI', size: 10 };
  }

  // Validaciones en Hoja 2
  const applyInspValidation = (colLetter: string, optionsRange: string, promptTitle: string, prompt: string) => {
    const totalRows = Math.max(totalInspCount + 50, 500);
    for (let r = 4; r <= totalRows; r++) {
      const cell = wsInspecciones.getCell(`${colLetter}${r}`);
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [optionsRange],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Valor no válido',
        error: 'Por favor seleccione una de las opciones desplegables autorizadas.',
        showInputMessage: false,
        promptTitle,
        prompt
      };
    }
  };

  applyInspValidation('E', `'Listas de Opciones'!$C$2:$C$${listEstadoComponente.length + 1}`, 'Luces', 'Bueno o Malo');
  applyInspValidation('F', `'Listas de Opciones'!$C$2:$C$${listEstadoComponente.length + 1}`, 'Frenos', 'Bueno o Malo');
  applyInspValidation('G', `'Listas de Opciones'!$C$2:$C$${listEstadoComponente.length + 1}`, 'Llantas', 'Bueno o Malo');
  applyInspValidation('H', `'Listas de Opciones'!$C$2:$C$${listEstadoComponente.length + 1}`, 'Dirección', 'Bueno o Malo');
  applyInspValidation('I', `'Listas de Opciones'!$C$2:$C$${listEstadoComponente.length + 1}`, 'Cinturones', 'Bueno o Malo');
  applyInspValidation('J', `'Listas de Opciones'!$D$2:$D$${listResultadoInspeccion.length + 1}`, 'Resultado', 'Aprobado o Rechazado');
  applyInspValidation('K', `'Listas de Opciones'!$E$2:$E$${listSiNo.length + 1}`, '¿Firmado?', 'Sí o No');

  wsInspecciones.columns.forEach((col) => {
    let maxLen = 0;
    col.eachCell!({ includeEmpty: true }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(35, Math.max(12, maxLen + 2));
  });

  // Escribir archivo
  const buffer = await wb.xlsx.writeBuffer();
  const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8';
  const blob = new Blob([buffer], { type: fileType });
  saveAs(blob, `Reporte_PESV_Vehiculos_${new Date().toISOString().slice(0,10)}.xlsx`);
};
