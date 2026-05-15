from __future__ import annotations

import json

from app.models import CombinedAnalysisResponse
from app.services.openai_client import OpenAIServiceError, request_chat_completion


async def generate_ai_summary(analysis: CombinedAnalysisResponse) -> str | None:
    try:
        return await request_chat_completion(
            system_prompt="你是一名视频内容复盘分析师，请基于评论和弹幕数据输出精炼、结构化的中文结论。",
            user_prompt=_build_prompt(analysis),
            temperature=0.4,
        )
    except OpenAIServiceError:
        return _fallback_summary(analysis)


def _build_prompt(analysis: CombinedAnalysisResponse) -> str:
    compact = analysis.to_dict()
    return (
        "请基于以下结构化数据，输出一份中文复盘摘要。"
        "请严格使用清晰分段，不要把所有内容挤成一整段。"
        "输出格式要求："
        "\n## 整体评价"
        "\n用 2-4 句总结整体观感和讨论重心。"
        "\n## 评论反馈"
        "\n- 正向反馈：..."
        "\n- 负向反馈：..."
        "\n- 争议点：..."
        "\n## 弹幕高能区间"
        "\n- 时间点：xx-xx 秒；总结：..."
        "\n## 优化建议"
        "\n1. ..."
        "\n2. ..."
        "\n不要输出代码块，不要把 markdown 标记省略掉。"
        "\n以下是结构化数据：\n"
        + json.dumps(compact, ensure_ascii=False)
    )


def _fallback_summary(analysis: CombinedAnalysisResponse) -> str:
    comment_words = "、".join([item.word for item in analysis.comments.high_frequency_words[:5]]) or "暂无明显高频词"
    peaks = analysis.danmaku.peak_segments[:3]
    peak_text = "；".join(
        [
            f"{segment.start_second}-{segment.end_second} 秒弹幕集中爆发，重点围绕 {'、'.join([item.word for item in segment.keywords[:3]]) or '情绪表达'}"
            for segment in peaks
        ]
    ) or "暂未检测到明显高能区间"
    return (
        f"评论区讨论集中在 {comment_words}。"
        f"整体情绪上，正向 {analysis.comments.sentiment_breakdown.positive} 条，负向 {analysis.comments.sentiment_breakdown.negative} 条，"
        f"中性 {analysis.comments.sentiment_breakdown.neutral} 条。"
        f"{peak_text}。"
    )
