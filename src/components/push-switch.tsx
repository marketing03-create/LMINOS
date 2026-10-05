"use client";

import { useEffect, useState } from "react";

/** Fetched from the server at runtime, not inlined at build — see /api/push/key. */
async function publicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/key", { cache: "no-store" });
    const json = (await res.json()) as { key?: string | null };
    return json.key ?? null;
  } catch {
    return null;
  }
}

type State =
  | "hidden" // nothing to show: on, unsupported, or not configured
  | "off" // can be turned on with a tap
  | "install" // iPhone in Safari: push only exists once added to the Home Screen
  | "blocked"; // the person said no; only phone settings can undo that

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok;
}

/**
 * The one-time "Turn on notifications" for this phone.
 *
 * It renders only while there is something to do. Once notifications are on it
 * disappears; if permission was already granted (a reinstall, a new login on
 * the same phone) the device is re-saved silently with no card at all. The
 * permission prompt itself can only be raised from a tap, which is the whole
 * reason this is a button and not something that happens on load.
 *
 * iPhones only support web notifications from an app added to the Home
 * Screen, so in a Safari tab the card says how to do that instead.
 */
export function PushSwitch() {
  const [state, setState] = useState<State>("hidden");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const set = (s: State) => !cancelled && setState(s);
      const key = await publicKey();
      if (!key || cancelled) return;
      setVapidKey(key);

      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as { standalone?: boolean }).standalone === true;
        set(iOS && !standalone ? "install" : "hidden");
        return;
      }

      if (Notification.permission === "denied") return set("blocked");

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission === "granted") {
          // Already allowed: make sure this device is (still) saved, quietly.
          const sub =
            (await reg.pushManager.getSubscription()) ??
            (await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: keyBytes(key),
            }));
          await save(sub);
          return set("hidden");
        }
        set("off");
      } catch {
        set("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    if (!vapidKey) return;
    setBusy(true);
    setErr(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(vapidKey),
        }));
      if (!(await save(sub))) {
        setErr("Couldn't save this phone. Try again.");
        return;
      }
      setState("hidden");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (state === "hidden") return null;

  return (
    <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {state === "off" && (
        <>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[15px] font-medium text-white transition-colors active:bg-blue-700 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
          >
            <span aria-hidden="true">🔔</span>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
          {err && (
            <p role="status" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {err}
            </p>
          )}
        </>
      )}
      {state === "install" && (
        <p className="text-sm leading-relaxed">
          <span aria-hidden="true">🔔 </span>
          For notifications, tap <b>Share</b> → <b>Add to Home Screen</b>, then open
          LMIROS from there.
        </p>
      )}
      {state === "blocked" && (
        <p className="text-sm leading-relaxed">
          <span aria-hidden="true">🔕 </span>
          Notifications are blocked for LMIROS. Allow them in your phone&apos;s
          settings.
        </p>
      )}
    </section>
  );
}
