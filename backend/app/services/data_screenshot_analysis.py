from __future__ import annotations

from pathlib import Path

from app.config import get_settings
from app.services.openai_client import OpenAIServiceError, request_multimodal_completion


SKILL_PATH = Path(__file__).resolve().parents[3] / "skills" / "video-data-analyst" / "SKILL.md"
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


async def analyze_data_screenshots(
    *,
    images: list[dict[str, str | bytes]],
    manuscript: str = "",
    title: str = "",
    notes: str = "",
    analysis_stage: str = "",
    analysis_context: str = "",
) -> str:
    if not images:
        raise ValueError("请至少提供一张视频数据截图。")

    image_payloads = [_prepare_image_payload(image) for image in images]
    settings = get_settings()
    try:
        return await request_multimodal_completion(
            system_prompt=_load_skill_prompt(),
            user_text=_build_user_prompt(
                manuscript=manuscript,
                title=title,
                notes=notes,
                analysis_stage=analysis_stage,
                analysis_context=analysis_context,
                image_count=len(image_payloads),
            ),
            images=image_payloads,
            temperature=None,
            model=settings.openai_copy_model,
        )
    except OpenAIServiceError:
        if settings.openai_copy_model != settings.openai_model:
            return await request_multimodal_completion(
                system_prompt=_load_skill_prompt(),
                user_text=_build_user_prompt(
                    manuscript=manuscript,
                    title=title,
                    notes=notes,
                    analysis_stage=analysis_stage,
                    analysis_context=analysis_context,
                    image_count=len(image_payloads),
                ),
                images=image_payloads,
                temperature=0.4,
                model=settings.openai_model,
            )
        raise


def _load_skill_prompt() -> str:
    content = SKILL_PATH.read_text(encoding="utf-8")
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return content.strip()


def _prepare_image_payload(image: dict[str, str | bytes]) -> dict[str, str]:
    mime_type = str(image.get("mime_type") or "").strip().lower()
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("目前仅支持 PNG、JPG、JPEG、WEBP 格式的数据截图。")

    public_url = str(image.get("public_url") or "").strip()
    if public_url:
        return {
            "mime_type": mime_type,
            "url": public_url,
        }

    raise ValueError("截图缺少可访问地址，无法提交给 AI 做读图分析。")


def _build_user_prompt(
    *,
    manuscript: str,
    title: str,
    notes: str,
    analysis_stage: str,
    analysis_context: str,
    image_count: int,
) -> str:
    title_block = f"拟定标题/定位：{title.strip()}" if title.strip() else "拟定标题/定位：未提供"
    notes_block = f"补充备注：{notes.strip()}" if notes.strip() else "补充备注：无"
    stage_mapping = {
        "pre_publish": "发布前审稿",
        "post_publish": "发布后复盘",
    }
    stage_block = f"当前分析阶段：{stage_mapping.get(analysis_stage.strip(), analysis_stage.strip() or '未指定')}"
    context_block = f"分析上下文：{analysis_context.strip()}" if analysis_context.strip() else "分析上下文：无"
    manuscript_block = manuscript.strip() if manuscript.strip() else "当前未附带文稿正文，请仅根据截图做视频数据判断。"
    return (
        "下面是 B 站后台或相关视频数据截图，请你像资深内容运营一样直接读图分析。"
        "重点判断播放走势、互动结构、留存/流失、封面标题吸引力、内容节奏问题，以及这些数据和当前文稿定位之间是否一致。"
        "如果截图里的信息不完整，请明确指出哪些判断只是趋势推断。"
        "\n\n"
        f"截图数量：{image_count}\n"
        f"{title_block}\n"
        f"{notes_block}\n"
        f"{stage_block}\n"
        f"{context_block}\n\n"
        "当前文稿上下文：\n"
        f"{manuscript_block}"
    )
