import { useId, useState } from "react";

interface ExpandableQuoteProps {
  text: string;
}

const COLLAPSED_LENGTH = 88;

export function ExpandableQuote({ text }: ExpandableQuoteProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const isLong = text.length > COLLAPSED_LENGTH;

  return (
    <div className="quote-card">
      <blockquote
        id={contentId}
        className={!expanded && isLong ? "quote-text quote-text-collapsed" : "quote-text"}
      >
        {text}
      </blockquote>
      {isLong ? (
        <button
          type="button"
          className="quote-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "展开全文"}
        </button>
      ) : null}
    </div>
  );
}
