const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { sendEmail, createDraft } = require('~/server/services/googleGmail');
const { getActiveCompany } = require('~/server/services/googleAuthHelper');

class GoogleGmailTool extends Tool {
  static lc_name() {
    return 'google_gmail';
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'google_gmail';
    this.description =
      'Permite enviar correos electrónicos y crear borradores directamente desde la cuenta de Gmail (Google Workspace) conectada por el usuario. REGLA OBLIGATORIA: Si el usuario te pide enviar un documento, política, informe o matriz que acabas de crear o editar en el panel de Canvas, DEBES pasar el código HTML completo y estructurado de dicho documento en el parámetro "body", garantizando que el destinatario reciba el diseño visual completo.';
    
    this.req = fields.req;
    
    this.schema = z.object({
      action: z.enum([
        'send_email',
        'create_draft',
      ]).describe('La acción a realizar en Gmail ("send_email" para enviar directamente o "create_draft" para guardar un borrador en Gmail).'),
      to: z.string().describe('La dirección de correo electrónico del destinatario (ej. "trabajador@empresa.com").'),
      subject: z.string().describe('El asunto del correo electrónico.'),
      body: z.string().describe('El contenido del mensaje. REGLA CRÍTICA: Si estás enviando un documento o política del panel de Canvas, este parámetro DEBE contener todo el código HTML completo y estilizado del documento de Canvas para que el destinatario reciba la versión final diseñada.'),
      cc: z.string().optional().describe('Direcciones de correo en copia (CC) separadas por coma. Opcional.'),
      bcc: z.string().optional().describe('Direcciones de correo en copia oculta (BCC) separadas por coma. Opcional.'),
    });
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validación fallida: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const { action, to, subject, body, cc, bcc } = validationResult.data;
    
    if (!this.req || !this.req.user) {
      throw new Error('Petición no autenticada. No se pudo obtener el contexto del usuario.');
    }
    const userId = this.req.user.id;
    const company = await getActiveCompany(userId);
    const companyId = company ? String(company._id) : null;

    let finalBody = body;
    const conversationId = this.req.body?.conversationId;

    if (conversationId) {
      try {
        const CanvasSession = require('~/models/CanvasSession');
        const GTC45WorkspaceSession = require('~/models/GTC45WorkspaceSession');
        const PESVWorkspaceSession = require('~/models/PESVWorkspaceSession');
        const ChemicalCompatibilitySession = require('~/models/ChemicalCompatibilitySession');

        const rawDomain = process.env.DOMAIN_CLIENT || 'https://wappy.club';
        const domain = rawDomain.replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club').replace(/\/+$/, '');
        const links = [];

        // 1. Check Canvas Session
        const session = await CanvasSession.findOne({ conversationId });
        if (session && session.content) {
          links.push({
            title: session.title || 'Documento de Canvas',
            url: `${domain}/api/sgsst/canvas/${conversationId}/view`
          });
        }

        // 2. Check GTC45 Workspace
        const gtc = await GTC45WorkspaceSession.findOne({ conversationId });
        if (gtc && gtc.matrixRows && gtc.matrixRows.length > 0) {
          links.push({
            title: 'Ver Matriz GTC-45 / IPEVAR',
            url: `${domain}/api/sgsst/canvas/gtc45/${conversationId}/view`
          });
          links.push({
            title: 'Descargar Excel GTC-45 (.xlsx)',
            url: `${domain}/api/sgsst/canvas/gtc45/${conversationId}/excel`,
            isExcel: true
          });
        }

        // 3. Check PESV Workspace
        const pesv = await PESVWorkspaceSession.findOne({ conversationId });
        if (pesv && pesv.matrixRows && pesv.matrixRows.length > 0) {
          links.push({
            title: 'Ver Matriz de Riesgo Vial PESV',
            url: `${domain}/api/sgsst/canvas/pesv/${conversationId}/view`
          });
          links.push({
            title: 'Descargar Excel PESV (.xlsx)',
            url: `${domain}/api/sgsst/canvas/pesv/${conversationId}/excel`,
            isExcel: true
          });
        }

        // 4. Check Chemical Compatibility
        const chem = await ChemicalCompatibilitySession.findOne({ conversationId });
        if (chem && chem.matrixRows && chem.matrixRows.length > 0) {
          links.push({
            title: 'Ver Matriz de Compatibilidad Química',
            url: `${domain}/api/sgsst/canvas/chemical/${conversationId}/view`
          });
          links.push({
            title: 'Descargar Excel Química (.xlsx)',
            url: `${domain}/api/sgsst/canvas/chemical/${conversationId}/excel`,
            isExcel: true
          });
        }

        // If we found any active documents, append them nicely to the email body
        if (links.length > 0 && !finalBody.includes('/view')) {
          const hasHtml = /<[a-z][\s\S]*>/i.test(finalBody);
          if (hasHtml) {
            let buttonsHtml = `
<br/><br/>
<hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;"/>
<div style="text-align: center; margin: 20px 0;">
  <p style="font-family: sans-serif; font-size: 16px; color: #4b5563; margin-bottom: 15px;">He generado los siguientes documentos y matrices en la plataforma. Puedes abrir los enlaces interactivos para visualizarlos o descargarlos en Excel (.xlsx):</p>
            `;
            for (const link of links) {
              const bgColor = link.isExcel ? '#10b981' : '#0d9488';
              buttonsHtml += `
  <div style="margin: 15px 0;">
    <a href="${link.url}" target="_blank" style="display: inline-block; background-color: ${bgColor}; color: #ffffff; padding: 12px 28px; font-family: sans-serif; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); width: 320px;">
      ${link.title}
    </a>
  </div>
              `;
            }
            buttonsHtml += `</div>`;
            finalBody += buttonsHtml;
          } else {
            let textLinks = `\n\n----------------------------------------\nDocumentos generados y firmados en la plataforma:\nPara visualizarlos o descargarlos, haz clic en los siguientes enlaces:\n`;
            for (const link of links) {
              textLinks += `- ${link.title}: ${link.url}\n`;
            }
            textLinks += `----------------------------------------`;
            finalBody += textLinks;
          }
        }
      } catch (err) {
        logger.error('[Google Gmail Tool] Error appending Canvas session link:', err);
      }
    }

    switch (action) {
      case 'send_email': {
        if (!to) throw new Error('Se requiere el campo "to" (destinatario) para enviar el correo.');
        if (!subject) throw new Error('Se requiere el campo "subject" (asunto) para enviar el correo.');
        if (!finalBody) throw new Error('Se requiere el campo "body" (contenido) para enviar el correo.');

        const result = await sendEmail(userId, { to, subject, body: finalBody, cc, bcc }, companyId);
        return `Correo enviado exitosamente a través de tu cuenta de Gmail:\n- Destinatario: ${to}\n- Asunto: "${subject}"\n- ID de mensaje: ${result.id}`;
      }

      case 'create_draft': {
        if (!to) throw new Error('Se requiere el campo "to" (destinatario) para crear el borrador.');
        if (!subject) throw new Error('Se requiere el campo "subject" (asunto) para crear el borrador.');
        if (!finalBody) throw new Error('Se requiere el campo "body" (contenido) para crear el borrador.');

        const result = await createDraft(userId, { to, subject, body: finalBody, cc, bcc }, companyId);
        return `Borrador creado exitosamente en tu cuenta de Gmail:\n- Destinatario: ${to}\n- Asunto: "${subject}"\n- ID de borrador: ${result.id}\nPuedes revisarlo y enviarlo desde tu bandeja de salida en Gmail.`;
      }

      default:
        throw new Error(`Acción desconocida: ${action}`);
    }
  }
}

module.exports = GoogleGmailTool;
