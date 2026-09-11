import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { TextareaAutosize } from '@librechat/client';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint, QueryKeys, PermissionTypes } from 'librechat-data-provider';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useLocalize,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useFocusChatEffect,
  useSelectAgent,
} from '~/hooks';
import useRolePermissions from '~/hooks/Roles/useRolePermissions';
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import AgentSessionPanel from './AgentSessionPanel';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import { VoiceModeButton, VoiceModal } from '~/components/Voice';
import store from '~/store';

const ChatForm = memo(({ index = 0 }: { index?: number }) => {
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  useFocusChatEffect(textAreaRef);
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );
  const [showVoiceModal, setShowVoiceModal] = useRecoilState(store.showVoiceModal);
  const { hasPermission } = useRolePermissions();

  const { requiresKey } = useRequiresKey();
  const { onSelect: onSelectAgent } = useSelectAgent();
  const methods = useChatFormContext();
  const {
    files,
    setFiles,
    conversation,
    setConversation,
    isSubmitting,
    filesLoading,
    newConversation,
    handleStopGenerating,
  } = useChatContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );
  const { conversationId: urlConversationId } = useParams();
  const conversationId = useMemo(
    () => {
      // FASE 4 FIX: Prioritize URL param to avoid "infinite new chats" bug
      if (urlConversationId && urlConversationId !== 'new') {
        return urlConversationId;
      }
      return conversation?.conversationId ?? Constants.NEW_CONVO;
    },
    [conversation?.conversationId, urlConversationId],
  );

  const isRTL = useMemo(
    () => (chatDirection != null ? chatDirection?.toLowerCase() === 'rtl' : false),
    [chatDirection],
  );
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, endpoint, assistantMap],
  );
  const modelToUse = useMemo(() => {
    if (isAgentsEndpoint(endpoint)) {
      return conversation?.agent_id;
    }
    if (isAssistantsEndpoint(endpoint)) {
      return conversation?.assistant_id;
    }
    return conversation?.model;
  }, [endpoint, conversation?.agent_id, conversation?.assistant_id, conversation?.model]);

  const disableInputs = useMemo(
    () => requiresKey || invalidAssistant,
    [requiresKey, invalidAssistant],
  );

  const handleContainerClick = useCallback(() => {
    /** Check if the device is a touchscreen */
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      return;
    }
    textAreaRef.current?.focus();
  }, []);

  const handleFocusOrClick = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed]);

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    isSubmitting: isSubmitting || isSubmittingAdded,
  });

  const { submitMessage, submitPrompt } = useSubmitMessage();

  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
    setShowPlusPopover,
    setShowMentionPopover,
  });
  const {
    isNotAppendable,
    handlePaste,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextarea({
    textAreaRef,
    submitButtonRef,
    setIsScrollable,
    disabled: disableInputs,
  });

  useQueryParams({ textAreaRef });

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        methods.setValue('text', e.target.value, { shouldValidate: true }),
      [methods],
    ),
  });

  const textValue = useWatch({ control: methods.control, name: 'text' });

  useEffect(() => {
    if (textAreaRef.current) {
      const style = window.getComputedStyle(textAreaRef.current);
      const lineHeight = parseFloat(style.lineHeight);
      setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
    }
  }, [textValue]);

  useEffect(() => {
    if (isEditingBadges && backupBadges.length === 0) {
      setBackupBadges([...badges]);
    }
  }, [isEditingBadges, badges, backupBadges.length]);

  const handleSaveBadges = useCallback(() => {
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [setIsEditingBadges, setBackupBadges]);

  const handleCancelBadges = useCallback(() => {
    if (backupBadges.length > 0) {
      setBadges([...backupBadges]);
    }
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [backupBadges, setBadges, setIsEditingBadges]);

  // Listener para auto-envío de consultas delegadas por Tenshi
  useEffect(() => {
    const handleTenshiSubmit = async (e: any) => {
      const { agentId, prompt } = e.detail || {};
      console.log('[ChatForm] tenshi-submit-agent-prompt recibido:', { agentId, prompt });

      if (!prompt) return;

      const lastSub = (window as any).__lastSubmittedPrompt;
      const lastTime = (window as any).__lastSubmittedPromptTime || 0;
      if (lastSub === prompt && Date.now() - lastTime < 4000) {
        console.log('[ChatForm] Consulta ya enviada recientemente, omitiendo duplicado');
        return;
      }

      // 1. Si se especificó un agente y es diferente al actual, seleccionarlo formalmente
      if (agentId && conversation?.agent_id !== agentId) {
        try {
          await onSelectAgent(agentId);
        } catch (err) {
          console.error('[ChatForm] Error al seleccionar agente delegado por Tenshi:', err);
        }
      }

      // 2. Colocar el texto en react-hook-form y en el textarea para feedback visual inmediato
      methods.setValue('text', prompt, { shouldValidate: true });
      if (textAreaRef.current) {
        textAreaRef.current.value = prompt;
        textAreaRef.current.focus();
      }

      // 3. Enviar el mensaje
      setTimeout(() => {
        const curLast = (window as any).__lastSubmittedPrompt;
        const curTime = (window as any).__lastSubmittedPromptTime || 0;
        if (curLast === prompt && Date.now() - curTime < 4000) {
          return;
        }
        (window as any).__lastSubmittedPrompt = prompt;
        (window as any).__lastSubmittedPromptTime = Date.now();
        console.log('[ChatForm] Ejecutando submitMessage para Tenshi:', prompt);
        methods.setValue('text', prompt, { shouldValidate: true });
        submitMessage({ text: prompt });
      }, 500);
    };

    window.addEventListener('tenshi-submit-agent-prompt', handleTenshiSubmit);
    return () => {
      window.removeEventListener('tenshi-submit-agent-prompt', handleTenshiSubmit);
    };
  }, [methods, submitMessage, textAreaRef, onSelectAgent, conversation?.agent_id]);

  // Respaldo al montar ChatForm si se cargó la URL con submit=true
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlPrompt = params.get('prompt') || params.get('q');
      const urlSubmit = params.get('submit') === 'true';

      if (urlSubmit && urlPrompt) {
        const lastSub = (window as any).__lastSubmittedPrompt;
        const lastTime = (window as any).__lastSubmittedPromptTime || 0;
        if (lastSub === urlPrompt && Date.now() - lastTime < 4000) {
          return;
        }

        methods.setValue('text', urlPrompt, { shouldValidate: true });
        if (textAreaRef.current) {
          textAreaRef.current.value = urlPrompt;
        }

        const timer = setTimeout(() => {
          const curLast = (window as any).__lastSubmittedPrompt;
          const curTime = (window as any).__lastSubmittedPromptTime || 0;
          if (curLast === urlPrompt && Date.now() - curTime < 4000) {
            return;
          }
          (window as any).__lastSubmittedPrompt = urlPrompt;
          (window as any).__lastSubmittedPromptTime = Date.now();
          console.log('[ChatForm] Auto-submit ejecutado desde URL mount:', urlPrompt);
          methods.setValue('text', urlPrompt, { shouldValidate: true });
          submitMessage({ text: urlPrompt });
        }, 600);

        return () => clearTimeout(timer);
      }
    } catch (e) {
      console.warn('[ChatForm] Error verificando query params en mount:', e);
    }
  }, [methods, submitMessage, textAreaRef]);

  const isMoreThanThreeRows = visualRowCount > 3;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/50 bg-transparent dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  return (
    <form
      onSubmit={methods.handleSubmit(submitMessage)}
      className={cn(
        'mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:px-2',
        maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
        centerFormOnLanding &&
          (conversationId == null || conversationId === Constants.NEW_CONVO) &&
          !isSubmitting &&
          conversation?.messages?.length === 0
          ? 'transition-all duration-200 sm:mb-28'
          : 'sm:mb-10',
      )}
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
          {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
            <Mention
              conversation={conversation}
              setShowMentionPopover={setShowPlusPopover}
              newConversation={generateConversation}
              textAreaRef={textAreaRef}
              commandChar="+"
              placeholder="com_ui_add_model_preset"
              includeAssistants={false}
            />
          )}
          {showMentionPopover && (
            <Mention
              conversation={conversation}
              setShowMentionPopover={setShowMentionPopover}
              newConversation={newConversation}
              textAreaRef={textAreaRef}
            />
          )}
          <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />
          <div
            onClick={handleContainerClick}
            className={cn(
              'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
              isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
              isTemporary
                ? 'border-violet-800/60 bg-violet-950/10'
                : 'border-border-light bg-chat-input',
            )}
          >
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
            <EditBadges
              isEditingChatBadges={isEditingBadges}
              handleCancelBadges={handleCancelBadges}
              handleSaveBadges={handleSaveBadges}
              setBadges={setBadges}
            />
            <FileFormChat conversation={conversation} />
            {endpoint && (
              <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                <TextareaAutosize
                  {...registerProps}
                  ref={(e) => {
                    ref(e);
                    (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                  }}
                  disabled={disableInputs || isNotAppendable}
                  data-ms-editor="false"
                  data-gramm="false"
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  id={mainTextareaId}
                  tabIndex={0}
                  data-testid="text-input"
                  rows={1}
                  onFocus={() => {
                    handleFocusOrClick();
                    setIsTextAreaFocused(true);
                  }}
                  onBlur={setIsTextAreaFocused.bind(null, false)}
                  aria-label={localize('com_ui_message_input')}
                  onClick={handleFocusOrClick}
                  style={{ height: 44, overflowY: 'auto' }}
                  className={cn(
                    baseClasses,
                    removeFocusRings,
                    'transition-[max-height] duration-200 disabled:cursor-not-allowed',
                  )}
                />
                <div className="flex flex-col items-start justify-start pt-1.5">
                  <CollapseChat
                    isCollapsed={isCollapsed}
                    isScrollable={isMoreThanThreeRows}
                    setIsCollapsed={setIsCollapsed}
                  />
                </div>
              </div>
            )}
            <div
              className={cn(
                'items-between flex gap-2 pb-2',
                isRTL ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                {hasPermission(PermissionTypes.ATTACHMENTS) && (
                  <AttachFileChat conversation={conversation} disableInputs={disableInputs} />
                )}
              </div>
              {isAgentsEndpoint(endpoint) && conversation?.agent_id && (
                <AgentSessionPanel
                  agentId={conversation.agent_id}
                  conversationId={conversationId}
                />
              )}
              <BadgeRow
                showEphemeralBadges={!isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)}
                isSubmitting={isSubmitting || isSubmittingAdded}
                conversationId={conversationId}
                onChange={setBadges}
                isInChat={
                  Array.isArray(conversation?.messages) && conversation.messages.length >= 1
                }
              />
              <div className="mx-auto flex" />
              {SpeechToText && (
                <AudioRecorder
                  methods={methods}
                  ask={submitMessage}
                  textAreaRef={textAreaRef}
                  disabled={disableInputs || isNotAppendable}
                  isSubmitting={isSubmitting}
                />
              )}
              {/* Live Button */}
              {hasPermission(PermissionTypes.LIVE_CHAT) && (
                <VoiceModeButton
                  onClick={() => {
                    console.log('[ChatForm] Opening Live with conversationId:', conversationId);
                    try {
                      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                      if (AudioContextClass) {
                        if (!(window as any).sharedAudioContext24k) {
                          (window as any).sharedAudioContext24k = new AudioContextClass({ sampleRate: 24000 });
                        }
                        if ((window as any).sharedAudioContext24k.state === 'suspended') {
                          (window as any).sharedAudioContext24k.resume().catch(console.error);
                        }
                        if (!(window as any).sharedAudioContext16k) {
                          (window as any).sharedAudioContext16k = new AudioContextClass({ sampleRate: 16000 });
                        }
                        if ((window as any).sharedAudioContext16k.state === 'suspended') {
                          (window as any).sharedAudioContext16k.resume().catch(console.error);
                        }
                      }
                    } catch (err) {
                      console.error('[ChatForm] Error initializing global audio contexts:', err);
                    }
                    setShowVoiceModal(true);
                  }}
                  disabled={disableInputs || isNotAppendable}
                  isActive={showVoiceModal}
                />
              )}
              <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                  <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                ) : (
                  endpoint && (
                    <SendButton
                      ref={submitButtonRef}
                      control={methods.control}
                      disabled={filesLoading || isSubmitting || disableInputs || isNotAppendable}
                    />
                  )
                )}
              </div>
            </div>
            {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
          </div>
        </div>
      </div>
      {/* Voice Modal */}
      <VoiceModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        conversationId={conversationId} // Use current conversation
        model={modelToUse ?? undefined}
        endpoint={endpoint ?? undefined}
        agentId={conversation?.agent_id}
        onConversationIdUpdate={(newId) => {
          // Only navigate if we were in a NEW chat (not an existing one)
          const wasNewChat = conversationId === Constants.NEW_CONVO;
          console.log('[ChatForm] Voice created/updated conversation:', newId, 'wasNewChat:', wasNewChat);

          if (wasNewChat) {
            // Update local conversation state IMMEDIATELY so that if user submits, it uses the new ID
            if (setConversation) {
              setConversation((prev) => {
                if (!prev) {
                  return prev;
                }
                return {
                  ...prev,
                  conversationId: newId,
                };
              });
            }

            // Navigate to the new conversation
            navigate(`/c/${newId}`, { replace: true, state: { focusChat: true } });
          }

          // Always invalidate queries to refresh UI
          queryClient.invalidateQueries([QueryKeys.messages, newId]);
          queryClient.invalidateQueries([QueryKeys.allConversations]);
        }}
        onConversationUpdated={(updatedId) => {
          // Use the directly received conversation ID (from WS message) if available, falling back to local state
          const idToInvalidate = updatedId || conversationId;
          if (idToInvalidate && idToInvalidate !== Constants.NEW_CONVO) {
            console.log('[ChatForm] Invalidate queries for messages live update:', idToInvalidate);
            queryClient.invalidateQueries([QueryKeys.messages, idToInvalidate]);
            queryClient.invalidateQueries([QueryKeys.allConversations]);
          }
        }}
      />
    </form>
  );
});

export default ChatForm;
