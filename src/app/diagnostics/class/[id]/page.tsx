import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { CreatePracticePackButton } from "@/components/CreatePracticePackButton";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { requireTeacher } from "@/lib/auth";
import { getClassDiagnostics } from "@/lib/diagnostics";
import { regionLabels } from "@/lib/labels";

export default async function ClassDiagnosticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const diagnostics = await getClassDiagnostics(id);

  if (!diagnostics.classGroup) notFound();
  if (diagnostics.classGroup.teacherId !== teacher.id) redirect("/dashboard");

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{diagnostics.classGroup.name} 诊断</h1>
          <p className="page-kicker">{regionLabels[diagnostics.classGroup.region]}</p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href={`/classes/${diagnostics.classGroup.id}`}>
            <ArrowLeft size={18} />
            返回班级
          </Link>
          <CreatePracticePackButton
            classId={diagnostics.classGroup.id}
            knowledgePointIds={diagnostics.knowledgePoints.slice(0, 5).map((item) => item.id)}
            label="按薄弱项出练习"
          />
        </div>
      </header>

      <section className="grid three">
        <div className="stat">
          <span className="stat-label">学生</span>
          <span className="stat-value">{diagnostics.totals.students}</span>
        </div>
        <div className="stat">
          <span className="stat-label">错题</span>
          <span className="stat-value">{diagnostics.totals.mistakes}</span>
        </div>
        <div className="stat">
          <span className="stat-label">薄弱项</span>
          <span className="stat-value">{diagnostics.knowledgePoints.length}</span>
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
          出题依据
        </h2>
        {diagnostics.knowledgePoints.length === 0 ? (
          <div className="empty">暂无可用于出题的薄弱知识点。</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>知识点</th>
                <th>模块</th>
                <th>错题次数</th>
                <th>涉及学生</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.knowledgePoints.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.module}</td>
                  <td>{item.count}</td>
                  <td>{item.students}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
