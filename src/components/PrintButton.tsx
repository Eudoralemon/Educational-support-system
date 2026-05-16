"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "打印" }: { label?: string }) {
  return (
    <button className="button secondary no-print" onClick={() => window.print()} type="button">
      <Printer size={18} />
      {label}
    </button>
  );
}
