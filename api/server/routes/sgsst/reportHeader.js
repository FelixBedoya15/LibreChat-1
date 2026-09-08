/**
 * Shared report header generator for all SGSST applications.
 * Produces a standardized header matching the Diagnóstico report style:
 * - Blue banner with the report title
 * - Company info table with 4 rows × 4 columns
 */

/**
 * @param {Object} options
 * @param {string} options.title - Report title (e.g. "INFORME GERENCIAL DE EVALUACIÓN SG-SST")
 * @param {Object} options.companyInfo - Company info from CompanyInfo model
 * @param {string} options.date - Formatted date string
 * @param {string} [options.norm] - Normative reference (e.g. "Resolución 0312 de 2019")
 * @param {string} [options.riskLevel] - Risk level label
 * @param {string} [options.responsibleName] - Name of the person generating the report
 * @param {string} [options.cargo] - Job title / position evaluated
 * @param {string} [options.actividad] - Brief description of activities
 * @returns {string} HTML string
 */
function buildStandardHeader({ title, companyInfo, date, norm, riskLevel, responsibleName, cargo, actividad }) {
  const ci = companyInfo || {};
  const empresa = ci.companyName || 'EMPRESA';
  const companyType = ci.companyType || 'Persona Jurídica';
  const nitLabel = companyType === 'Persona Natural' ? 'C.C.' : 'NIT';
  const nit = ci.nit || 'N/A';
  const representante = ci.legalRepresentative || responsibleName || 'No registrado';
  const representanteId = ci.legalRepresentativeId ? ` (C.C. ${ci.legalRepresentativeId})` : '';
  const trabajadores = ci.workerCount || 'N/A';
  const riesgo = riskLevel || ci.riskLevel || 'N/A';
  const arl = ci.arl || 'N/A';
  const norma = norm || 'Resolución 0312 de 2019 / Resolución 908 de 2025';
  const fecha = date || new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const ciudad = ci.city ? `${ci.city}${ci.departamento ? ', ' + ci.departamento : ''}` : 'N/A';

  // Build the logo container
  let logoHtml = '';
  if (ci.logoBase64) {
    logoHtml = `<img src="${ci.logoBase64}" style="max-height: 40px; max-width: 90px; object-fit: contain; display: block;" alt="Logo" />`;
  } else {
    logoHtml = `
      <div style="width: 40px; height: 40px; display: inline-flex; justify-content: center; align-items: center; background: linear-gradient(135deg, #0f766e, #0ea5e9); border-radius: 8px; color: #ffffff; font-weight: 900; font-size: 14px;">
        ${empresa.substring(0, 2).toUpperCase()}
      </div>
    `;
  }

  return `
<!-- Contenedor del Encabezado Premium Tipo Banner (Imagen 4) -->
<div style="background: linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #0ea5e9 100%); padding: 18px 24px; border-radius: 20px; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(13, 148, 136, 0.15), 0 8px 10px -6px rgba(13, 148, 136, 0.15); font-family: sans-serif; display: flex; align-items: center; gap: 20px; box-sizing: border-box; width: 100%; border: none; outline: none; page-break-inside: avoid;">
  <!-- Logo -->
  <div style="background-color: #ffffff; padding: 8px; border-radius: 14px; width: 56px; height: 56px; min-width: 56px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box; overflow: hidden;">
    ${logoHtml}
  </div>
  
  <!-- Título y Subtítulos -->
  <div style="flex-grow: 1; min-width: 0; text-align: left;">
    <h1 style="margin: 0; font-size: 16px; font-weight: 850; color: #ffffff; text-transform: uppercase; line-height: 1.25; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(0,0,0,0.15);">
      ${title}${ci.companyName && !title.toLowerCase().includes(ci.companyName.toLowerCase()) ? ` - ${ci.companyName}` : ''}
    </h1>
    <p style="margin: 4px 0 0; font-size: 9px; color: rgba(255,255,255,0.9); font-weight: 700; text-transform: uppercase; letter-spacing: 0.75px;">
      SISTEMA DE GESTIÓN DE SEGURIDAD Y SALUD EN EL TRABAJO
    </p>
    <p style="margin: 2px 0 0; font-size: 8px; color: rgba(255,255,255,0.75); font-style: italic; font-weight: 500;">
      Documento Corporativo Oficial - Conforme a la Normatividad Vigente
    </p>
  </div>
  
  <!-- Badge Pill -->
  <div style="background-color: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 9999px; padding: 6px 16px; white-space: nowrap; box-sizing: border-box; align-self: center; display: flex; align-items: center; justify-content: center;">
    <span style="font-size: 9px; font-weight: bold; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">
      PROCESO: SG-SST | V.02
    </span>
  </div>
</div>

<!-- Tabla Resumen de la Entidad (Estilizada y Limpia) -->
<div style="margin-bottom: 24px; font-family: sans-serif; overflow-x: auto; width: 100%; box-sizing: border-box; page-break-inside: avoid;">
  <table style="width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; background-color: #ffffff;">
    <thead>
      <tr>
        <th colspan="4" style="background: linear-gradient(90deg, #0f766e, #0d9488); color: #ffffff; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: center; border: none;">
          INFORMACIÓN RESUMIDA DE LA ENTIDAD
        </th>
      </tr>
    </thead>
    <tbody>
      <tr style="font-size: 11px; color: #1e293b;">
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155; width: 25%;">Empresa:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; font-weight: 600; color: #0f766e; width: 25%; word-break: break-word;">${empresa} <span style="font-size:9px;color:#64748b;font-weight:normal;">(${companyType})</span></td>
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155; width: 25%;">${nitLabel}:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; width: 25%; word-break: break-word;">${nit}</td>
      </tr>
      <tr style="font-size: 11px; color: #1e293b;">
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155;">Representante:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; word-break: break-word;">${representante}${representanteId}</td>
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155;">N° Trabajadores:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; word-break: break-word;">${trabajadores}</td>
      </tr>
      <tr style="font-size: 11px; color: #1e293b;">
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155;">Nivel de Riesgo:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; word-break: break-word;">${riesgo}</td>
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155;">Ciudad / Depto:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; word-break: break-word;">${ciudad}</td>
      </tr>
      <tr style="font-size: 11px; color: #1e293b;">
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155;">Fecha de Emisión:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; word-break: break-word;">${fecha}</td>
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; color: #334155;">ARL:</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; word-break: break-word;">${arl}</td>
      </tr>
      <tr style="font-size: 11px; color: #1e293b;">
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-bottom: ${cargo ? '1px solid #e2e8f0;' : 'none;'}; border-right: 1px solid #e2e8f0; color: #334155;">Norma:</td>
        <td colspan="3" style="padding: 8px 12px; border-bottom: ${cargo ? '1px solid #e2e8f0;' : 'none;'}; word-break: break-word;">${norma}</td>
      </tr>
      ${cargo ? `
      <tr style="font-size: 11px; color: #1e293b;">
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-right: 1px solid #e2e8f0; color: #334155;">Puesto / Cargo:</td>
        <td style="padding: 8px 12px; border-right: 1px solid #e2e8f0; font-weight: 600; color: #0f766e; word-break: break-word;">${cargo}</td>
        <td style="padding: 8px 12px; font-weight: bold; background-color: #f8fafc; border-right: 1px solid #e2e8f0; color: #334155;">Actividad:</td>
        <td style="padding: 8px 12px; word-break: break-word;">${actividad || 'Evaluación de puesto de trabajo'}</td>
      </tr>` : ''}
    </tbody>
  </table>
</div>
`;
}

/**
 * Builds a standardized company context text block for AI prompts.
 * Helps the AI understand the organization's background, risk level, and main activities.
 * @param {Object} companyInfo - Company info from CompanyInfo model
 * @returns {string} Text block to be injected into the AI prompt
 */
function buildCompanyContextString(companyInfo) {
  if (!companyInfo || !companyInfo.companyName) return '';

  const companyType = companyInfo.companyType || 'Persona Jurídica';
  const nitLabel = companyType === 'Persona Natural' ? 'Cédula de Ciudadanía' : 'NIT';
  const ubicacion = [companyInfo.address, companyInfo.city, companyInfo.departamento].filter(Boolean).join(', ');

  return `
**Datos Registrados de la Organización:**
- Razón Social / Nombre: ${companyInfo.companyName || 'No registrado'}
- Tipo de Empresa: ${companyType}
- ${nitLabel}: ${companyInfo.nit || 'No registrado'}
- Representante Legal: ${companyInfo.legalRepresentative || 'No registrado'}
- Cédula Representante Legal: ${companyInfo.legalRepresentativeId || 'No registrado'}
- Número de Trabajadores: ${companyInfo.workerCount || 'No registrado'}
- ARL: ${companyInfo.arl || 'No registrada'}
- Actividad Económica: ${companyInfo.economicActivity || 'No registrada'}
- Código CIIU: ${companyInfo.ciiu || 'No registrado'}
- Nivel de Riesgo: ${companyInfo.riskLevel || 'No registrado'}
- Sector Económico: ${companyInfo.sector || 'No registrado'}
- Ubicación: ${ubicacion || 'No registrada'}
- Responsable SG-SST: ${companyInfo.responsibleSST || 'No registrado'}
- Nivel de Formación: ${companyInfo.formationLevel || 'No registrado'}
- Licencia SST: ${companyInfo.licenseNumber || 'No registrado'} (Vence: ${companyInfo.licenseExpiry || 'N/A'})
- Curso 50/20H: ${companyInfo.courseStatus || 'No registrado'}

**Actividades Generales de la Empresa (Contexto Crítico para la IA):**
${companyInfo.generalActivities || 'No registradas (Asume un entorno operativo general asociado a su sector económico vigente).'}
`;
}

/**
 * Builds a standardized signature section for the end of reports.
 * Includes a placeholder for the digital signature and details of the responsible person.
 * @param {Object} companyInfo - Company info with responsible SST data
 * @returns {string} HTML string
 */
function buildSignatureSection(companyInfo, worker = null) {
  if (!companyInfo) return '';

  const responsible = (companyInfo.responsibleSST || 'Nombre del Responsable').trim();
  const legalRep = (companyInfo.legalRepresentative || 'Representante Legal').trim();
  const license = companyInfo.licenseNumber || 'Número de Licencia';
  const licenseExpiry = companyInfo.licenseExpiry ? ` - Vence: ${companyInfo.licenseExpiry}` : '';
  const companyName = companyInfo.companyName || 'Empresa';

  // Check if Responsible SG-SST and Legal Representative are the exact same individual
  const isSamePerson = responsible.toLowerCase() === legalRep.toLowerCase() ||
                       (!companyInfo.legalRepresentative && !!companyInfo.responsibleSST);

  const tableStyle = (isSamePerson && !worker)
    ? 'width: 60%; max-width: 480px; margin: 20px auto 0 auto; border-collapse: collapse;'
    : 'width: 100%; border-collapse: collapse; margin-top: 20px;';

  let html = `
<div style="margin-top: 50px; page-break-inside: avoid;">
    <table style="${tableStyle}">
        <tr>`;

  if (isSamePerson) {
    const colWidth = worker ? '50%' : '100%';
    html += `
            <td style="width: ${colWidth}; padding: 20px; text-align: center; vertical-align: bottom;">
                <div class="signature-placeholder" data-signature-id="responsible" style="border-bottom: 2px solid #333; width: 80%; margin: 0 auto 10px auto; min-height: 80px; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; cursor: pointer; border-radius: 8px 8px 0 0; transition: all 0.3s ease;">
                    <span style="color: #999; font-size: 12px;">Haga clic para insertar FIRMA DIGITAL</span>
                </div>
                <div style="font-weight: 800; font-size: 14px; color: #1e293b; text-transform: uppercase;">${responsible}</div>
                <div style="font-size: 12px; color: #64748b; font-weight: 600;">Responsable SG-SST / Representante Legal</div>
                <div style="font-size: 11px; color: #94a3b8;">${companyName} • Licencia No. ${license}${licenseExpiry}</div>
            </td>`;
  } else {
    const colWidth = worker ? '33.33%' : '50%';
    html += `
            <td style="width: ${colWidth}; padding: 20px; text-align: center; vertical-align: bottom;">
                <div class="signature-placeholder" data-signature-id="responsible" style="border-bottom: 2px solid #333; width: 80%; margin: 0 auto 10px auto; min-height: 80px; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; cursor: pointer; border-radius: 8px 8px 0 0; transition: all 0.3s ease;">
                    <span style="color: #999; font-size: 12px;">Haga clic para insertar FIRMA DIGITAL</span>
                </div>
                <div style="font-weight: 800; font-size: 14px; color: #1e293b; text-transform: uppercase;">${responsible}</div>
                <div style="font-size: 12px; color: #64748b; font-weight: 600;">Responsable SG-SST</div>
                <div style="font-size: 11px; color: #94a3b8;">Licencia No. ${license}${licenseExpiry}</div>
            </td>
            <td style="width: ${colWidth}; padding: 20px; text-align: center; vertical-align: bottom;">
                <div class="signature-placeholder" data-signature-id="legal" style="border-bottom: 2px solid #333; width: 80%; margin: 0 auto 10px auto; min-height: 80px; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; cursor: pointer; border-radius: 8px 8px 0 0; transition: all 0.3s ease;">
                    <span style="color: #999; font-size: 12px;">Haga clic para insertar FIRMA DIGITAL</span>
                </div>
                <div style="font-weight: 800; font-size: 14px; color: #1e293b; text-transform: uppercase;">${legalRep}</div>
                <div style="font-size: 12px; color: #64748b; font-weight: 600;">Representante Legal</div>
                <div style="font-size: 11px; color: #94a3b8;">${companyName}</div>
            </td>`;
  }

  if (worker) {
    const colWidth = isSamePerson ? '50%' : '33.33%';
    // Attempt to inject valid signature image if worker has one registered
    const signatureContent = (worker.consentimientoFirmaDigital === 'Sí' && worker.firmaDigital) 
      ? `<img src="${worker.firmaDigital}" style="max-height: 70px; max-width: 100%;" />`
      : `<span style="color: #999; font-size: 12px;">Haga clic para insertar FIRMA DIGITAL</span>`;

    html += `
            <td style="width: ${colWidth}; padding: 20px; text-align: center; vertical-align: bottom;">
                <div class="signature-placeholder" data-signature-id="worker_${worker.id || '1'}" style="border-bottom: 2px solid #333; width: 80%; margin: 0 auto 10px auto; min-height: 80px; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; cursor: pointer; border-radius: 8px 8px 0 0; transition: all 0.3s ease;">
                    ${signatureContent}
                </div>
                <div style="font-weight: 800; font-size: 14px; color: #1e293b; text-transform: uppercase;">${worker.nombre}</div>
                <div style="font-size: 12px; color: #64748b; font-weight: 600;">Trabajador / Interviniente</div>
                <div style="font-size: 11px; color: #94a3b8;">C.C. ${worker.identificacion || ''} - ${worker.cargo || ''}</div>
            </td>`;
  }

  html += `
        </tr>
    </table>
    <div style="text-align: center; font-size: 10px; color: #cbd5e1; margin-top: 15px; font-style: italic;">
        Documento generado electrónicamente por el Gestor Inteligente SGSST - WAPPY IA By WAPPY LTDA © 2025
    </div>
</div>`;

  return html;
}

module.exports = { buildStandardHeader, buildCompanyContextString, buildSignatureSection };
