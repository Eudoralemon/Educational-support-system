"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Save, Upload } from "lucide-react";
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

const draftFields = [
  {
    id: "question",
    label: "题干草稿",
    textName: "questionText",
    imageName: "questionImages",
    placeholder: "可先留空，进入校对页后补全。",
  },
  {
    id: "answer",
    label: "答案草稿",
    textName: "answerText",
    imageName: "answerImages",
    placeholder: "可粘贴答案文字，也可以拍照上传。",
  },
  {
    id: "analysis",
    label: "解析草稿",
    textName: "analysisText",
    imageName: "analysisImages",
    placeholder: "可保存解析步骤、讲义截图或参考答案。",
  },
  {
    id: "correction",
    label: "订正提示",
    textName: "correctionNote",
    imageName: "correctionImages",
    placeholder: "记录错因、下次提醒或学生订正图。",
  },
];

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
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
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

  function previewImages(fieldId: string, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    setPreviews((current) => ({
      ...current,
      [fieldId]: files.map((file) => URL.createObjectURL(file)),
    }));
  }

  if (students.length === 0) {
    return <div className="empty">请先创建学生。</div>;
  }

  return (
    <form action={handleSubmit} className="split-workspace">
      <aside className="preview-panel">
        <div className="empty">四个草稿区都可以同时保存文字和图片；图片会在校对页继续追加或删除。</div>
        {draftFields.map((field) => (
          <div className="draft-preview-block" key={field.id}>
            <strong>{field.label}</strong>
            <div className="attachment-grid compact">
              {(previews[field.id] ?? []).map((src, index) => (
                <div className="attachment-thumb" key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={`${field.label}预览 ${index + 1}`} src={src} />
                </div>
              ))}
            </div>
          </div>
        ))}
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

        <div className="draft-field-grid">
          {draftFields.map((field) => (
            <section className="draft-field" key={field.id}>
              <div className="item-top">
                <label htmlFor={field.textName}>{field.label}</label>
                <label className="button secondary draft-upload">
                  <ImagePlus size={16} />
                  上传图片
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    id={`${field.id}Images`}
                    multiple
                    name={field.imageName}
                    onChange={(event) => previewImages(field.id, event.target.files)}
                    type="file"
                  />
                </label>
              </div>
              <textarea
                className="textarea"
                id={field.textName}
                name={field.textName}
                placeholder={field.placeholder}
              />
            </section>
          ))}
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
