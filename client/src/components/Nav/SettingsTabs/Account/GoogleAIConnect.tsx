import React, { useState } from 'react';
import { Button } from '@librechat/client';
import { CheckCircle2, Settings, Sparkles } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useGetEndpointsQuery } from '~/data-provider';
import { useUserKey, useAuthContext } from '~/hooks';
import { getEndpointField } from '~/utils/endpoints';

export default function GoogleAIConnect() {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { getExpiry } = useUserKey(EModelEndpoint.google);
  const { user } = useAuthContext();

  const expiryTime = getExpiry();
  const hasKey = !!expiryTime;

  return (
    <>
      <div className="flex flex-col gap-3 py-2 text-sm text-text-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-blue-500/20 flex-shrink-0 flex items-center justify-center w-10 h-10 shadow-sm">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-bold flex items-center gap-2 text-text-primary">
                Activar Inteligencia Artificial Google
              </h4>
              <p className="text-xs text-text-secondary mt-1 max-w-[400px]">
                Configura tus claves API o cuenta de servicio de Google Gemini para activar los modelos de Inteligencia Artificial de Google en tu cuenta.
              </p>
              {user?.isSubUser && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Sub-usuario: Vincula tu clave personal de Google Gemini para chatear con IA sin costo para la empresa.</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center">
            <Button 
              variant="outline" 
              onClick={() => setKeyDialogOpen(true)} 
              className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 transition-colors font-semibold flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Establecer clave API
            </Button>
          </div>
        </div>

        {hasKey && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl mt-2 border border-blue-500/20 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none transition-all duration-700 group-hover:bg-blue-500/10" />
            
            <CheckCircle2 className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-blue-600 dark:text-blue-400">Inteligencia Artificial Google Configurada</span>
              <span className="text-xs text-text-secondary">Tus claves de API para Google Gemini están vinculadas y activas.</span>
            </div>
          </div>
        )}
      </div>

      {keyDialogOpen && (
        <SetKeyDialog
          open={keyDialogOpen}
          onOpenChange={setKeyDialogOpen}
          endpoint={EModelEndpoint.google}
          endpointType={getEndpointField(endpointsConfig, EModelEndpoint.google, 'type')}
          userProvideURL={getEndpointField(endpointsConfig, EModelEndpoint.google, 'userProvideURL')}
        />
      )}
    </>
  );
}
