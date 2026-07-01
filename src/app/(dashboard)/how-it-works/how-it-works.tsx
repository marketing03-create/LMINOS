"use client";

import { useState } from "react";

type Block =
  | { kind: "para"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "flow"; items: string[] }
  | { kind: "note"; text: string }
  | { kind: "tip"; text: string }
  | { kind: "warn"; text: string };

type Tab = {
  id: string;
  icon: string;
  label: string;
  title: string;
  summary: string;
  blocks: Block[];
};

const TABS: Tab[] = [
  {
    id: "start",
    icon: "🚀",
    label: "Start here",
    title: "Start here — the big picture",
    summary: "What LMIROS is, and the one idea to remember.",
    blocks: [
      {
        kind: "para",
        text: "LMIROS is your control room. It connects your ads, your websites, your agents and your sales into one place — so you can see, in real time, where your leads come from and which ones actually make money.",
      },
      { kind: "para", text: "The whole business runs on one simple flow:" },
      {
        kind: "flow",
        items: ["Ad / TikTok", "Customer enquiry", "Lead in LMIROS", "Agent follows up", "Won 💰 or Rejected"],
      },
      {
        kind: "para",
        text: "Everything else in the menu is just a different view of that same flow — by website, by agent, by ad account, or by time of day.",
      },
      {
        kind: "bullets",
        items: [
          "The left menu is split into two: Operations (for everyone) and Admin (for managers).",
          "Numbers update on their own — ad data syncs daily, sales sync every few minutes.",
        ],
      },
      {
        kind: "tip",
        text: "New here? Read these tabs top to bottom once. After that you'll know exactly where to click for anything.",
      },
    ],
  },
  {
    id: "leads",
    icon: "📥",
    label: "Leads & Rejected pool",
    title: "Leads & the Rejected pool",
    summary: "How an enquiry becomes a lead — and why some go to the rejected pool.",
    blocks: [
      { kind: "para", text: "A lead is created in two ways:" },
      {
        kind: "bullets",
        items: [
          "A customer fills in a form on one of your websites, or",
          "A customer messages your WhatsApp directly and the agent logs it.",
        ],
      },
      {
        kind: "para",
        text: "Every new lead is automatically checked for duplicates, tagged with its website and loan type, and routed to the right team to follow up.",
      },
      {
        kind: "flow",
        items: ["Ad click", "Website form", "LMIROS checks + routes", "Team follows up"],
      },
      {
        kind: "para",
        text: "Not every lead is workable. When one can't proceed, it moves to the Rejected pool with a clear reason, for example:",
      },
      {
        kind: "bullets",
        items: [
          "Out of coverage (outside your service area)",
          "Not eligible, or the wrong loan type",
          "Unreachable, or low quality",
        ],
      },
      {
        kind: "para",
        text: "The Rejected pool is not a dead end — those leads can be recycled later or marked for resale, so no enquiry is wasted.",
      },
      { kind: "tip", text: "Find these under Operations → Leads and Operations → Rejected pool." },
    ],
  },
  {
    id: "sales",
    icon: "💰",
    label: "Sales & Real ROAS",
    title: "Sales & Real ROAS",
    summary: "How a closed deal is recorded, and what 'Real ROAS' actually means.",
    blocks: [
      { kind: "para", text: "When an agent closes a loan, it's recorded one of two ways:" },
      {
        kind: "bullets",
        items: [
          "The agent types one line in Telegram:  /sale <phone> <amount>  (also works: /close, /won, /deal).",
          "Or it flows in automatically from your Zoho sheet.",
        ],
      },
      {
        kind: "para",
        text: "The sale is credited to the agent who closed it and linked back to the original lead and website.",
      },
      {
        kind: "para",
        text: "Real ROAS = money you made ÷ money you spent on ads. For example RM 27,700 earned ÷ RM 9,500 spent = 2.9×. It's the truest test of whether an ad is worth it, because it's built from real approved loans — not the ad platform's guesses.",
      },
      {
        kind: "note",
        text: "There's also Lead Quality % = real approved loans ÷ what the ad platform claims converted. A low number means the ads bring clicks that don't turn into real loans.",
      },
      { kind: "tip", text: "Find these under Operations → Real ROAS and Operations → Sales." },
    ],
  },
  {
    id: "trends",
    icon: "📈",
    label: "Trends & Golden hour",
    title: "Trends & the Golden hour",
    summary: "Where the charts come from, and how to find your best time to advertise.",
    blocks: [
      {
        kind: "para",
        text: "Every day LMIROS pulls your Google Ads numbers (spend, clicks, conversions) and stores them. The Overview dashboard turns that history into simple charts over time.",
      },
      { kind: "flow", items: ["Google Ads", "Daily sync", "Stored in LMIROS", "Overview charts"] },
      {
        kind: "para",
        text: "The 'Best time of day' heatmap shows WHEN customers engage most — by hour, split into weekday vs weekend. Darker squares = busier.",
      },
      {
        kind: "bullets",
        items: [
          "Use it to raise budget and bids during the busy hours,",
          "and to have agents ready when enquiries peak.",
        ],
      },
      {
        kind: "note",
        text: "From your real data: engagement is a broad afternoon-to-evening plateau, peaking around 8–9pm — not late morning as often assumed.",
      },
      { kind: "tip", text: "Find this under Operations → Overview (charts + heatmap at the bottom)." },
    ],
  },
  {
    id: "websites",
    icon: "🌐",
    label: "Websites",
    title: "Websites — the hub",
    summary: "The stable unit that ties rotating ad accounts and an agent pool together.",
    blocks: [
      { kind: "para", text: "A 'website' is the stable centre of your business. Each website has:" },
      {
        kind: "bullets",
        items: [
          "one or more ad accounts feeding it traffic (these get suspended and replaced over time), and",
          "a pool of agents who work its leads.",
        ],
      },
      {
        kind: "para",
        text: "Because performance is tracked by the website (not the individual ad account), your history stays continuous even when one ad account is suspended and you add a fresh one.",
      },
      { kind: "para", text: "What you can do under Admin → Websites:" },
      {
        kind: "steps",
        items: [
          "Add or edit a website and its WhatsApp number.",
          "Add or remove agents in its pool.",
          "Mark an ad account 'Suspended' when Google blocks it.",
          "Add a replacement account to the same website — ROAS carries on with no gap.",
        ],
      },
      {
        kind: "tip",
        text: "Leads belong to the website's team, not one person — see the Agents tab for how credit works.",
      },
    ],
  },
  {
    id: "adaccounts",
    icon: "📊",
    label: "Ad accounts (Google)",
    title: "Ad accounts (Google Ads)",
    summary: "Three ways to connect Google Ads accounts, and what the numbers mean.",
    blocks: [
      {
        kind: "para",
        text: "LMIROS reads your Google Ads data (free) to show spend, clicks, CTR, conversions, top keywords and wasted spend for each account.",
      },
      { kind: "para", text: "Three ways to add accounts under Admin → Ad accounts:" },
      {
        kind: "bullets",
        items: [
          "Bulk import CSV — add 90+ accounts at once from a spreadsheet.",
          "Authorize Gmails — sign in once per Gmail to unlock all the accounts it owns.",
          "Add one — connect a single account by its Customer ID.",
        ],
      },
      {
        kind: "para",
        text: "After connecting, click 'Sync Google Ads now' (or just wait for the daily auto-sync) to pull the latest numbers.",
      },
      {
        kind: "para",
        text: "On each account you'll see a 'Wasted spend' list — search terms that cost money but got 0 sales. These are free, ready-made negative-keyword candidates you can block in Google Ads.",
      },
      {
        kind: "warn",
        text: "Adding an account asks you to sign in as the Gmail that owns it. Use an Incognito window so Google doesn't mix up multiple logins.",
      },
    ],
  },
  {
    id: "tiktok",
    icon: "🎥",
    label: "TikTok Live",
    title: "TikTok Live",
    summary: "Auto-track your live performance and capture keyword leads, hands-free.",
    blocks: [
      {
        kind: "para",
        text: "Set up once under Admin → TikTok Live: add your @handle and a keyword (for example 'lend' or 'pinjaman').",
      },
      {
        kind: "para",
        text: "An always-on helper watches your handle 24/7. The moment you go live it automatically:",
      },
      {
        kind: "bullets",
        items: [
          "records views, viewers, likes, comments, shares and duration, and",
          "captures every viewer who comments your keyword — your PM (private-message) worklist.",
        ],
      },
      {
        kind: "flow",
        items: ["You go live", "Helper auto-connects", "Records metrics + keyword leads", "Saved to LMIROS"],
      },
      {
        kind: "para",
        text: "After the live ends, open Operations → TikTok Live to see the session, the numbers, and the list of usernames to message.",
      },
      {
        kind: "note",
        text: "TikTok has no official live API, so this uses a free open-source connector. It only sees public chat, so it counts the keyword comment (which happens just before you DM the customer).",
      },
    ],
  },
  {
    id: "ai",
    icon: "🤖",
    label: "AI Ads Proposals",
    title: "AI Ads Proposals",
    summary: "Let Claude read your ad data and suggest exactly what to change.",
    blocks: [
      { kind: "para", text: "Two different things work together here:" },
      {
        kind: "bullets",
        items: [
          "Google Ads connection = the data (free) — it hands LMIROS your numbers.",
          "Claude AI = the thinking (a few cents per analysis) — it reads those numbers and writes the recommendations.",
        ],
      },
      { kind: "para", text: "How to use it under Admin → Ads Proposals:" },
      {
        kind: "steps",
        items: [
          "Pick an account and click 'Analyze account'.",
          "Claude returns a ranked list — add this negative keyword, pause that one, adjust this budget — each with a reason and a risk level.",
          "Approve the good ones, Reject the rest.",
          "For now, apply approved changes by hand in Google Ads (2 clicks each).",
        ],
      },
      {
        kind: "note",
        text: "When Google grants 'Basic access', Approve becomes one-click automatic — no changes needed on your side.",
      },
      {
        kind: "warn",
        text: "Nothing is ever sent to Google automatically. A human approves every change, and the AI can never spend your ad money.",
      },
    ],
  },
  {
    id: "agents",
    icon: "👥",
    label: "Agents & credit",
    title: "Agents & how credit works",
    summary: "Who gets credit for a sale, and how the leaderboard is ranked.",
    blocks: [
      {
        kind: "para",
        text: "Leads belong to a website's shared pool — not to one owner. This matches how your teams actually work day to day.",
      },
      {
        kind: "para",
        text: "Revenue is credited to whoever CLOSES the sale (the agent who runs /sale, or the closer named in Zoho). So the Agents leaderboard ranks people by real sales closed — not by who happened to receive the lead.",
      },
      { kind: "tip", text: "Find this under Operations → Agents." },
    ],
  },
  {
    id: "roles",
    icon: "🔒",
    label: "Who can do what",
    title: "Roles & safety",
    summary: "Who's allowed to change what — in one minute.",
    blocks: [
      { kind: "para", text: "LMIROS has roles:" },
      {
        kind: "bullets",
        items: [
          "Admins (HQ and marketing managers) can manage websites, ad accounts, money settings, and approve AI proposals.",
          "Agents and viewers can see the operations dashboards, but can't change settings or spend.",
        ],
      },
      {
        kind: "para",
        text: "Sensitive actions are locked to admins, your database is private, and every important change is recorded in the Audit log.",
      },
      {
        kind: "tip",
        text: "If a button says you don't have permission, you're on a non-admin account — ask HQ to upgrade your role.",
      },
    ],
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Tab rail */}
      <nav className="lg:w-64 shrink-0">
        <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
          {TABS.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                aria-current={on ? "page" : undefined}
                className={`shrink-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                  on
                    ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                <span aria-hidden>{t.icon}</span>
                <span className="whitespace-nowrap lg:whitespace-normal">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <article className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 p-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              {tab.icon}
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{tab.title}</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{tab.summary}</p>

          <div className="mt-5 border-t border-zinc-100 dark:border-zinc-900 pt-5 space-y-4">
            {tab.blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
        </article>

        <p className="mt-4 text-xs text-zinc-400">
          Still stuck? Ask HQ, or check Admin → Integrations and Audit log to see what's connected and what changed.
        </p>
      </div>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "para":
      return (
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {block.text}
        </p>
      );
    case "bullets":
      return (
        <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          {block.items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-400 shrink-0">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-2.5">
          {block.items.map((t, i) => (
            <li key={i} className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold">
                {i + 1}
              </span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
      );
    case "flow":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {block.items.map((t, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t}
              </span>
              {i < block.items.length - 1 && (
                <span className="text-zinc-400" aria-hidden>
                  →
                </span>
              )}
            </span>
          ))}
        </div>
      );
    case "note":
      return <Callout cls="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300" icon="ℹ️" text={block.text} />;
    case "tip":
      return <Callout cls="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300" icon="💡" text={block.text} />;
    case "warn":
      return <Callout cls="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" icon="⚠️" text={block.text} />;
  }
}

function Callout({ cls, icon, text }: { cls: string; icon: string; text: string }) {
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${cls}`}>
      <span aria-hidden>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
