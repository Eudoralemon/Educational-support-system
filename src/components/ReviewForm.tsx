"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

type ReviewMistake = {
  id: string;
  questionText: string | null;
  answerText: string | null;
  analysisText: string | null;
  correctionNote: string | null;
  regionTag: "COMMON" | "JS" | "GD";
  sourceYear: number | null;
  questionType: string | null;
  errorTypeId: string | null;
  reviewDueAt: string;
  knowledgePointIds: string[];
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

export function ReviewForm({
  mistake,
  knowledgePoints,
  errorTypes,
}: {
  mistake: ReviewMistake;
  knowledgePoints: KnowledgePointOption[];
  errorTypes: ErrorTypeOption[];
}) {
  const router = useRouter();
  const [selectedPointIds, setSelectedPointIds] = useState(new Set(mistake.knowledgePointIds));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function togglePoint(id: string) {
    setSelectedPointIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSubmit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/mistakes/${mistake.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: formData.get("questionText"),
          answerText: formData.get("answerText"),
          analysisText: formData.get("analysisText"),
          correctionNote: formData.get("correctionNote"),
          regionTag: formData.get("regionTag"),
          sourceYear: formData.get("sourceYear"),
          questionType: formData.get("questionType"),
          errorTypeId: formData.get("errorTypeId"),
          reviewDueAt: formData.get("reviewDueAt"),
          knowledgePointIds: Array.from(selectedPointIds),
        }),
      });

      if (!response.ok) {
        setMessage("保存失败");
        return;
      }

      setMessage("已保存并进入诊断统计");
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="form-grid">
      <div className="form-grid two">
        <div className="field">
          <label htmlFor="regionTag">地区标签</label>
          <select className="select" id="regionTag" name="regionTag" defaultValue={mistake.regionTag}>
            <option value="COMMON">通用</option>
            <option value="JS">江苏</option>
            <option value="GD">广东</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="questionType">题型</label>
          <input className="input" id="questionType" name="questionType" defaultValue={mistake.questionType ?? ""} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="questionText">题干</label>
        <textarea className="textarea" id="questionText" name="questionText" defaultValue={mistake.questionText ?? ""} />
      </div>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="answerText">答案</label>
          <textarea className="textarea" id="answerText" name="answerText" defaultValue={mistake.answerText ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="analysisText">解析</label>
          <textarea className="textarea" id="analysisText" name="analysisText" defaultValue={mistake.analysisText ?? ""} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="correctionNote">错因与订正提示</label>
        <textarea className="textarea" id="correctionNote" name="correctionNote" defaultValue={mistake.correctionNote ?? ""} />
      </div>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="errorTypeId">错误类型</label>
          <select className="select" id="errorTypeId" name="errorTypeId" defaultValue={mistake.errorTypeId ?? ""}>
            <option value="">未选择</option>
            {errorTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sourceYear">年份</label>
          <input
            className="input"
            id="sourceYear"
            name="sourceYear"
            defaultValue={mistake.sourceYear ?? ""}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="reviewDueAt">复习日期</label>
        <input className="input" id="reviewDueAt" name="reviewDueAt" type="date" defaultValue={mistake.reviewDueAt} />
      </div>

      <div className="field">
        <label>知识点</label>
        <div className="grid two">
          {knowledgePoints.map((point) => (
            <label className="list-item" key={point.id}>
              <span className="item-top">
                <span>{point.name}</span>
                <input
                  checked={selectedPointIds.has(point.id)}
                  onChange={() => togglePoint(point.id)}
                  type="checkbox"
                />
              </span>
              <span className="muted">{point.module}</span>
            </label>
          ))}
        </div>
      </div>

      {message ? <div className="empty">{message}</div> : null}

      <button className="button" disabled={isPending} type="submit">
        <Save size={18} />
        {isPending ? "保存中" : "保存校对结果"}
      </button>
    </form>
  );
}
