import { useEffect, useMemo, useState } from "react";

interface AiSummaryProps {
  content: string;
  title?: string;
}

type SummaryBlock =
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; text: string }
  | { type: "paragraph"; text: string };

interface SummarySection {
  id: string;
  title: string;
  blocks: SummaryBlock[];
}

const SECTION_PRESETS = [
  { id: "conclusion", label: "结论", aliases: ["结论", "一句话判断", "发布价值判断"] },
  { id: "signals", label: "信号", aliases: ["信号", "关键信号"] },
  { id: "issues", label: "问题", aliases: ["问题", "核心问题", "从数据反推的问题"] },
  { id: "reasons", label: "原因", aliases: ["原因", "为什么会影响数据"] },
  { id: "adjustments", label: "调整", aliases: ["调整", "最优先调整", "结构改稿建议"] },
  { id: "rewrite", label: "改写", aliases: ["改写", "可直接替换的写法"] },
  { id: "validation", label: "验证", aliases: ["验证", "后续数据验证重点", "后续还该补看什么", "和当前文稿的关系"] },
] as const;

export function AiSummary({ content, title = "AI 复盘摘要" }: AiSummaryProps) {
  const blocks = useMemo(() => parseSummary(content), [content]);
  const sections = useMemo(() => groupSections(blocks), [blocks]);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    setActiveSection(0);
  }, [content]);

  const currentSection = sections[activeSection] ?? sections[0];

  return (
    <section className="panel ai-summary">
      <div className="panel-header ai-summary-header">
        <div className="stack compact">
          <h2>{title}</h2>
          <span className="muted">
            {sections.length > 1 ? `当前第 ${activeSection + 1} / ${sections.length} 页` : "已按阅读章节整理排版"}
          </span>
        </div>

        {sections.length > 1 ? (
          <div className="ai-summary-pager">
            <button
              className="summary-nav-button"
              type="button"
              disabled={activeSection === 0}
              onClick={() => setActiveSection((index) => Math.max(0, index - 1))}
            >
              上一页
            </button>
            <button
              className="summary-nav-button"
              type="button"
              disabled={activeSection === sections.length - 1}
              onClick={() => setActiveSection((index) => Math.min(sections.length - 1, index + 1))}
            >
              下一页
            </button>
          </div>
        ) : null}
      </div>

      {sections.length > 1 ? (
        <div className="summary-tab-strip">
          {sections.map((section, index) => (
            <button
              className={index === activeSection ? "summary-tab active" : "summary-tab"}
              key={`${section.id}-${index}`}
              type="button"
              onClick={() => setActiveSection(index)}
            >
              {section.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ai-summary-page">
        {currentSection ? (
          <>
            <div className="ai-summary-page-header">
              <span className="section-kicker">阅读页</span>
              <h3 className="ai-summary-section-title">{currentSection.title}</h3>
            </div>
            <div className="ai-summary-body">
              {currentSection.blocks.map((block, index) => renderBlock(block, index))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function renderBlock(block: SummaryBlock, index: number) {
  if (block.type === "heading") {
    return (
      <h4 className="ai-summary-subheading" key={`${block.type}-${index}`}>
        {block.text}
      </h4>
    );
  }

  if (block.type === "bullet") {
    return (
      <div className="ai-summary-item" key={`${block.type}-${index}`}>
        <span className="ai-summary-marker">•</span>
        <p>{renderInline(block.text)}</p>
      </div>
    );
  }

  if (block.type === "numbered") {
    const marker = block.text.match(/^(\d+\.)\s*/)?.[1] ?? "";
    const text = block.text.replace(/^\d+\.\s*/, "");
    return (
      <div className="ai-summary-number-card" key={`${block.type}-${index}`}>
        <span className="ai-summary-number">{marker}</span>
        <p>{renderInline(text)}</p>
      </div>
    );
  }

  return (
    <p className="ai-summary-paragraph" key={`${block.type}-${index}`}>
      {renderInline(block.text)}
    </p>
  );
}

function renderInline(text: string) {
  const segments = text.split(/(\*\*.*?\*\*|`.*?`)/g).filter(Boolean);
  return segments.map((segment, index) => {
    if (/^\*\*.*\*\*$/.test(segment)) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }
    if (/^`.*`$/.test(segment)) {
      return (
        <code className="ai-inline-code" key={`${segment}-${index}`}>
          {segment.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function groupSections(blocks: SummaryBlock[]): SummarySection[] {
  const sections: SummarySection[] = [];
  let pendingId = "conclusion";
  let pendingTitle = "结论";
  let pendingBlocks: SummaryBlock[] = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      if (pendingBlocks.length) {
        sections.push({ id: pendingId, title: pendingTitle, blocks: pendingBlocks });
      }
      const normalized = normalizeSection(block.text);
      pendingId = normalized.id;
      pendingTitle = normalized.label;
      pendingBlocks = [];
      continue;
    }
    pendingBlocks.push(block);
  }

  if (pendingBlocks.length || !sections.length) {
    sections.push({
      id: pendingId,
      title: pendingTitle,
      blocks: pendingBlocks.length ? pendingBlocks : [{ type: "paragraph", text: "暂无内容。" }],
    });
  }

  return mergeSectionsByPresetOrder(sections);
}

function normalizeSection(rawTitle: string) {
  const title = rawTitle.trim();
  const matched = SECTION_PRESETS.find((preset) => preset.aliases.some((alias) => title.includes(alias)));
  if (matched) {
    return { id: matched.id, label: matched.label };
  }
  return { id: `custom-${title}`, label: title || "概览" };
}

function mergeSectionsByPresetOrder(sections: SummarySection[]): SummarySection[] {
  const grouped = new Map<string, SummarySection>();

  for (const section of sections) {
    const existing = grouped.get(section.id);
    if (existing) {
      existing.blocks.push(...section.blocks);
    } else {
      grouped.set(section.id, { ...section, blocks: [...section.blocks] });
    }
  }

  const ordered: SummarySection[] = [];
  for (const preset of SECTION_PRESETS) {
    const matched = grouped.get(preset.id);
    if (matched && matched.blocks.length) {
      ordered.push({ ...matched, title: preset.label });
      grouped.delete(preset.id);
    }
  }

  for (const leftover of grouped.values()) {
    if (leftover.blocks.length) {
      ordered.push(leftover);
    }
  }

  return ordered;
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
