/**
 * The dark-mode guard for the Google Ads Account Builder (Feature R).
 *
 * The live build (writing to Google Ads via :mutate) stays OFF until BOTH
 * Google grants Basic (write) access AND the operator flips ADS_AUTOMATION_ENABLED
 * to "true". Until then every apply path is forced to validate-only (a dry-run
 * that creates nothing) and the team applies approved blueprints by hand — the
 * exact analog of Feature L's "approved = apply by hand for now".
 */
export function adsWriteEnabled(): boolean {
  return process.env.ADS_AUTOMATION_ENABLED === "true";
}

export const ADS_WRITE_DISABLED_MESSAGE =
  "Live build is OFF (Google Basic write access pending / ADS_AUTOMATION_ENABLED not set). " +
  "The blueprint was validated against Google only — apply it by hand in Google Ads or via Google Ads Editor.";
