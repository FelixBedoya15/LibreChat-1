import React, { memo, useMemo, useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions, dataService } from 'librechat-data-provider';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useFileDownload } from '~/data-provider/Files/queries';
import { useCodeBlockContext } from '~/Providers/CodeBlockContext';
import { handleDoubleClick } from '~/utils';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store/user';
import { WappyCard } from './WappyCard';

type TCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const match = /language-([a-zA-Z0-9_-]+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isSingleLine = typeof children === 'string' && children.split('\n').length === 1;

  const codeString = typeof children === 'string'
    ? children
    : Array.isArray(children)
      ? children.join('')
      : children?.toString() || '';

  const isWappyCard = (lang === 'wappy-card' || lang === 'card') && codeString.trim().startsWith('{');

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isSingleLine || isWappyCard)).current;

  useEffect(() => {
    resetCounter();
  }, [children, resetCounter]);

  if (isMath) {
    return <>{children}</>;
  } else if (isWappyCard) {
    return <WappyCard content={codeString} />;
  } else if (isSingleLine) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return (
      <CodeBlock
        lang={lang ?? 'text'}
        codeChildren={children}
        blockIndex={blockIndex}
        allowExecution={canRunCode}
      />
    );
  }
});

export const codeNoExecution: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const match = /language-([a-zA-Z0-9_-]+)/.exec(className ?? '');
  const lang = match && match[1];

  const codeString = typeof children === 'string'
    ? children
    : Array.isArray(children)
      ? children.join('')
      : children?.toString() || '';

  const isWappyCard = (lang === 'wappy-card' || lang === 'card') && codeString.trim().startsWith('{');

  if (lang === 'math') {
    return children;
  } else if (isWappyCard) {
    return <WappyCard content={codeString} />;
  } else if (typeof children === 'string' && children.split('\n').length === 1) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} allowExecution={false} />;
  }
});

type TAnchorProps = {
  href: string;
  children: React.ReactNode;
};

export const a: React.ElementType = memo(({ href, children }: TAnchorProps) => {
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const {
    file_id = '',
    filename = '',
    filepath,
  } = useMemo(() => {
    const pattern = new RegExp(`(?:files|outputs)/${user?.id}/([^\\s]+)`);
    const match = href.match(pattern);
    if (match && match[0]) {
      const path = match[0];
      const parts = path.split('/');
      const name = parts.pop();
      const file_id = parts.pop();
      return { file_id, filename: name, filepath: path };
    }
    return { file_id: '', filename: '', filepath: '' };
  }, [user?.id, href]);

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file_id);
  const props: { target?: string; onClick?: React.MouseEventHandler } = { target: '_new' };

  if (!file_id || !filename) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const stream = await downloadFile();
      if (stream.data == null || stream.data === '') {
        console.error('Error downloading file: No data found');
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
        return;
      }
      const link = document.createElement('a');
      link.href = stream.data;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(stream.data);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  props.onClick = handleDownload;
  props.target = '_blank';

  const domainServerBaseUrl = dataService.getDomainServerBaseUrl();

  return (
    <a
      href={
        filepath?.startsWith('files/')
          ? `${domainServerBaseUrl}/${filepath}`
          : `${domainServerBaseUrl}/files/${filepath}`
      }
      {...props}
    >
      {children}
    </a>
  );
});

type TParagraphProps = {
  children: React.ReactNode;
};

export const p: React.ElementType = memo(({ children }: TParagraphProps) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

export const table: React.ElementType = memo(({ children, ...props }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      if (maxScrollLeft > 2 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const canScrollRight = e.deltaY > 0 && el.scrollLeft < maxScrollLeft - 1;
        const canScrollLeft = e.deltaY < 0 && el.scrollLeft > 1;
        if (canScrollRight || canScrollLeft) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="table-responsive custom-table-scroll my-3 w-full max-w-full overflow-x-auto rounded-xl border border-border-medium bg-surface-primary"
    >
      <table {...props} className="w-full min-w-full border-collapse text-xs">
        {children}
      </table>
    </div>
  );
});

