const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { webcrypto } = require('node:crypto');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, checkEmailConfig, isEmailDomainAllowed } = require('@librechat/api');
const { ErrorTypes, SystemRoles, errorsToString } = require('librechat-data-provider');
const {
  findUser,
  findToken,
  createUser,
  updateUser,
  countUsers,
  getUserById,
  findSession,
  createToken,
  deleteTokens,
  deleteSession,
  createSession,
  generateToken,
  deleteUserById,
  generateRefreshToken,
} = require('~/models');
const { registerSchema } = require('~/strategies/validators');
const { getAppConfig } = require('~/server/services/Config');
const { sendEmail } = require('~/server/utils');

const sanitizeDomain = (domain) => {
  if (!domain) return 'https://wappy.club';
  return domain.replace(/https?:\/\/wappy-ia\.com/g, 'https://wappy.club').replace(/\/+$/, '');
};

const domains = {
  client: sanitizeDomain(process.env.DOMAIN_CLIENT),
  server: sanitizeDomain(process.env.DOMAIN_SERVER),
};

const isProduction = process.env.NODE_ENV === 'production';
const genericVerificationMessage = 'Please check your email to verify your email address.';

/**
 * Logout user
 *
 * @param {ServerRequest} req
 * @param {string} refreshToken
 * @returns
 */
const logoutUser = async (req, refreshToken) => {
  try {
    const userId = req.user._id;
    const session = await findSession({ userId: userId, refreshToken });

    if (session) {
      try {
        await deleteSession({ sessionId: session._id });
      } catch (deleteErr) {
        logger.error('[logoutUser] Failed to delete session.', deleteErr);
        return { status: 500, message: 'Failed to delete session.' };
      }
    }

    try {
      req.session.destroy();
    } catch (destroyErr) {
      logger.debug('[logoutUser] Failed to destroy session.', destroyErr);
    }

    return { status: 200, message: 'Logout successful' };
  } catch (err) {
    return { status: 500, message: err.message };
  }
};

/**
 * Creates Token and corresponding Hash for verification
 * @returns {[string, string]}
 */
const createTokenHash = () => {
  const token = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const hash = bcrypt.hashSync(token, 10);
  return [token, hash];
};

/**
 * Send Verification Email
 * @param {Partial<IUser>} user
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (user) => {
  const [verifyToken, hash] = createTokenHash();

  const verificationLink = `${domains.client
    }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;
  await sendEmail({
    email: user.email,
    subject: 'Verifica tu correo electrónico',
    payload: {
      appName: process.env.APP_TITLE || 'LibreChat',
      name: user.name || user.username || user.email,
      verificationLink: verificationLink,
      year: new Date().getFullYear(),
    },
    template: 'verifyEmail.handlebars',
  });

  await createToken({
    userId: user._id,
    email: user.email,
    token: hash,
    createdAt: Date.now(),
    expiresIn: 900,
  });

  logger.info(`[sendVerificationEmail] Verification link issued. [Email: ${user.email}]`);
};

/**
 * Verify Email
 * @param {ServerRequest} req
 */
const verifyEmail = async (req) => {
  const { email, token } = req.body;
  const decodedEmail = decodeURIComponent(email);

  const user = await findUser({ email: decodedEmail }, 'email _id emailVerified');

  if (!user) {
    logger.warn(`[verifyEmail] [User not found] [Email: ${decodedEmail}]`);
    return new Error('User not found');
  }

  if (user.emailVerified) {
    logger.info(`[verifyEmail] Email already verified [Email: ${decodedEmail}]`);
    return { message: 'Email already verified', status: 'success' };
  }

  let emailVerificationData = await findToken({ email: decodedEmail }, { sort: { createdAt: -1 } });

  if (!emailVerificationData) {
    logger.warn(`[verifyEmail] [No email verification data found] [Email: ${decodedEmail}]`);
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, emailVerificationData.token);

  if (!isValid) {
    logger.warn(
      `[verifyEmail] [Invalid or expired email verification token] [Email: ${decodedEmail}]`,
    );
    return new Error('Invalid or expired email verification token');
  }

  const updatedUser = await updateUser(emailVerificationData.userId, { emailVerified: true });

  if (!updatedUser) {
    logger.warn(`[verifyEmail] [User update failed] [Email: ${decodedEmail}]`);
    return new Error('Failed to update user verification status');
  }

  await deleteTokens({ token: emailVerificationData.token });
  logger.info(`[verifyEmail] Email verification successful [Email: ${decodedEmail}]`);
  return { message: 'Email verification was successful', status: 'success' };
};

/**
 * Register a new user.
 * @param {IUser} user <email, password, name, username>
 * @param {Partial<IUser>} [additionalData={}]
 * @returns {Promise<{status: number, message: string, user?: IUser}>}
 */
const registerUser = async (user, additionalData = {}) => {
  const { error } = registerSchema.safeParse(user);
  if (error) {
    const errorMessage = errorsToString(error.errors);
    logger.info(
      'Route: register - Validation Error',
      { name: 'Request params:', value: user },
      { name: 'Validation error:', value: errorMessage },
    );

    return { status: 404, message: errorMessage };
  }

  const { password, name, phoneNumber, ref } = user;
  const cleanEmail = (user.email || '').trim().toLowerCase();
  const cleanUsername = (user.username || cleanEmail.split('@')[0] || '').trim().toLowerCase();
  const email = cleanEmail;
  const username = cleanUsername;

  let newUserId;
  try {
    const appConfig = await getAppConfig();
    if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
      const errorMessage =
        'The email address provided cannot be used. Please use a different email address.';
      logger.error(`[registerUser] [Registration not allowed] [Email: ${user.email}]`);
      return { status: 403, message: errorMessage };
    }

    const existingUser = await findUser({
      $or: [{ email: cleanEmail }, { username: cleanUsername }],
    }, 'email _id');

    if (existingUser) {
      logger.info(
        'Register User - Email in use',
        { name: 'Request params:', value: user },
        { name: 'Existing user:', value: existingUser },
      );

      // Sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { status: 200, message: genericVerificationMessage };
    }

    //determine if this is the first registered user (not counting anonymous_user)
    const isFirstRegisteredUser = (await countUsers()) === 0;

    // Check if user has a paid ComunidadPurchase for 'wappyvital' to auto-assign USER_IPEVAR role
    let hasPaidWappyVital = false;
    try {
      const ComunidadPurchase = require('~/models/ComunidadPurchase');
      const normEmail = email.toLowerCase().trim();
      const purchase = await ComunidadPurchase.findOne({
        email: normEmail,
        isPaid: true,
        funnelKey: 'wappyvital'
      });
      if (purchase) {
        hasPaidWappyVital = true;
      }
    } catch (checkErr) {
      logger.error('[registerUser] Error checking ComunidadPurchase for Wappy Vital:', checkErr);
    }

    const salt = bcrypt.genSaltSync(10);
    const newUserData = {
      provider: 'local',
      email,
      username,
      name,
      phoneNumber,
      avatar: null,
      role: isFirstRegisteredUser 
        ? SystemRoles.ADMIN 
        : (hasPaidWappyVital 
            ? 'USER_IPEVAR' 
            : (process.env.DEFAULT_USER_ROLE || SystemRoles.USER)),
      accountStatus: isFirstRegisteredUser 
        ? 'active' 
        : (hasPaidWappyVital 
            ? 'active' 
            : (process.env.DEFAULT_ACCOUNT_STATUS || 'active')),
      password: bcrypt.hashSync(password, salt),
      ...additionalData,
    };

    const emailEnabled = checkEmailConfig();
    const disableTTL = isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN);

    const newUser = await createUser(newUserData, appConfig.balance, disableTTL, true);
    newUserId = newUser._id;

    if (hasPaidWappyVital) {
      try {
        const UserPlan = require('~/db/models/UserPlan');
        await UserPlan.findOneAndUpdate(
          { userId: newUserId },
          {
            plan: 'ipevar',
            planExpiresAt: null,
            cancelAtPeriodEnd: false
          },
          { upsert: true, new: true }
        );
        logger.info(`[registerUser] Auto-provisioned Wappy Vital plan (USER_IPEVAR) on registration for ${email}`);
      } catch (planErr) {
        logger.error('[registerUser] Error creating UserPlan for Wappy Vital:', planErr);
      }
    }

    // Process referral/partner ref parameter
    if (ref) {
      try {
        const Partner = require('~/models/Partner');
        const ReferralRecord = require('~/models/ReferralRecord');
        const mongoose = require('mongoose');
        const User = mongoose.model('User');
        const UserPlan = require('~/db/models/UserPlan');

        let referredByPartner = null;
        let referredByUser = null;

        // 1. Check if ref matches a partner slug
        const partner = await Partner.findOne({ slug: ref.toLowerCase().trim(), active: true });
        if (partner) {
          referredByPartner = partner._id;
        } else {
          // 2. Check if ref is a valid MongoDB ObjectId
          let referrer = null;
          if (mongoose.Types.ObjectId.isValid(ref)) {
            referrer = await User.findById(ref);
          }
          
          if (!referrer) {
            // 3. Check if ref matches a user username or email
            referrer = await User.findOne({
              $or: [
                { username: ref.toLowerCase().trim() },
                { email: ref.toLowerCase().trim() }
              ]
            });
          }

          if (!referrer) {
            // 4. Try matching by slugified name (replace hyphens with space or hyphen)
            const cleanRef = ref.trim();
            const nameRegex = new RegExp('^' + cleanRef.replace(/-/g, '[\\s-]') + '$', 'i');
            referrer = await User.findOne({ name: { $regex: nameRegex } });
          }

          if (referrer && referrer._id.toString() !== newUserId.toString()) {
            referredByUser = referrer._id;
          }
        }

        if (referredByPartner || referredByUser) {
          // Create ReferralRecord
          await ReferralRecord.create({
            referredUserId: newUserId,
            referredByUser,
            referredByPartner,
            status: 'registered'
          });

          // Give 15 days of Plan PRO free as welcome incentive for referrals
          const PRO_TRIAL_MS = 15 * 24 * 60 * 60 * 1000;
          const expiryDate = new Date(Date.now() + PRO_TRIAL_MS);

          // Update/Create UserPlan — mark planInterval as 'referral' so expiration job
          // knows to downgrade to Invitado (free) when the trial ends
          await UserPlan.findOneAndUpdate(
            { userId: newUserId },
            {
              plan: 'pro',
              planExpiresAt: expiryDate,
              planInterval: 'referral',
              cancelAtPeriodEnd: false
            },
            { upsert: true, new: true }
          );

          // Update User role to USER_PRO, accountStatus to active, and inactiveAt to the expiry Date
          await User.findByIdAndUpdate(newUserId, {
            role: 'USER_PRO',
            accountStatus: 'active',
            inactiveAt: expiryDate
          });

          logger.info(`[Referral] Referral recorded for new user ${email}. Referrer: ${referredByPartner ? 'Partner ' + ref : 'User ' + ref}. 15-day PRO trial activated.`);
        }
      } catch (refErr) {
        logger.error('[registerUser] Error recording referral / PRO trial:', refErr);
      }
    }
    
    // Inject Welcome Promo Notification if active
    try {
      const PromoCode = require('~/models/PromoCode');
      const Notification = require('~/models/Notification');
      const welcomeCode = await PromoCode.findOne({ isWelcomeCode: true, active: true }).lean();
      if (welcomeCode) {
        await Notification.create({
          user: newUserId,
          type: 'welcome_promo',
          title: '¡Tienes un Regalo de Bienvenida!',
          body: `Utiliza el código ${welcomeCode.code} para obtener un ${welcomeCode.discountPercentage}% de descuento en cualquier plan. ¡Válido solo por tus primeras 48 horas!`,
        });
      }
    } catch (promoErr) {
      logger.error('[registerUser] Error creating welcome notification:', promoErr);
    }

    if (emailEnabled && !newUser.emailVerified) {
      try {
        await sendVerificationEmail({
          _id: newUserId,
          email,
          name,
        });
      } catch (emailErr) {
        logger.error('[registerUser] Verification email failed to send, user preserved:', emailErr);
      }
    } else {
      await updateUser(newUserId, { emailVerified: true });
    }

    return { status: 200, message: genericVerificationMessage };
  } catch (err) {
    logger.error('[registerUser] Error in registering user:', err);
    if (newUserId) {
      const result = await deleteUserById(newUserId);
      logger.warn(
        `[registerUser] [Email: ${email}] [Temporary User deleted: ${JSON.stringify(result)}]`,
      );
    }
    return { status: 500, message: 'Something went wrong' };
  }
};

/**
 * Request password reset
 * @param {ServerRequest} req
 */
const requestPasswordReset = async (req) => {
  const rawEmail = req.body.email || '';
  const email = rawEmail.trim().toLowerCase();
  const appConfig = await getAppConfig();
  if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
    const error = new Error(ErrorTypes.AUTH_FAILED);
    error.code = ErrorTypes.AUTH_FAILED;
    error.message = 'Email domain not allowed';
    return error;
  }
  let user = await findUser({ email }, 'email _id name username');
  if (!user && rawEmail.trim()) {
    const escaped = rawEmail.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    user = await findUser({ email: { $regex: new RegExp(`^${escaped}$`, 'i') } }, 'email _id name username');
  }
  const emailEnabled = checkEmailConfig();

  logger.warn(`[requestPasswordReset] [Password reset request initiated] [Email: ${email}]`);

  if (!user) {
    logger.warn(`[requestPasswordReset] [No user found] [Email: ${email}] [IP: ${req.ip}]`);
    return {
      message: 'If an account with that email exists, a password reset link has been sent to it.',
    };
  }

  await deleteTokens({ userId: user._id });

  const [resetToken, hash] = createTokenHash();

  await createToken({
    userId: user._id,
    token: hash,
    createdAt: Date.now(),
    expiresIn: 900,
  });

  const link = `${domains.client}/reset-password?token=${resetToken}&userId=${user._id}`;

  if (emailEnabled) {
    try {
      await sendEmail({
        email: user.email,
        subject: 'Solicitud de restablecimiento de contraseña',
        payload: {
          appName: process.env.APP_TITLE || 'WAPPY IA',
          name: user.name || user.username || user.email,
          link: link,
          year: new Date().getFullYear(),
        },
        template: 'requestPasswordReset.handlebars',
      });
      logger.info(
        `[requestPasswordReset] Link emailed successfully. [Email: ${user.email}] [ID: ${user._id}] [IP: ${req.ip}]`,
      );
    } catch (emailErr) {
      logger.error(`[requestPasswordReset] Failed to send password reset email to ${user.email}:`, emailErr);
      throw emailErr;
    }
  } else {
    logger.info(
      `[requestPasswordReset] Link issued (email service disabled). [Email: ${user.email}] [ID: ${user._id}] [IP: ${req.ip}]`,
    );
    return { link };
  }

  return {
    message: 'If an account with that email exists, a password reset link has been sent to it.',
  };
};

/**
 * Reset Password
 *
 * @param {*} userId
 * @param {String} token
 * @param {String} password
 * @returns
 */
const resetPassword = async (userId, token, password) => {
  let passwordResetToken = await findToken(
    {
      userId,
    },
    { sort: { createdAt: -1 } },
  );

  if (!passwordResetToken) {
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, passwordResetToken.token);

  if (!isValid) {
    return new Error('Invalid or expired password reset token');
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = await updateUser(userId, { password: hash });

  if (checkEmailConfig()) {
    await sendEmail({
      email: user.email,
      subject: 'Contraseña restablecida exitosamente',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name || user.username || user.email,
        year: new Date().getFullYear(),
      },
      template: 'passwordReset.handlebars',
    });
  }

  await deleteTokens({ token: passwordResetToken.token });
  logger.info(`[resetPassword] Password reset successful. [Email: ${user.email}]`);
  return { message: 'Password reset was successful' };
};

/**
 * Set Auth Tokens
 * @param {String | ObjectId} userId
 * @param {ServerResponse} res
 * @param {ISession | null} [session=null]
 * @returns
 */
const setAuthTokens = async (userId, res, _session = null) => {
  try {
    let session = _session;
    let refreshToken;
    let refreshTokenExpires;

    if (session && session._id && session.expiration != null) {
      refreshTokenExpires = session.expiration.getTime();
      refreshToken = await generateRefreshToken(session);
    } else {
      const result = await createSession(userId);
      session = result.session;
      refreshToken = result.refreshToken;
      refreshTokenExpires = session.expiration.getTime();
    }

    const user = await getUserById(userId);
    const token = await generateToken(user);

    res.cookie('refreshToken', refreshToken, {
      expires: new Date(refreshTokenExpires),
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });
    res.cookie('token_provider', 'librechat', {
      expires: new Date(refreshTokenExpires),
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });
    return token;
  } catch (error) {
    logger.error('[setAuthTokens] Error in setting authentication tokens:', error);
    throw error;
  }
};

/**
 * @function setOpenIDAuthTokens
 * Set OpenID Authentication Tokens
 * //type tokenset from openid-client
 * @param {import('openid-client').TokenEndpointResponse & import('openid-client').TokenEndpointResponseHelpers} tokenset
 * - The tokenset object containing access and refresh tokens
 * @param {Object} res - response object
 * @param {string} [userId] - Optional MongoDB user ID for image path validation
 * @returns {String} - access token
 */
const setOpenIDAuthTokens = (tokenset, res, userId) => {
  try {
    if (!tokenset) {
      logger.error('[setOpenIDAuthTokens] No tokenset found in request');
      return;
    }
    const { REFRESH_TOKEN_EXPIRY } = process.env ?? {};
    const expiryInMilliseconds = REFRESH_TOKEN_EXPIRY
      ? eval(REFRESH_TOKEN_EXPIRY)
      : 1000 * 60 * 60 * 24 * 7; // 7 days default
    const expirationDate = new Date(Date.now() + expiryInMilliseconds);
    if (tokenset == null) {
      logger.error('[setOpenIDAuthTokens] No tokenset found in request');
      return;
    }
    if (!tokenset.access_token || !tokenset.refresh_token) {
      logger.error('[setOpenIDAuthTokens] No access or refresh token found in tokenset');
      return;
    }
    res.cookie('refreshToken', tokenset.refresh_token, {
      expires: expirationDate,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });
    res.cookie('token_provider', 'openid', {
      expires: expirationDate,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });
    if (userId && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
      /** JWT-signed user ID cookie for image path validation when OPENID_REUSE_TOKENS is enabled */
      const signedUserId = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: expiryInMilliseconds / 1000,
      });
      res.cookie('openid_user_id', signedUserId, {
        expires: expirationDate,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
      });
    }
    return tokenset.access_token;
  } catch (error) {
    logger.error('[setOpenIDAuthTokens] Error in setting authentication tokens:', error);
    throw error;
  }
};

/**
 * Resend Verification Email
 * @param {Object} req
 * @param {Object} req.body
 * @param {String} req.body.email
 * @returns {Promise<{status: number, message: string}>}
 */
const resendVerificationEmail = async (req) => {
  try {
    const rawEmail = req.body.email || '';
    const email = rawEmail.trim().toLowerCase();
    await deleteTokens({ email });
    let user = await findUser({ email }, 'email _id name');
    if (!user && rawEmail.trim()) {
      const escaped = rawEmail.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      user = await findUser({ email: { $regex: new RegExp(`^${escaped}$`, 'i') } }, 'email _id name');
    }

    if (!user) {
      logger.warn(`[resendVerificationEmail] [No user found] [Email: ${email}]`);
      return { status: 200, message: genericVerificationMessage };
    }

    const [verifyToken, hash] = createTokenHash();

    const verificationLink = `${domains.client
      }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      email: user.email,
      subject: 'Verifica tu correo electrónico',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name || user.username || user.email,
        verificationLink: verificationLink,
        year: new Date().getFullYear(),
      },
      template: 'verifyEmail.handlebars',
    });

    await createToken({
      userId: user._id,
      email: user.email,
      token: hash,
      createdAt: Date.now(),
      expiresIn: 900,
    });

    logger.info(`[resendVerificationEmail] Verification link issued. [Email: ${user.email}]`);

    return {
      status: 200,
      message: genericVerificationMessage,
    };
  } catch (error) {
    logger.error(`[resendVerificationEmail] Error resending verification email: ${error.message}`);
    return {
      status: 500,
      message: 'Something went wrong.',
    };
  }
};

module.exports = {
  logoutUser,
  verifyEmail,
  registerUser,
  setAuthTokens,
  resetPassword,
  setOpenIDAuthTokens,
  requestPasswordReset,
  resendVerificationEmail,
};
