const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { google } = require('googleapis');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { logger } = require('@librechat/data-schemas');
const {
  getUserPluginAuthValue,
  updateUserPluginAuth,
} = require('~/server/services/PluginService');
const {
  getActiveCompany,
  getScopedAuthValue,
  updateScopedAuthValue,
} = require('~/server/services/googleAuthHelper');

class GoogleDriveTool extends Tool {
  static lc_name() {
    return 'google_drive';
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'google_drive';
    this.description = 
      'Permite interactuar con Google Drive del usuario. Puedes buscar archivos y carpetas, leer el contenido de documentos (Google Docs, Google Sheets, Word .docx, Excel .xlsx/.xls, PDFs, txt) y crear o actualizar documentos y carpetas. Úsalo cuando necesites analizar archivos del usuario o guardar reportes.';
    
    this.req = fields.req;
    
    this.schema = z.object({
      action: z.enum([
        'list_files_and_folders',
        'read_document_content',
        'create_folder',
        'write_file',
      ]).describe('La acción a realizar en Google Drive.'),
      query: z.string().optional().describe('Término de búsqueda para listar archivos (nombre, palabra clave) o el contenido de texto a escribir.'),
      fileId: z.string().optional().describe('El ID del archivo o carpeta para leer o actualizar.'),
      fileName: z.string().optional().describe('El nombre del archivo o carpeta que deseas crear.'),
      parentId: z.string().optional().describe('El ID de la carpeta contenedora (opcional).'),
      createAsGoogleDoc: z.boolean().optional().default(true).describe('Si es true, los archivos de texto se guardarán como Google Docs editables. Si es false, se guardarán como archivos de texto plano.'),
    });
  }

  /**
   * Retrieves and refreshes the user's Google Drive OAuth credentials if expired.
   * Returns an authorized google.auth.OAuth2 client.
   */
  async getAuthClient() {
    if (!this.req || !this.req.user) {
      throw new Error('Petición no autenticada. No se pudo obtener el contexto del usuario.');
    }
    const userId = this.req.user.id;
    const company = await getActiveCompany(userId);
    const companyId = company ? String(company._id) : null;

    // Load credentials from database
    const accessToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', true);
    const refreshToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_REFRESH_TOKEN', true);
    const expiryStr = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', true);
    const expiry = Number(expiryStr);

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

    // Check if access token is expired or close to expiry (within 1 minute)
    const isExpired = expiry ? (expiry - Date.now() < 60000) : true;
    if (isExpired) {
      logger.info(`[GoogleDriveTool] Access token expired for user: ${userId}. Refreshing...`);
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        // Update database with new tokens
        if (credentials.access_token) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', credentials.access_token);
        }
        if (credentials.expiry_date) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', String(credentials.expiry_date));
        }
        logger.info(`[GoogleDriveTool] Successfully refreshed Google Drive token for user: ${userId}`);
      } catch (refreshErr) {
        logger.error(`[GoogleDriveTool] Failed to refresh token for user: ${userId}`, refreshErr);
        throw new Error('La conexión con Google Drive ha expirado. Por favor, desconéctate y vuelve a conectarte en Configuración.');
      }
    }

    return oauth2Client;
  }

  async _call(input) {
    try {
      const validationResult = this.schema.safeParse(input);
      if (!validationResult.success) {
        return `Validación fallida en Google Drive: ${JSON.stringify(validationResult.error.issues)}`;
      }

      const { action, query, fileId, fileName, parentId, createAsGoogleDoc } = validationResult.data;
      const authClient = await this.getAuthClient();
      const drive = google.drive({ version: 'v3', auth: authClient });

      switch (action) {
        case 'list_files_and_folders':
          return await this.listFiles(drive, query, parentId);

        case 'read_document_content':
          if (!fileId) return 'Error: Se requiere "fileId" para leer el contenido de un documento.';
          return await this.readFileContent(drive, fileId);

        case 'create_folder':
          if (!fileName) return 'Error: Se requiere "fileName" para crear una carpeta.';
          return await this.createFolder(drive, fileName, parentId);

        case 'write_file':
          if (!fileName) return 'Error: Se requiere "fileName" para crear o actualizar un archivo.';
          if (!query) return 'Error: Se requiere "query" (que contiene el texto a escribir) para escribir en el archivo.';
          return await this.writeFile(drive, fileName, query, parentId, fileId, createAsGoogleDoc);

        default:
          return `Acción desconocida en Google Drive: ${action}`;
      }
    } catch (err) {
      logger.error('[GoogleDriveTool] Error in _call:', err);
      return `Error al acceder a Google Drive: ${err.message}. Continúa con la tarea utilizando la información disponible.`;
    }
  }

  /**
   * Lists files and folders in Drive, optionally filtered by a search query and parent folder.
   */
  async listFiles(drive, query, parentId) {
    let q = "trashed = false";
    if (query) {
      // Escape single quotes in name query
      const safeQuery = query.replace(/'/g, "\\'");
      q += ` and name contains '${safeQuery}'`;
    }
    if (parentId) {
      q += ` and '${parentId}' in parents`;
    }

    try {
      const res = await drive.files.list({
        q: q,
        fields: 'files(id, name, mimeType, parents, webViewLink, modifiedTime)',
        pageSize: 30,
        orderBy: 'folder,modifiedTime desc',
      });

      const files = res.data.files || [];
      if (files.length === 0) {
        return 'No se encontraron archivos ni carpetas en Google Drive.';
      }

      const fileList = files.map(file => {
        const type = file.mimeType === 'application/vnd.google-apps.folder' ? '[Carpeta]' : '[Archivo]';
        return `- ${file.name} (ID: ${file.id}) ${type} - URL: ${file.webViewLink}`;
      }).join('\n');

      return `Resultados de búsqueda en Google Drive:\n${fileList}`;
    } catch (err) {
      logger.error('[GoogleDriveTool] List files failed:', err.message);
      return `Error al listar archivos en Google Drive: ${err.message}`;
    }
  }

  /**
   * Reads content of a file. Supports exporting Google Docs to text and Sheets to CSV.
   * Uses pdf-parse to read PDFs.
   */
  async readFileContent(drive, fileId) {
    try {
      // Get metadata to inspect mimeType
      const metadataRes = await drive.files.get({
        fileId: fileId,
        fields: 'name, mimeType',
      });
      const { name, mimeType } = metadataRes.data;

      // Handle Google Docs
      if (mimeType === 'application/vnd.google-apps.document') {
        const exportRes = await drive.files.export({
          fileId: fileId,
          mimeType: 'text/plain',
        });
        return `Contenido del documento "${name}":\n\n${exportRes.data}`;
      }

      // Handle Google Sheets
      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        const exportRes = await drive.files.export({
          fileId: fileId,
          mimeType: 'text/csv',
        });
        return `Contenido de la hoja de cálculo "${name}" (Formato CSV):\n\n${exportRes.data}`;
      }

      // Handle Word Documents (.docx, .doc)
      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        mimeType === 'application/msword'
      ) {
        try {
          const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
          }, { responseType: 'arraybuffer' });
          
          const buffer = Buffer.from(response.data);
          const result = await mammoth.extractRawText({ buffer });
          return `Contenido extraído del documento Word "${name}":\n\n${result.value || '(Documento Word vacío)'}`;
        } catch (wordErr) {
          logger.warn(`[GoogleDriveTool] Word parse warning for "${name}": ${wordErr.message}`);
          return `El documento Word "${name}" (ID: ${fileId}) no pudo ser procesado (${wordErr.message}). Se continuará con los demás documentos.`;
        }
      }

      // Handle Excel Spreadsheet (.xlsx, .xls)
      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        mimeType === 'application/vnd.ms-excel'
      ) {
        try {
          const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
          }, { responseType: 'arraybuffer' });
          
          const buffer = Buffer.from(response.data);
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          let extractedText = '';
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            if (csv.trim()) {
              extractedText += `--- Hoja: ${sheetName} ---\n${csv}\n\n`;
            }
          });
          return `Contenido extraído del archivo Excel "${name}":\n\n${extractedText || 'El archivo Excel está vacío.'}`;
        } catch (excelErr) {
          logger.warn(`[GoogleDriveTool] Excel parse warning for "${name}": ${excelErr.message}`);
          return `La hoja Excel "${name}" (ID: ${fileId}) no pudo ser leída (${excelErr.message}). Se continuará con los demás archivos.`;
        }
      }

      // Handle PDF files
      if (mimeType === 'application/pdf') {
        try {
          const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
          }, { responseType: 'arraybuffer' });
          
          const buffer = Buffer.from(response.data);
          let text = '';
          const PDFParseClass = pdf.PDFParse || (pdf.default && pdf.default.PDFParse);
          if (typeof PDFParseClass === 'function') {
            const parser = new PDFParseClass({ data: buffer });
            try {
              const data = await parser.getText();
              text = (data && data.text) ? data.text.trim() : '';
            } finally {
              if (typeof parser.destroy === 'function') await parser.destroy();
            }
          } else if (typeof pdf === 'function') {
            const pdfData = await pdf(buffer);
            text = (pdfData && pdfData.text) ? pdfData.text.trim() : '';
          } else if (pdf.default && typeof pdf.default === 'function') {
            const pdfData = await pdf.default(buffer);
            text = (pdfData && pdfData.text) ? pdfData.text.trim() : '';
          }
          text = (text || '').replace(/\n+/g, '\n').trim();
          return `Contenido extraído del PDF "${name}":\n\n${text || '(PDF sin texto extraíble)'}`;
        } catch (pdfErr) {
          logger.warn(`[GoogleDriveTool] PDF parse warning for "${name}": ${pdfErr.message}`);
          return `El PDF "${name}" (ID: ${fileId}) no pudo ser procesado (${pdfErr.message}). Se continuará con los demás archivos.`;
        }
      }

      // Handle plain text files (or JSON, CSV)
      if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/javascript') {
        try {
          const fileRes = await drive.files.get({
            fileId: fileId,
            alt: 'media',
          });
          const content = typeof fileRes.data === 'object' ? JSON.stringify(fileRes.data, null, 2) : fileRes.data;
          return `Contenido del archivo "${name}":\n\n${content}`;
        } catch (txtErr) {
          return `No se pudo leer el archivo de texto "${name}": ${txtErr.message}`;
        }
      }

      return `El archivo "${name}" tiene un formato no compatible directamente para lectura (${mimeType}). ID de archivo: ${fileId}`;
    } catch (err) {
      logger.error('[GoogleDriveTool] Read file content failed:', err.message);
      return `No se pudo leer el archivo con ID ${fileId} (${err.message}). Se continuará con los demás archivos.`;
    }
  }

  /**
   * Creates a new folder in Google Drive.
   */
  async createFolder(drive, name, parentId) {
    try {
      const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentId) {
        fileMetadata.parents = [parentId];
      }

      const folder = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink',
      });

      return `Carpeta creada exitosamente: "${folder.data.name}" (ID: ${folder.data.id}). URL: ${folder.data.webViewLink}`;
    } catch (err) {
      logger.error('[GoogleDriveTool] Create folder failed:', err);
      throw new Error(`Fallo al crear la carpeta en Google Drive: ${err.message}`);
    }
  }

  /**
   * Creates or updates a file with the given content.
   */
  async writeFile(drive, name, content, parentId, fileId, createAsGoogleDoc) {
    try {
      const media = {
        mimeType: 'text/plain',
        body: content,
      };

      if (fileId) {
        // Update existing file
        const updatedFile = await drive.files.update({
          fileId: fileId,
          media: media,
          fields: 'id, name, webViewLink',
        });
        return `Archivo actualizado exitosamente: "${updatedFile.data.name}" (ID: ${updatedFile.data.id}). URL: ${updatedFile.data.webViewLink}`;
      } else {
        // Create new file
        const fileMetadata = {
          name: name,
        };
        
        if (createAsGoogleDoc) {
          // Convert plain text to Google Docs editable format
          fileMetadata.mimeType = 'application/vnd.google-apps.document';
        } else {
          fileMetadata.mimeType = 'text/plain';
        }

        if (parentId) {
          fileMetadata.parents = [parentId];
        }

        const newFile = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink',
        });

        return `Archivo creado exitosamente: "${newFile.data.name}" (ID: ${newFile.data.id}). URL: ${newFile.data.webViewLink}`;
      }
    } catch (err) {
      logger.error('[GoogleDriveTool] Write file failed:', err);
      throw new Error(`Fallo al guardar archivo en Google Drive: ${err.message}`);
    }
  }
}

module.exports = GoogleDriveTool;
