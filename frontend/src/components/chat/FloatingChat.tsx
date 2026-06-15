import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatWindow } from './ChatWindow';

export interface FloatingChatProps {
  positionId: string;
}

const MIN_W = 320;
const MIN_H = 360;
const DEFAULT_W = 400;
const DEFAULT_H = Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600, 600);

/**
 * Floating chat assistant: a bubble FAB that toggles a docked chat panel.
 * When open the FAB hides; closing brings it back. History persists server-side
 * (ChatWindow loads it via React Query), so toggling never loses the conversation.
 */
export function FloatingChat({ positionId }: FloatingChatProps) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Panel is anchored bottom-right, so dragging the top-left grip up/left grows it.
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [size],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    const start = resizeRef.current;
    if (!start) return;
    const maxW = window.innerWidth - 48;
    const maxH = window.innerHeight - 48;
    setSize({
      w: Math.min(Math.max(start.w + (start.x - e.clientX), MIN_W), maxW),
      h: Math.min(Math.max(start.h + (start.y - e.clientY), MIN_H), maxH),
    });
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent) => {
    resizeRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(true)}
            aria-label="Open chat assistant"
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg hover:bg-brand-700"
          >
            💬
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            style={{ width: size.w, height: size.h }}
            className="fixed bottom-6 right-6 z-40 flex max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-label="Chat assistant"
          >
            {/* Resize grip — top-left corner */}
            <div
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              role="separator"
              aria-label="Resize chat window"
              title="Drag to resize"
              className="absolute left-0 top-0 z-10 h-5 w-5 cursor-nwse-resize"
            >
              <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-tl border-l-2 border-t-2 border-white/70" />
            </div>
            <div className="flex items-center justify-between bg-brand-600 px-4 py-2 pl-6 text-white">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden>💬</span> Chat Assistant
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Minimize chat"
                title="Minimize"
                className="rounded-md px-2 py-0.5 text-lg leading-none hover:bg-white/20"
              >
                ⌄
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-slate-50">
              <ChatWindow positionId={positionId} headerless />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
