import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface EquipoAlturas {
  id: string;
  nombre: string;
  marca: string;
  referencia: string;
  serial: string;
  fechaFabricacion: string;
  fechaCompra: string;
  fechaUltimaInspeccion: string;
  fechaProximaInspeccion: string;
  inspeccionadoPor: string;
  resultadoInspeccion: 'Aprobado' | 'Rechazado' | 'N/A';
  estado: 'Vigente' | 'Vencido' | 'Requiere Inspección' | 'Retirado';
  firmaTrabajador?: string;
  observaciones?: string;
}

interface WorkerHeightsDoc {
  workerId: string;
  nombreTrabajador: string;
  cargo: string;
  equipos: EquipoAlturas[];
}

export const exportHeightsToExcel = async (heightsList: WorkerHeightsDoc[]) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wappy IA';
  wb.lastModifiedBy = 'Wappy IA';
  wb.created = new Date();
  wb.modified = new Date();

  // ============================================================================
  // HOJA 3: LISTAS DE OPCIONES (EQUIPOS DE PROTECCIÓN CONTRA CAÍDAS - RES. 4272)
  // ============================================================================
  const wsOptions = wb.addWorksheet('Listas de Opciones', {
    views: [{ showGridLines: true }]
  });

  const listResultadoInspeccion = ['Aprobado', 'Rechazado', 'N/A'];
  const listEstadoEquipo = ['Vigente', 'Vencido', 'Requiere Inspección', 'Retirado'];

  const optionsHeaders = [
    { header: 'Resultado Inspección', key: 'resultadoInspeccion', width: 24, data: listResultadoInspeccion },
    { header: 'Estado del Equipo', key: 'estadoEquipo', width: 26, data: listEstadoEquipo }
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
  // HOJA 1: RESUMEN POR TRABAJADOR
  // ============================================================================
  const wsSummary = wb.addWorksheet('Resumen de Asignaciones', {
    views: [{ showGridLines: true }]
  });

  // Título Hero
  wsSummary.mergeCells('A1:G2');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = '🧗 HOJA DE VIDA DE EQUIPOS DE PROTECCIÓN CONTRA CAÍDAS (ALTURAS)';
  titleCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Dark Teal
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Headers
  const summaryHeaders = [
    'Trabajador',
    'Cargo',
    'Total Equipos Asignados',
    'Equipos Vigentes',
    'Equipos Vencidos / Alerta ❌',
    'Pendientes de Inspección ⚠️',
    'Equipos Retirados'
  ];

  const headerRow1 = wsSummary.addRow(summaryHeaders);
  headerRow1.height = 25;
  headerRow1.eachCell((cell) => {
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

  // Llenar Datos Hoja 1
  heightsList.forEach((workerDoc) => {
    const total = workerDoc.equipos.length;
    const vigentes = workerDoc.equipos.filter(e => e.estado === 'Vigente').length;
    const vencidos = workerDoc.equipos.filter(e => e.estado === 'Vencido').length;
    const pendientes = workerDoc.equipos.filter(e => e.estado === 'Requiere Inspección').length;
    const retirados = workerDoc.equipos.filter(e => e.estado === 'Retirado').length;

    const dataRow = wsSummary.addRow([
      workerDoc.nombreTrabajador,
      workerDoc.cargo || 'Sin registrar',
      total,
      vigentes,
      vencidos,
      pendientes,
      retirados
    ]);

    dataRow.height = 22;
    dataRow.eachCell((cell, colNum) => {
      cell.font = { size: 10, name: 'Segoe UI' };
      
      if (colNum <= 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // Alertas
      if (colNum === 5 && vencidos > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        cell.font = { bold: true, color: { argb: 'FF991B1B' } };
      } else if (colNum === 6 && pendientes > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF08A10' } };
        cell.font = { bold: true, color: { argb: 'FF854D0E' } };
      }
    });
  });

  wsSummary.columns.forEach((col) => {
    let maxLen = 0;
    col.eachCell!({ includeEmpty: true }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(35, Math.max(12, maxLen + 2));
  });

  // ============================================================================
  // HOJA 2: DETALLE COMPLETO DE EQUIPOS
  // ============================================================================
  const wsDetail = wb.addWorksheet('Detalle de Equipos', {
    views: [{ showGridLines: true }]
  });

  // Título
  wsDetail.mergeCells('A1:N2');
  const titleCell2 = wsDetail.getCell('A1');
  titleCell2.value = '📋 HOJAS DE VIDA Y TRAZABILIDAD INDIVIDUAL DE EQUIPOS DE ALTURAS';
  titleCell2.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  titleCell2.alignment = { vertical: 'middle', horizontal: 'center' };

  // Headers
  const detailHeaders = [
    'Trabajador',
    'Cargo',
    'Elemento / Equipo',
    'Marca',
    'Referencia',
    'Serial',
    'Fecha Fabricación',
    'Fecha Compra',
    'Última Inspección',
    'Próxima Inspección',
    'Inspector Certificado',
    'Resultado Inspección',
    'Estado Equipo',
    'Observaciones'
  ];

  const headerRow2 = wsDetail.addRow(detailHeaders);
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

  let totalEquiposCount = 0;
  heightsList.forEach((doc) => {
    doc.equipos.forEach((eq) => {
      totalEquiposCount++;
      const dataRow = wsDetail.addRow([
        doc.nombreTrabajador,
        doc.cargo || 'Sin registrar',
        eq.nombre,
        eq.marca || 'N/A',
        eq.referencia || 'N/A',
        eq.serial,
        eq.fechaFabricacion || 'N/A',
        eq.fechaCompra || 'N/A',
        eq.fechaUltimaInspeccion || 'N/A',
        eq.fechaProximaInspeccion || 'N/A',
        eq.inspeccionadoPor || 'N/A',
        eq.resultadoInspeccion || 'N/A',
        eq.estado,
        eq.observaciones || ''
      ]);

      dataRow.height = 22;
      dataRow.eachCell((cell, colNum) => {
        cell.font = { size: 10, name: 'Segoe UI' };
        
        if (colNum <= 3 || colNum === 11 || colNum === 14) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        // Estado highlighting
        if (colNum === 13) {
          if (eq.estado === 'Vencido' || eq.estado === 'Retirado') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            cell.font = { bold: true, color: { argb: 'FF991B1B' } };
          } else if (eq.estado === 'Requiere Inspección') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF08A10' } };
            cell.font = { bold: true, color: { argb: 'FF854D0E' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
            cell.font = { color: { argb: 'FF166534' } };
          }
        }
      });
    });
  });

  if (totalEquiposCount === 0) {
    wsDetail.addRow(['No se han registrado equipos de alturas en el inventario aún']);
    wsDetail.mergeCells('A4:N4');
    wsDetail.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    wsDetail.getCell('A4').font = { italic: true, name: 'Segoe UI', size: 10 };
  }

  // Validaciones en Hoja 2 (Detalle de Equipos)
  const applyDetailValidation = (colLetter: string, optionsRange: string, promptTitle: string, prompt: string) => {
    const totalRows = Math.max(totalEquiposCount + 50, 500);
    for (let r = 4; r <= totalRows; r++) {
      const cell = wsDetail.getCell(`${colLetter}${r}`);
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

  applyDetailValidation('L', `'Listas de Opciones'!$A$2:$A$${listResultadoInspeccion.length + 1}`, 'Resultado Inspección', 'Aprobado, Rechazado o N/A');
  applyDetailValidation('M', `'Listas de Opciones'!$B$2:$B$${listEstadoEquipo.length + 1}`, 'Estado del Equipo', 'Vigente, Vencido, Requiere Inspección o Retirado');

  wsDetail.columns.forEach((col) => {
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
  saveAs(blob, `Reporte_Equipos_Alturas_${new Date().toISOString().slice(0,10)}.xlsx`);
};
