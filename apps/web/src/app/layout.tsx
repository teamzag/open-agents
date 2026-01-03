import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open Claude Code",
  description: "AI-powered coding assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
