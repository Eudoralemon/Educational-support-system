import Link from "next/link";
import { Archive, BarChart3, ClipboardList, RotateCcw, Settings, Trash2, Upload } from "lucide-react";
import { StudentStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { archiveStudent, hardDeleteStudent, restoreStudent, updateStudentReviewSettings } from "@/app/actions";
import { CreatePracticePackButton } from "@/components/CreatePracticePackButton";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { requireTeacher } from "@/lib/auth";
import { getStudentDiagnostics } from "@/lib/diagnostics";
import { prisma } from "@/lib/db";
import {
  formatDate,
  formatDay,
  mistakeStatusLabels,
  practicePackStatusLabels,
  reviewCadenceLabels,
  reviewResultLabels,
} from "@/lib/labels";
import { getStudentReviewOverview } from "@/lib/review";

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

  const [diagnostics, reviewOverview] = await Promise.all([
    getStudentDiagnostics(student.id),
    getStudentReviewOverview(student.id, teacher.id),
  ]);
  if (!reviewOverview) notFound();
  const lowMasteryCount = reviewOverview.masteries.filter((item) => item.score < 60).length;
  const isArchived = student.status === StudentStatus.ARCHIVED;

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
          {isArchived ? (
            <span className="badge gray">已归档</span>
          ) : (
            <>
              <Link className="button secondary" href="/mistakes/new">
                <Upload size={18} />
                录入错题
              </Link>
              <CreatePracticePackButton studentId={student.id} />
            </>
          )}
        </div>
      </header>

      {isArchived ? (
        <section className="empty" style={{ marginBottom: 16 }}>
          该学生已归档，不再进入日常工作台、错题录入、复习窗口和练习包生成。可在页面右侧恢复。
          {student.archivedReason ? ` 归档原因：${student.archivedReason}` : ""}
        </section>
      ) : null}

      <section className="grid three">
        <div className="stat">
          <span className="stat-label">错题</span>
          <span className="stat-value">{student.mistakes.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">低掌握度</span>
          <span className="stat-value">{lowMasteryCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">本次复习窗口</span>
          <span className="stat-value">{reviewOverview.windowTasks.length}</span>
        </div>
      </section>

      <nav className="section-nav" aria-label="学生档案分区">
        <a href="#mistakes">错题记录</a>
        <a href="#diagnosis">诊断建议</a>
        <a href="#review-plan">复习计划</a>
        <a href="#practice-packs">练习包</a>
      </nav>

      <section className="grid main" style={{ marginTop: 16 }}>
        <div className="grid">
          <section className="panel" id="diagnosis">
            <h2 className="panel-title">
              <BarChart3 size={18} />
              教学建议
            </h2>
            {diagnostics.knowledgePoints.length === 0 ? (
              <div className="empty">校对错题后会生成薄弱项建议。</div>
            ) : (
              <div className="list">
                {diagnostics.knowledgePoints.slice(0, 4).map((item) => (
                  <div className="list-item" key={item.id}>
                    <div className="item-top">
                      <strong>{item.name}</strong>
                      <span className={item.masteryScore && item.masteryScore < 60 ? "badge orange" : "badge"}>
                        {item.masteryScore ?? 50} 分
                      </span>
                    </div>
                    <span className="muted">
                      {item.chapter} · 错题 {item.count} 次 · 建议配 1 道回顾题和 1 道迁移题
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" id="mistakes">
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

          <section className="panel" id="practice-packs">
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
                    <span className="muted">
                      {practicePackStatusLabels[pack.status]} · {formatDate(pack.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="grid">
          <section className="panel" id="review-plan">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              本次复习窗口
            </h2>
            <form action={updateStudentReviewSettings} className="form-grid compact-form">
              <input name="studentId" type="hidden" value={student.id} />
              <div className="form-grid two">
                <div className="field">
                  <label htmlFor="reviewCadence">可登录频率</label>
                  <select
                    className="select"
                    id="reviewCadence"
                    name="reviewCadence"
                    defaultValue={student.reviewCadence}
                  >
                    {Object.entries(reviewCadenceLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="reviewBatchSize">每次题量</label>
                  <input
                    className="input"
                    id="reviewBatchSize"
                    inputMode="numeric"
                    name="reviewBatchSize"
                    defaultValue={student.reviewBatchSize}
                  />
                </div>
              </div>
              <button className="button secondary" type="submit">
                <Settings size={18} />
                保存复习设置
              </button>
            </form>
            <p className="muted">{reviewOverview.windowHint}</p>
            {reviewOverview.windowTasks.length === 0 ? (
              <div className="empty">
                {reviewOverview.pool.length
                  ? "当前还不是可登录窗口，任务已在待复习池中积累。"
                  : "暂无需要释放的复习任务。"}
              </div>
            ) : (
              <div className="list">
                {reviewOverview.windowTasks.map((item) => (
                  <Link className="list-item" href={`/mistakes/${item.id}/review`} key={item.id}>
                    <div className="item-top">
                      <strong>{item.questionText ?? "题图待校对"}</strong>
                      <span className={item.masteryScore < 60 ? "badge orange" : "badge green"}>
                        {item.masteryScore} 分
                      </span>
                    </div>
                    <span className="muted">
                      {item.reviewDueAt ? `窗口 ${formatDay(item.reviewDueAt)}` : "假期集中释放"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <Archive size={18} />
              学生状态
            </h2>
            {isArchived ? (
              <form action={restoreStudent} className="form-grid">
                <input name="studentId" type="hidden" value={student.id} />
                <div className="empty">
                  已归档
                  {student.archivedAt ? ` · ${formatDay(student.archivedAt)}` : ""}
                </div>
                <button className="button" type="submit">
                  <RotateCcw size={18} />
                  恢复学生
                </button>
              </form>
            ) : (
              <form action={archiveStudent} className="form-grid">
                <input name="studentId" type="hidden" value={student.id} />
                <div className="field">
                  <label htmlFor="archivedReason">归档原因</label>
                  <input
                    className="input"
                    id="archivedReason"
                    name="archivedReason"
                    placeholder="如：已毕业、暂停辅导、重复录入"
                  />
                </div>
                <button className="button secondary" type="submit">
                  <Archive size={18} />
                  归档学生
                </button>
              </form>
            )}
          </section>

          <section className="panel danger-zone">
            <h2 className="panel-title">
              <Trash2 size={18} />
              危险区
            </h2>
            <form action={hardDeleteStudent} className="form-grid">
              <input name="studentId" type="hidden" value={student.id} />
              <div className="field">
                <label htmlFor="confirmName">输入学生姓名后永久删除</label>
                <input className="input" id="confirmName" name="confirmName" placeholder={student.name} />
              </div>
              <button className="button danger" type="submit">
                <Trash2 size={18} />
                永久删除学生
              </button>
            </form>
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <BarChart3 size={18} />
              掌握度
            </h2>
            {reviewOverview.masteries.length === 0 ? (
              <div className="empty">复习后会显示掌握度。</div>
            ) : (
              <div className="list">
                {reviewOverview.masteries.slice(0, 8).map((item) => (
                  <div className="progress-row" key={item.id}>
                    <div className="progress-meta">
                      <strong>{item.knowledgePoint.name}</strong>
                      <span className={item.score < 60 ? "badge orange" : "badge"}>{item.score} 分</span>
                    </div>
                    <div className="muted">
                      {item.knowledgePoint.chapter}
                      {item.nextReviewAt ? ` · 窗口 ${formatDay(item.nextReviewAt)}` : ""}
                    </div>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${item.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              复习历史
            </h2>
            {reviewOverview.records.length === 0 ? (
              <div className="empty">暂无复习记录。</div>
            ) : (
              <div className="list">
                {reviewOverview.records.map((record) => (
                  <Link className="list-item" href={`/mistakes/${record.mistakeId}/review`} key={record.id}>
                    <div className="item-top">
                      <strong>{reviewResultLabels[record.result]}</strong>
                      <span className="badge gray">{record.scoreAfter ?? 50} 分</span>
                    </div>
                    <span className="muted">
                      {record.mistake.questionText ?? "题图待校对"} · {formatDate(record.reviewedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
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
