const express = require('express');
const router = express.Router();
const { updateUserKey, deleteUserKey, getUserKeyExpiry } = require('../services/UserService');
const { requireJwtAuth } = require('../middleware/');

router.put('/', requireJwtAuth, async (req, res) => {
  const { name, value } = req.body;
  const role = req.user.role;

  // RBAC: Block non-google keys for Free (USER) plan, EXCEPT sub-users who can configure their own keys
  if (role === 'USER' && name !== 'google' && !req.user.isSubUser) {
    return res.status(403).json({ error: 'Tu plan (Gratis) solo permite configurar claves API de Google/Gemini. Adquiere un plan superior para configurar otros proveedores.' });
  }

  // RBAC: Calculate max keys based on role
  if (name === 'google' && typeof value === 'string') {
    let keysCount = 0;
    try {
      const parsedValue = JSON.parse(value);
      const apiKeys = parsedValue.GOOGLE_API_KEY || '';
      keysCount = apiKeys.split(',').filter(k => k.trim().length > 0).length;
    } catch (e) {
      // Fallback for non-json values (legacy or simple strings)
      keysCount = value.split(',').filter(k => k.trim().length > 0).length;
    }
    let maxKeys = 1;

    if (req.user.isSubUser) maxKeys = 5;
    else if (role === 'USER_GO') maxKeys = 4;
    else if (role === 'USER_PLUS' || role === 'USER_PRO' || role === 'ADMIN') maxKeys = 10;

    if (keysCount > maxKeys) {
      return res.status(403).json({ error: `Tu plan actual solo permite registrar hasta ${maxKeys} claves API.` });
    }
  }

  await updateUserKey({ userId: req.user.id, ...req.body });
  res.status(201).send();
});

router.delete('/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;
  await deleteUserKey({ userId: req.user.id, name });
  res.status(204).send();
});

router.delete('/', requireJwtAuth, async (req, res) => {
  const { all } = req.query;

  if (all !== 'true') {
    return res.status(400).send({ error: 'Specify either all=true to delete.' });
  }

  await deleteUserKey({ userId: req.user.id, all: true });

  res.status(204).send();
});

router.get('/', requireJwtAuth, async (req, res) => {
  const { name } = req.query;
  const response = await getUserKeyExpiry({ userId: req.user.id, name });
  res.status(200).send(response);
});

module.exports = router;
