/**
 * Channel marks for chats: a round badge per messaging channel, drawn in
 * currentColor so it follows the light/dark theme. No "use client".
 */

/** A small TikTok-ish note glyph, drawn in currentColor so it follows the theme. */
export function TikTokMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor">
        <path d="M16.5 3c.3 2.1 1.6 3.6 3.5 3.9v3a7 7 0 0 1-3.5-1.1v6.4A5.8 5.8 0 1 1 10.7 9.4v3.2a2.7 2.7 0 1 0 2.7 2.7V3h3.1Z" />
      </svg>
    </span>
  );
}

/** WhatsApp's speech-bubble mark, in WhatsApp green. */
export function WhatsAppMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="currentColor">
        <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm4.6 12.6c-.2.6-1.1 1.1-1.6 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.6 11.6 11.6 0 0 1-4.4-3.9c-.4-.5-1-1.5-1-2.8 0-1.3.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.6-.1 1.2Z" />
      </svg>
    </span>
  );
}
