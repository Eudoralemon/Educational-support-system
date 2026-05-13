import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PracticePackEditor } from "@/components/PracticePackEditor";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, practicePackStatusLabels, regionLabels } from "@/lib/labels";

export default async function PracticePackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const pack = await prisma.practicePack.findUnique({
    where: { id },
    include: {
      classGroup: true,
      student: true,
      items: {
        include: { knowledgePoint: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!pack) notFound();
  if (pack.teacherId !== teacher.id) redirect("/dashboard");

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">练习包编辑</h1>
          <p className="page-kicker">
            {pack.student?.name ?? pack.classGroup?.name ?? "未绑定对象"} · {regionLabels[pack.regionTag]} ·{" "}
            {practicePackStatusLabels[pack.status]} · {formatDate(pack.createdAt)}
          </p>
        </div>
        <div className="button-row">
          <Link className="button secondary" href={pack.studentId ? `/students/${pack.studentId}` : `/classes/${pack.classId}`}>
            <ArrowLeft size={18} />
            返回
          </Link>
        </div>
      </header>

      <section className="panel">
        <h2 className="panel-title no-print">
          <ClipboardList size={18} />
          内容
        </h2>
        <PracticePackEditor
          pack={{
            id: pack.id,
            title: pack.title,
            status: pack.status,
            items: pack.items.map((item) => ({
              id: item.id,
              order: item.order,
              prompt: item.prompt,
              answerText: item.answerText,
              analysisText: item.analysisText,
              isAiDraft: item.isAiDraft,
              knowledgePoint: item.knowledgePoint
                ? {
                    name: item.knowledgePoint.name,
                    module: item.knowledgePoint.module,
                  }
                : null,
            })),
          }}
        />
      </section>
    </>
  );
}
