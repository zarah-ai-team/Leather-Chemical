import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "LeatherChem TMS",
  description: "AI-powered Leather Chemical Trading Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex">
          <Sidebar />
          <main className="flex-1 min-w-0 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}
