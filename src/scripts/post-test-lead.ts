/**
 * Synthetic lead POSTer. Signs an HMAC and hits /api/ingest/website
 * so you can verify the ingest → dedupe → route pipeline locally.
 *
 * Run: npm run test:lead -- [URL]
 * Defaults to http://localhost:3000/api/ingest/website.
 */
import { signHmacSha256Hex } from "@/lib/crypto/hmac";

async function main() {
  const url = process.argv[2] ?? "http://localhost:3000/api/ingest/website";
  const secret = process.env.WEBHOOK_SECRET_WEBSITE;
  if (!secret) {
    console.error("WEBHOOK_SECRET_WEBSITE must be set in env");
    process.exit(1);
  }

  const body = JSON.stringify({
    brand_slug: "default",
    loan_type: "personal",
    full_name: "Ahmad Bin Ali",
    phone: "012-345-6789",
    email: "ahmad@example.com",
    source_channel: "homepage",
    landing_page_url: "https://example.com/personal-loan",
    location: "Kuala Lumpur",
    priority_level: "warm",
    submitted_at: new Date().toISOString(),
  });

  const sig = signHmacSha256Hex(secret, body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lmiros-signature": `sha256=${sig}`,
    },
    body,
  });

  console.log(`HTTP ${res.status}`);
  console.log(await res.text());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
