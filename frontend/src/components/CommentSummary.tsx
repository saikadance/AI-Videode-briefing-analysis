import { CommentInsight } from "../types";
import { ExpandableQuote } from "./ExpandableQuote";
import { KeywordCloud } from "./KeywordCloud";

interface CommentSummaryProps {
  data: CommentInsight;
}

export function CommentSummary({ data }: CommentSummaryProps) {
  const total = Math.max(1, data.total_comments);

  return (
    <section className="stack">
      <div className="stats-grid">
        <article className="stat-card">
          <span>评论总数</span>
          <strong>{data.total_comments}</strong>
        </article>
        <article className="stat-card">
          <span>积极评价</span>
          <strong>{Math.round((data.sentiment_breakdown.positive / total) * 100)}%</strong>
        </article>
        <article className="stat-card">
          <span>消极评价</span>
          <strong>{Math.round((data.sentiment_breakdown.negative / total) * 100)}%</strong>
        </article>
        <article className="stat-card">
          <span>中性评价</span>
          <strong>{Math.round((data.sentiment_breakdown.neutral / total) * 100)}%</strong>
        </article>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>评论高频词</h3>
        </div>
        <KeywordCloud items={data.high_frequency_words} noPanel compact />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>评论摘要对照</h3>
        </div>
        <div className="comparison-grid">
          <section className="comparison-column warm">
            <div className="comparison-header">
              <h4>正面</h4>
            </div>
            <div className="comparison-keywords">
              <KeywordCloud items={data.positive_keywords} tone="warm" noPanel compact />
            </div>
            <div className="comparison-quotes">
              {data.positive_examples.length > 0 ? (
                data.positive_examples.map((item) => <ExpandableQuote key={item} text={item} />)
              ) : (
                <p className="muted">暂无正面样本</p>
              )}
            </div>
          </section>

          <section className="comparison-column cool">
            <div className="comparison-header">
              <h4>负面</h4>
            </div>
            <div className="comparison-keywords">
              <KeywordCloud items={data.negative_keywords} tone="cool" noPanel compact />
            </div>
            <div className="comparison-quotes">
              {data.negative_examples.length > 0 ? (
                data.negative_examples.map((item) => <ExpandableQuote key={item} text={item} />)
              ) : (
                <p className="muted">暂无负面样本</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </section>
  );
}
