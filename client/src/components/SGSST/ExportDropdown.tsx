import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Download, Globe, FileText, FileDown, ChevronDown, Loader2 } from 'lucide-react';
import axios from 'axios';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import { cn } from '~/utils';
import { useParams } from 'react-router-dom';
import { UpgradeWall } from './UpgradeWall';

interface ExportDropdownProps {
  content: string;
  fileName: string;
  reportType?: 'checklist' | 'general';
  onExportExcel?: () => void;
  onlyExcel?: boolean;
}

/**
 * Shared Export Dropdown for SGSST modules.
 * Provides HTML, Word, and PDF export options in a single dropdown button.
 * Preserves full HTML styling (tables, colors, formatting) in all formats.
 */
const ExportDropdown: React.FC<ExportDropdownProps> = ({
  content,
  fileName,
  reportType = 'general',
  onExportExcel,
  onlyExcel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToastContext();
  const { token, user } = useAuthContext();
  const { conversationId, id: docId } = useParams();
  const isPro = user?.role === 'ADMIN' || user?.role === 'USER_PRO';
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeModalTitle, setUpgradeModalTitle] = useState('');
  const [upgradeModalDesc, setUpgradeModalDesc] = useState('');

  const handleDownloadGuard = async (downloadFn: () => void) => {
    if (!user || (user.role !== 'USER' && user.role !== 'USER_IPEVAR' && user.role !== 'IPEVAR')) {
      downloadFn();
      return;
    }

    try {
      await axios.post(
        '/api/files/register-download',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      downloadFn();
    } catch (error: any) {
      console.error('Download limit check failed:', error);
      const isVital = user.role === 'USER_IPEVAR' || user.role === 'IPEVAR';
      const msg =
        error.response?.data?.message ||
        (isVital
          ? 'Has alcanzado tu límite de 6 descargas diarias en el plan Wappy Vital. Adquiere el plan Wappy Pro para realizar descargas ilimitadas.'
          : 'Has alcanzado tu límite de 1 descarga diaria en el plan Gratis. Adquiere el plan Wappy Vital para realizar descargas ilimitadas.');
      setUpgradeModalTitle('Límite de Descargas Excedido');
      setUpgradeModalDesc(msg);
      setIsUpgradeModalOpen(true);
      setIsOpen(false);
    }
  };

  const calcPos = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleScroll = () => calcPos();
    const handleResize = () => calcPos();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  if (onlyExcel && onExportExcel) {
    return (
      <>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isPro) {
              setUpgradeModalTitle('Exportación Premium Bloqueada');
              setUpgradeModalDesc(
                'La exportación de matrices a Excel está reservada exclusivamente para cuentas PREMIUM del Plan Pro.',
              );
              setIsUpgradeModalOpen(true);
              return;
            }
            onExportExcel();
          }}
          className="group flex h-8 min-w-[32px] flex-shrink-0 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-medium bg-surface-primary px-2 text-text-primary shadow-sm outline-none transition-all duration-300 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:min-w-[40px] sm:px-2.5 sm:hover:-rotate-3 sm:hover:scale-105"
        >
          <div className="relative flex flex-shrink-0 items-center justify-center">
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="flex max-w-0 items-center overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:ml-2 group-hover:max-w-[200px] group-hover:opacity-100">
            <span className="text-sm font-bold tracking-wide">Exportar Excel</span>
          </div>
        </button>
        {isUpgradeModalOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="relative w-full max-w-sm duration-300 animate-in zoom-in-95">
              <button
                onClick={() => setIsUpgradeModalOpen(false)}
                className="absolute -top-10 right-0 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white backdrop-blur-md hover:text-gray-300 z-50"
              >
                Cerrar ✕
              </button>
              <UpgradeWall
                title={upgradeModalTitle}
                description={upgradeModalDesc}
                plan={user?.role || 'USER'}
                isPopup={true}
                hideFeatures={true}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  /**
   * Build a full HTML document with inline styles for browser/HTML export.
   */
  const buildFullHtml = (): string => {
    const isFullHtml = content.trim().toLowerCase().startsWith('<!doctype') || content.trim().toLowerCase().startsWith('<html');
    if (isFullHtml) {
      return content;
    }
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName}</title>
    <style>
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
        }
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
            body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            .report-wrapper { padding: 0 !important; max-width: 100% !important; width: 100% !important; border: none !important; box-shadow: none !important; }
            .report-container { max-width: 100% !important; width: 100% !important; box-shadow: none !important; }
            @page { margin: 1cm; size: A4 portrait; }
            .table-responsive {
                overflow: visible !important;
                width: 100% !important;
                border: none !important;
                margin: 10px 0 !important;
            }
            table {
                page-break-inside: auto !important;
                table-layout: fixed !important;
                width: 100% !important;
                min-width: 0 !important;
                font-size: 7.5pt !important;
            }
            tr { page-break-inside: avoid !important; }
            th, td {
                white-space: normal !important;
                word-break: break-word !important;
                overflow-wrap: break-word !important;
                padding: 4px 4px !important;
                font-size: 7.5pt !important;
            }
            h1, h2, h3 { page-break-after: avoid; }
        }
        html, body {
            margin: 0;
            padding: 0;
            background: #fff !important;
            color: #222;
        }
        body {
            font-family: 'Segoe UI', Arial, Roboto, sans-serif;
            line-height: 1.6;
            min-height: 100vh;
        }
        .report-wrapper {
            max-width: 950px;
            margin: 0 auto;
            padding: 40px 30px;
            background: #fff;
            box-sizing: border-box;
        }
        @media screen and (max-width: 600px) {
            .report-wrapper { padding: 15px 10px; }
        }
        h1 { color: #004d99; text-align: center; margin-bottom: 5px; font-size: 1.8em; }
        h2 { color: #004d99; border-bottom: 2px solid #004d99; padding-bottom: 5px; font-size: 1.4em; }
        h3 { color: #333; font-size: 1.2em; }
        table {
            width: 100%;
            border-collapse: collapse;
            border-spacing: 0;
            margin: 15px 0;
            font-size: 0.85em;
            table-layout: fixed;
        }
        .table-responsive {
            width: 100%;
            overflow-x: auto;
            border-radius: 8px;
            border: 1px solid #ddd;
            margin: 15px 0;
            -webkit-overflow-scrolling: touch;
        }
        th {
            background-color: #004d99;
            color: white;
            padding: 8px 6px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #003580;
            word-break: break-word;
            overflow-wrap: break-word;
        }
        .checklist-mode th:nth-child(1) { width: 38px; }
        .checklist-mode th:nth-child(2) { width: 14%; }
        .checklist-mode th:nth-child(3) { width: 44%; }
        .checklist-mode th:nth-child(4) { width: 10%; }
        .checklist-mode th:nth-child(5) { width: 15%; }
        td {
            padding: 8px 6px;
            border: 1px solid #ddd;
            vertical-align: top;
            word-break: break-word;
            overflow-wrap: break-word;
        }
        tr:nth-child(even) { background-color: #f8f9fa; }
    </style>
</head>
<body class="${reportType === 'checklist' ? 'checklist-mode' : ''}">
    <div class="report-wrapper">
        ${content.includes('table-responsive') ? content : content.replace(/<table/g, '<div class="table-responsive"><table').replace(/<\/table>/g, '</table></div>')}
    </div>
</body>
</html>`;
  };

  /**
   * Builds a Word-optimized HTML document.
   *
   * KEY STRATEGY: PRESERVE all existing inline styles from the editor (colors, widths,
   * backgrounds) and MERGE Word-specific properties on top. Editor styles always win
   * for visual appearance. Only adds missing Word/mso-* properties.
   *
   * Word requires xmlns:o/w namespaces, inline styles on every element, and mso-* CSS.
   */
  const buildWordHtml = (): string => {
    /**
     * Mapping from Tailwind utility classes to inline style definitions.
     * Ensures that Microsoft Word preserves the visual styling (colors, alignment, fonts).
     */
    const classStyleMap: Record<string, Record<string, string>> = {
      // Background colors
      'bg-teal-900': { 'background-color': '#115e59' },
      'bg-teal-800': { 'background-color': '#115e59' },
      'bg-teal-700': { 'background-color': '#0f766e' },
      'bg-teal-600': { 'background-color': '#0d9488' },
      'bg-teal-500': { 'background-color': '#14b8a6' },
      'bg-teal-100': { 'background-color': '#ccfbf1' },
      'bg-teal-50': { 'background-color': '#f0fdfa' },
      'bg-slate-900': { 'background-color': '#0f172a' },
      'bg-slate-800': { 'background-color': '#1e293b' },
      'bg-slate-100': { 'background-color': '#f1f5f9' },
      'bg-slate-50': { 'background-color': '#f8fafc' },
      'bg-emerald-700': { 'background-color': '#047857' },
      'bg-emerald-600': { 'background-color': '#059669' },
      'bg-emerald-500': { 'background-color': '#10b981' },
      'bg-emerald-100': { 'background-color': '#d1fae5' },
      'bg-emerald-50': { 'background-color': '#ecfdf5' },
      'bg-amber-700': { 'background-color': '#b45309' },
      'bg-amber-600': { 'background-color': '#d97706' },
      'bg-amber-500': { 'background-color': '#f59e0b' },
      'bg-amber-100': { 'background-color': '#fef3c7' },
      'bg-amber-50': { 'background-color': '#fffbeb' },
      'bg-red-700': { 'background-color': '#b91c1c' },
      'bg-red-600': { 'background-color': '#dc2626' },
      'bg-red-500': { 'background-color': '#ef4444' },
      'bg-red-100': { 'background-color': '#fee2e2' },
      'bg-red-50': { 'background-color': '#fef2f2' },
      'bg-gray-100': { 'background-color': '#f3f4f6' },
      'bg-gray-50': { 'background-color': '#f9fafb' },
      'bg-zinc-100': { 'background-color': '#f4f4f5' },
      'bg-zinc-50': { 'background-color': '#fafafa' },
      // Text colors
      'text-white': { color: '#ffffff' },
      'text-teal-900': { color: '#115e59' },
      'text-teal-800': { color: '#115e59' },
      'text-teal-700': { color: '#0f766e' },
      'text-teal-600': { color: '#0d9488' },
      'text-teal-505': { color: '#14b8a6' },
      'text-slate-900': { color: '#0f172a' },
      'text-slate-800': { color: '#1e293b' },
      'text-slate-700': { color: '#334155' },
      'text-slate-600': { color: '#475569' },
      'text-emerald-800': { color: '#065f46' },
      'text-emerald-700': { color: '#047857' },
      'text-emerald-600': { color: '#059669' },
      'text-amber-800': { color: '#92400e' },
      'text-amber-700': { color: '#b45309' },
      'text-amber-600': { color: '#d97706' },
      'text-red-800': { color: '#991b1b' },
      'text-red-700': { color: '#b91c1c' },
      'text-red-600': { color: '#dc2626' },
      'text-gray-900': { color: '#111827' },
      'text-gray-800': { color: '#1f2937' },
      'text-gray-700': { color: '#374151' },
      'text-gray-600': { color: '#4b5563' },
      // Typography / Formatting
      'font-bold': { 'font-weight': 'bold' },
      'font-semibold': { 'font-weight': '600' },
      'font-medium': { 'font-weight': '500' },
      'text-center': { 'text-align': 'center' },
      'text-right': { 'text-align': 'right' },
      'text-left': { 'text-align': 'left' },
      // Borders
      'border-teal-700': { 'border-color': '#0f766e' },
      'border-teal-600': { 'border-color': '#0d9488' },
      'border-teal-500': { 'border-color': '#14b8a6' },
      'border-slate-300': { 'border-color': '#cbd5e1' },
      'border-slate-200': { 'border-color': '#e2e8f0' },
      'border-gray-300': { 'border-color': '#d1d5db' },
      'border-gray-200': { 'border-color': '#e5e7eb' },
    };

    /**
     * Parse a CSS inline-style string into a key→value map.
     * Returns an object like { 'background-color': '#0f766e', color: 'white', ... }
     */
    const parseStyle = (style: string): Record<string, string> => {
      const result: Record<string, string> = {};
      style.split(';').forEach((part) => {
        const idx = part.indexOf(':');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim().toLowerCase();
        const val = part.slice(idx + 1).trim();
        if (key && val) result[key] = val;
      });
      return result;
    };

    /**
     * Serialize a style map back to a CSS string.
     */
    const serializeStyle = (map: Record<string, string>): string =>
      Object.entries(map)
        .map(([k, v]) => `${k}:${v}`)
        .join(';');

    /**
     * Merge base styles with override styles.
     * Override keys win; base provides fallbacks.
     */
    const mergeStyles = (
      base: Record<string, string>,
      override: Record<string, string>,
    ): Record<string, string> => ({ ...base, ...override });

    const parser = new DOMParser();
    const isFullHtml = content.trim().toLowerCase().startsWith('<!doctype') || content.trim().toLowerCase().startsWith('<html');
    const doc = parser.parseFromString(isFullHtml ? content : `<div>${content}</div>`, 'text/html');
    const root = isFullHtml ? (doc.body || doc.documentElement) : doc.body.firstElementChild!;

    /**
     * Recursively parses all CSS classes on elements and converts them into inline styles,
     * ensuring visual consistency when Microsoft Word opens the file.
     */
    const mapClassesToStyles = (element: Element) => {
      const classes = element.getAttribute('class')?.split(/\s+/) || [];
      let styleObj = parseStyle(element.getAttribute('style') || '');

      classes.forEach((cls) => {
        const mapped = classStyleMap[cls];
        if (mapped) {
          styleObj = { ...styleObj, ...mapped };
        }
      });

      if (Object.keys(styleObj).length > 0) {
        element.setAttribute('style', serializeStyle(styleObj));
      }

      Array.from(element.children).forEach((child) => mapClassesToStyles(child));
    };

    // Recursively convert classes to inline styles first
    mapClassesToStyles(root);

    // --- Headings: use editor color if present, fallback to our defaults ---
    root.querySelectorAll('h1').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      const merged = mergeStyles(
        {
          color: '#004d99',
          'text-align': 'center',
          'font-size': '22pt',
          'font-weight': 'bold',
          margin: '12pt 0 6pt 0',
        },
        existing,
      );
      merged['font-family'] = 'Calibri,Arial,sans-serif';
      merged['mso-style-name'] = 'Heading1';
      el.setAttribute('style', serializeStyle(merged));
    });

    root.querySelectorAll('h2').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      const merged = mergeStyles(
        {
          color: '#004d99',
          'font-size': '16pt',
          'font-weight': 'bold',
          'border-bottom': '2pt solid #004d99',
          'padding-bottom': '4pt',
          margin: '10pt 0 4pt 0',
        },
        existing,
      );
      merged['font-family'] = 'Calibri,Arial,sans-serif';
      el.setAttribute('style', serializeStyle(merged));
    });

    root.querySelectorAll('h3').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      const merged = mergeStyles(
        { color: '#333333', 'font-size': '13pt', 'font-weight': 'bold', margin: '8pt 0 4pt 0' },
        existing,
      );
      merged['font-family'] = 'Calibri,Arial,sans-serif';
      el.setAttribute('style', serializeStyle(merged));
    });

    root.querySelectorAll('p').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      const merged = mergeStyles(
        {
          'font-family': 'Calibri,Arial,sans-serif',
          'font-size': '11pt',
          margin: '4pt 0',
          'line-height': '1.5',
        },
        existing,
      );
      el.setAttribute('style', serializeStyle(merged));
    });

    // --- Tables: force Word-compatible structure, keep editor's visual styles ---
    root.querySelectorAll('table').forEach((table) => {
      const existing = parseStyle(table.getAttribute('style') || '');
      // Always force these for Word correctness
      const forced: Record<string, string> = {
        width: '100%',
        'table-layout': 'fixed',
        'mso-table-layout-alt': 'fixed',
        'border-collapse': 'collapse',
        'border-spacing': '0',
        'font-family': 'Calibri,Arial,sans-serif',
        'font-size': '8.5pt',
        margin: '8pt 0',
        'mso-border-alt': 'solid #CCCCCC .5pt',
      };
      const merged = mergeStyles(existing, forced);
      // Remove unsupported Word properties and print-breaking styles
      delete merged['border-radius'];
      delete merged['border-spacing'];
      delete merged['box-shadow'];
      delete merged['overflow'];
      delete merged['min-width'];
      table.setAttribute('style', serializeStyle(merged));
      table.setAttribute('border', '1');
      table.setAttribute('cellspacing', '0');
      table.setAttribute('cellpadding', '0');
    });

    // --- TH: PRESERVE all editor styles (color, background, width), add Word mso-* ---
    root.querySelectorAll('th').forEach((th) => {
      const existing = parseStyle(th.getAttribute('style') || '');
      // Word-required additions only (don't override editor colors)
      const wordAdditions: Record<string, string> = {
        'font-family': 'Calibri,Arial,sans-serif',
        'font-weight': 'bold',
        'font-size': '8.5pt',
        padding: '5pt 4pt',
        border: '1pt solid #CCCCCC',
        'mso-background-source': 'auto',
        'mso-pattern': 'auto',
        'vertical-align': 'middle',
        'text-align': 'left',
        'word-break': 'break-word',
      };
      // Merge: editor styles win for color/background, Word additions fill gaps
      const merged = mergeStyles(wordAdditions, existing);
      // Always ensure a font-family is set
      if (!merged['font-family']) merged['font-family'] = 'Calibri,Arial,sans-serif';

      // If background color is customized, ensure we overwrite MS automatic background behavior
      if (merged['background-color']) {
        delete merged['mso-background-source'];
        delete merged['mso-pattern'];
        merged['background'] = merged['background-color'];
      } else {
        if (!merged['mso-background-source']) merged['mso-background-source'] = 'auto';
        if (!merged['mso-pattern']) merged['mso-pattern'] = 'auto';
      }

      // Remove unsupported properties
      delete merged['border-radius'];
      delete merged['box-shadow'];
      delete merged['white-space'];
      delete merged['min-width'];
      merged['word-break'] = 'break-word';
      th.setAttribute('style', serializeStyle(merged));
    });

    // --- TD: PRESERVE all editor styles (background-color, color, width), add Word props ---
    root.querySelectorAll('td').forEach((td) => {
      const existing = parseStyle(td.getAttribute('style') || '');
      const wordAdditions: Record<string, string> = {
        'font-family': 'Calibri,Arial,sans-serif',
        'font-size': '8pt',
        padding: '4pt 4pt',
        border: '1pt solid #DDDDDD',
        'vertical-align': 'top',
        'word-break': 'break-word',
      };
      // Editor styles win (background-color, color, width, etc.)
      const merged = mergeStyles(wordAdditions, existing);

      // Overwrite MS background pattern for custom colored cells
      if (merged['background-color']) {
        delete merged['mso-background-source'];
        delete merged['mso-pattern'];
        merged['background'] = merged['background-color'];
      }

      // Remove unsupported properties
      delete merged['border-radius'];
      delete merged['box-shadow'];
      delete merged['transition'];
      delete merged['white-space'];
      delete merged['min-width'];
      merged['word-break'] = 'break-word';
      td.setAttribute('style', serializeStyle(merged));
    });

    // --- TR: preserve background-color rows from editor ---
    root.querySelectorAll('tr').forEach((tr) => {
      const existing = parseStyle(tr.getAttribute('style') || '');
      // Only remove unsupported props, keep background-color etc.
      delete existing['border-radius'];
      delete existing['box-shadow'];
      delete existing['transition'];
      if (Object.keys(existing).length > 0) {
        tr.setAttribute('style', serializeStyle(existing));
      }
    });

    // --- List items ---
    root.querySelectorAll('li').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      const merged = mergeStyles(
        { 'font-family': 'Calibri,Arial,sans-serif', 'font-size': '11pt', margin: '2pt 0' },
        existing,
      );
      el.setAttribute('style', serializeStyle(merged));
    });

    // --- Inline elements: preserve existing, just ensure font-weight/style ---
    root.querySelectorAll('strong, b').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      existing['font-weight'] = 'bold';
      el.setAttribute('style', serializeStyle(existing));
    });
    root.querySelectorAll('em, i').forEach((el) => {
      const existing = parseStyle(el.getAttribute('style') || '');
      existing['font-style'] = 'italic';
      el.setAttribute('style', serializeStyle(existing));
    });

    // --- DIVs used as section headers (colored divs from editor) ---
    root.querySelectorAll('div').forEach((div) => {
      const existing = parseStyle(div.getAttribute('style') || '');
      // Remove CSS properties Word can't handle
      delete existing['border-radius'];
      delete existing['box-shadow'];
      delete existing['overflow'];
      delete existing['transition'];
      delete existing['-webkit-overflow-scrolling'];
      // Add font-family if not present
      if (!existing['font-family']) {
        existing['font-family'] = 'Calibri,Arial,sans-serif';
      }
      if (Object.keys(existing).length > 0) {
        div.setAttribute('style', serializeStyle(existing));
      }
    });

    // --- IMGs: Word ignores max-width/max-height, must use explicit width/height attributes ---
    root.querySelectorAll('img').forEach((img) => {
      const existing = parseStyle(img.getAttribute('style') || '');

      // Parse max-height and max-width hints to determine intended display size
      const maxHeightStr = existing['max-height'] || '';
      const maxWidthStr = existing['max-width'] || '';
      const hasMaxHeight = maxHeightStr && maxHeightStr !== 'none';
      const maxHeightPx = hasMaxHeight ? parseInt(maxHeightStr, 10) : null;

      // Detect signature images: they use max-height ≤ 100px to stay compact
      const isSignature = maxHeightPx !== null && maxHeightPx <= 100;

      // Remove all CSS Word cannot handle
      delete existing['max-width'];
      delete existing['max-height'];
      delete existing['object-fit'];
      delete existing['border-radius'];
      delete existing['transition'];

      if (isSignature) {
        // Signatures: fixed small size matching editor appearance (~150x75pt)
        existing['width'] = '150pt';
        existing['height'] = '75pt';
        existing['display'] = 'block';
        img.setAttribute('width', '150');
        img.setAttribute('height', '75');
      } else if (maxWidthStr && maxWidthStr !== '100%' && maxWidthStr !== 'none') {
        // Evidence/content images with an explicit max-width cap (e.g. 300px)
        const capPx = parseInt(maxWidthStr, 10);
        if (!isNaN(capPx)) {
          const capPt = Math.round(capPx * 0.75); // px → pt conversion
          existing['width'] = `${capPt}pt`;
          existing['height'] = 'auto';
          img.setAttribute('width', String(capPx));
        }
      } else {
        // Generic images: cap at page width (460pt ≈ content area at 2.5cm margins)
        existing['max-width'] = '460pt';
        existing['width'] = existing['width'] || '100%';
      }

      img.setAttribute('style', serializeStyle(existing));
    });

    // Fix th variable reference (el was used instead of th in loop)
    const styledContent = root.innerHTML;

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <meta name="ProgId" content="Word.Document">
    <meta name="Generator" content="Microsoft Word 15">
    <meta name="Originator" content="Microsoft Word 15">
    <title>${fileName}</title>
    <!--[if gte mso 9]>
    <xml>
        <o:OfficeDocumentSettings>
            <o:AllowPNG/>
            <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
    </xml>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page WordSection1 {
            size: 21cm 29.7cm;
            margin: 2cm 2.5cm 2cm 2.5cm;
            mso-header-margin: 1cm;
            mso-footer-margin: 1cm;
            mso-paper-source: 0;
        }
        body {
            font-family: Calibri, Arial, sans-serif;
            font-size: 11pt;
            color: #222222;
            line-height: 1.5;
            background: #ffffff;
        }
        div.WordSection1 { page: WordSection1; }
        /* Fallback table styles for Word */
        table { border-collapse: collapse !important; width: 100% !important; }
    </style>
</head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222222;background:#ffffff;">
    <div style="max-width:100%;padding:0;margin:0;" class="WordSection1">
        ${styledContent}
    </div>
</body>
</html>`;
  };

  const checkHtmlPreviewLimit = (): boolean => {
    if (isPro) return true;
    const key = `wappy_html_export_count_${conversationId || docId || 'global'}`;
    const count = parseInt(localStorage.getItem(key) || '0', 10);
    if (count >= 3) {
      return false;
    }
    localStorage.setItem(key, String(count + 1));
    return true;
  };

  /**
   * Export as HTML — saves to backend and opens a shareable URL.
   */
  const handleExportHtml = async () => {
    if (!checkHtmlPreviewLimit()) {
      setUpgradeModalTitle('Límite de Previsualización');
      setUpgradeModalDesc(
        'Has abierto la vista web de este documento 3 veces en este chat (límite del Plan Gratuito). Pásate a Pro para tener accesos ilimitados.',
      );
      setIsUpgradeModalOpen(true);
      setIsOpen(false);
      return;
    }
    setIsSharing(true);
    try {
      const fullHtml = buildFullHtml();
      const response = await axios.post(
        '/api/public-report',
        {
          content: fullHtml,
          fileName,
          reportType,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const { id } = response.data;
      const publicUrl = `${window.location.origin}/report/${id}`;

      window.open(publicUrl, '_blank');
      setIsOpen(false);
    } catch (error) {
      console.error('Error sharing report:', error);
      // Fallback to blob if backend fails
      const fullHtml = buildFullHtml();
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast({
        status: 'error',
        message: 'No se pudo generar el link compartido, se abrió una vista temporal.',
      });
    } finally {
      setIsSharing(false);
    }
  };

  /**
   * Download as HTML file.
   */
  const handleDownloadHtml = () => {
    const fullHtml = buildFullHtml();
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  /**
   * Export as Word (.doc) — uses Word XML HTML format with fully inlined styles.
   * Word requires xmlns:o and xmlns:w namespaces, inline styles on every element,
   * and mso-* CSS properties for correct rendering of tables, colors, and layout.
   */
  const handleExportWord = () => {
    const wordHtml = buildWordHtml();

    // Use proper MHTML with correct boundaries for Word
    const boundary = '----=_NextPart_000_0000_01D00000.00000000';
    const mhtml = [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      'Content-Location: file:///document.htm',
      '',
      wordHtml,
      '',
      `--${boundary}--`,
    ].join('\r\n');

    const blob = new Blob([mhtml], {
      type: 'application/msword',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  /**
   * Export as PDF — opens a styled print window and triggers print dialog.
   * Waits for fonts/images to load before printing to ensure fidelity.
   */
  const handleExportPdf = () => {
    const fullHtml = buildFullHtml();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(fullHtml);
      printWindow.document.close();

      const triggerPrint = () => {
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
          } catch (e) {
            console.warn('Print failed:', e);
          }
        }, 600);
      };

      // Try to wait for full document readiness
      if (printWindow.document.readyState === 'complete') {
        triggerPrint();
      } else {
        printWindow.onload = triggerPrint;
        // Safety fallback
        setTimeout(triggerPrint, 2000);
      }
    }
    setIsOpen(false);
  };

  const exportOptions = [
    {
      label: 'Abrir en Navegador (HTML)',
      icon: Globe,
      handler: handleExportHtml,
      description: 'Vista completa con estilos',
      disabled: !content,
    },
    {
      label: 'Descargar HTML (.html)',
      icon: FileDown,
      handler: handleDownloadHtml,
      description: 'Archivo HTML independiente',
      disabled: !content,
    },
    {
      label: 'Descargar Word (.doc)',
      icon: FileText,
      handler: handleExportWord,
      description: 'Editable con tablas y formato',
      disabled: !content,
    },
    {
      label: 'Descargar PDF',
      icon: FileDown,
      handler: handleExportPdf,
      description: 'Imprimir / guardar como PDF',
      disabled: !content,
    },
  ];

  if (onExportExcel) {
    exportOptions.unshift({
      label: 'Exportar Matriz a Excel (.xlsx)',
      icon: FileText,
      handler: () => {
        onExportExcel();
        setIsOpen(false);
      },
      description: 'Datos crudos de la tabla en Excel',
      disabled: false,
      premium: true,
    });
  }

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999999 }}
      className="w-64 overflow-hidden rounded-xl border border-border-medium bg-surface-primary shadow-xl duration-200 animate-in fade-in slide-in-from-top-2"
    >
      <div className="p-1">
        {exportOptions.map((option) => {
          const Icon = option.icon;
          const isOptionBlocked = !isPro && option.premium;
          return (
            <button
              key={option.label}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isOptionBlocked) {
                  setUpgradeModalTitle('Exportación Premium Bloqueada');
                  setUpgradeModalDesc(
                    `La exportación en este formato (${option.label.split('(')[0].trim()}) está reservada exclusivamente para cuentas PREMIUM del Plan Pro.`,
                  );
                  setIsUpgradeModalOpen(true);
                  setIsOpen(false);
                  return;
                }
                const isDownload =
                  option.label.toLowerCase().includes('descargar') ||
                  option.label.toLowerCase().includes('exportar');
                if (isDownload) {
                  handleDownloadGuard(option.handler);
                } else {
                  option.handler();
                }
              }}
              disabled={option.disabled}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                option.disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-hover',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-100 p-1.5 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary">{option.label}</div>
                  <div className="text-xs text-text-secondary">{option.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          calcPos();
          setIsOpen((o) => !o);
        }}
        className="group flex h-8 min-w-[32px] flex-shrink-0 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border-medium bg-surface-primary px-2 text-text-primary shadow-sm outline-none transition-all duration-300 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:min-w-[40px] sm:px-2.5 sm:hover:-rotate-3 sm:hover:scale-105"
      >
        <div className="relative flex flex-shrink-0 items-center justify-center">
          <Download className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="flex max-w-0 items-center overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:ml-2 group-hover:max-w-[200px] group-hover:opacity-100">
          <span className="mr-1 text-sm font-bold tracking-wide">Exportar</span>
          <ChevronDown
            className={`h-4 w-4 text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {ReactDOM.createPortal(dropdown, document.body)}

      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm duration-300 animate-in zoom-in-95">
            <button
              onClick={() => setIsUpgradeModalOpen(false)}
              className="absolute -top-10 right-0 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white backdrop-blur-md hover:text-gray-300 z-50"
            >
              Cerrar ✕
            </button>
            <UpgradeWall
              title={upgradeModalTitle}
              description={upgradeModalDesc}
              plan={user?.role || 'USER'}
              isPopup={true}
              hideFeatures={true}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ExportDropdown;
