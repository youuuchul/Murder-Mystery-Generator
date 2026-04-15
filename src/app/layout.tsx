import type { Metadata, Viewport } from "next";
import AppAnalytics from "@/app/_components/AppAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "Murder Mystery Generator",
  description: "머더미스터리 시나리오 제작 & 플레이 플랫폼",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <AppAnalytics />
      </body>
    </html>
  );
}
