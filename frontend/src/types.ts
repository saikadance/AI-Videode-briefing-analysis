export interface KeywordStat {
  word: string;
  count: number;
}

export interface SentimentBreakdown {
  positive: number;
  negative: number;
  neutral: number;
}

export interface CommentInsight {
  total_comments: number;
  high_frequency_words: KeywordStat[];
  positive_keywords: KeywordStat[];
  negative_keywords: KeywordStat[];
  sentiment_breakdown: SentimentBreakdown;
  positive_examples: string[];
  negative_examples: string[];
}

export interface DensityPoint {
  second: number;
  count: number;
}

export interface PeakSegment {
  start_second: number;
  end_second: number;
  peak_second: number;
  peak_count: number;
  total_danmaku: number;
  keywords: KeywordStat[];
  highlights: string[];
  summary: string;
}

export interface DanmakuInsight {
  total_danmaku: number;
  duration_seconds: number;
  density_points: DensityPoint[];
  peak_segments: PeakSegment[];
}

export interface SourceInfo {
  platform: string;
  title: string;
  subtitle: string;
  url: string;
  bvid: string;
  aid: number;
  cid: number;
  page: number;
  owner_name: string;
  duration_seconds: number;
  view_count: number;
  comment_count: number;
  danmaku_count: number;
}

export interface CombinedAnalysis {
  comments: CommentInsight;
  danmaku: DanmakuInsight;
  source?: SourceInfo | null;
  ai_summary?: string | null;
}

export interface CopyAnalysisResult {
  analysis: string;
  title: string;
  notes: string;
}

export interface DataScreenshotAnalysisResult {
  analysis: string;
  image_count: number;
  title: string;
  notes: string;
  manuscript_attached: boolean;
}
