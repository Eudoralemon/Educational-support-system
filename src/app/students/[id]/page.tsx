import Link from "next/link";
import { BarChart3, ClipboardList, Upload } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { CreatePracticePackButton } from "@/components/CreatePracticePackButton";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { requireTeacher } from "@/lib/auth";
import { getStudentDiagnostics } from "@/lib/diagnostics";
import { prisma } from "@/lib/db";
import { formatDate, mistakeStatusLabels } from "@/lib/labels";

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      mistakes: {
        include: {
          errorType: true,
          knowledgeLinks: { include: { knowledgePoint: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      practicePacks: {
        include: { items: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!student) notFound();
  if (student.teacherId !== teacher.id) redirect("/dashboard");

  const diagnostics = await getStudentDiagnostics(student.id);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{student.name}</h1>
          <p className="page-kicker">
            江苏 · 苏教版 · {student.grade} · {student.school || "未填写学校"}
          </p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href={`/diagnostics/student/${student.id}`}>
            <BarChart3 size={18} />
            诊断看板
          </Link>
          <Link className="button secondary" href="/mistakes/new">
            <Upload size={18} />
            录入错题
          </Link>
          <CreatePracticePackButton studentId={student.id} />
        </div>
      </header>

      <section className="grid three">
        <div className="stat">
          <span className="stat-label">错题</span>
          <span className="stat-value">{student.mistakes.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">重复薄弱项</span>
          <span className="stat-value">{diagnostics.repeatedKnowledge.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">练习包</span>
          <span className="stat-value">{student.practicePacks.length}</span>
        </div>
      </section>

      <section className="grid main" style={{ marginTop: 16 }}>
        <div className="grid">
          <section className="panel">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              错题
            </h2>
            {student.mistakes.length === 0 ? (
              <div className="empty">暂无错题。</div>
            ) : (
              <div className="list">
                {student.mistakes.map((mistake) => (
                  <Link className="list-item" href={`/mistakes/${mistake.id}/review`} key={mistake.id}>
                    <div className="item-top">
                      <strong>{mistake.questionText || "题图待校对"}</strong>
                      <span className={mistake.status === "REVIEWED" ? "badge green" : "badge orange"}>
                        {mistakeStatusLabels[mistake.status]}
                      </span>
                    </div>
                    <span className="muted">
                      {mistake.knowledgeLinks
                        .map((link) => `${link.knowledgePoint.chapter} · ${link.knowledgePoint.name}`)
                        .join("、") || "未标知识点"}
                      {mistake.errorType ? ` · ${mistake.errorType.name}` : ""} · {formatDate(mistake.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              练习包
            </h2>
            {student.practicePacks.length === 0 ? (
              <div className="empty">暂无练习包。</div>
            ) : (
              <div className="list">
                {student.practicePacks.map((pack) => (
                  <Link className="list-item" href={`/practice-packs/${pack.id}`} key={pack.id}>
                    <div className="item-top">
                      <strong>{pack.title}</strong>
                      <span className="badge gray">{pack.items.length} 题</span>
                    </div>
                    <span className="muted">{formatDate(pack.createdAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <DiagnosticPanel
          knowledgePoints={diagnostics.knowledgePoints}
          errorTypes={diagnostics.errorTypes}
          dueMistakes={diagnostics.dueMistakes}
          trend={diagnostics.trend}
        />
      </section>
    </>
  );
}
