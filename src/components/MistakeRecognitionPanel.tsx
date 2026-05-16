"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanText, Sparkles } from "lucide-react";
import { MathMarkdown } from "@/components/MathMarkdown";

type Match = {
  id: string;
  score: number;
  status: string;
  reason: string | null;
  textbook: string;
  chapter: string;
  section: string | null;
  sourcePage: number | null;
  sourceLabel: string | null;
  knowledgePoint: { id: string; name: string; module: string } | null;
  prompt: string;
};

export function MistakeRecognitionPanel({
  mistakeId,
  initialMatches,
}: {
  mistakeId: string;
  initialMatches: Match[];
}) {
  const router = useRouter();
  const [matches, setMatches] = useState(initialMatches);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function runRecognition() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/mistakes/${mistakeId}/recognize`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "识别失败");
        return;
      }

      const payload = (await response.json()) as { matches: Match[] };
      setMatches(payload.matches);
      setMessage(payload.matches.length > 0 ? "已更新教材候选" : "暂无足够可信的教材候选");
      router.refresh();
    });
  }

  function acceptMatch(matchId: string) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/mistakes/${mistakeId}/recognize`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });

      if (!response.ok) {
        setMessage("确认教材候选失败");
        return;
      }

      setMessage("已确认教材来源并同步知识点");
      router.refresh();
    });
  }

  return (
    <div className="form-grid">
      <button className="button" disabled={isPending} onClick={runRecognition} type="button">
        <ScanText size={18} />
        {isPending ? "识别中" : "识别教材来源"}
      </button>
      {message ? <div className="empty">{message}</div> : null}
      {matches.length === 0 ? (
        <div className="empty">还没有教材候选。先保存文字或上传图片后再识别。</div>
      ) : (
        <div className="list">
          {matches.map((match) => (
            <div className="list-item" key={match.id}>
              <div className="item-top">
                <strong>{match.knowledgePoint?.name ?? match.section ?? "教材候选"}</strong>
                <span className={match.score >= 80 ? "badge green" : match.score >= 55 ? "badge" : "badge gray"}>
                  {match.score} 分
                </span>
              </div>
              <span className="muted">
                {match.textbook} · {match.chapter}
                {match.sourcePage ? ` · p.${match.sourcePage}` : ""}
                {match.sourceLabel ? ` · ${match.sourceLabel}` : ""}
              </span>
              {match.reason ? <span className="muted">{match.reason}</span> : null}
              {match.prompt ? <MathMarkdown className="compact-text" content={match.prompt} /> : null}
              <button
                className="button secondary"
                disabled={isPending || match.status === "ACCEPTED"}
                onClick={() => acceptMatch(match.id)}
                type="button"
              >
                <Sparkles size={16} />
                {match.status === "ACCEPTED" ? "已确认" : "确认并应用"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
