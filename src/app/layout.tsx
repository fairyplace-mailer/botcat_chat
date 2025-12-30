import "./globals.css";

import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Fairyplace™ BotCat",
  description: "Fairyplace™ BotCat — чат для клиентов Fairyplace.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/BotCat_Portrait_192.png", type: "image/png", sizes: "192x192" },
      { url: "/BotCat_Portrait_512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/BotCat_Portrait_180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>

      <Script id="clarity" strategy="afterInteractive">
        {`
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "qgcxjbxhps");
        `}
      </Script>
    </html>
  );
}
