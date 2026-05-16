"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  Printer,
  Save,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { MathContentEditor } from "@/components/MathContentEditor";
import { MathMarkdown } from "@/components/MathMarkdown";

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
  studentId: string;
  title: string;
  status: "DRAFT" | "CONFIRMED";
  knowledgePoints: {
    id: string;
    name: string;
    module: string;
    textbook: string;
    chapter: string;
  }[];
  items: PracticeItem[];
};

type PrintMode = "student" | "answers" | "full";
type LibraryView = "recommended" | "unused" | "favorites" | "all";

type LibraryExercise = {
  id: string;
  textbook: string;
  chapter: string;
  section: string | null;
  sourceLabel: string;
  sourcePage: number | null;
  prompt: string;
  answerText: string | null;
  analysisText: string | null;
  difficulty: number;
  originalDifficulty: number;
  knowledgePoint: {
    id: string;
    name: string;
    module: string;
  };
  preference: {
    isFavorite: boolean;
    note: string;
    difficultyOverride: number | null;
    isDisabled: boolean;
  };
  usage: {
    count: number;
    lastUsedAt: string | null;
  };
  masteryScore?: number;
  masteryLabel: string;
};

function toDraft(item: PracticeItem): PracticeItemDraft {
  return {
    ...item,
    clientId: item.id,
  };
}

function reorder(items: PracticeItemDraft[]) {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

export function PracticePackEditor({ pack }: { pack: PracticePack }) {
  const [title, setTitle] = useState(pack.title);
  const [status, setStatus] = useState(pack.status);
  const [items, setItems] = useState<PracticeItemDraft[]>(pack.items.map(toDraft));
  const [printMode, setPrintMode] = useState<PrintMode>("student");
  const [message, setMessage] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryView, setLibraryView] = useState<LibraryView>("recommended");
  const [query, setQuery] = useState("");
  const [textbookFilter, setTextbookFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [pointFilter, setPointFilter] = useState("");
  const [libraryItems, setLibraryItems] = useState<LibraryExercise[]>([]);
  const [libraryMessage, setLibraryMessage] = useState("");
  const [isLibraryPending, startLibraryTransition] = useTransition();
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

  function loadLibrary(nextView = libraryView) {
    setLibraryMessage("");
    startLibraryTransition(async () => {
      const params = new URLSearchParams({
        studentId: pack.studentId,
        view: nextView,
        take: "80",
      });

      if (query.trim()) {
        params.set("q", query.trim());
      }
      if (textbookFilter) params.set("textbook", textbookFilter);
      if (moduleFilter) params.set("module", moduleFilter);
      if (chapterFilter) params.set("chapter", chapterFilter);
      if (pointFilter) params.set("knowledgePointId", pointFilter);

      const response = await fetch(`/api/textbook-exercises?${params.toString()}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setLibraryMessage(payload?.error ?? "题库加载失败");
        return;
      }

      const payload = (await response.json()) as { exercises: LibraryExercise[] };
      setLibraryItems(payload.exercises);
      setLibraryOpen(true);
    });
  }

  function changeLibraryView(view: LibraryView) {
    setLibraryView(view);
    loadLibrary(view);
  }

  function appendExercise(exerciseId: string) {
    setLibraryMessage("");
    startLibraryTransition(async () => {
      const response = await fetch(`/api/practice-packs/${pack.id}/items/from-exercise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textbookExerciseId: exerciseId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setLibraryMessage(payload?.error ?? "题源加入失败");
        return;
      }

      const payload = (await response.json()) as { item: { id: string; order: number } };
      const exercise = libraryItems.find((item) => item.id === exerciseId);
      if (!exercise) {
        setLibraryMessage("已加入题源");
        return;
      }

      setItems((current) =>
        reorder([
          ...current,
          {
            id: payload.item.id,
            clientId: crypto.randomUUID(),
            order: payload.item.order,
            prompt: `【${exercise.knowledgePoint.name} · ${exercise.sourceLabel}】\n${exercise.prompt}`,
            answerText: exercise.answerText ?? "",
            analysisText: exercise.analysisText ?? "",
            isAiDraft: false,
            textbookExercise: {
              textbook: exercise.textbook,
              chapter: exercise.chapter,
              section: exercise.section,
              sourceLabel: exercise.sourceLabel,
              sourcePage: exercise.sourcePage,
            },
            knowledgePoint: {
              name: exercise.knowledgePoint.name,
              module: exercise.knowledgePoint.module,
            },
          },
        ]),
      );
      setLibraryItems((current) =>
        current.map((item) =>
          item.id === exerciseId
            ? { ...item, usage: { ...item.usage, count: item.usage.count + 1, lastUsedAt: new Date().toISOString() } }
            : item,
        ),
      );
      setLibraryMessage("已加入练习包末尾");
    });
  }

  function updatePreference(
    exercise: LibraryExercise,
    patch: Partial<LibraryExercise["preference"]>,
  ) {
    startLibraryTransition(async () => {
      const nextPreference = { ...exercise.preference, ...patch };
      const response = await fetch(`/api/textbook-exercises/${exercise.id}/preference`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPreference),
      });

      if (!response.ok) {
        setLibraryMessage("题源设置保存失败");
        return;
      }

      setLibraryItems((current) =>
        current.map((item) =>
          item.id === exercise.id ? { ...item, preference: nextPreference, difficulty: nextPreference.difficultyOverride ?? item.originalDifficulty } : item,
        ),
      );
    });
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

  const textbooks = Array.from(new Set(pack.knowledgePoints.map((point) => point.textbook))).sort();
  const modules = Array.from(
    new Set(
      pack.knowledgePoints
        .filter((point) => !textbookFilter || point.textbook === textbookFilter)
        .map((point) => point.module),
    ),
  ).sort();
  const chapters = Array.from(
    new Set(
      pack.knowledgePoints
        .filter((point) => !textbookFilter || point.textbook === textbookFilter)
        .filter((point) => !moduleFilter || point.module === moduleFilter)
        .map((point) => point.chapter),
    ),
  ).sort();
  const points = pack.knowledgePoints
    .filter((point) => !textbookFilter || point.textbook === textbookFilter)
    .filter((point) => !moduleFilter || point.module === moduleFilter)
    .filter((point) => !chapterFilter || point.chapter === chapterFilter);

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
        <button className="button secondary" onClick={() => loadLibrary()} type="button">
          <BookOpen size={18} />
          题库选题
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
      {libraryOpen ? (
        <section className="library-panel no-print">
          <div className="item-top">
            <h3>教材题库</h3>
            <button className="button secondary" onClick={() => setLibraryOpen(false)} type="button">
              收起
            </button>
          </div>
          <div className="selector-toolbar">
            <label className="search-field" htmlFor="exercise-search">
              <Search size={16} />
              <input
                id="exercise-search"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") loadLibrary();
                }}
                placeholder="搜索题干、知识点或章节"
                value={query}
              />
            </label>
            <button className="button secondary" disabled={isLibraryPending} onClick={() => loadLibrary()} type="button">
              搜索
            </button>
          </div>
          <div className="selector-toolbar">
            <select className="select" onChange={(event) => setTextbookFilter(event.target.value)} value={textbookFilter}>
              <option value="">全部教材</option>
              {textbooks.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select className="select" onChange={(event) => setModuleFilter(event.target.value)} value={moduleFilter}>
              <option value="">全部模块</option>
              {modules.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select className="select" onChange={(event) => setChapterFilter(event.target.value)} value={chapterFilter}>
              <option value="">全部章节</option>
              {chapters.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select className="select" onChange={(event) => setPointFilter(event.target.value)} value={pointFilter}>
              <option value="">全部知识点</option>
              {points.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.name}
                </option>
              ))}
            </select>
          </div>
          <div className="segmented">
            {([
              ["recommended", "推荐"],
              ["unused", "未使用"],
              ["favorites", "收藏"],
              ["all", "全部"],
            ] as const).map(([value, label]) => (
              <button
                className={libraryView === value ? "segment active" : "segment"}
                key={value}
                onClick={() => changeLibraryView(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {libraryMessage ? <div className="empty">{libraryMessage}</div> : null}
          <div className="library-list">
            {libraryItems.map((exercise) => (
              <article className={exercise.preference.isDisabled ? "library-card disabled" : "library-card"} key={exercise.id}>
                <div className="item-top">
                  <strong>{exercise.knowledgePoint.name}</strong>
                  <span className={exercise.masteryScore && exercise.masteryScore < 60 ? "badge orange" : "badge"}>
                    {exercise.masteryScore ?? "--"} 分
                  </span>
                </div>
                <MathMarkdown className="compact-text" content={exercise.prompt} />
                <span className="muted">
                  {exercise.textbook} · {exercise.chapter}
                  {exercise.section ? ` · ${exercise.section}` : ""} · {exercise.sourceLabel}
                </span>
                <div className="button-row compact">
                  <span className="badge gray">难度 {exercise.difficulty}</span>
                  <span className="badge gray">使用 {exercise.usage.count} 次</span>
                  <span className="badge gray">{exercise.masteryLabel}</span>
                </div>
                <div className="form-grid two">
                  <div className="field">
                    <label htmlFor={`difficulty-${exercise.id}`}>难度修订</label>
                    <input
                      className="input"
                      id={`difficulty-${exercise.id}`}
                      inputMode="numeric"
                      max={5}
                      min={1}
                      onBlur={(event) =>
                        updatePreference(exercise, {
                          difficultyOverride: event.target.value ? Number.parseInt(event.target.value, 10) : null,
                        })
                      }
                      defaultValue={exercise.preference.difficultyOverride ?? ""}
                      placeholder={`${exercise.originalDifficulty}`}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`note-${exercise.id}`}>教师备注</label>
                    <input
                      className="input"
                      defaultValue={exercise.preference.note}
                      id={`note-${exercise.id}`}
                      onBlur={(event) => updatePreference(exercise, { note: event.target.value })}
                    />
                  </div>
                </div>
                <div className="button-row">
                  <button
                    className="button"
                    disabled={exercise.preference.isDisabled || isLibraryPending}
                    onClick={() => appendExercise(exercise.id)}
                    type="button"
                  >
                    <Plus size={18} />
                    加入
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => updatePreference(exercise, { isFavorite: !exercise.preference.isFavorite })}
                    type="button"
                  >
                    <Star size={18} />
                    {exercise.preference.isFavorite ? "已收藏" : "收藏"}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => updatePreference(exercise, { isDisabled: !exercise.preference.isDisabled })}
                    type="button"
                  >
                    {exercise.preference.isDisabled ? "启用" : "停用"}
                  </button>
                </div>
              </article>
            ))}
            {libraryItems.length === 0 ? <div className="empty">没有匹配的教材题源。</div> : null}
          </div>
        </section>
      ) : null}
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
              <MathContentEditor
                id={`prompt-${item.clientId}`}
                label="题目"
                value={item.prompt}
                onChange={(value) => updateItem(item.clientId, "prompt", value)}
              />
            </div>
            <div className="form-grid two">
              <div className="field">
                <MathContentEditor
                  id={`answer-${item.clientId}`}
                  label="答案"
                  value={item.answerText ?? ""}
                  onChange={(value) => updateItem(item.clientId, "answerText", value)}
                  compact
                />
              </div>
              <div className="field">
                <MathContentEditor
                  id={`analysis-${item.clientId}`}
                  label="解析"
                  value={item.analysisText ?? ""}
                  onChange={(value) => updateItem(item.clientId, "analysisText", value)}
                  compact
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
            <div className="print-prompt">
              <MathMarkdown content={item.prompt} />
            </div>
            <div className="print-answer">
              <strong>答案</strong>
              <MathMarkdown content={item.answerText} />
              <strong>解析</strong>
              <MathMarkdown content={item.analysisText} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
