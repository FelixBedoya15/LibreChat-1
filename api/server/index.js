require('dotenv').config();
const fs = require('fs');
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const cors = require('cors');
const axios = require('axios');
const express = require('express');
const passport = require('passport');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { logger } = require('@librechat/data-schemas');
const mongoSanitize = require('express-mongo-sanitize');
const {
  isEnabled,
  ErrorController,
  performStartupChecks,
  initializeFileStorage,
} = require('@librechat/api');
const { connectDb, indexSync } = require('~/db');
const initializeOAuthReconnectManager = require('./services/initializeOAuthReconnectManager');
const createValidateImageRequest = require('./middleware/validateImageRequest');
const { jwtLogin, ldapLogin, passportLogin } = require('~/strategies');
const { updateInterfacePermissions } = require('~/models/interface');
const { checkMigrations } = require('./services/start/migration');
const initializeMCPs = require('./services/initializeMCPs');
const configureSocialLogins = require('./socialLogins');
const { getAppConfig } = require('./services/Config');
const staticCache = require('./utils/staticCache');
const noIndex = require('./middleware/noIndex');
const { seedDatabase } = require('~/models');
const routes = require('./routes');
const { checkConvoLimits } = require('./middleware');

const { PORT, HOST, ALLOW_SOCIAL_LOGIN, DISABLE_COMPRESSION, TRUST_PROXY } = process.env ?? {};

logger.info('Environment variables loaded:', {
  PORT,
  HOST,
  ALLOW_SOCIAL_LOGIN,
  DISABLE_COMPRESSION,
  TRUST_PROXY,
  NODE_ENV: process.env.NODE_ENV,
  DOMAIN_CLIENT: process.env.DOMAIN_CLIENT,
  DOMAIN_SERVER: process.env.DOMAIN_SERVER,
});

// Allow PORT=0 to be used for automatic free port assignment
const port = isNaN(Number(PORT)) ? 3080 : Number(PORT);
const host = HOST || 'localhost';
const trusted_proxy = Number(TRUST_PROXY) || 1; /* trust first proxy by default */

const app = express();

const startServer = async () => {
  if (typeof Bun !== 'undefined') {
    axios.defaults.headers.common['Accept-Encoding'] = 'gzip';
  }
  await connectDb();

  logger.info('Connected to MongoDB');

  indexSync().catch((err) => {
    logger.error('[indexSync] Background sync failed:', err);
  });

  app.disable('x-powered-by');
  app.set('trust proxy', trusted_proxy);

  await seedDatabase();
  const appConfig = await getAppConfig();
  initializeFileStorage(appConfig);
  await performStartupChecks(appConfig);
  await updateInterfacePermissions(appConfig);

  const indexPath = path.join(appConfig.paths.dist, 'index.html');
  let indexHTML = fs.readFileSync(indexPath, 'utf8');

  // In order to provide support to serving the application in a sub-directory
  // We need to update the base href if the DOMAIN_CLIENT is specified and not the root path
  if (process.env.DOMAIN_CLIENT) {
    const clientUrl = new URL(process.env.DOMAIN_CLIENT);
    const baseHref = clientUrl.pathname.endsWith('/')
      ? clientUrl.pathname
      : `${clientUrl.pathname}/`;
    if (baseHref !== '/') {
      logger.info(`Setting base href to ${baseHref}`);
      indexHTML = indexHTML.replace(/base href="\/"/, `base href="${baseHref}"`);
    }
  }

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  /* Middleware */
  app.use(noIndex);


  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));
  app.use(mongoSanitize());
  app.use(cors());
  app.use(cookieParser());

  if (!isEnabled(DISABLE_COMPRESSION)) {
    app.use(compression());
  } else {
    console.warn('Response compression has been disabled via DISABLE_COMPRESSION.');
  }

  app.use(staticCache(appConfig.paths.dist));
  app.use(staticCache(appConfig.paths.fonts));
  app.use(staticCache(appConfig.paths.assets));
  app.use('/Agentes', staticCache(path.resolve(__dirname, '../../Agentes'), { skipGzipScan: true }));

  app.get('/download/somos-sst-wappyclub/windows', (req, res) => {
    const installersDir = path.resolve(__dirname, '../../uploads/installers');
    const fileName = 'SomosSST-WappyClub-Setup.exe';
    const filePath = path.join(installersDir, fileName);
    res.download(filePath, fileName, (err) => {
      if (err) {
        res.status(404).send(`El instalador de Windows de "Somos SST - WappyClub" aún se está empaquetando en el servidor. Por favor, intente de nuevo en unos minutos.`);
      }
    });
  });

  app.get('/download/somos-sst-wappyclub/mac', (req, res) => {
    const installersDir = path.resolve(__dirname, '../../uploads/installers');
    const fileName = 'SomosSST-WappyClub.dmg';
    const filePath = path.join(installersDir, fileName);
    res.download(filePath, fileName, (err) => {
      if (err) {
        res.status(404).send(`El instalador de macOS de "Somos SST - WappyClub" aún se está empaquetando en el servidor. Por favor, intente de nuevo en unos minutos.`);
      }
    });
  });

  if (!ALLOW_SOCIAL_LOGIN) {
    console.warn('Social logins are disabled. Set ALLOW_SOCIAL_LOGIN=true to enable them.');
  }

  /* OAUTH */
  app.use(passport.initialize());
  passport.use(jwtLogin());
  passport.use(passportLogin());

  /* LDAP Auth */
  if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
    passport.use(ldapLogin);
  }

  if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
    await configureSocialLogins(app);
  }

  // Debug: Check which routes are undefined
  const routeChecks = [
    ['oauth', routes.oauth],
    ['auth', routes.auth],
    ['actions', routes.actions],
    ['keys', routes.keys],
    ['user', routes.user],
    ['search', routes.search],
    ['edit', routes.edit],
    ['messages', routes.messages],
    ['convos', routes.convos],
    ['presets', routes.presets],
    ['prompts', routes.prompts],
    ['categories', routes.categories],
    ['tokenizer', routes.tokenizer],
    ['endpoints', routes.endpoints],
    ['balance', routes.balance],
    ['models', routes.models],
    ['plugins', routes.plugins],
    ['config', routes.config],
    ['assistants', routes.assistants],
    ['staticRoute', routes.staticRoute],
    ['share', routes.share],
    ['roles', routes.roles],
    ['agents', routes.agents],
    ['banner', routes.banner],
    ['memories', routes.memories],
    ['accessPermissions', routes.accessPermissions],
    ['tags', routes.tags],
    ['mcp', routes.mcp],
    ['admin', routes.admin],
    ['voice', routes.voice],
    ['ads', routes.ads],
    ['sgsst', routes.sgsst],
    ['training', routes.training],
    ['wompi', routes.wompi],
    ['tenshi', routes.tenshi],
    ['tickets', routes.tickets],
    ['notifications', routes.notifications],
    ['contact', routes.contact],
    ['publicReports', routes.publicReports],
    ['liveDocuments', routes.liveDocuments],
    ['whatsapp', routes.whatsapp],
    ['referrals', routes.referrals],
    ['rutaAprendizaje', routes.rutaAprendizaje],
    ['googleDrive', routes.googleDrive],
    ['oneDrive', routes.oneDrive],
  ];


  for (const [name, route] of routeChecks) {
    if (!route) {
      logger.error(`ROUTE ERROR: routes.${name} is undefined!`);
      throw new Error(`Route ${name} is undefined`);
    }
  }

  app.use('/oauth', routes.oauth);
  /* API Endpoints */
  app.use('/api/auth', routes.auth);
  app.use('/api/actions', routes.actions);
  app.use('/api/keys', routes.keys);
  app.use('/api/user', routes.user);
  app.use('/api/google-drive', routes.googleDrive);
  app.use('/api/one-drive', routes.oneDrive);
  app.use('/api/search', routes.search);
  app.use('/api/edit', routes.edit);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/categories', routes.categories);
  app.use('/api/tokenizer', routes.tokenizer);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/balance', routes.balance);
  app.use('/api/models', routes.models);
  app.use('/api/plugins', routes.plugins);
  app.use('/api/config', routes.config);
  app.use('/api/assistants', routes.assistants);
  app.use('/api/files', await routes.files.initialize());
  app.use('/images/', createValidateImageRequest(appConfig.secureImageLinks), routes.staticRoute);
  app.use('/api/share', routes.share);
  app.use('/api/roles', routes.roles);
  app.use('/api/agents', routes.agents);
  app.use('/api/banner', routes.banner);
  app.use('/api/memories', routes.memories);
  app.use('/api/permissions', routes.accessPermissions);

  app.use('/api/tags', routes.tags);
  app.use('/api/mcp', routes.mcp);
  app.use('/api/admin', routes.admin);
  app.use('/api/voice', routes.voice);
  app.use('/api/ads', routes.ads);
  app.use('/api/sgsst/diagnostico', routes.sgsst.diagnostico);
  app.use('/api/sgsst/company-info', routes.sgsst.companyInfo);
  app.use('/api/sgsst/config', routes.sgsst.config);
  app.use('/api/sgsst/signatures', routes.sgsst.signatures);
  app.use('/api/sgsst/responsable', routes.sgsst.responsable);
  app.use('/api/sgsst/politica', routes.sgsst.politica);

  app.use('/api/sgsst/objetivos', routes.sgsst.objetivos);
  app.use('/api/sgsst/permiso-alturas', routes.sgsst.permisoAlturas);
  app.use('/api/sgsst/analisis-vulnerabilidad', routes.sgsst.analisisVulnerabilidad);
  app.use('/api/sgsst/reporte-actos', routes.sgsst.reporteActos);
  app.use('/api/sgsst/analisis-trabajo-seguro', routes.sgsst.analisisTrabajoSeguro);
  app.use('/api/sgsst/metodo-owas', routes.sgsst.metodoOwas);
  app.use('/api/sgsst/investigacion-atel', routes.sgsst.investigacionAtel);
  app.use('/api/sgsst/matriz', routes.sgsst.matriz);
  app.use('/api/sgsst/estadisticas', routes.sgsst.estadisticas);
  app.use('/api/sgsst/atel-data', routes.sgsst.atelData);
  app.use('/api/sgsst/matriz-peligros', routes.sgsst.matrizPeligros);
  app.use('/api/sgsst/perfiles-cargo', routes.sgsst.perfilesCargo);
  app.use('/api/sgsst/rhs', routes.sgsst.rhs);
  app.use('/api/sgsst/rit', routes.sgsst.rit);
  app.use('/api/sgsst/perfil-sociodemografico', routes.sgsst.perfilSociodemografico);
  app.use('/api/sgsst/predictivo', routes.sgsst.predictivo);
  app.use('/api/sgsst/participacion-ipevar', routes.sgsst.participacionIpevar);
  app.use('/api/sgsst/alta-direccion', routes.sgsst.altaDireccion);
  app.use('/api/sgsst/programa-capacitaciones', routes.sgsst.programaCapacitaciones);
  app.use('/api/sgsst/patch-agent-prompt', routes.sgsst.patchAgentPrompt);
  app.use('/api/sgsst/sync-agents', routes.sgsst.syncAgents);
  app.use('/api/sgsst/gtc45-workspace', routes.sgsst.gtc45Workspace);
  app.use('/api/sgsst/pesv-workspace', routes.sgsst.pesvWorkspace);
  app.use('/api/sgsst/chemical-compatibility', routes.sgsst.chemicalCompatibilityWorkspace);
  app.use('/api/sgsst/workers', routes.sgsst.workers);
  app.use('/api/sgsst/canvas', routes.sgsst.canvas);
  app.use('/api/sgsst/investigacion-profunda', routes.sgsst.investigacionProfunda);
  app.use('/api/sgsst/epp', routes.sgsst.epp);
  app.use('/api/sgsst/vehicles', routes.sgsst.vehicles);
  app.use('/api/sgsst/heights', routes.sgsst.heights);
  app.use('/api/sgsst/chemicals', routes.sgsst.chemicals);
  app.use('/api/sgsst/kanban', routes.sgsst.kanban);
  app.use('/api/sgsst/automatizaciones', routes.sgsst.automatizaciones);
  app.use('/api/sgsst/subusers', routes.sgsst.subusers);
  app.use('/api/sgsst/estudio-puesto', routes.sgsst.estudioPuestoTrabajo);
  app.use('/api/live-editor', routes.sgsst.liveEditor);
  app.use('/api/live-analysis', routes.sgsst.liveEditor);
  app.use('/api/training', routes.training);
  app.use('/api/blog', routes.blog);
  app.use('/api/wompi', routes.wompi);
  app.use('/api/tenshi', routes.tenshi);
  app.use('/api/tickets', routes.tickets);
  app.use('/api/notifications', routes.notifications);
  app.use('/api/contact', routes.contact);
  app.use('/api/public-report', routes.publicReports);
  app.use('/api/public-sgsst', routes.publicSgsst);
  app.use('/api/live/documents', routes.liveDocuments);
  app.use('/api/live', routes.liveAiEdit);
  app.use('/api/roadmap', routes.roadmap);
  app.use('/api/whatsapp', routes.whatsapp);
  app.use('/api/referrals', routes.referrals);
  app.use('/api/comunidad', routes.comunidad);
  app.use('/api/ruta-aprendizaje', routes.rutaAprendizaje);
  app.use('/api/chat-sst', routes.chatSST);
  app.use('/api/events', routes.events);




  // TEMP MIGRATION ROUTE - REMOVE AFTER USE
  app.get('/api/temp-bulk-update-dates', async (req, res) => {
    try {
      const mongoose = require('mongoose');
      const User = mongoose.model('User');
      const activeDate = new Date('2026-01-27T00:00:00.000Z');
      const inactiveDate = new Date();
      inactiveDate.setMonth(inactiveDate.getMonth() + 2);

      const result = await User.updateMany(
        { role: { $ne: 'ADMIN' } },
        {
          $set: {
            activeAt: activeDate,
            inactiveAt: inactiveDate
          }
        }
      );
      res.json({ message: 'Migration success', modifiedCount: result.modifiedCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Ruta de redirección limpia para Meta Ads y comunidad de WhatsApp
  app.get(['/links', '/links/'], (req, res) => {
    res.type('html');
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WAPPY IA - Conecta con Nosotros</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0e9f6e; /* Wappy Brand Teal/Green */
            --primary-hover: #0b8a5f;
            --primary-glow: rgba(14, 159, 110, 0.15);
            --accent: #8b5cf6;
            --background: #f3f4f6; /* Clean soft light gray matching Wappy dashboard background */
            --card-bg: #ffffff;
            --text-main: #111827; /* Dark high-contrast slate */
            --text-muted: #6b7280; /* Elegant gray */
            --border-color: #e5e7eb;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--background);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow-x: hidden;
            position: relative;
            padding: 40px 20px;
        }

        /* Abstract elegant background glows to match premium corporate brand */
        body::before {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(14, 159, 110, 0.08) 0%, rgba(139, 92, 246, 0.02) 60%, rgba(0,0,0,0) 100%);
            top: -150px;
            right: -100px;
            z-index: 0;
            pointer-events: none;
        }

        body::after {
            content: '';
            position: absolute;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, rgba(14, 159, 110, 0.02) 60%, rgba(0,0,0,0) 100%);
            bottom: -150px;
            left: -100px;
            z-index: 0;
            pointer-events: none;
        }

        .container {
            z-index: 10;
            width: 100%;
            max-width: 480px;
            text-align: center;
        }

        .profile-card {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px 30px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .logo-container {
            margin-bottom: 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .logo-glow {
            position: absolute;
            width: 100px;
            height: 100px;
            background: var(--primary);
            filter: blur(25px);
            opacity: 0.12;
            border-radius: 50%;
            z-index: -1;
        }

        .logo-image {
            width: 140px;
            height: auto;
            object-fit: contain;
        }

        h1 {
            font-size: 26px;
            font-weight: 700;
            color: var(--text-main);
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }

        .bio {
            font-size: 15px;
            color: var(--text-muted);
            line-height: 1.5;
            margin-bottom: 32px;
            padding: 0 10px;
        }

        .links-wrapper {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .link-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            background: #ffffff;
            border: 1px solid var(--border-color);
            border-radius: 16px;
            text-decoration: none;
            color: var(--text-main);
            transition: all 0.25s ease;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }

        .link-card:hover {
            transform: translateY(-2px);
            border-color: var(--primary);
            box-shadow: 0 8px 20px var(--primary-glow);
        }

        .link-content {
            display: flex;
            align-items: center;
            gap: 16px;
            text-align: left;
        }

        .icon-box {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f9fafb;
            border: 1px solid #f3f4f6;
            flex-shrink: 0;
            transition: all 0.25s ease;
        }

        .link-card:hover .icon-box {
            background: rgba(14, 159, 110, 0.05);
            border-color: rgba(14, 159, 110, 0.1);
        }

        .link-info h2 {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-main);
            margin-bottom: 2px;
        }

        .link-info p {
            font-size: 13px;
            color: var(--text-muted);
        }

        .arrow-icon {
            color: #d1d5db;
            transition: all 0.25s ease;
        }

        .link-card:hover .arrow-icon {
            color: var(--primary);
            transform: translateX(3px);
        }

        /* Styling for the featured badge link */
        .featured-link {
            border: 1.5px solid rgba(14, 159, 110, 0.3);
            background: linear-gradient(to right, #ffffff, rgba(14, 159, 110, 0.01));
        }

        .featured-link:hover {
            border-color: var(--primary);
            box-shadow: 0 8px 25px rgba(14, 159, 110, 0.2);
        }

        .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #9ca3af;
        }

        .footer a {
            color: var(--primary);
            text-decoration: none;
            font-weight: 500;
        }

        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="profile-card">
            <div class="logo-container">
                <div class="logo-glow"></div>
                <img src="/assets/logo.png" alt="WAPPY Logo" class="logo-image">
            </div>
            <p class="bio">Optimiza tu gestión de seguridad y salud en el trabajo con Inteligencia Artificial de primer nivel.</p>
            
            <div class="links-wrapper">
                <!-- Link 1: Comunidad (Principal) -->
                <a href="#" onclick="openGroup(event)" class="link-card featured-link">
                    <div class="link-content">
                        <div class="icon-box">
                            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style="color: #25D366;">
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.968C16.73 1.97 14.26 .946 11.663.946c-5.432 0-9.855 4.37-9.859 9.8.001 2.01.53 3.976 1.529 5.713L2.3 20.2l4.347-1.046zM17.65 14.3c-.3-.15-1.79-.88-2.05-.98-.26-.1-.45-.15-.64.15-.19.3-.74.95-.91 1.15-.17.19-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.38-.02-.52-.07-.15-.64-1.54-.88-2.11-.23-.56-.47-.48-.64-.49-.16-.01-.35-.01-.54-.01-.19 0-.5.07-.76.35-.26.29-1 .98-1 2.38s1.02 2.76 1.16 2.96c.14.2 2 3.05 4.84 4.28.68.29 1.21.47 1.62.6.68.22 1.3.19 1.79.12.54-.08 1.79-.73 2.05-1.4.26-.67.26-1.25.18-1.37-.08-.12-.3-.2-.6-.35z"/>
                            </svg>
                        </div>
                        <div class="link-info">
                            <h2>Comunidad Oficial</h2>
                            <p>Curso gratuito de IA para SST.</p>
                        </div>
                    </div>
                    <svg class="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </a>

                <!-- Link 2: Registro en WAPPY (current domain relative url) -->
                <a href="/register" class="link-card">
                    <div class="link-content">
                        <div class="icon-box" style="background: #ffffff;">
                            <img src="/assets/icon-192x192.png" alt="WAPPY Icon" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover;">
                        </div>
                        <div class="link-info">
                            <h2>Crear tu Cuenta Gratis</h2>
                            <p>Regístrate en la plataforma y prueba WAPPY IA.</p>
                        </div>
                    </div>
                    <svg class="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </a>

                <!-- Link 3: Instagram Oficial -->
                <a href="https://www.instagram.com/wappy_ia" target="_blank" class="link-card">
                    <div class="link-content">
                        <div class="icon-box">
                            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style="color: #E1306C;">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                            </svg>
                        </div>
                        <div class="link-info">
                            <h2>Instagram Oficial</h2>
                            <p>Síguenos en @wappy_ia para tips de SST.</p>
                        </div>
                    </div>
                    <svg class="arrow-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </a>
            </div>
        </div>
        <div class="footer">
            &copy; 2026 <a href="/">WAPPY IA</a>. Todos los derechos reservados.
        </div>
    </div>
    <script>
        function openGroup(event) {
            event.preventDefault();
            const e = 'aHR0cHM6Ly9jaGF0LndoYXRzYXBwLmNvbS9HQk5sM1NkdHdjZExMalNlT3RMblp5';
            window.open(atob(e), '_blank');
        }
    </script>
</body>
</html>`);
  });

  app.get(['/embajadores', '/embajadores.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../convocatoria_embajadores.html'));
  });

  app.get(['/contratoembajadores', '/contratoembajadores.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../contratoembajadores.html'));
  });

  app.get(['/cursoappweb', '/cursoappweb.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../cursoappweb.html'));
  });

  app.post('/api/embajadores/send-otp', async (req, res) => {
    try {
      const { email, name, otpCode } = req.body;
      if (!email || !name || !otpCode) {
        return res.status(400).json({ message: 'Faltan datos requeridos (email, name, otpCode).' });
      }

      logger.info(`[Embajadores OTP] Intentando enviar correo a: ${email} para el embajador: ${name}`);

      const sendEmail = require('./utils/sendEmail');
      const mailInfo = await sendEmail({
        email,
        subject: 'Código de Verificación - WAPPY LTDA',
        payload: {
          name,
          otpCode,
        },
        template: 'verifyEmbajadorOtp.handlebars',
      });

      logger.info('[Embajadores OTP] Correo enviado exitosamente. Info:', mailInfo);

      res.json({ message: 'Código enviado con éxito.' });
    } catch (err) {
      logger.error('[Embajadores OTP] Error al enviar el correo:', err);
      res.status(500).json({ message: 'No se pudo enviar el correo de verificación.', error: err.message });
    }
  });

  app.post('/api/embajadores/notify-admin', async (req, res) => {
    try {
      const {
        contractId, nombre, cedula, expedicion, email, celular,
        direccion, domicilio, territorio, aledanos, profesion,
        banco, tipoCuenta, numeroCuenta, fechaFirma, documentos,
        pdfBase64, pdfFilename, attachments
      } = req.body;

      if (!email || !nombre || !contractId) {
        return res.status(400).json({ message: 'Faltan datos requeridos.' });
      }

      const sendEmail = require('./utils/sendEmail');

      const payload = {
        name: nombre, // map to name for Nodemailer toAddress field
        contractId, nombre, cedula, expedicion, email, celular,
        direccion, domicilio, territorio, aledanos, profesion,
        banco, tipoCuenta, numeroCuenta, fechaFirma,
        documentos: documentos || 'Cédula, RUT',
      };

      // Process attachments
      const emailAttachments = [];

      if (pdfBase64 && pdfFilename) {
        const mime = pdfBase64.match(/data:([^;]+);base64/)?.[1] || 'application/pdf';
        emailAttachments.push({
          filename: pdfFilename,
          content: Buffer.from(pdfBase64.split(';base64,').pop(), 'base64'),
          contentType: mime,
        });
      }

      if (attachments && Array.isArray(attachments)) {
        attachments.forEach((att) => {
          if (att.base64 && att.filename) {
            const mime = att.base64.match(/data:([^;]+);base64/)?.[1] || 'application/octet-stream';
            emailAttachments.push({
              filename: att.filename,
              content: Buffer.from(att.base64.split(';base64,').pop(), 'base64'),
              contentType: mime,
            });
          }
        });
      }

      // 1️⃣ Email al admin / soporte (uno por uno con try/catch y fallback si excede el tamaño)
      const adminEmails = Array.from(new Set([
        process.env.SUPPORT_EMAIL || 'soporte@wappy.club',
        'wappyinteractivo@gmail.com',
      ]));

      for (const adminEmail of adminEmails) {
        try {
          await sendEmail({
            email: adminEmail,
            subject: `🖊️ Nuevo Contrato Embajador firmado — ${nombre} (${contractId})`,
            payload,
            template: 'contratoEmbajadorAdmin.handlebars',
            attachments: emailAttachments,
          });
          logger.info(`[Embajadores] Notificación enviada a admin: ${adminEmail}`);
        } catch (adminErr) {
          logger.error(`[Embajadores] Error al enviar notificación a admin (${adminEmail}):`, adminErr);

          // FALLBACK: Si falló (ej: tamaño de adjuntos excedido), reintentar sin los anexos pesados, enviando SOLO el contrato PDF
          try {
            logger.info(`[Embajadores] Reintentando envío a admin (${adminEmail}) solo con PDF del contrato...`);
            await sendEmail({
              email: adminEmail,
              subject: `🖊️ Nuevo Contrato Embajador firmado (Sin anexos grandes) — ${nombre} (${contractId})`,
              payload,
              template: 'contratoEmbajadorAdmin.handlebars',
              attachments: emailAttachments.slice(0, 1), // Solo el PDF del contrato
            });
            logger.info(`[Embajadores] Reintento exitoso a admin: ${adminEmail}`);
          } catch (fallbackErr) {
            logger.error(`[Embajadores] Error en reintento fallback de admin (${adminEmail}):`, fallbackErr);
          }
        }
      }

      // 2️⃣ Email de confirmación al embajador (solo con el PDF del contrato)
      try {
        await sendEmail({
          email,
          subject: `¡Bienvenido como Embajador WAPPY! Tu contrato ${contractId} está listo`,
          payload,
          template: 'contratoEmbajadorConfirmacion.handlebars',
          attachments: emailAttachments.slice(0, 1),
        });
        logger.info(`[Embajadores] Confirmación de bienvenida enviada al embajador: ${email}`);
      } catch (embajadorErr) {
        logger.error(`[Embajadores] Error al enviar confirmación al embajador (${email}):`, embajadorErr);
      }

      logger.info(`[Embajadores] Correos procesados para contrato ${contractId} — Embajador: ${nombre} (${email})`);
      res.json({ message: 'Notificaciones procesadas exitosamente.' });
    } catch (err) {
      logger.error('[Embajadores notify-admin] Error general:', err);
      res.status(200).json({ message: 'Contrato registrado con advertencias.', error: err.message });
    }
  });

  app.get(['/portafolio', '/portafolio.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../Agentes/portafolio.html'));
  });

  app.get(['/mauricioposada', '/mauricioposada.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../Agentes/mauricioposada.html'));
  });

  app.get(['/camaracomercioguajira', '/camaracomercioguajira.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../camaracomercioguajira.html'));
  });

  app.get(['/presentacionsura', '/presentacion_arl_sura.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../presentacion_arl_sura.html'));
  });

  app.get(['/presentacioncolmena', '/presentacion_arl_colmena.html', '/presentacion_colmena.html', '/presentacioncolmena.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../presentacion_arl_colmena.html'));
  });

  app.post('/api/presentacion/solicitar-demo', async (req, res) => {
    try {
      const { nombreContacto, emailContacto, telefonoContacto, nombreEmpresa, fechaHora, modalidad } = req.body;

      if (!nombreContacto || !emailContacto || !nombreEmpresa) {
        return res.status(400).json({ message: 'Faltan datos obligatorios (nombre, correo y empresa).' });
      }

      const sendEmail = require('./utils/sendEmail');
      const payload = {
        signerName: nombreContacto,
        signerRole: modalidad || 'Virtual',
        signerNit: telefonoContacto || 'No especificado',
        signerEmail: emailContacto,
        proposalName: `Solicitud de Demostración Presencial/Virtual - ${nombreEmpresa}`,
        date: fechaHora || 'Por acordar',
        serviceName: 'Demo Técnica de Wappy IA',
        supportName: 'Programación de Reunión',
        onboardingName: `Modalidad: ${modalidad}`,
        conferenceName: `Fecha sugerida: ${fechaHora}`,
        investmentAmount: 'N/A'
      };

      // Send email to support
      const supportEmails = [
        process.env.SUPPORT_EMAIL || 'soporte@wappy.club',
        'wappyinteractivo@gmail.com'
      ];

      for (const supportEmail of supportEmails) {
        try {
          await sendEmail({
            email: supportEmail,
            subject: `📅 [NUEVO EVENTO] Solicitud de Demo con ${nombreEmpresa}`,
            payload,
            template: 'propuestaAceptada.handlebars'
          });
        } catch (supportErr) {
          logger.error(`[Demo] Error sending notification to support (${supportEmail}):`, supportErr);
        }
      }

      // Send confirmation to client
      await sendEmail({
        email: emailContacto,
        subject: `📅 Confirmación de Solicitud de Demostración — Wappy IA`,
        payload,
        template: 'propuestaAceptada.handlebars'
      });

      res.json({ success: true, message: 'Solicitud de demostración enviada con éxito.' });
    } catch (err) {
      logger.error('[Demo Request] Error al procesar:', err);
      res.status(500).json({ success: false, message: 'Error interno del servidor.', error: err.message });
    }
  });

  app.post('/api/proposals/accept', async (req, res) => {
    try {
      const { 
        signerName, signerRole, signerNit, signerEmail, proposalName, signatureImg, date,
        serviceName, supportName, onboardingName, conferenceName, investmentAmount
      } = req.body;
      
      if (!signerName || !signerEmail || !signatureImg) {
        return res.status(400).json({ message: 'Faltan datos obligatorios (nombre, correo, firma).' });
      }

      const sendEmail = require('./utils/sendEmail');
      
      // Extract base64 image data
      const matches = signatureImg.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ message: 'Formato de firma no válido.' });
      }
      
      const mimeType = matches[1];
      const bufferData = Buffer.from(matches[2], 'base64');

      const payload = {
        name: signerName,
        signerName,
        signerRole,
        signerNit,
        signerEmail,
        proposalName: proposalName || 'Cámara de Comercio de la Guajira',
        date: date || new Date().toLocaleDateString('es-CO'),
        serviceName,
        supportName,
        onboardingName,
        conferenceName,
        investmentAmount
      };

      // Attach signature image inline using CID
      const attachments = [{
        filename: 'signature.png',
        content: bufferData,
        contentType: mimeType,
        cid: 'signatureImage'
      }];

      // Send email to client
      await sendEmail({
        email: signerEmail,
        subject: `📝 Propuesta Firmada y Aceptada — ${payload.proposalName}`,
        payload,
        template: 'propuestaAceptada.handlebars',
        attachments
      });

      // Send email to support/admin
      const supportEmails = [
        process.env.SUPPORT_EMAIL || 'soporte@wappy.club',
        'wappyinteractivo@gmail.com'
      ];

      for (const supportEmail of supportEmails) {
        try {
          await sendEmail({
            email: supportEmail,
            subject: `🔔 Nueva Propuesta Aceptada por Cliente — ${payload.proposalName}`,
            payload,
            template: 'propuestaAceptada.handlebars',
            attachments
          });
        } catch (supportErr) {
          logger.error(`[Proposals] Error sending notification to support (${supportEmail}):`, supportErr);
        }
      }

      res.json({ message: 'Aceptación registrada y correos enviados exitosamente.' });
    } catch (err) {
      logger.error('[Proposals] Error al procesar aceptación:', err);
      res.status(500).json({ message: 'Error interno del servidor.', error: err.message });
    }
  });

  app.get('/api/embajadores/notes', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const notesPath = path.resolve(__dirname, '../../uploads/convocatoria_embajadores_notes.json');
    if (fs.existsSync(notesPath)) {
      res.sendFile(notesPath);
    } else {
      res.json({});
    }
  });

  app.post('/api/embajadores/notes', require('./middleware/requireJwtAuth'), (req, res) => {
    const user = req.user;
    if (user.role === 'ADMIN' || user.email === 'mauricioposadac@gmail.com') {
      const fs = require('fs');
      const path = require('path');
      const notesPath = path.resolve(__dirname, '../../uploads/convocatoria_embajadores_notes.json');
      fs.writeFileSync(notesPath, JSON.stringify(req.body, null, 2));
      res.json({ message: 'Saved successfully' });
    } else {
      res.status(403).json({ message: 'Forbidden' });
    }
  });

  app.use(ErrorController);

  app.use((req, res) => {
    res.set({
      'Cache-Control': process.env.INDEX_CACHE_CONTROL || 'no-cache, no-store, must-revalidate',
      Pragma: process.env.INDEX_PRAGMA || 'no-cache',
      Expires: process.env.INDEX_EXPIRES || '0',
    });

    const lang = req.cookies.lang || req.headers['accept-language']?.split(',')[0] || 'en-US';
    const saneLang = lang.replace(/"/g, '&quot;');
    let updatedIndexHtml = indexHTML.replace(/lang="en-US"/g, `lang="${saneLang}"`);

    res.type('html');
    res.send(updatedIndexHtml);
  });

  const server = app.listen(port, host, async () => {
    if (host === '0.0.0.0') {
      logger.info(
        `Server listening on all interfaces at port ${port}. Use http://localhost:${port} to access it`,
      );
    } else {
      logger.info(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
    }

    await initializeMCPs();
    await initializeOAuthReconnectManager();
    await checkMigrations();

    // Ensure critical agents have the required tools in the database
    try {
      const { Agent } = require('../db/models');
      if (Agent) {
        await Agent.findOneAndUpdate(
          { name: 'Especialista en Riesgo Vial' },
          { $addToSet: { tools: { $each: ['canvas', 'context'] } } }
        );
        logger.info('[Startup] Automatically updated tools for Especialista en Riesgo Vial');

        await Agent.findOneAndUpdate(
          { name: 'Especialista en Riesgo Químico' },
          { $addToSet: { tools: { $each: ['canvas'] } } }
        );
        logger.info('[Startup] Automatically updated tools for Especialista en Riesgo Químico');

        // Pull deactivated tools from all agents
        await Agent.updateMany({}, {
          $pull: {
            tools: { $in: ['matriz_pesv', 'matriz_compatibilidad', 'editor_live'] }
          }
        });
        logger.info('[Startup] Successfully removed deactivated tools (matriz_pesv, matriz_compatibilidad, editor_live) from all agents');
      }
    } catch (err) {
      logger.error('[Startup] Failed to automatically update agent tools:', err);
    }

    // Start background poller for async payment methods (e.g. Compra y Paga Después / Bancolombia BNPL)
    const { startWompiPoller } = require('./services/wompiPendingPoller');
    startWompiPoller();

    // Start background job that automatically downgrades expired plans
    // Rules: annual/semiannual → Wappy Vital (USER_IPEVAR) | monthly/quarterly/referral → Invitado (USER)
    const { startPlanExpirationJob } = require('./services/planExpirationJob');
    startPlanExpirationJob();

    // Start background job that automatically deletes temporary files in chats older than 60 days
    const { startChatFilesCleanupJob } = require('./services/chatFilesCleanupJob');
    startChatFilesCleanupJob();

    // Start background job for daily plan & SST expiration notifications
    const { startNotificationScheduler } = require('./services/notificationScheduler');
    startNotificationScheduler();

    // Start background agent automations scheduler
    const { startAutomationScheduler } = require('./services/automationScheduler');
    startAutomationScheduler();

    // Boot WhatsApp Sessions OpenClaw Architecture — DESACTIVADO TEMPORALMENTE
    // Para reactivar: descomenta las dos líneas de abajo
    // const whatsappManager = require('./whatsapp/WhatsAppManager');
    // await whatsappManager.bootSavedSessions();
  });

  // Setup WebSocket server for voice conversations
  const setupVoiceWebSocket = require('./voiceWebSocket');
  const setupLiveAnalysisWebSocket = require('./liveAnalysisWebSocket');
  const setupMcpWebSocket = require('./mcpWebSocket');
  setupVoiceWebSocket(server);
  setupLiveAnalysisWebSocket(server);
  setupMcpWebSocket(server);
};

startServer();

let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    logger.error('There was an uncaught error:', err);
  }

  if (err.message.includes('abort')) {
    logger.warn('There was an uncatchable AbortController error.');
    return;
  }

  if (err.message.includes('GoogleGenerativeAI')) {
    logger.warn(
      '\n\n`GoogleGenerativeAI` errors cannot be caught due to an upstream issue, see: https://github.com/google-gemini/generative-ai-js/issues/303',
    );
    return;
  }

  if (err.message.includes('fetch failed')) {
    if (messageCount === 0) {
      logger.warn('Meilisearch error, search will be disabled');
      messageCount++;
    }

    return;
  }

  if (err.message.includes('OpenAIError') || err.message.includes('ChatCompletionMessage')) {
    logger.error(
      '\n\nAn Uncaught `OpenAIError` error may be due to your reverse-proxy setup or stream configuration, or a bug in the `openai` node package.',
    );
    return;
  }

  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

/** Export app for easier testing purposes */
module.exports = app;
