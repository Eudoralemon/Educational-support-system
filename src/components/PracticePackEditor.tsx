"use client";

import { useState, useTransition } from "react";
import { Check, Printer, Save } from "lucide-react";

type PracticeItem = {
  id: string;
  order: number;
  prompt: string;
  answerText: string | null;
  analysisText: string | null;
  isAiDraft: boolean;
  knowledgePoint?: {
    name: string;
    module: string;
  } | null;
};

type PracticePack = {
  id: string;
  title: string;
  status: "DRAFT" | "CONFIRMED";
  items: PracticeItem[];
};

export function PracticePackEditor({ pack }: { pack: PracticePack }) {
  const [title, setTitle] = useState(pack.title);
  const [status, setStatus] = useState(pack.status);
  const [items, setItems] = useState(pack.items);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateItem(id: string, field: "prompt" | "answerText" | "analysisText", value: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function save(nextStatus = status) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/practice-packs/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          status: nextStatus,
          items,
        }),
      });

      if (!response.ok) {
        setMessage("保存失败");
        return;
      }

      setStatus(nextStatus);
      setMessage(nextStatus === "CONFIRMED" ? "已确认" : "已保存");
    });
  }

  return (
    <div className="form-grid print-area">
      <div className="field no-print">
        <label htmlFor="pack-title">练习包标题</label>
        <input className="input" id="pack-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div className="button-row no-print">
        <button className="button secondary" disabled={isPending} onClick={() => save("DRAFT")} type="button">
          <Save size={18} />
          保存
        </button>
        <button className="button secondary" disabled={isPending} onClick={() => save("CONFIRMED")} type="button">
          <Check size={18} />
          确认
        </button>
        <button className="button" onClick={() => window.print()} type="button">
          <Printer size={18} />
          打印
        </button>
        {message ? <span className="badge green">{message}</span> : null}
      </div>

      <h2 className="page-title">{title}</h2>
      <div className="list">
        {items.map((item, index) => (
          <article className="practice-item" key={item.id}>
            <div className="item-top">
              <strong>第 {index + 1} 题</strong>
              <span className={item.isAiDraft ? "badge orange" : "badge gray"}>
                {item.knowledgePoint?.name ?? "自定义题"}
              </span>
            </div>
            <div className="field">
              <label htmlFor={`prompt-${item.id}`}>题目</label>
              <textarea
                className="textarea"
                id={`prompt-${item.id}`}
                value={item.prompt}
                onChange={(event) => updateItem(item.id, "prompt", event.target.value)}
              />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor={`answer-${item.id}`}>答案</label>
                <textarea
                  className="textarea"
                  id={`answer-${item.id}`}
                  value={item.answerText ?? ""}
                  onChange={(event) => updateItem(item.id, "answerText", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`analysis-${item.id}`}>解析</label>
                <textarea
                  className="textarea"
                  id={`analysis-${item.id}`}
                  value={item.analysisText ?? ""}
                  onChange={(event) => updateItem(item.id, "analysisText", event.target.value)}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
