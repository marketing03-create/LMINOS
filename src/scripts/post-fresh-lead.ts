/**
 * Like post-test-lead.ts but rotates the phone/name so the lead is NOT a
 * duplicate, which means routing + Telegram notify actually fire.
 */
import { signHmacSha256Hex } from "@/lib/crypto/hmac";

async function main() {
  const url =
    process.argv[2] ?? "http://localhost:3000/api/ingest/website";
  const secret = process.env.WEBHOOK_SECRET_WEBSITE!;

  // Generate a random Malaysian mobile: 60 1{1-9} {7-8 digits}.
  const sub = 1 + Math.floor(Math.random() * 9); // 1..9
  const tail = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  const phone = `+601${sub}${tail}`;

  const names = ["Aisha Binti Yusof", "Tan Wei Ming", "Raj Kumar", "Lim Mei Ling", "Faiz Bin Rahman"];
  const name = names[Math.floor(Math.random() * names.length)];

  const body = JSON.stringify({
    brand_slug: "default",
    loan_type: "personal",
    full_name: name,
    phone,
    email: `${name.replace(/\s+/g, ".").toLowerCase()}@example.com`,
    source_channel: "smoke-test",
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

  console.log(`HTTP ${res.status}  →  ${name} (${phone})`);
  console.log(await res.text());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
