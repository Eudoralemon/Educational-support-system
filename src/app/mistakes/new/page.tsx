import { Upload } from "lucide-react";
import { MistakeUploadForm } from "@/components/MistakeUploadForm";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function NewMistakePage() {
  const teacher = await requireTeacher();
  const [students, knowledgePoints, errorTypes] = await Promise.all([
    prisma.student.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.knowledgePoint.findMany({
      orderBy: [{ module: "asc" }, { examWeight: "desc" }, { name: "asc" }],
    }),
    prisma.errorType.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">录入错题</h1>
          <p className="page-kicker">题干、答案、解析、订正提示都可同时保存文字和图片。</p>
        </div>
      </header>
      <section className="panel">
        <h2 className="panel-title">
          <Upload size={18} />
          错题草稿
        </h2>
        <MistakeUploadForm
          students={students.map((student) => ({
            id: student.id,
            name: student.name,
            grade: student.grade,
            school: student.school,
          }))}
          knowledgePoints={knowledgePoints.map((point) => ({
            id: point.id,
            name: point.name,
            module: point.module,
            textbook: point.textbook,
            chapter: point.chapter,
          }))}
          errorTypes={errorTypes.map((type) => ({
            id: type.id,
            name: type.name,
          }))}
        />
      </section>
    </>
  );
}
