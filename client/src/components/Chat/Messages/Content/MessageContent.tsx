import { memo, Suspense, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { DelayedRender } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageContentProps, TDisplayProps } from '~/common';
import Error from '~/components/Messages/Content/Error';
import { useMessageContext } from '~/Providers/MessageContext';
import MarkdownLite from './MarkdownLite';
import EditMessage from './EditMessage';
import Thinking from './Parts/Thinking';
import useLocalize from '~/hooks/useLocalize';
import Container from './Container';
import Markdown from './Markdown';
import { cn } from '~/utils';
import store from '~/store/settings';
import { ArrowUpRight } from 'lucide-react';

const ERROR_CONNECTION_TEXT = 'Error connecting to server, try refreshing the page.';
const DELAYED_ERROR_TIMEOUT = 5500;
const UNFINISHED_DELAY = 250;

const parseThinkingContent = (text: string) => {
  const thinkingMatch = text.match(/:::thinking([\s\S]*?):::/);
  return {
    thinkingContent: thinkingMatch ? thinkingMatch[1].trim() : '',
    regularContent: thinkingMatch ? text.replace(/:::thinking[\s\S]*?:::/, '').trim() : text,
  };
};

const LoadingFallback = () => (
  <div className="text-message mb-[0.625rem] flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
    <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
      <div className="absolute">
        <p className="submitting relative">
          <span className="result-thinking" />
        </p>
      </div>
    </div>
  </div>
);

const ErrorBox = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    role="alert"
    aria-live="assertive"
    className={cn(
      'rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-gray-600 dark:text-gray-200',
      className,
    )}
  >
    {children}
  </div>
);

const ConnectionError = ({ message }: { message?: TMessage }) => {
  const localize = useLocalize();

  return (
    <Suspense fallback={<LoadingFallback />}>
      <DelayedRender delay={DELAYED_ERROR_TIMEOUT}>
        <Container message={message}>
          <div className="mt-2 rounded-xl border border-red-500/20 bg-red-50/50 px-4 py-3 text-sm text-red-700 shadow-sm transition-all dark:bg-red-950/30 dark:text-red-100">
            {localize('com_ui_error_connection')}
          </div>
        </Container>
      </DelayedRender>
    </Suspense>
  );
};

export const ErrorMessage = ({
  text,
  message,
  className = '',
}: Pick<TDisplayProps, 'text' | 'className'> & { message?: TMessage }) => {
  if (text === ERROR_CONNECTION_TEXT) {
    return <ConnectionError message={message} />;
  }

  return (
    <Container message={message}>
      <ErrorBox className={className}>
        <Error text={text} />
      </ErrorBox>
    </Container>
  );
};

const extractAllSuggestions = (text: string): { cleanText: string; suggestions: string[] } => {
  if (!text) return { cleanText: '', suggestions: [] };

  const suggestionsSet = new Set<string>();

  // 1. Extract suggestions from any wappy-card or card JSON block
  const wappyCardRegex = /```(?:wappy-card|card)\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = wappyCardRegex.exec(text)) !== null) {
    const blockContent = match[1].trim();
    try {
      const suggestionsRegex = /"(?:suggestions|buttons)"\s*:\s*\[([\s\S]*?)\]/;
      const sugMatch = blockContent.match(suggestionsRegex);
      if (sugMatch) {
        const arrayStr = `[${sugMatch[1]}]`;
        const cleanedArrayStr = arrayStr
          .replace(/,(\s*[}\]])/g, '$1') // remove trailing commas
          .replace(/\/\/.+$/gm, '') // remove comments
          .trim();
        try {
          const parsed = JSON.parse(cleanedArrayStr);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (typeof item === 'string') {
                suggestionsSet.add(item.trim());
              } else if (item && typeof item === 'object') {
                const val = item.label || item.text;
                if (typeof val === 'string') {
                  suggestionsSet.add(val.trim());
                }
              }
            });
          }
        } catch (e) {
          // Fallback parsing via regex if it's partially streamed
          const strRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
          let strMatch;
          while ((strMatch = strRegex.exec(cleanedArrayStr)) !== null) {
            const val = strMatch[1];
            if (val && !['label', 'text', 'suggestions', 'buttons'].includes(val)) {
              suggestionsSet.add(val.trim());
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Extract plain text suggestions from the end of the message (supporting tailing footers)
  const textWithoutCards = text.replace(/```(?:wappy-card|card)[\s\S]*?```/g, '').trim();
  const lines = textWithoutCards.split('\n');
  const textSuggestions: string[] = [];
  const suggestionIndices = new Set<number>();
  let hasStarted = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const numberedMatch = line.match(/^(?:\d+\.|\*|-)\s*(.+)$/);
    const isQuestion = line.startsWith('¿') && line.endsWith('?');

    if (numberedMatch) {
      let suggestionText = numberedMatch[1].trim();
      suggestionText = suggestionText.replace(/\*\*/g, ''); // Remove bold markdown
      textSuggestions.unshift(suggestionText);
      suggestionIndices.add(i);
      hasStarted = true;
    } else if (isQuestion) {
      textSuggestions.unshift(line);
      suggestionIndices.add(i);
      hasStarted = true;
    } else {
      if (hasStarted) {
        break;
      }
      // Allow skipping up to 3 trailing non-matching lines (like polite footer sentences)
      if (lines.length - 1 - i >= 3) {
        break;
      }
    }
  }

  textSuggestions.forEach((s) => suggestionsSet.add(s));

  let cleanText = text;
  if (suggestionIndices.size > 0) {
    const lastPart = lines.filter((_, idx) => suggestionIndices.has(idx)).join('\n');
    const lastPartEscaped = lastPart.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(lastPartEscaped.split('\\n').join('\\s*\\n\\s*'), 'g');
    cleanText = text.replace(regex, '').trim();
    cleanText = cleanText.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  }

  return {
    cleanText,
    suggestions: Array.from(suggestionsSet),
  };
};

const DisplayMessage = ({ text, isCreatedByUser, message, showCursor }: TDisplayProps) => {
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);

  const showCursorState = useMemo(
    () => showCursor === true && isSubmitting,
    [showCursor, isSubmitting],
  );

  const isRawHtml = useMemo(() => {
    if (!text || typeof text !== 'string') {
      return false;
    }
    const trimmed = text.trim();
    // Only treat as raw HTML if the content actually starts with HTML tags
    const startsWithTag = trimmed.startsWith('<div') || trimmed.startsWith('<style') || trimmed.startsWith('<section');
    return (
      startsWithTag && (
        trimmed.includes('class="report-container"') ||
        trimmed.includes('id="wappy-kpi"') ||
        trimmed.includes('data-riesgo=') ||
        trimmed.includes('Informe') ||
        trimmed.includes('INFORME')
      )
    );
  }, [text]);

  const { cleanText, suggestions } = useMemo(() => {
    if (isCreatedByUser || isRawHtml || !text) {
      return { cleanText: text, suggestions: [] as string[] };
    }
    return extractAllSuggestions(text);
  }, [text, isCreatedByUser, isRawHtml]);

  const content = useMemo(() => {
    if (isRawHtml) {
      return (
        <div className="w-full flex flex-col gap-2 my-2">
          <div 
            className="w-full max-w-none max-h-[750px] overflow-y-auto overflow-x-auto rounded-2xl border border-teal-500/20 bg-slate-950/30 p-2 sm:p-4 shadow-2xl"
            dangerouslySetInnerHTML={{ __html: cleanText }}
          />
        </div>
      );
    }
    if (!isCreatedByUser) {
      return <Markdown content={cleanText} isLatestMessage={isLatestMessage} />;
    }
    if (enableUserMsgMarkdown) {
      return <MarkdownLite content={cleanText} />;
    }
    return <>{cleanText}</>;
  }, [isCreatedByUser, enableUserMsgMarkdown, cleanText, isLatestMessage, isRawHtml]);

  const handleSuggestionClick = (suggestion: string) => {
    const textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textarea, suggestion);
      } else {
        textarea.value = suggestion;
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        const submitButton =
          (document.querySelector('form button[type="submit"]') as HTMLButtonElement) ||
          (document.getElementById('send-button') as HTMLButtonElement);
        if (submitButton) {
          submitButton.click();
        } else {
          const form = textarea.closest('form');
          if (form) {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
      }, 50);
    }
  };

  return (
    <Container message={message}>
      <div
        className={cn(
          isRawHtml ? '' : 'markdown prose message-content dark:prose-invert light w-full break-words',
          isSubmitting && 'submitting',
          showCursorState && text.length > 0 && 'result-streaming',
          isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
          isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
        )}
      >
        {content}
        {suggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-4 dark:border-white/10">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200',
                  'border-indigo-100 bg-indigo-50 text-indigo-700 shadow-sm hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50',
                  'cursor-pointer hover:-translate-y-0.5 active:translate-y-0',
                )}
              >
                <span>{suggestion}</span>
                <ArrowUpRight className="h-3.5 w-3.5 opacity-80" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
};

export const UnfinishedMessage = ({ message }: { message: TMessage }) => (
  <ErrorMessage
    message={message}
    text="The response is incomplete; it's either still processing, was cancelled, or censored. Refresh or try a different prompt."
  />
);

const MessageContent = ({
  text,
  edit,
  error,
  unfinished,
  isSubmitting,
  isLast,
  ...props
}: TMessageContentProps) => {
  const { message } = props;
  const { messageId } = message;

  const { thinkingContent, regularContent } = useMemo(() => parseThinkingContent(text), [text]);
  const showRegularCursor = useMemo(() => isLast && isSubmitting, [isLast, isSubmitting]);

  const unfinishedMessage = useMemo(
    () =>
      !isSubmitting && unfinished ? (
        <Suspense>
          <DelayedRender delay={UNFINISHED_DELAY}>
            <UnfinishedMessage message={message} />
          </DelayedRender>
        </Suspense>
      ) : null,
    [isSubmitting, unfinished, message],
  );

  if (error) {
    return <ErrorMessage message={message} text={text} />;
  }

  if (edit) {
    return <EditMessage text={text} isSubmitting={isSubmitting} {...props} />;
  }

  return (
    <>
      {thinkingContent.length > 0 && (
        <Thinking key={`thinking-${messageId}`}>{thinkingContent}</Thinking>
      )}
      <DisplayMessage
        key={`display-${messageId}`}
        showCursor={showRegularCursor}
        text={regularContent}
        {...props}
      />
      {unfinishedMessage}
    </>
  );
};

export default memo(MessageContent);
