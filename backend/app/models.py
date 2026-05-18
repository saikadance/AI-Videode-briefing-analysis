from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(slots=True)
class KeywordStat:
    word: str
    count: int


@dataclass(slots=True)
class SentimentBreakdown:
    positive: int
    negative: int
    neutral: int


@dataclass(slots=True)
class CommentInsight:
    total_comments: int
    high_frequency_words: list[KeywordStat] = field(default_factory=list)
    positive_keywords: list[KeywordStat] = field(default_factory=list)
    negative_keywords: list[KeywordStat] = field(default_factory=list)
    sentiment_breakdown: SentimentBreakdown = field(default_factory=lambda: SentimentBreakdown(0, 0, 0))
    positive_examples: list[str] = field(default_factory=list)
    negative_examples: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class DensityPoint:
    second: int
    count: int


@dataclass(slots=True)
class PeakSegment:
    start_second: int
    end_second: int
    peak_second: int
    peak_count: int
    total_danmaku: int
    keywords: list[KeywordStat] = field(default_factory=list)
    highlights: list[str] = field(default_factory=list)
    summary: str = ""


@dataclass(slots=True)
class DanmakuInsight:
    total_danmaku: int
    duration_seconds: int
    density_points: list[DensityPoint] = field(default_factory=list)
    peak_segments: list[PeakSegment] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class SourceInfo:
    platform: str
    title: str = ""
    subtitle: str = ""
    url: str = ""
    bvid: str = ""
    aid: int = 0
    cid: int = 0
    page: int = 1
    owner_name: str = ""
    duration_seconds: int = 0
    view_count: int = 0
    comment_count: int = 0
    danmaku_count: int = 0


@dataclass(slots=True)
class CombinedAnalysisResponse:
    comments: CommentInsight
    danmaku: DanmakuInsight
    source: SourceInfo | None = None
    ai_summary: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class CopyAnalysisResponse:
    analysis: str
    title: str = ""
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class DataScreenshotAnalysisResponse:
    analysis: str
    image_count: int = 0
    title: str = ""
    notes: str = ""
    manuscript_attached: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class ProjectChatResponse:
    reply: str
    attachment_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)
