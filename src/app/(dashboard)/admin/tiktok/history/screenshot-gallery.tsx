"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared lightbox for the screenshot-history page. All thumbnails belong to ONE
 * gallery, so once an image is open the admin can move to the next/previous
 * upload without closing and reopening:
 *   • ‹ › buttons on screen
 *   • ← → arrow keys
 *   • swipe left/right on touch
 * Escape / backdrop / ✕ closes. A caption states whose upload is shown and a
 * counter (e.g. "3 / 26") keeps the position obvious.
 */

export type GalleryItem = {
  /** Signed image URL; undefined if the file couldn't be signed. */
  url?: string;
  /** One-line caption: uploader · time · handle. */
  caption?: string;
};

const GalleryCtx = createContext<{
  openAt: (index: number) => void;
} | null>(null);

export function ScreenshotGallery({
  items,
  children,
}: {
  items: GalleryItem[];
  children: ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);

  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (dir: 1 | -1) =>
      setIndex((cur) => {
        if (cur == null) return cur;
        const next = cur + dir;
        return next < 0 || next >= items.length ? cur : next;
      }),
    [items.length]
  );

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the lightbox is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, close, step]);

  const item = index == null ? null : items[index];

  return (
    <GalleryCtx.Provider value={{ openAt: setIndex }}>
      {children}

      {index != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot viewer"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start == null || end == null) return;
            const dx = end - start;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 text-3xl leading-none text-white/80 hover:text-white"
          >
            ×
          </button>

          {/* Previous */}
          {index > 0 && (
            <button
              type="button"
              aria-label="Previous screenshot"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-3xl leading-none text-white/90 backdrop-blur hover:bg-white/25 sm:left-5"
            >
              ‹
            </button>
          )}

          {/* Next */}
          {index < items.length - 1 && (
            <button
              type="button"
              aria-label="Next screenshot"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-3xl leading-none text-white/90 backdrop-blur hover:bg-white/25 sm:right-5"
            >
              ›
            </button>
          )}

          <div
            className="flex max-h-full flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {item?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={item.caption ?? "TikTok LIVE screenshot"}
                className="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <div className="grid h-60 w-60 place-items-center rounded-lg border border-white/20 text-sm text-white/70">
                image unavailable
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 text-xs text-white/80">
              <span className="tabular-nums">
                {index + 1} / {items.length}
              </span>
              {item?.caption && (
                <span className="max-w-[70vw] truncate">{item.caption}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </GalleryCtx.Provider>
  );
}

/** Thumbnail that opens the shared gallery at its own position. */
export function ScreenshotThumb({
  index,
  url,
  alt = "TikTok LIVE screenshot",
}: {
  index: number;
  url: string | undefined;
  alt?: string;
}) {
  const ctx = useContext(GalleryCtx);

  if (!url) {
    return (
      <div className="grid h-40 w-40 place-items-center rounded-lg border border-zinc-200 text-xs text-zinc-400 dark:border-zinc-800">
        image unavailable
      </div>
    );
  }

  return (
    <button type="button" onClick={() => ctx?.openAt(index)} className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="h-40 w-40 cursor-zoom-in rounded-lg border border-zinc-200 bg-zinc-50 object-cover transition-opacity hover:opacity-90 dark:border-zinc-800 dark:bg-zinc-900"
      />
    </button>
  );
}
