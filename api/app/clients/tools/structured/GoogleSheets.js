const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { google } = require('googleapis');
const { logger } = require('@librechat/data-schemas');
const {
  getActiveCompany,
  getScopedAuthValue,
  updateScopedAuthValue,
} = require('~/server/services/googleAuthHelper');

function stripHtmlTags(val) {
  if (typeof val !== 'string') return val;
  return val
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

class GoogleSheetsTool extends Tool {
  static lc_name() {
    return 'google_sheets';
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'google_sheets';
    this.description =
      'Permite interactuar directamente con Google Sheets del usuario. Puedes crear nuevas hojas de cálculo, leer rangos de celdas, escribir valores, añadir filas al final y aplicar formatos premium (colores de cabecera, bordes, negritas) para crear cuadros y reportes estructurados.';
    
    this.req = fields.req;

    this.schema = z.object({
      action: z.enum([
        'create_spreadsheet',
        'read_spreadsheet',
        'update_spreadsheet_values',
        'append_spreadsheet_values',
        'format_spreadsheet',
      ]).describe('La acción a ejecutar en Google Sheets.'),
      spreadsheetId: z.string().optional().describe('El ID de la hoja de cálculo de Google (requerido para leer, escribir, añadir o formatear).'),
      title: z.string().optional().describe('El título de la nueva hoja de cálculo que deseas crear.'),
      range: z.string().optional().describe('El rango de celdas en formato A1 (ej: "Sheet1!A1:D10"). Si no se pasa para leer, leerá el rango completo de la primera pestaña.'),
      values: z.array(z.array(z.string())).optional().describe('Matriz bidimensional de datos (array de arrays) a escribir o añadir (ej: [["Nombre", "Edad"], ["Juan", "30"]]).'),
      sheetId: z.number().optional().default(0).describe('El ID numérico de la pestaña (comúnmente 0 para la primera pestaña) para formatear.'),
      headerColorHex: z.string().optional().default('#0f766e').describe('Color hexadecimal para el fondo de la cabecera (ej: "#0f766e" para Teal, "#0284c7" para Sky Blue).'),
    });
  }

  async getAuthClient() {
    if (!this.req || !this.req.user) {
      throw new Error('Petición no autenticada. No se pudo obtener el contexto del usuario.');
    }
    const userId = this.req.user.id;
    const company = await getActiveCompany(userId);
    const companyId = company ? String(company._id) : null;

    const accessToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', true);
    const refreshToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_REFRESH_TOKEN', true);
    const expiryStr = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', true);
    const expiry = Number(expiryStr);

    if (!refreshToken) {
      throw new Error('No se encontró una conexión activa con Google Workspace. Por favor, conecta tu cuenta de Google en la pestaña de Configuración.');
    }

    const serverDomain = (process.env.DOMAIN_SERVER || 'https://wappy.club').replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club').replace(/\/+$/, '');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${serverDomain}/api/google-drive/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiry,
    });

    const isExpired = expiry ? (expiry - Date.now() < 60000) : true;
    if (isExpired) {
      logger.info(`[GoogleSheetsTool] Token expirado para usuario: ${userId}. Refrescando...`);
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        if (credentials.access_token) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', credentials.access_token);
        }
        if (credentials.expiry_date) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', String(credentials.expiry_date));
        }
        logger.info(`[GoogleSheetsTool] Token refrescado exitosamente.`);
      } catch (err) {
        logger.error(`[GoogleSheetsTool] Error refrescando token:`, err);
        throw new Error('La conexión de Google Workspace ha caducado. Por favor, vuelve a vincular tu cuenta en Configuración.');
      }
    }

    return oauth2Client;
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validación fallida: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { action, spreadsheetId, title, range, values, sheetId, headerColorHex } = validationResult.data;
    const auth = await this.getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    switch (action) {
      case 'create_spreadsheet': {
        if (!title) throw new Error('Se requiere el campo "title" para crear una hoja de cálculo.');
        const resource = {
          properties: {
            title,
          },
        };
        const response = await sheets.spreadsheets.create({
          resource,
          fields: 'spreadsheetId,spreadsheetUrl',
        });
        return `Hoja de cálculo creada exitosamente:\n- Título: "${title}"\n- ID: ${response.data.spreadsheetId}\n- Enlace: ${response.data.spreadsheetUrl}`;
      }

      case 'read_spreadsheet': {
        if (!spreadsheetId) throw new Error('Se requiere el campo "spreadsheetId" para leer datos.');
        const readRange = range || 'Sheet1!A1:Z500';
        
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: readRange,
          });
          const rows = response.data.values;
          if (!rows || rows.length === 0) {
            return `No se encontraron datos en el rango "${readRange}" de la hoja con ID: ${spreadsheetId}.`;
          }
          return `Datos leídos del rango "${readRange}" (${rows.length} filas encontradas):\n` + JSON.stringify(rows, null, 2);
        } catch (err) {
          // If Sheet1 doesn't exist, try getting the spreadsheet metadata to read the first sheet name
          const meta = await sheets.spreadsheets.get({ spreadsheetId });
          const firstSheetName = meta.data.sheets?.[0]?.properties?.title || 'Hoja 1';
          const retryRange = range || `${firstSheetName}!A1:Z500`;
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: retryRange,
          });
          const rows = response.data.values;
          if (!rows || rows.length === 0) {
            return `No se encontraron datos en el rango "${retryRange}".`;
          }
          return `Datos leídos del rango "${retryRange}" (${rows.length} filas):\n` + JSON.stringify(rows, null, 2);
        }
      }

      case 'update_spreadsheet_values': {
        if (!spreadsheetId) throw new Error('Se requiere "spreadsheetId".');
        if (!range) throw new Error('Se requiere "range" (ej: "Sheet1!A1") para escribir datos.');
        if (!values || !Array.isArray(values)) throw new Error('Se requiere "values" como un array de arrays.');

        const cleanedValues = values.map(row => 
          Array.isArray(row) 
            ? row.map(cell => (typeof cell === 'string' ? stripHtmlTags(cell) : cell))
            : row
        );

        const response = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: cleanedValues,
          },
        });
        return `Valores actualizados con éxito en el rango "${range}". Celdas afectadas: ${response.data.updatedCells}.`;
      }

      case 'append_spreadsheet_values': {
        if (!spreadsheetId) throw new Error('Se requiere "spreadsheetId".');
        if (!values || !Array.isArray(values)) throw new Error('Se requiere "values" como un array de arrays.');
        const appendRange = range || 'Sheet1!A1';

        const cleanedValues = values.map(row => 
          Array.isArray(row) 
            ? row.map(cell => (typeof cell === 'string' ? stripHtmlTags(cell) : cell))
            : row
        );

        const response = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: appendRange,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: cleanedValues,
          },
        });
        return `Filas añadidas exitosamente al final de la hoja. Rango actualizado: ${response.data.updates.updatedRange}.`;
      }

      case 'format_spreadsheet': {
        if (!spreadsheetId) throw new Error('Se requiere "spreadsheetId" para aplicar formato.');
        
        // Parse hex color to rgb percentage (Google Sheets format)
        const cleanHex = headerColorHex.replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

        const targetSheetId = sheetId || 0;

        const requests = [
          // 1. Header Row Formatting (Row 1)
          {
            repeatCell: {
              range: {
                sheetId: targetSheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 26,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: r,
                    green: g,
                    blue: b,
                  },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                    fontSize: 11,
                    fontFamily: 'Arial',
                  },
                  alignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,alignment,verticalAlignment)',
            },
          },
          // 2. Body Rows Formatting (Rows 2-100)
          {
            repeatCell: {
              range: {
                sheetId: targetSheetId,
                startRowIndex: 1,
                endRowIndex: 100,
                startColumnIndex: 0,
                endColumnIndex: 26,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    fontSize: 10,
                    fontFamily: 'Arial',
                    foregroundColor: {
                      red: 0.2,
                      green: 0.2,
                      blue: 0.2, // Dark Grey #333
                    },
                  },
                  verticalAlignment: 'MIDDLE',
                },
              },
              fields: 'userEnteredFormat(textFormat,verticalAlignment)',
            },
          },
          // 3. Grid Borders (Rows 1-100, Cols A-Z)
          {
            updateBorders: {
              range: {
                sheetId: targetSheetId,
                startRowIndex: 0,
                endRowIndex: 100,
                startColumnIndex: 0,
                endColumnIndex: 26,
              },
              top: {
                style: 'SOLID',
                color: { red: 0.82, green: 0.84, blue: 0.86 }, // Light grey #d1d5db
              },
              bottom: {
                style: 'SOLID',
                color: { red: 0.82, green: 0.84, blue: 0.86 },
              },
              left: {
                style: 'SOLID',
                color: { red: 0.82, green: 0.84, blue: 0.86 },
              },
              right: {
                style: 'SOLID',
                color: { red: 0.82, green: 0.84, blue: 0.86 },
              },
              innerHorizontal: {
                style: 'SOLID',
                color: { red: 0.88, green: 0.90, blue: 0.92 }, // Subtle inner grey
              },
              innerVertical: {
                style: 'SOLID',
                color: { red: 0.88, green: 0.90, blue: 0.92 },
              },
            },
          },
          // 4. Force Show Grid Lines
          {
            updateSheetProperties: {
              properties: {
                sheetId: targetSheetId,
                gridProperties: {
                  showGridLines: true,
                },
              },
              fields: 'gridProperties.showGridLines',
            },
          },
          // 5. Auto-Resize Column Widths (Cols A-Z)
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: targetSheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 26,
              },
            },
          },
        ];

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests,
          },
        });

        return `Formato de reporte premium aplicado con éxito en la pestaña con ID: ${targetSheetId}. Columnas auto-ajustadas, cabecera coloreada, bordes estructurados y cuadrícula habilitada.`;
      }

      default:
        throw new Error(`Acción desconocida: ${action}`);
    }
  }
}

module.exports = GoogleSheetsTool;
