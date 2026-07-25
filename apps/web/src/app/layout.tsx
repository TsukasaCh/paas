import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Ronaldo Cloud",
  description: "Deploy apa saja dari GitHub, tanpa ribet infra — ronaldocloud.id",
  metadataBase: new URL("https://ronaldocloud.id"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
