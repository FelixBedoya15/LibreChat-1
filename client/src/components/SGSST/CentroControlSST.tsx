import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { 
  Trello, 
  Clock, 
  LayoutDashboard,
  Cpu,
  Layers,
  Users
} from 'lucide-react';
import KanbanDashboard from '~/components/Kanban/KanbanDashboard';
import Automatizaciones from '~/components/SGSST/Automatizaciones';
import SubUserManagerModal from '~/components/SGSST/SubUserManagerModal';
import { useAuthContext } from '~/hooks';

export type CentroControlTab = 'acpm' | 'automatizaciones' | 'historial';

export default function CentroControlSST() {
  const { user } = useAuthContext();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSubUsersModal, setShowSubUsersModal] = useState(false);

  // Determine initial tab from URL or query param
  const getInitialTab = (): CentroControlTab => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'automatizaciones' || tabParam === 'ia' || tabParam === 'agentes') {
      return 'automatizaciones';
    }
    if (tabParam === 'historial' || tabParam === 'logs') {
      return 'historial';
    }
    if (tabParam === 'acpm' || tabParam === 'kanban') {
      return 'acpm';
    }
    if (location.pathname.includes('/automatizaciones')) {
      return 'automatizaciones';
    }
    return 'acpm';
  };

  const [activeTab, setActiveTab] = useState<CentroControlTab>(getInitialTab);

  // Sync state if URL changes
  useEffect(() => {
    const currentTab = getInitialTab();
    setActiveTab(currentTab);
  }, [location.pathname, searchParams]);

  const handleTabChange = (tab: CentroControlTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="flex-1 flex flex-col bg-surface-secondary/30 min-h-screen h-auto overflow-y-auto pb-12">
      {/* Master Top Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-border-medium/40 px-6 pt-6 pb-4 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 border border-teal-200/50 dark:border-teal-800/40 uppercase tracking-wider">
                <Layers className="w-3 h-3" />
                Módulo Operacional SG-SST
              </span>
            </div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2.5 bg-clip-text text-transparent bg-gradient-to-r from-teal-600 via-emerald-600 to-purple-600 dark:from-teal-400 dark:via-emerald-400 dark:to-purple-400">
              <LayoutDashboard className="w-7 h-7 text-teal-500" />
              Centro de Control SST
            </h1>
            <p className="text-xs text-text-secondary mt-1">
              Gestión unificada de acciones correctivas (ACPM), control predictivo de vencimientos y vigilancia autónoma con agentes de IA.
            </p>
          </div>

          {/* Master Tabs Selector */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800/80 p-1.5 rounded-2xl border border-border-medium/30 shrink-0 w-full md:w-auto">
            <button
              onClick={() => handleTabChange('acpm')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                activeTab === 'acpm'
                  ? 'bg-white dark:bg-gray-900 text-teal-600 dark:text-teal-400 shadow-sm border border-border-medium/40'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/40 dark:hover:bg-gray-700/40'
              }`}
            >
              <Trello className="w-4 h-4 text-teal-500" />
              <span>Acciones ACPM</span>
            </button>

            <button
              onClick={() => handleTabChange('automatizaciones')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                activeTab === 'automatizaciones'
                  ? 'bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm border border-border-medium/40'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/40 dark:hover:bg-gray-700/40'
              }`}
            >
              <Cpu className="w-4 h-4 text-purple-500" />
              <span>Automatizaciones IA</span>
            </button>

            <button
              onClick={() => handleTabChange('historial')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                activeTab === 'historial'
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-border-medium/40'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/40 dark:hover:bg-gray-700/40'
              }`}
            >
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>Historial & Reportes</span>
            </button>

            {!user?.isSubUser && (
              <button
                onClick={() => setShowSubUsersModal(true)}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 border border-teal-200 dark:border-teal-800"
              >
                <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Sub-Usuarios</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col">
        {activeTab === 'acpm' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-200">
            <KanbanDashboard inline={false} hideMainHeader={true} />
          </div>
        )}

        {activeTab === 'automatizaciones' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-200">
            <Automatizaciones hideMainHeader={true} defaultTab="list" />
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-200">
            <Automatizaciones hideMainHeader={true} defaultTab="logs" />
          </div>
        )}
      </div>

      {/* Sub-users Modal */}
      <SubUserManagerModal
        isOpen={showSubUsersModal}
        onClose={() => setShowSubUsersModal(false)}
      />
    </div>
  );
}
