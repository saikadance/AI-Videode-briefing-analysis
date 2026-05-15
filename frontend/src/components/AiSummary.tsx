interface AiSummaryProps {
  content: string;
  title?: string;
}

type SummaryBlock =
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; text: string }
  | { type: "paragraph"; text: string };

export function AiSummary({ content, title = "AI 复盘摘要" }: AiSummaryProps) {
  const blocks = parseSummary(content);

  return (
    <section className="panel ai-summary">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <div className="ai-summary-body">
        {blocks.map((block, index) => {
          if (block.type === "heading") {
            return (
              <h3 className="ai-summary-heading" key={`${block.type}-${index}`}>
                {block.text}
              </h3>
            );
          }
          if (block.type === "bullet") {
            return (
              <div className="ai-summary-item" key={`${block.type}-${index}`}>
                <span className="ai-summary-marker">•</span>
                <p>{block.text}</p>
              </div>
            );
          }
          if (block.type === "numbered") {
            const marker = block.text.match(/^(\d+\.)\s*/)?.[1] ?? "";
            const text = block.text.replace(/^\d+\.\s*/, "");
            return (
              <div className="ai-summary-item" key={`${block.type}-${index}`}>
                <span className="ai-summary-marker">{marker}</span>
                <p>{text}</p>
              </div>
            );
          }
          return (
            <p className="ai-summary-paragraph" key={`${block.type}-${index}`}>
              {block.text}
            </p>
          );
        })}
      </div>
    </section>
  );
}

function parseSummary(content: string): SummaryBlock[] {
  return content
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("##")) {
        return { type: "heading", text: line.replace(/^#+\s*/, "") } as SummaryBlock;
      }
      if (/^[-*•]\s+/.test(line)) {
        return { type: "bullet", text: line.replace(/^[-*•]\s+/, "") } as SummaryBlock;
      }
      if (/^\d+\.\s+/.test(line)) {
        return { type: "numbered", text: line } as SummaryBlock;
      }
      return { type: "paragraph", text: line } as SummaryBlock;
    });
}
