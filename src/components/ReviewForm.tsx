"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, Save } from "lucide-react";
import {
  DraftAttachmentManager,
  type DraftAttachment,
  type DraftField,
} from "@/components/DraftAttachmentManager";
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

const draftSections: Array<{
  field: DraftField;
  label: string;
  textName: "questionText" | "answerText" | "analysisText" | "correctionNote";
  valueKey: keyof Pick<ReviewMistake, "questionText" | "answerText" | "analysisText" | "correctionNote">;
}> = [
  { field: "QUESTION", label: "题干", textName: "questionText", valueKey: "questionText" },
  { field: "ANSWER", label: "答案", textName: "answerText", valueKey: "answerText" },
  { field: "ANALYSIS", label: "解析", textName: "analysisText", valueKey: "analysisText" },
  { field: "CORRECTION", label: "错因与订正提示", textName: "correctionNote", valueKey: "correctionNote" },
];

export function ReviewForm({
  mistake,
  knowledgePoints,
  errorTypes,
  attachments,
  legacyQuestionImageUrl,
}: {
  mistake: ReviewMistake;
  knowledgePoints: KnowledgePointOption[];
  errorTypes: ErrorTypeOption[];
  attachments: Record<DraftField, DraftAttachment[]>;
  legacyQuestionImageUrl?: string | null;
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

      <div className="draft-field-grid">
        {draftSections.map((section) => (
          <section className="draft-field" key={section.field}>
            <div className="field">
              <label htmlFor={section.textName}>{section.label}</label>
              <textarea
                className="textarea"
                id={section.textName}
                name={section.textName}
                defaultValue={mistake[section.valueKey] ?? ""}
              />
            </div>
            {section.field === "QUESTION" && legacyQuestionImageUrl ? (
              <div className="legacy-attachment">
                <span className="muted">旧版题图</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="旧版题图" src={legacyQuestionImageUrl} />
              </div>
            ) : null}
            <DraftAttachmentManager
              field={section.field}
              initialAttachments={attachments[section.field] ?? []}
              mistakeId={mistake.id}
            />
          </section>
        ))}
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
