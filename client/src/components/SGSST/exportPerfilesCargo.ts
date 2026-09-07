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

export const exportPerfilesCargoToExcel = async (
  perfiles: ExportPerfilCargoData[],
  fileName: string = 'Perfiles_de_Cargo.xlsx'
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wappy IA';
  wb.lastModifiedBy = 'Wappy IA';
  wb.created = new Date();
  wb.modified = new Date();

  const totalRows = perfiles.length > 0 ? perfiles.length + 1 : 2;

  const ws = wb.addWorksheet('Perfiles de Cargo', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  });

  ws.columns = [
    { header: 'Nombre del Cargo', key: 'nombreCargo', width: 28 },
    { header: 'Área', key: 'area', width: 22 },
    { header: 'Nivel del Cargo', key: 'nivelCargo', width: 20 },
    { header: 'Sector Organización', key: 'sectorOrganizacion', width: 20 },
    { header: 'Tipo de Vinculación', key: 'tipoContrato', width: 28 },
    { header: 'Jornada', key: 'jornada', width: 22 },
    { header: 'Jefe Inmediato', key: 'jefeInmediato', width: 22 },
    { header: 'Escala Salarial', key: 'escalasSalarial', width: 18 },
    { header: 'Número de Vacantes', key: 'numVacantes', width: 18 },
    { header: 'Exigencia Física', key: 'exigenciaFisica', width: 18 },
    { header: 'Exigencia Mental', key: 'exigenciaMental', width: 18 },
    { header: 'Opera Maquinaria', key: 'operaMaquinaria', width: 18 },
    { header: 'Descripción Detallada', key: 'contextoAdicional', width: 50 },
    { header: 'EPP Requeridos', key: 'eppSeleccionados', width: 32 },
    { header: 'Entrenamientos Requeridos', key: 'entrenamientosSeleccionados', width: 32 },
    { header: 'Controles en la Fuente', key: 'controlesFuenteSeleccionados', width: 32 },
    { header: 'Controles en el Medio', key: 'controlesMedioSeleccionados', width: 32 }
  ];

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

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  saveAs(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
};
