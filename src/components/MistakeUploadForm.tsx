"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Upload } from "lucide-react";
import { KnowledgePointSelector, type KnowledgePointOption } from "@/components/KnowledgePointSelector";

type StudentOption = {
  id: string;
  name: string;
  grade: string;
  school?: string | null;
};

type ErrorTypeOption = {
  id: string;
  name: string;
};

export function MistakeUploadForm({
  students,
  knowledgePoints,
  errorTypes,
}: {
  students: StudentOption[];
  knowledgePoints: KnowledgePointOption[];
  errorTypes: ErrorTypeOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const defaultStudent = students[0];
  const [studentId, setStudentId] = useState(defaultStudent?.id ?? "");
  const selectedStudent = useMemo(
    () => students.find((student) => student.id === studentId),
    [studentId, students],
  );

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      formData.delete("knowledgePointIds");
      formData.set("knowledgePointIds", JSON.stringify(selectedPointIds));

      const response = await fetch("/api/mistakes", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "错题保存失败");
        return;
      }

      const payload = (await response.json()) as { reviewUrl: string };
      router.push(payload.reviewUrl);
      router.refresh();
    });
  }

  function previewImage(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      setImagePreview("");
      return;
    }

    setImagePreview(URL.createObjectURL(file));
  }

  if (students.length === 0) {
    return <div className="empty">请先创建学生。</div>;
  }

  return (
    <form action={handleSubmit} className="split-workspace">
      <aside className="preview-panel">
        <div className="field">
          <label htmlFor="image">题目图片</label>
          <input
            className="input"
            id="image"
            name="image"
            onChange={(event) => previewImage(event.target.files)}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
          />
        </div>
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="题目图片预览" className="image-preview" src={imagePreview} />
        ) : (
          <div className="empty">可先保存题干文字，也可以上传题图后进入校对。</div>
        )}
      </aside>

      <div className="form-grid">
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="studentId">学生</label>
            <select
              className="select"
              id="studentId"
              name="studentId"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.grade}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>教材范围</label>
            <div className="input">
              江苏 · 苏教版 · {selectedStudent?.school || "未填写学校"}
            </div>
          </div>
        </div>

        <div className="form-grid two">
          <div className="field">
            <label htmlFor="questionType">题型</label>
            <input className="input" id="questionType" name="questionType" placeholder="选择题 / 填空题 / 解答题" />
          </div>
          <div className="field">
            <label htmlFor="sourceYear">年份</label>
            <input className="input" id="sourceYear" name="sourceYear" inputMode="numeric" placeholder="2026" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="questionText">题干草稿</label>
          <textarea className="textarea" id="questionText" name="questionText" placeholder="可先留空，进入校对页后补全。" />
        </div>

        <div className="form-grid two">
          <div className="field">
            <label htmlFor="answerText">答案草稿</label>
            <textarea className="textarea" id="answerText" name="answerText" />
          </div>
          <div className="field">
            <label htmlFor="analysisText">解析草稿</label>
            <textarea className="textarea" id="analysisText" name="analysisText" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="errorTypeId">错误类型</label>
          <select className="select" id="errorTypeId" name="errorTypeId" defaultValue="">
            <option value="">待校对</option>
            {errorTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>知识点</label>
          <KnowledgePointSelector
            onChange={setSelectedPointIds}
            points={knowledgePoints}
            selectedIds={selectedPointIds}
          />
        </div>

        {error ? <div className="empty">{error}</div> : null}

        <button className="button" disabled={isPending} type="submit">
          {isPending ? <Save size={18} /> : <Upload size={18} />}
          {isPending ? "保存中" : "保存并进入校对"}
        </button>
      </div>
    </form>
  );
}
