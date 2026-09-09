const { google } = require('googleapis');
const { logger } = require('@librechat/data-schemas');
const { getUserPluginAuthValue, updateUserPluginAuth } = require('./PluginService');
const { getScopedAuthValue, updateScopedAuthValue } = require('./googleAuthHelper');

/**
 * Returns an authorized OAuth2 client for the given user.
 * Returns null if the user has not connected Google Drive/Workspace.
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
 * Resolves the calendar client for a given user, auto-refreshing the access token if needed.
 */
const getCalendarClient = async (userId, companyId = null) => {
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
      logger.info(`[GoogleCalendarService] Refreshing access token for user: ${userId}`);
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        if (credentials.access_token) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_ACCESS_TOKEN', credentials.access_token);
        }
        if (credentials.expiry_date) {
          await updateScopedAuthValue(userId, companyId, 'GOOGLE_DRIVE_EXPIRY', String(credentials.expiry_date));
        }
        logger.info(`[GoogleCalendarService] Token refreshed successfully for user: ${userId}`);
      } catch (refreshErr) {
        logger.error(`[GoogleCalendarService] Failed to refresh token for user ${userId}:`, refreshErr.message);
        return null; // Token revoked or invalid
      }
    }

    return google.calendar({ version: 'v3', auth: oauth2Client });
  } catch (err) {
    logger.error(`[GoogleCalendarService] getCalendarClient error for user ${userId}:`, err.message);
    return null;
  }
};

/**
 * Upserts a Google Calendar event.
 * Checks for existing events with the given syncId in privateExtendedProperties.
 *
 * @param {string} userId - User ID
 * @param {Object} eventData - { summary, description, start: { date | dateTime, timeZone }, end: { date | dateTime, timeZone }, colorId }
 * @param {string} syncId - Unique sync ID to avoid duplicates
 * @param {string} [companyId] - Optional company ID
 */
const upsertCalendarEvent = async (userId, eventData, syncId, companyId = null) => {
  try {
    const calendar = await getCalendarClient(userId, companyId);
    if (!calendar) {
      return null;
    }

    // Check if the event already exists
    const existing = await calendar.events.list({
      calendarId: 'primary',
      privateExtendedProperty: `wappySyncId=${syncId}`,
      maxResults: 1,
    });

    const body = {
      summary: eventData.summary,
      description: eventData.description,
      start: eventData.start,
      end: eventData.end,
      colorId: eventData.colorId || null,
      extendedProperties: {
        private: {
          wappySyncId: syncId,
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 }, // Push warning 30 min before
          { method: 'popup', minutes: 120 }, // Push warning 2 hours before
        ],
      },
    };

    if (existing.data.items && existing.data.items.length > 0) {
      const existingEvent = existing.data.items[0];
      
      // Update existing event to ensure it stays in sync
      const res = await calendar.events.update({
        calendarId: 'primary',
        eventId: existingEvent.id,
        requestBody: body,
      });
      logger.info(`[GoogleCalendarService] Event updated: "${eventData.summary}" (SyncID: ${syncId})`);
      return res.data;
    } else {
      // Create new event
      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: body,
      });
      logger.info(`[GoogleCalendarService] Event created: "${eventData.summary}" (SyncID: ${syncId})`);
      return res.data;
    }
  } catch (err) {
    if (err.code === 403 || err.message.toLowerCase().includes('insufficient permission')) {
      logger.warn(`[GoogleCalendarService] Insufficient permissions for user ${userId}. Calendar scope might not be authorized.`);
      throw new Error('Google Calendar no está autorizado. Desconecta y vuelve a conectar tu cuenta de Google en la pestaña de Configuración.');
    }
    logger.error(`[GoogleCalendarService] Error upserting event (${syncId}):`, err.message);
    throw err;
  }
};

/**
 * Deletes a Google Calendar event by its sync ID.
 * @param {string} userId - User ID
 * @param {string} syncId - Unique sync ID
 * @param {string} [companyId] - Optional company ID
 */
const deleteCalendarEvent = async (userId, syncId, companyId = null) => {
  try {
    const calendar = await getCalendarClient(userId, companyId);
    if (!calendar) {
      return;
    }

    const existing = await calendar.events.list({
      calendarId: 'primary',
      privateExtendedProperty: `wappySyncId=${syncId}`,
      maxResults: 1,
    });

    if (existing.data.items && existing.data.items.length > 0) {
      const eventId = existing.data.items[0].id;
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });
      logger.info(`[GoogleCalendarService] Event deleted: (SyncID: ${syncId})`);
    }
  } catch (err) {
    logger.error(`[GoogleCalendarService] Error deleting event (${syncId}):`, err.message);
  }
};

module.exports = {
  getCalendarClient,
  upsertCalendarEvent,
  deleteCalendarEvent,
};
