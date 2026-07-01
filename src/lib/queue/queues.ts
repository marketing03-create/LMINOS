import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "./connection";

export const QUEUE_NAMES = {
  LEAD_INGEST: "lead.ingest",
  LEAD_DEDUPE: "lead.dedupe",
  LEAD_ROUTE: "lead.route",
  LEAD_NOTIFY: "lead.notify",
  SALES_MATCH: "sales.match",
  SHEETS_SYNC: "sheets.sync",
  SLA_SCAN: "sla.scan",
  TIKTOK_POLL: "tiktok.poll",
  SPEND_IMPORT: "spend.import",
  AUDIT_WRITE: "audit.write",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Job payload types (lightweight — workers re-validate with Zod).
export type LeadIngestJob = {
  idempotencyKey: string;
  sourcePlatform: string;
  receivedAt: string; // ISO
  payload: unknown;
};

export type LeadDedupeJob = {
  leadId: string;
};

export type LeadRouteJob = {
  leadId: string;
};

export type LeadNotifyJob = {
  leadId: string;
  notificationType:
    | "new_lead"
    | "sla_breach"
    | "vip_lead"
    | "routing_failure"
    | "recycle_added";
};

export type SalesMatchJob = {
  salesRecordId: string;
};

const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 5000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

const queues = new Map<string, Queue>();

function getQueue<T>(name: QueueName): Queue<T> {
  let q = queues.get(name) as Queue<T> | undefined;
  if (!q) {
    q = new Queue<T>(name, { connection: getRedis() });
    queues.set(name, q as Queue);
  }
  return q;
}

export const leadIngestQueue = () =>
  getQueue<LeadIngestJob>(QUEUE_NAMES.LEAD_INGEST);
export const leadDedupeQueue = () =>
  getQueue<LeadDedupeJob>(QUEUE_NAMES.LEAD_DEDUPE);
export const leadRouteQueue = () =>
  getQueue<LeadRouteJob>(QUEUE_NAMES.LEAD_ROUTE);
export const leadNotifyQueue = () =>
  getQueue<LeadNotifyJob>(QUEUE_NAMES.LEAD_NOTIFY);
export const salesMatchQueue = () =>
  getQueue<SalesMatchJob>(QUEUE_NAMES.SALES_MATCH);

// BullMQ rejects custom jobIds containing ':' (it reserves that for its own
// internal key separators). Our idempotency keys look like "website:<hash>",
// so we swap colons for underscores at the BullMQ-jobId layer. The
// `processed_jobs` DB table still uses the original key as the canonical
// dedupe — this is just BullMQ's in-flight dedupe.
function sanitizeJobId(key: string): string {
  return key.replace(/:/g, "_");
}

export async function enqueueLeadIngest(
  job: LeadIngestJob,
  jobOpts?: JobsOptions
) {
  await leadIngestQueue().add("ingest", job, {
    ...DEFAULT_JOB_OPTS,
    jobId: sanitizeJobId(job.idempotencyKey),
    ...jobOpts,
  });
}

export async function enqueueLeadDedupe(job: LeadDedupeJob) {
  await leadDedupeQueue().add("dedupe", job, DEFAULT_JOB_OPTS);
}

export async function enqueueLeadRoute(job: LeadRouteJob) {
  await leadRouteQueue().add("route", job, DEFAULT_JOB_OPTS);
}

export async function enqueueLeadNotify(job: LeadNotifyJob) {
  await leadNotifyQueue().add("notify", job, DEFAULT_JOB_OPTS);
}

export async function enqueueSalesMatch(job: SalesMatchJob) {
  await salesMatchQueue().add("match", job, {
    ...DEFAULT_JOB_OPTS,
    jobId: sanitizeJobId(`sales.match:${job.salesRecordId}`),
  });
}
