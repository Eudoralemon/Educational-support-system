import { BookOpenCheck, CheckCircle2, FileText, Filter, XCircle } from "lucide-react";
import { Prisma, TextbookContentBlockType } from "@prisma/client";
import {
  archiveTextbookCandidate,
  archiveTextbookContentBlock,
  confirmTextbookCandidate,
  rejectTextbookCandidate,
  saveTextbookCandidate,
  updateTextbookContentBlock,
} from "@/app/actions";
import { MathContentEditor } from "@/components/MathContentEditor";
import { MathMarkdown } from "@/components/MathMarkdown";
import { TextbookRecognitionRunner } from "@/components/TextbookRecognitionRunner";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/labels";
import { textbookPdfFiles } from "@/lib/textbook-recognition";

const blockTypeLabels: Record<TextbookContentBlockType, string> = {
  CONCEPT: "正文",
  EXAMPLE: "例题",
  EXERCISE: "练习/习题",
  THINKING: "思考",
  EXPLORATION: "探究",
  READING: "阅读",
  SUMMARY: "小结",
  ANSWER: "答案",
  ANALYSIS: "解析",
  OTHER: "其他",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  return firstValue(params[key])?.trim() || "";
}

function asBlockType(value: string) {
  return Object.values(TextbookContentBlockType).includes(value as TextbookContentBlockType)
    ? (value as TextbookContentBlockType)
    : undefined;
}

export default async function TextbookRecognitionPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireTeacher();
  const params = searchParams ? await searchParams : {};
  const blockTextbook = searchValue(params, "textbook");
  const blockType = asBlockType(searchValue(params, "blockType"));
  const blockQuery = searchValue(params, "q");
  const lowOnly = searchValue(params, "lowOnly") === "1";
  const blockWhere: Prisma.TextbookContentBlockWhereInput = {
    textbook: blockTextbook || undefined,
    blockType,
    isArchived: false,
    confidence: lowOnly ? { lt: 70 } : undefined,
    OR: blockQuery
      ? [
          { contentText: { contains: blockQuery } },
          { title: { contains: blockQuery } },
          { chapter: { contains: blockQuery } },
          { section: { contains: blockQuery } },
          { knowledgePoint: { name: { contains: blockQuery } } },
        ]
      : undefined,
  };
  const [pages, candidates, knowledgePoints, contentBlocks, blockCounts] = await Promise.all([
    prisma.textbookPageRecognition.findMany({
      orderBy: [{ textbook: "asc" }, { pageNumber: "asc" }],
    }),
    prisma.textbookExerciseCandidate.findMany({
      where: { rejected: false, isArchived: false },
      include: { knowledgePoint: true, textbookExercise: true, sourceBlock: true },
      orderBy: [{ accepted: "asc" }, { confidence: "asc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.knowledgePoint.findMany({
      orderBy: [{ textbook: "asc" }, { chapter: "asc" }, { name: "asc" }],
    }),
    prisma.textbookContentBlock.findMany({
      where: blockWhere,
      include: { knowledgePoint: true },
      orderBy: [{ textbook: "asc" }, { order: "asc" }],
      take: 120,
    }),
    prisma.textbookContentBlock.groupBy({
      by: ["textbook", "blockType"],
      where: { isArchived: false },
      _count: { _all: true },
    }),
  ]);
  const pageMap = new Map<string, { total: number; pdfText: number; confidence: number }>();
  for (const page of pages) {
    const current = pageMap.get(page.textbook) ?? { total: 0, pdfText: 0, confidence: 0 };
    current.total += 1;
    current.pdfText += page.source.includes("PDF_JS_TEXT") ? 1 : 0;
    current.confidence += page.confidence;
    pageMap.set(page.textbook, current);
  }
  const blockMap = new Map<string, number>();
  for (const item of blockCounts) {
    blockMap.set(item.textbook, (blockMap.get(item.textbook) ?? 0) + item._count._all);
  }
  const visibleCandidates = candidates;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">教材识别</h1>
          <p className="page-kicker">本地 PDF 文本层、结构化内容块与题源候选确认。</p>
        </div>
        <TextbookRecognitionRunner />
      </header>

      <section className="grid two">
        {Object.keys(textbookPdfFiles).map((textbook) => {
          const item = pageMap.get(textbook);
          const avg = item ? Math.round(item.confidence / Math.max(1, item.total)) : 0;
          return (
            <div className="stat" key={textbook}>
              <span className="stat-label">{textbook}</span>
              <strong className="stat-value">{item?.total ?? 0}</strong>
              <span className="muted">
                PDF 文本页 {item?.pdfText ?? 0} · 内容块 {blockMap.get(textbook) ?? 0} · 平均置信{" "}
                {avg || "未识别"}
              </span>
            </div>
          );
        })}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title">
          <FileText size={18} />
          教材内容块
        </h2>
        <form className="selector-toolbar" style={{ marginBottom: 12 }}>
          <select className="select" name="textbook" defaultValue={blockTextbook}>
            <option value="">全部教材</option>
            {Object.keys(textbookPdfFiles).map((textbook) => (
              <option key={textbook} value={textbook}>
                {textbook}
              </option>
            ))}
          </select>
          <select className="select" name="blockType" defaultValue={blockType ?? ""}>
            <option value="">全部类型</option>
            {Object.entries(blockTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input className="input" name="q" placeholder="搜索正文、章节或知识点" defaultValue={blockQuery} />
          <label className="inline-form">
            <input name="lowOnly" type="checkbox" value="1" defaultChecked={lowOnly} />
            <span className="muted">低置信</span>
          </label>
          <button className="button secondary" type="submit">
            <Filter size={18} />
            筛选
          </button>
        </form>
        {contentBlocks.length === 0 ? (
          <div className="empty">暂无结构化内容块。请先重跑本地教材识别。</div>
        ) : (
          <div className="list">
            {contentBlocks.map((block) => (
              <article className="list-item" key={block.id}>
                <div className="item-top">
                  <strong>{block.title || block.knowledgePoint?.name || block.section || block.chapter}</strong>
                  <div className="button-row compact">
                    {block.isTeacherEdited ? <span className="badge green">已修订</span> : null}
                    <span className={block.confidence >= 70 ? "badge green" : "badge orange"}>
                      {blockTypeLabels[block.blockType]} · {block.confidence} 分
                    </span>
                  </div>
                </div>
                <span className="muted">
                  {block.textbook} · {block.chapter}
                  {block.section ? ` · ${block.section}` : ""} · PDF 第 {block.sourcePageStart ?? "--"}-
                  {block.sourcePageEnd ?? "--"} 页
                </span>
                <MathMarkdown className="compact-text" content={block.contentText.slice(0, 520)} />
                <details className="no-print">
                  <summary className="muted">编辑识别内容</summary>
                  <form action={updateTextbookContentBlock} className="form-grid" style={{ marginTop: 12 }}>
                    <input name="blockId" type="hidden" value={block.id} />
                    <input name="chapter" type="hidden" value={block.chapter} />
                    <input name="section" type="hidden" value={block.section ?? ""} />
                    <div className="form-grid two">
                      <div className="field">
                        <label htmlFor={`block-title-${block.id}`}>标题</label>
                        <input
                          className="input"
                          defaultValue={block.title ?? ""}
                          id={`block-title-${block.id}`}
                          name="title"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`block-type-${block.id}`}>类型</label>
                        <select
                          className="select"
                          defaultValue={block.blockType}
                          id={`block-type-${block.id}`}
                          name="blockType"
                        >
                          {Object.entries(blockTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-grid two">
                      <div className="field">
                        <label htmlFor={`block-point-${block.id}`}>知识点</label>
                        <select
                          className="select"
                          defaultValue={block.knowledgePointId ?? ""}
                          id={`block-point-${block.id}`}
                          name="knowledgePointId"
                        >
                          <option value="">不关联知识点</option>
                          {knowledgePoints.map((point) => (
                            <option key={point.id} value={point.id}>
                              {point.textbook} · {point.chapter} · {point.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`block-label-${block.id}`}>来源标签</label>
                        <input
                          className="input"
                          defaultValue={block.sourceLabel}
                          id={`block-label-${block.id}`}
                          name="sourceLabel"
                        />
                      </div>
                    </div>
                    <div className="form-grid two">
                      <div className="field">
                        <label htmlFor={`block-page-start-${block.id}`}>起始页</label>
                        <input
                          className="input"
                          defaultValue={block.sourcePageStart ?? ""}
                          id={`block-page-start-${block.id}`}
                          inputMode="numeric"
                          name="sourcePageStart"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`block-page-end-${block.id}`}>结束页</label>
                        <input
                          className="input"
                          defaultValue={block.sourcePageEnd ?? ""}
                          id={`block-page-end-${block.id}`}
                          inputMode="numeric"
                          name="sourcePageEnd"
                        />
                      </div>
                    </div>
                    <MathContentEditor
                      id={`block-content-${block.id}`}
                      label="内容"
                      name="contentText"
                      value={block.contentText}
                    />
                    <div className="button-row">
                      <button className="button" type="submit">
                        <CheckCircle2 size={18} />
                        保存修订
                      </button>
                      <button className="button secondary" formAction={archiveTextbookContentBlock} type="submit">
                        <XCircle size={18} />
                        归档内容块
                      </button>
                    </div>
                  </form>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title">
          <BookOpenCheck size={18} />
          题源候选与已入库题源
        </h2>
        {visibleCandidates.length === 0 ? (
          <div className="empty">暂无教材题源。可重跑识别，或直接在练习包题库中使用已入库题源。</div>
        ) : (
          <div className="list">
            {visibleCandidates.map((candidate) => (
              <div className="list-item" key={candidate.id}>
                <div className="item-top">
                  <strong>{candidate.knowledgePoint?.name ?? candidate.section ?? "未定位知识点"}</strong>
                  <div className="button-row compact">
                    {candidate.isTeacherEdited ? <span className="badge green">已修订</span> : null}
                    {candidate.accepted ? <span className="badge green">已入库</span> : null}
                    <span className={candidate.confidence >= 70 ? "badge green" : "badge orange"}>
                      {candidate.confidence} 分
                    </span>
                  </div>
                </div>
                <span className="muted">
                  {candidate.textbook} · {candidate.chapter}
                  {candidate.sourcePage ? ` · PDF 第 ${candidate.sourcePage} 页` : ""} · {candidate.sourceLabel} ·{" "}
                  {candidate.sourceBlock ? blockTypeLabels[candidate.sourceBlock.blockType] : "未关联内容块"} ·{" "}
                  {formatDate(candidate.updatedAt)}
                </span>
                <form action={confirmTextbookCandidate} className="form-grid">
                  <input name="candidateId" type="hidden" value={candidate.id} />
                  <div className="form-grid two">
                    <div className="field">
                      <label htmlFor={`point-${candidate.id}`}>知识点</label>
                      <select
                        className="select"
                        defaultValue={candidate.knowledgePointId ?? ""}
                        id={`point-${candidate.id}`}
                        name="knowledgePointId"
                      >
                        {knowledgePoints.map((point) => (
                          <option key={point.id} value={point.id}>
                            {point.textbook} · {point.chapter} · {point.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>来源</label>
                      <div className="input">{candidate.sourceLabel}</div>
                    </div>
                  </div>
                  <div className="field">
                    <MathContentEditor
                      id={`prompt-${candidate.id}`}
                      label="题干"
                      name="prompt"
                      value={candidate.prompt}
                    />
                  </div>
                  <div className="form-grid two">
                    <div className="field">
                      <MathContentEditor
                        id={`answer-${candidate.id}`}
                        label="答案"
                        name="answerText"
                        value={candidate.answerText ?? ""}
                        compact
                      />
                    </div>
                    <div className="field">
                      <MathContentEditor
                        id={`analysis-${candidate.id}`}
                        label="解析"
                        name="analysisText"
                        value={candidate.analysisText ?? ""}
                        compact
                      />
                    </div>
                  </div>
                  <div className="button-row">
                    <button className="button secondary" formAction={saveTextbookCandidate} type="submit">
                      <CheckCircle2 size={18} />
                      保存草稿
                    </button>
                    <button className="button" type="submit">
                      <CheckCircle2 size={18} />
                      确认为题源
                    </button>
                    <button
                      className="button secondary"
                      formAction={rejectTextbookCandidate}
                      type="submit"
                    >
                      <XCircle size={18} />
                      忽略
                    </button>
                    <button
                      className="button secondary"
                      formAction={archiveTextbookCandidate}
                      type="submit"
                    >
                      <XCircle size={18} />
                      归档
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
