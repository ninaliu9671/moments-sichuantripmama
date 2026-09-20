import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOMENTS · 四川之旅",
  description: "和重要的人，一起看更大的世界。属于家人的私人旅行记忆空间。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
