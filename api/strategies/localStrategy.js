const { logger } = require('@librechat/data-schemas');
const { errorsToString } = require('librechat-data-provider');
const { isEnabled, checkEmailConfig } = require('@librechat/api');
const { Strategy: PassportLocalStrategy } = require('passport-local');
const { findUser, comparePassword, updateUser, getUserById } = require('~/models');
const { loginSchema } = require('./validators');

// Unix timestamp for 2024-06-07 15:20:18 Eastern Time
const verificationEnabledTimestamp = 1717788018;

async function validateLoginRequest(req) {
  const { error } = loginSchema.safeParse(req.body);
  return error ? errorsToString(error.errors) : null;
}

async function passportLogin(req, email, password, done) {
  try {
    const validationError = await validateLoginRequest(req);
    if (validationError) {
      logError('Passport Local Strategy - Validation Error', { reqBody: req.body });
      logger.error(`[Login] [Login failed] [Username: ${email}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: validationError });
    }

    const cleanIdentifier = (email || '').trim();
    const lowerIdentifier = cleanIdentifier.toLowerCase();
    let user = await findUser({
      $or: [
        { email: lowerIdentifier },
        { email: cleanIdentifier },
        { username: lowerIdentifier },
        { username: cleanIdentifier },
        { workerDocument: cleanIdentifier },
      ],
    }, '+password');

    if (!user && cleanIdentifier) {
      const escaped = cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      user = await findUser({
        $or: [
          { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { workerDocument: cleanIdentifier },
        ],
      }, '+password');
    }

    const identifier = cleanIdentifier;
    if (!user) {
      logError('Passport Local Strategy - User Not Found', { identifier });
      logger.error(`[Login] [Login failed] [Username: ${identifier}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: 'Email or Username does not exist.' });
    }

    if (!user.password) {
      logError('Passport Local Strategy - User has no password', { identifier });
      logger.error(`[Login] [Login failed] [Username: ${identifier}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: 'Email or Username does not exist.' });
    }

    const isMatch = await comparePassword(user, password);
    if (!isMatch) {
      logError('Passport Local Strategy - Password does not match', { isMatch });
      logger.error(`[Login] [Login failed] [Username: ${identifier}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: 'Incorrect password.' });
    }

    if (user.isSubUser && user.subUserStatus === 'suspended') {
      logger.warn(`[Login] [Login denied] Sub-user ${identifier} is suspended.`);
      return done(null, false, { message: 'Tu cuenta de sub-usuario se encuentra suspendida por el administrador principal.' });
    }

    if (user.isSubUser && user.parentUser) {
      const parent = await getUserById(user.parentUser, 'accountStatus inactiveAt role');
      if (parent && parent.accountStatus === 'suspended') {
        logger.warn(`[Login] [Login denied] Sub-user ${identifier} parent account is suspended.`);
        return done(null, false, { message: 'La cuenta de la organización principal se encuentra suspendida.' });
      }
    }

    const { ADMIN_EMAILS } = require('../server/middleware/roles/admin');
    const userEmailLower = user.email?.toLowerCase();
    if (userEmailLower && ADMIN_EMAILS.includes(userEmailLower)) {
      user.role = 'ADMIN';
      user.emailVerified = true;
      user.accountStatus = 'active';
      user.isApproved = true;
      user.inactiveAt = null;
      user.activeAt = null;
      await updateUser(user._id, { role: 'ADMIN', emailVerified: true, accountStatus: 'active', isApproved: true });
    }

    // Check for Inactivation/Activation Dates
    const now = new Date();
    const freeRoles = ['USER', 'ADMIN', 'USER_IPEVAR', 'IPEVAR'];
    if (!freeRoles.includes(user.role) && user.inactiveAt && now >= new Date(user.inactiveAt)) {
      logger.info(`[Login] Auto-downgrading expired user ${identifier} (expired on ${user.inactiveAt}) to free tier.`);
      const { downgradeUserIfExpired } = require('../server/services/planExpirationJob');
      const resDowngrade = await downgradeUserIfExpired(user._id);
      if (resDowngrade.downgraded) {
        user.role = resDowngrade.role;
        user.inactiveAt = null;
      }
    }
    if (user.activeAt && now < new Date(user.activeAt)) {
      logger.info(`[Login] [Login denied] User ${identifier} account is soon to be active on ${user.activeAt}`);
      return done(null, false, { message: 'Account is not yet active.' });
    }


    const emailEnabled = checkEmailConfig();
    const userCreatedAtTimestamp = Math.floor(new Date(user.createdAt).getTime() / 1000);

    if (
      !emailEnabled &&
      !user.emailVerified &&
      userCreatedAtTimestamp < verificationEnabledTimestamp
    ) {
      await updateUser(user._id, { emailVerified: true });
      user.emailVerified = true;
    }

    const unverifiedAllowed = isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN);
    if (user.expiresAt && unverifiedAllowed) {
      await updateUser(user._id, {});
    }

    if (!user.emailVerified && !unverifiedAllowed) {
      logError('Passport Local Strategy - Email not verified', { email });
      logger.error(`[Login] [Login failed] [Username: ${email}] [Request-IP: ${req.ip}]`);
      return done(null, user, { message: 'Email not verified.' });
    }

    logger.info(`[Login] [Login successful] [Username: ${email}] [Request-IP: ${req.ip}]`);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}

function logError(title, parameters) {
  const entries = Object.entries(parameters).map(([name, value]) => ({ name, value }));
  logger.error(title, { parameters: entries });
}

module.exports = () =>
  new PassportLocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      session: false,
      passReqToCallback: true,
    },
    passportLogin,
  );
