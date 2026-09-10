const mongoose = require('mongoose');

const moodTelemetrySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyInfo',
      required: true,
      index: true,
    },
    mood: {
      type: String,
      enum: ['happy', 'neutral', 'sad'],
      required: true,
    },
    stressors: [
      {
        type: String,
      },
    ], // Ej: 'sobrecarga', 'liderazgo', 'entorno', 'personal'
    details: {
      type: String,
      default: '',
    }, // Resumen/Diagnóstico de la conversación
    department: {
      type: String,
      default: '',
      index: true,
    }, // Opcional (ej: 'Operaciones', 'Ventas')
    deviceId: {
      type: String,
      default: '',
      index: true,
    }, // Identificador anónimo del dispositivo / equipo
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    }, // Identificador si el reporte fue generado en modo demostración / admin
  },
  {
    timestamps: true, // Esto nos provee automáticamente createdAt y updatedAt
  }
);

const MoodTelemetry = mongoose.models.MoodTelemetry || mongoose.model('MoodTelemetry', moodTelemetrySchema);

module.exports = MoodTelemetry;
