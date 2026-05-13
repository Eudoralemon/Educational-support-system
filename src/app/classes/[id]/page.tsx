import Link from "next/link";
import { BarChart3, ClipboardList, Plus, Upload, UserRound } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createStudent } from "@/app/actions";
import { CreatePracticePackButton } from "@/components/CreatePracticePackButton";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { requireTeacher } from "@/lib/auth";
import { getClassDiagnostics } from "@/lib/diagnostics";
import { prisma } from "@/lib/db";
import { formatDate, mistakeStatusLabels, regionLabels } from "@/lib/labels";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const classGroup = await prisma.classGroup.findUnique({
    where: { id },
    include: {
      students: {
        include: {
          _count: { select: { mistakes: true, practicePacks: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      mistakes: {
        include: { student: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  if (!classGroup) notFound();
  if (classGroup.teacherId !== teacher.id) redirect("/dashboard");

  const diagnostics = await getClassDiagnostics(classGroup.id);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{classGroup.name}</h1>
          <p className="page-kicker">{regionLabels[classGroup.region]} · {classGroup.students.length} 名学生</p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href={`/diagnostics/class/${classGroup.id}`}>
            <BarChart3 size={18} />
            诊断看板
          </Link>
          <Link className="button secondary" href="/mistakes/new">
            <Upload size={18} />
            录入错题
          </Link>
          <CreatePracticePackButton classId={classGroup.id} />
        </div>
      </header>

      <section className="grid three">
        <div className="stat">
          <span className="stat-label">学生</span>
          <span className="stat-value">{classGroup.students.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">已校对错题</span>
          <span className="stat-value">{diagnostics.totals.reviewed}</span>
        </div>
        <div className="stat">
          <span className="stat-label">薄弱知识点</span>
          <span className="stat-value">{diagnostics.knowledgePoints.length}</span>
        </div>
      </section>

      <section className="grid main" style={{ marginTop: 16 }}>
        <div className="grid">
          <section className="panel">
            <h2 className="panel-title">
              <UserRound size={18} />
              学生
            </h2>
            {classGroup.students.length === 0 ? (
              <div className="empty">还没有学生。</div>
            ) : (
              <div className="grid two">
                {classGroup.students.map((student) => (
                  <Link className="card" href={`/students/${student.id}`} key={student.id}>
                    <div className="item-top">
                      <strong>{student.name}</strong>
                      <span className="badge">{regionLabels[student.region]}</span>
                    </div>
                    <span className="muted">
                      {student.grade} · {student._count.mistakes} 道错题 · {student._count.practicePacks} 份练习
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              最近错题
            </h2>
            {classGroup.mistakes.length === 0 ? (
              <div className="empty">暂无错题。</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>学生</th>
                    <th>题目</th>
                    <th>状态</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {classGroup.mistakes.map((mistake) => (
                    <tr key={mistake.id}>
                      <td>
                        <Link href={`/students/${mistake.studentId}`}>{mistake.student.name}</Link>
                      </td>
                      <td>
                        <Link href={`/mistakes/${mistake.id}/review`}>{mistake.questionText || "题图待校对"}</Link>
                      </td>
                      <td>
                        <span className={mistake.status === "REVIEWED" ? "badge green" : "badge orange"}>
                          {mistakeStatusLabels[mistake.status]}
                        </span>
                      </td>
                      <td>{formatDate(mistake.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="grid">
          <section className="panel">
            <h2 className="panel-title">
              <Plus size={18} />
              新增学生
            </h2>
            <form action={createStudent} className="form-grid">
              <input name="classId" type="hidden" value={classGroup.id} />
              <div className="field">
                <label htmlFor="student-name">姓名</label>
                <input className="input" id="student-name" name="name" />
              </div>
              <div className="form-grid two">
                <div className="field">
                  <label htmlFor="student-grade">年级</label>
                  <input className="input" id="student-grade" name="grade" defaultValue="高三" />
                </div>
                <div className="field">
                  <label htmlFor="student-region">地区</label>
                  <select className="select" id="student-region" name="region" defaultValue={classGroup.region}>
                    <option value="COMMON">通用</option>
                    <option value="JS">江苏</option>
                    <option value="GD">广东</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="student-school">学校</label>
                <input className="input" id="student-school" name="school" />
              </div>
              <button className="button" type="submit">
                <Plus size={18} />
                保存学生
              </button>
            </form>
          </section>

          <DiagnosticPanel
            knowledgePoints={diagnostics.knowledgePoints}
            errorTypes={diagnostics.errorTypes}
            dueMistakes={diagnostics.dueMistakes}
            trend={diagnostics.trend}
          />
        </aside>
      </section>
    </>
  );
}
