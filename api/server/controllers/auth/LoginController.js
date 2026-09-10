const { logger } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { updateUser } = require('~/models');

const loginController = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Auto-approve and activate sub-users if active
    if (req.user.isSubUser && req.user.subUserStatus === 'active') {
      req.user.accountStatus = 'active';
      req.user.isApproved = true;
      try {
        await updateUser(req.user._id, { accountStatus: 'active', isApproved: true });
      } catch (e) {
        logger.error('[loginController] Error updating subuser accountStatus:', e);
      }
    }

    if (req.user.accountStatus === 'pending') {
      return res.status(403).json({ message: 'Account pending approval' });
    }

    // Legacy check for isApproved (migration support)
    if (req.user.accountStatus === undefined && req.user.isApproved === false) {
      return res.status(403).json({ message: 'Account pending approval' });
    }

    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    const { ADMIN_EMAILS } = require('../../middleware/roles/admin');
    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      user.role = 'ADMIN';
    }

    const token = await setAuthTokens(req.user._id, res);

    return res.status(200).send({ token, user });

  } catch (err) {
    logger.error('[loginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  loginController,
};
