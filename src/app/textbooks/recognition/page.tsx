import { BookOpenCheck, CheckCircle2, XCircle } from "lucide-react";
import { confirmTextbookCandidate, rejectTextbookCandidate } from "@/app/actions";
import { TextbookRecognitionRunner } from "@/components/TextbookRecognitionRunner";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/labels";
import { textbookPdfFiles } from "@/lib/textbook-recognition";

export default async function TextbookRecognitionPage() {
  await requireTeacher();
  const [pages, candidates, knowledgePoints] = await Promise.all([
    prisma.textbookPageRecognition.findMany({
      orderBy: [{ textbook: "asc" }, { pageNumber: "asc" }],
    }),
    prisma.textbookExerciseCandidate.findMany({
      where: { rejected: false },
      include: { knowledgePoint: true, textbookExercise: true },
      orderBy: [{ accepted: "asc" }, { confidence: "asc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.knowledgePoint.findMany({
      orderBy: [{ textbook: "asc" }, { chapter: "asc" }, { name: "asc" }],
    }),
  ]);
  const pageMap = new Map<string, { total: number; ocr: number; confidence: number }>();
  for (const page of pages) {
    const current = pageMap.get(page.textbook) ?? { total: 0, ocr: 0, confidence: 0 };
    current.total += 1;
    current.ocr += page.source.includes("OCR") ? 1 : 0;
    current.confidence += page.confidence;
    pageMap.set(page.textbook, current);
  }
  const lowConfidence = candidates.filter((candidate) => !candidate.accepted || candidate.confidence < 70);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">教材识别</h1>
          <p className="page-kicker">本地 PDF 渲染、OCR 与题源候选确认。</p>
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
                页面 · OCR {item?.ocr ?? 0} 页 · 平均置信 {avg || "未识别"}
              </span>
            </div>
          );
        })}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title">
          <BookOpenCheck size={18} />
          待确认题源
        </h2>
        {lowConfidence.length === 0 ? (
          <div className="empty">暂无需要确认的教材题源。可以重跑识别或直接到练习包题库中使用已入库题源。</div>
        ) : (
          <div className="list">
            {lowConfidence.map((candidate) => (
              <div className="list-item" key={candidate.id}>
                <div className="item-top">
                  <strong>{candidate.knowledgePoint?.name ?? candidate.section ?? "未定位知识点"}</strong>
                  <span className={candidate.confidence >= 70 ? "badge green" : "badge orange"}>
                    {candidate.confidence} 分
                  </span>
                </div>
                <span className="muted">
                  {candidate.textbook} · {candidate.chapter}
                  {candidate.sourcePage ? ` · p.${candidate.sourcePage}` : ""} · {formatDate(candidate.updatedAt)}
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
                    <label htmlFor={`prompt-${candidate.id}`}>题干</label>
                    <textarea
                      className="textarea"
                      defaultValue={candidate.prompt}
                      id={`prompt-${candidate.id}`}
                      name="prompt"
                    />
                  </div>
                  <div className="form-grid two">
                    <div className="field">
                      <label htmlFor={`answer-${candidate.id}`}>答案</label>
                      <textarea
                        className="textarea compact"
                        defaultValue={candidate.answerText ?? ""}
                        id={`answer-${candidate.id}`}
                        name="answerText"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`analysis-${candidate.id}`}>解析</label>
                      <textarea
                        className="textarea compact"
                        defaultValue={candidate.analysisText ?? ""}
                        id={`analysis-${candidate.id}`}
                        name="analysisText"
                      />
                    </div>
                  </div>
                  <div className="button-row">
                    <button className="button" type="submit">
                      <CheckCircle2 size={18} />
                      确认为题源
                    </button>
                    <button
                      className="button secondary"
                      formAction={rejectTextbookCandidate}
                      name="candidateId"
                      type="submit"
                      value={candidate.id}
                    >
                      <XCircle size={18} />
                      忽略
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
