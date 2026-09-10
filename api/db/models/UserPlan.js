const mongoose = require('mongoose');

/**
 * UserPlan — stores Stripe subscription data alongside the LibreChat user.
 * We keep this separate from the @librechat/data-schemas User model
 * so we don't need to patch that package.
 */
const UserPlanSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        plan: {
            type: String,
            enum: ['free', 'go', 'plus', 'pro', 'admin', 'custom', 'ipevar'],
            default: 'free',
        },
        stripeCustomerId: { type: String, default: null },
        stripeSubscriptionId: { type: String, default: null },
        stripePriceId: { type: String, default: null },
        planExpiresAt: { type: Date, default: null },
        cancelAtPeriodEnd: { type: Boolean, default: false },
        // Interval of the last purchased plan (used for downgrade rules on expiry)
        // 'referral' is a special value for free trials given via referral links
        planInterval: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'lifetime', 'referral', null],
            default: null,
        },
        // Custom plan fields
        customTools: {
            type: [String], // e.g. ['blog', 'somos_sst', 'editor_archivos', 'analisis_vivo']
            default: [],
        },
        customInterval: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', null],
            default: null,
        },
        companyLimit: {
            type: Number,
            default: null, // null hereda el comportamiento por defecto de su plan
        },
        automationLimit: {
            type: Number,
            default: null, // null hereda el comportamiento por defecto de su plan (pro: 1, admin/custom: 999, otros: 0)
        },
        subUserLimit: {
            type: Number,
            default: null, // null hereda el comportamiento por defecto de su plan (pro: 1, admin/custom: 999, otros: 0)
        },
        storageLimit: {
            type: Number,
            default: null, // null hereda el almacenamiento por defecto de su plan (en Bytes)
        },
    },
    { timestamps: true },
);

const UserPlan = mongoose.model('UserPlan', UserPlanSchema);

module.exports = UserPlan;
