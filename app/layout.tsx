import type { Metadata } from "next";
import "./globals.css";
import "./mv5.css";
import "./production-guide.css";
import "./rate-limit.css";

export const metadata: Metadata = {
  title: "MasterV",
  description: "상품 숏폼 참고영상 분석·비교·제작 보조 도구"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
