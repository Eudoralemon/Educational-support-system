"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Upload } from "lucide-react";

type StudentOption = {
  id: string;
  name: string;
  className: string;
  region: "COMMON" | "JS" | "GD";
};

type KnowledgePointOption = {
  id: string;
  name: string;
  module: string;
  region: "COMMON" | "JS" | "GD";
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
      const selectedPoints = formData.getAll("knowledgePointIds");
      formData.delete("knowledgePointIds");
      formData.set("knowledgePointIds", JSON.stringify(selectedPoints));

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

  if (students.length === 0) {
    return <div className="empty">请先创建班级和学生。</div>;
  }

  return (
    <form action={handleSubmit} className="form-grid">
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
                {student.className} · {student.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="regionTag">地区标签</label>
          <select className="select" id="regionTag" name="regionTag" defaultValue={selectedStudent?.region ?? "COMMON"}>
            <option value="COMMON">通用</option>
            <option value="JS">江苏</option>
            <option value="GD">广东</option>
          </select>
        </div>
      </div>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="image">题目图片</label>
          <input className="input" id="image" name="image" type="file" accept="image/*" />
        </div>
        <div className="field">
          <label htmlFor="questionType">题型</label>
          <input className="input" id="questionType" name="questionType" placeholder="选择题 / 填空题 / 解答题" />
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

      <div className="form-grid two">
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
          <label htmlFor="sourceYear">年份</label>
          <input className="input" id="sourceYear" name="sourceYear" inputMode="numeric" placeholder="2026" />
        </div>
      </div>

      <div className="field">
        <label>知识点</label>
        <div className="grid two">
          {knowledgePoints.map((point) => (
            <label className="list-item" key={point.id}>
              <span className="item-top">
                <span>{point.name}</span>
                <span className="badge gray">{point.region}</span>
              </span>
              <span className="muted">{point.module}</span>
              <input name="knowledgePointIds" type="checkbox" value={point.id} />
            </label>
          ))}
        </div>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      <button className="button" disabled={isPending} type="submit">
        {isPending ? <Save size={18} /> : <Upload size={18} />}
        {isPending ? "保存中" : "保存并进入校对"}
      </button>
    </form>
  );
}
