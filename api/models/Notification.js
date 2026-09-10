const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: [
            'ticket_created', 'ticket_responded', 'contact_request', 'payment_received',
            'sgsst_reporte_acto', 'sgsst_participacion_ipevar', 'sgsst_alta_direccion', 'sgsst_perfil_update',
            'sgsst_testimonio_atel', 'system_update', 'welcome_promo', 'group_invitation'
        ],
        required: true,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    title: {
        type: String,
        required: true,
    },
    body: {
        type: String,
        required: true,
    },
    read: {
        type: Boolean,
        default: false,
    },
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
    },
}, { timestamps: true });

// Hook para enviar copia por correo electrónico de la notificación (asíncrono en segundo plano para no bloquear transacciones)
notificationSchema.post('save', function (doc) {
  setImmediate(async () => {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(doc.user).select('email name username emailNotifications');
      if (!user || !user.email) {
        return;
      }

      // Si el usuario desactivó recibir notificaciones por correo, cancelamos el envío
      if (user.emailNotifications === false) {
        return;
      }

      // Importación dinámica para evitar dependencias circulares
      const sendEmail = require('../server/utils/sendEmail');
      const { checkEmailConfig } = require('@librechat/api');

      if (!checkEmailConfig()) {
        return;
      }

      await sendEmail({
        email: user.email,
        from: process.env.EMAIL_NOTIFICATIONS_FROM || 'notificaciones@wappy.club',
        subject: `🔔 WAPPY: ${doc.title}`,
        payload: {
          appName: process.env.APP_TITLE || 'WAPPY IA',
          name: user.name || user.username || 'Usuario',
          title: doc.title,
          body: doc.body,
          year: new Date().getFullYear(),
        },
        template: 'systemNotification.handlebars',
      });
    } catch (err) {
      // Registramos el error de forma segura para no interrumpir el flujo principal
      console.error('[Notification Email Hook Error]:', err.message);
    }
  });
});

module.exports = mongoose.model('Notification', notificationSchema);

