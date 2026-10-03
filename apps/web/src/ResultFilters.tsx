import type { ResultCategory, ResultCounts } from "@codex-web/shared";
import { ResultActions } from "./ResultActions";
export const resultLabels: Record<ResultCategory, string> = {
  all: "Все",
  images: "Изображения",
  demos: "HTML-демо",
  files: "Файлы",
  links: "Ссылки",
  work: "Рассуждения",
  reasoning: "Рассуждения",
};
export function ResultFilters({
  category,
  counts,
  onChange,
  showLinks = false,
  showWork = true,
  showReasoning = false,
}: {
  category: ResultCategory;
  counts: ResultCounts;
  onChange: (category: ResultCategory) => void;
  showLinks?: boolean;
  showWork?: boolean;
  showReasoning?: boolean;
}) {
  const reasoning = showReasoning ? "reasoning" : "work";
  return (
    <nav className="result-filters result-primary-categories" aria-label="Категории результатов">
      {(
        ["files", "images", ...(showReasoning || showWork ? [reasoning] : [])] as ResultCategory[]
      ).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={category === key || (key === "reasoning" && category === "work")}
          onClick={() => onChange(key)}
        >
          {resultLabels[key]}
        </button>
      ))}
      <ResultActions title="Другие категории">
        {(
          [
            ...(showLinks ? ["links"] : []),
            "demos",
            ...(showWork ? ["work"] : []),
          ] as ResultCategory[]
        ).map((key) => (
          <button
            type="button"
            key={key}
            className="secondary"
            aria-pressed={category === key}
            onClick={() => onChange(key)}
          >
            {key === "work" ? "Сохранённые действия" : resultLabels[key]}{" "}
            <span className="muted">{counts[key] || 0}</span>
          </button>
        ))}
      </ResultActions>
    </nav>
  );
}
