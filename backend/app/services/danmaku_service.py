from __future__ import annotations

from collections import Counter, defaultdict
import statistics

from app.models import DanmakuInsight, DensityPoint, KeywordStat, PeakSegment
from app.services.text_analysis import keyword_stats


def analyze_danmaku(records: list[dict[str, str | float]]) -> DanmakuInsight:
    if not records:
        return DanmakuInsight(
            total_danmaku=0,
            duration_seconds=0,
            density_points=[],
            peak_segments=[],
        )

    buckets: defaultdict[int, list[str]] = defaultdict(list)
    for record in records:
        second = int(float(record["time"]))
        content = str(record["content"])
        buckets[second].append(content)

    duration_seconds = max(buckets) if buckets else 0
    density_points = [DensityPoint(second=second, count=len(buckets.get(second, []))) for second in range(duration_seconds + 1)]

    counts = [point.count for point in density_points]
    mean_count = statistics.fmean(counts) if counts else 0
    stdev = statistics.pstdev(counts) if len(counts) > 1 else 0
    threshold = max(2, int(mean_count + stdev))

    peak_segments = _build_peak_segments(density_points, buckets, threshold)
    return DanmakuInsight(
        total_danmaku=len(records),
        duration_seconds=duration_seconds,
        density_points=density_points,
        peak_segments=peak_segments,
    )


def _build_peak_segments(
    density_points: list[DensityPoint],
    buckets: dict[int, list[str]],
    threshold: int,
) -> list[PeakSegment]:
    if not density_points:
        return []

    counts = [point.count for point in density_points]
    smoothed = _smooth_counts(counts, radius=2)
    candidate_peaks = _find_local_peaks(smoothed, threshold)
    if not candidate_peaks:
        candidate_peaks = _fallback_top_peaks(counts, threshold)

    segments = _expand_peak_segments(candidate_peaks, counts, threshold)

    results: list[PeakSegment] = []
    for segment_start, segment_end, peak_second in segments[:8]:
        texts: list[str] = []
        counter: Counter[int] = Counter()
        for second in range(segment_start, segment_end + 1):
            second_texts = buckets.get(second, [])
            texts.extend(second_texts)
            counter[second] = len(second_texts)

        top_keywords = [KeywordStat(**item) for item in keyword_stats(texts, top_k=8)]
        highlights = texts[:5]
        real_peak_second = counter.most_common(1)[0][0] if counter else peak_second
        peak_count = counter.get(real_peak_second, 0)
        summary = (
            f"区间内弹幕显著升高，峰值约出现在 {real_peak_second} 秒，"
            f"该秒弹幕数约为 {peak_count}，讨论集中在 {', '.join([item.word for item in top_keywords[:4]]) or '情绪表达'}。"
        )

        results.append(
            PeakSegment(
                start_second=segment_start,
                end_second=segment_end,
                peak_second=real_peak_second,
                peak_count=peak_count,
                total_danmaku=len(texts),
                keywords=top_keywords,
                highlights=highlights,
                summary=summary,
            )
        )

    return results


def _smooth_counts(counts: list[int], radius: int) -> list[float]:
    smoothed: list[float] = []
    for index in range(len(counts)):
        start = max(0, index - radius)
        end = min(len(counts), index + radius + 1)
        window = counts[start:end]
        smoothed.append(sum(window) / len(window))
    return smoothed


def _find_local_peaks(smoothed: list[float], threshold: int) -> list[int]:
    peaks: list[int] = []
    for index, value in enumerate(smoothed):
        left = smoothed[index - 1] if index > 0 else float("-inf")
        right = smoothed[index + 1] if index < len(smoothed) - 1 else float("-inf")
        if value >= threshold and value >= left and value >= right:
            peaks.append(index)
    return peaks


def _fallback_top_peaks(counts: list[int], threshold: int) -> list[int]:
    ranked = sorted(
        [index for index, count in enumerate(counts) if count >= threshold],
        key=lambda index: counts[index],
        reverse=True,
    )
    selected: list[int] = []
    for index in ranked:
        if all(abs(index - existing) > 6 for existing in selected):
            selected.append(index)
        if len(selected) >= 6:
            break
    return sorted(selected)


def _expand_peak_segments(candidate_peaks: list[int], counts: list[int], threshold: int) -> list[tuple[int, int, int]]:
    if not candidate_peaks:
        return []

    raw_segments: list[tuple[int, int, int, int]] = []
    for peak_index in candidate_peaks:
        peak_count = counts[peak_index]
        edge_floor = max(1, min(threshold, int(peak_count * 0.45)))

        start = peak_index
        while start > 0 and counts[start - 1] >= edge_floor:
            start -= 1

        end = peak_index
        while end < len(counts) - 1 and counts[end + 1] >= edge_floor:
            end += 1

        raw_segments.append((start, end, peak_index, peak_count))

    raw_segments.sort(key=lambda item: (item[0], item[1]))
    merged: list[tuple[int, int, int, int]] = []
    for start, end, peak_index, peak_count in raw_segments:
        if not merged:
            merged.append((start, end, peak_index, peak_count))
            continue

        prev_start, prev_end, prev_peak_index, prev_peak_count = merged[-1]
        if start <= prev_end + 2:
            merged_start = prev_start
            merged_end = max(prev_end, end)
            if peak_count > prev_peak_count:
                merged[-1] = (merged_start, merged_end, peak_index, peak_count)
            else:
                merged[-1] = (merged_start, merged_end, prev_peak_index, prev_peak_count)
        else:
            merged.append((start, end, peak_index, peak_count))

    ranked = sorted(merged, key=lambda item: (item[3], item[1] - item[0]), reverse=True)
    top_segments = ranked[:8]
    top_segments.sort(key=lambda item: item[0])
    return [(start, end, peak_index) for start, end, peak_index, _ in top_segments]
