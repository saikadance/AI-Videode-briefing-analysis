from __future__ import annotations

import base64
from pathlib import Path

from app.config import get_settings
from app.services.openai_client import request_multimodal_completion


SKILL_PATH = Path(__file__).resolve().parents[3] / "skills" / "video-data-analyst" / "SKILL.md"
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


async def analyze_data_screenshots(
    *,
    images: list[dict[str, str | bytes]],
    manuscript: str = "",
    title: str = "",
    notes: str = "",
) -> str:
    if not images:
        raise ValueError("请至少提供一张视频数据截图。")

    encoded_images = [_encode_image_payload(image) for image in images]
    return await request_multimodal_completion(
        system_prompt=_load_skill_prompt(),
        user_text=_build_user_prompt(manuscript=manuscript, title=title, notes=notes, image_count=len(encoded_images)),
        images=encoded_images,
        temperature=None,
        model=get_settings().openai_copy_model,
    )


def _load_skill_prompt() -> str:
    content = SKILL_PATH.read_text(encoding="utf-8")
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return content.strip()


def _encode_image_payload(image: dict[str, str | bytes]) -> dict[str, str]:
    mime_type = str(image.get("mime_type") or "").strip().lower()
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("目前仅支持 PNG、JPG、JPEG、WEBP 格式的数据截图。")

    raw_bytes = image.get("bytes")
    if not isinstance(raw_bytes, bytes) or not raw_bytes:
        raise ValueError("上传的截图内容为空或格式异常。")

    encoded = base64.b64encode(raw_bytes).decode("ascii")
    return {
        "mime_type": mime_type,
        "data_url": f"data:{mime_type};base64,{encoded}",
    }


def _build_user_prompt(*, manuscript: str, title: str, notes: str, image_count: int) -> str:
    title_block = f"拟定标题/定位：{title.strip()}" if title.strip() else "拟定标题/定位：未提供"
    notes_block = f"补充说明：{notes.strip()}" if notes.strip() else "补充说明：无"
    manuscript_block = manuscript.strip() if manuscript.strip() else "当前未附带文稿正文，请仅根据截图做视频数据判断。"
    return (
        "下面是 B 站后台或相关视频数据截图，请你像资深内容运营一样直接读图分析。"
        "重点判断播放走势、互动结构、留存/流失、封面标题吸引力、内容节奏问题，以及这些数据和当前文稿定位之间是否一致。"
        "如果截图里的信息不完整，请明确指出哪些判断只是趋势推断。"
        "\n\n"
        f"截图数量：{image_count}\n"
        f"{title_block}\n"
        f"{notes_block}\n\n"
        "当前文稿上下文：\n"
        f"{manuscript_block}"
    )
