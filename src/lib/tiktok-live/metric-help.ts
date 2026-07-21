/**
 * ONE plain-English description per TikTok Live metric, shown in the "?" beside
 * every label — the sessions tables, the KPI cards, and the streamer's own Home
 * cards all read from here, so admin and streamer always see the same wording.
 *
 * House style: say what the number MEANS in one short sentence. Don't document
 * the UI (no "reads — until entered") — an empty cell already speaks for itself.
 */

/** Why our captured figure can sit slightly under TikTok's own report. */
const CAPTURED = "Captured live, so it can read a few % under TikTok's final number.";

export const METRIC_HELP = {
  duration: "How long the live ran.",
  views: `Total entries into your live — someone who leaves and comes back counts again, so this is higher than unique viewers. ${CAPTURED}`,
  peak: "The most people watching at the same moment.",
  avg: "Average number of people watching at any moment.",
  followers: "New followers gained during the live.",
  likes: `Total hearts tapped during the live. ${CAPTURED}`,
  comments: `Total chat messages posted during the live. ${CAPTURED}`,
  shares: "How many times viewers shared your live.",
  unique: "How many different people watched — each person counted once, however often they re-entered.",
  active: "Viewers who actually engaged (commented, liked or shared) rather than just watching.",
  watch: "Average time a viewer stayed, in seconds.",
  dms: "Direct messages received from viewers around this live.",
  bioViews: "How many times viewers opened your profile / bio link.",
  interested: "Viewers TikTok flagged as showing buying intent.",
  diamonds: "Virtual gifts received, measured in diamonds.",
  commentLeads:
    "Viewers who typed your keyword (e.g. “PM”) in the chat — captured automatically. A follow-up list, not your final lead count.",
  totalLeads:
    "Unique customers who contacted you from this live — counted once per phone number, so the same person on DM and WhatsApp counts once.",
  filteredLeads:
    "Of those leads, how many passed screening and submitted their documents.",
  sessions: "Number of lives in this date range.",
  liveHours: "Total hours streamed in this date range.",
} as const;

export type MetricHelpKey = keyof typeof METRIC_HELP;
