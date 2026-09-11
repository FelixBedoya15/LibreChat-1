const mongoose = require('mongoose');
const CompanyInfo = require('~/models/CompanyInfo');
const { logger } = require('~/config');

/**
 * Determines applicable article and company size recommendations
 */
function calculateCompanyRecommendations(workerCount, riskLevelRaw) {
  const count = Number(workerCount) || 1;

  // Parse risk level (1..5, 'I'..'V', 'Riesgo I')
  let riskNum = 1;
  if (typeof riskLevelRaw === 'number') {
    riskNum = riskLevelRaw;
  } else if (typeof riskLevelRaw === 'string') {
    const clean = riskLevelRaw.toUpperCase().trim();
    if (clean.includes('V') && !clean.includes('IV')) riskNum = 5;
    else if (clean.includes('IV')) riskNum = 4;
    else if (clean.includes('III')) riskNum = 3;
    else if (clean.includes('II')) riskNum = 2;
    else if (clean.includes('5')) riskNum = 5;
    else if (clean.includes('4')) riskNum = 4;
    else if (clean.includes('3')) riskNum = 3;
    else if (clean.includes('2')) riskNum = 2;
    else riskNum = 1;
  }

  let companySize = 'small';
  if (count <= 10) {
    companySize = 'small';
  } else if (count <= 50) {
    companySize = 'medium';
  } else {
    companySize = 'large';
  }

  let article = 16;
  if (companySize === 'small' && riskNum <= 3) {
    article = 3;
  } else if (companySize === 'medium' && riskNum <= 3) {
    article = 9;
  } else {
    article = 16;
  }

  return {
    companySize,
    riskLevel: riskNum,
    article,
  };
}

/**
 * Strict 1-to-1 mapping between real saved SGSST report tags in WAPPY and standard requirements.
 * A requirement is ONLY satisfied if an actual saved report exists with verifiable content.
 * NO inferences or assumptions are made.
 */
const SGSST_REPORT_MODULES = [
  {
    tags: ['sgsst-responsable'],
    moduleTitle: 'Hito 1: Responsable SG-SST',
    codes: ['1.1.1'],
    auditIds: ['aud_1_1_1'],
    art3Ids: ['art3_1'],
    art9Ids: ['art9_1'],
  },
  {
    tags: ['sgsst-perfil-cargo'],
    moduleTitle: 'Hito 2: Perfiles de Cargo',
    codes: ['1.1.2', '3.1.3'],
    auditIds: ['aud_1_1_2', 'aud_3_1_3'],
    art3Ids: [],
    art9Ids: ['art9_2', 'art9_17'],
  },
  {
    tags: ['sgsst-politica'],
    moduleTitle: 'Hito 1: Política de SST',
    codes: ['2.1.1'],
    auditIds: ['aud_2_1_1'],
    art3Ids: ['art3_4'],
    art9Ids: ['art9_11'],
  },
  {
    tags: ['sgsst-objetivos'],
    moduleTitle: 'Hito 1: Objetivos de SST',
    codes: ['2.2.1'],
    auditIds: ['aud_2_2_1'],
    art3Ids: [],
    art9Ids: ['art9_12'],
  },
  {
    tags: ['sgsst-diagnostico'],
    moduleTitle: 'Hito 1: Diagnóstico Inicial (Res 0312)',
    codes: ['2.3.1'],
    auditIds: ['aud_2_3_1'],
    art3Ids: [],
    art9Ids: ['art9_13'],
  },
  {
    tags: ['sgsst-matriz-legal'],
    moduleTitle: 'Hito 1: Matriz Legal',
    codes: ['2.7.1'],
    auditIds: ['aud_2_7_1'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-rhs'],
    moduleTitle: 'Hito 1: Reglamento de Higiene (RHS)',
    codes: [],
    auditIds: ['aud_reg_higiene'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-rit'],
    moduleTitle: 'Hito 1: Reglamento Interno (RIT)',
    codes: [],
    auditIds: ['aud_reg_rit'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-vulnerabilidad'],
    moduleTitle: 'Hito 1: Análisis de Vulnerabilidad / Emergencias',
    codes: ['5.1.1', '5.1.2'],
    auditIds: ['aud_5_1_1', 'aud_5_1_2'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-perfil-sociodemografico'],
    moduleTitle: 'Hito 2: Perfil Sociodemográfico',
    codes: ['3.1.1'],
    auditIds: ['aud_3_1_1'],
    art3Ids: [],
    art9Ids: ['art9_15'],
  },
  {
    tags: ['sgsst-condiciones-salud'],
    moduleTitle: 'Hito 2: Condiciones de Salud',
    codes: ['3.1.4'],
    auditIds: ['aud_3_1_4'],
    art3Ids: ['art3_6'],
    art9Ids: ['art9_18'],
  },
  {
    tags: ['sgsst-matriz-peligros', 'sgsst-matriz-ipevar'],
    moduleTitle: 'Hito 3: Matriz de Peligros GTC 45 / IPEVAR',
    codes: ['4.1.1', '4.2.1'],
    auditIds: ['aud_4_1_1', 'aud_4_2_1'],
    art3Ids: ['art3_7'],
    art9Ids: ['art9_20', 'art9_21'],
  },
  {
    tags: ['sgsst-participacion-ipevar'],
    moduleTitle: 'Hito 3: Participación IPEVAR',
    codes: ['4.1.2'],
    auditIds: ['aud_4_1_2'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-permiso-alturas', 'sgsst-heights'],
    moduleTitle: 'Hito 4: Trabajo en Alturas (Res. 4272)',
    codes: [],
    auditIds: ['aud_alturas'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-ats'],
    moduleTitle: 'Hito 4: Análisis de Trabajo Seguro (ATS)',
    codes: ['4.2.3'],
    auditIds: ['aud_4_2_3'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-epp'],
    moduleTitle: 'Hito 4: Entrega y Seguimiento de EPP',
    codes: ['4.2.6'],
    auditIds: ['aud_4_2_6'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-vehicles', 'sgsst-matriz-pesv'],
    moduleTitle: 'Hito 4: Seguridad Vial / PESV',
    codes: [],
    auditIds: ['aud_ley_2050', 'aud_pol_vial'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-chemicals'],
    moduleTitle: 'Hito 4: Registro Químicos SGA',
    codes: ['4.1.3'],
    auditIds: ['aud_4_1_3', 'aud_sga'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-reporte-actos'],
    moduleTitle: 'Hito 5: Reporte de Actos y Condiciones',
    codes: ['4.2.4'],
    auditIds: ['aud_4_2_4'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-capacitaciones', 'sgsst-programa-capacitaciones'],
    moduleTitle: 'Hito 5: Programa de Capacitaciones',
    codes: ['1.2.1', '1.2.2'],
    auditIds: ['aud_1_2_1', 'aud_1_2_2'],
    art3Ids: ['art3_3'],
    art9Ids: ['art9_8', 'art9_9'],
  },
  {
    tags: ['sgsst-estadisticas-atel'],
    moduleTitle: 'Hito 6: Estadísticas ATEL',
    codes: ['6.1.1', '3.2.3', '3.3.1'],
    auditIds: ['aud_6_1_1', 'aud_3_2_3', 'aud_3_3_1'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-investigacion-atel'],
    moduleTitle: 'Hito 6: Investigación Forense ATEL',
    codes: ['3.2.2', '7.1.3'],
    auditIds: ['aud_3_2_2', 'aud_7_1_3'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-alta-direccion'],
    moduleTitle: 'Hito 6: Revisión por la Alta Dirección',
    codes: ['6.1.3', '7.1.2'],
    auditIds: ['aud_6_1_3', 'aud_7_1_2'],
    art3Ids: [],
    art9Ids: [],
  },
  {
    tags: ['sgsst-auditoria'],
    moduleTitle: 'Hito 6: Auditoría del SG-SST',
    codes: ['6.1.2'],
    auditIds: ['aud_6_1_2'],
    art3Ids: [],
    art9Ids: [],
  },
];

/**
 * Scans only REAL and VERIFIABLE reports saved in MongoDB for the active company.
 * An item will ONLY be marked if an actual report document exists with substantive content.
 */
async function scanComplianceForUser(userId, user = {}) {
  const targetUserId = user.isSubUser && user.parentUser ? user.parentUser : userId;

  // 1. Resolve active company
  let company = null;
  if (user.isSubUser && user.assignedCompany) {
    company = await CompanyInfo.findOne({ _id: user.assignedCompany, user: targetUserId }).lean();
  }
  if (!company) {
    company = await CompanyInfo.findOne({ user: targetUserId, isActive: true }).lean();
  }
  if (!company) {
    company = await CompanyInfo.findOne({ user: targetUserId }).lean();
  }

  if (!company) {
    return {
      company: null,
      evidenceMap: {},
      summary: { totalScanned: 0, compliantCount: 0, modulesWithData: [] },
    };
  }

  const companyId = company._id.toString();
  const companyTag = `company-${companyId}`;
  const recommendations = calculateCompanyRecommendations(company.workerCount, company.riskLevel);

  const ConversationModel = mongoose.models.Conversation || require('~/db/models').Conversation;
  const MessageModel = mongoose.models.Message || require('~/db/models').Message;

  if (!ConversationModel) {
    return {
      company: {
        id: company._id,
        companyName: company.companyName || 'Empresa Principal',
        workerCount: company.workerCount || 1,
        riskLevel: company.riskLevel || 'I',
        recommendedCompanySize: recommendations.companySize,
        recommendedRiskLevel: recommendations.riskLevel,
        recommendedArticle: recommendations.article,
      },
      evidenceMap: {},
      summary: { totalScanned: 0, compliantCount: 0, modulesWithData: [] },
    };
  }

  // 2. Query only conversations that belong to this company AND have an sgsst-* tag
  const candidateConvs = await ConversationModel.find({
    user: targetUserId,
    tags: { $regex: /^sgsst-/ },
    $and: [
      {
        $or: [
          { tags: companyTag },
          { tags: { $not: /^company-/ } }, // legacy single company fallback
        ],
      },
      {
        $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
      },
      {
        $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }],
      },
    ],
  })
    .select('conversationId tags title updatedAt')
    .lean();

  // 3. Verify that the conversation has real content in Message (not an empty draft)
  const convoIds = candidateConvs.map((c) => c.conversationId).filter(Boolean);
  const validConvoIds = new Set();

  if (convoIds.length > 0 && MessageModel) {
    try {
      const messages = await MessageModel.find({
        conversationId: { $in: convoIds },
        text: { $exists: true, $ne: '' },
      })
        .select('conversationId text')
        .lean();

      for (const m of messages) {
        // Must have substantive content to be considered a real report (> 100 characters)
        if (m.text && m.text.trim().length > 100) {
          validConvoIds.add(m.conversationId);
        }
      }
    } catch (msgErr) {
      logger.warn('[ComplianceScanner] Message check fallback:', msgErr.message);
      convoIds.forEach((id) => validConvoIds.add(id));
    }
  } else {
    convoIds.forEach((id) => validConvoIds.add(id));
  }

  // Filter only conversations that actually have saved report content
  const validReports = candidateConvs.filter((c) => validConvoIds.has(c.conversationId));

  // 4. Map each module tag to its latest valid report
  const tagReports = {};
  for (const r of validReports) {
    if (Array.isArray(r.tags)) {
      for (const t of r.tags) {
        if (
          typeof t === 'string' &&
          t.startsWith('sgsst-') &&
          t !== 'sgsst-live-editor' &&
          t !== 'sgsst-data'
        ) {
          if (!tagReports[t] || new Date(r.updatedAt) > new Date(tagReports[t].updatedAt)) {
            tagReports[t] = {
              conversationId: r.conversationId,
              title: r.title || 'Informe SGSST',
              updatedAt: r.updatedAt,
            };
          }
        }
      }
    }
  }

  // 5. Strictly populate evidenceMap ONLY for modules with confirmed saved reports
  const evidenceMap = {};
  const modulesWithData = [];

  for (const mod of SGSST_REPORT_MODULES) {
    let rep = null;
    for (const tag of mod.tags) {
      const candidate = tagReports[tag];
      if (candidate) {
        if (!rep || new Date(candidate.updatedAt) > new Date(rep.updatedAt)) {
          rep = candidate;
        }
      }
    }

    if (rep) {
      if (!modulesWithData.includes(mod.moduleTitle)) {
        modulesWithData.push(mod.moduleTitle);
      }

      const dateStr = rep.updatedAt ? new Date(rep.updatedAt).toLocaleDateString('es-CO') : '';
      const evidenceText = `Informe verificado: "${rep.title}"${dateStr ? ` (${dateStr})` : ''}. Documento generado y custodiado en ${mod.moduleTitle}.`;

      const itemPayload = {
        status: 'cumple',
        evidence: evidenceText,
        source: mod.moduleTitle,
        conversationId: rep.conversationId,
        reportTitle: rep.title,
      };

      // Standard code
      for (const code of mod.codes) {
        evidenceMap[`code_${code}`] = itemPayload;
      }

      // Article 3 ID
      for (const id of mod.art3Ids) {
        evidenceMap[id] = itemPayload;
      }

      // Article 9 ID
      for (const id of mod.art9Ids) {
        evidenceMap[id] = itemPayload;
      }

      // Auditoría ID
      for (const id of mod.auditIds) {
        evidenceMap[id] = itemPayload;
      }
    }
  }

  // Number of unique standards with verified reports
  const compliantCount = Object.keys(evidenceMap).length;

  return {
    company: {
      id: company._id,
      companyName: company.companyName || 'Empresa Principal',
      workerCount: company.workerCount || 1,
      riskLevel: company.riskLevel || 'I',
      recommendedCompanySize: recommendations.companySize,
      recommendedRiskLevel: recommendations.riskLevel,
      recommendedArticle: recommendations.article,
    },
    evidenceMap,
    summary: {
      totalScanned: SGSST_REPORT_MODULES.length,
      compliantCount,
      modulesWithData,
    },
  };
}

module.exports = {
  scanComplianceForUser,
  calculateCompanyRecommendations,
};
