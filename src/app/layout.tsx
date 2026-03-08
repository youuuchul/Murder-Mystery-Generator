import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Murder Mystery Generator",
  description: "머더미스터리 시나리오 제작 & 플레이 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
