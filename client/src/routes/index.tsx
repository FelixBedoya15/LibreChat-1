import SGSSTDashboard from '~/components/SGSST/Dashboard';
import PublicReportView from '~/components/SGSST/PublicReportView';
import PublicReporteActos from '~/components/SGSST/PublicReporteActos';
import PublicParticipacionIPEVAR from '~/components/SGSST/PublicParticipacionIPEVAR';
import PublicAltaDireccion from '~/components/SGSST/PublicAltaDireccion';
import PublicAtelTestimonio from '~/components/SGSST/PublicAtelTestimonio';
import PublicPerfilUpdate from '~/components/SGSST/PublicPerfilUpdate';
import PublicMoodTracker from '~/components/SGSST/PublicMoodTracker';
import MoodAnalyticsDashboard from '~/components/SGSST/MoodAnalyticsDashboard';
import PrivacyPolicyPage from '~/components/Auth/PrivacyPolicyPage';
import TermsOfServicePage from '~/components/Auth/TermsOfServicePage';
import WappyAboutPage from '~/components/Auth/WappyAboutPage';
import ComunidadPage from '~/components/Marketing/ComunidadPage';
import MatrizPage from '~/components/Marketing/MatrizPage';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  Login,
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import AgentMarketplace from '~/components/Agents/Marketplace';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import dashboardRoutes from './Dashboard';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import LivePage from '~/components/Liva/LivePage';
import TrainingDashboard from '~/components/Training/TrainingDashboard';
import CourseViewer from '~/components/Training/CourseViewer';
import TrainingAdminDashboard from '~/components/Training/TrainingAdminDashboard';
import CourseEditor from '~/components/Training/CourseEditor';
import RutaAprendizajeDashboard from '~/components/RutaAprendizaje/RutaAprendizajeDashboard';
import RutaAprendizajeAdminDashboard from '~/components/RutaAprendizaje/RutaAprendizajeAdminDashboard';
import RutaAprendizajeCourseEditor from '~/components/RutaAprendizaje/RutaAprendizajeCourseEditor';
import RutaAprendizajeCourseViewer from '~/components/RutaAprendizaje/RutaAprendizajeCourseViewer';
import PublicRutaAprendizaje from '~/components/RutaAprendizaje/PublicRutaAprendizaje';
import PublicRutaCourseViewer from '~/components/RutaAprendizaje/PublicRutaCourseViewer';
import BlogDashboard from '~/components/Blog/BlogDashboard';
import BlogAdminDashboard from '~/components/Blog/BlogAdminDashboard';
import BlogPostEditor from '~/components/Blog/BlogPostEditor';
import BlogPostViewer from '~/components/Blog/BlogPostViewer';
import TenshiAdminPanel from '~/components/Tenshi/TenshiAdminPanel';
import ChatSSTView from '~/components/ChatSST/ChatSSTView';
import EventsMeetDashboard from '~/components/EventsMeet/EventsMeetDashboard';
import EventsMeetAdminDashboard from '~/components/EventsMeet/EventsMeetAdminDashboard';

import AuditoriaDashboard from '~/components/Auditoria/AuditoriaDashboard';
import Automatizaciones from '~/components/SGSST/Automatizaciones';
import CentroControlSST from '~/components/SGSST/CentroControlSST';
import AcademiaDashboard from '~/components/Academia/AcademiaDashboard';
import PlansPage from '~/components/Plans/PlansPage';
import ContactPage from '~/components/Plans/ContactPage';
import KanbanDashboard from '~/components/Kanban/KanbanDashboard';
import AmbassadorDashboard from '~/components/Ambassadors/AmbassadorDashboard';
import RoadmapPage from '~/components/Roadmap/RoadmapPage';
import Search from './Search';
import Root from './Root';
import RoadmapNotifier from '~/components/Roadmap/RoadmapNotifier';

const EmbajadoresRedirect = () => {
  window.location.replace('/embajadores.html');
  return null;
};

const PortafolioRedirect = () => {
  window.location.replace('/portafolio.html');
  return null;
};

const MauricioPosadaRedirect = () => {
  window.location.replace('/mauricioposada.html');
  return null;
};

const RootIndexRedirect = () => {
  const location = useLocation();
  let search = location.search;
  if (!search) {
    try {
      const savedRef = localStorage.getItem('wappy_ref');
      if (savedRef) {
        search = `?ref=${encodeURIComponent(savedRef)}`;
      }
    } catch (e) {}
  }
  return <Navigate to={{ pathname: '/c/new', search }} replace={true} />;
};

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
    <RoadmapNotifier />
  </AuthContextProvider>
);

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      path: 'share/:shareId',
      element: <ShareRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'report/:id',
      element: <PublicReportView />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/reportar/:companyId',
      element: <PublicReporteActos />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/animo/:companyId',
      element: <PublicMoodTracker />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/ipevar/:companyId',
      element: <PublicParticipacionIPEVAR />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/alta-direccion/:companyId',
      element: <PublicAltaDireccion />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/atel-testimonio/:companyId',
      element: <PublicAtelTestimonio />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/perfil-update/:companyId/:workerId?',
      element: <PublicPerfilUpdate />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/ruta-aprendizaje/:companyId',
      element: <PublicRutaAprendizaje />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'sgsst-public/ruta-aprendizaje/:companyId/course/:courseId',
      element: <PublicRutaCourseViewer />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      // Catch-all for UUIDs at the root (solves the 404 without prefix)
      path: ':id',
      element: <PublicReportView />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: '/',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'register',
          element: <Registration />,
        },
        {
          path: 'forgot-password',
          element: <RequestPasswordReset />,
        },
        {
          path: 'reset-password',
          element: <ResetPassword />,
        },
      ],
    },
    {
      path: 'privacy',
      element: <PrivacyPolicyPage />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'terms',
      element: <TermsOfServicePage />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'about',
      element: <WappyAboutPage />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'comunidad',
      element: (
        <AuthContextProvider>
          <ComunidadPage />
          <ApiErrorWatcher />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'comunidadmp',
      element: (
        <AuthContextProvider>
          <ComunidadPage />
          <ApiErrorWatcher />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'wappyvital',
      element: (
        <AuthContextProvider>
          <ComunidadPage />
          <ApiErrorWatcher />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'matriz',
      element: (
        <AuthContextProvider>
          <MatrizPage />
          <ApiErrorWatcher />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'planes',
      element: (
        <AuthContextProvider>
          <PlansPage />
          <ApiErrorWatcher />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'hoja-de-ruta',
      element: (
        <AuthContextProvider>
          <RoadmapPage />
          <ApiErrorWatcher />
          <RoadmapNotifier />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'contactanos',
      element: (
        <AuthContextProvider>
          <ContactPage />
          <ApiErrorWatcher />
          <RoadmapNotifier />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'embajadores',
      element: <EmbajadoresRedirect />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'portafolio',
      element: <PortafolioRedirect />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'mauricioposada',
      element: <MauricioPosadaRedirect />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'blog/:postId/:slug?',
      element: (
        <AuthContextProvider>
          <BlogPostViewer />
          <ApiErrorWatcher />
        </AuthContextProvider>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <LoginLayout />,
          children: [
            {
              path: 'login',
              element: <Login />,
            },
            {
              path: 'login/2fa',
              element: <TwoFactorScreen />,
            },
          ],
        },
        dashboardRoutes,
        {
          path: '/',
          element: <Root />,
          children: [
            {
              index: true,
              element: <RootIndexRedirect />,
            },
            {
              path: 'c/:conversationId?',
              element: <ChatRoute />,
            },
            {
              path: 'live',
              element: <LivePage />,
            },
            {
              path: 'search',
              element: <Search />,
            },
            {
              path: 'chat-sst',
              element: <ChatSSTView />,
            },
            {
              path: 'events-meet/admin',
              element: <EventsMeetAdminDashboard />,
            },

            {
              path: 'sgsst',
              element: <SGSSTDashboard />,
            },
            {
              path: 'sgsst/animo',
              element: <MoodAnalyticsDashboard />,
            },
            {
              path: 'sgsst/automatizaciones',
              element: <CentroControlSST />,
            },
            {
              /* Redirect old GTC-45 workspace URLs to the equivalent native chat */
              path: 'sgsst/agente-gtc45/:conversationId',
              element: <Navigate to="/c/new" replace={true} />,
            },
            {
              path: 'sgsst/agente-gtc45',
              element: <Navigate to="/c/new" replace={true} />,
            },

            {
              path: 'academia',
              element: <AcademiaDashboard />,
            },
            {
              path: 'training',
              element: <AcademiaDashboard />,
            },
            {
              path: 'training/admin',
              element: <TrainingAdminDashboard />,
            },
            {
              path: 'training/admin/courses/:id',
              element: <CourseEditor />,
            },
            {
              path: 'training/:courseId/:slug?',
              element: <CourseViewer />,
            },
            {
              path: 'ruta-aprendizaje',
              element: <AcademiaDashboard />,
            },
            {
              path: 'ruta-aprendizaje/admin',
              element: <RutaAprendizajeAdminDashboard />,
            },
            {
              path: 'ruta-aprendizaje/admin/courses/:id',
              element: <RutaAprendizajeCourseEditor />,
            },
            {
              path: 'ruta-aprendizaje/:courseId/:slug?',
              element: <RutaAprendizajeCourseViewer />,
            },
            {
              path: 'blog',
              element: <AcademiaDashboard />,
            },
            {
              path: 'events-meet',
              element: <AcademiaDashboard />,
            },
            {
              path: 'blog/admin',
              element: <BlogAdminDashboard />,
            },
            {
              path: 'tenshi/admin',
              element: <TenshiAdminPanel />,
            },
            {
              path: 'blog/admin/posts/:id',
              element: <BlogPostEditor />,
            },
            {
              path: 'auditoria',
              element: <AuditoriaDashboard />,
            },
            {
              path: 'kanban',
              element: <CentroControlSST />,
            },
            {
              path: 'control',
              element: <CentroControlSST />,
            },
            {
              path: 'sgsst/control',
              element: <CentroControlSST />,
            },
            {
              path: 'embajadores/dashboard',
              element: <AmbassadorDashboard />,
            },
            {
              path: 'embajadores',
              element: <AmbassadorDashboard />,
            },
            {
              path: 'agents',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'agents/:category',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
          ],
        },
      ],
    },
  ],
  { basename: baseHref },
);
