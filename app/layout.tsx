import type { Metadata } from "next";
import "./base.css";
import "../components/mindmap/styles.css";

export const metadata: Metadata = {
  title: "kanx-mindmap · 思维导图",
  description: "kanx-mindmap：简洁、有序的思维导图编辑器",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
