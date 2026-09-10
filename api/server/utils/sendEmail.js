const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const { logger } = require('@librechat/data-schemas');
const { logAxiosError, isEnabled, readFileAsString } = require('@librechat/api');

/**
 * Sends an email using Mailgun API.
 *
 * @async
 * @function sendEmailViaMailgun
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.to - The recipient's email address.
 * @param {string} params.from - The sender's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {string} params.html - The HTML content of the email.
 * @param {Array} [params.attachments] - The email attachments.
 * @returns {Promise<Object>} - A promise that resolves to the response from Mailgun API.
 */
const sendEmailViaMailgun = async ({ to, from, subject, html, attachments }) => {
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunHost = process.env.MAILGUN_HOST || 'https://api.mailgun.net';

  if (!mailgunApiKey || !mailgunDomain) {
    throw new Error('Mailgun API key and domain are required');
  }

  const formData = new FormData();
  formData.append('from', from);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('html', html);
  formData.append('o:tracking-clicks', 'no');

  if (attachments && Array.isArray(attachments)) {
    attachments.forEach((att) => {
      formData.append('attachment', att.content, {
        filename: att.filename,
        contentType: att.contentType || 'application/octet-stream',
      });
    });
  }

  try {
    const response = await axios.post(`${mailgunHost}/v3/${mailgunDomain}/messages`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString('base64')}`,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(logAxiosError({ error, message: 'Failed to send email via Mailgun' }));
  }
};

/**
 * Sends an email using SMTP via Nodemailer.
 *
 * @async
 * @function sendEmailViaSMTP
 * @param {Object} params - The parameters for sending the email.
 * @param {Object} params.transporterOptions - The transporter configuration options.
 * @param {Object} params.mailOptions - The email options.
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email.
 */
const sendEmailViaSMTP = async ({ transporterOptions, mailOptions }) => {
  const transporter = nodemailer.createTransport(transporterOptions);
  return await transporter.sendMail(mailOptions);
};

/**
 * Sends an email using the specified template, subject, and payload.
 *
 * @async
 * @function sendEmail
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.email - The recipient's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {Record<string, string>} params.payload - The data to be used in the email template.
 * @param {string} params.template - The filename of the email template.
 * @param {boolean} [throwError=true] - Whether to throw an error if the email sending process fails.
 * @param {Array} [attachments] - The email attachments.
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email or the error if sending the email fails.
 *
 * @example
 * const emailData = {
 *   email: 'recipient@example.com',
 *   subject: 'Welcome!',
 *   payload: { name: 'Recipient' },
 *   template: 'welcome.html'
 * };
 *
 * sendEmail(emailData)
 *   .then(info => console.log('Email sent:', info))
 *   .catch(error => console.error('Error sending email:', error));
 *
 * @throws Will throw an error if the email sending process fails and throwError is `true`.
 */
const sendEmail = async ({ email, subject, payload, template, from, throwError = true, attachments }) => {
  try {
    const { content: source } = await readFileAsString(path.join(__dirname, 'emails', template));
    const compiledTemplate = handlebars.compile(source);
    const html = compiledTemplate(payload);

    // Prepare common email data
    const notificationsEmail = process.env.EMAIL_NOTIFICATIONS_FROM || 'notificaciones@wappy.club';
    let fromName = process.env.EMAIL_FROM_NAME || process.env.APP_TITLE || 'WAPPY IA';
    const fromEmail = from || process.env.EMAIL_FROM || process.env.EMAIL_NOTIFICATIONS_FROM || process.env.EMAIL_USERNAME || 'notificaciones@wappy.club';

    if (fromEmail === notificationsEmail) {
      fromName = process.env.EMAIL_NOTIFICATIONS_FROM_NAME || 'Notificaciones Wappy';
    }

    const fromAddress = `"${fromName}" <${fromEmail}>`;
    const toAddress = `"${payload.name || 'Usuario'}" <${email}>`;

    // Check if Mailgun is configured
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      logger.debug('[sendEmail] Using Mailgun provider');
      return await sendEmailViaMailgun({
        from: fromAddress,
        to: toAddress,
        subject: subject,
        html: html,
        attachments: attachments,
      });
    }

    // Default to SMTP
    logger.debug('[sendEmail] Using SMTP provider');

    let smtpUser = process.env.EMAIL_USERNAME;
    let smtpPass = process.env.EMAIL_PASSWORD;
    
    if (fromEmail === notificationsEmail && process.env.EMAIL_NOTIFICATIONS_PASSWORD) {
      smtpUser = process.env.EMAIL_NOTIFICATIONS_USERNAME || process.env.EMAIL_NOTIFICATIONS_FROM || 'notificaciones@wappy.club';
      smtpPass = process.env.EMAIL_NOTIFICATIONS_PASSWORD;
    }

    const smtpPort = Number(process.env.EMAIL_PORT) || 25;
    const isSecureConnection = process.env.EMAIL_ENCRYPTION === 'tls' || smtpPort === 465;

    const transporterOptions = {
      // Use TLS for port 465 or when explicit tls is requested
      secure: isSecureConnection,
      // If explicit STARTTLS is set, require it when connecting
      requireTls: process.env.EMAIL_ENCRYPTION === 'starttls',
      tls: {
        // Allow connections even if the SMTP host's TLS certificate is self-signed or has expired
        rejectUnauthorized: isEnabled(process.env.EMAIL_REJECT_UNAUTHORIZED),
      },
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    };

    if (process.env.EMAIL_ENCRYPTION_HOSTNAME) {
      // Check the certificate against this name explicitly
      transporterOptions.tls.servername = process.env.EMAIL_ENCRYPTION_HOSTNAME;
    }

    // Mailer service definition has precedence
    if (process.env.EMAIL_SERVICE) {
      transporterOptions.service = process.env.EMAIL_SERVICE;
    } else {
      transporterOptions.host = process.env.EMAIL_HOST;
      transporterOptions.port = smtpPort;
    }

    logger.info(`[sendEmail] Sending email to "${email}" with subject "${subject}" (from: ${fromEmail}, secure: ${isSecureConnection}, port: ${smtpPort})`);

    const mailOptions = {
      // Header address should contain name-addr
      from: fromAddress,
      to: toAddress,
      envelope: {
        // Envelope from should contain addr-spec
        // Mistake in the Nodemailer documentation?
        from: fromEmail,
        to: email,
      },
      subject: subject,
      html: html,
      attachments: attachments,
    };

    return await sendEmailViaSMTP({ transporterOptions, mailOptions });
  } catch (error) {
    if (throwError) {
      throw error;
    }
    logger.error('[sendEmail]', error);
    return error;
  }
};

module.exports = sendEmail;
