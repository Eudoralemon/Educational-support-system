"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, Save } from "lucide-react";
import { KnowledgePointSelector, type KnowledgePointOption } from "@/components/KnowledgePointSelector";

type ReviewMistake = {
  id: string;
  questionText: string | null;
  answerText: string | null;
  analysisText: string | null;
  correctionNote: string | null;
  sourceYear: number | null;
  questionType: string | null;
  errorTypeId: string | null;
  reviewDueAt: string;
  knowledgePointIds: string[];
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
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>(mistake.knowledgePointIds);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const afterSave = formData.get("afterSave");
      const response = await fetch(`/api/mistakes/${mistake.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: formData.get("questionText"),
          answerText: formData.get("answerText"),
          analysisText: formData.get("analysisText"),
          correctionNote: formData.get("correctionNote"),
          sourceYear: formData.get("sourceYear"),
          questionType: formData.get("questionType"),
          errorTypeId: formData.get("errorTypeId"),
          reviewDueAt: formData.get("reviewDueAt"),
          knowledgePointIds: selectedPointIds,
        }),
      });

      if (!response.ok) {
        setMessage("保存失败");
        return;
      }

      const payload = (await response.json()) as {
        nextReviewUrl?: string | null;
        studentUrl?: string;
      };

      if (afterSave === "student" && payload.studentUrl) {
        router.push(payload.studentUrl);
        router.refresh();
        return;
      }

      if (afterSave === "next" && payload.nextReviewUrl) {
        router.push(payload.nextReviewUrl);
        router.refresh();
        return;
      }

      setMessage(afterSave === "next" ? "已保存，暂无下一道待校对错题" : "已保存并进入诊断统计");
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="form-grid">
      <div className="form-grid two">
        <div className="field">
          <label>地区与教材</label>
          <div className="input">江苏 · 苏教版高中数学</div>
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
        <KnowledgePointSelector
          onChange={setSelectedPointIds}
          points={knowledgePoints}
          selectedIds={selectedPointIds}
        />
      </div>

      {message ? <div className="empty">{message}</div> : null}

      <div className="button-row">
        <button className="button" disabled={isPending} name="afterSave" type="submit" value="stay">
          <Save size={18} />
          {isPending ? "保存中" : "保存校对结果"}
        </button>
        <button className="button secondary" disabled={isPending} name="afterSave" type="submit" value="next">
          <ArrowRight size={18} />
          保存并校对下一题
        </button>
        <button className="button secondary" disabled={isPending} name="afterSave" type="submit" value="student">
          <FolderOpen size={18} />
          保存后回学生档案
        </button>
      </div>
    </form>
  );
}
