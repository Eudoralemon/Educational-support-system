import Link from "next/link";
import { BookOpen, Filter, Search } from "lucide-react";
import { TeachingContributionType } from "@prisma/client";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  return firstValue(params[key])?.trim() || "";
}

function countFor(
  counts: Array<{
    knowledgePointId: string;
    type: TeachingContributionType;
    _count: { _all: number };
  }>,
  knowledgePointId: string,
  type: TeachingContributionType,
) {
  return counts.find((item) => item.knowledgePointId === knowledgePointId && item.type === type)?._count._all ?? 0;
}

export default async function TeachingCenterPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const teacher = await requireTeacher();
  const params = searchParams ? await searchParams : {};
  const query = searchValue(params, "q");
  const textbook = searchValue(params, "textbook");
  const module = searchValue(params, "module");

  const [points, optionPoints, counts] = await Promise.all([
    prisma.knowledgePoint.findMany({
      where: {
        textbook: textbook || undefined,
        module: module || undefined,
        OR: query
          ? [
              { name: { contains: query } },
              { module: { contains: query } },
              { textbook: { contains: query } },
              { chapter: { contains: query } },
              { section: { contains: query } },
            ]
          : undefined,
      },
      orderBy: [{ textbook: "asc" }, { module: "asc" }, { chapter: "asc" }, { name: "asc" }],
      take: 160,
    }),
    prisma.knowledgePoint.findMany({
      select: { textbook: true, module: true },
      orderBy: [{ textbook: "asc" }, { module: "asc" }],
    }),
    prisma.teachingContribution.groupBy({
      by: ["knowledgePointId", "type"],
      where: { teacherId: teacher.id, isArchived: false },
      _count: { _all: true },
    }),
  ]);

  const textbooks = Array.from(new Set(optionPoints.map((point) => point.textbook))).sort();
  const modules = Array.from(
    new Set(
      optionPoints
        .filter((point) => !textbook || point.textbook === textbook)
        .map((point) => point.module),
    ),
  ).sort();

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">教案中心</h1>
          <p className="page-kicker">按知识点沉淀解释方式、解题方法和师生贡献记录。</p>
        </div>
      </header>

      <section className="panel">
        <h2 className="panel-title">
          <Search size={18} />
          知识点检索
        </h2>
        <form className="selector-toolbar">
          <label className="search-field" htmlFor="teaching-search">
            <Search size={16} />
            <input id="teaching-search" name="q" placeholder="搜索知识点、章节或模块" defaultValue={query} />
          </label>
          <select className="select" name="textbook" defaultValue={textbook}>
            <option value="">全部教材</option>
            {textbooks.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select className="select" name="module" defaultValue={module}>
            <option value="">全部模块</option>
            {modules.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button className="button secondary" type="submit">
            <Filter size={18} />
            筛选
          </button>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 className="panel-title">
          <BookOpen size={18} />
          知识点备课
        </h2>
        {points.length === 0 ? (
          <div className="empty">没有匹配的知识点。</div>
        ) : (
          <div className="grid two">
            {points.map((point) => {
              const explanationCount = countFor(
                counts,
                point.id,
                TeachingContributionType.KNOWLEDGE_EXPLANATION,
              );
              const solutionCount = countFor(counts, point.id, TeachingContributionType.EXERCISE_SOLUTION);

              return (
                <Link className="card" href={`/teaching/knowledge-points/${point.id}`} key={point.id}>
                  <div className="item-top">
                    <strong>{point.name}</strong>
                    <span className="badge gray">{point.module}</span>
                  </div>
                  <span className="muted">
                    {point.textbook} · {point.chapter}
                    {point.section ? ` · ${point.section}` : ""}
                  </span>
                  <div className="button-row compact">
                    <span className="badge green">解释 {explanationCount}</span>
                    <span className="badge">解法 {solutionCount}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
