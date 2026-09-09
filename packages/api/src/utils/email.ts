/**
 * Check if email configuration is set
 * @returns Returns `true` if either Mailgun or SMTP is properly configured
 */
export function checkEmailConfig(): boolean {
  const hasSender = !!process.env.EMAIL_FROM || !!process.env.EMAIL_USERNAME || !!process.env.EMAIL_NOTIFICATIONS_FROM;

  const hasMailgunConfig =
    !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN && hasSender;

  const hasSMTPConfig =
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD;

  return hasMailgunConfig || hasSMTPConfig;
}
