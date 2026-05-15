import { DanmakuInsight } from "../types";
import { formatTime } from "../utils";

interface PeakSegmentsProps {
  data: DanmakuInsight;
}

export function PeakSegments({ data }: PeakSegmentsProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>高密集区间重点复盘</h3>
      </div>
      <div className="segment-list">
        {data.peak_segments.length > 0 ? (
          data.peak_segments.map((segment) => (
            <article className="segment-card" key={`${segment.start_second}-${segment.end_second}`}>
              <div className="segment-meta">
                <strong>
                  {formatTime(segment.start_second)} - {formatTime(segment.end_second)}
                </strong>
                <span>{segment.total_danmaku} 条弹幕</span>
              </div>
              <p>{segment.summary}</p>
              <div className="chip-grid warm">
                {segment.keywords.map((item) => (
                  <span key={`${segment.start_second}-${item.word}`} className="chip">
                    {item.word}
                    <b>{item.count}</b>
                  </span>
                ))}
              </div>
              <div className="highlight-list">
                {segment.highlights.map((highlight) => (
                  <blockquote key={`${segment.start_second}-${highlight}`}>{highlight}</blockquote>
                ))}
              </div>
            </article>
          ))
        ) : (
          <p className="muted">当前样本里还没有明显超过阈值的弹幕高峰。</p>
        )}
      </div>
    </section>
  );
}
