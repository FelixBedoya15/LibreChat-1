import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface ChemicalProduct {
  id: string;
  nombre: string;
  fabricante: string;
  estadoFisico: 'Líquido' | 'Sólido' | 'Gaseoso';
  pictogramasSga: string[];
  claseOnu: string;
  ubicacion: string;
  cantidadAlmacenada: string;
  tieneFds: 'Sí' | 'No';
  tieneRotuloSga: 'Sí' | 'No';
  requisitosAlmacenamiento: string;
  incompatibilidades: string[];
  trabajadoresExpuestos: string[];
  observaciones?: string;
}

interface SocioWorker {
  id: string;
  nombre: string;
}

export const exportChemicalsToExcel = async (
  chemicalsList: ChemicalProduct[],
  allWorkers: SocioWorker[]
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wappy IA';
  wb.lastModifiedBy = 'Wappy IA';
  wb.created = new Date();
  wb.modified = new Date();

  // ============================================================================
  // HOJA 2: LISTAS DE OPCIONES (CATÁLOGOS NORMATIVOS SGA / ONU / DECRETO 1496)
  // ============================================================================
  const wsOptions = wb.addWorksheet('Listas de Opciones', {
    views: [{ showGridLines: true }]
  });

  const listEstadoFisico = ['Líquido', 'Sólido', 'Gaseoso'];
  const listClaseOnu = [
    'Clase 1: Explosivos',
    'Clase 2.1: Gases Inflamables',
    'Clase 2.2: Gases No Inflamables / No Tóxicos',
    'Clase 2.3: Gases Tóxicos',
    'Clase 3: Líquidos Inflamables',
    'Clase 4.1: Sólidos Inflamables',
    'Clase 4.2: Sustancias Espontáneamente Combustibles',
    'Clase 4.3: Desprenden gases inflamables con agua',
    'Clase 5.1: Sustancias Comburentes',
    'Clase 5.2: Peróxidos Orgánicos',
    'Clase 6.1: Sustancias Tóxicas',
    'Clase 6.2: Sustancias Infecciosas',
    'Clase 7: Material Radiactivo',
    'Clase 8: Sustancias Corrosivas',
    'Clase 9: Misceláneos / Varios',
    'No Aplica / No Peligroso'
  ];
  const listSiNo = ['Sí', 'No'];

  const optionsHeaders = [
    { header: 'Estado Físico', key: 'estadoFisico', width: 20, data: listEstadoFisico },
    { header: 'Clase ONU (Transporte / SGA)', key: 'claseOnu', width: 44, data: listClaseOnu },
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
  // HOJA 1: INVENTARIO DE PRODUCTOS QUÍMICOS
  // ============================================================================
  const wsInv = wb.addWorksheet('Inventario Químico', {
    views: [{ showGridLines: true }]
  });

  // Título Hero
  wsInv.mergeCells('A1:L2');
  const titleCell = wsInv.getCell('A1');
  titleCell.value = '🧪 INVENTARIO Y ROTULADO DE PRODUCTOS QUÍMICOS (SGA)';
  titleCell.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Dark Teal
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Info
  wsInv.mergeCells('A3:L3');
  const infoCell = wsInv.getCell('A3');
  infoCell.value = `Generado el: ${new Date().toLocaleDateString('es-CO')} | Normatividad: Decreto 1496 de 2018 / SGA / NTC 4435 (FDS)`;
  infoCell.font = { size: 10, italic: true, color: { argb: 'FF475569' } };
  infoCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Headers
  const invHeaders = [
    'Nombre del Producto',
    'Fabricante / Proveedor',
    'Estado Físico',
    'Clase ONU',
    'Pictogramas SGA',
    'Ubicación Almacén',
    'Cantidad Almacenada',
    '¿Tiene FDS? (Ficha)',
    '¿Tiene Rótulo SGA?',
    'Trabajadores Expuestos',
    'Requisitos Almacenamiento',
    'Incompatibilidades'
  ];

  const headerRow1 = wsInv.addRow(invHeaders);
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

  // Llenar Datos
  chemicalsList.forEach((prod) => {
    // Buscar los nombres de los trabajadores expuestos
    const expNames = (prod.trabajadoresExpuestos || []).map(id => {
      const w = allWorkers.find(worker => worker.id === id);
      return w ? w.nombre : '';
    }).filter(Boolean).join(', ');

    const dataRow = wsInv.addRow([
      prod.nombre,
      prod.fabricante || 'Desconocido',
      prod.estadoFisico,
      prod.claseOnu || 'N/A',
      (prod.pictogramasSga || []).join(', '),
      prod.ubicacion || 'General',
      prod.cantidadAlmacenada || 'Sin registrar',
      prod.tieneFds,
      prod.tieneRotuloSga,
      expNames || 'Ninguno',
      prod.requisitosAlmacenamiento || 'N/A',
      (prod.incompatibilidades || []).join(', ') || 'Ninguna'
    ]);

    dataRow.height = 22;
    dataRow.eachCell((cell, colNum) => {
      cell.font = { size: 10, name: 'Segoe UI' };
      
      if (colNum === 3 || colNum === 4 || colNum === 8 || colNum === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // FDS / Rotulado Alerta Highlight
      if ((colNum === 8 || colNum === 9) && cell.value === 'No') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        cell.font = { bold: true, color: { argb: 'FF991B1B' } };
      } else if ((colNum === 8 || colNum === 9) && cell.value === 'Sí') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        cell.font = { color: { argb: 'FF166534' } };
      }
    });
  });

  if (chemicalsList.length === 0) {
    wsInv.addRow(['No se han registrado productos químicos en el inventario aún']);
    wsInv.mergeCells('A5:L5');
    wsInv.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
    wsInv.getCell('A5').font = { italic: true, name: 'Segoe UI', size: 10 };
  }

  // ============================================================================
  // VALIDACIÓN DE DATOS (DROPDOWNS HASTA FILA 500 PARA ENTRADA DEL USUARIO)
  // ============================================================================
  const applyValidation = (colLetter: string, optionsRange: string, promptTitle: string, prompt: string) => {
    const totalRows = Math.max(chemicalsList.length + 50, 500);
    for (let r = 5; r <= totalRows; r++) {
      const cell = wsInv.getCell(`${colLetter}${r}`);
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

  applyValidation('C', `'Listas de Opciones'!$A$2:$A$${listEstadoFisico.length + 1}`, 'Estado Físico', 'Seleccione el estado físico');
  applyValidation('D', `'Listas de Opciones'!$B$2:$B$${listClaseOnu.length + 1}`, 'Clase ONU', 'Seleccione la clase ONU');
  applyValidation('H', `'Listas de Opciones'!$C$2:$C$${listSiNo.length + 1}`, 'Ficha FDS', 'Seleccione Sí o No');
  applyValidation('I', `'Listas de Opciones'!$C$2:$C$${listSiNo.length + 1}`, 'Rótulo SGA', 'Seleccione Sí o No');

  // Ajustar anchos
  wsInv.columns.forEach((col) => {
    let maxLen = 0;
    col.eachCell!({ includeEmpty: true }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(30, Math.max(14, maxLen + 2));
  });

  // Escribir archivo
  const buffer = await wb.xlsx.writeBuffer();
  const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8';
  const blob = new Blob([buffer], { type: fileType });
  saveAs(blob, `Inventario_Productos_Quimicos_SGA_${new Date().toISOString().slice(0,10)}.xlsx`);
};
