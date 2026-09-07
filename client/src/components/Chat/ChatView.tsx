import React, { memo, useCallback, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState, useRecoilState } from 'recoil';
import { ephemeralAgentByConvoId } from '~/store/agents';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, useFileMapContext, ChatFormProvider } from '~/Providers';
import { useChatHelpers, useAddedResponse, useSSE, useAuthContext } from '~/hooks';
import ConversationStarters from './Input/ConversationStarters';
import { useGetMessagesByConvoId, useGetAgentByIdQuery } from '~/data-provider';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';
import MatrizIPEVARTable from '../SGSST/MatrizIPEVARTable';
import MatrizPESVTable from '../SGSST/MatrizPESVTable';
import MatrizCompatibilidadTable from '../SGSST/MatrizCompatibilidadTable';
import LiveEditorPanel from '../SGSST/LiveEditorPanel';
import CanvasPanel from '../Canvas/CanvasPanel';
const isMobileScreen = () => window.innerWidth <= 768;

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { token } = useAuthContext();
  const { conversationId: urlConversationId } = useParams();
  // Use URL param as alias so legacy code still works
  const conversationId = urlConversationId;
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const addedSubmission = useRecoilValue(store.submissionByIndex(index + 1));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading, isFetched } = useGetMessagesByConvoId(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const dataTree = buildTree({ messages: data, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [fileMap],
    ),
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse({ rootIndex: index });

  useSSE(rootSubmission, chatHelpers, false);
  useSSE(addedSubmission, addedChatHelpers, true);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const conversation = useRecoilValue(store.conversationByIndex(index));

  const { data: agent } = useGetAgentByIdQuery(conversation?.agent_id as string | undefined, {
    enabled: !!conversation?.agent_id && conversation?.endpoint === 'agents',
  });

  // ── Shared ephemeral agent state (used for IPEVAR and Editor Live) ───────
  // AgentSessionPanel stores per-session tool toggles in ephemeralAgentByConvoId.
  // Reading this atom is the single source of truth for whether any tool panel is open.
  const ephemeralKey = conversationId ?? 'new';
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(ephemeralKey));

  // ── IPEVAR: open only when user explicitly toggles it ON ─────────────────
  // Auto-activation for matriz_ipevar is excluded in useAgentSessionOverrides
  // so the panel starts closed regardless of agent configuration.
  const isIPEVARActive = React.useMemo(() => {
    const tools: string[] = (ephemeralAgent as any)?.tools ?? [];
    return tools.includes('matriz_ipevar');
  }, [ephemeralAgent]);

  // ── PESV: open only when user explicitly toggles it ON ───────────────────
  const isPESVActive = React.useMemo(() => {
    const tools: string[] = (ephemeralAgent as any)?.tools ?? [];
    return tools.includes('matriz_pesv');
  }, [ephemeralAgent]);

  // ── CHEMICAL COMPATIBILITY: open only when agent tools includes it ────────
  const isChemicalCompatibilityActive = React.useMemo(() => {
    const tools: string[] = (ephemeralAgent as any)?.tools ?? [];
    return tools.includes('matriz_compatibilidad');
  }, [ephemeralAgent]);

  // ── EDITOR LIVE: open only when user explicitly toggles it ON ────────────
  const isEditorLiveActive = React.useMemo(() => {
    const tools: string[] = (ephemeralAgent as any)?.tools ?? [];
    return tools.includes('editor_live') || tools.includes('editor_rit');
  }, [ephemeralAgent]);

  const isEditorRITActive = React.useMemo(() => {
    const tools: string[] = (ephemeralAgent as any)?.tools ?? [];
    return tools.includes('editor_rit');
  }, [ephemeralAgent]);

  // ── CANVAS: open when user toggles it ON or when triggered by directives/reports ──
  const [recoilCanvasActive, setRecoilCanvasActive] = useRecoilState(store.isCanvasActive);
  const isAgentCanvasTool = React.useMemo(() => {
    const tools: string[] = (ephemeralAgent as any)?.tools ?? [];
    return tools.includes('canvas') || tools.includes('consultar_analitica_psicosocial') || tools.includes('consultar_analitica_actos_condiciones');
  }, [ephemeralAgent]);

  const isCanvasActive = recoilCanvasActive || isAgentCanvasTool;

  // ── Effective conversationId: Recoil atom → fallback to URL param ─────────
  // conversation?.conversationId from Recoil is the most reactive source.
  // URL param is used as fallback if Recoil hasn’t received the ID yet.
  const effectiveConvoId = React.useMemo(() => {
    if (conversation?.conversationId && conversation.conversationId !== 'new') {
      return conversation.conversationId;
    }
    if (urlConversationId && urlConversationId !== 'new' && urlConversationId !== 'NEW_CONVO') {
      return urlConversationId;
    }
    return null;
  }, [conversation?.conversationId, urlConversationId]);


  // ── Sync active state to global Recoil atom (used by Header) ──────────────
  const setIsIPEVARActive = useSetRecoilState(store.isIPEVARActive);
  const setIsPESVActive = useSetRecoilState(store.isPESVActive);
  const setIsChemicalCompatibilityActive = useSetRecoilState(store.isChemicalCompatibilityActive);
  const setIsEditorLiveActive = useSetRecoilState(store.isEditorLiveActive);

  useEffect(() => {
    setIsIPEVARActive(isIPEVARActive);
    setIsPESVActive(isPESVActive);
    setIsChemicalCompatibilityActive(isChemicalCompatibilityActive);
    setIsEditorLiveActive(isEditorLiveActive);
    if (isAgentCanvasTool && !recoilCanvasActive) {
      setRecoilCanvasActive(true);
    }
  }, [isIPEVARActive, isPESVActive, isChemicalCompatibilityActive, isEditorLiveActive, isAgentCanvasTool, recoilCanvasActive, setIsIPEVARActive, setIsPESVActive, setIsChemicalCompatibilityActive, setIsEditorLiveActive, setRecoilCanvasActive]);

  useEffect(() => {
    return () => {
      setIsIPEVARActive(false);
      setIsPESVActive(false);
      setIsChemicalCompatibilityActive(false);
      setIsEditorLiveActive(false);
      setRecoilCanvasActive(false);
    };
  }, [conversationId, setIsIPEVARActive, setIsPESVActive, setIsChemicalCompatibilityActive, setIsEditorLiveActive, setRecoilCanvasActive]);



  // ── Mobile/Maximize: track whether panels are expanded via global state ──
  const [mobileExpanded] = useRecoilState(store.ipevarMaximized);
  const [pesvMobileExpanded] = useRecoilState(store.pesvMaximized);
  const [chemicalMobileExpanded] = useRecoilState(store.chemicalCompatibilityMaximized);
  const [canvasMaximized] = useRecoilState(store.canvasMaximized);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId || isFetched);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null && !isFetched;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="flex h-full w-full flex-col">
              {!isLoading && <Header />}
              <>
                <div className="flex h-full w-full overflow-hidden">
                  <div
                    className={cn(
                      'flex flex-col flex-1',
                      isLandingPage
                        ? 'items-center justify-end sm:justify-center'
                        : 'h-full overflow-y-auto',
                    )}
                  >
                    {content}
                    <div
                      className={cn(
                        'w-full',
                        isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                      )}
                    >
                      <ChatForm index={index} />
                      {isLandingPage ? <ConversationStarters /> : <Footer />}
                    </div>
                  </div>
                  {isIPEVARActive && (
                    <div className={cn(
                      'h-full flex-shrink-0 border-l border-border-medium shadow-l bg-surface-primary gt45-matrix-panel',
                      isMobileScreen()
                        ? mobileExpanded
                          ? 'fixed inset-0 z-[9990] w-full'
                          : 'hidden'
                        : 'w-1/2',
                    )}>
                      <MatrizIPEVARTable conversationId={conversation?.conversationId ?? null} />
                    </div>
                  )}
                  {isPESVActive && (
                    <div className={cn(
                      'h-full flex-shrink-0 border-l border-border-medium shadow-l bg-surface-primary gt45-matrix-panel',
                      isMobileScreen()
                        ? pesvMobileExpanded
                          ? 'fixed inset-0 z-[9990] w-full'
                          : 'hidden'
                        : 'w-1/2',
                    )}>
                      <MatrizPESVTable conversationId={conversation?.conversationId ?? null} />
                    </div>
                  )}
                  {isChemicalCompatibilityActive && (
                    <div className={cn(
                      'h-full flex-shrink-0 border-l border-border-medium shadow-l bg-surface-primary gt45-matrix-panel',
                      isMobileScreen()
                        ? chemicalMobileExpanded
                          ? 'fixed inset-0 z-[9990] w-full'
                          : 'hidden'
                        : 'w-1/2',
                    )}>
                      <MatrizCompatibilidadTable conversationId={conversation?.conversationId ?? null} />
                    </div>
                  )}
                  {isEditorLiveActive && !isIPEVARActive && (
                    <div className={cn(
                      'h-full flex-shrink-0 border-l border-border-medium shadow-l bg-surface-primary',
                      isMobileScreen()
                        ? mobileExpanded
                          ? 'fixed inset-0 z-[9990] w-full'
                          : 'hidden'
                        : 'w-1/2',
                    )}>
                      <LiveEditorPanel 
                        conversationId={conversation?.conversationId ?? null}
                        title={isEditorRITActive ? 'Editor RIT' : 'Editor Live'}
                        emptyStateTitle={isEditorRITActive ? 'Editor RIT en espera' : 'Sin documento activo'}
                        emptyStateMessage={isEditorRITActive ? (
                          <>Pídele al agente que proceda a <span className="font-bold text-blue-600">cargar la plantilla del RIT</span> para comenzar a editarlo.</>
                        ) : undefined}
                      />
                    </div>
                  )}
                  {isCanvasActive && !isIPEVARActive && !isEditorLiveActive && (
                    <div className={cn(
                      'h-full flex-shrink-0 border-l border-border-medium shadow-l bg-surface-primary',
                      isMobileScreen()
                        ? (mobileExpanded || canvasMaximized)
                          ? 'fixed inset-0 z-[9990] w-full'
                          : 'hidden'
                        : 'w-1/2',
                        // On desktop: always w-1/2; the inner panel div uses
                        // `fixed inset-0 z-[999999]` CSS for full-screen maximize.
                        // Using w-full here was collapsing the chat panel to 0 width.
                    )}>
                      <CanvasPanel key={effectiveConvoId ?? 'new'} conversationId={effectiveConvoId} />
                    </div>
                  )}
                </div>
                {isLandingPage && <Footer />}
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
