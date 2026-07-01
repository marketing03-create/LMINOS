/**
 * Orchestrates the Account Builder's dry-run / build / revert against Google
 * Ads, using the stored `ad_build_steps` for one blueprint (Feature R).
 *
 * The whole account is sent as ONE atomic `:mutate` batch — the steps' temp
 * resource names (negative ids) link budget ← campaign ← ad group ← keyword/ad
 * within the single call, so a failed build creates nothing (no partial state).
 * Campaigns + ads are created PAUSED, so a successful build never spends until
 * a human un-pauses. `revert` tears a built account down in reverse order.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { adAccounts, adBlueprints, adBuildSteps } from "@/db/schema";
import { decryptToken } from "@/lib/crypto/envelope";
import {
  blueprintToBuildSteps,
  type Blueprint,
  type BuildStepKind,
} from "@/lib/ai/ads-planner-core";
import { getAccessTokenForRefreshToken } from "./auth";
import { ADS_WRITE_DISABLED_MESSAGE, adsWriteEnabled } from "./access";
import { removeOp, runMutate, substituteCid, type MutateOptions } from "./mutate";

type RunStep = {
  id: string;
  seq: number;
  kind: BuildStepKind;
  status: string;
  requestPayload: Record<string, unknown>;
  resourceName: string | null;
};

async function loadForRun(blueprintId: string) {
  const bp = await db.query.adBlueprints.findFirst({
    where: eq(adBlueprints.id, blueprintId),
    columns: { id: true, adAccountId: true },
  });
  if (!bp) throw new Error("Blueprint not found.");
  if (!bp.adAccountId) {
    throw new Error(
      "Link a Google Ads account to this website first — it's needed to validate/build."
    );
  }
  const account = await db.query.adAccounts.findFirst({
    where: eq(adAccounts.id, bp.adAccountId),
    columns: {
      id: true,
      externalAccountId: true,
      accessTokenEncrypted: true,
      platform: true,
    },
  });
  if (!account) throw new Error("Linked ad account not found.");
  if (account.platform !== "google") {
    throw new Error("Account Builder supports Google Ads accounts only.");
  }
  const stepRows = await db
    .select({
      id: adBuildSteps.id,
      seq: adBuildSteps.seq,
      kind: adBuildSteps.kind,
      status: adBuildSteps.status,
      requestPayload: adBuildSteps.requestPayload,
      resourceName: adBuildSteps.resourceName,
    })
    .from(adBuildSteps)
    .where(eq(adBuildSteps.blueprintId, blueprintId))
    .orderBy(asc(adBuildSteps.seq));
  const steps = stepRows as unknown as RunStep[];
  return { account, steps };
}

/** Per-account credentials: its own encrypted token if present, else global. */
async function credsFor(account: {
  accessTokenEncrypted: string | null;
}): Promise<MutateOptions> {
  if (account.accessTokenEncrypted) {
    const refreshToken = decryptToken(account.accessTokenEncrypted);
    const accessToken = await getAccessTokenForRefreshToken(refreshToken);
    return { accessToken }; // direct access — no login-customer-id
  }
  return {};
}

const opsFromSteps = (steps: RunStep[], cid: string) =>
  steps.map((s) => substituteCid(s.requestPayload, cid));

/**
 * Replace a blueprint's build steps from its (already-validated) tree. Called
 * at plan time and after every edit, so the stored ops always match the
 * reviewer's current blueprint. Resets all steps to `pending`.
 */
export async function materializeSteps(
  blueprintId: string,
  blueprint: Blueprint,
  customerId: string
): Promise<number> {
  const steps = blueprintToBuildSteps(blueprint, { customerId });
  await db.delete(adBuildSteps).where(eq(adBuildSteps.blueprintId, blueprintId));
  if (steps.length) {
    await db.insert(adBuildSteps).values(
      steps.map((s) => ({
        blueprintId,
        seq: s.seq,
        kind: s.kind,
        requestPayload: s.requestPayload,
        status: "pending" as const,
      }))
    );
  }
  return steps.length;
}

/** Dry-run the whole batch against Google (creates nothing). */
export async function validateBlueprint(
  blueprintId: string
): Promise<{ ok: boolean; error?: string }> {
  const { account, steps } = await loadForRun(blueprintId);
  if (!steps.length) return { ok: false, error: "No build steps — re-draft the blueprint." };
  const cid = account.externalAccountId;
  const creds = await credsFor(account);
  try {
    await runMutate(cid, opsFromSteps(steps, cid), creds, { validateOnly: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(adBlueprints)
      .set({ error: msg, updatedAt: new Date() })
      .where(eq(adBlueprints.id, blueprintId));
    return { ok: false, error: msg };
  }
  await db
    .update(adBuildSteps)
    .set({ status: "validated", error: null, updatedAt: new Date() })
    .where(eq(adBuildSteps.blueprintId, blueprintId));
  await db
    .update(adBlueprints)
    .set({ validatedAt: new Date(), error: null, updatedAt: new Date() })
    .where(eq(adBlueprints.id, blueprintId));
  return { ok: true };
}

export type BuildOutcome = {
  ok: boolean;
  applied: boolean;
  message?: string;
  error?: string;
};

/**
 * Build the account in Google Ads. If live writes are OFF (Basic access
 * pending / flag unset) this is forced to a dry-run validate and returns the
 * "apply by hand" notice — never silently does nothing. On success every
 * campaign/ad is created PAUSED.
 */
export async function buildBlueprint(blueprintId: string): Promise<BuildOutcome> {
  const { account, steps } = await loadForRun(blueprintId);
  if (!steps.length) return { ok: false, applied: false, error: "No build steps." };
  const cid = account.externalAccountId;
  const creds = await credsFor(account);
  const ops = opsFromSteps(steps, cid);

  if (!adsWriteEnabled()) {
    try {
      await runMutate(cid, ops, creds, { validateOnly: true });
    } catch (err) {
      return {
        ok: false,
        applied: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    await db
      .update(adBuildSteps)
      .set({ status: "validated", updatedAt: new Date() })
      .where(eq(adBuildSteps.blueprintId, blueprintId));
    await db
      .update(adBlueprints)
      .set({ validatedAt: new Date(), error: null, updatedAt: new Date() })
      .where(eq(adBlueprints.id, blueprintId));
    return { ok: true, applied: false, message: ADS_WRITE_DISABLED_MESSAGE };
  }

  await db
    .update(adBlueprints)
    .set({ status: "building", updatedAt: new Date() })
    .where(eq(adBlueprints.id, blueprintId));
  let names: (string | null)[];
  try {
    const result = await runMutate(cid, ops, creds, { validateOnly: false });
    names = result.resourceNames;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(adBlueprints)
      .set({ status: "failed", error: msg, updatedAt: new Date() })
      .where(eq(adBlueprints.id, blueprintId));
    return { ok: false, applied: false, error: msg };
  }

  // Map returned resource names back to steps by order.
  for (let i = 0; i < steps.length; i++) {
    await db
      .update(adBuildSteps)
      .set({
        status: "applied",
        resourceName: names[i] ?? null,
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adBuildSteps.id, steps[i].id));
  }
  await db
    .update(adBlueprints)
    .set({
      status: "built",
      builtAt: new Date(),
      externalCustomerId: cid,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(adBlueprints.id, blueprintId));
  return { ok: true, applied: true };
}

/** Tear down a built account: remove created resources in reverse order. */
export async function revertBlueprint(
  blueprintId: string
): Promise<{ ok: boolean; removed: number; error?: string }> {
  if (!adsWriteEnabled()) {
    return { ok: false, removed: 0, error: "Live writes are off — nothing was built to revert." };
  }
  const { account, steps } = await loadForRun(blueprintId);
  const cid = account.externalAccountId;
  const applied = steps
    .filter((s) => s.status === "applied" && s.resourceName)
    .sort((a, b) => b.seq - a.seq);
  const removeOps = applied
    .map((s) => removeOp(s.kind, s.resourceName as string))
    .filter((o): o is Record<string, unknown> => o !== null);
  if (!removeOps.length) return { ok: true, removed: 0 };

  const creds = await credsFor(account);
  try {
    await runMutate(cid, removeOps, creds, { validateOnly: false });
  } catch (err) {
    return { ok: false, removed: 0, error: err instanceof Error ? err.message : String(err) };
  }
  for (const s of applied) {
    await db
      .update(adBuildSteps)
      .set({ status: "reverted", updatedAt: new Date() })
      .where(eq(adBuildSteps.id, s.id));
  }
  await db
    .update(adBlueprints)
    .set({ status: "reverted", updatedAt: new Date() })
    .where(eq(adBlueprints.id, blueprintId));
  return { ok: true, removed: removeOps.length };
}
