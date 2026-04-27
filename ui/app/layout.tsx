import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "better-prompts",
  description: "auto-evolving prompts admin",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <div className="bar">
            <Link href="/" style={{ color: "inherit" }}>
              <strong>better-prompts</strong>
              <span className="dim"> &nbsp;/ admin</span>
            </Link>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
