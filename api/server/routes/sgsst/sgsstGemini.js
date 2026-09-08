/**
 * sgsstGemini.js — Shared Gemini AI helpers for all SGSST routes
 *
 * API Key resolution mirrors EXACTLY GoogleClient.js (lines 67-68 + initialize.js):
 *   - If GOOGLE_KEY === 'user_provided', load user's DB key (JSON parsed with AuthKeys.GOOGLE_API_KEY)
 *   - Otherwise use GOOGLE_KEY from .env
 *   - Split by comma to get ALL keys, exactly like GoogleClient does
 *
 * Error handling mirrors EXACTLY GoogleClient.js (lines 793-799):
 *   - 429 (rate limit)   → rotate to next API key  (same model)
 *   - 403 (quota/leaked) → rotate to next API key  (same model)   ← same as chat
 *   - 400 API_KEY_INVALID→ rotate to next API key  (same model)   ← same as chat
 *   - 503 / overloaded   → rotate to next MODEL from SGSST_FALLBACK_MODELS (reset key index)
 *   - Other errors       → fail fast (surface real error)
 *
 * When ALL keys are exhausted for one model → try next model with all keys (don't throw yet)
 * When ALL keys AND ALL models are exhausted → throw last error
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AuthKeys, EModelEndpoint } = require('librechat-data-provider');
const { getUserKey } = require('~/server/services/UserService');
const { logger } = require('~/config');

// Non-live Gemini models for 503 fallback rotation (matching .env GOOGLE_MODELS minus live ones)
const SGSST_FALLBACK_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

// Live-only models for VoiceSession / LiveAnalysis rotation
const LIVE_FALLBACK_MODELS = [
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
];


/**
 * Resolves all API keys for a user.
 * MIRRORS: GoogleClient.js constructor lines 67-70 + initialize.js lines 9-47
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function resolveApiKeys(userId) {
  let rawApiKey = '';

  // Extraer el ID limpio en caso de que se haya pasado el objeto req.user
  const cleanUserId = (typeof userId === 'object' && userId !== null)
    ? (userId.id || userId._id || userId.userId || String(userId))
    : (typeof userId === 'string' ? userId.trim() : null);

  // 1. Consultar siempre la clave guardada por el usuario en la base de datos
  if (cleanUserId && cleanUserId !== '[object Object]') {
    try {
      const stored = await getUserKey({ userId: cleanUserId, name: EModelEndpoint?.google || 'google' });
      if (stored) {
        let parsed = null;
        try { parsed = JSON.parse(stored); } catch { /* plain string key */ }

        if (parsed && typeof parsed === 'object') {
          rawApiKey = parsed[AuthKeys?.GOOGLE_API_KEY] || parsed.GOOGLE_API_KEY || parsed.apiKey || '';
          const extraKeys = Object.entries(parsed)
            .filter(([k, v]) => k !== AuthKeys?.GOOGLE_API_KEY && k !== 'GOOGLE_API_KEY' && typeof v === 'string' && v.startsWith('AIza'))
            .map(([_, v]) => v);
          if (extraKeys.length > 0) {
            rawApiKey = [rawApiKey, ...extraKeys].filter(Boolean).join(',');
          }
        } else if (typeof stored === 'string' && stored.length > 5) {
          rawApiKey = stored.trim();
        }
      }
    } catch (e) {
      logger.debug(`[SGSST Gemini] No user key in DB for ${cleanUserId}: ${e.message}`);
    }
  }

  // 2. Fallback a variables de entorno si el usuario no tiene clave en BD
  if (!rawApiKey) {
    const { GOOGLE_KEY, GEMINI_API_KEY } = process.env;
    if (GOOGLE_KEY && GOOGLE_KEY !== 'user_provided') {
      rawApiKey = GOOGLE_KEY;
    } else if (GEMINI_API_KEY) {
      rawApiKey = GEMINI_API_KEY;
    }
  }

  // 3. Separar por comas y filtrar cadenas vacías o 'user_provided'
  const keys = rawApiKey
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0 && k !== 'user_provided');

  if (keys.length === 0) {
    throw new Error(
      'No hay claves API de Google configuradas. ' +
      'Configura tu clave en "Establecer clave API para Google" en el panel del chat.'
    );
  }

  logger.debug(`[SGSST Gemini] ${keys.length} clave(s) API para usuario ${cleanUserId}.`);
  return keys;
}

/**
 * Runs generateContent with key+model rotation.
 *
 * Error classification MIRRORS GoogleClient.js lines 793-799:
 *   isRateLimit    = status 429
 *   isQuotaExceeded= status 403   (includes "API key was leaked" → rotate key)
 *   isInvalidKey   = status 400 + message includes API_KEY_INVALID or "API key not valid"
 *   → all three rotate the KEY  (same behavior as chat's this.rotateKey())
 *
 *   is503          = status 503 / message includes "overloaded"
 *   → rotates the MODEL (unique to SGSST, not present in base chat)
 *
 * When all keys exhausted for a model → advance to next model (don't throw)
 * When all models also exhausted    → throw last error
 *
 * @param {object|string} modelInstance  { model, generationConfig } or plain model name string
 * @param {string}        userId
 * @param {*}             promptText
 * @param {object}        options        Additional options (e.g. { useWebSearch: true })
 * @returns {Promise<*>}
 */
async function generateWithKeyRotation(modelInstance, userId, promptText, options = {}) {
  // Auto-detección si los argumentos se pasaron invertidos (userId, modelInstance, ...)
  if (
    typeof modelInstance === 'string' &&
    typeof userId === 'object' &&
    userId !== null &&
    (userId.model || userId.generationConfig)
  ) {
    const temp = modelInstance;
    modelInstance = userId;
    userId = temp;
  }

  const preferredModel = (
    typeof modelInstance === 'string'
      ? modelInstance
      : (modelInstance && modelInstance.model) || ''
  ).replace('models/', '').trim() || 'gemini-3.5-flash';

  const genConfig = (modelInstance && typeof modelInstance === 'object' && modelInstance.generationConfig)
    ? modelInstance.generationConfig
    : {};

  const envModels = (process.env.GOOGLE_MODELS || '')
    .split(',')
    .map(m => m.trim().replace('models/', ''))
    .filter(m => m && !m.includes('live') && !m.includes('native-audio'));

  const candidateFallbacks = envModels.length > 0 ? envModels : SGSST_FALLBACK_MODELS;
  const fallbacks = candidateFallbacks.filter(m => m !== preferredModel);
  const modelsToTry = [...new Set([preferredModel, ...fallbacks])];

  const apiKeys = await resolveApiKeys(userId);

  let lastError;

  // Outer loop: iterate over models (move to next model on 503 or when all keys exhausted)
  for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
    const currentModel = modelsToTry[modelIdx];
    let allKeysExhaustedDueTo429 = false;

    // Inner loop: iterate over keys (mirrors chat's this.rotateKey() pattern)
    for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
      const apiKey = apiKeys[keyIdx];

      try {
        if (keyIdx > 0 || modelIdx > 0) {
          logger.warn(
            `[SGSST Gemini] Reintentando... Modelo="${currentModel}", ` +
            `Clave #${keyIdx + 1}/${apiKeys.length}`
          );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const isLegacyModel = currentModel.includes('1.5') || currentModel.includes('1.0');
        const maxOut = isLegacyModel ? 8192 : 65536;

        const mergedGenConfig = {
          maxOutputTokens: maxOut,
          temperature: 0.1,
          ...genConfig
        };

        const modelParams = { model: currentModel, generationConfig: mergedGenConfig };
        
        if (options.useWebSearch) {
          modelParams.tools = [{ googleSearch: {} }];
        }
        
        const model = genAI.getGenerativeModel(modelParams);
        
        let contentPayload = promptText;
        if (Array.isArray(promptText) && promptText.length > 0 && promptText[0] && typeof promptText[0] === 'object' && promptText[0].role) {
          contentPayload = { contents: promptText };
        }

        const result = await model.generateContent(contentPayload);
        return result; // ✅ success

      } catch (err) {
        lastError = err;

        // ── Classify errors exactly as GoogleClient.js lines 793-797 ──────────
        const status = err.status || (err.response && err.response.status) || 0;
        const msg = (err.message || '').toLowerCase();

        // 429 rate-limit / quota
        const isRateLimit = status === 429 || msg.includes('429') ||
          msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests');

        // 403 quota exceeded OR leaked key — chat rotates the key, we do the same
        const isQuotaExceeded = status === 403;

        // 400 invalid key — chat rotates the key, we do the same
        const isInvalidKey = status === 400 &&
          (msg.includes('api_key_invalid') || msg.includes('api key not valid'));

        // 503 service unavailable — unique to SGSST: rotate model
        const is503 = status === 503 || msg.includes('503') ||
          msg.includes('service unavailable') || msg.includes('overloaded');

        // 404 model not found — unique to SGSST: rotate model so we don't freeze on deprecated experimental models
        const is404 = status === 404 || msg.includes('404') ||
          msg.includes('not found') || msg.includes('is not found for api version');

        if (isRateLimit || isQuotaExceeded || isInvalidKey) {
          logger.warn(
            `[SGSST Gemini] Clave #${keyIdx + 1} rechazada ` +
            `(${status || 'quota'} – ${isInvalidKey ? 'inválida' : isQuotaExceeded ? 'prohibida' : 'límite'}) ` +
            `para modelo "${currentModel}". Rotando API key...`
          );
          allKeysExhaustedDueTo429 = true; // mark; continues to next keyIdx automatically
          continue; // next key, same model
        }

        if (is503 || is404) {
          logger.warn(
            `[SGSST Gemini] Modelo "${currentModel}" falló (${is503 ? '503 Sobrecargado' : '404 No Encontrado'}). ` +
            `Rotando a modelo de respaldo...`
          );
          break; // break inner for → outer for advances modelIdx
        }

        // Any other error: fail fast
        logger.error(`[SGSST Gemini] Error irrevocable con "${currentModel}": ${status} - ${msg} - ${err.message}`);
        throw err;
      }
    } // end inner for (keys)

    // If we came out of the key loop because ALL keys returned 429/403/400
    // → advance to the next model automatically (don't throw yet)
    if (allKeysExhaustedDueTo429) {
      logger.warn(
        `[SGSST Gemini] Todas las claves API (${apiKeys.length}) agotadas para ` +
        `"${currentModel}". Rotando al siguiente modelo de respaldo...`
      );
      // Continue outer for → modelIdx++ automatically
      continue;
    }
    // If we broke out due to 503 → outer for will also continue to next model
  } // end outer for (models)

  // All keys AND all models exhausted
  logger.error('[SGSST Gemini] Se agotaron todas las claves y modelos de respaldo.');
  throw lastError;
}

/**
 * Cleans raw rows parsed from Excel to minimize prompt token count:
 *  - Strips any keys starting with "__" (e.g. __normalizedMap, __sheetName)
 *  - Strips any keys with empty string, null, or undefined values
 *  - Strips common placeholder values like 'na', 'n/a', 'n/a.', 'ninguno', 'no aplica', 'ninguna'
 *
 * @param {Array<object>} rawRows
 * @returns {Array<object>}
 */
function cleanRawRows(rawRows) {
  if (!Array.isArray(rawRows)) {
    return [];
  }
  return rawRows.map(row => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    const cleaned = {};
    for (const [key, val] of Object.entries(row)) {
      if (key.startsWith('__')) {
        continue;
      }
      const strVal = String(val !== null && val !== undefined ? val : '').trim();
      const lowerVal = strVal.toLowerCase();
      if (!strVal || 
          lowerVal === 'na' || 
          lowerVal === 'n/a' || 
          lowerVal === 'n/a.' || 
          lowerVal === 'ninguno' || 
          lowerVal === 'no aplica' || 
          lowerVal === 'ninguna') {
        continue;
      }
      cleaned[key] = val;
    }
    return cleaned;
  });
}

module.exports = { resolveApiKeys, generateWithKeyRotation, SGSST_FALLBACK_MODELS, LIVE_FALLBACK_MODELS, cleanRawRows };
