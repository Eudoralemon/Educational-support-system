"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function TextbookRecognitionRunner() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function runRecognition() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/textbooks/recognize", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            summary?: Array<{
              textbook: string;
              pages: number;
              contentBlocks: number;
              candidates: number;
              autoApplied: number;
              lowConfidence: number;
            }>;
          }
        | null;

      if (!response.ok) {
        setMessage(payload?.error ?? "教材识别失败");
        return;
      }

      const totalBlocks = payload?.summary?.reduce((sum, item) => sum + item.contentBlocks, 0) ?? 0;
      const totalCandidates = payload?.summary?.reduce((sum, item) => sum + item.candidates, 0) ?? 0;
      setMessage(`识别完成：${totalBlocks} 个内容块，${totalCandidates} 个题源候选`);
      router.refresh();
    });
  }

  return (
    <div className="button-row">
      <button className="button" disabled={isPending} onClick={runRecognition} type="button">
        <RefreshCw size={18} />
        {isPending ? "识别中" : "重跑本地教材识别"}
      </button>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
