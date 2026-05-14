import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { completeMistakeReview } from "@/app/actions";

export function ReviewCompletionForm({ mistakeId }: { mistakeId: string }) {
  return (
    <form action={completeMistakeReview} className="form-grid">
      <input name="mistakeId" type="hidden" value={mistakeId} />
      <div className="field">
        <label htmlFor="review-note">复习备注</label>
        <textarea
          className="textarea compact"
          id="review-note"
          name="note"
          placeholder="可记录学生卡住的位置、订正情况或下次提醒。"
        />
      </div>
      <div className="button-row">
        <button className="button danger" name="result" type="submit" value="FORGOT">
          <XCircle size={18} />
          忘记了
        </button>
        <button className="button secondary" name="result" type="submit" value="PARTIAL">
          <HelpCircle size={18} />
          部分掌握
        </button>
        <button className="button" name="result" type="submit" value="MASTERED">
          <CheckCircle2 size={18} />
          已掌握
        </button>
      </div>
    </form>
  );
}
