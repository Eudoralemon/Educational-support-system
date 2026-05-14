import Link from "next/link";
import { AlertCircle, BarChart3, Clock, Target } from "lucide-react";
import { formatDay } from "@/lib/labels";

type KnowledgePointSummary = {
  id: string;
  name: string;
  module: string;
  textbook?: string;
  chapter?: string;
  count: number;
  students?: number;
  masteryScore?: number;
  nextReviewAt?: Date | string | null;
};

type ErrorSummary = {
  id: string;
  name: string;
  count: number;
};

type DueMistake = {
  id: string;
  questionText: string | null;
  reviewDueAt: Date | string | null;
  studentName?: string;
};

type TrendPoint = {
  date: string;
  count: number;
};

export function TrendBars({ trend }: { trend: TrendPoint[] }) {
  const max = Math.max(1, ...trend.map((item) => item.count));

  return (
    <div className="trend" aria-label="近30天错题趋势">
      {trend.map((item) => (
        <span
          className="trend-bar"
          key={item.date}
          title={`${item.date}: ${item.count}`}
          style={{ height: `${Math.max(8, (item.count / max) * 72)}px` }}
        />
      ))}
    </div>
  );
}

export function KnowledgeList({ items }: { items: KnowledgePointSummary[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));

  if (items.length === 0) {
    return <div className="empty">暂无已校对错题。</div>;
  }

  return (
    <div className="list">
      {items.slice(0, 6).map((item) => (
        <div className="progress-row" key={item.id}>
          <div className="progress-meta">
            <strong>{item.name}</strong>
            <span className={typeof item.masteryScore === "number" && item.masteryScore < 60 ? "badge orange" : "badge"}>
              {typeof item.masteryScore === "number" ? `${item.masteryScore} 分` : `${item.count} 次`}
            </span>
          </div>
          <div className="muted">
            {item.chapter ?? item.module}
            {typeof item.students === "number" ? ` · ${item.students} 名学生` : ""}
            {item.nextReviewAt ? ` · 窗口 ${formatDay(item.nextReviewAt)}` : ""}
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorTypeList({ items }: { items: ErrorSummary[] }) {
  if (items.length === 0) {
    return <div className="empty">暂无错误类型统计。</div>;
  }

  return (
    <div className="list">
      {items.slice(0, 5).map((item) => (
        <div className="list-item" key={item.id}>
          <div className="item-top">
            <strong>{item.name}</strong>
            <span className="badge orange">{item.count} 次</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DueMistakeList({ items }: { items: DueMistake[] }) {
  if (items.length === 0) {
    return <div className="empty">暂无到期复习。</div>;
  }

  return (
    <div className="list">
      {items.map((item) => (
        <Link className="list-item" href={`/mistakes/${item.id}/review`} key={item.id}>
          <div className="item-top">
            <strong>{item.studentName ?? "错题复习"}</strong>
            <span className="badge green">{formatDay(item.reviewDueAt)}</span>
          </div>
          <span className="muted">{item.questionText ?? "题图待校对"}</span>
        </Link>
      ))}
    </div>
  );
}

export function DiagnosticPanel({
  knowledgePoints,
  errorTypes,
  dueMistakes,
  trend,
}: {
  knowledgePoints: KnowledgePointSummary[];
  errorTypes: ErrorSummary[];
  dueMistakes: DueMistake[];
  trend: TrendPoint[];
}) {
  return (
    <div className="grid">
      <section className="panel">
        <h2 className="panel-title">
          <Target size={18} />
          薄弱知识点
        </h2>
        <KnowledgeList items={knowledgePoints} />
      </section>
      <section className="panel">
        <h2 className="panel-title">
          <AlertCircle size={18} />
          错误类型
        </h2>
        <ErrorTypeList items={errorTypes} />
      </section>
      <section className="panel">
        <h2 className="panel-title">
          <BarChart3 size={18} />
          近30天
        </h2>
        <TrendBars trend={trend} />
      </section>
      <section className="panel">
        <h2 className="panel-title">
          <Clock size={18} />
          到期复习
        </h2>
        <DueMistakeList items={dueMistakes} />
      </section>
    </div>
  );
}
