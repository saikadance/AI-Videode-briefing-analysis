from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import time
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.parse import urlencode
import re

import httpx

from app.config import get_settings
from app.models import SourceInfo


BVID_PATTERN = re.compile(r"(BV[0-9A-Za-z]{10})", re.IGNORECASE)
AVID_PATTERN = re.compile(r"\bav(\d+)\b", re.IGNORECASE)
INITIAL_STATE_PATTERN = re.compile(r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;\s*\(function", re.S)
WBI_FORBIDDEN_PATTERN = re.compile(r"[!'()*]")
MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]


class BilibiliFetchError(Exception):
    pass


@dataclass(slots=True)
class BilibiliPayload:
    source: SourceInfo
    comments: list[str]
    danmaku_records: list[dict[str, str | float]]


def fetch_bilibili_payload(video_input: str, max_comment_pages: int | None = None) -> BilibiliPayload:
    with httpx.Client(
        headers=_default_headers(),
        follow_redirects=True,
        timeout=20,
    ) as client:
        normalized = _normalize_video_input(client, video_input)
        video_data = _fetch_video_data(client, normalized["bvid"], normalized["aid"])
        selected_page = _pick_page(video_data, normalized["page"])

        aid = int(video_data["aid"])
        cid = int(selected_page["cid"])
        title = str(video_data.get("title") or "")
        part = str(selected_page.get("part") or "")
        subtitle = part if part and part != title else ""
        stat = video_data.get("stat") or {}
        owner = video_data.get("owner") or {}

        comments = _fetch_comments(client, aid, max_pages=max_comment_pages)
        danmaku_records = _fetch_danmaku_records(
            client,
            aid=aid,
            cid=cid,
            duration_seconds=int(selected_page.get("duration") or video_data.get("duration") or 0),
        )

        return BilibiliPayload(
            source=SourceInfo(
                platform="bilibili",
                title=title,
                subtitle=subtitle,
                url=f"https://www.bilibili.com/video/{video_data['bvid']}?p={selected_page['page']}",
                bvid=str(video_data["bvid"]),
                aid=aid,
                cid=cid,
                page=int(selected_page["page"]),
                owner_name=str(owner.get("name") or ""),
                duration_seconds=int(selected_page.get("duration") or video_data.get("duration") or 0),
                view_count=int(stat.get("view") or 0),
                comment_count=int(stat.get("reply") or 0),
                danmaku_count=int(stat.get("danmaku") or 0),
            ),
            comments=comments,
            danmaku_records=danmaku_records,
        )


def _default_headers() -> dict[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/135.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.bilibili.com/",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    cookie = get_settings().bilibili_cookie
    if cookie:
        headers["Cookie"] = cookie
    return headers


def _normalize_video_input(client: httpx.Client, raw_input: str) -> dict[str, str | int]:
    text = (raw_input or "").strip()
    if not text:
        raise BilibiliFetchError("请输入 B 站视频链接或 BV 号。")

    page = _extract_page_number(text)
    bvid_match = BVID_PATTERN.search(text)
    if bvid_match:
        return {"bvid": _normalize_bvid(bvid_match.group(1)), "aid": "", "page": page}

    avid_match = AVID_PATTERN.search(text)
    if avid_match:
        return {"bvid": "", "aid": avid_match.group(1), "page": page}

    parsed = urlparse(text)
    if parsed.scheme and parsed.netloc:
        final_url = str(client.get(text).url)
        final_page = _extract_page_number(final_url) or page
        bvid_match = BVID_PATTERN.search(final_url)
        if bvid_match:
            return {"bvid": _normalize_bvid(bvid_match.group(1)), "aid": "", "page": final_page}
        avid_match = AVID_PATTERN.search(final_url)
        if avid_match:
            return {"bvid": "", "aid": avid_match.group(1), "page": final_page}

    raise BilibiliFetchError("没有识别到有效的 B 站视频链接或 BV 号。")


def _extract_page_number(text: str) -> int:
    parsed = urlparse(text)
    query_page = parse_qs(parsed.query).get("p", ["1"])[0]
    try:
        value = int(query_page)
    except ValueError:
        value = 1
    return max(1, value)


def _normalize_bvid(raw_bvid: str) -> str:
    cleaned = (raw_bvid or "").strip()
    if len(cleaned) < 2:
        return cleaned
    return "BV" + cleaned[2:]


def _fetch_video_data(client: httpx.Client, bvid: str, aid: str) -> dict[str, Any]:
    params = {"bvid": bvid} if bvid else {"aid": aid}
    response = client.get("https://api.bilibili.com/x/web-interface/view", params=params)
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") == 0 and isinstance(payload.get("data"), dict):
        return payload["data"]

    if bvid:
        return _fetch_video_data_from_page(client, bvid)
    raise BilibiliFetchError(f"获取视频信息失败：{payload.get('message') or payload.get('code')}")


def _fetch_video_data_from_page(client: httpx.Client, bvid: str) -> dict[str, Any]:
    response = client.get(f"https://www.bilibili.com/video/{bvid}")
    response.raise_for_status()
    match = INITIAL_STATE_PATTERN.search(response.text)
    if not match:
        raise BilibiliFetchError("无法从视频页面解析到视频信息，请确认链接有效。")

    initial_state = json.loads(match.group(1))
    video_data = initial_state.get("videoData")
    if not isinstance(video_data, dict):
        raise BilibiliFetchError("视频页面中缺少可用的视频数据。")
    return video_data


def _pick_page(video_data: dict[str, Any], page_number: int) -> dict[str, Any]:
    pages = video_data.get("pages") or []
    if not isinstance(pages, list) or not pages:
        cid = int(video_data.get("cid") or 0)
        return {
            "cid": cid,
            "page": 1,
            "part": "",
            "duration": int(video_data.get("duration") or 0),
        }

    index = min(max(page_number - 1, 0), len(pages) - 1)
    page_data = pages[index]
    if not isinstance(page_data, dict):
        raise BilibiliFetchError("视频分 P 数据异常，无法定位当前页面。")
    return page_data


def _fetch_comments(client: httpx.Client, aid: int, max_pages: int | None) -> list[str]:
    try:
        return _fetch_comments_wbi(client, aid, max_pages)
    except (BilibiliFetchError, httpx.HTTPError):
        legacy_comments = _fetch_comments_legacy(client, aid, max_pages)
        if legacy_comments:
            return legacy_comments
        raise


def _fetch_comments_legacy(client: httpx.Client, aid: int, max_pages: int | None) -> list[str]:
    comments: list[str] = []
    seen_rpids: set[int] = set()
    page_limit = max_pages or 200

    def collect(items: list[dict[str, Any]] | None) -> None:
        if not items:
            return
        for item in items:
            _collect_comment_messages(item, comments, seen_rpids)

    hot_payload = _request_comment_page(client, aid=aid, page=1, sort=1, nohot=0)
    collect((hot_payload.get("data") or {}).get("hots"))
    upper_top = ((hot_payload.get("data") or {}).get("upper") or {}).get("top")
    if isinstance(upper_top, dict):
        _collect_comment_messages(upper_top, comments, seen_rpids)

    for page in range(1, page_limit + 1):
        payload = _request_comment_page(client, aid=aid, page=page, sort=0, nohot=1)
        replies = (payload.get("data") or {}).get("replies")
        if not replies:
            break
        collect(replies)

    return comments


def _fetch_comments_wbi(client: httpx.Client, aid: int, max_pages: int | None) -> list[str]:
    comments: list[str] = []
    seen_rpids: set[int] = set()
    next_offset = ""
    page_limit = max_pages or 200

    for page_index in range(page_limit):
        payload = _request_comment_page_wbi(client, aid=aid, next_offset=next_offset)
        data = payload.get("data") or {}

        for bucket_name in ("top_replies", "hots", "replies"):
            items = data.get(bucket_name)
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        _collect_comment_messages(item, comments, seen_rpids)
                        _fetch_child_replies(client, aid, item, comments, seen_rpids)

        cursor = data.get("cursor") or {}
        pagination_reply = cursor.get("pagination_reply") or {}
        next_offset = str(pagination_reply.get("next_offset") or "")
        if not next_offset or cursor.get("is_end") is True or page_index == page_limit - 1:
            break

    if not comments:
        raise BilibiliFetchError("没有抓取到评论，可能是评论区关闭、需要登录，或接口风控限制了游客访问。")
    return comments


def _request_comment_page(client: httpx.Client, aid: int, page: int, sort: int, nohot: int) -> dict[str, Any]:
    response = client.get(
        "https://api.bilibili.com/x/v2/reply",
        params={
            "type": 1,
            "oid": aid,
            "pn": page,
            "ps": 20,
            "sort": sort,
            "nohot": nohot,
        },
    )
    response.raise_for_status()
    payload = response.json()
    code = payload.get("code")
    if code not in (0, None):
        message = str(payload.get("message") or code)
        raise BilibiliFetchError(f"抓取评论失败：{message}")
    return payload


def _request_comment_page_wbi(client: httpx.Client, aid: int, next_offset: str) -> dict[str, Any]:
    params: dict[str, Any] = {
        "oid": aid,
        "type": 1,
        "mode": 2,
        "plat": 1,
        "web_location": 1315875,
        "pagination_str": json.dumps({"offset": next_offset}, ensure_ascii=False, separators=(",", ":")),
    }
    signed_params = _enc_wbi(client, params)
    response = client.get("https://api.bilibili.com/x/v2/reply/wbi/main", params=signed_params)
    response.raise_for_status()
    payload = response.json()
    code = payload.get("code")
    if code not in (0, None):
        message = str(payload.get("message") or code)
        raise BilibiliFetchError(f"抓取评论失败：{message}")
    return payload


def _request_child_reply_page(client: httpx.Client, aid: int, root_rpid: int, page: int) -> dict[str, Any]:
    response = client.get(
        "https://api.bilibili.com/x/v2/reply/reply",
        params={
            "type": 1,
            "oid": aid,
            "root": root_rpid,
            "ps": 20,
            "pn": page,
        },
    )
    response.raise_for_status()
    payload = response.json()
    code = payload.get("code")
    if code not in (0, None):
        message = str(payload.get("message") or code)
        raise BilibiliFetchError(f"抓取楼中楼评论失败：{message}")
    return payload


def _fetch_child_replies(
    client: httpx.Client,
    aid: int,
    root_item: dict[str, Any],
    output: list[str],
    seen_rpids: set[int],
) -> None:
    root_rpid = int(root_item.get("rpid") or 0)
    if not root_rpid:
        return

    preview_replies = root_item.get("replies") if isinstance(root_item.get("replies"), list) else []
    preview_count = len(preview_replies)
    reply_count = max(int(root_item.get("count") or 0), int(root_item.get("rcount") or 0), preview_count)
    if reply_count <= preview_count:
        return

    total_pages = math.ceil(reply_count / 20)
    for page in range(1, total_pages + 1):
        payload = _request_child_reply_page(client, aid=aid, root_rpid=root_rpid, page=page)
        replies = ((payload.get("data") or {}).get("replies")) or []
        if not replies:
            break
        for child in replies:
            if isinstance(child, dict):
                _collect_comment_messages(child, output, seen_rpids)


def _collect_comment_messages(item: dict[str, Any], output: list[str], seen_rpids: set[int]) -> None:
    rpid = int(item.get("rpid") or 0)
    if rpid and rpid in seen_rpids:
        return
    if rpid:
        seen_rpids.add(rpid)

    content = item.get("content") or {}
    message = str(content.get("message") or "").strip()
    if message:
        output.append(message)

    replies = item.get("replies")
    if isinstance(replies, list):
        for child in replies:
            if isinstance(child, dict):
                _collect_comment_messages(child, output, seen_rpids)


def _fetch_danmaku_records(client: httpx.Client, aid: int, cid: int, duration_seconds: int) -> list[dict[str, str | float]]:
    records: list[dict[str, str | float]] = []
    segment_count = max(1, math.ceil(max(duration_seconds, 1) / 360))

    for segment_index in range(1, segment_count + 1):
        response = client.get(
            "https://api.bilibili.com/x/v2/dm/web/seg.so",
            params={
                "type": 1,
                "oid": cid,
                "pid": aid,
                "segment_index": segment_index,
            },
        )
        response.raise_for_status()
        records.extend(_parse_danmaku_segment(response.content))

    if records:
        return records

    response = client.get("https://api.bilibili.com/x/v1/dm/list.so", params={"oid": cid})
    response.raise_for_status()
    return _parse_danmaku_xml_fallback(response.text)


def _parse_danmaku_segment(data: bytes) -> list[dict[str, str | float]]:
    records: list[dict[str, str | float]] = []
    offset = 0
    data_length = len(data)

    while offset < data_length:
        key, offset = _read_varint(data, offset)
        field_number = key >> 3
        wire_type = key & 0x7

        if field_number == 1 and wire_type == 2:
            message_length, offset = _read_varint(data, offset)
            message_bytes = data[offset : offset + message_length]
            offset += message_length
            parsed = _parse_danmaku_elem(message_bytes)
            if parsed:
                records.append(parsed)
        else:
            offset = _skip_wire_value(data, offset, wire_type)

    return records


def _parse_danmaku_elem(data: bytes) -> dict[str, str | float] | None:
    offset = 0
    progress_ms = 0
    content = ""

    while offset < len(data):
        key, offset = _read_varint(data, offset)
        field_number = key >> 3
        wire_type = key & 0x7

        if field_number == 2 and wire_type == 0:
            progress_ms, offset = _read_varint(data, offset)
        elif field_number == 7 and wire_type == 2:
            length, offset = _read_varint(data, offset)
            raw_text = data[offset : offset + length]
            offset += length
            content = raw_text.decode("utf-8", errors="ignore").strip()
        else:
            offset = _skip_wire_value(data, offset, wire_type)

    if not content:
        return None
    return {"time": round(progress_ms / 1000, 3), "content": content}


def _read_varint(data: bytes, offset: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        if offset >= len(data):
            raise BilibiliFetchError("解析弹幕数据时遇到不完整的 protobuf 数据。")
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            return result, offset
        shift += 7


def _skip_wire_value(data: bytes, offset: int, wire_type: int) -> int:
    if wire_type == 0:
        _, offset = _read_varint(data, offset)
        return offset
    if wire_type == 1:
        return offset + 8
    if wire_type == 2:
        length, offset = _read_varint(data, offset)
        return offset + length
    if wire_type == 5:
        return offset + 4
    raise BilibiliFetchError(f"遇到了不支持的 protobuf wire type: {wire_type}")


def _parse_danmaku_xml_fallback(xml_text: str) -> list[dict[str, str | float]]:
    pattern = re.compile(r'<d p="([^"]+)">(.*?)</d>')
    records: list[dict[str, str | float]] = []
    for match in pattern.finditer(xml_text):
        parts = match.group(1).split(",")
        if not parts:
            continue
        try:
            progress = float(parts[0])
        except ValueError:
            continue
        content = match.group(2).strip()
        if content:
            records.append({"time": progress, "content": content})
    return records


def _enc_wbi(client: httpx.Client, params: dict[str, Any]) -> dict[str, Any]:
    img_key, sub_key = _get_wbi_keys(client)
    mixin_key = _get_mixin_key(img_key + sub_key)
    current_ts = int(time.time())

    filtered_params: dict[str, Any] = {}
    for key, value in params.items():
        filtered_value = WBI_FORBIDDEN_PATTERN.sub("", str(value))
        filtered_params[key] = filtered_value

    filtered_params["wts"] = current_ts
    ordered = dict(sorted(filtered_params.items()))
    query = urlencode(ordered)
    ordered["w_rid"] = hashlib.md5(f"{query}{mixin_key}".encode("utf-8")).hexdigest()
    return ordered


def _get_wbi_keys(client: httpx.Client) -> tuple[str, str]:
    response = client.get("https://api.bilibili.com/x/web-interface/nav")
    response.raise_for_status()
    payload = response.json()
    wbi_img = ((payload.get("data") or {}).get("wbi_img") or {})
    img_url = str(wbi_img.get("img_url") or "")
    sub_url = str(wbi_img.get("sub_url") or "")
    if not img_url or not sub_url:
        raise BilibiliFetchError("无法获取 B 站 WBI 签名密钥。")
    img_key = img_url.rsplit("/", 1)[-1].split(".", 1)[0]
    sub_key = sub_url.rsplit("/", 1)[-1].split(".", 1)[0]
    return img_key, sub_key


def _get_mixin_key(origin: str) -> str:
    return "".join(origin[index] for index in MIXIN_KEY_ENC_TAB)[:32]
