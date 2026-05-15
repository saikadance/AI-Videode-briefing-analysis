import { SourceInfo } from "../types";
import { formatTime } from "../utils";

interface SourceSummaryProps {
  source: SourceInfo;
}

export function SourceSummary({ source }: SourceSummaryProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>视频来源</h2>
        <a className="inline-link" href={source.url} target="_blank" rel="noreferrer">
          在 B 站打开
        </a>
      </div>
      <div className="stack compact">
        <div>
          <h3>{source.title || source.bvid}</h3>
          {source.subtitle ? <p className="muted">{source.subtitle}</p> : null}
        </div>
        <div className="stats-grid source-stats">
          <article className="stat-card">
            <span>BV 号</span>
            <strong>{source.bvid || "-"}</strong>
          </article>
          <article className="stat-card">
            <span>UP 主</span>
            <strong>{source.owner_name || "-"}</strong>
          </article>
          <article className="stat-card">
            <span>时长</span>
            <strong>{formatTime(source.duration_seconds || 0)}</strong>
          </article>
          <article className="stat-card">
            <span>分 P</span>
            <strong>P{source.page}</strong>
          </article>
        </div>
      </div>
    </section>
  );
}
