"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

export type DraftField = "QUESTION" | "ANSWER" | "ANALYSIS" | "CORRECTION";

export type DraftAttachment = {
  id: string;
  field: DraftField;
  url: string;
  originalName?: string | null;
  order: number;
};

export function DraftAttachmentManager({
  mistakeId,
  field,
  initialAttachments,
}: {
  mistakeId: string;
  field: DraftField;
  initialAttachments: DraftAttachment[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setMessage("");
    const formData = new FormData();
    formData.set("field", field);
    Array.from(files).forEach((file) => formData.append("images", file));

    startTransition(async () => {
      const response = await fetch(`/api/mistakes/${mistakeId}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "图片上传失败");
        return;
      }

      const payload = (await response.json()) as { attachments: DraftAttachment[] };
      setAttachments((current) => [...current, ...payload.attachments]);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function deleteAttachment(attachmentId: string) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/mistakes/${mistakeId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setMessage("删除图片失败");
        return;
      }

      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    });
  }

  return (
    <div className="draft-attachments">
      <div className="attachment-grid">
        {attachments.map((attachment) => (
          <div className="attachment-thumb" key={attachment.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={attachment.originalName ?? "草稿图片"} src={attachment.url} />
            <button
              aria-label="删除图片"
              className="icon-button danger attachment-delete"
              disabled={isPending}
              onClick={() => deleteAttachment(attachment.id)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <label className="button secondary draft-upload">
        <ImagePlus size={16} />
        追加图片
        <input
          ref={inputRef}
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          multiple
          onChange={(event) => uploadFiles(event.target.files)}
          type="file"
        />
      </label>
      {message ? <div className="muted">{message}</div> : null}
    </div>
  );
}
