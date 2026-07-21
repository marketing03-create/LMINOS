import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LMIROS",
  description: "Loan Marketing Intelligence & Revenue Operating System",
  applicationName: "LMIROS",
  // Standalone-app config so "Add to Home Screen" launches its own window
  // instead of just opening the browser. The app/manifest.ts file convention
  // auto-adds the manifest link (Android/Chrome); `appleWebApp` + the legacy
  // meta below cover iOS/Safari (older + newer).
  appleWebApp: {
    capable: true,
    title: "LMIROS",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Legacy tag for older iOS versions (Next's appleWebApp emits the newer
    // `mobile-web-app-capable`; iOS < 16.4 needs this apple-prefixed one).
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  // Extend under the iOS status bar / notch when running as a home-screen app.
  viewportFit: "cover",
};

// Runs before first paint so a stored theme choice never flashes the wrong
// mode. "system" (or nothing stored) follows the OS preference.
const themeInit = `(function(){try{var t=localStorage.getItem("lmiros-theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
