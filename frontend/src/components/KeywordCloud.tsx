import { KeywordStat } from "../types";

interface KeywordCloudProps {
  title?: string;
  items: KeywordStat[];
  tone?: "warm" | "cool" | "neutral";
  compact?: boolean;
  noPanel?: boolean;
}

export function KeywordCloud({ title, items, tone = "neutral", compact = false, noPanel = false }: KeywordCloudProps) {
  const content = (
    <>
      {title ? (
        <div className="panel-header">
          <h3>{title}</h3>
        </div>
      ) : null}
      <div className={`chip-grid ${tone} ${compact ? "compact" : ""}`}>
        {items.length > 0 ? (
          items.map((item) => (
            <span key={item.word} className="chip">
              {item.word}
              <b>{item.count}</b>
            </span>
          ))
        ) : (
          <p className="muted">暂无数据</p>
        )}
      </div>
    </>
  );

  if (noPanel) {
    return content;
  }

  return (
    <section className="panel">
      {content}
    </section>
  );
}
