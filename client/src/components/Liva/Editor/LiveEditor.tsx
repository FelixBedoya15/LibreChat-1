import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Save,
  Image as ImageIcon,
  PenTool,
  Trash2,
  Maximize,
  Minimize,
  Move,
  Layers,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  Minus,
  Table as TableIcon,
  Layout,
  ChevronRight,
  ChevronDown,
  Palette,
  History,
  AArrowUp,
  AArrowDown,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import SignaturePad from '~/components/SGSST/SignaturePad';

interface LiveEditorProps {
  initialContent: string;
  onUpdate: (content: string) => void;
  onSave?: () => void;
  reportType?: 'checklist' | 'general';
  /** Determines if the editor forces a classic "white paper" look regardless of dark mode */
  paperMode?: boolean;
  /** Optional source data for AI context (passed to backend for AI inline editing) */
  reportSourceData?: any;
  onHistory?: () => void;
  /** When true, hides the native fullscreen button from the toolbar (use when the parent panel provides its own maximize control) */
  hideFullscreen?: boolean;
  /** When true, the toolbar is hidden unless the editor is in its own native fullscreen mode */
  hideToolbarWhenCollapsed?: boolean;
}

export interface LiveEditorHandle {
  setHTML: (html: string) => void;
  insertHTML: (html: string) => void;
  getHTML: () => string;
}

/**
 * Garantiza que cualquier tabla HTML quede envuelta dentro de un contenedor .table-responsive
 * con scroll horizontal interno, evitando que desborde los recuadros internos o la hoja de papel.
 */
function wrapTablesInResponsiveContainer(html: string): string {
  if (!html || typeof html !== 'string' || !html.includes('<table')) return html;
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tables = doc.querySelectorAll('table');
    let changed = false;

    tables.forEach((table) => {
      const parent = table.parentElement;
      const isAlreadyWrapped =
        parent &&
        (parent.classList.contains('table-responsive') ||
          parent.classList.contains('table-container') ||
          parent.classList.contains('table-wrapper'));

      if (!isAlreadyWrapped) {
        changed = true;
        const wrapper = doc.createElement('div');
        wrapper.className = 'table-responsive';
        wrapper.setAttribute(
          'style',
          'width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 14px 0; border-radius: 10px; border: 1px solid #e2e8f0; box-sizing: border-box;',
        );

        table.style.margin = '0';
        table.style.border = 'none';
        table.style.borderRadius = '0';
        table.style.width = '100%';

        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });

    if (changed) {
      return doc.body.innerHTML;
    }
  } catch (err) {
    console.error('[LiveEditor] wrapTablesInResponsiveContainer error:', err);
  }
  return html;
}

const LiveEditor = forwardRef<LiveEditorHandle, LiveEditorProps>(
  (
    {
      initialContent,
      onUpdate,
      onSave,
      onHistory,
      reportType = 'general',
      reportSourceData,
      paperMode = true,
      hideFullscreen = false,
      hideToolbarWhenCollapsed = false,
    },
    ref,
  ) => {
    const localize = useLocalize();
    const { token } = useAuthContext();
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);
    const [content, setContent] = useState(initialContent);
    const [namedSignatures, setNamedSignatures] = useState<Record<string, string>>({});
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
    const [isDrawingPadOpen, setIsDrawingPadOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
    const [imageToolbarPos, setImageToolbarPos] = useState({ top: 0, left: 0 });
    const [selectedTableCell, setSelectedTableCell] = useState<HTMLTableCellElement | null>(null);
    const [tableToolbarPos, setTableToolbarPos] = useState({ top: 0, left: 0 });
    const [selectedGraphic, setSelectedGraphic] = useState<HTMLDivElement | null>(null);
    const [graphicToolbarPos, setGraphicToolbarPos] = useState({ top: 0, left: 0 });
    const [selectedDiagramNode, setSelectedDiagramNode] = useState<HTMLElement | null>(null);
    const [diagramNodeToolbarPos, setDiagramNodeToolbarPos] = useState({ top: 0, left: 0 });

    const [activeSignaturePlaceholder, setActiveSignaturePlaceholder] =
      useState<HTMLElement | null>(null);
    const [activeSignatureName, setActiveSignatureName] = useState<string>('');

    // ── AI Inline Edit ──────────────────────────────────────────────────────
    const [aiEditBubble, setAiEditBubble] = useState<{ x: number; y: number } | null>(null);
    const [aiEditInstruction, setAiEditInstruction] = useState('');
    const [aiEditSelectedText, setAiEditSelectedText] = useState('');
    const [isAiEditing, setIsAiEditing] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [fontSize, setFontSize] = useState(3); // 1-7, default 3 = normal

    const [localToast, setLocalToast] = useState<{
      message: string;
      status: string;
      severity: string;
    } | null>(null);

    React.useEffect(() => {
      const handleToast = (e: any) => {
        if (!e.detail?.message) return;
        setLocalToast({
          message: e.detail.message,
          status: e.detail.status,
          severity: e.detail.severity,
        });
        setTimeout(() => setLocalToast(null), 3500);
      };
      window.addEventListener('add-toast', handleToast);
      return () => window.removeEventListener('add-toast', handleToast);
    }, []);

    const editorWrapperRef = useRef<HTMLDivElement>(null);

    // Dispatch global events so ancestor containers can remove overflow containment
    useEffect(() => {
      if (isFullScreen) {
        window.dispatchEvent(new CustomEvent('live-editor-fullscreen-enter'));
      } else {
        window.dispatchEvent(new CustomEvent('live-editor-fullscreen-exit'));
      }
      return () => {
        if (isFullScreen) {
          window.dispatchEvent(new CustomEvent('live-editor-fullscreen-exit'));
        }
      };
    }, [isFullScreen]);

    const [showAiInput, setShowAiInput] = useState(false);
    const [bubbleDebug, setBubbleDebug] = useState<any>({}); // CRITICAL FIX: debug state
    const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const aiInputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      const updatePortal = () => {
        setPortalNode(
          (document.fullscreenElement as HTMLElement) ||
            document.getElementById('root') ||
            document.body,
        );
      };
      updatePortal();
      document.addEventListener('fullscreenchange', updatePortal);
      return () => document.removeEventListener('fullscreenchange', updatePortal);
    }, []);

    useEffect(() => {
      const namedSigsStr = localStorage.getItem('wappy_signatures');
      let initialNamed: Record<string, string> = {};
      if (namedSigsStr) {
        try {
          initialNamed = JSON.parse(namedSigsStr);
        } catch (e) {}
      } else {
        const oldSigsStr = localStorage.getItem('sgsst_signatures');
        if (oldSigsStr) {
          try {
            const parsed = JSON.parse(oldSigsStr);
            if (parsed && typeof parsed === 'object') {
              Object.keys(parsed).forEach((k) => {
                if (parsed[k]?.url) initialNamed[k] = parsed[k].url;
              });
            }
          } catch (e) {}
        }
      }
      setNamedSignatures(initialNamed);
      // Also fetch from backend for mobile/cross-device syncing
      if (token) {
        fetch('/api/sgsst/signatures', {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.signatures && Object.keys(data.signatures).length > 0) {
              setNamedSignatures((prev) => {
                const merged = { ...prev, ...data.signatures };
                localStorage.setItem('wappy_signatures', JSON.stringify(merged));
                return merged;
              });
            }
          })
          .catch((err) => console.error('Error fetching signatures for sync:', err));
      }
    }, [token]);

    // ────────────────────────────────────────────────────────────────────────
    // EVENT LISTENERS FOR SELECTION AND CLICKS
    // ────────────────────────────────────────────────────────────────────────
    useEffect(() => {
      const handleMouseUp = (e: MouseEvent) => {
        // Ignore if clicking inside the AI bubble itself
        const target = e.target as HTMLElement;
        if (target.closest('[data-ai-bubble]')) return;

        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || !sel.toString().trim()) {
            if (!showAiInput) setAiEditBubble(null);
            setBubbleDebug({ status: 'collapsed_or_empty' }); // debug
            return;
          }

          const selectedText = sel.toString().trim();
          const range = sel.getRangeAt(0);

          try {
            // Robust check to ensure selection is inside or around the editor
            const editorNode = editorRef.current;
            const commonAncestor = range.commonAncestorContainer;

            const inEditor =
              editorNode?.contains(sel.anchorNode) ||
              editorNode?.contains(sel.focusNode) ||
              editorNode?.contains(commonAncestor) ||
              (commonAncestor && commonAncestor.contains && commonAncestor.contains(editorNode));

            if (!inEditor) {
              if (!showAiInput) setAiEditBubble(null);
              setBubbleDebug({ status: 'not_in_editor', focusNode: sel.focusNode?.nodeName }); // debug
              return;
            }

            // Save the selection range so we can edit it later
            savedRangeRef.current = range.cloneRange();
            setAiEditSelectedText(selectedText);

            // CRITICAL FIX: The wrapper context is clipping the bubble using CSS overflow when deep inside reports.
            // We will use React Portal to render the bubble outside the DOM hierarchy.
            // So we must calculate coordinates relative to the VIEWPORT, not the wrapper.
            const rect = range.getBoundingClientRect();

            let fixedX = rect.left + rect.width / 2;
            let fixedY = rect.bottom + 12; // place just below selection

            // Constrain to viewport safely
            fixedX = Math.max(80, Math.min(fixedX, window.innerWidth - 80));
            fixedY = Math.max(20, Math.min(fixedY, window.innerHeight - 80));

            setBubbleDebug({
              status: 'success',
              fixedX: Math.round(fixedX),
              fixedY: Math.round(fixedY),
              textLen: selectedText.length,
            });

            setAiEditBubble({
              x: fixedX,
              y: fixedY,
            });

            setShowAiInput(false); // reset to initial bubble state
            setAiEditInstruction('');
          } catch (err: any) {
            setBubbleDebug({ status: 'error', msg: err?.message });
            console.error('[LiveEditor] Selection error:', err);
          }
        }, 50); // slight debounce
      };

      const el = editorRef.current;
      el?.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        el?.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [showAiInput]);

    // Focus AI textarea when shown
    useEffect(() => {
      if (showAiInput) setTimeout(() => aiInputRef.current?.focus(), 50);
    }, [showAiInput]);

    const handleAiEdit = async () => {
      if (!aiEditInstruction.trim() || !savedRangeRef.current || !aiEditSelectedText) return;
      setIsAiEditing(true);
      try {
        // Send the full report text for richer AI context (no char limit)
        const fullReportText = editorRef.current?.innerText || '';
        const res = await fetch('/api/live/ai-edit-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            selectedText: aiEditSelectedText,
            instruction: aiEditInstruction,
            fullReportText,
            reportSourceData: reportSourceData ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al editar');

        // Restore the saved selection and replace it
        const sel = window.getSelection();
        if (sel && savedRangeRef.current) {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
          document.execCommand('insertText', false, data.editedText);
        }

        // Cleanup
        setAiEditBubble(null);
        setShowAiInput(false);
        setAiEditInstruction('');
        savedRangeRef.current = null;
        onUpdate(editorRef.current?.innerHTML || '');
      } catch (err: any) {
        alert(`Error IA: ${err.message}`);
      } finally {
        setIsAiEditing(false);
      }
    };

    const toggleFullScreen = async () => {
      if (!isFullScreen) {
        try {
          // Use native browser Fullscreen API — immune to ALL CSS containment issues
          const el = editorWrapperRef.current;
          if (el) {
            if (el.requestFullscreen) {
              await el.requestFullscreen();
            } else if ((el as any).webkitRequestFullscreen) {
              await (el as any).webkitRequestFullscreen();
            }
            setIsFullScreen(true);
          }
        } catch {
          // Fallback: CSS-only approach if browser rejects fullscreen request
          setIsFullScreen(true);
        }
      } else {
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
          }
        } catch {
          /* ignore */
        }
        setIsFullScreen(false);
      }
    };

    // Sync isFullScreen state if user exits native fullscreen via Escape or other
    useEffect(() => {
      const onFsChange = () => {
        const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
        if (!fsEl) setIsFullScreen(false);
      };
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
      return () => {
        document.removeEventListener('fullscreenchange', onFsChange);
        document.removeEventListener('webkitfullscreenchange', onFsChange);
      };
    }, []);

    // Handle Esc key and overflow
    useEffect(() => {
      if (isFullScreen) {
        document.body.style.overflow = 'hidden';
        const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape') setIsFullScreen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => {
          document.body.style.overflow = 'auto';
          window.removeEventListener('keydown', handleEsc);
        };
      }
      document.body.style.overflow = 'auto';
    }, [isFullScreen]);
    // ────────────────────────────────────────────────────────────────────────

    useEffect(() => {
      try {
        if (Object.keys(namedSignatures).length > 0) {
          localStorage.setItem('wappy_signatures', JSON.stringify(namedSignatures));
        }
      } catch (e) {
        console.warn('Storage quota exceeded for signatures.');
        // Only keep the newest 10 if quota is hit
        const entries = Object.entries(namedSignatures);
        if (entries.length > 5) {
          const sliced = Object.fromEntries(entries.slice(entries.length - 5));
          setNamedSignatures(sliced);
        }
      }
    }, [namedSignatures]);

    // Auto-inject signatures automatically if they exist in state
    useEffect(() => {
      if (!editorRef.current || Object.keys(namedSignatures).length === 0) return;

      let changed = false;
      const placeholders = Array.from(
        editorRef.current.querySelectorAll('.signature-placeholder:not([data-skip-auto="true"])'),
      ) as HTMLElement[];

      // Helper to find a signature key that matches
      const findSignatureMatch = (name: string) => {
        if (!name) return null;
        name = name.toUpperCase().trim();
        // Direct match
        if (namedSignatures[name]) return namedSignatures[name];
        // Substring match
        for (const key of Object.keys(namedSignatures)) {
          if (name.includes(key) || key.includes(name)) {
            return namedSignatures[key];
          }
        }
        return null;
      };

      if (placeholders.length > 0) {
        placeholders.forEach((placeholder) => {
          const nextEl = placeholder.nextElementSibling;
          if (nextEl) {
            const name = nextEl.textContent?.trim().toUpperCase() || '';
            const matchedSignatureUrl = findSignatureMatch(name);

            if (name && matchedSignatureUrl) {
              const img = document.createElement('img');
              img.src = matchedSignatureUrl;
              img.className = 'wappy-auto-signature';
              img.style.maxHeight = '100px';
              img.style.display = 'block';
              img.style.margin = '10px auto';
              img.alt = `Firma de ${name}`;
              placeholder.replaceWith(img);
              changed = true;
            }
          }
        });

        if (changed) {
          const newContent = editorRef.current.innerHTML;
          setContent(newContent);
          onUpdate(newContent);
        }
      }
    }, [namedSignatures, content]);

    // Expose setHTML() and insertHTML() to parent via ref (imperative handle)
    useImperativeHandle(ref, () => ({
      setHTML: (html: string) => {
        if (editorRef.current) {
          isSyncingRef.current = true;
          const stripped = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
          const safeHtml = wrapTablesInResponsiveContainer(stripped);
          editorRef.current.innerHTML = safeHtml;
          setContent(safeHtml);
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 50);
        }
      },
      insertHTML: (html: string) => {
        if (!editorRef.current) return;
        const wrappedHtml = wrapTablesInResponsiveContainer(html);
        editorRef.current.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          // check if selection is actually inside our editor
          if (editorRef.current.contains(range.commonAncestorContainer)) {
            range.deleteContents();

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = wrappedHtml;

            const frag = document.createDocumentFragment();
            let node;
            let lastNode;
            while ((node = tempDiv.firstChild)) {
              lastNode = frag.appendChild(node);
            }
            range.insertNode(frag);

            if (lastNode) {
              const newRange = document.createRange();
              newRange.setStartAfter(lastNode);
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }

            // Trigger onUpdate immediately
            const newContent = editorRef.current.innerHTML;
            setContent(newContent);
            onUpdate(newContent);
            return;
          }
        }
        // Fallback: append if selection not inside editor
        editorRef.current.innerHTML += wrappedHtml;
        const newContent = editorRef.current.innerHTML;
        setContent(newContent);
        onUpdate(newContent);
      },
      getHTML: () => {
        return editorRef.current ? editorRef.current.innerHTML : '';
      },
    }));

    // Track if we already did the initial load so we never overwrite user edits
    const initializedRef = useRef(false);
    const isSyncingRef = useRef(false);

    // Maintain fresh reference to onUpdate to prevent stale closures in Observer
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
      onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    useEffect(() => {
      // Set content ONLY once when the component first mounts and has content
      if (!initializedRef.current && editorRef.current && initialContent) {
        const stripped = initialContent.replace(
          /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
          '',
        );
        const safeHtml = wrapTablesInResponsiveContainer(stripped);
        editorRef.current.innerHTML = safeHtml;
        initializedRef.current = true;
      } else if (!initializedRef.current && editorRef.current) {
        initializedRef.current = true;
      }

      // Setup MutationObserver to catch ALL dom changes (bold, images, resizing, AI edits) that bypass onInput
      if (editorRef.current) {
        const observer = new MutationObserver(() => {
          if (isSyncingRef.current) return;
          const newContent = editorRef.current?.innerHTML || '';
          setContent(newContent);
          onUpdateRef.current(newContent);
        });

        observer.observe(editorRef.current, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['style', 'class', 'src', 'width', 'height'],
        });

        return () => observer.disconnect();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // ← Empty deps: run ONCE on mount only.

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      // Fallback for direct keyboard input, though MutationObserver catches most
      const newContent = e.currentTarget.innerHTML;
      setContent(newContent);
      onUpdateRef.current(newContent);
    };

    const execCmd = (command: string, value: string | undefined = undefined) => {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const imageUrl = readerEvent.target?.result as string;
          execCmd('insertImage', imageUrl);
        };
        reader.readAsDataURL(file);
      }
      // Reset input
      e.target.value = '';
    };

    // Persist signatures to backend
    const persistSignaturesToBackend = async (signatures: Record<string, string>) => {
      if (!token) return;
      try {
        await fetch('/api/sgsst/signatures', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ signatures }),
        });
      } catch (err) {
        console.error('Error saving signatures to backend:', err);
      }
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const signatureUrl = readerEvent.target?.result as string;
          let nameToUse = activeSignatureName;
          if (!nameToUse || nameToUse === 'DESCONOCIDO') {
            nameToUse =
              prompt('¿A qué nombre o rol pertenece esta firma?')?.trim().toUpperCase() ||
              `Firma ${Object.keys(namedSignatures).length + 1}`;
          }

          const updated = { ...namedSignatures, [nameToUse]: signatureUrl };
          setNamedSignatures(updated);
          localStorage.setItem('wappy_signatures', JSON.stringify(updated));
          persistSignaturesToBackend(updated);

          // Insert into placeholder or at cursor
          const img = document.createElement('img');
          img.src = signatureUrl;
          img.style.maxHeight = '100px';
          img.style.display = 'block';
          img.style.margin = '10px auto';
          img.alt = `Firma ${nameToUse}`;

          if (
            activeSignaturePlaceholder &&
            editorRef.current?.contains(activeSignaturePlaceholder)
          ) {
            activeSignaturePlaceholder.replaceWith(img);
          } else {
            const html = `<img src="${signatureUrl}" style="max-height:100px;display:block;margin:10px auto;" alt="Firma ${nameToUse}" />`;
            document.execCommand('insertHTML', false, html);
          }
          onUpdate(editorRef.current?.innerHTML || '');
          setActiveSignaturePlaceholder(null);
          setIsSignatureModalOpen(false);
          setIsDrawingPadOpen(false);
        };
        reader.readAsDataURL(file);
      }
      e.target.value = '';
    };

    const insertSignature = (signatureUrl: string, existingName: string) => {
      const img = document.createElement('img');
      img.src = signatureUrl;
      img.style.maxHeight = '100px';
      img.style.display = 'block';
      img.style.margin = '10px auto';
      img.alt = `Firma ${existingName}`;

      if (activeSignaturePlaceholder && editorRef.current?.contains(activeSignaturePlaceholder)) {
        activeSignaturePlaceholder.replaceWith(img);
      } else {
        const html = `<img src="${signatureUrl}" style="max-height:100px;display:block;margin:10px auto;" alt="Firma ${existingName}" />`;
        document.execCommand('insertHTML', false, html);
      }
      onUpdate(editorRef.current?.innerHTML || '');
      setActiveSignaturePlaceholder(null);
      setIsSignatureModalOpen(false);
    };

    const saveDrawnSignature = (base64: string) => {
      let nameToUse = activeSignatureName;
      if (!nameToUse || nameToUse === 'DESCONOCIDO') {
        nameToUse =
          prompt('¿A qué nombre o rol pertenece esta firma?')?.trim().toUpperCase() ||
          `Firma ${Object.keys(namedSignatures).length + 1}`;
      }

      const updated = { ...namedSignatures, [nameToUse]: base64 };
      setNamedSignatures(updated);
      localStorage.setItem('wappy_signatures', JSON.stringify(updated));
      persistSignaturesToBackend(updated);

      // Immediately insert into the placeholder or at cursor
      const img = document.createElement('img');
      img.src = base64;
      img.style.maxHeight = '100px';
      img.style.display = 'block';
      img.style.margin = '10px auto';
      img.alt = `Firma ${nameToUse}`;

      if (activeSignaturePlaceholder && editorRef.current?.contains(activeSignaturePlaceholder)) {
        activeSignaturePlaceholder.replaceWith(img);
      } else {
        const html = `<img src="${base64}" style="max-height:100px;display:block;margin:10px auto;" alt="Firma ${nameToUse}" />`;
        document.execCommand('insertHTML', false, html);
      }
      onUpdate(editorRef.current?.innerHTML || '');
      setActiveSignaturePlaceholder(null);
      setIsSignatureModalOpen(false);
      setIsDrawingPadOpen(false);
    };

    const deleteSignature = (name: string) => {
      setNamedSignatures((prev) => {
        const next = { ...prev };
        delete next[name];
        localStorage.setItem('wappy_signatures', JSON.stringify(next));
        persistSignaturesToBackend(next);
        return next;
      });
    };

    // Image manipulation functions
    useEffect(() => {
      const handleDocClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        if (target.tagName === 'IMG' && editorRef.current?.contains(target)) {
          const img = target as HTMLImageElement;
          clearSelections();
          img.setAttribute('data-selected', 'true');
          setSelectedImage(img);
          const rect = img.getBoundingClientRect();
          // Use fixed viewport coords so toolbar works in maximized panels too
          setImageToolbarPos({
            top: rect.top - 58,
            left: rect.left,
          });
        } else if (
          (target.closest('.signature-placeholder') ||
            target.innerText?.includes('FIRMADO DIGITALMENTE')) &&
          editorRef.current?.contains(target)
        ) {
          const placeholder = (target.closest('.signature-placeholder') ||
            target.closest('div') ||
            target.parentElement) as HTMLElement;
          if (placeholder) {
            e.preventDefault();
            // Check for signature placeholders
            const sigPlaceholder = target.closest('.signature-placeholder') as HTMLElement;
            if (sigPlaceholder && editorRef.current?.contains(sigPlaceholder)) {
              let extractedName = 'DESCONOCIDO';
              const nextEl = sigPlaceholder.nextElementSibling;
              if (nextEl) {
                extractedName = nextEl.textContent?.trim().toUpperCase() || 'DESCONOCIDO';
              }
              setActiveSignatureName(extractedName);
              setActiveSignaturePlaceholder(sigPlaceholder);
              setIsSignatureModalOpen(true);
            }
          }
        } else if (target.closest('td, th') && editorRef.current?.contains(target)) {
          const cell = target.closest('td, th') as HTMLTableCellElement;
          // If the cell contains a signature placeholder, treat the click as a placeholder click
          const sigInCell = cell.querySelector('.signature-placeholder') as HTMLElement | null;
          if (sigInCell) {
            e.preventDefault();
            let extractedName = 'DESCONOCIDO';
            const nextEl = sigInCell.nextElementSibling;
            if (nextEl) {
              extractedName = nextEl.textContent?.trim().toUpperCase() || 'DESCONOCIDO';
            }
            setActiveSignatureName(extractedName);
            setActiveSignaturePlaceholder(sigInCell);
            setIsSignatureModalOpen(true);
          } else {
            clearSelections();
            cell.setAttribute('data-selected', 'true');
            setSelectedTableCell(cell);
            const rect = cell.getBoundingClientRect();
            const wrapperRect = editorWrapperRef.current!.getBoundingClientRect();
            setTableToolbarPos({
              top: rect.top - wrapperRect.top - 50,
              left: rect.left - wrapperRect.left,
            });
          }
        } else if (
          target.closest('.progress-bar-container, [style*="width:"]') &&
          editorRef.current?.contains(target)
        ) {
          const graphic = target.closest('div') as HTMLDivElement;
          if (graphic.style.width || graphic.classList.contains('progress-bar')) {
            clearSelections();
            graphic.setAttribute('data-selected', 'true');
            setSelectedGraphic(graphic);
            const rect = graphic.getBoundingClientRect();
            const wrapperRect = editorWrapperRef.current!.getBoundingClientRect();
            setGraphicToolbarPos({
              top: rect.top - wrapperRect.top - 60,
              left: rect.left - wrapperRect.left,
            });
          }
        } else if (target.closest('.diagram-node') && editorRef.current?.contains(target)) {
          const node = target.closest('.diagram-node') as HTMLElement;
          clearSelections();
          node.setAttribute('data-selected', 'true');
          setSelectedDiagramNode(node);
          const rect = node.getBoundingClientRect();
          const wrapperRect = editorWrapperRef.current!.getBoundingClientRect();
          setDiagramNodeToolbarPos({
            top: rect.top - wrapperRect.top - 50,
            left: rect.left - wrapperRect.left,
          });
        } else {
          // If it's a click on the document but NOT inside any toolbar, clear selections
          const isInsideToolbar = !!target.closest(
            '.image-toolbar, .table-toolbar, .graphic-toolbar, .diagram-toolbar, .signature-modal, [data-ai-bubble="true"]',
          );
          if (!isInsideToolbar) {
            clearSelections();
          }
        }
      };

      const clearSelections = () => {
        editorRef.current
          ?.querySelectorAll('img, td, th, div, span, .diagram-node')
          .forEach((i) => i.removeAttribute('data-selected'));
        setSelectedImage(null);
        setSelectedTableCell(null);
        setSelectedGraphic(null);
        setSelectedDiagramNode(null);
      };

      const editor = editorRef.current;
      if (editor) {
        editor.addEventListener('click', handleDocClick);
      }
      return () => {
        if (editor) {
          editor.removeEventListener('click', handleDocClick);
        }
      };
    }, []);

    const updateImageStyle = (styles: Partial<CSSStyleDeclaration>) => {
      if (!selectedImage) return;
      Object.assign(selectedImage.style, styles);
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const setImageAlign = (align: 'left' | 'center' | 'right' | 'none') => {
      if (!selectedImage) return;
      if (align === 'center') {
        updateImageStyle({ display: 'block', margin: '10px auto', float: 'none' });
      } else if (align === 'left') {
        updateImageStyle({ display: 'inline-block', margin: '0 15px 10px 0', float: 'left' });
      } else if (align === 'right') {
        updateImageStyle({ display: 'inline-block', margin: '0 0 10px 15px', float: 'right' });
      } else {
        updateImageStyle({
          display: 'inline-block',
          margin: '0',
          float: 'none',
          position: 'static',
        });
      }
    };

    const setImageLayer = (layer: 'front' | 'back' | 'normal') => {
      if (!selectedImage) return;
      if (layer === 'front') {
        updateImageStyle({ position: 'relative', zIndex: '10' });
      } else if (layer === 'back') {
        updateImageStyle({ position: 'relative', zIndex: '-1' });
      } else {
        updateImageStyle({ position: 'static', zIndex: '0' });
      }
    };

    const setImageSize = (size: 'sm' | 'md' | 'lg' | 'full') => {
      if (!selectedImage) return;
      const width =
        size === 'sm' ? '150px' : size === 'md' ? '300px' : size === 'lg' ? '500px' : '100%';
      updateImageStyle({ width, height: 'auto' });
    };

    const removeImage = () => {
      if (!selectedImage) return;

      // If the image is a signature, restore the placeholder instead of just deleting it
      if (selectedImage.alt && selectedImage.alt.startsWith('Firma')) {
        const placeholder = document.createElement('div');
        placeholder.className = 'signature-placeholder';
        placeholder.setAttribute('data-skip-auto', 'true');
        // Full width so the entire cell area is clickable again
        placeholder.style.cssText =
          'border-bottom: 2px solid #333; width: 100%; min-height: 80px; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; cursor: pointer; border-radius: 8px 8px 0 0; transition: all 0.3s ease;';
        placeholder.innerHTML =
          '<span style="font-size: 11px; opacity: 0.6;">Clic para firmar</span>';
        selectedImage.replaceWith(placeholder);
      } else {
        selectedImage.remove();
      }

      setSelectedImage(null);
      onUpdate(editorRef.current?.innerHTML || '');
    };

    // Table manipulation functions
    const addTableRow = (where: 'above' | 'below') => {
      if (!selectedTableCell) return;
      const row = selectedTableCell.parentElement as HTMLTableRowElement;
      const table = row.parentElement as HTMLTableSectionElement;
      const newRow = table.insertRow(where === 'above' ? row.rowIndex : row.rowIndex + 1);
      for (let i = 0; i < row.cells.length; i++) {
        const newCell = newRow.insertCell(i);
        newCell.innerHTML = '&nbsp;';
      }
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const addTableCol = (where: 'left' | 'right') => {
      if (!selectedTableCell) return;
      const table = selectedTableCell.closest('table') as HTMLTableElement;
      const colIndex = selectedTableCell.cellIndex;
      const targetIndex = where === 'left' ? colIndex : colIndex + 1;

      for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        const newCell = row.insertCell(targetIndex);
        newCell.innerHTML = '&nbsp;';
      }
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const deleteTableRow = () => {
      if (!selectedTableCell) return;
      const row = selectedTableCell.parentElement as HTMLTableRowElement;
      const table = row.closest('table') as HTMLTableElement;
      if (table.rows.length > 1) {
        table.deleteRow(row.rowIndex);
        setSelectedTableCell(null);
        onUpdate(editorRef.current?.innerHTML || '');
      }
    };

    const deleteTableCol = () => {
      if (!selectedTableCell) return;
      const table = selectedTableCell.closest('table') as HTMLTableElement;
      const colIndex = selectedTableCell.cellIndex;
      if (table.rows[0].cells.length > 1) {
        for (let i = 0; i < table.rows.length; i++) {
          table.rows[i].deleteCell(colIndex);
        }
        setSelectedTableCell(null);
        onUpdate(editorRef.current?.innerHTML || '');
      }
    };

    const deleteTable = () => {
      if (!selectedTableCell) return;
      const table = selectedTableCell.closest('table');
      table?.remove();
      setSelectedTableCell(null);
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const resizeColumn = (direction: 'wider' | 'narrower') => {
      if (!selectedTableCell) return;
      const colIndex = selectedTableCell.cellIndex;
      const table = selectedTableCell.closest('table') as HTMLTableElement;
      // We only apply widths to the first row of cells (usually headers)
      const headerCell = table.rows[0].cells[colIndex];
      const currentWidth = headerCell.offsetWidth;
      const newWidth = direction === 'wider' ? currentWidth + 20 : Math.max(20, currentWidth - 20);
      headerCell.style.width = `${newWidth}px`;
      headerCell.style.minWidth = `${newWidth}px`;
      onUpdate(editorRef.current?.innerHTML || '');
    };

    // Graphic manipulation functions
    const updateGraphic = (percent: number, color?: string) => {
      if (!selectedGraphic) return;
      const innerBar = selectedGraphic.querySelector('div') || selectedGraphic;
      if (color) {
        innerBar.style.backgroundColor = color;
      }
      innerBar.style.width = `${percent}%`;
      innerBar.innerText = `${percent}%`;
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const setDiagramNodeColor = (bgColor: string, textColor: string) => {
      if (!selectedDiagramNode) return;
      selectedDiagramNode.style.backgroundColor = bgColor;
      selectedDiagramNode.style.color = textColor;
      // Also force any direct text spans to inherit or match
      const spans = selectedDiagramNode.querySelectorAll('span');
      spans.forEach((span) => {
        span.style.color = textColor;
      });
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const deleteDiagramNode = () => {
      if (!selectedDiagramNode) return;
      selectedDiagramNode.remove();
      setSelectedDiagramNode(null);
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const changeFontSize = (direction: 'up' | 'down') => {
      const next = direction === 'up' ? Math.min(fontSize + 1, 7) : Math.max(fontSize - 1, 1);
      setFontSize(next);
      editorRef.current?.focus();
      // Apply to selection (if any) — browser will handle scope
      document.execCommand('fontSize', false, String(next));
      onUpdate(editorRef.current?.innerHTML || '');
    };

    const increaseFontSize = () => changeFontSize('up');
    const decreaseFontSize = () => changeFontSize('down');

    const ToolbarButton = ({
      icon: Icon,
      command,
      value,
      label,
      onClick,
    }: {
      icon: any;
      command?: string;
      value?: string;
      label: string;
      onClick?: () => void;
    }) => (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onClick ? onClick : () => command && execCmd(command, value)}
        className="border-border-medium/50 group relative flex h-7.5 w-7.5 sm:h-8 sm:w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border bg-surface-primary text-text-primary shadow-xs outline-none transition-all duration-200 hover:border-teal-400 hover:bg-surface-hover active:scale-95"
        type="button"
        aria-label={label}
      >
        <Icon size={15} className="sm:h-4 sm:w-4" />
        <div className="pointer-events-none absolute left-1/2 top-full z-[110] mt-1.5 hidden max-w-0 -translate-x-1/2 items-center overflow-hidden whitespace-nowrap rounded-md border border-teal-500/50 bg-teal-600 px-2 py-0.5 text-white opacity-0 shadow-xl transition-all duration-300 ease-in-out group-hover:max-w-[150px] group-hover:opacity-100 sm:flex">
          <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
        </div>
      </motion.button>
    );

    const editorGroups = [
      {
        id: 'fontsize',
        buttons: [
          { icon: AArrowUp, label: 'Aumentar texto', onClick: increaseFontSize },
          { icon: AArrowDown, label: 'Reducir texto', onClick: decreaseFontSize },
        ],
      },
      {
        id: 'format',
        buttons: [
          { icon: Bold, command: 'bold', label: localize('com_ui_bold') },
          { icon: Italic, command: 'italic', label: localize('com_ui_italic') },
          { icon: Underline, command: 'underline', label: localize('com_ui_underline') },
        ],
      },
      {
        id: 'headings',
        buttons: [
          {
            icon: Heading1,
            command: 'formatBlock',
            value: 'H1',
            label: localize('com_ui_heading_1'),
          },
          {
            icon: Heading2,
            command: 'formatBlock',
            value: 'H2',
            label: localize('com_ui_heading_2'),
          },
        ],
      },
      {
        id: 'lists',
        buttons: [
          { icon: List, command: 'insertUnorderedList', label: localize('com_ui_bullet_list') },
          {
            icon: ListOrdered,
            command: 'insertOrderedList',
            label: localize('com_ui_numbered_list'),
          },
        ],
      },
      {
        id: 'align',
        buttons: [
          { icon: AlignLeft, command: 'justifyLeft', label: localize('com_ui_align_left') },
          { icon: AlignCenter, command: 'justifyCenter', label: localize('com_ui_align_center') },
          { icon: AlignRight, command: 'justifyRight', label: localize('com_ui_align_right') },
        ],
      },
      {
        id: 'media',
        buttons: [
          { icon: ImageIcon, label: 'Imagen', onClick: () => fileInputRef.current?.click() },
          { icon: PenTool, label: 'Firma', onClick: () => setIsSignatureModalOpen(true) },
        ],
      },
      {
        id: 'save',
        buttons: [
          ...(onHistory
            ? [
                {
                  icon: History,
                  label: localize('com_ui_history') || 'Historial',
                  onClick: onHistory,
                },
              ]
            : []),
          ...(onSave
            ? [
                {
                  icon: Save,
                  label: localize('com_ui_save_report') || 'Guardar Informe',
                  onClick: onSave,
                },
              ]
            : []),
          ...(!hideFullscreen
            ? [
                {
                  icon: isFullScreen ? Minimize : Maximize,
                  label: isFullScreen ? 'Salir Pantalla Completa' : 'Pantalla Completa',
                  onClick: toggleFullScreen,
                },
              ]
            : []),
        ],
      },
    ].filter((g) => g.buttons.length > 0);

    const editorRows = React.useMemo(() => {
      const result: any[][] = [];
      let currentRow: any[] = [];
      let count = 0;
      editorGroups.forEach((g) => {
        if (count + g.buttons.length > 5 && currentRow.length > 0) {
          result.push(currentRow);
          currentRow = [g];
          count = g.buttons.length;
        } else {
          currentRow.push(g);
          count += g.buttons.length;
        }
      });
      if (currentRow.length > 0) result.push(currentRow);
      return result;
    }, [editorGroups]);

    const ToolbarSeparator = () => <div className="hidden sm:block bg-border-medium/60 mx-0.5 h-4 w-px self-center" />;

    return (
      <div
        ref={editorWrapperRef}
        className={`relative flex flex-col ${isFullScreen ? 'fixed inset-0 z-[99999] bg-surface-secondary' : 'h-full min-h-[500px] w-full rounded-xl bg-surface-secondary'} font-sans transition-all duration-300`}
      >
        {localToast && (
          <div className="pointer-events-none absolute left-1/2 top-16 z-[99999999] -translate-x-1/2 transform">
            <div className="flex items-center gap-3 rounded-xl border border-teal-500/30 bg-[#0d0d0d] px-5 py-3 text-sm font-semibold text-teal-400 shadow-2xl duration-300 animate-in fade-in slide-in-from-top-6">
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {localToast.message}
            </div>
          </div>
        )}

        {/* Header Toolbar — hidden in collapsed mode when hideToolbarWhenCollapsed=true */}
        {(!hideToolbarWhenCollapsed || isFullScreen) && (
          <div className="bg-surface-secondary/80 group/toolbar sticky top-0 z-50 flex flex-col items-center border-b border-border-medium p-1.5 sm:p-2 backdrop-blur-sm transition-all duration-300">
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
              {editorGroups.map((group, idx) => (
                <React.Fragment key={group.id}>
                  <div className="flex items-center gap-1">
                    {group.buttons.map((btn, bIdx) => (
                      <ToolbarButton key={bIdx} {...btn} />
                    ))}
                  </div>
                  {idx < editorGroups.length - 1 && <ToolbarSeparator />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleImageUpload}
        />
        <input
          type="file"
          ref={signatureInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleSignatureUpload}
        />

        {/* Signature Management Modal — portal so it sits centered in viewport */}
        {isSignatureModalOpen &&
          portalNode &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/50 p-4"
              onClick={() => setIsSignatureModalOpen(false)}
            >
              <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-border-medium bg-surface-primary shadow-2xl duration-200 animate-in fade-in zoom-in"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border-light bg-surface-secondary p-4">
                  <h3 className="text-sm font-bold uppercase text-text-primary">
                    {activeSignatureName && activeSignatureName !== 'DESCONOCIDO'
                      ? `Insertar Firma: ${activeSignatureName}`
                      : 'Firmas Digitales'}
                  </h3>
                  <button
                    onClick={() => setIsSignatureModalOpen(false)}
                    className="text-text-tertiary hover:text-text-primary"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-4">
                  {Object.keys(namedSignatures).length === 0 ? (
                    <div className="py-8 text-center text-text-tertiary">
                      <PenTool className="mx-auto mb-2 h-12 w-12 opacity-20" />
                      <p>No hay firmas guardadas</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(namedSignatures).map(([name, url]) => (
                        <div
                          key={name}
                          className="group relative flex cursor-pointer flex-col items-center justify-between rounded-lg border border-border-light bg-white p-3 transition-all hover:border-blue-500"
                        >
                          <img
                            src={url}
                            alt={name}
                            className="mb-2 max-h-16 w-auto flex-grow object-contain"
                            onClick={() => insertSignature(url, name)}
                          />
                          <div
                            className="w-full break-words px-1 text-center text-[10px] font-bold uppercase leading-none tracking-tight text-slate-700"
                            onClick={() => insertSignature(url, name)}
                          >
                            {name}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSignature(name);
                            }}
                            className="absolute -right-2 -top-2 z-10 rounded-full bg-red-500 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 border-t border-border-light bg-surface-secondary p-4 sm:flex-row">
                  <button
                    onClick={() => signatureInputRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <ImageIcon size={16} /> Cargar Archivo
                  </button>
                  <button
                    onClick={() => {
                      setIsSignatureModalOpen(false);
                      setIsDrawingPadOpen(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    <PenTool size={16} /> Dibujar en Pantalla
                  </button>
                  <button
                    onClick={() => setIsSignatureModalOpen(false)}
                    className="rounded-lg bg-border-light px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-border-medium sm:flex-none"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>,
            portalNode,
          )}

        <SignaturePad
          isOpen={isDrawingPadOpen}
          onClose={() => setIsDrawingPadOpen(false)}
          onSave={saveDrawnSignature}
          title={
            activeSignatureName && activeSignatureName !== 'DESCONOCIDO'
              ? `Firma: ${activeSignatureName}`
              : 'Dibujar Nueva Firma'
          }
        />

        {/* Floating Image Toolbar — rendered as fixed to escape any stacking context */}
        {selectedImage &&
          portalNode &&
          createPortal(
            <div
              className="image-toolbar flex flex-wrap items-center gap-1.5 rounded-lg border border-border-medium bg-surface-primary p-1.5 shadow-2xl duration-200 animate-in fade-in slide-in-from-top-1 dark:bg-zinc-800"
              style={{
                position: 'fixed',
                top: `${Math.max(10, Math.min(imageToolbarPos.top, window.innerHeight - 80))}px`,
                left: `${Math.max(10, Math.min(imageToolbarPos.left, window.innerWidth - 380))}px`,
                zIndex: 9999999,
                maxWidth: '360px',
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="mr-0.5 flex gap-1 border-r border-border-light pr-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageSize('sm');
                  }}
                  className="rounded border border-transparent px-2 py-1 text-xs font-medium hover:border-border-medium hover:bg-surface-hover"
                  title="Pequeño"
                >
                  S
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageSize('md');
                  }}
                  className="rounded border border-transparent px-2 py-1 text-xs font-bold hover:border-border-medium hover:bg-surface-hover"
                  title="Mediano"
                >
                  M
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageSize('lg');
                  }}
                  className="rounded border border-transparent px-2 py-1 text-xs font-medium hover:border-border-medium hover:bg-surface-hover"
                  title="Grande"
                >
                  L
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageSize('full');
                  }}
                  className="rounded border border-transparent px-2 py-1 text-xs font-medium hover:border-border-medium hover:bg-surface-hover"
                  title="Ancho Total"
                >
                  W
                </button>
              </div>

              <div className="mr-0.5 flex gap-0.5 border-r border-border-light pr-1.5">
                <ToolbarButton
                  icon={AlignLeft}
                  onClick={() => setImageAlign('left')}
                  label="Alinear Izquierda / Envolver"
                />
                <ToolbarButton
                  icon={AlignCenter}
                  onClick={() => setImageAlign('center')}
                  label="Centrar"
                />
                <ToolbarButton
                  icon={AlignRight}
                  onClick={() => setImageAlign('right')}
                  label="Alinear Derecha / Envolver"
                />
                <ToolbarButton
                  icon={Move}
                  onClick={() => setImageAlign('none')}
                  label="Restablecer (En línea)"
                />
              </div>

              <div className="mr-0.5 flex gap-0.5 border-r border-border-light pr-1.5">
                <ToolbarButton
                  icon={ArrowUp}
                  onClick={() => setImageLayer('front')}
                  label="Traer al frente"
                />
                <ToolbarButton
                  icon={ArrowDown}
                  onClick={() => setImageLayer('back')}
                  label="Enviar al fondo"
                />
              </div>

              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeImage();
                }}
                className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Eliminar imagen / firma"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedImage(null);
                }}
                className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>,
            portalNode,
          )}

        {/* Floating Table Toolbar */}
        {selectedTableCell && (
          <div
            className="table-toolbar absolute z-[80] flex flex-wrap items-center gap-1 rounded-lg border border-border-medium bg-surface-primary p-1.5 shadow-2xl duration-200 animate-in fade-in slide-in-from-top-1 dark:bg-zinc-800"
            style={{
              top: `${Math.max(10, tableToolbarPos.top)}px`,
              left: `${Math.max(10, Math.min(tableToolbarPos.left, (editorRef.current?.clientWidth || 0) - 400))}px`,
            }}
          >
            <div className="mr-0.5 flex gap-0.5 border-r border-border-light pr-1.5">
              <ToolbarButton icon={Plus} onClick={() => addTableRow('above')} label="Fila Arriba" />
              <ToolbarButton icon={Plus} onClick={() => addTableRow('below')} label="Fila Abajo" />
              <ToolbarButton icon={Trash2} onClick={deleteTableRow} label="Eliminar Fila" />
            </div>
            <div className="mr-0.5 flex gap-0.5 border-r border-border-light pr-1.5">
              <ToolbarButton
                icon={ChevronRight}
                onClick={() => addTableCol('right')}
                label="Columna Derecha"
              />
              <ToolbarButton icon={Trash2} onClick={deleteTableCol} label="Eliminar Columna" />
            </div>
            <div className="mr-0.5 flex gap-0.5 border-r border-border-light pr-1.5">
              <ToolbarButton
                icon={Maximize}
                onClick={() => resizeColumn('wider')}
                label="Más Ancho"
              />
              <ToolbarButton
                icon={Minimize}
                onClick={() => resizeColumn('narrower')}
                label="Menos Ancho"
              />
            </div>
            <button
              onClick={deleteTable}
              className="rounded p-1 px-2 text-xs font-bold text-red-500 hover:bg-red-50"
              title="Eliminar Tabla"
            >
              TABLA
            </button>
            <button
              onClick={() => setSelectedTableCell(null)}
              className="rounded p-1 text-text-tertiary hover:bg-surface-hover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Floating Graphic/Progress Toolbar */}
        {selectedGraphic && (
          <div
            className="graphic-toolbar absolute z-[80] flex items-center gap-2 rounded-lg border border-border-medium bg-surface-primary p-2 shadow-2xl duration-200 animate-in fade-in slide-in-from-top-1 dark:bg-zinc-800"
            style={{
              top: `${Math.max(10, graphicToolbarPos.top)}px`,
              left: `${Math.max(10, Math.min(graphicToolbarPos.left, (editorRef.current?.clientWidth || 0) - 300))}px`,
            }}
          >
            <input
              type="range"
              min="0"
              max="100"
              defaultValue={parseInt(selectedGraphic.style.width) || 0}
              onChange={(e) => updateGraphic(parseInt(e.target.value))}
              className="w-24 accent-blue-600"
            />
            <div className="flex gap-1">
              <button
                onClick={() => updateGraphic(parseInt(selectedGraphic.style.width), '#22c55e')}
                className="h-5 w-5 rounded-full border border-white/20 bg-green-500"
                title="Verde"
              />
              <button
                onClick={() => updateGraphic(parseInt(selectedGraphic.style.width), '#eab308')}
                className="h-5 w-5 rounded-full border border-white/20 bg-yellow-500"
                title="Amarillo"
              />
              <button
                onClick={() => updateGraphic(parseInt(selectedGraphic.style.width), '#ef4444')}
                className="h-5 w-5 rounded-full border border-white/20 bg-red-500"
                title="Rojo"
              />
            </div>
            <button
              onClick={() => setSelectedGraphic(null)}
              className="rounded p-1 text-text-tertiary hover:bg-surface-hover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Floating Diagram Node Toolbar */}
        {selectedDiagramNode && (
          <div
            className="diagram-toolbar absolute z-[80] flex items-center gap-1.5 rounded-lg border border-border-medium bg-surface-primary p-1.5 shadow-2xl duration-200 animate-in fade-in slide-in-from-top-1"
            style={{
              top: `${Math.max(10, diagramNodeToolbarPos.top)}px`,
              left: `${Math.max(10, Math.min(diagramNodeToolbarPos.left, (editorRef.current?.clientWidth || 0) - 300))}px`,
            }}
          >
            <div className="mr-0.5 flex gap-1 border-r border-border-light pr-1.5">
              <span className="mr-1 self-center text-[10px] font-bold uppercase text-text-tertiary">
                Fondo:
              </span>
              <button
                onClick={() => setDiagramNodeColor('#f8fafc', '#111111')}
                className="h-5 w-5 rounded-full border border-gray-300 bg-[#f8fafc]"
                title="Gris Claro"
              />
              <button
                onClick={() => setDiagramNodeColor('#fef08a', '#111111')}
                className="h-5 w-5 rounded-full border border-gray-300 bg-yellow-200"
                title="Amarillo"
              />
              <button
                onClick={() => setDiagramNodeColor('#fed7aa', '#111111')}
                className="h-5 w-5 rounded-full border border-gray-300 bg-orange-200"
                title="Naranja"
              />
              <button
                onClick={() => setDiagramNodeColor('#fca5a5', '#111111')}
                className="h-5 w-5 rounded-full border border-gray-300 bg-red-300"
                title="Rojo Claro"
              />
              <button
                onClick={() => setDiagramNodeColor('#bbf7d0', '#111111')}
                className="h-5 w-5 rounded-full border border-gray-300 bg-green-200"
                title="Verde Claro"
              />
              <button
                onClick={() => setDiagramNodeColor('#e2e8f0', '#111111')}
                className="h-5 w-5 rounded-full border border-gray-300 bg-slate-200"
                title="Gris"
              />
            </div>
            <button
              onClick={deleteDiagramNode}
              className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50"
              title="Eliminar figura"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSelectedDiagramNode(null)}
              className="rounded p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className={`relative flex flex-1 flex-col overflow-y-auto overflow-x-auto w-full min-w-0 transition-colors ${paperMode ? 'bg-slate-100/70 dark:bg-zinc-950/40 p-2 sm:p-5' : 'p-2'}`}>
          <div
            ref={editorRef}
            className={`prose outline-none transition-all live-editor-content w-full min-w-0 ${!paperMode ? 'flex-1 p-3 sm:p-6 max-w-none dark:prose-invert' : 'paper-mode max-w-4xl mx-auto'} ${reportType === 'checklist' ? 'checklist-mode' : ''}`}
            contentEditable
            onInput={handleInput}
            suppressContentEditableWarning={true}
            style={{ minHeight: paperMode ? '600px' : '100%', maxWidth: paperMode ? '860px' : '100%' }}
          />
        </div>
        {/* Standardized report styles matching Diagnóstico/Auditoría */}
        <style>{`
                .live-editor-content h1 {
                    color: #004d99;
                    text-align: center;
                    margin-bottom: 6px;
                    font-size: 1.5em;
                    border-bottom: 2px solid #004d99;
                    padding-bottom: 6px;
                }
                .live-editor-content h2 {
                    color: #004d99;
                    border-bottom: 2px solid #004d99;
                    padding-bottom: 4px;
                    font-size: 1.25em;
                    margin-top: 14px;
                    margin-bottom: 6px;
                }
                .live-editor-content h3 {
                    color: #333;
                    font-size: 1.1em;
                    margin-top: 10px;
                    margin-bottom: 4px;
                }
                /* Recuadros internos y tarjetas de sección: contener siempre el desbordamiento horizontal */
                .live-editor-content div {
                    box-sizing: border-box;
                    max-width: 100%;
                }
                .live-editor-content div[style*="border"],
                .live-editor-content div[style*="padding"],
                .live-editor-content .seccion-card,
                .live-editor-content .report-section {
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                    overflow-x: auto !important;
                }
                .live-editor-content .table-responsive,
                .live-editor-content .table-container,
                .live-editor-content .table-wrapper {
                    width: 100% !important;
                    max-width: 100% !important;
                    overflow-x: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                    margin: 16px 0 !important;
                    border-radius: 10px !important;
                    border: 1px solid #e2e8f0 !important;
                    box-sizing: border-box !important;
                    display: block !important;
                }
                .live-editor-content table {
                    width: 100% !important;
                    max-width: 100% !important;
                    border-collapse: separate;
                    border-spacing: 0;
                    margin: 12px 0;
                    font-size: 0.85em;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    table-layout: auto;
                    word-break: normal !important;
                    box-sizing: border-box !important;
                }
                .live-editor-content .table-responsive table,
                .live-editor-content .table-container table,
                .live-editor-content .table-wrapper table {
                    margin: 0 !important;
                    border: none !important;
                    border-radius: 0 !important;
                    min-width: 720px;
                    display: table !important;
                }
                /* Salvaguarda para tablas no envueltas: scroll block sin desbordar el recuadro */
                .live-editor-content > table,
                .live-editor-content div:not(.table-responsive):not(.table-container):not(.table-wrapper) > table {
                    display: block !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    overflow-x: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                }
                .live-editor-content table th {
                    background-color: #004d99;
                    color: white;
                    padding: 9px 12px;
                    text-align: left;
                    font-weight: 600;
                    border-bottom: 1px solid #ddd;
                    border-right: 1px solid rgba(255,255,255,0.15);
                    white-space: nowrap !important;
                    word-break: normal !important;
                    letter-spacing: 0.01em;
                }
                /* Specific column widths for SGSST Reports */
                .checklist-mode table th:nth-child(1) { width: 38px; } /* # - Narrowest possible */
                .checklist-mode table th:nth-child(2) { width: 14%; } /* Requisito / Estándar */
                .checklist-mode table th:nth-child(3) { width: 44%; } /* Hallazgo (Evidencia) */
                .checklist-mode table th:nth-child(4) { width: 10%; } /* Tipo */
                .checklist-mode table th:nth-child(5) { width: 15%; } /* Responsable - Wider */

                .live-editor-content table th:last-child {
                    border-right: none;
                }
                .live-editor-content table td {
                    padding: 8px 12px;
                    border-bottom: 1px solid #e2e8f0;
                    border-right: 1px solid #f1f5f9;
                    vertical-align: top;
                    word-wrap: normal !important;
                    overflow-wrap: normal !important;
                    word-break: normal !important;
                    line-height: 1.45;
                }
                /* Center and prevent character-by-character wrap on indicator/badge/score cells */
                .live-editor-content table td:first-child,
                .live-editor-content table td[style*="text-align:center"],
                .live-editor-content table td[style*="text-align: center"],
                .live-editor-content table td[align="center"] {
                    white-space: nowrap;
                    text-align: center;
                }
                .live-editor-content table td:last-child {
                    border-right: none;
                }
                .live-editor-content table tr:last-child td {
                    border-bottom: none;
                }
                .live-editor-content table tr:nth-child(even) {
                    background-color: #f8fafc;
                }
                .live-editor-content table tr:hover {
                    background-color: #f1f5f9;
                }
                .live-editor-content img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    border: 1px solid #ddd;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: all 0.2s ease;
                    cursor: pointer;
                    user-select: none;
                    -webkit-user-drag: none;
                }
                .live-editor-content img:hover {
                    outline: 2px solid #3b82f6;
                    outline-offset: 4px;
                }
                .live-editor-content img[data-selected="true"],
                .live-editor-content td[data-selected="true"],
                .live-editor-content th[data-selected="true"],
                .live-editor-content div[data-selected="true"] {
                    outline: 3px solid #3b82f6 !important;
                    outline-offset: -3px;
                    box-shadow: inset 0 0 10px rgba(59, 130, 246, 0.2);
                }
                .live-editor-content td[data-selected="true"],
                .live-editor-content th[data-selected="true"],
                .live-editor-content div.diagram-node[data-selected="true"] {
                    background-color: rgba(59, 130, 246, 0.05) !important;
                }
                .image-toolbar, .table-toolbar, .graphic-toolbar, .diagram-toolbar {
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    backdrop-filter: blur(8px);
                }
                .signature-modal {
                    backdrop-filter: blur(4px);
                }
                .signature-placeholder {
                    transition: all 0.3s ease;
                    position: relative;
                    z-index: 5;
                    pointer-events: auto !important;
                    user-select: none;
                }
                .signature-placeholder * {
                    pointer-events: none; /* Make children non-blocking for click */
                }
                .signature-placeholder:hover {
                    background: rgba(0,77,153,0.1) !important;
                    border-color: #004d99 !important;
                    transform: scale(1.02);
                    box-shadow: 0 4px 12px rgba(0,77,153,0.15);
                }
                
                /* Paper Mode specific */
                .live-editor-content.paper-mode {
                    background-color: #ffffff !important;
                    color: #1e293b !important;
                    padding: 24px 28px !important;
                    min-height: 600px;
                    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
                    border-radius: 12px;
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    width: 100% !important;
                    box-sizing: border-box !important;
                    margin: 0 auto;
                    overflow-x: hidden !important;
                }
                @media (max-width: 640px) {
                    .live-editor-content.paper-mode {
                        padding: 14px 12px !important;
                        border-radius: 8px;
                    }
                }
                .dark .live-editor-content.paper-mode {
                    background-color: #ffffff !important;
                    color: #1e293b !important;
                }
                
                /* AI Edit Bubble */
                .ai-edit-bubble {
                    position: fixed;
                    z-index: 9999999;
                }
                @keyframes aiBubblePop {
                    from { opacity: 0; transform: translateX(-50%) scale(0.9) translateY(4px); }
                    to   { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
                }

                .live-editor-fullscreen {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    bottom: 0 !important;
                    right: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    z-index: 999999 !important;
                    background: #fff !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .dark .live-editor-fullscreen {
                    background: #18181b !important;
                }
                .live-editor-fullscreen .live-editor-content {
                    flex: 1;
                    height: calc(100vh - 80px) !important;
                    padding: 8px 12px !important;
                }
                .live-editor-fullscreen .live-editor-content > * {
                    max-width: 100% !important;
                }
                @media (min-width: 640px) {
                    .live-editor-fullscreen .live-editor-content {
                        padding: 24px 40px !important;
                    }
                    .live-editor-fullscreen .live-editor-content > * {
                        max-width: 1000px !important;
                        margin-left: auto !important;
                        margin-right: auto !important;
                    }
                }
            `}</style>

        {/* ✨ AI Bubble (Portaled to avoid overflow clipping) */}
        {aiEditBubble &&
          portalNode &&
          createPortal(
            <div
              data-ai-bubble="true"
              className="ai-edit-bubble"
              style={{
                position: 'fixed',
                left: aiEditBubble.x,
                top: aiEditBubble.y,
                zIndex: 9999999,
              }}
            >
              {!showAiInput ? (
                /* Simple pill button */
                <button
                  data-ai-bubble="true"
                  onClick={() => setShowAiInput(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '0.78em',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.3px',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
                  }}
                >
                  ✨ Editar con IA
                </button>
              ) : (
                /* Expanded input panel */
                <div
                  data-ai-bubble="true"
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    minWidth: '260px',
                  }}
                >
                  <textarea
                    ref={aiInputRef}
                    data-ai-bubble="true"
                    value={aiEditInstruction}
                    onChange={(e) => setAiEditInstruction(e.target.value)}
                    placeholder="¿Qué deseas cambiar o agregar?"
                    style={{
                      width: '100%',
                      minHeight: '60px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '0.85em',
                      resize: 'none',
                      outline: 'none',
                      color: '#1e293b',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAiEdit();
                      }
                      if (e.key === 'Escape') {
                        setAiEditBubble(null);
                        setShowAiInput(false);
                      }
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      data-ai-bubble="true"
                      onClick={() => {
                        setAiEditBubble(null);
                        setShowAiInput(false);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: '0.8em',
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      {' '}
                      Cancelar{' '}
                    </button>
                    <button
                      data-ai-bubble="true"
                      onClick={handleAiEdit}
                      disabled={isAiEditing || !aiEditInstruction.trim()}
                      style={{
                        background: '#4f46e5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '0.8em',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: isAiEditing || !aiEditInstruction.trim() ? 0.5 : 1,
                      }}
                    >
                      {isAiEditing ? 'Procesando...' : '✨ Aplicar'}
                    </button>
                  </div>
                </div>
              )}
            </div>,
            portalNode,
          )}
      </div>
    );
  },
);

LiveEditor.displayName = 'LiveEditor';

export default LiveEditor;
