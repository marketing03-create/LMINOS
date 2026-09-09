"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MobileTable } from "@/components/mobile/mobile-table";
import { NotEntered } from "@/components/mobile/not-entered";
import { RecordCard, RecordList } from "@/components/mobile/record-card";
import { Sheet } from "@/components/mobile/sheet";
import { StickyAction } from "@/components/mobile/sticky-action";

export type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  telegramPaired: boolean;
};

// LMIROS is TikTok-only now: an account is either an admin or a live streamer.
// (team_lead / sales_agent left with the leads/sales features.)
const ROLES = ["hq_admin", "marketing_manager", "live_streamer", "viewer"];

const selectCls =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs text-zinc-900 dark:text-zinc-100";

/**
 * The phone spells the role out; the desktop <select> keeps printing the raw
 * enum because P5 says its pixels may not move. Nobody fixing somebody's access
 * from a bus stop should have to decode `live_streamer`, and the two renderings
 * write the identical value — only the visible label differs.
 */
const ROLE_LABEL: Record<string, string> = {
  hq_admin: "HQ admin",
  marketing_manager: "Marketing manager",
  live_streamer: "Live streamer",
  sales_agent: "Sales agent",
  team_lead: "Team lead",
  viewer: "Viewer",
};

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

/**
 * The server accepts six roles; this screen has always offered four. That gap is
 * a live silent-rewrite bug: a `team_lead` row renders a <select> whose value
 * matches no <option>, the browser shows the first one instead, and a Save the
 * admin thought was about the name quietly changes their role.
 *
 * Widening the menu to all six is a product decision that belongs to the owner,
 * not to a layout pass, so the menu stays four — but the row's OWN role is
 * appended when it is not in the list. The select then always shows the truth,
 * and an admin who changes nothing writes back what was already there.
 */
function roleOptionsFor(current: string): string[] {
  return ROLES.includes(current) ? ROLES : [...ROLES, current];
}

export function UsersEditor({
  rows,
  currentUserId,
}: {
  rows: UserRow[];
  currentUserId: string | null;
}) {
  return (
    <MobileTable
      // No escape hatch here, unlike the streamer grid. There the wide table
      // genuinely answers a question the cards answer worse; here it is the
      // reported bug — Save and Remove sit in column 6 of a 640px table inside
      // a 375px viewport — so offering it back would be offering the bug back.
      allowEscape={false}
      table={<UsersTable rows={rows} currentUserId={currentUserId} />}
      cards={<UsersCardList rows={rows} currentUserId={currentUserId} />}
    />
  );
}

/* ------------------------------------------------------------------ desktop */

function UsersTable({
  rows,
  currentUserId,
}: {
  rows: UserRow[];
  currentUserId: string | null;
}) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-left">
          <tr>
            <Th>Email</Th>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Active</Th>
            <Th>Telegram</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                No users yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <Row key={r.id} r={r} isSelf={r.id === currentUserId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ r, isSelf }: { r: UserRow; isSelf: boolean }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(r.fullName ?? "");
  const [role, setRole] = useState(r.role);
  const [active, setActive] = useState(r.isActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameOrig = r.fullName ?? "";
  const dirty =
    fullName.trim() !== nameOrig || role !== r.role || active !== r.isActive;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          role,
          isActive: active,
        }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "Failed");
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${r.email}? They lose access immediately.`)) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${r.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) setErr(json.error ?? "Failed");
      else router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-900">
      <td className="px-4 py-2.5 font-mono text-xs">{r.email}</td>
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="—"
          maxLength={120}
          className="w-full max-w-[220px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </td>
      <td className="px-4 py-2.5">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
          {roleOptionsFor(r.role).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-4 py-2.5">{r.telegramPaired ? "✓" : "—"}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {err && <span className="text-xs text-red-500 mr-2">{err}</span>}
        {dirty && (
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 px-3 py-1 text-xs font-medium disabled:opacity-50 mr-2"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
        {isSelf ? (
          <span className="text-xs text-zinc-400">you</span>
        ) : (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{children}</th>
  );
}

/* ------------------------------------------------------------------- mobile */

type Draft = { fullName: string; role: string; active: boolean };

function draftFor(r: UserRow, drafts: Record<string, Draft>): Draft {
  return (
    drafts[r.id] ?? {
      fullName: r.fullName ?? "",
      role: r.role,
      active: r.isActive,
    }
  );
}

/** Deliberately the same three comparisons the table row has always used. */
function isDirty(r: UserRow, d: Draft): boolean {
  return (
    d.fullName.trim() !== (r.fullName ?? "") ||
    d.role !== r.role ||
    d.active !== r.isActive
  );
}

const FIELD =
  "h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const BTN =
  "flex h-12 w-full items-center justify-center rounded-xl text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 disabled:opacity-50";

const CHIP: Record<"zinc" | "amber" | "emerald", string> = {
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function Chip({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: keyof typeof CHIP;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The phone rendering of the six-column table, and the fix for the finding that
 * made this route unusable: Save lived in column 6 of a `min-w-[640px]` grid, so
 * on a 375px screen an admin could change a role and never see a Save at all —
 * while the page copy above cheerfully claimed changes save immediately. It does
 * not auto-save, and it never did.
 *
 * So the edit controls move into a sheet and the Save moves OUT of the card
 * entirely, onto the route's one `StickyAction`, which appears the moment
 * anything is pending and names who it is about. A save you cannot lose is worth
 * more here than a save that is one tap closer.
 *
 * Drafts live at this level rather than inside each card for exactly that
 * reason: the bar has to know what is outstanding across the whole list, and
 * `StickyAction` is one-per-route by rule.
 */
function UsersCardList({
  rows,
  currentUserId,
}: {
  rows: UserRow[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2600);
    return () => clearTimeout(t);
  }, [saved]);

  const dirtyRows = rows.filter((r) => isDirty(r, draftFor(r, drafts)));

  // Filtering is over the rows the server already sent — no request, no param.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        (r.fullName ?? "").toLowerCase().includes(q) ||
        roleLabel(r.role).toLowerCase().includes(q)
    );
  }, [rows, query]);

  const editing = editingId ? rows.find((r) => r.id === editingId) ?? null : null;
  const confirming = confirmId ? rows.find((r) => r.id === confirmId) ?? null : null;

  function patchDraft(r: UserRow, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [r.id]: { ...draftFor(r, prev), ...patch } }));
  }

  function forget(id: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveDirty() {
    if (dirtyRows.length === 0) return;
    setSaving(true);
    setSaved(false);
    const failed: Record<string, string> = {};
    const done: string[] = [];
    for (const r of dirtyRows) {
      const d = draftFor(r, drafts);
      try {
        const res = await fetch(`/api/admin/users/${r.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fullName: d.fullName.trim(),
            role: d.role,
            isActive: d.active,
          }),
        });
        // An auth failure comes back as text/plain, so this throws rather than
        // returning `{ok:false}` — the catch below is load-bearing, not padding.
        const json = await res.json();
        if (!json.ok) failed[r.id] = json.error ?? "Failed";
        else done.push(r.id);
      } catch (e) {
        failed[r.id] = e instanceof Error ? e.message : String(e);
      }
    }
    setErrors(failed);
    if (done.length > 0) {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of done) delete next[id];
        return next;
      });
      router.refresh();
    }
    setSaved(done.length > 0 && Object.keys(failed).length === 0);
    setSaving(false);
  }

  async function remove(r: UserRow) {
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/users/${r.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) {
        setErrors((prev) => ({ ...prev, [r.id]: json.error ?? "Failed" }));
      } else {
        forget(r.id);
        setErrors((prev) => {
          const next = { ...prev };
          delete next[r.id];
          return next;
        });
        setEditingId(null);
        router.refresh();
      }
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [r.id]: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setRemoving(false);
      setConfirmId(null);
    }
  }

  const editDraft = editing ? draftFor(editing, drafts) : null;
  const showBar = dirtyRows.length > 0 || saving || saved;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">Search users</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or name"
          className={FIELD}
        />
      </label>

      {rows.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-zinc-500">No users yet.</p>
      ) : visible.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm leading-relaxed text-zinc-500">
          No user matches “{query.trim()}”.
        </p>
      ) : (
        <RecordList>
          {visible.map((r) => {
            const d = draftFor(r, drafts);
            const dirty = isDirty(r, d);
            const err = errors[r.id];
            const isSelf = r.id === currentUserId;
            return (
              <RecordCard
                key={r.id}
                onClick={() => setEditingId(r.id)}
                tone={dirty ? "warn" : "neutral"}
                title={<span className="break-all text-base">{r.email}</span>}
                meta={d.fullName.trim() ? d.fullName.trim() : <NotEntered />}
                status={dirty ? { label: "Unsaved", tone: "amber" } : undefined}
                badges={
                  <>
                    <Chip>{roleLabel(d.role)}</Chip>
                    {!d.active && <Chip tone="amber">Inactive</Chip>}
                    {isSelf && <Chip>You</Chip>}
                    {r.telegramPaired && <Chip tone="emerald">Telegram</Chip>}
                  </>
                }
                // Errors belong on the card, not in the old `whitespace-nowrap`
                // actions cell, which pushed the row further off-screen at the
                // one moment the admin most needed to read something.
                footer={
                  err ? (
                    <span className="break-words text-red-600 dark:text-red-400">
                      {err}
                    </span>
                  ) : undefined
                }
              />
            );
          })}
        </RecordList>
      )}

      {showBar && (
        <StickyAction
          // The email goes on the status line, not into the button label. The
          // label sits in a fixed 48px box that cannot wrap, and
          // `marketing.03@enquirymail.com` is wider than a 375px screen once
          // "Save changes to " is in front of it — it would spill out of the
          // one control the whole redesign of this page exists to make findable.
          // The status line above it wraps, and says the same thing.
          label={
            dirtyRows.length > 1
              ? `Save changes to ${dirtyRows.length} users`
              : "Save changes"
          }
          onClick={saveDirty}
          busy={saving}
          disabled={dirtyRows.length === 0}
          status={
            saving
              ? "Saving…"
              : saved
                ? "Saved ✓"
                : dirtyRows.length === 1
                  ? `Unsaved changes to ${dirtyRows[0].email}`
                  : null
          }
          secondary={
            dirtyRows.length > 0
              ? {
                  label: "Undo",
                  onClick: () => {
                    setDrafts({});
                    setErrors({});
                  },
                }
              : undefined
          }
        />
      )}

      {editing && editDraft && (
        <Sheet
          open
          onClose={() => setEditingId(null)}
          title={editing.email}
          footer={
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className={`${BTN} bg-zinc-900 text-white active:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:active:bg-zinc-200`}
            >
              Done
            </button>
          }
        >
          <div className="space-y-5 py-1">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Name</span>
              <input
                type="text"
                value={editDraft.fullName}
                maxLength={120}
                onChange={(e) => patchDraft(editing, { fullName: e.target.value })}
                className={FIELD}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Role</span>
              <select
                value={editDraft.role}
                onChange={(e) => patchDraft(editing, { role: e.target.value })}
                className={FIELD}
              >
                {roleOptionsFor(editing.role).map((x) => (
                  <option key={x} value={x}>
                    {roleLabel(x)}
                  </option>
                ))}
              </select>
            </label>

            {/* A 14px checkbox is a coin toss with a thumb, and the thing it
                controls is whether a person can sign in at all. The whole row
                is the target, and the words say which way it is set — a green
                pill alone is colour-only. */}
            <button
              type="button"
              role="switch"
              aria-checked={editDraft.active}
              onClick={() => patchDraft(editing, { active: !editDraft.active })}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-zinc-300 px-3 py-2 text-left active:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:active:bg-zinc-800"
            >
              <span className="min-w-0">
                <span className="block text-base font-medium">Active</span>
                <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                  {editDraft.active ? "Can sign in" : "No access"}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  editDraft.active
                    ? "bg-blue-600"
                    : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
                    editDraft.active ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            {errors[editing.id] && (
              <p className="break-words text-sm leading-relaxed text-red-600 dark:text-red-400">
                {errors[editing.id]}
              </p>
            )}

            {/* Remove is not a sibling of Save — Save is not even on this sheet.
                It sits below a rule with 24px of air above it, and it opens a
                second sheet rather than acting, so the destructive tap is never
                the tap that ends the edit. */}
            {!(editing.id === currentUserId) && (
              <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setConfirmId(editing.id)}
                  className={`${BTN} border border-red-300 text-red-600 active:bg-red-50 dark:border-red-900 dark:text-red-400 dark:active:bg-red-950/30`}
                >
                  Remove user
                </button>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {confirming && (
        <Sheet
          open
          onClose={() => setConfirmId(null)}
          title="Remove user?"
          footer={
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => remove(confirming)}
                disabled={removing}
                className={`${BTN} bg-red-600 text-white active:bg-red-700`}
              >
                {removing ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                disabled={removing}
                className={`${BTN} border border-zinc-300 text-zinc-700 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800`}
              >
                Cancel
              </button>
            </div>
          }
        >
          <p className="break-words py-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Remove {confirming.email}? They lose access immediately.
          </p>
        </Sheet>
      )}
    </div>
  );
}
