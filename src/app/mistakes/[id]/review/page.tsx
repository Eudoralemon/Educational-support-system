import Link from "next/link";
import { Bot, CheckCircle2, ScanText } from "lucide-react";
import { MistakeAttachmentField } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { MistakeRecognitionPanel } from "@/components/MistakeRecognitionPanel";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewCompletionForm } from "@/components/ReviewCompletionForm";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  aiTaskStatusLabels,
  aiTaskTypeLabels,
  formatDate,
  formatDay,
  mistakeStatusLabels,
  reviewResultLabels,
} from "@/lib/labels";
import { uploadUrl } from "@/lib/uploads";

function toDateInput(value: Date | null) {
  const date = value ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export default async function ReviewMistakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const [mistake, knowledgePoints, errorTypes] = await Promise.all([
    prisma.mistake.findUnique({
      where: { id },
      include: {
        student: true,
        errorType: true,
        knowledgeLinks: true,
        attachments: { orderBy: [{ field: "asc" }, { order: "asc" }, { createdAt: "asc" }] },
        textbookMatches: {
          include: { knowledgePoint: true, textbookExercise: true },
          orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "desc" }],
          take: 5,
        },
        aiTasks: { orderBy: { createdAt: "desc" } },
        reviewRecords: { orderBy: { reviewedAt: "desc" }, take: 6 },
      },
    }),
    prisma.knowledgePoint.findMany({
      orderBy: [{ module: "asc" }, { examWeight: "desc" }, { name: "asc" }],
    }),
    prisma.errorType.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  if (!mistake) notFound();
  if (mistake.student.teacherId !== teacher.id) redirect("/dashboard");

  const imageUrl = mistake.imagePath
    ? `/api/uploads/${encodeURIComponent(mistake.imagePath.replace("uploads/", ""))}`
    : null;
  const attachments = {
    QUESTION: mistake.attachments
      .filter((attachment) => attachment.field === MistakeAttachmentField.QUESTION)
      .map((attachment) => ({
        id: attachment.id,
        field: attachment.field,
        url: uploadUrl(attachment.imagePath),
        originalName: attachment.originalName,
        order: attachment.order,
      })),
    ANSWER: mistake.attachments
      .filter((attachment) => attachment.field === MistakeAttachmentField.ANSWER)
      .map((attachment) => ({
        id: attachment.id,
        field: attachment.field,
        url: uploadUrl(attachment.imagePath),
        originalName: attachment.originalName,
        order: attachment.order,
      })),
    ANALYSIS: mistake.attachments
      .filter((attachment) => attachment.field === MistakeAttachmentField.ANALYSIS)
      .map((attachment) => ({
        id: attachment.id,
        field: attachment.field,
        url: uploadUrl(attachment.imagePath),
        originalName: attachment.originalName,
        order: attachment.order,
      })),
    CORRECTION: mistake.attachments
      .filter((attachment) => attachment.field === MistakeAttachmentField.CORRECTION)
      .map((attachment) => ({
        id: attachment.id,
        field: attachment.field,
        url: uploadUrl(attachment.imagePath),
        originalName: attachment.originalName,
        order: attachment.order,
      })),
  };
  const legacyQuestionImageUrl = mistake.imagePath && !mistake.attachments.some((attachment) => attachment.imagePath === mistake.imagePath)
    ? imageUrl
    : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">错题校对</h1>
          <p className="page-kicker">
            <Link href={`/students/${mistake.studentId}`}>{mistake.student.name}</Link> ·{" "}
            江苏 · 苏教版 · {mistakeStatusLabels[mistake.status]}
          </p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href={`/students/${mistake.studentId}`}>
            <CheckCircle2 size={18} />
            学生档案
          </Link>
        </div>
      </header>

      <section className="grid main">
        <div className="panel">
          <h2 className="panel-title">
            <CheckCircle2 size={18} />
            人工确认
          </h2>
          <ReviewForm
            mistake={{
              id: mistake.id,
              questionText: mistake.questionText,
              answerText: mistake.answerText,
              analysisText: mistake.analysisText,
              correctionNote: mistake.correctionNote,
              sourceYear: mistake.sourceYear,
              questionType: mistake.questionType,
              errorTypeId: mistake.errorTypeId,
              reviewDueAt: toDateInput(mistake.reviewDueAt),
              knowledgePointIds: mistake.knowledgeLinks.map((link) => link.knowledgePointId),
            }}
            knowledgePoints={knowledgePoints.map((point) => ({
              id: point.id,
              name: point.name,
              module: point.module,
              textbook: point.textbook,
              chapter: point.chapter,
            }))}
            errorTypes={errorTypes.map((type) => ({
              id: type.id,
              name: type.name,
            }))}
            attachments={attachments}
            legacyQuestionImageUrl={legacyQuestionImageUrl}
          />
        </div>

        <aside className="grid">
          <section className="panel">
            <h2 className="panel-title">
              <ScanText size={18} />
              教材识别
            </h2>
            <MistakeRecognitionPanel
              initialMatches={mistake.textbookMatches.map((match) => ({
                id: match.id,
                score: match.score,
                status: match.status,
                reason: match.reason,
                textbook: match.textbook,
                chapter: match.chapter,
                section: match.section,
                sourcePage: match.sourcePage,
                sourceLabel: match.sourceLabel,
                knowledgePoint: match.knowledgePoint
                  ? {
                      id: match.knowledgePoint.id,
                      name: match.knowledgePoint.name,
                      module: match.knowledgePoint.module,
                    }
                  : null,
                prompt: match.textbookExercise?.prompt ?? "",
              }))}
              mistakeId={mistake.id}
            />
          </section>

          {mistake.status === "REVIEWED" ? (
            <section className="panel">
              <h2 className="panel-title">
                <CheckCircle2 size={18} />
                完成一次复习
              </h2>
              <ReviewCompletionForm mistakeId={mistake.id} />
              <p className="muted">
                当前窗口：{mistake.reviewDueAt ? formatDay(mistake.reviewDueAt) : "假期集中或待计算"}
              </p>
            </section>
          ) : null}

          <section className="panel">
            <h2 className="panel-title">
              <CheckCircle2 size={18} />
              复习记录
            </h2>
            {mistake.reviewRecords.length === 0 ? (
              <div className="empty">暂无复习记录。</div>
            ) : (
              <div className="list">
                {mistake.reviewRecords.map((record) => (
                  <div className="list-item" key={record.id}>
                    <div className="item-top">
                      <strong>{reviewResultLabels[record.result]}</strong>
                      <span className="badge gray">{record.scoreAfter ?? 50} 分</span>
                    </div>
                    <span className="muted">
                      {formatDate(record.reviewedAt)}
                      {record.nextReviewAt ? ` · 下次窗口 ${formatDay(record.nextReviewAt)}` : ""}
                    </span>
                    {record.note ? <span className="muted">{record.note}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <Bot size={18} />
              AI 任务
            </h2>
            {mistake.aiTasks.length === 0 ? (
              <div className="empty">暂无 AI 任务。</div>
            ) : (
              <div className="list">
                {mistake.aiTasks.map((task) => (
                  <div className="list-item" key={task.id}>
                    <div className="item-top">
                      <strong>{aiTaskTypeLabels[task.type]}</strong>
                      <span className={task.status === "SKIPPED" ? "badge gray" : "badge"}>
                        {aiTaskStatusLabels[task.status]}
                      </span>
                    </div>
                    <span className="muted">{task.provider} · {formatDate(task.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
    </>
  );
}
