import type { MetadataRoute } from "next";

/**
 * Web app manifest so LMIROS installs + launches as a standalone app (its own
 * window, no browser chrome) when added to the home screen — instead of just
 * opening the site in the browser. iOS additionally needs the apple-web-app
 * meta tags set in the root layout metadata.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LMIROS",
    short_name: "LMIROS",
    description: "Loan Marketing Intelligence & Revenue OS",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#3b82f6",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
