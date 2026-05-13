import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { CreatePracticePackButton } from "@/components/CreatePracticePackButton";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { requireTeacher } from "@/lib/auth";
import { getStudentDiagnostics } from "@/lib/diagnostics";

export default async function StudentDiagnosticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const diagnostics = await getStudentDiagnostics(id);

  if (!diagnostics.student) notFound();
  if (diagnostics.student.teacherId !== teacher.id) redirect("/dashboard");

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{diagnostics.student.name} 诊断</h1>
          <p className="page-kicker">江苏 · 苏教版 · 以个人错题为诊断单位</p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href={`/students/${diagnostics.student.id}`}>
            <ArrowLeft size={18} />
            返回档案
          </Link>
          <CreatePracticePackButton
            studentId={diagnostics.student.id}
            knowledgePointIds={diagnostics.knowledgePoints.slice(0, 5).map((item) => item.id)}
            label="按薄弱项出练习"
          />
        </div>
      </header>

      <section className="grid three">
        <div className="stat">
          <span className="stat-label">错题</span>
          <span className="stat-value">{diagnostics.totals.mistakes}</span>
        </div>
        <div className="stat">
          <span className="stat-label">重复薄弱项</span>
          <span className="stat-value">{diagnostics.totals.repeated}</span>
        </div>
        <div className="stat">
          <span className="stat-label">错误类型</span>
          <span className="stat-value">{diagnostics.errorTypes.length}</span>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <DiagnosticPanel
          knowledgePoints={diagnostics.knowledgePoints}
          errorTypes={diagnostics.errorTypes}
          dueMistakes={diagnostics.dueMistakes}
          trend={diagnostics.trend}
        />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title">
          <ClipboardList size={18} />
          重复薄弱项
        </h2>
        {diagnostics.repeatedKnowledge.length === 0 ? (
          <div className="empty">暂无重复薄弱项。</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>知识点</th>
                <th>教材章节</th>
                <th>次数</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.repeatedKnowledge.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.chapter}</td>
                  <td>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
