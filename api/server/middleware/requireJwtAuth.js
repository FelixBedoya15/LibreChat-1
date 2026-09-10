const cookies = require('cookie');
const passport = require('passport');
const { isEnabled } = require('@librechat/api');
const checkAccountStatus = require('./checkAccountStatus');

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse
 * Switches between JWT and OpenID authentication based on cookies and environment settings
 */
const requireJwtAuth = (req, res, next) => {
  // Check if token provider is specified in cookies
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  // Select authentication strategy
  let authMiddleware;
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    authMiddleware = passport.authenticate('openidJwt', { session: false });
  } else {
    authMiddleware = passport.authenticate('jwt', { session: false });
  }

  // Execute auth middleware, then check account status on success
  return authMiddleware(req, res, (err) => {
    if (err) return next(err);

    // Allow logout explicitly, even if account is inactive
    // This prevents users from being "trapped" if they are blocked
    if (req.originalUrl && req.originalUrl.includes('/logout')) {
      return next();
    }

    if (
      req.user &&
      req.user.isSubUser &&
      req.user.parentUser &&
      req.originalUrl &&
      req.originalUrl.startsWith('/api/sgsst') &&
      !req.originalUrl.includes('/subusers/me-permissions')
    ) {
      req.user.subUserId = req.user.id;
      req.user.id = req.user.parentUser.toString();
      req.user._id = req.user.parentUser;
    }

    checkAccountStatus(req, res, next);
  });
};

module.exports = requireJwtAuth;
