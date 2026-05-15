from __future__ import annotations

from app.models import CommentInsight, KeywordStat, SentimentBreakdown
from app.services.text_analysis import collect_sentiment_keywords, keyword_stats, split_examples


def analyze_comments(texts: list[str]) -> CommentInsight:
    positive_examples, negative_examples, breakdown = split_examples(texts)
    return CommentInsight(
        total_comments=len(texts),
        high_frequency_words=[KeywordStat(**item) for item in keyword_stats(texts, top_k=20)],
        positive_keywords=[KeywordStat(**item) for item in collect_sentiment_keywords(texts, positive=True)],
        negative_keywords=[KeywordStat(**item) for item in collect_sentiment_keywords(texts, positive=False)],
        sentiment_breakdown=SentimentBreakdown(**breakdown),
        positive_examples=positive_examples,
        negative_examples=negative_examples,
    )
