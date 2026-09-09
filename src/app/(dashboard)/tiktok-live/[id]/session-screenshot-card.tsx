"use client";

import { useRef, useState } from "react";

/**
 * "Add screenshots" — the camera half of the session page, and ONLY that half.
 *
 * It used to be a second, complete editing surface: it read the photos AND
 * rendered its own fourteen number boxes AND posted its own save. The session
 * page therefore offered every metric twice, in two boxes that disagreed the
 * moment you typed in one of them, and the two lead numbers a streamer actually
 * opens this page for (Total / Filtered Leads) appeared in neither of them —
 * which is why this file used to end with a sentence apologising for that and
 * pointing downwards.
 *
 * So the inputs and the save button are gone from here. This component now
 * does one thing: turn photos into a `ReadGroup` and hand it to the page, which
 * drops the numbers into the one metrics list as pending edits. The trade-off is
 * that the read is no longer confirmable in place — you check the numbers where
 * they will be saved instead of where they were read. That is the point: there
 * is only one list, so there is only one place a number can be wrong.
 *
 * Two things deliberately stay:
 *
 * 1. IT ONLY FILLS, NEVER CLEARS. We report exactly the keys the AI returned;
 *    a metric the screenshot didn't show is never mentioned, so it keeps
 *    whatever is stored. Clearing a number is the metrics list's job.
 * 2. THE READ IS FROZEN. What comes back goes up untouched, so the page can
 *    send it as `screenshotValues` byte-for-byte and the apply route can still
 *    tell an honest import from a hand-edited figure.
 */

export type ReadGroup = {
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  values: Record<string, number>;
  conflicts?: string[];
};

// Shrink a screenshot in the browser BEFORE uploading. Claude's vision resizes
// anything over ~1568px on the long edge server-side anyway, so sending a full
// phone screenshot (2–3 MB) just wastes upload time — and this card is the one
// place in the app where the upload is ALWAYS from a phone, straight off the
// camera roll, minutes after a live, often on mobile data. The importer has had
// this since day one; the card that needs it most did not. Falls back to the
// original file on any error / if the re-encode wouldn't actually be smaller.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

async function downscaleForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 600_000) return file; // already small — skip re-encode
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // White backing so a transparent PNG doesn't turn black once it's JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file; // no gain — keep original
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function SessionScreenshotCard({
  sessionId,
  aiConfigured,
  active,
  disabled,
  onRead,
  onDiscard,
}: {
  sessionId: string;
  /** Screenshot reading needs AI_GATEWAY_API_KEY; without it the card stays dark. */
  aiConfigured: boolean;
  /** True while the page is holding a read from here — turns Read into Discard. */
  active: boolean;
  /** The page is saving; nothing here should start a second job mid-flight. */
  disabled?: boolean;
  onRead: (group: ReadGroup, fileCount: number) => void;
  onDiscard: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function clearFiles() {
    setFiles([]);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function discard() {
    clearFiles();
    onDiscard();
  }

  async function readScreenshots() {
    if (!files.length) return;
    setReading(true);
    setErr(null);
    try {
      const prepared = await Promise.all(files.map(downscaleForUpload));
      const fd = new FormData();
      prepared.forEach((f) => fd.append("images", f));
      const res = await fetch("/api/tiktok-live/sessions/screenshots", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        setErr(json.error ?? `Couldn't read the screenshots (${res.status}).`);
        return;
      }
      const groups = (json.groups ?? []) as ReadGroup[];
      // The live is already known, so matching is irrelevant — take the group
      // that actually carries numbers.
      const g =
        groups.find((x) => Object.keys(x.values ?? {}).length > 0) ?? groups[0];
      if (!g || Object.keys(g.values ?? {}).length === 0) {
        setErr("No numbers could be read from those images. Try a clearer screenshot.");
        return;
      }
      onRead(g, files.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  const busy = reading || !!disabled;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      {/* 17px on a phone, today's 14px uppercase label from `lg` up — the size
          is the only thing that moves, so the desktop card measures the same. */}
      <h2 className="text-[17px] font-semibold text-zinc-900 lg:text-sm lg:font-semibold lg:uppercase lg:tracking-wider lg:text-zinc-500 dark:text-zinc-100 dark:lg:text-zinc-500">
        Add screenshots
      </h2>

      {!aiConfigured ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Automatic screenshot reading is <b>OFF</b> right now — type the numbers
          into <b>Session metrics</b> instead. It saves exactly the same way.
        </div>
      ) : (
        <>
          {/* The read is an async job with no focus change, so a failure has to
              be announced — otherwise a screen-reader user taps "Read", waits,
              and gets silence whether it worked or not. */}
          {err && (
            <div
              role="status"
              aria-live="polite"
              className="my-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            >
              {err}
            </div>
          )}

          <div className="mt-3">
            {/* h-40 dashed target: on a phone this opens Camera / Photo Library,
                and it is the whole card width because the thumb that taps it has
                just come off a live. */}
            <label
              htmlFor={`shots-${sessionId}`}
              className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-4 text-center transition-colors active:bg-zinc-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/40 dark:border-zinc-700 dark:active:bg-zinc-900"
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-400"
                aria-hidden="true"
              >
                <path d="M14.5 4h-5L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-3l-2.5-3Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="text-base font-medium text-zinc-700 dark:text-zinc-200">
                {files.length
                  ? `${files.length} photo${files.length === 1 ? "" : "s"} selected`
                  : "Take or choose screenshots"}
              </span>
              {/* The input lives INSIDE its own label. It has to: it is
                  `sr-only`, so its focus ring is clipped to a 1px box, and the
                  only visible focus cue is the dropzone's `focus-within:`
                  ring — which a sibling input can never trigger. Tabbed to
                  from outside the label, the control was previously focused
                  with nothing on screen saying so (WCAG 2.4.7). */}
              <input
                id={`shots-${sessionId}`}
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  setErr(null);
                }}
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={readScreenshots}
                disabled={!files.length || busy}
                aria-busy={reading || undefined}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-base font-medium text-white transition-colors active:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 sm:w-auto"
              >
                {reading
                  ? "Reading…"
                  : files.length
                    ? `Read ${files.length} photo${files.length === 1 ? "" : "s"}`
                    : "Read screenshots"}
              </button>
              {/* Two different undos, and they are not the same one. `Clear`
                  drops photos that have not been read yet; `Discard` also puts
                  every number in the list back the way it was found. Naming both
                  "Clear" is how someone loses a correction they had already
                  typed over the read. */}
              {active ? (
                <button
                  type="button"
                  onClick={discard}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
                >
                  Discard read numbers
                </button>
              ) : (
                files.length > 0 &&
                !reading && (
                  <button
                    type="button"
                    onClick={clearFiles}
                    className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 active:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
                  >
                    Clear
                  </button>
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
