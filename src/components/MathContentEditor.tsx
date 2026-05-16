"use client";

import { ClipboardPaste, Eye, ImagePlus, Pencil, Save } from "lucide-react";
import type { ClipboardEvent } from "react";
import { useRef, useState, useTransition } from "react";
import { MathMarkdown } from "@/components/MathMarkdown";

type UploadPayload = {
  url: string;
  originalName?: string | null;
};

function markdownImageFor(payload: UploadPayload) {
  const alt = (payload.originalName || "数学图像").replace(/[\[\]\n\r]/g, " ");
  return `![${alt}](${payload.url})`;
}

export function MathContentEditor({
  id,
  name,
  label,
  value,
  placeholder,
  compact = false,
  onChange,
}: {
  id: string;
  name?: string;
  label?: string;
  value?: string | null;
  placeholder?: string;
  compact?: boolean;
  onChange?: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [content, setContent] = useState(value ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function setNextContent(next: string) {
    setContent(next);
    onChange?.(next);
  }

  function insertMarkdown(markdown: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setNextContent(`${content}${content ? "\n" : ""}${markdown}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prefix = content.slice(0, start);
    const suffix = content.slice(end);
    const spacerBefore = prefix && !prefix.endsWith("\n") ? "\n" : "";
    const spacerAfter = suffix && !suffix.startsWith("\n") ? "\n" : "";
    const next = `${prefix}${spacerBefore}${markdown}${spacerAfter}${suffix}`;
    setNextContent(next);
    window.setTimeout(() => {
      textarea.focus();
      const cursor = prefix.length + spacerBefore.length + markdown.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  }

  function uploadFiles(files: FileList | File[]) {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setMessage("");
    startTransition(async () => {
      for (const file of fileList) {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch("/api/media-assets", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setMessage(payload?.error ?? "图片上传失败");
          continue;
        }

        const payload = (await response.json()) as UploadPayload;
        insertMarkdown(markdownImageFor(payload));
      }

      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;

    event.preventDefault();
    uploadFiles(imageFiles);
  }

  return (
    <div className="math-editor">
      {label ? <label htmlFor={id}>{label}</label> : null}
      <div className="button-row compact">
        <button
          className={mode === "edit" ? "button secondary active-tool" : "button secondary"}
          onClick={() => setMode("edit")}
          type="button"
        >
          <Pencil size={16} />
          编辑
        </button>
        <button
          className={mode === "preview" ? "button secondary active-tool" : "button secondary"}
          onClick={() => setMode("preview")}
          type="button"
        >
          <Eye size={16} />
          预览
        </button>
        <label className="button secondary draft-upload">
          <ImagePlus size={16} />
          插入图片
          <input
            ref={inputRef}
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            multiple
            onChange={(event) => uploadFiles(event.target.files ?? [])}
            type="file"
          />
        </label>
        <span className="muted inline-hint">
          <ClipboardPaste size={14} />
          可粘贴图片，支持 $x^2$ 和 $$公式$$
        </span>
      </div>
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          className={compact ? "textarea compact math-textarea" : "textarea math-textarea"}
          id={id}
          name={name}
          onChange={(event) => setNextContent(event.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          value={content}
        />
      ) : (
        <>
          {name ? <input name={name} type="hidden" value={content} /> : null}
          <div className="math-preview">
            <MathMarkdown content={content} placeholder={placeholder ?? "暂无内容"} />
          </div>
        </>
      )}
      {isPending ? (
        <span className="muted">
          <Save size={14} /> 图片上传中
        </span>
      ) : null}
      {message ? <div className="empty compact-empty">{message}</div> : null}
    </div>
  );
}
