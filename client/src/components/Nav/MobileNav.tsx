import React from 'react';
import { useSetRecoilState } from 'recoil';
import type { Dispatch, SetStateAction } from 'react';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function MobileNav({
  setNavVisible,
}: {
  setNavVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const localize = useLocalize();
  const setIsCollapsed = useSetRecoilState(store.sidePanelCollapsed);
  const setFullCollapse = useSetRecoilState(store.sidePanelFullCollapse);

  const toggleRightPanel = () => {
    setIsCollapsed((prev) => !prev);
    setFullCollapse((prev) => !prev);
  };

  return (
    <div
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 6px)',
      }}
      className="bg-surface-primary text-text-primary sticky top-0 z-10 flex min-h-[44px] items-center justify-between px-2 border-b border-border-medium/30 transition-colors md:hidden"
    >
      <button
        type="button"
        data-testid="mobile-header-open-history-button"
        aria-label={localize('com_nav_open_sidebar')}
        className="m-1 inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-hover text-text-primary transition-colors"
        onClick={() =>
          setNavVisible((prev) => {
            localStorage.setItem('navVisible', JSON.stringify(!prev));
            return !prev;
          })
        }
      >
        <span className="sr-only">{localize('com_nav_open_sidebar')}</span>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="icon-md"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3 8C3 7.44772 3.44772 7 4 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H4C3.44772 9 3 8.55228 3 8ZM3 16C3 15.4477 3.44772 15 4 15H14C14.5523 15 15 15.4477 15 16C15 16.5523 14.5523 17 14 17H4C3.44772 17 3 16.5523 3 16Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        data-testid="mobile-header-open-tools-button"
        aria-label="Open tool sidebar"
        className="m-1 inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-hover text-text-primary transition-colors"
        onClick={toggleRightPanel}
      >
        <span className="sr-only">Open tool sidebar</span>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="icon-md"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3 8C3 7.44772 3.44772 7 4 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H4C3.44772 9 3 8.55228 3 8ZM3 16C3 15.4477 3.44772 15 4 15H14C14.5523 15 15 15.4477 15 16C15 16.5523 14.5523 17 14 17H4C3.44772 17 3 16.5523 3 16Z"
            fill="currentColor"
            style={{ transform: 'scaleX(-1)', transformOrigin: 'center' }}
          />
        </svg>
      </button>
    </div>
  );
}
