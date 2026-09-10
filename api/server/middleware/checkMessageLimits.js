const { Message, Key } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

/**
 * Middleware to check daily message limit for free users (role: 'USER')
 * and enforce AI gating for sub-users (allowing them if they have AI permissions
 * or if they configured their own API keys).
 */
const checkMessageLimits = async (req, res, next) => {
  if (res.headersSent) {
    return next();
  }
  try {
    if (!req.user) {
      return next();
    }

    // Check Sub-User AI Gating
    if (req.user.isSubUser) {
      const perms = req.user.subUserPermissions || [];
      const hasAiPerm = perms.includes('chat:wappy_general') || 
                        perms.includes('chat:sst_specialist') || 
                        perms.includes('ai:live_analysis');

      // Check if sub-user has registered their own API key
      const hasOwnKey = await Key.exists({ userId: req.user.id });

      if (!hasAiPerm && !hasOwnKey) {
        const payload = {
          error: true,
          type: 'subuser_ai_restricted',
          message: 'Tu perfil de sub-usuario está configurado para carga de datos operativos en Somos SST y no tiene acceso a las IA de la empresa. Puedes configurar tus propias claves API en Configuración > Cuenta para utilizar la IA de forma autónoma con tus credenciales.'
        };
        return res.status(403).json({
          ...payload,
          text: JSON.stringify(payload)
        });
      }

      // If authorized by parent or using own API key, bypass Free user limits
      return next();
    }

    // Only apply to the Gratis ('USER') plan
    if (req.user.role !== 'USER') {
      return next();
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Count user-created messages (prompts) today
    const count = await Message.countDocuments({
      user: req.user.id,
      isCreatedByUser: true,
      createdAt: { $gte: todayStart }
    });

    const limit = 10;

    if (count >= limit) {
      const payload = {
        error: true,
        type: 'daily_limit',
        message: `Has alcanzado tu límite de ${limit} mensajes diarios del plan Gratis. Para chatear ilimitadamente hoy, adquiere el plan Wappy Vital.`
      };
      return res.status(403).json({
        ...payload,
        text: JSON.stringify(payload)
      });
    }

    next();
  } catch (error) {
    logger.error('Error en checkMessageLimits middleware:', error);
    if (res.headersSent) {
      return;
    }
    next(error);
  }
};

module.exports = checkMessageLimits;
