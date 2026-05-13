"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";

export function CreatePracticePackButton({
  studentId,
  knowledgePointIds,
  label = "生成练习包",
}: {
  studentId?: string;
  knowledgePointIds?: string[];
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function createPack() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/practice-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          knowledgePointIds,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "练习包生成失败");
        return;
      }

      const payload = (await response.json()) as { id: string };
      router.push(`/practice-packs/${payload.id}`);
      router.refresh();
    });
  }

  return (
    <span className="button-row">
      <button className="button" disabled={isPending} onClick={createPack} type="button">
        <ClipboardList size={18} />
        {isPending ? "生成中" : label}
      </button>
      {error ? <span className="badge orange">{error}</span> : null}
    </span>
  );
}
