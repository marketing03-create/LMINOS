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

  // ── Overview ──
  leadQuality:
    "Of the people who contacted you, the share who went on to send their documents. Only counts lives where both numbers were filled in.",
  coverage:
    "How many of the lives in this period actually have this number typed in. A low count means the figure is only part of the story.",
  autoCoverage:
    "Captured automatically. A stored zero can't be told apart from a live we failed to record, so treat this as a best case, not an exact count.",
  combineBy:
    "Total, Average, Minimum and so on change the charts only. The big cards at the top are always the period total.",
  viewsPerLiveHour:
    "How many views each hour of streaming earned. Higher is better, and streaming longer doesn't automatically score higher.",
  followersPerLiveHour:
    "How many new followers each hour of streaming earned. More followers means more people see your next live without extra effort.",
  leadsPerLiveHour:
    "For every hour you were live, how many customers ended up contacting you. Only counts lives where someone recorded the lead number.",
  leadsPer1kViews:
    "Out of every 1,000 entries into your lives, how many became a customer contact. Views count re-entries, so the true per-person rate is higher.",
  partOfDay:
    "Which part of the day your lives do best in. Counted from the time each live started, so a long live counts once, in the block it began.",
  timeOfDayLeads:
    "Which time of day brought the most customer contacts. A faded bar comes from fewer than three lives with leads entered.",
  streamerTable:
    "Your streamers side by side over the same dates. Every column is a rate, so streaming more often doesn't flatter anyone. A dash means the number was never typed in — not that it was zero.",
  keywordCapture:
    "Whether this handle has its chat keywords set up. If it says “not set up”, the keyword count reads zero no matter how many viewers commented.",
  topLives:
    "Your strongest and weakest lives by views per hour streamed. Click one to see what happened in it. Lives under 30 minutes are left out.",
  notRecorded:
    "A dash means nobody has typed this number in yet. It does not mean the answer was zero.",
  productTagging:
    "Which loan products each live promoted. Right now every tagged live promoted both products at once, so we can't yet tell which one brought the customers.",
  chaseList:
    "Lives where nobody has typed the numbers in yet. Fill these in and the rest of this page becomes far more reliable. Sorted biggest-audience-first — that's the order to work through them, not a guess at which live got the most leads.",
  connectorMiss:
    "For a few metrics the system can't tell “zero happened” from “we failed to record it”. This flags the lives that look like a recording failure.",
} as const;

export type MetricHelpKey = keyof typeof METRIC_HELP;
