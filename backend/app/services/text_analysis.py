from __future__ import annotations

from collections import Counter
import re

import jieba


STOPWORDS = {
    "的",
    "了",
    "是",
    "就",
    "都",
    "很",
    "也",
    "还",
    "和",
    "啊",
    "吗",
    "呢",
    "吧",
    "这",
    "那",
    "有",
    "我",
    "你",
    "他",
    "她",
    "它",
    "一个",
    "这个",
    "那个",
    "真的",
    "不是",
    "还是",
    "感觉",
    "视频",
    "弹幕",
    "评论",
}

POSITIVE_WORDS = {
    "喜欢",
    "精彩",
    "好看",
    "优秀",
    "惊艳",
    "感动",
    "有趣",
    "牛",
    "舒服",
    "强",
    "棒",
    "震撼",
    "好笑",
    "上头",
    "治愈",
    "出色",
    "丝滑",
    "高级",
    "真香",
    "稳",
    "到位",
    "自然",
    "舒服",
    "可爱",
    "过瘾",
    "震撼",
}

NEGATIVE_WORDS = {
    "无聊",
    "尴尬",
    "难看",
    "失望",
    "拖沓",
    "离谱",
    "一般",
    "套路",
    "混乱",
    "吵",
    "差",
    "难受",
    "生硬",
    "灌水",
    "看不懂",
    "崩",
    "劝退",
    "别扭",
    "出戏",
    "失真",
    "粗糙",
    "敷衍",
    "发癫",
    "硬蹭",
    "拉垮",
    "重复",
}

TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]+")
NEGATION_WORDS = {"不", "没", "没有", "并不", "不是", "别", "无", "毫无", "未", "算不上"}
INTENSIFIERS = {
    "很": 1.2,
    "太": 1.4,
    "真": 1.25,
    "挺": 1.15,
    "特别": 1.4,
    "非常": 1.5,
    "超级": 1.6,
    "有点": 0.75,
    "稍微": 0.7,
    "略": 0.7,
}
POSITIVE_PHRASES = {
    "值得一看": 2.4,
    "超出预期": 2.0,
    "比想象中好": 1.8,
    "没想到这么好": 2.2,
    "越看越上头": 2.2,
    "太有意思了": 2.1,
    "做得很好": 2.2,
}
NEGATIVE_PHRASES = {
    "不太行": -2.2,
    "看不下去": -2.6,
    "有点失望": -1.9,
    "越来越无聊": -2.0,
    "不如预期": -2.1,
    "尬住了": -2.1,
    "浪费时间": -2.8,
    "车轱辘话": -2.2,
}
TURNING_WORDS = ("但是", "但", "不过", "然而", "可惜", "只是")
SENTENCE_SPLIT_PATTERN = re.compile(r"[。！？!?；;]")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def tokenize(text: str) -> list[str]:
    cleaned = normalize_text(text)
    if not cleaned:
        return []

    rough_tokens = [token.strip().lower() for token in jieba.cut(cleaned)]
    filtered: list[str] = []
    for token in rough_tokens:
        if not token or token in STOPWORDS:
            continue
        if len(token) == 1 and not token.isascii():
            continue
        if not TOKEN_PATTERN.fullmatch(token):
            continue
        filtered.append(token)
    return filtered


def keyword_stats(texts: list[str], top_k: int = 20) -> list[dict[str, int | str]]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(tokenize(text))
    return [{"word": word, "count": count} for word, count in counter.most_common(top_k)]


def score_sentiment(text: str) -> float:
    normalized = normalize_text(text).lower()
    if not normalized:
        return 0.0

    score = 0.0
    for phrase, weight in POSITIVE_PHRASES.items():
        if phrase in normalized:
            score += weight
    for phrase, weight in NEGATIVE_PHRASES.items():
        if phrase in normalized:
            score += weight

    clauses = _split_clauses(normalized)
    for index, clause in enumerate(clauses):
        clause_score = _score_clause(clause)
        if index == len(clauses) - 1 and len(clauses) > 1:
            clause_score *= 1.15
        score += clause_score

    if "?" in normalized or "？" in normalized:
        score *= 0.92
    if normalized.count("!") + normalized.count("！") >= 2:
        score *= 1.1
    if "笑死" in normalized or "哈哈" in normalized:
        score += 0.5
    if "？？" in normalized or "??" in normalized:
        score -= 0.4

    return score


def classify_sentiment(text: str) -> str:
    score = score_sentiment(text)
    if score >= 1.1:
        return "positive"
    if score <= -1.1:
        return "negative"
    return "neutral"


def split_examples(texts: list[str], top_n: int = 5) -> tuple[list[str], list[str], dict[str, int]]:
    positive_examples: list[str] = []
    negative_examples: list[str] = []
    breakdown = {"positive": 0, "negative": 0, "neutral": 0}

    for text in texts:
        sentiment = classify_sentiment(text)
        if sentiment == "positive":
            breakdown["positive"] += 1
            if len(positive_examples) < top_n:
                positive_examples.append(text)
        elif sentiment == "negative":
            breakdown["negative"] += 1
            if len(negative_examples) < top_n:
                negative_examples.append(text)
        else:
            breakdown["neutral"] += 1

    return positive_examples, negative_examples, breakdown


def collect_sentiment_keywords(texts: list[str], positive: bool, top_k: int = 10) -> list[dict[str, int | str]]:
    counter: Counter[str] = Counter()
    lexicon = POSITIVE_WORDS if positive else NEGATIVE_WORDS
    for text in texts:
        sentiment = classify_sentiment(text)
        if positive and sentiment != "positive":
            continue
        if not positive and sentiment != "negative":
            continue
        for token in tokenize(text):
            if token in lexicon:
                counter[token] += 1
    return [{"word": word, "count": count} for word, count in counter.most_common(top_k)]


def _split_clauses(text: str) -> list[str]:
    clauses: list[str] = []
    for chunk in SENTENCE_SPLIT_PATTERN.split(text):
        chunk = chunk.strip()
        if not chunk:
            continue
        turning_split = _split_turning_words(chunk)
        clauses.extend(turning_split)
    return clauses or [text]


def _split_turning_words(text: str) -> list[str]:
    clauses = [text]
    for word in TURNING_WORDS:
        next_clauses: list[str] = []
        for clause in clauses:
            if word in clause:
                next_clauses.extend([part.strip() for part in clause.split(word) if part.strip()])
            else:
                next_clauses.append(clause)
        clauses = next_clauses
    return clauses


def _score_clause(clause: str) -> float:
    tokens = tokenize(clause)
    score = 0.0
    for index, token in enumerate(tokens):
        base = 0.0
        if token in POSITIVE_WORDS:
            base = 1.0
        elif token in NEGATIVE_WORDS:
            base = -1.0
        if base == 0:
            continue

        modifier = 1.0
        left_window = tokens[max(0, index - 2) : index]
        if any(item in NEGATION_WORDS for item in left_window):
            base *= -1
        for item in left_window:
            modifier *= INTENSIFIERS.get(item, 1.0)

        if token in {"一般", "重复"} and base < 0:
            modifier *= 0.85
        score += base * modifier

    if "不" in clause and any(word in clause for word in POSITIVE_WORDS):
        score -= 0.2
    if "不" in clause and any(word in clause for word in NEGATIVE_WORDS):
        score += 0.2
    return score
