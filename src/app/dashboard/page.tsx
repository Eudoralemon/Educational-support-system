import Link from "next/link";
import { BarChart3, BookOpen, ClipboardList, Plus, Upload, UserRound } from "lucide-react";
import { createStudent } from "@/app/actions";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { requireTeacher } from "@/lib/auth";
import { getTeacherDiagnostics } from "@/lib/diagnostics";
import { prisma } from "@/lib/db";
import { formatDate, mistakeStatusLabels, practicePackStatusLabels } from "@/lib/labels";

const textbookNames = [
  "苏教版高中数学 必修第1册",
  "苏教版高中数学 必修第2册",
  "苏教版高中数学 选择性必修1",
  "苏教版高中数学 选择性必修2",
];

export default async function DashboardPage() {
  const teacher = await requireTeacher();
  const [students, recentMistakes, practicePacks, diagnostics, textbookCount, exerciseCount] =
    await Promise.all([
      prisma.student.findMany({
        where: { teacherId: teacher.id },
        include: {
          _count: { select: { mistakes: true, practicePacks: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mistake.findMany({
        where: { student: { teacherId: teacher.id } },
        include: { student: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.practicePack.findMany({
        where: { teacherId: teacher.id },
        include: { student: true, items: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      getTeacherDiagnostics(teacher.id),
      prisma.knowledgePoint.count(),
      prisma.textbookExercise.count(),
    ]);

  const mistakeCount = students.reduce((sum, item) => sum + item._count.mistakes, 0);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">学生工作台</h1>
          <p className="page-kicker">江苏 · 苏教版 · 以学生为单位沉淀错题诊断。</p>
        </div>
        <div className="button-row">
          <Link className="button" href="/mistakes/new">
            <Upload size={18} />
            录入错题
          </Link>
        </div>
      </header>

      <section className="grid three">
        <div className="stat">
          <span className="stat-label">学生</span>
          <span className="stat-value">{students.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">错题</span>
          <span className="stat-value">{mistakeCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">教材题源</span>
          <span className="stat-value">{exerciseCount}</span>
        </div>
      </section>

      <section className="grid main" style={{ marginTop: 16 }}>
        <div className="grid">
          <section className="panel" id="students">
            <h2 className="panel-title">
              <UserRound size={18} />
              学生
            </h2>
            {students.length === 0 ? (
              <div className="empty">还没有学生。</div>
            ) : (
              <div className="grid two">
                {students.map((student) => (
                  <Link className="card" href={`/students/${student.id}`} key={student.id}>
                    <div className="item-top">
                      <strong>{student.name}</strong>
                      <span className="badge">江苏</span>
                    </div>
                    <span className="muted">
                      {student.grade} · {student.school || "未填写学校"} · {student._count.mistakes} 道错题 ·{" "}
                      {student._count.practicePacks} 份练习
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel" id="diagnostics">
            <h2 className="panel-title">
              <BarChart3 size={18} />
              最近错题
            </h2>
            {recentMistakes.length === 0 ? (
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
                  {recentMistakes.map((mistake) => (
                    <tr key={mistake.id}>
                      <td>
                        <Link href={`/students/${mistake.studentId}`}>{mistake.student.name}</Link>
                      </td>
                      <td>
                        <Link href={`/mistakes/${mistake.id}/review`}>
                          {mistake.questionText || "题图待校对"}
                        </Link>
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

          <section className="panel" id="practice">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              练习包
            </h2>
            {practicePacks.length === 0 ? (
              <div className="empty">还没有练习包。</div>
            ) : (
              <div className="list">
                {practicePacks.map((pack) => (
                  <Link className="list-item" href={`/practice-packs/${pack.id}`} key={pack.id}>
                    <div className="item-top">
                      <strong>{pack.title}</strong>
                      <span className="badge gray">{pack.items.length} 题</span>
                    </div>
                    <span className="muted">
                      {pack.student.name} · {practicePackStatusLabels[pack.status]} · {formatDate(pack.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
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
                  <label>地区</label>
                  <div className="input">江苏</div>
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

          <section className="panel">
            <h2 className="panel-title">
              <BookOpen size={18} />
              教材范围 · {textbookCount} 个知识点
            </h2>
            <div className="list">
              {textbookNames.map((name) => (
                <div className="list-item" key={name}>
                  <strong>{name}</strong>
                  <span className="muted">已抽取目录为知识点标签</span>
                </div>
              ))}
            </div>
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
