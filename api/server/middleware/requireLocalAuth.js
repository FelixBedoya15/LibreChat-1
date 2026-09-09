const passport = require('passport');
const { logger } = require('@librechat/data-schemas');

const requireLocalAuth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error('[requireLocalAuth] Error at passport.authenticate:', err);
      return next(err);
    }
    if (!user) {
      logger.debug('[requireLocalAuth] Error: No user');
      // Use 403 so it's not confused with a missing resource, allowing the message to be read
      // But we must ensure the frontend sees the message.
      if (info && info.message) {
        if (info.message.toLowerCase().includes('not verified')) {
          return res.status(422).send({ message: info.message });
        }
        return res.status(403).send({ message: info.message });
      }
      return res.status(404).send(info);
    }
    if (info && info.message) {
      logger.debug('[requireLocalAuth] Error: ' + info.message);
      if (info.message.toLowerCase().includes('not verified')) {
        return res.status(422).send({ message: info.message });
      }
      return res.status(403).send({ message: info.message });
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
