const { google } = require('googleapis');
const { logger } = require('@librechat/data-schemas');
const { getScopedAuthValue, updateScopedAuthValue } = require('./googleAuthHelper');

/**
 * Returns an authorized OAuth2 client for the given user.
 */
const getOAuth2Client = (redirectUri) => {
  const rawDomain = process.env.DOMAIN_SERVER || process.env.DOMAIN_CLIENT || 'https://wappy.club';
  const domain = rawDomain.replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club').replace(/\/+$/, '');
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || `${domain}/api/google-drive/callback`
  );
};

/**
 * Resolves the Gmail client for a given user, auto-refreshing the access token if needed.
 */
const getGmailClient = async (userId, companyId = null) => {
  try {
    const accessToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', false);
    const refreshToken = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_REFRESH_TOKEN', false);
    const expiryStr = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', false);
    
    if (!accessToken || !refreshToken) {
      return null; // Not connected
    }

    const expiry = Number(expiryStr);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiry,
    });

    // Check if access token is expired or close to expiry (within 1 minute)
    const isExpired = expiry ? (expiry - Date.now() < 60000) : true;
    if (isExpired) {
      logger.info(`[GoogleGmailService] Refreshing access token for user: ${userId}`);
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        if (credentials.access_token) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', credentials.access_token);
        }
        if (credentials.expiry_date) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', String(credentials.expiry_date));
        }
        logger.info(`[GoogleGmailService] Token refreshed successfully for user: ${userId}`);
      } catch (refreshErr) {
        logger.error(`[GoogleGmailService] Failed to refresh token for user ${userId}:`, refreshErr.message);
        return null;
      }
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  } catch (err) {
    logger.error(`[GoogleGmailService] getGmailClient error for user ${userId}:`, err.message);
    return null;
  }
};

/**
 * Converts markdown text to basic HTML for email rendering.
 * Only runs if the body does NOT already contain HTML tags.
 */
const markdownToHtml = (text) => {
  if (!text) return '';

  // If the body already has HTML tags, return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text;

  let html = text
    // Escape HTML special chars (except we allow real HTML through)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    // Headers: # ## ###
    .replace(/^### (.+)$/gm, '<h3 style="color:#1f4e79;margin:18px 0 8px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1f4e79;margin:22px 0 10px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#1f4e79;margin:26px 0 12px;">$1</h1>')
    // Horizontal rule: ---
    .replace(/^[-]{3,}$/gm, '<hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0;"/>')
    // Unordered list items: - item or * item
    .replace(/^[\-\*] (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    // Ordered list items: 1. item
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    // Wrap consecutive <li> into <ul>
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="margin:10px 0 10px 20px;padding:0;">${match}</ul>`)
    // Line breaks: double newline = paragraph, single newline = <br>
    .replace(/\n{2,}/g, '</p><p style="margin:12px 0;">')
    .replace(/\n/g, '<br/>');

  // Wrap in paragraph tags
  html = `<p style="margin:12px 0;">${html}</p>`;

  // Wrap in a full styled email template
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a; background: #f9fafb; margin: 0; padding: 0;">
  <div style="max-width: 680px; margin: 30px auto; background: #ffffff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="background: linear-gradient(135deg, #0d9488, #0f766e); padding: 24px 32px;">
      <p style="margin:0; color:#ffffff; font-size:13px; font-weight:600; letter-spacing:1px; text-transform:uppercase;">WAPPY IA S.A.S.</p>
      <p style="margin:4px 0 0; color:rgba(255,255,255,0.8); font-size:12px;">Cuidado Integral para un Trabajo Seguro</p>
    </div>
    <div style="padding: 32px;">
      ${html}
    </div>
    <div style="background: #f3f4f6; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af;">
      Este correo fue generado automáticamente por WAPPY IA &bull; <a href="https://wappy.club" style="color:#0d9488;">wappy.club</a>
    </div>
  </div>
</body>
</html>`;
};

/**
 * Helper to encode email message in RFC 822 format base64url.
 */
const makeRawEmail = ({ from, to, subject, body, cc, bcc }) => {
  // Auto-convert markdown to HTML if the body isn't already HTML
  const htmlBody = markdownToHtml(body || '');

  const str = [
    'Content-Type: text/html; charset="UTF-8"\r\n',
    'MIME-Version: 1.0\r\n',
    from ? `From: ${from}\r\n` : '',
    `To: ${to}\r\n`,
    cc ? `Cc: ${cc}\r\n` : '',
    bcc ? `Bcc: ${bcc}\r\n` : '',
    `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=\r\n\r\n`,
    htmlBody,
  ].join('');

  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * Sends an email via Gmail API.
 */
const sendEmail = async (userId, { to, subject, body, cc, bcc }, companyId = null) => {
  try {
    const gmail = await getGmailClient(userId, companyId);
    if (!gmail) {
      throw new Error('Google Workspace no está conectado o autorizado.');
    }

    const fromEmail = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EMAIL', false);
    const raw = makeRawEmail({ from: fromEmail, to, subject, body, cc, bcc });
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    logger.info(`[GoogleGmailService] Email sent successfully to ${to} (ID: ${res.data.id})`);
    return res.data;
  } catch (err) {
    if (err.code === 403 || err.message?.toLowerCase().includes('insufficient permission')) {
      logger.warn(`[GoogleGmailService] Insufficient permissions for user ${userId}. Gmail scope might not be authorized.`);
      throw new Error('Los permisos de Gmail no están autorizados. Por favor desconecta y vuelve a conectar tu cuenta de Google Workspace en Configuración.');
    }
    logger.error(`[GoogleGmailService] Error sending email to ${to}:`, err.message);
    throw err;
  }
};

/**
 * Creates a draft email in Gmail.
 */
const createDraft = async (userId, { to, subject, body, cc, bcc }, companyId = null) => {
  try {
    const gmail = await getGmailClient(userId, companyId);
    if (!gmail) {
      throw new Error('Google Workspace no está conectado o autorizado.');
    }

    const fromEmail = await getScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EMAIL', false);
    const raw = makeRawEmail({ from: fromEmail, to, subject, body, cc, bcc });
    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw },
      },
    });

    logger.info(`[GoogleGmailService] Draft created successfully (ID: ${res.data.id})`);
    return res.data;
  } catch (err) {
    logger.error(`[GoogleGmailService] Error creating draft:`, err.message);
    throw err;
  }
};

module.exports = {
  getGmailClient,
  sendEmail,
  createDraft,
};
