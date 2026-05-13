import Link from "next/link";
import { Bot, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ReviewForm } from "@/components/ReviewForm";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aiTaskStatusLabels, aiTaskTypeLabels, formatDate, mistakeStatusLabels, regionLabels } from "@/lib/labels";

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
        student: { include: { classGroup: true } },
        errorType: true,
        knowledgeLinks: true,
        aiTasks: { orderBy: { createdAt: "desc" } },
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
  if (mistake.student.classGroup.teacherId !== teacher.id) redirect("/dashboard");

  const imageUrl = mistake.imagePath
    ? `/api/uploads/${encodeURIComponent(mistake.imagePath.replace("uploads/", ""))}`
    : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">错题校对</h1>
          <p className="page-kicker">
            <Link href={`/students/${mistake.studentId}`}>{mistake.student.name}</Link> ·{" "}
            {regionLabels[mistake.regionTag]} · {mistakeStatusLabels[mistake.status]}
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
              regionTag: mistake.regionTag,
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
              region: point.region,
            }))}
            errorTypes={errorTypes.map((type) => ({
              id: type.id,
              name: type.name,
            }))}
          />
        </div>

        <aside className="grid">
          <section className="panel">
            <h2 className="panel-title">
              <ImageIcon size={18} />
              题图
            </h2>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="错题题图" className="image-preview" src={imageUrl} />
            ) : (
              <div className="empty">没有上传题图。</div>
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
