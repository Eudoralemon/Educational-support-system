import Link from "next/link";
import { BarChart3, BookOpen, ClipboardList, Plus, Upload, Users } from "lucide-react";
import { createClass } from "@/app/actions";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, mistakeStatusLabels, regionLabels } from "@/lib/labels";

export default async function DashboardPage() {
  const teacher = await requireTeacher();
  const [classes, recentMistakes, practicePacks] = await Promise.all([
    prisma.classGroup.findMany({
      where: { teacherId: teacher.id },
      include: {
        students: true,
        _count: { select: { mistakes: true, practicePacks: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mistake.findMany({
      where: { classGroup: { teacherId: teacher.id } },
      include: { student: true, classGroup: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.practicePack.findMany({
      where: { teacherId: teacher.id },
      include: { classGroup: true, student: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const studentCount = classes.reduce((sum, item) => sum + item.students.length, 0);
  const mistakeCount = classes.reduce((sum, item) => sum + item._count.mistakes, 0);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">工作台</h1>
          <p className="page-kicker">今天从错题、薄弱项和练习包开始。</p>
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
          <span className="stat-label">班级</span>
          <span className="stat-value">{classes.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">学生</span>
          <span className="stat-value">{studentCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">错题</span>
          <span className="stat-value">{mistakeCount}</span>
        </div>
      </section>

      <section className="grid main" style={{ marginTop: 16 }}>
        <div className="grid">
          <section className="panel" id="classes">
            <h2 className="panel-title">
              <Users size={18} />
              班级
            </h2>
            {classes.length === 0 ? (
              <div className="empty">还没有班级。</div>
            ) : (
              <div className="grid two">
                {classes.map((classGroup) => (
                  <Link className="card" href={`/classes/${classGroup.id}`} key={classGroup.id}>
                    <div className="item-top">
                      <strong>{classGroup.name}</strong>
                      <span className="badge">{regionLabels[classGroup.region]}</span>
                    </div>
                    <span className="muted">
                      {classGroup.students.length} 名学生 · {classGroup._count.mistakes} 道错题 ·{" "}
                      {classGroup._count.practicePacks} 份练习
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
                      {pack.student?.name ?? pack.classGroup?.name ?? "未绑定对象"} · {formatDate(pack.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="panel">
          <h2 className="panel-title">
            <Plus size={18} />
            新建班级
          </h2>
          <form action={createClass} className="form-grid">
            <div className="field">
              <label htmlFor="class-name">班级名称</label>
              <input className="input" id="class-name" name="name" placeholder="高三数学A班" />
            </div>
            <div className="field">
              <label htmlFor="class-region">地区标签</label>
              <select className="select" id="class-region" name="region" defaultValue="COMMON">
                <option value="COMMON">通用</option>
                <option value="JS">江苏</option>
                <option value="GD">广东</option>
              </select>
            </div>
            <button className="button" type="submit">
              <BookOpen size={18} />
              保存班级
            </button>
          </form>
        </aside>
      </section>
    </>
  );
}
