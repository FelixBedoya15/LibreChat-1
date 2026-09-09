import React, { useState, useRef } from 'react';
import axios from 'axios';
import { 
  Briefcase, 
  Building2, 
  Sparkles, 
  Download, 
  Share2, 
  Printer, 
  CheckCircle2, 
  ShieldCheck, 
  DollarSign, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  ExternalLink, 
  Copy, 
  Upload, 
  Trash2, 
  FileText, 
  TrendingUp, 
  Layers, 
  RefreshCw,
  Edit3,
  Bot
} from 'lucide-react';
import { useToastContext } from '@librechat/client';

interface ProposalModule {
  title: string;
  description: string;
  benefits: string;
}

interface ProposalPlan {
  key: string;
  planName: string;
  interval: string;
  regularPrice: number;
  discountPercentage: number;
  finalPrice: number;
  pricePerMonth: number;
  features: string[];
  isRecommended: boolean;
  paymentUrl: string;
}

interface ProposalTimeline {
  phase: string;
  time: string;
  description: string;
}

interface GeneratedProposal {
  title: string;
  proposalCode: string;
  companyName: string;
  companyNit: string;
  sector: string;
  employeeCount: string;
  additionalCompanies?: number;
  additionalAutomations?: number;
  automationPacks?: number;
  totalAutomations?: number;
  totalCompanies?: number;
  executiveSummary: string;
  sectorDiagnosis: string;
  includedModules: ProposalModule[];
  roiAnalysis: {
    timeSavedHoursPerMonth: string;
    estimatedSavingsCop: string;
    qualitativeBenefits: string[];
  };
  investmentPlans: ProposalPlan[];
  implementationTimeline: ProposalTimeline[];
  termsAndConditions: string[];
  closingMessage: string;
  ambassadorData: {
    name: string;
    phone: string;
    email: string;
    referralLink: string;
  };
  generatedAt: string;
}

interface CommercialProposalGeneratorProps {
  ambassadorName?: string;
  ambassadorPhone?: string;
  ambassadorEmail?: string;
  referralLink?: string;
}

const SECTORS = [
  'Construcción e Infraestructura',
  'Transporte y Logística (PESV Res. 40595)',
  'Manufactura e Industria Química (SGA)',
  'Servicios Profesionales y Consultoría SST',
  'Salud y Clínicas',
  'Comercio y Retail',
  'Minería y Energía',
  'Alimentos y Bebidas',
  'Educación y Entidades Públicas',
  'Tecnología y Servicios Generales'
];

export default function CommercialProposalGenerator({
  ambassadorName = 'Asesor WAPPY IA',
  ambassadorPhone = '',
  ambassadorEmail = '',
  referralLink = 'https://wappy.club'
}: CommercialProposalGeneratorProps) {
  const { showToast } = useToastContext();

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [companyNit, setCompanyNit] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [sector, setSector] = useState(SECTORS[0]);
  const [employeeCount, setEmployeeCount] = useState('11-50');
  const [additionalCompanies, setAdditionalCompanies] = useState<number>(0);
  const [additionalAutomations, setAdditionalAutomations] = useState<number>(0);
  const [proposalScope, setProposalScope] = useState('Automatización Integral SG-SST, Matrices IPEVAR, PESV y Asistentes IA');
  const [selectedPlans, setSelectedPlans] = useState<string[]>(['anual', 'semestral']);
  const [customDiscount, setCustomDiscount] = useState<number>(10);
  const [customObservations, setCustomObservations] = useState('');
  const [clientLogo, setClientLogo] = useState<string | null>(null);

  // Advisor Info
  const [advisorName, setAdvisorName] = useState(ambassadorName);
  const [advisorPhone, setAdvisorPhone] = useState(ambassadorPhone);
  const [advisorEmail, setAdvisorEmail] = useState(ambassadorEmail);

  // Proposal State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [proposal, setProposal] = useState<GeneratedProposal | null>(null);
  const [isEditable, setIsEditable] = useState(false);

  const printContainerRef = useRef<HTMLDivElement>(null);

  // Logo file upload handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        showToast({ message: 'El logo no debe superar los 3 MB.', status: 'warning' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setClientLogo(uploadEvent.target?.result as string);
        showToast({ message: 'Logo de la empresa cargado con éxito.', status: 'success' });
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePlanSelection = (planKey: string) => {
    if (selectedPlans.includes(planKey)) {
      if (selectedPlans.length === 1) {
        showToast({ message: 'Debes cotizar al menos un plan en la propuesta.', status: 'warning' });
        return;
      }
      setSelectedPlans(selectedPlans.filter(p => p !== planKey));
    } else {
      if (selectedPlans.length >= 2) {
        showToast({ message: 'Máximo puedes seleccionar 2 planes para cotizar en la propuesta.', status: 'warning' });
        return;
      }
      setSelectedPlans([...selectedPlans, planKey]);
    }
  };

  // Generate with real AI (Gemini 3.5 Lite backend)
  const handleGenerateProposal = async () => {
    if (!companyName.trim()) {
      showToast({ message: 'Ingresa el nombre o razón social de la empresa cliente.', status: 'warning' });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await axios.post('/api/referrals/proposal/generate', {
        companyName,
        companyNit,
        contactPerson,
        clientEmail,
        sector,
        employeeCount,
        additionalCompanies,
        additionalAutomations,
        proposalScope,
        selectedPlans,
        customDiscount,
        customObservations,
        ambassadorName: advisorName,
        ambassadorPhone: advisorPhone,
        ambassadorEmail: advisorEmail,
        referralLink: referralLink || 'https://wappy.club'
      });

      setProposal(response.data);
      showToast({ message: '¡Propuesta comercial ejecutiva generada con éxito por la IA!', status: 'success' });
    } catch (err: any) {
      showToast({ message: err.response?.data?.message || 'Error al generar la propuesta con IA.', status: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Send official proposal email via Wappy backend
  const handleSendEmail = async () => {
    if (!proposal) return;
    const targetMail = (clientEmail || '').trim();
    if (!targetMail || !targetMail.includes('@')) {
      showToast({ message: 'Ingresa un correo electrónico válido para enviar la propuesta oficial.', status: 'warning' });
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await axios.post('/api/referrals/proposal/send-email', {
        clientEmail: targetMail,
        proposal,
      });

      showToast({ 
        message: response.data?.message || `¡Propuesta comercial enviada con éxito a ${targetMail}!`, 
        status: 'success' 
      });
    } catch (err: any) {
      showToast({ 
        message: err.response?.data?.message || 'Error al enviar el correo de la propuesta comercial.', 
        status: 'error' 
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handlePrintPdf = () => {
    if (!proposal) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast({ message: 'Por favor permite las ventanas emergentes (popups) en tu navegador para generar el PDF.', status: 'warning' });
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Propuesta Comercial - ${proposal.companyName} (${proposal.proposalCode})</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #0f172a;
            background: #ffffff;
            font-size: 11.5px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: letter;
            margin: 12mm 15mm 15mm 15mm;
          }
          @media print {
            body { margin: 0; padding: 0; background: #ffffff !important; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
            .keep-together { page-break-inside: avoid !important; break-inside: avoid !important; }
          }
          .doc-container {
            max-width: 820px;
            margin: 0 auto;
            padding: 24px 28px;
            background: #ffffff;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #0d9488;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          .logo-wappy {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .logo-badge {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: #0d9488;
            color: #ffffff;
            font-weight: 900;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .logo-text {
            font-size: 22px;
            font-weight: 900;
            color: #0f172a;
            line-height: 1;
          }
          .logo-text span { color: #0d9488; }
          .logo-sub {
            font-size: 8.5px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 3px;
          }
          .client-logo-img {
            max-height: 44px;
            max-width: 130px;
            object-fit: contain;
          }
          .prop-badge {
            display: inline-block;
            background: #f0fdfa;
            border: 1px solid #99f6e4;
            color: #0f766e;
            font-size: 9.5px;
            font-weight: 800;
            padding: 3px 10px;
            border-radius: 20px;
            text-transform: uppercase;
          }
          .meta-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 4px solid #0d9488;
            border-radius: 10px;
            padding: 14px 18px;
            margin-bottom: 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
          }
          .section-title {
            font-size: 11.5px;
            font-weight: 900;
            color: #0f766e;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1.5px solid #e2e8f0;
            padding-bottom: 5px;
            margin-top: 20px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .summary-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 12px 16px;
            border-radius: 10px;
            font-size: 11px;
            line-height: 1.6;
            color: #334155;
            margin-bottom: 14px;
          }
          .modules-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 16px;
          }
          .module-card {
            border: 1px solid #e2e8f0;
            border-radius: 9px;
            padding: 10px 12px;
            background: #ffffff;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .module-num {
            display: inline-block;
            width: 17px;
            height: 17px;
            border-radius: 50%;
            background: #ccfbf1;
            color: #0f766e;
            font-weight: 900;
            font-size: 9.5px;
            text-align: center;
            line-height: 17px;
            margin-right: 5px;
          }
          .plans-grid {
            display: grid;
            grid-template-columns: ${proposal.investmentPlans.length === 1 ? '1fr' : '1fr 1fr'};
            gap: 12px;
            margin-bottom: 18px;
            width: 100%;
          }
          .plan-card {
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 14px;
            background: #ffffff;
            text-align: center;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .plan-card.recommended {
            border: 2px solid #0d9488;
            background: #f0fdfa;
          }
          .plan-rec-badge {
            background: #0d9488;
            color: #ffffff;
            font-size: 8.5px;
            font-weight: 900;
            padding: 2px 8px;
            border-radius: 15px;
            text-transform: uppercase;
            display: inline-block;
            margin-bottom: 4px;
          }
          .plan-price {
            font-size: 19px;
            font-weight: 900;
            color: #0f766e;
            margin: 4px 0 2px 0;
          }
          .plan-monthly {
            font-size: 10px;
            color: #64748b;
            font-weight: 600;
          }
          .discount-tag {
            display: inline-block;
            background: #ffe4e6;
            color: #e11d48;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 4px;
          }
          .roi-card {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 10px;
            padding: 14px 16px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .timeline-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .timeline-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 9px;
            padding: 10px 12px;
          }
          .signatures-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 26px;
            padding-top: 16px;
            border-top: 1.5px solid #cbd5e1;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .sig-box {
            width: 44%;
          }
          .sig-line {
            border-bottom: 1.5px solid #475569;
            margin-top: 36px;
            margin-bottom: 6px;
          }
          .doc-footer {
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            margin-top: 24px;
            border-top: 1px solid #f1f5f9;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="doc-container">
          <!-- Header -->
          <div class="header-row">
            <div class="logo-wappy">
              <div class="logo-badge">W</div>
              <div>
                <div class="logo-text">WAPPY <span>IA</span></div>
                <div class="logo-sub">Plataforma Líder de IA para SG-SST</div>
              </div>
            </div>
            <div style="text-align: right; display: flex; align-items: center; gap: 14px;">
              ${clientLogo ? `<img src="${clientLogo}" class="client-logo-img" alt="Logo Cliente" />` : ''}
              <div>
                <span class="prop-badge">Propuesta Comercial Oficial</span>
                <div style="font-weight: 800; font-size: 11px; color: #1e293b; margin-top: 3px;">${proposal.proposalCode}</div>
                <div style="font-size: 9.5px; color: #64748b;">${new Date(proposal.generatedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
            </div>
          </div>

          <!-- Meta Box -->
          <div class="meta-box">
            <div>
              <div style="font-size: 9px; font-weight: 800; color: #0f766e; text-transform: uppercase; letter-spacing: 0.5px;">Propuesta Preparada Para:</div>
              <div style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 2px;">${proposal.companyName}</div>
              <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">
                ${proposal.companyNit ? `NIT: ${proposal.companyNit} • ` : ''}
                ${clientEmail ? `Correo: ${clientEmail} • ` : ''}
                Sector: ${proposal.sector} • Alcance: ${proposal.employeeCount} trabajadores
                ${proposal.totalCompanies && proposal.totalCompanies > 1 ? ` • ${proposal.totalCompanies} Empresas (${proposal.additionalCompanies} adicionales)` : ''}
                • ${proposal.totalAutomations || 1} Automatizaciones Autónomas IA (${proposal.additionalAutomations && proposal.additionalAutomations > 0 ? `1 incluida + ${proposal.additionalAutomations} adic.` : '1 incluida en Plan Pro'})
              </div>
            </div>
            <div style="text-align: right; border-left: 1px solid #cbd5e1; padding-left: 14px;">
              <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase;">Consultor Líder Asignado:</div>
              <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 2px;">${proposal.ambassadorData.name}</div>
              <div style="font-size: 10.5px; color: #0d9488; font-weight: 700; margin-top: 2px;">${proposal.ambassadorData.phone ? `📱 ${proposal.ambassadorData.phone}` : ''}</div>
              <div style="font-size: 9.5px; color: #64748b;">✉️ ${proposal.ambassadorData.email}</div>
            </div>
          </div>

          <!-- Proposal Title -->
          <h1 style="font-size: 15px; font-weight: 900; color: #0f172a; margin-bottom: 12px; line-height: 1.35;">
            ${proposal.title}
          </h1>

          <!-- Section 1: Executive Summary -->
          <div class="keep-together">
            <div class="section-title">1. Resumen Ejecutivo & Diagnóstico Sectorial</div>
            <div class="summary-card">
              <p style="margin: 0 0 6px 0; font-weight: 700; color: #0f172a;">${proposal.executiveSummary}</p>
              <p style="margin: 0; color: #475569;"><strong>Diagnóstico para el sector ${proposal.sector}:</strong> ${proposal.sectorDiagnosis}</p>
            </div>
          </div>

          <!-- Section 2: Included Modules -->
          <div class="keep-together">
            <div class="section-title">2. Ecosistema de Agentes y Módulos de IA Incluidos</div>
            <div class="modules-grid">
              ${proposal.includedModules.map((m, idx) => `
                <div class="module-card">
                  <div style="font-weight: 800; font-size: 11px; color: #0f172a; margin-bottom: 3px;">
                    <span class="module-num">${idx + 1}</span> ${m.title}
                  </div>
                  <div style="font-size: 10px; color: #475569; margin-bottom: 4px; line-height: 1.4;">${m.description}</div>
                  <div style="font-size: 9px; font-weight: 700; color: #0f766e; background: #f0fdfa; padding: 2px 5px; border-radius: 4px; display: inline-block;">
                    ✓ Beneficio: ${m.benefits}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section 3: Investment Table -->
          <div class="keep-together">
            <div class="section-title">3. Opciones de Inversión y Cotización Económica</div>
            <div class="plans-grid">
              ${proposal.investmentPlans.map(p => `
                <div class="plan-card ${p.isRecommended ? 'recommended' : ''}">
                  ${p.isRecommended ? '<div class="plan-rec-badge">Plan Más Recomendado</div>' : ''}
                  <div style="font-weight: 800; font-size: 12px; color: #0f172a;">${p.planName}</div>
                  <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">${p.interval}</div>
                  <div style="margin: 8px 0 4px 0;">
                    ${p.discountPercentage > 0 ? `
                      <div style="font-size: 10px; color: #94a3b8; text-decoration: line-through;">
                        $${p.regularPrice.toLocaleString('es-CO')} COP <span class="discount-tag">${p.discountPercentage}% OFF</span>
                      </div>
                    ` : ''}
                    <div class="plan-price">$${p.finalPrice.toLocaleString('es-CO')} <span style="font-size: 10px; font-weight: 700; color: #64748b;">COP</span></div>
                    <div class="plan-monthly">${p.pricePerMonth > 0 ? `Equivalente a ~$${p.pricePerMonth.toLocaleString('es-CO')} COP / mes` : 'Acceso Vitalicio'}</div>
                  </div>
                  <ul style="text-align: left; font-size: 9.5px; color: #475569; padding-left: 14px; margin: 8px 0 0 0; line-height: 1.45; ${proposal.investmentPlans.length === 1 ? 'display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;' : ''}">
                    ${p.features.map(f => `<li>${f}</li>`).join('')}
                  </ul>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section 4: ROI -->
          ${proposal.roiAnalysis ? `
          <div class="keep-together">
            <div class="section-title">4. Retorno de Inversión (ROI Estimado)</div>
            <div class="roi-card">
              <div>
                <div style="font-size: 9.5px; font-weight: 800; color: #065f46; text-transform: uppercase;">Ahorro Mensual Estimado</div>
                <div style="font-size: 15px; font-weight: 900; color: #064e3b; margin: 2px 0;">${proposal.roiAnalysis.timeSavedHoursPerMonth}</div>
                <div style="font-size: 10.5px; color: #047857;">Ahorro financiero directo: <strong>${proposal.roiAnalysis.estimatedSavingsCop}</strong></div>
              </div>
              <div style="font-size: 10px; color: #065f46; line-height: 1.5;">
                ${proposal.roiAnalysis.qualitativeBenefits.map(b => `<div>✓ ${b}</div>`).join('')}
              </div>
            </div>
          </div>
          ` : ''}

          <!-- Section 5: Implementation Timeline -->
          <div class="keep-together">
            <div class="section-title">5. Cronograma de Adopción e Implementación</div>
            <div class="timeline-grid">
              ${proposal.implementationTimeline.map(t => `
                <div class="timeline-card">
                  <div style="font-size: 9px; font-weight: 900; color: #0d9488; text-transform: uppercase;">${t.time}</div>
                  <div style="font-weight: 800; font-size: 11px; color: #0f172a; margin: 2px 0;">${t.phase}</div>
                  <div style="font-size: 9.5px; color: #64748b; line-height: 1.35;">${t.description}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section 6: Terms & Acceptance -->
          <div class="keep-together" style="margin-top: 16px;">
            <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Términos Comerciales & Validez:</div>
            <ul style="font-size: 9px; color: #64748b; padding-left: 14px; margin: 0 0 10px 0; line-height: 1.45;">
              ${proposal.termsAndConditions.map(tc => `<li>${tc}</li>`).join('')}
            </ul>

            <div style="font-size: 10.5px; font-style: italic; color: #334155; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px;">
              "${proposal.closingMessage}"
            </div>

            <!-- Signatures -->
            <div class="signatures-row">
              <div class="sig-box">
                <div class="sig-line"></div>
                <div style="font-weight: 800; font-size: 11px; color: #0f172a;">${proposal.ambassadorData.name}</div>
                <div style="font-size: 9.5px; color: #0d9488; font-weight: 700;">Consultor Comercial & Especialista SST</div>
                <div style="font-size: 9px; color: #64748b;">WAPPY IA — Tecnología Inteligente</div>
              </div>
              <div class="sig-box" style="text-align: right;">
                <div class="sig-line"></div>
                <div style="font-weight: 800; font-size: 11px; color: #0f172a;">Aceptación del Cliente</div>
                <div style="font-size: 9.5px; color: #64748b;">Representante Legal / Gerente SST</div>
                <div style="font-size: 9px; color: #64748b;">${proposal.companyName}</div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="doc-footer">
            Documento emitido formalmente por WAPPY IA (wappy.club) • Todos los derechos reservados © ${new Date().getFullYear()}
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleShareWhatsApp = () => {
    if (!proposal) return;
    const cleanPhone = (advisorPhone || '').replace(/[^0-9]/g, '');
    const plansSummary = proposal.investmentPlans.map(p => `• *${p.planName}*: $${p.finalPrice.toLocaleString('es-CO')} COP (${p.discountPercentage > 0 ? `${p.discountPercentage}% OFF` : 'Precio Estándar'})`).join('\n');
    
    const waText = `Hola *${proposal.companyName}* 👋\n\nTe comparto la *Propuesta Comercial Oficial de WAPPY IA* para la automatización de su Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST, PESV y Matrices IPEVAR).\n\n📄 *Código:* ${proposal.proposalCode}\n💼 *Sector:* ${proposal.sector}\n\n💰 *Opciones de Inversión:*\n${plansSummary}\n\nPuedes revisar todos los módulos incluidos y activar su cuenta corporativa directamente aquí 👇\n${referralLink}\n\nQuedo a su disposición para coordinar una breve demostración en vivo.\n*${advisorName}* - Consultor Líder WAPPY IA`;

    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

    window.open(waUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-gray-900 border border-border-medium/40 rounded-2xl p-5 sm:p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-teal-500/10 via-emerald-500/5 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 mb-2 uppercase tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-teal-500 animate-pulse" />
            <span>Generador de Propuestas Comerciales con IA</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Crea Propuestas Ejecutivas en PDF & Envíalas por Correo Oficial
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed max-w-2xl font-normal">
            Ingresa los datos de tu cliente corporativo, carga su logo institucional y la IA redactará una propuesta personalizada con diagnóstico sectorial, tablas de inversión y análisis de ROI, lista para enviar por correo corporativo desde Wappy, descargar en PDF o compartir por WhatsApp.
          </p>
        </div>

        {proposal && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleSendEmail}
              disabled={isSendingEmail}
              className="group flex items-center justify-center h-9 px-3 min-w-[36px] sm:h-10 sm:px-3 sm:min-w-[40px] transition-all duration-300 shadow-lg shadow-teal-500/10 hover:shadow-teal-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-teal-600 hover:bg-teal-700 text-white sm:hover:scale-105 active:scale-95 disabled:opacity-50"
              title="Enviar Propuesta por Correo Oficial"
            >
              <div className="relative flex-shrink-0 flex items-center justify-center">
                {isSendingEmail ? <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Mail className="w-4 h-4 sm:w-5 sm:h-5" />}
              </div>
              <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                <span className="text-xs sm:text-sm font-bold tracking-wide">{isSendingEmail ? 'Enviando...' : 'Enviar por Correo'}</span>
              </div>
            </button>

            <button
              onClick={handlePrintPdf}
              className="group flex items-center justify-center h-9 px-3 min-w-[36px] sm:h-10 sm:px-3 sm:min-w-[40px] transition-all duration-300 shadow-lg shadow-slate-500/10 hover:shadow-slate-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-slate-700 hover:bg-slate-800 text-white sm:hover:scale-105 active:scale-95"
              title="Descargar Propuesta en PDF"
            >
              <div className="relative flex-shrink-0 flex items-center justify-center">
                <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                <span className="text-xs sm:text-sm font-bold tracking-wide">Descargar PDF</span>
              </div>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="group flex items-center justify-center h-9 px-3 min-w-[36px] sm:h-10 sm:px-3 sm:min-w-[40px] transition-all duration-300 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white sm:hover:scale-105 active:scale-95"
              title="Compartir por WhatsApp"
            >
              <div className="relative flex-shrink-0 flex items-center justify-center">
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                <span className="text-xs sm:text-sm font-bold tracking-wide">WhatsApp</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Form Controls Left / Executive Document Preview Right */}
      <div className="grid grid-cols-1 xl:grid-cols-12 lg:grid-cols-12 gap-5 sm:gap-6 w-full min-w-0">
        
        {/* Left Column: Form & Options */}
        <div className="xl:col-span-4 lg:col-span-5 col-span-1 space-y-4 print:hidden w-full min-w-0">
          <div className="bg-white dark:bg-gray-900 border border-border-medium/40 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-2 pb-2 border-b border-border-medium/30">
              <Building2 className="w-4 h-4 text-teal-500" />
              <span>Datos del Cliente & Parámetros</span>
            </h3>

            {/* Company Name */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                Empresa / Razón Social <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ej. Constructora Bolívar S.A.S."
                className="w-full bg-surface-primary border border-border-medium/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary font-medium"
              />
            </div>

            {/* NIT */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                NIT o Identificación Tributaria
              </label>
              <input
                type="text"
                value={companyNit}
                onChange={(e) => setCompanyNit(e.target.value)}
                placeholder="Ej. 900.123.456-7"
                className="w-full bg-surface-primary border border-border-medium/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary"
              />
            </div>

            {/* Contact Person */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                Nombre del Contacto / Directivo
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Ej. Ing. Carlos Pérez (Gerente SST)"
                className="w-full bg-surface-primary border border-border-medium/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary"
              />
            </div>

            {/* Client Email for Official Proposal Sending */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1 flex items-center justify-between">
                <span>Correo del Cliente / Destinatario</span>
                <span className="text-[10px] text-teal-600 font-bold lowercase">para envío oficial</span>
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="ejemplo@empresa.com"
                  className="w-full bg-surface-primary border border-border-medium/40 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary"
                />
              </div>
            </div>

            {/* Sector */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                Sector Económico Principal
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-surface-primary border border-border-medium/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary font-medium cursor-pointer"
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Employee Count */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                Número de Trabajadores / Alcance
              </label>
              <select
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                className="w-full bg-surface-primary border border-border-medium/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary font-medium cursor-pointer"
              >
                <option value="1-10">1 a 10 Trabajadores (Microempresa)</option>
                <option value="11-50">11 a 50 Trabajadores (Pequeña Empresa)</option>
                <option value="51-200">51 a 200 Trabajadores (Mediana Empresa)</option>
                <option value="Más de 200">Más de 200 Trabajadores (Gran Empresa)</option>
              </select>
            </div>

            {/* Client Logo Uploader */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                Logo de la Empresa Cliente
              </label>
              {clientLogo ? (
                <div className="flex items-center justify-between p-2.5 bg-surface-secondary border border-teal-500/30 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <img src={clientLogo} alt="Logo Cliente" className="h-8 max-w-[100px] object-contain rounded bg-white p-1" />
                    <span className="text-xs text-text-primary font-semibold">Logo listo</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClientLogo(null)}
                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Eliminar logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-border-medium/60 hover:border-teal-500/60 rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer bg-surface-primary/50 hover:bg-surface-hover transition-all">
                  <Upload className="w-4 h-4 text-teal-500" />
                  <span className="text-xs font-semibold text-text-primary">Subir Logo (PNG, JPG)</span>
                  <span className="text-[10px] text-text-tertiary">Aparecerá en el membrete del PDF</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Additional Companies & Automations Grid */}
            <div className="space-y-3 p-3.5 bg-surface-secondary/70 border border-teal-500/25 rounded-2xl">
              {/* Additional Companies */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-text-secondary uppercase flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Empresas Adicionales</span>
                  </label>
                  <span className="text-[11px] font-extrabold text-teal-600 dark:text-teal-400">
                    {additionalCompanies > 0 ? `+${additionalCompanies} (${1 + additionalCompanies} total)` : '1 Sede Principal'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setAdditionalCompanies(num)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        additionalCompanies === num
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : 'bg-surface-primary border-border-medium/40 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      {num === 0 ? '0' : `+${num}`}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-text-tertiary flex items-center justify-between">
                  <span>$350.000 COP/año base por empresa • Proporcional por período</span>
                  {additionalCompanies > 0 && (
                    <span className="font-bold text-teal-600">+{additionalCompanies} empresa{additionalCompanies > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>

              {/* Automations: 1 included in Pro + Additionals ($40k/5 or $10k/1) */}
              <div className="space-y-1.5 pt-2.5 border-t border-border-medium/30">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-text-secondary uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    <span>Automatizaciones Autónomas IA</span>
                  </label>
                  <span className="text-[11px] font-extrabold text-teal-600 dark:text-teal-400">
                    {1 + additionalAutomations} tareas/mes {additionalAutomations > 0 ? `(1 inc. + ${additionalAutomations} adic.)` : '(1 incluida)'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[0, 1, 5, 10, 15, 20].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setAdditionalAutomations(count)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        additionalAutomations === count
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : 'bg-surface-primary border-border-medium/40 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      }`}
                    >
                      {count === 0 ? '0' : `+${count}`}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-text-tertiary flex items-center justify-between">
                  <span>1 incluida en Pro • +1: $10k/mes • Paq. 5: $40k/mes</span>
                  {additionalAutomations > 0 && (
                    <span className="font-bold text-teal-600">
                      +${((Math.floor(additionalAutomations / 5) * 40000) + ((additionalAutomations % 5) * 10000)).toLocaleString('es-CO')}/mes
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Plans to Quote */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-text-secondary uppercase">
                  Planes a Cotizar (Máx. 2)
                </label>
                <span className="text-[10px] font-extrabold text-teal-600 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 rounded-full border border-teal-500/20">
                  {selectedPlans.length}/2 Seleccionados
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  { key: 'anual', label: 'Plan Pro Anual ($1.200.000 COP)', sub: 'Desde $100.000/mes', badge: 'Recomendado' },
                  { key: 'semestral', label: 'Plan Pro Semestral ($641.960 COP)', sub: '$106.993/mes', badge: '6 Meses' },
                  { key: 'trimestral', label: 'Plan Pro Trimestral ($331.270 COP)', sub: '$110.423/mes', badge: '3 Meses' },
                  { key: 'mensual', label: 'Plan Pro Mensual ($114.330 COP)', sub: '$114.330/mes', badge: 'Mensual' },
                  { key: 'vital', label: 'Plan Wappy Vital ($350.000 COP)', sub: 'Pago Único Vitalicio', badge: 'Vitalicio' },
                ].map((p) => {
                  const isChecked = selectedPlans.includes(p.key);
                  return (
                    <div
                      key={p.key}
                      onClick={() => togglePlanSelection(p.key)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'border-teal-500 bg-teal-500/10 text-text-primary font-bold'
                          : 'border-border-medium/40 bg-surface-primary text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${isChecked ? 'bg-teal-600 border-teal-600 text-white' : 'border-border-medium/60'}`}>
                          {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div>{p.label}</div>
                          <div className="text-[10px] font-normal text-text-tertiary">{p.sub}</div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400">{p.badge}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Discount Percentage (Max 20%) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-text-secondary uppercase">
                  Descuento Comercial de Embajador (Máx. 20%)
                </label>
                <span className="text-xs font-black text-teal-600">{customDiscount}% OFF</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 5, 10, 15, 20].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCustomDiscount(d)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      customDiscount === d
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'bg-surface-primary border-border-medium/40 text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {d === 0 ? '0%' : `${d}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Observations */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1">
                Observaciones Específicas / Necesidades
              </label>
              <textarea
                value={customObservations}
                onChange={(e) => setCustomObservations(e.target.value)}
                placeholder="Ej. La empresa requiere actualizar urgente su Matriz IPEVAR y el Plan Estratégico de Seguridad Vial (PESV) para auditoría ARL en 30 días."
                rows={2}
                className="w-full bg-surface-primary border border-border-medium/40 rounded-xl px-3 py-2 text-xs outline-none focus:border-teal-500 text-text-primary resize-none"
              />
            </div>

            {/* Advisor Info */}
            <div className="pt-2 border-t border-border-medium/30 space-y-2">
              <label className="block text-[10px] font-bold text-text-tertiary uppercase">
                Datos del Asesor Comercial / Firma
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={advisorName}
                  onChange={(e) => setAdvisorName(e.target.value)}
                  placeholder="Nombre Asesor"
                  className="bg-surface-primary border border-border-medium/40 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  value={advisorPhone}
                  onChange={(e) => setAdvisorPhone(e.target.value)}
                  placeholder="WhatsApp Asesor"
                  className="bg-surface-primary border border-border-medium/40 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleGenerateProposal}
              disabled={isGenerating || !companyName.trim()}
              className="group relative w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:scale-[1.01] active:scale-95 disabled:opacity-50 transition-all duration-300 cursor-pointer overflow-hidden"
            >
              <div className="relative flex-shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
                {isGenerating ? (
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-teal-200 group-hover:text-white" />
                )}
              </div>
              <span className="tracking-wide">
                {isGenerating ? 'Generando Propuesta con IA...' : 'Generar Propuesta con IA'}
              </span>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Right Column: Live Executive Document Preview & Printable PDF */}
        <div className="xl:col-span-8 lg:col-span-7 col-span-1 min-w-0 w-full">
          {proposal ? (
            <div className="space-y-4 min-w-0 w-full">
              {/* Document Action Toolbar */}
              <div className="bg-white dark:bg-gray-900 border border-border-medium/40 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden min-w-0 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-xs font-bold text-text-primary truncate">
                    Propuesta: <span className="text-teal-600">{proposal.proposalCode}</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail}
                    className="group flex items-center justify-center h-8 px-2.5 min-w-[32px] sm:h-9 sm:px-3 sm:min-w-[36px] transition-all duration-300 shadow-md shadow-teal-500/10 hover:shadow-teal-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-teal-600 hover:bg-teal-700 text-white sm:hover:scale-105 active:scale-95 disabled:opacity-50"
                    title="Enviar por Correo Oficial"
                  >
                    <div className="relative flex-shrink-0 flex items-center justify-center">
                      {isSendingEmail ? <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                    </div>
                    <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                      <span className="text-xs font-bold tracking-wide">{isSendingEmail ? 'Enviando...' : 'Enviar por Correo'}</span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      const next = !isEditable;
                      setIsEditable(next);
                      if (!next) {
                        showToast({ message: 'Cambios de texto guardados en la propuesta', status: 'success' });
                      } else {
                        showToast({ message: 'Modo edición activado: Haz clic sobre cualquier texto para modificarlo', status: 'info' });
                      }
                    }}
                    className={`group flex items-center justify-center h-8 px-2.5 min-w-[32px] sm:h-9 sm:px-3 sm:min-w-[36px] transition-all duration-300 shrink-0 cursor-pointer border outline-none rounded-xl sm:hover:scale-105 active:scale-95 ${
                      isEditable
                        ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/20'
                        : 'bg-surface-primary border-border-medium/40 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                    title={isEditable ? 'Guardar Cambios' : 'Editar Texto de la Propuesta'}
                  >
                    <div className="relative flex-shrink-0 flex items-center justify-center">
                      <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                      <span className="text-xs font-bold tracking-wide">{isEditable ? 'Guardar Cambios' : 'Editar Texto'}</span>
                    </div>
                  </button>

                  <button
                    onClick={handlePrintPdf}
                    className="group flex items-center justify-center h-8 px-2.5 min-w-[32px] sm:h-9 sm:px-3 sm:min-w-[36px] transition-all duration-300 shadow-md shadow-slate-500/10 hover:shadow-slate-500/20 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-slate-700 hover:bg-slate-800 text-white sm:hover:scale-105 active:scale-95"
                    title="Descargar PDF"
                  >
                    <div className="relative flex-shrink-0 flex items-center justify-center">
                      <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                      <span className="text-xs font-bold tracking-wide">Descargar PDF</span>
                    </div>
                  </button>

                  <button
                    onClick={handleShareWhatsApp}
                    className="group flex items-center justify-center h-8 px-2.5 min-w-[32px] sm:h-9 sm:px-3 sm:min-w-[36px] transition-all duration-300 shadow-md shadow-emerald-500/15 hover:shadow-emerald-500/30 shrink-0 cursor-pointer border border-transparent outline-none rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white sm:hover:scale-105 active:scale-95"
                    title="Compartir por WhatsApp"
                  >
                    <div className="relative flex-shrink-0 flex items-center justify-center">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                      </svg>
                    </div>
                    <div className="hidden sm:flex items-center max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap">
                      <span className="text-xs font-bold tracking-wide">WhatsApp</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Edit Mode Alert Banner */}
              {isEditable && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-amber-200/80 flex items-center justify-center text-amber-800 shrink-0 font-bold">
                      ✏️
                    </div>
                    <div>
                      <div className="font-extrabold text-amber-950">Modo de Edición en Vivo Activado</div>
                      <div className="text-amber-800 text-[11px]">Haz clic directamente sobre cualquier título, diagnóstico, módulo o texto de la propuesta para editarlo libremente antes de exportar.</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setIsEditable(false);
                      showToast({ message: 'Cambios guardados con éxito en la propuesta', status: 'success' });
                    }}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs shadow-sm transition-all cursor-pointer shrink-0 text-center"
                  >
                    ✓ Guardar Cambios
                  </button>
                </div>
              )}

              {/* Printable Document Container */}
              <div 
                ref={printContainerRef}
                className="bg-white text-gray-900 border border-gray-200 rounded-2xl p-6 sm:p-10 shadow-xl space-y-8 font-sans print:border-none print:shadow-none print:p-0 print:m-0"
                style={{ minHeight: '1100px' }}
              >
                {/* Header: Logos + Proposal Code */}
                <div className="flex items-center justify-between border-b-2 border-teal-600 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center text-white font-black text-2xl shadow-md">
                      W
                    </div>
                    <div>
                      <div className="font-black text-2xl tracking-tight text-gray-900 leading-none">
                        WAPPY <span className="text-teal-600">IA</span>
                      </div>
                      <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mt-0.5">
                        Plataforma Líder de IA en Seguridad y Salud en el Trabajo
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-4">
                    {clientLogo && (
                      <img src={clientLogo} alt="Logo Cliente" className="h-12 max-w-[150px] object-contain" />
                    )}
                    <div>
                      <div className="inline-block bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase mb-1">
                        Propuesta Comercial Oficial
                      </div>
                      <div className="text-xs font-bold text-gray-800">{proposal.proposalCode}</div>
                      <div className="text-[11px] text-gray-500">{new Date(proposal.generatedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                </div>

                {/* Target Company Box */}
                <div className="bg-gradient-to-r from-teal-50 to-gray-50 border border-teal-100 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">Propuesta Preparada Exclusivamente Para:</span>
                    <h1 
                      contentEditable={isEditable}
                      suppressContentEditableWarning
                      className={`text-lg sm:text-xl font-black text-gray-900 mt-0.5 ${isEditable ? 'outline-dashed outline-1 outline-teal-500 bg-teal-50/50 rounded px-1' : ''}`}
                    >
                      {proposal.companyName}
                    </h1>
                    <div className="text-xs text-gray-600 font-medium mt-0.5">
                      {proposal.companyNit && <span>NIT: {proposal.companyNit} • </span>}
                      {clientEmail && <span>Correo: {clientEmail} • </span>}
                      <span>Sector: {proposal.sector}</span>
                      <span> • Alcance: {proposal.employeeCount} trabajadores</span>
                      {proposal.totalCompanies && proposal.totalCompanies > 1 ? (
                        <span> • <strong className="text-teal-800 font-bold">{proposal.totalCompanies} Empresas</strong> ({proposal.additionalCompanies} adicionales)</span>
                      ) : null}
                      • <strong className="text-teal-800 font-bold">{proposal.totalAutomations || 1} Automatizaciones IA</strong> ({proposal.additionalAutomations && proposal.additionalAutomations > 0 ? `1 incluida + ${proposal.additionalAutomations} adic.` : '1 incluida en Plan Pro'})
                    </div>
                  </div>

                  <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase block">Consultor Líder Asignado:</span>
                    <div className="text-xs font-bold text-gray-900">{proposal.ambassadorData.name}</div>
                    {proposal.ambassadorData.phone && (
                      <div className="text-[11px] text-teal-700 font-semibold">{proposal.ambassadorData.phone}</div>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h2 
                    contentEditable={isEditable}
                    suppressContentEditableWarning
                    className={`text-lg font-black text-gray-900 leading-snug ${isEditable ? 'outline-dashed outline-1 outline-teal-500 bg-teal-50/50 rounded p-1' : ''}`}
                  >
                    {proposal.title}
                  </h2>
                </div>

                {/* Section 1: Executive Summary & Sector Diagnosis */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-1">
                    <Briefcase className="w-3.5 h-3.5 text-teal-600" />
                    <span>1. Resumen Ejecutivo y Diagnóstico Sectorial</span>
                  </h3>
                  <div 
                    contentEditable={isEditable}
                    suppressContentEditableWarning
                    className={`text-xs text-gray-700 leading-relaxed space-y-2 bg-gray-50/70 p-4 rounded-xl border border-gray-100 ${isEditable ? 'outline-dashed outline-1 outline-teal-500 bg-teal-50/40 cursor-text' : ''}`}
                  >
                    <p className="font-medium text-gray-900">{proposal.executiveSummary}</p>
                    <p className="text-gray-600"><strong>Diagnóstico para el sector {proposal.sector}:</strong> {proposal.sectorDiagnosis}</p>
                  </div>
                </div>

                {/* Section 2: Included Modules & AI Agents */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-1">
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                    <span>2. Ecosistema de Agentes y Alcance Tecnológico Incluido</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {proposal.includedModules.map((mod, idx) => (
                      <div key={idx} className={`border border-gray-200 rounded-xl p-3.5 bg-white shadow-xs space-y-1.5 ${isEditable ? 'outline-dashed outline-1 outline-teal-400 bg-teal-50/20' : ''}`}>
                        <div className="font-extrabold text-xs text-gray-900 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span contentEditable={isEditable} suppressContentEditableWarning className={isEditable ? 'cursor-text hover:bg-white rounded px-1' : ''}>
                            {mod.title}
                          </span>
                        </div>
                        <p contentEditable={isEditable} suppressContentEditableWarning className={`text-[11px] text-gray-600 leading-relaxed ${isEditable ? 'cursor-text hover:bg-white rounded p-1' : ''}`}>
                          {mod.description}
                        </p>
                        <div className="text-[10px] font-bold text-teal-700 bg-teal-50/80 px-2 py-0.5 rounded inline-block">
                          ✓ <span contentEditable={isEditable} suppressContentEditableWarning className={isEditable ? 'cursor-text' : ''}>{mod.benefits}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Investment Table & Pricing */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-1">
                    <DollarSign className="w-3.5 h-3.5 text-teal-600" />
                    <span>3. Propuesta Económica y Opciones de Inversión</span>
                  </h3>
                  
                  <div className={`grid gap-4 w-full ${
                    proposal.investmentPlans.length === 1 
                      ? 'grid-cols-1' 
                      : 'grid-cols-1 sm:grid-cols-2'
                  }`}>
                    {proposal.investmentPlans.map((plan, idx) => (
                      <div 
                        key={idx}
                        className={`rounded-xl border p-4 sm:p-5 flex flex-col justify-between relative ${
                          plan.isRecommended 
                            ? 'border-teal-600 bg-teal-50/30 shadow-md ring-1 ring-teal-600' 
                            : 'border-gray-200 bg-white shadow-xs'
                        }`}
                      >
                        {plan.isRecommended && (
                          <div className="absolute -top-2.5 right-3 bg-teal-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase shadow">
                            Más Recomendado
                          </div>
                        )}

                        <div>
                          <div className="font-extrabold text-sm sm:text-base text-gray-900">{plan.planName}</div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase">{plan.interval}</div>

                          <div className="my-3">
                            {plan.discountPercentage > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-400 line-through">
                                <span>${plan.regularPrice.toLocaleString('es-CO')} COP</span>
                                <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-1.5 py-0.2 rounded-md no-underline">
                                  {plan.discountPercentage}% OFF
                                </span>
                              </div>
                            )}
                            <div className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                              ${plan.finalPrice.toLocaleString('es-CO')} <span className="text-xs font-bold text-gray-500">COP</span>
                            </div>
                            <div className="text-[10px] text-teal-700 font-semibold mt-0.5">
                              {plan.pricePerMonth > 0 ? `Equivalente a ~$${plan.pricePerMonth.toLocaleString('es-CO')} COP / mes` : 'Acceso Vitalicio'}
                            </div>
                          </div>

                          <ul className={`text-[11px] text-gray-600 mb-4 border-t border-gray-100 pt-3 ${
                            proposal.investmentPlans.length === 1 
                              ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 space-y-0' 
                              : 'space-y-1.5'
                          }`}>
                            {plan.features.map((feat, fIdx) => (
                              <li key={fIdx} className="flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                                <span contentEditable={isEditable} suppressContentEditableWarning className={isEditable ? 'cursor-text hover:bg-white rounded px-1' : ''}>
                                  {feat}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <a
                          href={plan.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2 text-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition-colors block print:hidden"
                        >
                          Activar Este Plan →
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 4: ROI Analysis */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
                    <span>4. Retorno de Inversión (ROI Estimado para la Empresa)</span>
                  </h3>
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold text-emerald-800 uppercase">Ahorro de Tiempo Estimado</div>
                      <div 
                        contentEditable={isEditable}
                        suppressContentEditableWarning
                        className={`text-base font-black text-emerald-950 ${isEditable ? 'outline-dashed outline-1 outline-emerald-400 bg-white/70 rounded px-1 cursor-text' : ''}`}
                      >
                        {proposal.roiAnalysis.timeSavedHoursPerMonth}
                      </div>
                      <div className="text-xs text-emerald-700 mt-0.5">
                        Ahorro financiero directo: <strong contentEditable={isEditable} suppressContentEditableWarning className={isEditable ? 'outline-dashed outline-1 outline-emerald-400 bg-white/70 rounded px-1 cursor-text' : ''}>{proposal.roiAnalysis.estimatedSavingsCop}</strong>
                      </div>
                    </div>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {proposal.roiAnalysis.qualitativeBenefits.map((b, bIdx) => (
                        <li key={bIdx} className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span contentEditable={isEditable} suppressContentEditableWarning className={isEditable ? 'cursor-text hover:bg-white/70 rounded px-1' : ''}>
                            {b}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Section 5: Implementation Timeline */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-1">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    <span>5. Cronograma de Adopción e Implementación Inmediata</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {proposal.implementationTimeline.map((item, tIdx) => (
                      <div key={tIdx} className={`bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1 ${isEditable ? 'outline-dashed outline-1 outline-teal-400 bg-teal-50/20' : ''}`}>
                        <div contentEditable={isEditable} suppressContentEditableWarning className={`text-[10px] font-black text-teal-700 uppercase ${isEditable ? 'cursor-text' : ''}`}>
                          {item.time}
                        </div>
                        <div contentEditable={isEditable} suppressContentEditableWarning className={`font-bold text-gray-900 ${isEditable ? 'cursor-text' : ''}`}>
                          {item.phase}
                        </div>
                        <div contentEditable={isEditable} suppressContentEditableWarning className={`text-[11px] text-gray-600 ${isEditable ? 'cursor-text' : ''}`}>
                          {item.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 6: Terms & Signature */}
                <div className="border-t-2 border-gray-200 pt-5 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Términos y Condiciones Comerciales:</h4>
                    <ul className="text-[10px] text-gray-600 space-y-1 list-disc list-inside">
                      {proposal.termsAndConditions.map((tc, tcIdx) => (
                        <li key={tcIdx}>
                          <span contentEditable={isEditable} suppressContentEditableWarning className={isEditable ? 'cursor-text hover:bg-teal-50 rounded px-1' : ''}>
                            {tc}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div 
                    contentEditable={isEditable}
                    suppressContentEditableWarning
                    className={`text-xs text-gray-700 font-medium italic bg-teal-50/50 p-3 rounded-lg border border-teal-100 ${isEditable ? 'outline-dashed outline-1 outline-teal-500 bg-teal-50/80 cursor-text' : ''}`}
                  >
                    "{proposal.closingMessage}"
                  </div>

                  {/* Signature Box */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <div className="font-black text-xs text-gray-900">{proposal.ambassadorData.name}</div>
                      <div className="text-[11px] text-teal-700 font-bold">Consultor Líder & Embajador Comercial WAPPY IA</div>
                      <div className="text-[10px] text-gray-500">
                        {proposal.ambassadorData.phone && `WhatsApp: ${proposal.ambassadorData.phone} • `}
                        {proposal.ambassadorData.email}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-[10px] font-bold text-gray-500">WAPPY IA — TECNOLOGÍA APLICADA A SST</div>
                      <div className="text-[10px] text-teal-700 font-mono font-bold">wappy.club</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="bg-white dark:bg-gray-900 border border-border-medium/40 rounded-2xl p-10 text-center shadow-sm flex flex-col items-center justify-center min-h-[520px] space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-teal-500/10 flex items-center justify-center text-teal-600">
                <FileText className="w-8 h-8" />
              </div>
              <div className="max-w-md">
                <h3 className="text-base sm:text-lg font-black text-text-primary">
                  Configura los Datos de tu Cliente
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Ingresa el nombre de la empresa, NIT y sector en el panel izquierdo. Al hacer clic en <strong>Generar Propuesta con IA</strong>, Gemini 3.5 construirá un documento comercial completo con diagnóstico sectorial, catálogo de agentes, tablas de inversión y cálculo de ROI listo para descargar en PDF.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
