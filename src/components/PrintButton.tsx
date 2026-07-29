"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      <Printer size={16} /> Print / Save as PDF
    </button>
  );
}
