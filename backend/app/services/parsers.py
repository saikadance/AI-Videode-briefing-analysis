from __future__ import annotations

from collections.abc import Iterable
import csv
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET


def _load_json(file_bytes: bytes) -> object:
    return json.loads(file_bytes.decode("utf-8-sig"))


def parse_comments(filename: str, file_bytes: bytes) -> list[str]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".json":
        payload = _load_json(file_bytes)
        if not isinstance(payload, list):
            raise ValueError("评论 JSON 必须是数组格式。")
        return list(_extract_texts(payload, ["content", "message", "text", "comment"]))

    if suffix == ".csv":
        text = file_bytes.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        return list(_extract_texts(reader, ["content", "message", "text", "comment"]))

    raise ValueError("暂不支持该评论文件格式，请使用 .json 或 .csv。")


def parse_danmaku(filename: str, file_bytes: bytes) -> list[dict[str, str | float]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".xml":
        return _parse_bilibili_xml(file_bytes)
    if suffix == ".json":
        payload = _load_json(file_bytes)
        if not isinstance(payload, list):
            raise ValueError("弹幕 JSON 必须是数组格式。")
        records: list[dict[str, str | float]] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            content = str(item.get("content") or item.get("text") or "").strip()
            if not content:
                continue
            raw_time = item.get("time", item.get("progress", item.get("timestamp", 0)))
            try:
                second = float(raw_time)
            except (TypeError, ValueError):
                second = 0.0
            records.append({"time": second, "content": content})
        return records

    raise ValueError("暂不支持该弹幕文件格式，请使用 .xml 或 .json。")


def _extract_texts(records: Iterable[dict], keys: list[str]) -> Iterable[str]:
    for item in records:
        if not isinstance(item, dict):
            continue
        for key in keys:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                yield value.strip()
                break


def _parse_bilibili_xml(file_bytes: bytes) -> list[dict[str, str | float]]:
    root = ET.fromstring(file_bytes.decode("utf-8-sig"))
    records: list[dict[str, str | float]] = []
    for node in root.findall(".//d"):
        parts = node.attrib.get("p", "").split(",")
        if not parts:
            continue
        try:
            second = float(parts[0])
        except ValueError:
            continue
        content = (node.text or "").strip()
        if not content:
            continue
        records.append({"time": second, "content": content})
    return records
