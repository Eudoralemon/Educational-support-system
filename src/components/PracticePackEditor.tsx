"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, ChevronUp, FileText, Plus, Printer, Save, Trash2 } from "lucide-react";

type PracticeItem = {
  id: string;
  order: number;
  prompt: string;
  answerText: string | null;
  analysisText: string | null;
  isAiDraft: boolean;
  textbookExercise?: {
    textbook: string;
    chapter: string;
    section: string | null;
    sourceLabel: string;
    sourcePage: number | null;
  } | null;
  knowledgePoint?: {
    name: string;
    module: string;
  } | null;
};

type PracticeItemDraft = Omit<PracticeItem, "id" | "order"> & {
  id?: string;
  clientId: string;
  order: number;
};

type PracticePack = {
  id: string;
  title: string;
  status: "DRAFT" | "CONFIRMED";
  items: PracticeItem[];
};

type PrintMode = "student" | "answers" | "full";

function toDraft(item: PracticeItem): PracticeItemDraft {
  return {
    ...item,
    clientId: item.id,
  };
}

function reorder(items: PracticeItemDraft[]) {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function printableText(value: string | null | undefined) {
  return value?.trim() || "留空";
}

export function PracticePackEditor({ pack }: { pack: PracticePack }) {
  const [title, setTitle] = useState(pack.title);
  const [status, setStatus] = useState(pack.status);
  const [items, setItems] = useState<PracticeItemDraft[]>(pack.items.map(toDraft));
  const [printMode, setPrintMode] = useState<PrintMode>("student");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateItem(id: string, field: "prompt" | "answerText" | "analysisText", value: string) {
    setItems((current) =>
      current.map((item) => (item.clientId === id ? { ...item, [field]: value } : item)),
    );
  }

  function addItem() {
    setItems((current) =>
      reorder([
        ...current,
        {
          clientId: crypto.randomUUID(),
          order: current.length + 1,
          prompt: "自定义巩固题",
          answerText: "",
          analysisText: "",
          isAiDraft: false,
          textbookExercise: null,
          knowledgePoint: null,
        },
      ]),
    );
  }

  function removeItem(id: string) {
    setItems((current) => reorder(current.filter((item) => item.clientId !== id)));
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.clientId === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return reorder(next);
    });
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
          items: items.map((item) => ({
            id: item.id,
            prompt: item.prompt,
            answerText: item.answerText ?? "",
            analysisText: item.analysisText ?? "",
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "保存失败");
        return;
      }

      const payload = (await response.json()) as {
        status: "DRAFT" | "CONFIRMED";
        items: PracticeItem[];
      };
      setStatus(payload.status);
      setItems(payload.items.map(toDraft));
      setMessage(nextStatus === "CONFIRMED" ? "已确认" : "已保存");
    });
  }

  function print(mode: PrintMode) {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 0);
  }

  return (
    <div className={`form-grid print-area print-mode-${printMode}`}>
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
        <button className="button secondary" onClick={addItem} type="button">
          <Plus size={18} />
          添加题目
        </button>
        <button className="button" onClick={() => print("student")} type="button">
          <Printer size={18} />
          学生卷
        </button>
        <button className="button secondary" onClick={() => print("answers")} type="button">
          <FileText size={18} />
          答案解析
        </button>
        <button className="button secondary" onClick={() => print("full")} type="button">
          <Printer size={18} />
          完整打印
        </button>
        {message ? <span className={message.includes("失败") ? "badge orange" : "badge green"}>{message}</span> : null}
      </div>

      <div className="print-only print-heading">
        <h2>{title}</h2>
        <span>{status === "CONFIRMED" ? "已确认" : "草稿"}</span>
      </div>

      <h2 className="page-title no-print">{title}</h2>
      <div className="list no-print">
        {items.length === 0 ? <div className="empty">暂无题目。</div> : null}
        {items.map((item, index) => (
          <article className="practice-item" key={item.clientId}>
            <div className="item-top">
              <strong>第 {index + 1} 题</strong>
              <span className={item.isAiDraft ? "badge orange" : "badge gray"}>
                {item.knowledgePoint?.name ?? "自定义题"}
              </span>
            </div>
            {item.textbookExercise ? (
              <span className="muted">
                来源：{item.textbookExercise.textbook} · {item.textbookExercise.chapter}
                {item.textbookExercise.section ? ` · ${item.textbookExercise.section}` : ""} ·{" "}
                {item.textbookExercise.sourceLabel}
                {item.textbookExercise.sourcePage ? ` · PDF第 ${item.textbookExercise.sourcePage} 页附近` : ""}
              </span>
            ) : null}
            <div className="button-row compact">
              <button
                className="icon-button"
                disabled={index === 0}
                onClick={() => moveItem(item.clientId, -1)}
                title="上移"
                type="button"
              >
                <ChevronUp size={18} />
              </button>
              <button
                className="icon-button"
                disabled={index === items.length - 1}
                onClick={() => moveItem(item.clientId, 1)}
                title="下移"
                type="button"
              >
                <ChevronDown size={18} />
              </button>
              <button className="icon-button danger" onClick={() => removeItem(item.clientId)} title="删除" type="button">
                <Trash2 size={18} />
              </button>
            </div>
            <div className="field">
              <label htmlFor={`prompt-${item.clientId}`}>题目</label>
              <textarea
                className="textarea"
                id={`prompt-${item.clientId}`}
                value={item.prompt}
                onChange={(event) => updateItem(item.clientId, "prompt", event.target.value)}
              />
            </div>
            <div className="form-grid two">
              <div className="field">
                <label htmlFor={`answer-${item.clientId}`}>答案</label>
                <textarea
                  className="textarea"
                  id={`answer-${item.clientId}`}
                  value={item.answerText ?? ""}
                  onChange={(event) => updateItem(item.clientId, "answerText", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`analysis-${item.clientId}`}>解析</label>
                <textarea
                  className="textarea"
                  id={`analysis-${item.clientId}`}
                  value={item.analysisText ?? ""}
                  onChange={(event) => updateItem(item.clientId, "analysisText", event.target.value)}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="print-only">
        {items.map((item, index) => (
          <article className="print-item" key={item.clientId}>
            <h3>第 {index + 1} 题</h3>
            <p className="preserve-lines">{item.prompt}</p>
            <div className="print-answer">
              <strong>答案</strong>
              <p className="preserve-lines">{printableText(item.answerText)}</p>
              <strong>解析</strong>
              <p className="preserve-lines">{printableText(item.analysisText)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
