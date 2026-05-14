"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export type KnowledgePointOption = {
  id: string;
  name: string;
  module: string;
  textbook: string;
  chapter: string;
};

export function KnowledgePointSelector({
  points,
  selectedIds,
  onChange,
}: {
  points: KnowledgePointOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("");
  const [textbook, setTextbook] = useState("");
  const [chapter, setChapter] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPoints = useMemo(
    () => selectedIds.flatMap((id) => points.find((point) => point.id === id) ?? []),
    [points, selectedIds],
  );
  const modules = useMemo(() => Array.from(new Set(points.map((point) => point.module))).sort(), [points]);
  const textbooks = useMemo(() => Array.from(new Set(points.map((point) => point.textbook))).sort(), [points]);
  const chapters = useMemo(
    () =>
      Array.from(
        new Set(
          points
            .filter((point) => !module || point.module === module)
            .filter((point) => !textbook || point.textbook === textbook)
            .map((point) => point.chapter),
        ),
      ).sort(),
    [module, points, textbook],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return points
      .filter((point) => !module || point.module === module)
      .filter((point) => !textbook || point.textbook === textbook)
      .filter((point) => !chapter || point.chapter === chapter)
      .filter((point) => {
        if (!normalizedQuery) return true;
        return [point.name, point.module, point.textbook, point.chapter]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 60);
  }, [chapter, module, points, query, textbook]);

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }

    onChange([...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  }

  return (
    <div className="knowledge-selector">
      <div className="selector-toolbar">
        <label className="search-field" htmlFor="knowledge-search">
          <Search size={16} />
          <input
            id="knowledge-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索知识点、模块或章节"
            value={query}
          />
        </label>
        <select className="select" onChange={(event) => setTextbook(event.target.value)} value={textbook}>
          <option value="">全部教材</option>
          {textbooks.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="select" onChange={(event) => setModule(event.target.value)} value={module}>
          <option value="">全部模块</option>
          {modules.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="select" onChange={(event) => setChapter(event.target.value)} value={chapter}>
          <option value="">全部章节</option>
          {chapters.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {selectedPoints.length ? (
        <div className="selected-tags">
          {selectedPoints.map((point) => (
            <button className="chip" key={point.id} onClick={() => remove(point.id)} type="button">
              {point.name}
              <X size={14} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="knowledge-list">
        {filtered.map((point) => (
          <button
            className={selectedSet.has(point.id) ? "knowledge-option selected" : "knowledge-option"}
            key={point.id}
            onClick={() => toggle(point.id)}
            type="button"
          >
            <span className="item-top">
              <strong>{point.name}</strong>
              <span className="badge gray">{point.module}</span>
            </span>
            <span className="muted">
              {point.textbook} · {point.chapter}
            </span>
          </button>
        ))}
        {filtered.length === 0 ? <div className="empty">没有匹配的知识点。</div> : null}
      </div>
    </div>
  );
}
