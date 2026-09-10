const mongoose = require('mongoose');
const crypto = require('crypto');
const UserPlan = require('~/db/models/UserPlan');
const Plan = require('~/models/Plan');
const PromoCode = require('~/models/PromoCode');
const WompiTransaction = require('~/models/WompiTransaction');
const { getAppConfig } = require('~/server/services/Config');
// Removed User import since role is available in req.user

const WompiWebhookLogSchema = new mongoose.Schema({
    event: String,
    reference: String,
    status: String,
    payload: Object,
    receivedChecksum: String,
    computedChecksum: String,
    verified: Boolean,
    error: String
}, { timestamps: true });

const WompiWebhookLog = mongoose.models.WompiWebhookLog || mongoose.model('WompiWebhookLog', WompiWebhookLogSchema);


// ── Helper: Check Welcome Code Expiry ──
const checkWelcomeCodeExpiry = async (codeDoc, userOrId) => {
    if (!codeDoc.isWelcomeCode) return true;
    const mongoose = require('mongoose');
    let userDate = null;
    if (typeof userOrId === 'object' && userOrId.createdAt) {
        userDate = userOrId.createdAt;
    } else {
        const User = mongoose.model('User');
        const user = await User.findById(userOrId).lean();
        if (user && user.createdAt) userDate = user.createdAt;
    }
    if (userDate && (Date.now() - new Date(userDate).getTime()) > 48 * 3600000) {
        return false;
    }
    return true;
};

// ─── Helpers for Plan Interval ─────────────────────────────────────────────
const getIntervalDays = (interval) => {
    if (interval === 'daily') return 1;
    if (interval === 'weekly') return 7;
    if (interval === 'quarterly') return 90;
    if (interval === 'semiannual') return 180;
    if (interval === 'annual') return 365;
    if (interval === 'lifetime') return 36500; // ~100 años
    return 30; // monthly default
};

const EXTRA_COMPANY_ANNUAL_PRICE = 350000;
const getExtraCompanyPrice = (interval) => {
    if (interval === 'monthly') return 33350;
    if (interval === 'quarterly') return 96620;
    if (interval === 'semiannual') return 187240;
    if (interval === 'annual') return EXTRA_COMPANY_ANNUAL_PRICE;
    return 0; // for free or lifetime if not applicable
};


/**
 * Calculates the expiry date using the "Time Compensation" algorithm (Option 2):
 * 
 * - Same plan renewal → time is simply stacked (e.g. Plus + 3 months = existing expiry + 3 months)
 * - Different plan tier (upgrade/downgrade) → old unused monetary value is converted to days
 *   of the new plan and added on top of the new plan duration.
 *
 * Example: User has 20 days left of Plus Monthly ($57.800/30 = $1.927/day).
 *   Unused value = 20 × $1.927 = $38.533
 *   New plan: Pro Annual ($795.600/365 = $2.179/day)
 *   Bonus days = $38.533 / $2.179 ≈ 17.7 days
 *   Total expiry = today + 365 days + 17 days
 */
const calculateProratedExpiry = async (planId, interval, userPlan) => {
    const now = new Date();
    const newIntervalDays = getIntervalDays(interval);

    // No active plan or already expired → fresh start
    if (!userPlan || !userPlan.planExpiresAt || userPlan.planExpiresAt <= now) {
        return new Date(now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000);
    }

    // Same tier renewal → stack time 1:1 from current expiry
    if (userPlan.plan === planId) {
        return new Date(userPlan.planExpiresAt.getTime() + newIntervalDays * 24 * 60 * 60 * 1000);
    }

    // Different tier → prorate by monetary value
    const [oldPlanDb, newPlanDb] = await Promise.all([
        Plan.findOne({ planId: userPlan.plan }).lean(),
        Plan.findOne({ planId }).lean(),
    ]);

    if (!oldPlanDb || !newPlanDb) {
        // Fallback: just add new time from today
        return new Date(now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000);
    }

    // Old daily value uses the monthly rate for fairness (most granular price)
    const oldDailyValue = (oldPlanDb.prices?.monthly || 0) / 30;

    // New daily value uses the actual interval chosen (e.g. annual rate / 365)
    const newTotalPrice = newPlanDb.prices?.[interval] || newPlanDb.prices?.monthly || 1;
    const newDailyValue = newTotalPrice / newIntervalDays;

    const remainingDaysOld = Math.max(0, (userPlan.planExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const remainingMonetaryValue = remainingDaysOld * oldDailyValue;
    const compensatedExtraDays = newDailyValue > 0 ? remainingMonetaryValue / newDailyValue : 0;

    const totalDaysToGrant = newIntervalDays + compensatedExtraDays;
    console.log(`[Wompi Proration] Old plan: ${userPlan.plan}, ${remainingDaysOld.toFixed(1)} days remaining at $${oldDailyValue.toFixed(0)}/day = $${remainingMonetaryValue.toFixed(0)} unused.`);
    console.log(`[Wompi Proration] New plan: ${planId} (${interval}) at $${newDailyValue.toFixed(0)}/day → +${compensatedExtraDays.toFixed(1)} bonus days. Total: ${totalDaysToGrant.toFixed(1)} days.`);

    return new Date(now.getTime() + totalDaysToGrant * 24 * 60 * 60 * 1000);
};

/**
 * GET /api/wompi/configured-plans
 * Returns the configured plans from the database (for frontend UI)
 */
const getPublicPlansConfig = async (req, res) => {
    try {
        const plans = await Plan.find({ planId: { $ne: '__visibility__' } }).lean();
        return res.json(plans);
    } catch (error) {
        console.error('[Wompi] getPublicPlansConfig error:', error);
        return res.status(500).json({ error: 'Error obteniendo planes configurados' });
    }
};

const validatePromoCode = async (req, res) => {
    try {
        const { code } = req.params;
        const cleanCode = code.toUpperCase().trim();
        if (cleanCode === 'VITAL30') {
            return res.json({ discountPercentage: 30, code: 'VITAL30' });
        }
        const codeDoc = await PromoCode.findOne({ code: cleanCode });
        if (!codeDoc || !codeDoc.active) {
            return res.status(404).json({ error: 'Código promocional inválido o expirado' });
        }
        
        // Ensure user is authenticated to check welcome code expiry
        if (codeDoc.isWelcomeCode && req.user) {
            const isValid = await checkWelcomeCodeExpiry(codeDoc, req.user._id || req.user.id);
            if (!isValid) {
                return res.status(400).json({ error: 'El código de bienvenida ha expirado para tu cuenta (válido solo por 48 horas).' });
            }
        }
        return res.json({ discountPercentage: codeDoc.discountPercentage, code: codeDoc.code });
    } catch (error) {
        console.error('[Wompi] validatePromoCode error:', error);
        return res.status(500).json({ error: 'Error validando código' });
    }
};

/** Plan display names */
const PLAN_NAMES = { go: 'Go', plus: 'Plus', pro: 'Pro', ipevar: 'Plan IPEVAR', custom: 'Plan a la Medida' };

const VALID_INTERVALS = ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'lifetime'];
const VALID_CUSTOM_TOOLS = ['blog', 'somos_sst', 'editor_archivos', 'analisis_vivo'];

/**
 * Calculate price for a custom plan based on selected tools and interval
 */
const calculateCustomPrice = (customPlanDoc, selectedTools, interval) => {
    const toolPrices = customPlanDoc.toolPrices || { blog: 5000, somos_sst: 35000, editor_archivos: 5000, analisis_vivo: 15000 };
    const basePriceMonthly = customPlanDoc.basePriceMonthly || 12000;
    const timeDiscounts = customPlanDoc.timeDiscounts || { daily: 0, weekly: 0, monthly: 0, quarterly: 5, semiannual: 10, annual: 15 };

    let monthlyTotal = basePriceMonthly;
    for (const tool of selectedTools) {
        monthlyTotal += (toolPrices[tool] || 0);
    }

    const multipliers = {
        daily: 1 / 30, weekly: 7 / 30, monthly: 1,
        quarterly: 3, semiannual: 6, annual: 12,
    };

    const rawTotal = monthlyTotal * (multipliers[interval] || 1);
    const discount = timeDiscounts[interval] || 0;
    return Math.round(rawTotal * (1 - discount / 100));
};

/**
 * GET /api/wompi/plan
 * Returns the current user's plan information
 */
const getUserPlan = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const userPlan = await UserPlan.findOne({ userId }).lean();

        let plan = userPlan?.plan;

        if (!plan || plan === 'free') {
            const role = req.user.role;
            if (role === 'ADMIN') plan = 'admin';
            else if (role === 'USER_PRO') plan = 'pro';
            else if (role === 'USER_PLUS') plan = 'plus';
            else if (role === 'USER_GO') plan = 'go';
            else if (role === 'USER_CUSTOM') plan = 'custom';
            else if (role === 'USER_IPEVAR') plan = 'ipevar';
            else plan = 'free';
        }

        // Determine companyLimit
        let companyLimit = userPlan?.companyLimit;
        if (companyLimit === undefined || companyLimit === null) {
            if (plan === 'pro') {
                const User = mongoose.models.User || mongoose.model('User');
                const userDoc = await User.findById(userId).select('createdAt').lean();
                const userCreatedAt = userDoc?.createdAt ? new Date(userDoc.createdAt) : new Date();
                const CUTOFF_DATE = new Date('2026-06-23T13:00:00-05:00');
                companyLimit = userCreatedAt < CUTOFF_DATE ? 3 : 1;
            } else if (['admin', 'custom'].includes(plan)) {
                companyLimit = 999;
            } else {
                companyLimit = 1;
            }
        }

        // Determine storageLimit
        let storageLimit = userPlan?.storageLimit;
        if (storageLimit === undefined || storageLimit === null) {
            if (['pro', 'plus'].includes(plan)) {
                storageLimit = 3 * 1024 * 1024 * 1024;
            } else if (['admin', 'custom'].includes(plan)) {
                storageLimit = 200 * 1024 * 1024 * 1024; // 200 GB
            } else {
                storageLimit = 1 * 1024 * 1024 * 1024; // 1 GB
            }
        }

        // Calculate storageUsed
        const FileModel = mongoose.models.File || mongoose.model('File');
        const files = await FileModel.find({ user: userId }).select('bytes').lean();
        const totalUsedBytes = files.reduce((acc, file) => acc + (file.bytes || 0), 0);

        // Determine automationLimit (Pro: 1 by default, admin/custom: 999, free/ipevar/plus/go: 0)
        let automationLimit = userPlan?.automationLimit;
        if (automationLimit === undefined || automationLimit === null) {
            if (['admin', 'custom'].includes(plan)) {
                automationLimit = 999;
            } else if (plan === 'pro') {
                automationLimit = 1;
            } else {
                automationLimit = 0;
            }
        }

        // Determine subUserLimit (Pro: 1 by default, admin/custom: 999, free/ipevar/plus/go: 0)
        let subUserLimit = userPlan?.subUserLimit;
        if (subUserLimit === undefined || subUserLimit === null) {
            if (['admin', 'custom'].includes(plan)) {
                subUserLimit = 999;
            } else if (plan === 'pro') {
                subUserLimit = 1;
            } else {
                subUserLimit = 0;
            }
        }

        // Count user automations & subusers
        const AutomationModel = mongoose.models.Automation || mongoose.model('Automation');
        const UserModel = mongoose.models.User || mongoose.model('User');
        const [automationsCount, subUsersCount] = await Promise.all([
            AutomationModel.countDocuments({ user: userId }),
            UserModel.countDocuments({ parentUser: userId, isSubUser: true })
        ]);

        return res.json({
            plan: plan,
            status: 'active', // Derived for UI
            currentPeriodEnd: userPlan?.planExpiresAt || null,
            customTools: userPlan?.customTools || [],
            customInterval: userPlan?.customInterval || null,
            companyLimit,
            automationLimit,
            automationsCount,
            subUserLimit,
            subUsersCount,
            storageLimit,
            storageUsed: totalUsedBytes,
        });
    } catch (error) {
        console.error('[Wompi] getUserPlan error:', error);
        return res.status(500).json({ error: 'Error obteniendo el plan del usuario' });
    }
};

/**
 * Helper: Notify admins when a payment happens (manual QR or automatic)
 */
const notifyAdminsOfPayment = async (wompiTx, user, isManual) => {
    try {
        const User = mongoose.model('User');
        const admins = await User.find({ role: 'ADMIN' }).select('_id').lean();
        if (admins.length === 0) return;

        const Notification = require('~/models/Notification');

        if (isManual) {
            const Ticket = require('~/models/Ticket');
            const newTicket = await Ticket.create({
                name: user?.name || user?.username || 'Usuario',
                email: user?.email || 'N/A',
                phone: user?.phoneNumber || 'N/A',
                type: 'Revisión de Pago',
                description: `Se ha registrado un pago manual por QR Nequi.\nPlan: ${wompiTx.planId} (${wompiTx.interval})\nMonto: $${(wompiTx.amountInCents / 100).toLocaleString('es-CO')}`,
                user: wompiTx.userId,
                attachments: wompiTx.receiptUrl ? [wompiTx.receiptUrl] : [],
                status: 'pending'
            });

            const notifs = admins.map(a => ({
                user: a._id,
                type: 'ticket_created',
                title: 'Revisión de Pago Nequi QR',
                body: `Se ha recibido un comprobante de pago de ${user?.name || 'un usuario'}. Revísalo en tus tickets.`,
                ticketId: newTicket._id
            }));
            await Notification.insertMany(notifs);
        } else {
            const notifs = admins.map(a => ({
                user: a._id,
                type: 'payment_received',
                title: 'Pago automático exitoso',
                body: `Se ha procesado exitosamente el pago del plan ${wompiTx.planId} (${wompiTx.interval}) para ${user?.name || user?.username || 'un usuario'}.`
            }));
            await Notification.insertMany(notifs);
        }
    } catch (e) {
        console.error('[WompiController] Error notifying admins of payment:', e);
    }
};

/**
 * POST /api/wompi/create-transaction
 * Expects { plan: 'go|monthly', promoCode: 'SUMMER20' }
 * Generates a unique referenced transaction in MongoDB for tracking,
 * Calculates the final price locally to prevent frontend manipulation,
 * Returns reference, AMOUNT_IN_CENTS, and public Key to launch widget.
 */
const createTransaction = async (req, res) => {
    try {
        const { plan: planString, promoCode, extraCompanies } = req.body;
        if (!planString) return res.status(400).json({ error: 'Faltan parámetros' });

        const [planId, interval] = planString.split('|');
        if (!PLAN_NAMES[planId] || !VALID_INTERVALS.includes(interval)) {
            return res.status(400).json({ error: 'Plan o intervalo inválido' });
        }

        const userId = req.user._id || req.user.id;

        // Fetch dynamic plan config to calculate real price
        let planDoc = await Plan.findOne({ planId }).lean();
        
        if (!planDoc && planId === 'ipevar') {
            // Auto-seed ipevar if missing
            await Plan.create({ planId: 'ipevar', name: 'IPEVAR', prices: { monthly: 0, quarterly: 0, semiannual: 0, annual: 250000 } });
            planDoc = await Plan.findOne({ planId }).lean();
        }

        if (!planDoc) {
            return res.status(500).json({ error: `Configuración para el plan ${planId} no encontrada en DB` });
        }

        let rawPrice = planDoc.prices?.[interval] || 0;
        if (rawPrice === 0) {
            return res.status(500).json({ error: `Monto base no configurado para el plan ${planId} (${interval})` });
        }

        let finalPrice = rawPrice;
        let appliedDiscount = 0;

        // Apply promo Code if provided
        if (promoCode) {
            const cleanCode = promoCode.toUpperCase().trim();
            if (cleanCode === 'VITAL30' && planId === 'ipevar') {
                appliedDiscount = 30;
            } else {
                const codeDoc = await PromoCode.findOne({ code: cleanCode, active: true });
                if (codeDoc) {
                    const isValid = await checkWelcomeCodeExpiry(codeDoc, userId);
                    if (!isValid) {
                        return res.status(400).json({ error: 'El código de bienvenida ha expirado para tu cuenta (válido solo por 48 horas tras el registro).' });
                    }
                    appliedDiscount = codeDoc.discountPercentage;
                }
            }
        }
        // Fallback to default promotions if no explicit PromoCode is given or found
        else if (planDoc.promotions?.[interval]?.active) {
            appliedDiscount = planDoc.promotions[interval].discountPercentage;
        }

        if (appliedDiscount > 0) {
            finalPrice = rawPrice - (rawPrice * Math.min(appliedDiscount, 100) / 100);
        }

        // Add additional companies cost
        const extraCompaniesCount = extraCompanies ? Math.min(9, Math.max(0, parseInt(extraCompanies, 10))) : 0;
        const canAddExtraCompanies = ['pro', 'plus', 'go'].includes(planId);
        const extraCompanyCost = (canAddExtraCompanies && extraCompaniesCount > 0)
            ? extraCompaniesCount * getExtraCompanyPrice(interval)
            : 0;

        finalPrice += extraCompanyCost;

        // Generate a 15-char unique reference (needed by Wompi)
        const reference = `WAPPY-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const amountInCents = Math.round(finalPrice * 100);

        // Store transaction state to catch it on webhook
        await WompiTransaction.create({
            userId,
            planId,
            interval,
            reference,
            amountInCents,
            status: 'PENDING',
            extraCompanies: extraCompaniesCount
        });

        // Wompi keys
        const publicKey = process.env.WOMPI_PUBLIC_KEY;
        if (!publicKey) {
            throw new Error('WOMPI_PUBLIC_KEY no configurada');
        }

        // Provide INTEGRITY signature since it's required in modern Wompi Accounts to prevent manipulation
        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET || '';
        let signature = '';
        if (integritySecret) {
            // hash = sha256(reference + amountInCents + currency + integritySecret)
            const stringToSign = `${reference}${amountInCents}COP${integritySecret}`;
            signature = crypto.createHash('sha256').update(stringToSign, 'utf-8').digest('hex');
        }

        return res.json({
            publicKey,
            reference,
            amountInCents,
            currency: 'COP',
            signature
        });

    } catch (error) {
        console.error('[Wompi] create-transaction error:', error);
        return res.status(500).json({ error: 'Error inicializando pago con Wompi', details: error.message });
    }
};

/**
 * POST /api/wompi/webhook
 * Wompi calls this when a transaction is updated (approved, declined, etc.)
 */
const handleWebhook = async (req, res) => {
    let logDoc = null;
    try {
        const event = req.body;
        console.log('[Wompi Webhook] Event received:', event?.event);

        if (!event || event.event !== 'transaction.updated') {
            return res.status(200).send('Event not processed');
        }

        const transactionData = event.data?.transaction;
        if (!transactionData) return res.status(400).send('Malformed payload');

        const { reference, status, id: transactionId } = transactionData;
        console.log(`[Wompi Webhook] Transaction ${transactionId} status is ${status} (ref: ${reference})`);

        logDoc = new WompiWebhookLog({
            event: event.event,
            reference,
            status,
            payload: event,
            verified: false
        });

        // Validate integrity of payload (Security)
        const receivedChecksum = event.signature?.checksum;
        const properties = event.signature?.properties || [];
        const timestamp = event.timestamp;
        const eventsSecret = process.env.WOMPI_EVENTS_SECRET;

        logDoc.receivedChecksum = receivedChecksum;

        if (receivedChecksum && eventsSecret && timestamp) {
            let concatenatedString = '';
            for (const propPath of properties) {
                const keys = propPath.split('.');
                let value = event.data;
                for (const key of keys) {
                    value = value?.[key];
                }
                concatenatedString += value;
            }
            concatenatedString += timestamp;
            concatenatedString += eventsSecret;

            const computedChecksum = crypto.createHash('sha256').update(concatenatedString, 'utf-8').digest('hex');
            logDoc.computedChecksum = computedChecksum;

            if (computedChecksum !== receivedChecksum) {
                console.error('[Wompi Webhook] ⚠️ INVALID CHECKSUM. Potential tampering or misconfiguration.');
                logDoc.error = 'Invalid checksum';
                await logDoc.save();
                return res.status(401).send('Invalid signature');
            }
            console.log('[Wompi Webhook] ✅ Signature verified successfully.');
            logDoc.verified = true;
        } else {
            console.warn('[Wompi Webhook] ⚠️ No signature, secret or timestamp found for verification. Skipping security check.');
            logDoc.error = 'Verification skipped (missing secret or signature)';
            logDoc.verified = true; // skip security
        }

        // Update transaction in our DB
        if (reference && (reference.startsWith('WAP-COM-') || reference.startsWith('WAP-VIT-'))) {
            const ComunidadPurchase = require('../../models/ComunidadPurchase');
            const purchase = await ComunidadPurchase.findOne({ wompiReference: reference });
            if (!purchase) {
                console.error('[Wompi Webhook] Unknown Comunidad reference:', reference);
                logDoc.error = `Unknown Comunidad reference: ${reference}`;
                await logDoc.save();
                return res.status(200).send('Reference unknown');
            }
            const wasAlreadyApproved = purchase.isPaid === true || purchase.status === 'APPROVED';
            purchase.status = status;
            if (status === 'APPROVED') {
                purchase.isPaid = true;

                // Auto-provision Wappy Vital plan (role USER_IPEVAR) if reference is WAP-VIT-
                if (reference.startsWith('WAP-VIT-') && !wasAlreadyApproved) {
                    try {
                        const User = mongoose.model('User');
                        const normEmail = purchase.email.toLowerCase().trim();
                        let user = await User.findOne({ email: normEmail });
                        if (!user) {
                            const { createUser } = require('../../models');
                            const { getAppConfig } = require('../services/Config');
                            const appConfig = await getAppConfig();
                            const bcrypt = require('bcryptjs');
                            const salt = bcrypt.genSaltSync(10);
                            const plainPassword = purchase.password || purchase.phone.trim();
                            const hashedPassword = bcrypt.hashSync(plainPassword, salt);

                            let username = normEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
                            let userWithUsername = await User.findOne({ username });
                            if (userWithUsername) {
                                username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;
                            }

                            const newUserData = {
                                provider: 'local',
                                email: normEmail,
                                username,
                                name: purchase.fullName.trim(),
                                phoneNumber: purchase.phone.trim(),
                                avatar: null,
                                role: 'USER_IPEVAR',
                                accountStatus: 'active',
                                password: hashedPassword,
                            };

                            user = await createUser(newUserData, appConfig?.balance, true, true);
                            console.log(`[Wompi Webhook] Auto-created user ${user._id} (${normEmail}) with default password (phone: ${purchase.phone})`);
                        } else {
                            // Use updateOne to avoid Mongoose validation issues with partial documents
                            await User.updateOne(
                                { _id: user._id },
                                { $set: { role: 'USER_IPEVAR', accountStatus: 'active', activeAt: new Date(), inactiveAt: null } }
                            );
                        }

                        // Update/Create UserPlan
                        await UserPlan.findOneAndUpdate(
                            { userId: user._id },
                            {
                                plan: 'ipevar',
                                planExpiresAt: null,   // Lifetime — no expiry
                                planInterval: null,    // Lifetime has no interval
                                cancelAtPeriodEnd: false
                            },
                            { upsert: true, new: true }
                        );
                        console.log(`[Wompi Webhook] ✅ Auto-provisioned Wappy Vital plan (USER_IPEVAR) for user ${user._id} (${normEmail})`);
                    } catch (provErr) {
                        console.error('[Wompi Webhook] Error provisioning Wappy Vital for WAP-VIT purchase:', provErr);
                    }
                }
            }
            await purchase.save();
            console.log(`[Wompi Webhook] Updated ComunidadPurchase ${reference} to ${status}. Paid: ${purchase.isPaid}`);
            
            await logDoc.save();
            return res.status(200).send('OK');
        }

        const wompiTx = await WompiTransaction.findOne({ reference });
        if (!wompiTx) {
            console.error('[Wompi Webhook] Unknown reference:', reference);
            logDoc.error = `Unknown reference: ${reference}`;
            await logDoc.save();
            return res.status(200).send('Reference unknown');
        }

        const wasAlreadyApproved = wompiTx.status === 'APPROVED';
        wompiTx.status = status;
        wompiTx.transactionId = transactionId;
        await wompiTx.save();

        if (status === 'APPROVED' && !wasAlreadyApproved) {
            // Verify plan exists in DB
            const planDoc = await Plan.findOne({ planId: wompiTx.planId }).lean();
            if (!planDoc) {
                console.error('[Wompi Webhook] Missing plan in DB for provisioning.', wompiTx.planId);
                logDoc.error = `Missing plan in DB for provisioning: ${wompiTx.planId}`;
                await logDoc.save();
                return res.status(200).send('OK'); // don't fail Wompi
            }

            let userId = wompiTx.userId;
            if (!userId && wompiTx.guestEmail) {
                const User = mongoose.model('User');
                const normEmail = wompiTx.guestEmail.toLowerCase().trim();
                let user = await User.findOne({ email: normEmail });
                if (!user) {
                    const { createUser } = require('../../models');
                    const { getAppConfig } = require('../services/Config');
                    const appConfig = await getAppConfig();
                    const bcrypt = require('bcryptjs');

                    let username = normEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
                    let userWithUsername = await User.findOne({ username });
                    if (userWithUsername) {
                        username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;
                    }

                    const newUserData = {
                        provider: 'local',
                        email: normEmail,
                        username,
                        name: wompiTx.guestName.trim(),
                        phoneNumber: wompiTx.guestPhone ? wompiTx.guestPhone.trim() : '',
                        avatar: null,
                        role: 'USER',
                        accountStatus: 'active',
                        password: wompiTx.guestPassword, // already hashed
                    };

                    user = await createUser(newUserData, appConfig?.balance, true, true);
                    console.log(`[Wompi Webhook] Auto-created user ${user._id} (${normEmail}) for guest checkout after payment approval`);
                }
                userId = user._id;
                wompiTx.userId = userId;
                await wompiTx.save();
            }

            let userPlan = await UserPlan.findOne({ userId });

            // ── Option 2: Time Compensation Proration ──────────────────────
            // Same tier → stack 1:1. Different tier → convert unused $ to days of new plan.
            const expiryDate = await calculateProratedExpiry(wompiTx.planId, wompiTx.interval, userPlan);

            if (!userPlan) {
                userPlan = new UserPlan({ userId });
            }

            userPlan.plan = wompiTx.planId;
            userPlan.planExpiresAt = expiryDate;
            userPlan.planInterval = wompiTx.interval; // Track interval for downgrade-on-expiry rules

            // Set limits based on transaction extraCompanies
            const extraCount = Math.min(9, wompiTx.extraCompanies || 0);
            userPlan.companyLimit = 1 + extraCount;

            // Set storage limits (pro/plus get 3GB, others 1GB base, plus 1GB per extra company)
            const baseStorageGB = ['pro', 'plus'].includes(wompiTx.planId) ? 3 : 1;
            const totalStorageBytes = (baseStorageGB + extraCount) * 1024 * 1024 * 1024;
            userPlan.storageLimit = totalStorageBytes;

            await userPlan.save();

            // Also update User role for full platform compatibility
            const User = mongoose.model('User');
            let newRole = 'USER';
            if (wompiTx.planId === 'custom') newRole = 'USER_CUSTOM';
            else if (wompiTx.planId === 'ipevar') newRole = 'USER_IPEVAR';
            else if (wompiTx.planId === 'go') newRole = 'USER_GO';
            else if (wompiTx.planId === 'plus') newRole = 'USER_PLUS';
            else if (wompiTx.planId === 'pro') newRole = 'USER_PRO';

            const updateFields = {
                role: newRole,
                accountStatus: 'active',
                activeAt: new Date(),
                inactiveAt: expiryDate
            };

            await User.updateOne(
                { _id: wompiTx.userId },
                { $set: updateFields }
            );

            // If custom plan, also store custom tools in UserPlan
            if (wompiTx.planId === 'custom' && wompiTx.customTools?.length > 0) {
                await UserPlan.updateOne(
                    { userId: wompiTx.userId },
                    { $set: { customTools: wompiTx.customTools, customInterval: wompiTx.interval } }
                );
            }

            console.log(`[Wompi Webhook] Provisioned plan ${wompiTx.planId} (${wompiTx.interval}), role ${newRole}, expiry ${expiryDate.toISOString()} for user ${wompiTx.userId} via tx ${transactionId}`);
            
            // Trigger referral/affiliate commission & points processing
            try {
                const { processSuccessfulPurchase } = require('~/server/services/ReferralService');
                await processSuccessfulPurchase({
                    userId: wompiTx.userId,
                    transactionId: transactionId,
                    planId: wompiTx.planId,
                    interval: wompiTx.interval,
                    amountInCents: wompiTx.amountInCents
                });
            } catch (refErr) {
                console.error('[Wompi Webhook] Error triggering processSuccessfulPurchase:', refErr);
            }

            // Notify admins
            try {
                const userDoc = await User.findById(wompiTx.userId).lean();
                await notifyAdminsOfPayment(wompiTx, userDoc, false);
            } catch (e) {
                console.error('[Wompi Webhook] Error fetching user for notification', e);
            }
        }

        await logDoc.save();
        return res.status(200).send('OK');

    } catch (err) {
        console.error('[Wompi Webhook] Error processing:', err);
        if (logDoc) {
            logDoc.error = err.message;
            await logDoc.save().catch(() => {});
        }
        return res.status(500).send('Internal Server Error');
    }
};

/**
 * POST /api/wompi/verify-transaction
 * Frontend calls this synchronously when Wompi Checkout completes.
 * Directly asks Wompi API for the transaction status, then provisions plan if APPROVED,
 * ensuring no race condition with webhooks.
 */
const verifyTransaction = async (req, res) => {
    try {
        const { transactionId } = req.body;
        if (!transactionId) return res.status(400).json({ error: 'Falta ID de transacción' });

        const isSandbox = process.env.WOMPI_PUBLIC_KEY?.startsWith('pub_test_');
        const wompiDomain = isSandbox ? 'sandbox.wompi.co' : 'production.wompi.co';
        
        // Fetch real transaction info from Wompi
        const headers = {};
        if (process.env.WOMPI_PRIVATE_KEY) {
            headers['Authorization'] = `Bearer ${process.env.WOMPI_PRIVATE_KEY}`;
        }
        const response = await fetch(`https://${wompiDomain}/v1/transactions/${transactionId}`, { headers });
        const result = await response.json();
        const txData = result.data;
        if (!txData) return res.status(404).json({ error: 'Transacción no encontrada en Wompi' });

        if (txData.status !== 'APPROVED') {
            return res.json({ status: txData.status });
        }

        const wompiTx = await WompiTransaction.findOne({ reference: txData.reference });
        if (!wompiTx) return res.json({ status: 'UNKNOWN_REFERENCE' });

        // If it's already approved by webhook, great. If not, we provision right now.
        if (wompiTx.status !== 'APPROVED') {
            wompiTx.status = 'APPROVED';
            wompiTx.transactionId = transactionId;
            await wompiTx.save();

            const planDoc = await Plan.findOne({ planId: wompiTx.planId }).lean();
            if (planDoc) {
                let userPlan = await UserPlan.findOne({ userId: wompiTx.userId });

                // ── Option 2: Time Compensation Proration ──────────────────────
                const expiryDate = await calculateProratedExpiry(wompiTx.planId, wompiTx.interval, userPlan);

                if (!userPlan) {
                    userPlan = new UserPlan({ userId: wompiTx.userId });
                }
                userPlan.plan = wompiTx.planId;
                userPlan.planExpiresAt = expiryDate;
                userPlan.planInterval = wompiTx.interval; // Track interval for downgrade-on-expiry rules

                // Set limits based on transaction extraCompanies
                const extraCount = Math.min(9, wompiTx.extraCompanies || 0);
                userPlan.companyLimit = 1 + extraCount;

                // Set storage limits (pro/plus get 3GB, others 1GB base, plus 1GB per extra company)
                const baseStorageGB = ['pro', 'plus'].includes(wompiTx.planId) ? 3 : 1;
                const totalStorageBytes = (baseStorageGB + extraCount) * 1024 * 1024 * 1024;
                userPlan.storageLimit = totalStorageBytes;

                await userPlan.save();

                const User = mongoose.model('User');
                let newRole = 'USER';
                if (wompiTx.planId === 'custom') newRole = 'USER_CUSTOM';
                else if (wompiTx.planId === 'ipevar') newRole = 'USER_IPEVAR';
                else if (wompiTx.planId === 'go') newRole = 'USER_GO';
                else if (wompiTx.planId === 'plus') newRole = 'USER_PLUS';
                else if (wompiTx.planId === 'pro') newRole = 'USER_PRO';

                await User.updateOne(
                    { _id: wompiTx.userId },
                    { $set: { role: newRole, accountStatus: 'active', activeAt: new Date(), inactiveAt: expiryDate } }
                );

                // If custom plan, also store custom tools in UserPlan
                if (wompiTx.planId === 'custom' && wompiTx.customTools?.length > 0) {
                    await UserPlan.updateOne(
                        { userId: wompiTx.userId },
                        { $set: { customTools: wompiTx.customTools, customInterval: wompiTx.interval } }
                    );
                }
                console.log(`[Wompi VerifyTransaction] Provisioned plan ${wompiTx.planId} (${wompiTx.interval}), expiry ${expiryDate.toISOString()} for user ${wompiTx.userId}`);

                // Trigger referral/affiliate commission & points processing
                try {
                    const { processSuccessfulPurchase } = require('~/server/services/ReferralService');
                    await processSuccessfulPurchase({
                        userId: wompiTx.userId,
                        transactionId: transactionId,
                        planId: wompiTx.planId,
                        interval: wompiTx.interval,
                        amountInCents: wompiTx.amountInCents
                    });
                } catch (refErr) {
                    console.error('[Wompi VerifyTransaction] Error triggering processSuccessfulPurchase:', refErr);
                }

                
                try {
                    const userDoc = await User.findById(wompiTx.userId).lean();
                    await notifyAdminsOfPayment(wompiTx, userDoc, false);
                } catch (e) {
                    console.error('[Wompi VerifyTransaction] Error fetching user for notification', e);
                }
            }
        }

        return res.json({ success: true, status: 'APPROVED' });
    } catch (err) {
        console.error('[Wompi VerifyTransaction] error:', err);
        return res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/wompi/register-pending
 * Called by the frontend when the Wompi widget returns PENDING (e.g. Compra y Paga Después).
 * Stores the real Wompi transactionId on the WompiTransaction record so the poller can query it.
 */
const registerPendingTransaction = async (req, res) => {
    try {
        const { reference, transactionId } = req.body;
        if (!reference || !transactionId) {
            return res.status(400).json({ error: 'Faltan referencia o ID de transacción' });
        }

        const updated = await WompiTransaction.findOneAndUpdate(
            { reference, userId: req.user._id || req.user.id },
            { $set: { transactionId, status: 'PENDING' } },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ error: 'Transacción no encontrada' });
        }

        console.log(`[Wompi] Registered pending transactionId ${transactionId} for reference ${reference}`);
        return res.json({ success: true });
    } catch (err) {
        console.error('[Wompi] registerPendingTransaction error:', err);
        return res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/wompi/manual-receipt
 * Handles Nequi QR payment submissions. 5% discount applies.
 */
const createManualTransaction = async (req, res) => {
    try {
        const { plan: planString, promoCode, extraCompanies } = req.body;
        if (!planString || !req.file) {
            return res.status(400).json({ error: 'Faltan parámetros o el comprobante de pago' });
        }

        const [planId, interval] = planString.split('|');
        if (!PLAN_NAMES[planId] || !VALID_INTERVALS.includes(interval)) {
            return res.status(400).json({ error: 'Plan o intervalo inválido' });
        }

        const userId = req.user._id || req.user.id;
        let planDoc = await Plan.findOne({ planId }).lean();
        
        if (!planDoc && planId === 'ipevar') {
            // Auto-seed ipevar if missing
            await Plan.create({ planId: 'ipevar', name: 'IPEVAR', prices: { monthly: 0, quarterly: 0, semiannual: 0, annual: 250000 } });
            planDoc = await Plan.findOne({ planId }).lean();
        }

        if (!planDoc) {
            return res.status(500).json({ error: `Configuración para el plan ${planId} no encontrada` });
        }

        let rawPrice = planDoc.prices?.[interval] || 0;
        if (rawPrice === 0) {
            return res.status(500).json({ error: `Monto base no configurado` });
        }

        let finalPrice = rawPrice;
        let appliedDiscount = 0;

        // Apply promo Code if provided
        if (promoCode) {
            const cleanCode = promoCode.toUpperCase().trim();
            if (cleanCode === 'VITAL30' && planId === 'ipevar') {
                appliedDiscount = 30;
            } else {
                const codeDoc = await PromoCode.findOne({ code: cleanCode, active: true });
                if (codeDoc) {
                    const isValid = await checkWelcomeCodeExpiry(codeDoc, userId);
                    if (!isValid) {
                        return res.status(400).json({ error: 'El código de bienvenida ha expirado para tu cuenta (válido solo por 48 horas tras el registro).' });
                    }
                    appliedDiscount = codeDoc.discountPercentage;
                }
            }
        } else if (planDoc.promotions?.[interval]?.active) {
            appliedDiscount = planDoc.promotions[interval].discountPercentage;
        }

        if (appliedDiscount > 0) {
            finalPrice = rawPrice - (rawPrice * Math.min(appliedDiscount, 100) / 100);
        }

        // Add additional companies cost before the Nequi discount
        const extraCompaniesCount = extraCompanies ? Math.min(9, Math.max(0, parseInt(extraCompanies, 10))) : 0;
        const canAddExtraCompanies = ['pro', 'plus', 'go'].includes(planId);
        const extraCompanyCost = (canAddExtraCompanies && extraCompaniesCount > 0)
            ? extraCompaniesCount * getExtraCompanyPrice(interval)
            : 0;

        finalPrice += extraCompanyCost;

        // Apply 5% discount for Nequi QR
        finalPrice = finalPrice * 0.95;

        const reference = `WAPPY-NQ-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const amountInCents = Math.round(finalPrice * 100);

        // Move the file from temp to a permanent receipts folder
        const fs = require('fs');
        const path = require('path');
        const appConfig = await getAppConfig();
        const uploadsDir = appConfig.paths.uploads;
        const receiptsDir = path.join(uploadsDir, 'receipts', userId.toString());
        
        console.log('[Wompi Manual] Moving file:', req.file.path, '->', receiptsDir);
        
        if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir, { recursive: true });
        }
        
        const permanentPath = path.join(receiptsDir, req.file.filename);
        try { 
            fs.renameSync(req.file.path, permanentPath); 
        } catch(e) { 
            console.error('[Wompi Manual] Could not move file:', e.message); 
            // Fallback for cross-partition moves
            try {
                fs.copyFileSync(req.file.path, permanentPath);
                fs.unlinkSync(req.file.path);
            } catch(copyErr) {
                console.error('[Wompi Manual] Cross-partition copy failed:', copyErr.message);
            }
        }

        // Store a web-accessible API URL, not the raw filesystem path
        const receiptUrl = `/api/wompi/receipt/${userId}/${encodeURIComponent(req.file.filename)}`;

        const wompiTx = await WompiTransaction.create({
            userId,
            planId,
            interval,
            reference,
            amountInCents,
            status: 'PENDING_MANUAL_REVIEW',
            paymentMethod: 'NEQUI_QR',
            receiptUrl,
            extraCompanies: extraCompaniesCount
        });

        // Notify admins about the manual payment so they can review
        const userDoc = req.user || await mongoose.model('User').findById(userId).lean();
        await notifyAdminsOfPayment(wompiTx, userDoc, true);

        return res.json({ success: true, reference, message: 'Pago manual registrado exitosamente.' });

    } catch (error) {
        console.error('[Wompi Manual] createManualTransaction error:', error);
        return res.status(500).json({ error: 'Error procesando pago manual', details: error.message });
    }
};

/**
 * POST /api/wompi/guest-checkout  (NO auth required)
 * Registers a new user (or finds existing) + creates a Wompi transaction in one step.
 * Returns transaction data + a short-lived guestToken for post-payment verification.
 */
const guestCheckout = async (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        const bcrypt = require('bcryptjs');
        const { name, email, password, plan: planString, promoCode, phone, extraCompanies } = req.body;

        if (!name || !email || !password || !planString) {
            return res.status(400).json({ error: 'Faltan campos: name, email, password, plan' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }

        const [planId, interval] = planString.split('|');
        if (!PLAN_NAMES[planId] || !VALID_INTERVALS.includes(interval)) {
            return res.status(400).json({ error: 'Plan o intervalo inválido' });
        }

        // ── 1. Find existing user ────────────────────────────────────────
        const User = mongoose.model('User');
        const normEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: normEmail });

        let userId = undefined;
        let guestName = undefined;
        let guestEmail = undefined;
        let guestPassword = undefined;
        let guestPhone = undefined;

        if (user) {
            userId = user._id;
            console.log(`[GuestCheckout] Found existing user ${user._id} for ${email}`);
        } else {
            const hashedPassword = await bcrypt.hash(password, 12);
            guestName = name;
            guestEmail = normEmail;
            guestPassword = hashedPassword;
            guestPhone = phone || '';
            console.log(`[GuestCheckout] User does not exist for ${email}. Deferring registration until payment.`);
        }

        // ── 2. Calculate price (same logic as createTransaction) ──────────
        let planDoc = await Plan.findOne({ planId }).lean();
        if (!planDoc && planId === 'ipevar') {
            await Plan.create({ planId: 'ipevar', name: 'IPEVAR', prices: { monthly: 0, quarterly: 0, semiannual: 0, annual: 250000 } });
            planDoc = await Plan.findOne({ planId }).lean();
        }
        if (!planDoc) return res.status(500).json({ error: `Plan ${planId} no configurado en DB` });

        let rawPrice = planDoc.prices?.[interval] || 0;
        if (rawPrice === 0) return res.status(500).json({ error: 'Monto base no configurado' });

        let finalPrice = rawPrice;
        let appliedDiscount = 0;

        if (promoCode) {
            const cleanCode = promoCode.toUpperCase().trim();
            if (cleanCode === 'VITAL30' && planId === 'ipevar') {
                appliedDiscount = 30;
            } else {
                const codeDoc = await PromoCode.findOne({ code: cleanCode, active: true });
                if (codeDoc) {
                    let isPromoValid = true;
                    if (user) {
                        isPromoValid = await checkWelcomeCodeExpiry(codeDoc, user._id);
                    }
                    if (isPromoValid) {
                        appliedDiscount = codeDoc.discountPercentage;
                    } else {
                        return res.status(400).json({ error: 'El código de bienvenida ha expirado para tu cuenta (válido solo por 48 horas tras el registro).' });
                    }
                }
            }
        } else if (planDoc.promotions?.[interval]?.active) {
            appliedDiscount = planDoc.promotions[interval].discountPercentage;
        }

        if (appliedDiscount > 0) {
            finalPrice = rawPrice - (rawPrice * Math.min(appliedDiscount, 100) / 100);
        }

        // Add additional companies cost
        const extraCompaniesCount = extraCompanies ? Math.min(9, Math.max(0, parseInt(extraCompanies, 10))) : 0;
        const canAddExtraCompanies = ['pro', 'plus', 'go'].includes(planId);
        const extraCompanyCost = (canAddExtraCompanies && extraCompaniesCount > 0)
            ? extraCompaniesCount * getExtraCompanyPrice(interval)
            : 0;

        finalPrice += extraCompanyCost;

        // ── 3. Create transaction record ──────────────────────────────────
        const reference = `WAPPY-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const amountInCents = Math.round(finalPrice * 100);

        await WompiTransaction.create({
            userId,
            planId,
            interval,
            reference,
            amountInCents,
            status: 'PENDING',
            guestName,
            guestEmail,
            guestPassword,
            guestPhone,
            extraCompanies: extraCompaniesCount
        });

        // ── 4. Wompi integrity signature ──────────────────────────────────
        const publicKey = process.env.WOMPI_PUBLIC_KEY;
        if (!publicKey) return res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no configurada' });

        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET || '';
        let signature = '';
        if (integritySecret) {
            const stringToSign = `${reference}${amountInCents}COP${integritySecret}`;
            signature = crypto.createHash('sha256').update(stringToSign, 'utf-8').digest('hex');
        }

        // ── 5. Short-lived JWT for post-payment verification ──────────────
        const jwtSecret = process.env.JWT_SECRET;
        const guestToken = jwt.sign({ reference }, jwtSecret, { expiresIn: '2h' });

        console.log(`[GuestCheckout] Transaction ${reference} created for ${email}`);

        return res.json({ publicKey, reference, amountInCents, currency: 'COP', signature, guestToken });
    } catch (error) {
        console.error('[Wompi] guestCheckout error:', error);
        return res.status(500).json({ error: 'Error en guest checkout', details: error.message });
    }
};

/**
 * POST /api/wompi/guest-verify  (NO auth required)
 * Verifies a Wompi transaction using a guestToken issued by guestCheckout.
 */
const guestVerifyTransaction = async (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        const { transactionId, guestToken } = req.body;
        if (!transactionId || !guestToken) {
            return res.status(400).json({ error: 'Faltan transactionId o guestToken' });
        }

        // Validate guest token
        let decoded;
        try {
            decoded = jwt.verify(guestToken, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ error: 'guestToken inválido o expirado' });
        }

        // Use same logic as verifyTransaction but with userId from token
        const isSandbox = process.env.WOMPI_PUBLIC_KEY?.startsWith('pub_test_');
        const wompiDomain = isSandbox ? 'sandbox.wompi.co' : 'production.wompi.co';
        const headers = {};
        if (process.env.WOMPI_PRIVATE_KEY) {
            headers['Authorization'] = `Bearer ${process.env.WOMPI_PRIVATE_KEY}`;
        }
        const response = await fetch(`https://${wompiDomain}/v1/transactions/${transactionId}`, { headers });
        const result = await response.json();
        const txData = result.data;
        if (!txData) return res.status(404).json({ error: 'Transacción no encontrada en Wompi' });

        if (txData.status !== 'APPROVED') {
            return res.json({ status: txData.status });
        }

        const wompiTx = await WompiTransaction.findOne({ reference: txData.reference });
        if (!wompiTx) return res.json({ status: 'UNKNOWN_REFERENCE' });

        if (wompiTx.status !== 'APPROVED') {
            wompiTx.status = 'APPROVED';
            wompiTx.transactionId = transactionId;
            await wompiTx.save();

            let userId = wompiTx.userId;
            if (!userId && wompiTx.guestEmail) {
                const User = mongoose.model('User');
                const normEmail = wompiTx.guestEmail.toLowerCase().trim();
                let user = await User.findOne({ email: normEmail });
                if (!user) {
                    const { createUser } = require('../../models');
                    const { getAppConfig } = require('../services/Config');
                    const appConfig = await getAppConfig();
                    const bcrypt = require('bcryptjs');

                    let username = normEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
                    let userWithUsername = await User.findOne({ username });
                    if (userWithUsername) {
                        username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;
                    }

                    const newUserData = {
                        provider: 'local',
                        email: normEmail,
                        username,
                        name: wompiTx.guestName.trim(),
                        phoneNumber: wompiTx.guestPhone ? wompiTx.guestPhone.trim() : '',
                        avatar: null,
                        role: 'USER',
                        accountStatus: 'active',
                        password: wompiTx.guestPassword, // already hashed
                    };

                    user = await createUser(newUserData, appConfig?.balance, true, true);
                    console.log(`[GuestVerify] Auto-created user ${user._id} (${normEmail}) after payment approval`);
                }
                userId = user._id;
                wompiTx.userId = userId;
                await wompiTx.save();
            }

            const planDoc = await Plan.findOne({ planId: wompiTx.planId }).lean();
            if (planDoc) {
                let userPlan = await UserPlan.findOne({ userId });
                const expiryDate = await calculateProratedExpiry(wompiTx.planId, wompiTx.interval, userPlan);

                if (!userPlan) userPlan = new UserPlan({ userId });
                userPlan.plan = wompiTx.planId;
                userPlan.planExpiresAt = expiryDate;
                await userPlan.save();

                const User = mongoose.model('User');
                let newRole = 'USER';
                if (wompiTx.planId === 'custom') newRole = 'USER_CUSTOM';
                else if (wompiTx.planId === 'ipevar') newRole = 'USER_IPEVAR';
                else if (wompiTx.planId === 'go') newRole = 'USER_GO';
                else if (wompiTx.planId === 'plus') newRole = 'USER_PLUS';
                else if (wompiTx.planId === 'pro') newRole = 'USER_PRO';

                await User.updateOne(
                    { _id: userId },
                    { $set: { role: newRole, accountStatus: 'active', activeAt: new Date(), inactiveAt: expiryDate } }
                );

                // If custom plan, also store custom tools in UserPlan
                if (wompiTx.planId === 'custom' && wompiTx.customTools?.length > 0) {
                    await UserPlan.updateOne(
                        { userId: wompiTx.userId },
                        { $set: { customTools: wompiTx.customTools, customInterval: wompiTx.interval } }
                    );
                }
                console.log(`[GuestVerify] Plan ${wompiTx.planId} activated for user ${wompiTx.userId}`);

                // Trigger referral/affiliate commission & points processing
                try {
                    const { processSuccessfulPurchase } = require('~/server/services/ReferralService');
                    await processSuccessfulPurchase({
                        userId: wompiTx.userId,
                        transactionId: transactionId,
                        planId: wompiTx.planId,
                        interval: wompiTx.interval,
                        amountInCents: wompiTx.amountInCents
                    });
                } catch (refErr) {
                    console.error('[Wompi GuestVerify] Error triggering processSuccessfulPurchase:', refErr);
                }

                
                try {
                    const userDoc = await User.findById(wompiTx.userId).lean();
                    await notifyAdminsOfPayment(wompiTx, userDoc, false);
                } catch (e) {
                    console.error('[Wompi GuestVerifyTransaction] Error fetching user for notification', e);
                }
            }
        }

        return res.json({ success: true, status: 'APPROVED' });
    } catch (err) {
        console.error('[Wompi] guestVerifyTransaction error:', err);
        return res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/wompi/custom-plan-config
 * Returns the custom plan configuration (tool prices, base price, discounts)
 */
const getCustomPlanConfig = async (req, res) => {
    try {
        let customPlan = await Plan.findOne({ planId: 'custom' }).lean();
        if (!customPlan) {
            // Auto-seed custom plan config
            customPlan = await Plan.create({
                planId: 'custom',
                name: 'Plan a la Medida',
                prices: { monthly: 0, quarterly: 0, semiannual: 0, annual: 0 },
                toolPrices: {
                    blog: 5000,
                    somos_sst: 35000,
                    editor_archivos: 5000,
                    analisis_vivo: 15000,
                },
                basePriceMonthly: 12000,
                timeDiscounts: {
                    daily: 0,
                    weekly: 0,
                    monthly: 0,
                    quarterly: 5,
                    semiannual: 10,
                    annual: 15,
                },
            });
            customPlan = customPlan.toObject();
        }
        return res.json(customPlan);
    } catch (error) {
        console.error('[Wompi] getCustomPlanConfig error:', error);
        return res.status(500).json({ error: 'Error obteniendo configuración del plan personalizado' });
    }
};

/**
 * POST /api/wompi/create-custom-transaction
 * Expects { tools: ['blog', 'somos_sst'], interval: 'monthly', promoCode?: 'X' }
 * Calculates price from tool selections and creates a Wompi transaction.
 */
const createCustomTransaction = async (req, res) => {
    try {
        const { tools, interval, promoCode } = req.body;
        if (!tools || !Array.isArray(tools) || tools.length === 0) {
            return res.status(400).json({ error: 'Debes seleccionar al menos una herramienta' });
        }
        if (!VALID_INTERVALS.includes(interval)) {
            return res.status(400).json({ error: 'Intervalo inválido' });
        }

        // Validate all tools
        const invalidTools = tools.filter(t => !VALID_CUSTOM_TOOLS.includes(t));
        if (invalidTools.length > 0) {
            return res.status(400).json({ error: `Herramientas inválidas: ${invalidTools.join(', ')}` });
        }

        const userId = req.user._id || req.user.id;

        // Get custom plan config
        let customPlan = await Plan.findOne({ planId: 'custom' }).lean();
        if (!customPlan) {
            // Auto-seed
            customPlan = await Plan.create({
                planId: 'custom',
                name: 'Plan a la Medida',
                prices: { monthly: 0 },
                toolPrices: { blog: 5000, somos_sst: 35000, editor_archivos: 5000, analisis_vivo: 15000 },
                basePriceMonthly: 12000,
                timeDiscounts: { daily: 0, weekly: 0, monthly: 0, quarterly: 5, semiannual: 10, annual: 15 },
            });
            customPlan = customPlan.toObject();
        }

        let finalPrice = calculateCustomPrice(customPlan, tools, interval);

        // Apply promo code if provided
        if (promoCode) {
            const codeDoc = await PromoCode.findOne({ code: promoCode.toUpperCase() });
            if (codeDoc && codeDoc.active) {
                finalPrice = finalPrice - (finalPrice * Math.min(codeDoc.discountPercentage, 100) / 100);
                finalPrice = Math.round(finalPrice);
            }
        }

        if (finalPrice <= 0) {
            return res.status(400).json({ error: 'El precio calculado es inválido' });
        }

        const reference = `WAPPY-C-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const amountInCents = Math.round(finalPrice * 100);

        await WompiTransaction.create({
            userId,
            planId: 'custom',
            interval,
            reference,
            amountInCents,
            status: 'PENDING',
            customTools: tools,
        });

        const publicKey = process.env.WOMPI_PUBLIC_KEY;
        if (!publicKey) throw new Error('WOMPI_PUBLIC_KEY no configurada');

        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET || '';
        let signature = '';
        if (integritySecret) {
            const stringToSign = `${reference}${amountInCents}COP${integritySecret}`;
            signature = crypto.createHash('sha256').update(stringToSign, 'utf-8').digest('hex');
        }

        console.log(`[Wompi Custom] Transaction ${reference}: tools=[${tools}], interval=${interval}, price=$${finalPrice}`);

        return res.json({
            publicKey,
            reference,
            amountInCents,
            currency: 'COP',
            signature,
        });
    } catch (error) {
        console.error('[Wompi] createCustomTransaction error:', error);
        return res.status(500).json({ error: 'Error creando transacción personalizada', details: error.message });
    }
};

/**
 * POST /api/wompi/guest-custom-checkout  (NO auth required)
 * Like guestCheckout but for custom plans.
 */
const guestCustomCheckout = async (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        const bcrypt = require('bcryptjs');
        const { name, email, password, tools, interval, promoCode } = req.body;

        if (!name || !email || !password || !tools || !Array.isArray(tools) || tools.length === 0) {
            return res.status(400).json({ error: 'Faltan campos: name, email, password, tools' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
        }
        if (!VALID_INTERVALS.includes(interval)) {
            return res.status(400).json({ error: 'Intervalo inválido' });
        }

        const invalidTools = tools.filter(t => !VALID_CUSTOM_TOOLS.includes(t));
        if (invalidTools.length > 0) {
            return res.status(400).json({ error: `Herramientas inválidas: ${invalidTools.join(', ')}` });
        }

        // Find or create user
        const User = mongoose.model('User');
        let user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            const hashedPassword = await bcrypt.hash(password, 12);
            const baseUser = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18);
            const username = baseUser + Math.floor(Math.random() * 9000 + 1000);
            user = new User({
                name,
                username,
                email: email.toLowerCase().trim(),
                password: hashedPassword,
                role: 'USER',
                accountStatus: 'active',
            });
            await user.save();
        }

        // Calculate price
        let customPlan = await Plan.findOne({ planId: 'custom' }).lean();
        if (!customPlan) {
            customPlan = await Plan.create({
                planId: 'custom', name: 'Plan a la Medida', prices: { monthly: 0 },
                toolPrices: { blog: 5000, somos_sst: 35000, editor_archivos: 5000, analisis_vivo: 15000 },
                basePriceMonthly: 12000,
                timeDiscounts: { daily: 0, weekly: 0, monthly: 0, quarterly: 5, semiannual: 10, annual: 15 },
            });
            customPlan = customPlan.toObject();
        }

        let finalPrice = calculateCustomPrice(customPlan, tools, interval);

        if (promoCode) {
            const codeDoc = await PromoCode.findOne({ code: promoCode.toUpperCase() });
            if (codeDoc && codeDoc.active) {
                const isValid = await checkWelcomeCodeExpiry(codeDoc, userId);
                if (!isValid) {
                    return res.status(400).json({ error: 'El código de bienvenida ha expirado para tu cuenta (válido solo por 48 horas).' });
                }
                finalPrice = Math.round(finalPrice - (finalPrice * Math.min(codeDoc.discountPercentage, 100) / 100));
            }
        }

        if (finalPrice <= 0) {
            return res.status(400).json({ error: 'El precio calculado es inválido' });
        }

        const reference = `WAPPY-C-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const amountInCents = Math.round(finalPrice * 100);

        await WompiTransaction.create({
            userId: user._id,
            planId: 'custom',
            interval,
            reference,
            amountInCents,
            status: 'PENDING',
            customTools: tools,
        });

        const publicKey = process.env.WOMPI_PUBLIC_KEY;
        if (!publicKey) return res.status(500).json({ error: 'WOMPI_PUBLIC_KEY no configurada' });

        const integritySecret = process.env.WOMPI_INTEGRITY_SECRET || '';
        let signature = '';
        if (integritySecret) {
            const stringToSign = `${reference}${amountInCents}COP${integritySecret}`;
            signature = crypto.createHash('sha256').update(stringToSign, 'utf-8').digest('hex');
        }

        const jwtSecret = process.env.JWT_SECRET;
        const guestToken = jwt.sign({ id: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: '2h' });

        return res.json({ publicKey, reference, amountInCents, currency: 'COP', signature, guestToken });
    } catch (error) {
        console.error('[Wompi] guestCustomCheckout error:', error);
        return res.status(500).json({ error: 'Error en guest custom checkout', details: error.message });
    }
};

/**
 * GET /api/wompi/plans-visibility
 * Publicly returns the plan page visibility settings
 */
const getPlansVisibility = async (req, res) => {
    try {
        const doc = await Plan.findOne({ planId: '__visibility__' }).lean();
        const settings = doc?.visibility || {
            showPlanFree: false,
            showPlanGo: false,
            showPlanPlus: false,
            showPlanPro: true,
            showSectionAppPlans: false,
            showSectionCustomPlan: false,
            showSectionEnterprise: false,
        };
        return res.json(settings);
    } catch (error) {
        console.error('[Wompi] getPlansVisibility error:', error);
        return res.status(500).json({ error: 'Error obteniendo configuración de visibilidad' });
    }
};


/**
 * GET /api/wompi/welcome-promo
 * Checks if there's an active welcome promo and if the current user is eligible (within 48h).
 */
const getWelcomePromo = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) return res.json({ eligible: false });

        const codeDoc = await PromoCode.findOne({ isWelcomeCode: true, active: true }).lean();
        if (!codeDoc) return res.json({ eligible: false });

        const User = mongoose.model('User');
        const user = await User.findById(userId).select('createdAt role').lean();
        if (!user || !user.createdAt) return res.json({ eligible: false });

        // Only show to free users ('USER' role)
        if (user.role !== 'USER') {
            return res.json({ eligible: false });
        }

        const hoursSinceRegistration = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceRegistration > 48) {
            return res.json({ eligible: false });
        }

        return res.json({
            eligible: true,
            code: codeDoc.code,
            discountPercentage: codeDoc.discountPercentage,
            expiresAt: new Date(new Date(user.createdAt).getTime() + 48 * 3600000).toISOString()
        });
    } catch (error) {
        console.error('[Wompi] getWelcomePromo error:', error);
        return res.status(500).json({ eligible: false });
    }
};

module.exports = {
    getWelcomePromo,
    getPublicPlansConfig,
    validatePromoCode,
    getUserPlan,
    createTransaction,
    handleWebhook,
    verifyTransaction,
    registerPendingTransaction,
    createManualTransaction,
    guestCheckout,
    guestVerifyTransaction,
    getCustomPlanConfig,
    createCustomTransaction,
    guestCustomCheckout,
    getPlansVisibility,
};
