"use client";

import {
  Children,
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
 *
 * Everything below `lg` in here was sized for a cursor. The ✕ was ~30px of
 * glyph with no box around it, the ‹ › pair was ~38px wide, and the caption —
 * the only thing that says *whose* upload you are staring at — was truncated to
 * 70vw, which on a 375px phone deletes the timestamp and usually the handle
 * too. All three are real 44px targets now, with `active:` feedback, and the
 * caption wraps instead of clipping (§2.1: a caveat is never truncated).
 *
 * The close button is offset by `env(safe-area-inset-top)` rather than a flat
 * `top-4`: the app declares viewportFit "cover" with a black-translucent status
 * bar, so in PWA standalone on a notched phone a `top-4` ✕ sits partly under
 * the notch — on the one control that gets you out of a full-screen overlay.
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

/** 44px box, translucent fill, press state. Shared by ✕ and the two arrows. */
const OVERLAY_BTN =
  "inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 leading-none text-white/90 backdrop-blur transition-colors hover:bg-white/25 active:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

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
            className={`absolute right-3 z-10 ${OVERLAY_BTN}`}
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
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
              className={`absolute left-2 top-1/2 z-10 -translate-y-1/2 text-3xl sm:left-5 ${OVERLAY_BTN}`}
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
              className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 text-3xl sm:right-5 ${OVERLAY_BTN}`}
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
                /* 74vh below `sm` leaves the ✕ and a wrapping caption their own
                   room on a 667px-tall phone; from `sm` up the image keeps
                   exactly the 82vh it has always had. */
                className="max-h-[74vh] max-w-[90vw] rounded-lg object-contain shadow-2xl sm:max-h-[82vh]"
              />
            ) : (
              <div className="grid h-60 w-60 place-items-center rounded-lg border border-white/20 text-sm text-white/70">
                image unavailable
              </div>
            )}
            <div className="mt-3 flex max-w-[90vw] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-white/80">
              <span className="tabular-nums">
                {index + 1} / {items.length}
              </span>
              {item?.caption && <span className="break-words">{item.caption}</span>}
            </div>
          </div>
        </div>
      )}
    </GalleryCtx.Provider>
  );
}

/**
 * Portrait below `lg`, square from `lg` up. A TikTok LIVE screenshot is a phone
 * screen — roughly 9:20 — and `h-40 w-40 object-cover` crops that to a centre
 * band showing neither the tab header nor the figures, so on a phone every row
 * had to be opened in the lightbox before it told you anything at all. A 3:4
 * crop anchored to the top shows the tab title and the first numbers, which is
 * enough to recognise an upload. The `lg:` half hands the laptop back today's
 * exact 160px square, framing and all.
 */
const THUMB_BOX =
  "aspect-[3/4] w-24 rounded-lg border border-zinc-200 lg:aspect-auto lg:h-40 lg:w-40 dark:border-zinc-800";

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
      <div
        className={`grid shrink-0 place-items-center text-sm text-zinc-400 lg:text-xs ${THUMB_BOX}`}
      >
        image unavailable
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => ctx?.openAt(index)}
      className="block shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
    >
      {/* The history page now renders this twice per upload — once in the
          `lg:hidden` card, once in the `hidden lg:block` row — and a `display:
          none` image is still fetched eagerly, so 200 uploads would pull 400
          full screenshots on both clients. `lazy` is what makes the sibling
          pattern free here: a browser skips a lazy image with no layout box,
          and loads the rest as they are scrolled to. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`cursor-zoom-in bg-zinc-50 object-cover object-top transition-opacity hover:opacity-90 active:opacity-75 lg:object-center dark:bg-zinc-900 ${THUMB_BOX}`}
      />
    </button>
  );
}

export type UploadMeta = {
  key: string;
  /** Did a saved value drift from what the AI read? Drives the default filter. */
  changed: boolean;
};

const PAGE = 25;

/**
 * The phone-side controller for the upload list, and the reason it lives in
 * this file rather than a new one: the cards it shows are rendered by the
 * *server* page (200 rows × 14 fields), so this can only ever be a wrapper that
 * decides which of the already-rendered children to show. Handing it the rows
 * instead would serialise the whole query a second time for the privilege of
 * hiding most of it — the same argument `MobileTable` makes, and the same
 * shape: the server renders, the client chooses. One boolean per row is all
 * that crosses the boundary.
 *
 * It defaults to **Changed**, not All, because that is the page's entire job:
 * find a screenshot whose saved numbers no longer match what it showed. In a
 * normal week that is two rows out of two hundred, and hunting for them by
 * scrolling is the work the page hands the admin today.
 *
 * "Show 25 more" pages over rows the server already sent, so there is no query,
 * no endpoint and no `?page=` in the URL to keep in step with `?handle`.
 */
export function UploadFilter({
  meta,
  children,
}: {
  meta: UploadMeta[];
  children: ReactNode;
}) {
  const [mode, setMode] = useState<"changed" | "all">("changed");
  const [shown, setShown] = useState(PAGE);

  const all = Children.toArray(children);
  const changedCount = meta.filter((m) => m.changed).length;
  const visible =
    mode === "all" ? all : all.filter((_, i) => meta[i]?.changed === true);
  const page = visible.slice(0, shown);

  // Paging resets with the filter. Switching to "All" while 25 rows are already
  // unfolded would otherwise show a slice of a different list, which reads as
  // rows having gone missing rather than as a filter change.
  const pick = (next: "changed" | "all") => {
    setMode(next);
    setShown(PAGE);
  };

  const seg = (active: boolean) =>
    `min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      active
        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
        : "text-zinc-500 active:bg-zinc-200/60 dark:text-zinc-400 dark:active:bg-zinc-800/60"
    }`;

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Filter uploads"
        className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900"
      >
        <button
          type="button"
          onClick={() => pick("changed")}
          aria-pressed={mode === "changed"}
          className={seg(mode === "changed")}
        >
          Changed ({changedCount})
        </button>
        <button
          type="button"
          onClick={() => pick("all")}
          aria-pressed={mode === "all"}
          className={seg(mode === "all")}
        >
          All ({all.length})
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {mode === "changed"
            ? "No saved numbers differ from their screenshot here."
            : "No screenshots uploaded yet."}
        </p>
      ) : (
        <>
          <div className="space-y-3">{page}</div>
          {page.length < visible.length && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-blue-600 active:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:active:bg-blue-950/40"
              >
                Show {Math.min(PAGE, visible.length - page.length)} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
