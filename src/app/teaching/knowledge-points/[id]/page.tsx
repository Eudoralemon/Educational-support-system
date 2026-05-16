import Link from "next/link";
import { Archive, ArrowLeft, BookOpen, ClipboardList, FileText, Plus, Save } from "lucide-react";
import { StudentStatus, TeachingContributorKind, TeachingContributionType, TextbookContentBlockType } from "@prisma/client";
import { notFound } from "next/navigation";
import {
  archiveTeachingContribution,
  createTeachingContribution,
  updateTeachingContribution,
} from "@/app/actions";
import { MathContentEditor } from "@/components/MathContentEditor";
import { MathMarkdown } from "@/components/MathMarkdown";
import { PrintButton } from "@/components/PrintButton";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/labels";

const contributionTypeLabels: Record<TeachingContributionType, string> = {
  KNOWLEDGE_EXPLANATION: "解释方式",
  EXERCISE_SOLUTION: "题目解法",
};

type StudentOption = {
  id: string;
  name: string;
};

type ExerciseOption = {
  id: string;
  sourceLabel: string;
  prompt: string;
};

type ContributionFormValue = {
  id: string;
  type: TeachingContributionType;
  title: string;
  content: string;
  backgroundKnowledge: string | null;
  contributorKind: TeachingContributorKind;
  contributorStudentId: string | null;
  textbookExerciseId: string | null;
  exercisePromptSnapshot: string | null;
  textbookExercise: ExerciseOption | null;
};

function ContributorFields({
  students,
  contribution,
  idPrefix = "new",
}: {
  students: StudentOption[];
  contribution?: ContributionFormValue;
  idPrefix?: string;
}) {
  const fieldId = contribution?.id ?? idPrefix;

  return (
    <div className="form-grid two">
      <div className="field">
        <label htmlFor={`kind-${fieldId}`}>贡献人类型</label>
        <select
          className="select"
          defaultValue={contribution?.contributorKind ?? TeachingContributorKind.TEACHER}
          id={`kind-${fieldId}`}
          name="contributorKind"
        >
          <option value={TeachingContributorKind.TEACHER}>老师本人</option>
          <option value={TeachingContributorKind.STUDENT}>学生贡献</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`student-${fieldId}`}>贡献学生</label>
        <select
          className="select"
          defaultValue={contribution?.contributorStudentId ?? ""}
          id={`student-${fieldId}`}
          name="contributorStudentId"
        >
          <option value="">不关联学生</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ExerciseFields({
  exercises,
  contribution,
}: {
  exercises: ExerciseOption[];
  contribution?: ContributionFormValue;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor={contribution ? `exercise-${contribution.id}` : "exercise-new"}>绑定题源</label>
        <select
          className="select"
          defaultValue={contribution?.textbookExerciseId ?? ""}
          id={contribution ? `exercise-${contribution.id}` : "exercise-new"}
          name="textbookExerciseId"
        >
          <option value="">自定义题目</option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.sourceLabel} · {exercise.prompt.slice(0, 48)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <MathContentEditor
          id={contribution ? `snapshot-${contribution.id}` : "snapshot-new"}
          label="题目快照"
          name="exercisePromptSnapshot"
          placeholder="可填写学生提出新解法时对应的题目，或留空使用绑定题源。"
          value={contribution?.exercisePromptSnapshot ?? contribution?.textbookExercise?.prompt ?? ""}
          compact
        />
      </div>
    </>
  );
}

function CreateContributionForm({
  knowledgePointId,
  students,
  exercises,
  type,
}: {
  knowledgePointId: string;
  students: StudentOption[];
  exercises: ExerciseOption[];
  type: TeachingContributionType;
}) {
  const isSolution = type === TeachingContributionType.EXERCISE_SOLUTION;

  return (
    <form action={createTeachingContribution} className="form-grid">
      <input name="knowledgePointId" type="hidden" value={knowledgePointId} />
      <input name="type" type="hidden" value={type} />
      <div className="field">
        <label htmlFor={`title-${type}`}>标题</label>
        <input
          className="input"
          id={`title-${type}`}
          name="title"
          placeholder={isSolution ? "如：换元法、几何法、学生口算入口" : "如：图像解释、生活情境解释"}
        />
      </div>
      {isSolution ? <ExerciseFields exercises={exercises} /> : null}
      <div className="field">
        <MathContentEditor id={`content-${type}`} label={isSolution ? "解法内容" : "解释内容"} name="content" />
      </div>
      <div className="field">
        <MathContentEditor
          id={`background-${type}`}
          label="涉及背景知识"
          name="backgroundKnowledge"
          placeholder="如：函数单调性、向量数量积、判别式、已有生活经验等。"
          compact
        />
      </div>
      <ContributorFields idPrefix={`create-${type}`} students={students} />
      <button className="button" type="submit">
        <Plus size={18} />
        添加{contributionTypeLabels[type]}
      </button>
    </form>
  );
}

function ContributionCard({
  contribution,
  students,
  exercises,
}: {
  contribution: ContributionFormValue & {
    contributorName: string;
    createdAt: Date;
    updatedAt: Date;
  };
  students: StudentOption[];
  exercises: ExerciseOption[];
}) {
  return (
    <article className="list-item">
      <div className="item-top">
        <strong>{contribution.title}</strong>
        <span className={contribution.type === TeachingContributionType.EXERCISE_SOLUTION ? "badge" : "badge green"}>
          {contributionTypeLabels[contribution.type]}
        </span>
      </div>
      <span className="muted">
        {contribution.contributorName} · {formatDate(contribution.createdAt)}
        {contribution.updatedAt > contribution.createdAt ? ` · 更新 ${formatDate(contribution.updatedAt)}` : ""}
      </span>
      {contribution.exercisePromptSnapshot ? (
        <div className="draft-preview-block">
          <strong>题目</strong>
          <MathMarkdown className="compact-text" content={contribution.exercisePromptSnapshot} />
        </div>
      ) : null}
      <MathMarkdown content={contribution.content} />
      {contribution.backgroundKnowledge ? (
        <div className="draft-preview-block">
          <strong>背景知识</strong>
          <MathMarkdown content={contribution.backgroundKnowledge} />
        </div>
      ) : null}
      <details className="no-print">
        <summary className="muted">编辑记录</summary>
        <form action={updateTeachingContribution} className="form-grid" style={{ marginTop: 12 }}>
          <input name="contributionId" type="hidden" value={contribution.id} />
          <div className="form-grid two">
            <div className="field">
              <label htmlFor={`type-${contribution.id}`}>类型</label>
              <select className="select" defaultValue={contribution.type} id={`type-${contribution.id}`} name="type">
                <option value={TeachingContributionType.KNOWLEDGE_EXPLANATION}>解释方式</option>
                <option value={TeachingContributionType.EXERCISE_SOLUTION}>题目解法</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`title-${contribution.id}`}>标题</label>
              <input className="input" defaultValue={contribution.title} id={`title-${contribution.id}`} name="title" />
            </div>
          </div>
          <ExerciseFields contribution={contribution} exercises={exercises} />
          <div className="field">
            <MathContentEditor
              id={`content-${contribution.id}`}
              label="内容"
              name="content"
              value={contribution.content}
            />
          </div>
          <div className="field">
            <MathContentEditor
              id={`background-${contribution.id}`}
              label="涉及背景知识"
              name="backgroundKnowledge"
              value={contribution.backgroundKnowledge ?? ""}
              compact
            />
          </div>
          <ContributorFields contribution={contribution} students={students} />
          <div className="button-row">
            <button className="button secondary" type="submit">
              <Save size={18} />
              保存修改
            </button>
          </div>
        </form>
        <form action={archiveTeachingContribution} className="button-row" style={{ marginTop: 10 }}>
          <input name="contributionId" type="hidden" value={contribution.id} />
          <button className="button secondary" type="submit">
            <Archive size={18} />
            归档
          </button>
        </form>
      </details>
    </article>
  );
}

export default async function TeachingKnowledgePointPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const [point, students, exercises, contributions, contentBlocks] = await Promise.all([
    prisma.knowledgePoint.findUnique({ where: { id } }),
    prisma.student.findMany({
      where: { teacherId: teacher.id, status: StudentStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.textbookExercise.findMany({
      where: { knowledgePointId: id, isArchived: false },
      select: { id: true, sourceLabel: true, prompt: true },
      orderBy: [{ difficulty: "asc" }, { sourceLabel: "asc" }],
      take: 40,
    }),
    prisma.teachingContribution.findMany({
      where: { teacherId: teacher.id, knowledgePointId: id, isArchived: false },
      include: { textbookExercise: { select: { id: true, sourceLabel: true, prompt: true } } },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    }),
    prisma.textbookContentBlock.findMany({
      where: {
        knowledgePointId: id,
        blockType: { in: [TextbookContentBlockType.CONCEPT, TextbookContentBlockType.EXAMPLE] },
      },
      orderBy: [{ order: "asc" }],
      take: 4,
    }),
  ]);

  if (!point) notFound();

  const explanations = contributions.filter(
    (contribution) => contribution.type === TeachingContributionType.KNOWLEDGE_EXPLANATION,
  );
  const solutions = contributions.filter(
    (contribution) => contribution.type === TeachingContributionType.EXERCISE_SOLUTION,
  );

  return (
    <div className="print-area">
      <header className="page-header no-print">
        <div>
          <h1 className="page-title">{point.name}</h1>
          <p className="page-kicker">
            {point.textbook} · {point.chapter}
            {point.section ? ` · ${point.section}` : ""}
          </p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href="/teaching">
            <ArrowLeft size={18} />
            教案中心
          </Link>
          <PrintButton label="打印教案" />
        </div>
      </header>

      <div className="print-only print-heading">
        <h2>{point.name}</h2>
        <span>
          {point.textbook} · {point.chapter}
        </span>
      </div>

      <section className="grid main">
        <div className="grid">
          <section className="panel">
            <h2 className="panel-title">
              <BookOpen size={18} />
              教材定位
            </h2>
            <div className="list">
              <div className="list-item">
                <div className="item-top">
                  <strong>{point.name}</strong>
                  <span className="badge gray">{point.module}</span>
                </div>
                <span className="muted">
                  {point.textbook} · {point.chapter}
                  {point.section ? ` · ${point.section}` : ""}
                </span>
              </div>
              {contentBlocks.map((block) => (
                <article className="list-item" key={block.id}>
                  <div className="item-top">
                    <strong>{block.title || block.sourceLabel}</strong>
                    <span className="badge gray">PDF {block.sourcePageStart ?? "--"}</span>
                  </div>
                  <MathMarkdown className="compact-text" content={block.contentText.slice(0, 520)} />
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <FileText size={18} />
              解释方式
            </h2>
            {explanations.length === 0 ? (
              <div className="empty">暂无解释方式记录。</div>
            ) : (
              <div className="list">
                {explanations.map((contribution) => (
                  <ContributionCard
                    contribution={contribution}
                    exercises={exercises}
                    key={contribution.id}
                    students={students}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <ClipboardList size={18} />
              题目解法
            </h2>
            {solutions.length === 0 ? (
              <div className="empty">暂无题目解法记录。</div>
            ) : (
              <div className="list">
                {solutions.map((contribution) => (
                  <ContributionCard
                    contribution={contribution}
                    exercises={exercises}
                    key={contribution.id}
                    students={students}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="grid no-print">
          <section className="panel">
            <h2 className="panel-title">
              <Plus size={18} />
              新增解释方式
            </h2>
            <CreateContributionForm
              exercises={exercises}
              knowledgePointId={point.id}
              students={students}
              type={TeachingContributionType.KNOWLEDGE_EXPLANATION}
            />
          </section>

          <section className="panel">
            <h2 className="panel-title">
              <Plus size={18} />
              新增题目解法
            </h2>
            <CreateContributionForm
              exercises={exercises}
              knowledgePointId={point.id}
              students={students}
              type={TeachingContributionType.EXERCISE_SOLUTION}
            />
          </section>
        </aside>
      </section>
    </div>
  );
}
