import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

function isSafeImage(src?: string | null) {
  if (!src) return false;
  return src.startsWith("/api/uploads/") || src.startsWith("data:image/");
}

export function MathMarkdown({
  content,
  className = "",
  placeholder = "留空",
}: {
  content?: string | null;
  className?: string;
  placeholder?: string;
}) {
  const value = content?.trim();

  if (!value) {
    return <span className="muted">{placeholder}</span>;
  }

  return (
    <div className={`math-markdown ${className}`}>
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkMath]}
        components={{
          img({ alt, src }) {
            if (typeof src !== "string" || !isSafeImage(src)) return null;
            return <img alt={alt ?? "数学内容图片"} src={src} />;
          },
          a({ children, href }) {
            return (
              <a href={href} rel="noreferrer" target="_blank">
                {children}
              </a>
            );
          },
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
