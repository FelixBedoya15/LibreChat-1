const mongoose = require('mongoose');

const evidenciaFaseSchema = new mongoose.Schema(
  {
    phase: { type: Number, required: true },
    label: { type: String, default: '' },
    url: { type: String, required: true }, // Base64 or image URI
    telemetry: { type: Object, default: {} },
  },
  { _id: false }
);

const estudioPuestoTrabajoSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyInfo',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    // Worker identification & Job role
    workerId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    workerName: {
      type: String,
      required: true,
      trim: true,
    },
    cargo: {
      type: String,
      required: true,
      trim: true,
    },
    actividad: {
      type: String,
      default: '',
      trim: true,
    },
    // Evaluation metadata
    evaluationType: {
      type: String,
      enum: ['auto', 'asistida'],
      default: 'auto',
      index: true,
    },
    evaluatorName: {
      type: String,
      default: 'Auto-reporte asistido por WAPPY IA',
    },
    channel: {
      type: String,
      enum: ['chat_voice', 'somos_sst', 'qr_public'],
      default: 'somos_sst',
    },
    modelUsed: {
      type: String,
      default: 'gemini-3.7-flash',
    },
    // Biomechanical telemetry & scores
    telemetry: {
      type: Object,
      default: {},
    },
    evidences: {
      type: [evidenciaFaseSchema],
      default: [],
    },
    rulaScore: {
      type: Number,
      default: null,
    },
    rebaScore: {
      type: Number,
      default: null,
    },
    actionLevel: {
      type: String,
      default: 'Nivel 1 - Aceptable',
    },
    riskLevel: {
      type: String,
      enum: ['Bajo', 'Medio', 'Alto', 'Crítico'],
      default: 'Bajo',
      index: true,
    },
    // Formatted report
    reportHtml: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['completado', 'borrador'],
      default: 'completado',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

estudioPuestoTrabajoSchema.index({ companyId: 1, workerId: 1, createdAt: -1 });

const EstudioPuestoTrabajo =
  mongoose.models.EstudioPuestoTrabajo ||
  mongoose.model('EstudioPuestoTrabajo', estudioPuestoTrabajoSchema);

module.exports = EstudioPuestoTrabajo;
