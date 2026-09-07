import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from '~/utils';

/**
 * SingleSelect — Dropdown that uses position:fixed via ReactDOM.createPortal
 * so it always escapes overflow:hidden/auto ancestor containers.
 * Automatically detects whether to open upward or downward based on available viewport space.
 */
const SingleSelect = ({
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
    allowCustomInput = false,
    compact = false,
    className = ''
}: {
    options: (string | { label: string; value: string; isHeader?: boolean })[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
    allowCustomInput?: boolean;
    compact?: boolean;
    className?: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const DROPDOWN_MAX_H = 256; // max-h-64 in px
    const MARGIN = 6;

    const currentOptionObj = options.find(o => typeof o === 'string' ? o === value : (!o.isHeader && o.value === value));
    const displayValue = currentOptionObj ? (typeof currentOptionObj === 'string' ? currentOptionObj : currentOptionObj.label) : (allowCustomInput ? value : '');

    const calcStyle = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
        const spaceAbove = rect.top - MARGIN;

        // Open upward if not enough space below AND there's room above
        const openUpward = spaceBelow < Math.min(DROPDOWN_MAX_H, 150) && spaceAbove > spaceBelow;

        setDropdownStyle({
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            zIndex: 99999,
            ...(openUpward
                ? { bottom: window.innerHeight - rect.top + MARGIN }
                : { top: rect.bottom + MARGIN }),
        });
    };

    const handleToggle = () => {
        calcStyle();
        setIsOpen(o => !o);
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) {
                setIsOpen(false);
            }
        };
        const handleScroll = () => calcStyle();
        const handleResize = () => calcStyle();

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
        };
    }, [isOpen]);

    const dropdown = isOpen ? (
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="max-h-64 overflow-y-auto bg-surface-primary border border-border-medium rounded-xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
            <div className="p-1">
                {options.map((option, idx) => {
                    if (typeof option !== 'string' && option.isHeader) {
                        return (
                            <div
                                key={idx}
                                className="px-3 py-1.5 mt-1.5 first:mt-0 mb-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300 bg-teal-500/10 rounded-lg select-none flex items-center gap-1.5 border border-teal-500/20"
                            >
                                <span>{option.label}</span>
                            </div>
                        );
                    }
                    const optLabel = typeof option === 'string' ? option : option.label;
                    const optVal = typeof option === 'string' ? option : option.value;
                    return (
                        <button
                            key={idx}
                            type="button"
                            className={cn(
                                "w-full text-left outline-none flex items-center justify-between text-text-primary",
                                compact ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-[11px]",
                                "hover:bg-surface-secondary focus:bg-surface-secondary",
                                "border-t border-border-light first:border-t-0 uppercase",
                                value === optVal && "bg-surface-secondary/50 font-bold"
                            )}
                            onClick={() => {
                                onChange(optVal);
                                setIsOpen(false);
                            }}
                        >
                            <span className="truncate pr-4">{optLabel}</span>
                            {value === optVal && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    ) : null;

    return (
        <>
            <div
                ref={triggerRef}
                onClick={disabled ? undefined : (allowCustomInput ? () => setIsOpen(true) : handleToggle)}
                className={cn(
                    "w-full bg-surface-primary focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all flex items-center justify-between",
                    compact ? "px-1.5 py-0.5 text-xs rounded border-0 hover:bg-surface-hover/50" : "rounded-xl border border-border-medium px-3 py-2 text-sm shadow-sm",
                    disabled ? "opacity-50 cursor-not-allowed bg-surface-secondary text-text-tertiary" : "text-text-primary cursor-pointer",
                    !compact && !disabled && "hover:border-teal-400",
                    className
                )}
            >
                {allowCustomInput ? (
                    <input 
                        type="text"
                        value={displayValue}
                        onChange={(e) => {
                            onChange(e.target.value);
                            if (!isOpen) {
                                calcStyle();
                                setIsOpen(true);
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={() => {
                            calcStyle();
                            setIsOpen(true);
                        }}
                        className="w-full bg-transparent outline-none truncate font-medium text-text-primary placeholder:text-text-tertiary"
                        placeholder={placeholder || 'Escribir o buscar...'}
                        readOnly={!!disabled}
                    />
                ) : (
                    <span className={cn(
                        !displayValue && 'text-text-tertiary',
                        'truncate text-left',
                        compact && 'max-w-[100px] md:max-w-none'
                    )}>
                        {displayValue || placeholder || (compact ? '' : 'Seleccionar...')}
                    </span>
                )}
                <div onClick={(e) => { if (allowCustomInput) { e.stopPropagation(); handleToggle(); } }} className="shrink-0 pl-2 flex items-center justify-center cursor-pointer">
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-text-tertiary transition-transform duration-200',
                            isOpen && 'rotate-180',
                        )}
                    />
                </div>
            </div>

            {ReactDOM.createPortal(dropdown, document.body)}
        </>
    );
};

export default SingleSelect;
