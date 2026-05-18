from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.services.openai_client import OpenAIServiceError, request_chat_completion, request_multimodal_completion


SKILL_PATH = Path(__file__).resolve().parents[3] / "skills" / "video-project-assistant" / "SKILL.md"
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


async def reply_in_project_chat(
    *,
    title: str,
    notes: str,
    manuscript: str,
    latest_copy_analysis: str = "",
    latest_metrics_analysis: str = "",
    latest_community_analysis: str = "",
    history: list[dict[str, Any]] | None = None,
    user_message: str,
    attachments: list[dict[str, str]] | None = None,
) -> str:
    system_prompt = _load_skill_prompt()
    prompt = _build_user_prompt(
        title=title,
        notes=notes,
        manuscript=manuscript,
        latest_copy_analysis=latest_copy_analysis,
        latest_metrics_analysis=latest_metrics_analysis,
        latest_community_analysis=latest_community_analysis,
        history=history or [],
        user_message=user_message,
        attachments=attachments or [],
    )
    settings = get_settings()

    try:
        if attachments:
            return await request_multimodal_completion(
                system_prompt=system_prompt,
                user_text=prompt,
                images=[_prepare_image_payload(item) for item in attachments],
                temperature=None,
                model=settings.openai_copy_model,
            )

        return await request_chat_completion(
            system_prompt=system_prompt,
            user_prompt=prompt,
            temperature=None,
            model=settings.openai_copy_model,
        )
    except OpenAIServiceError:
        if settings.openai_copy_model != settings.openai_model:
            if attachments:
                return await request_multimodal_completion(
                    system_prompt=system_prompt,
                    user_text=prompt,
                    images=[_prepare_image_payload(item) for item in attachments],
                    temperature=0.4,
                    model=settings.openai_model,
                )
            return await request_chat_completion(
                system_prompt=system_prompt,
                user_prompt=prompt,
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


def _prepare_image_payload(attachment: dict[str, str]) -> dict[str, str]:
    mime_type = str(attachment.get("mime_type") or "").strip().lower()
    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("对话图片目前仅支持 PNG、JPG、JPEG、WEBP。")

    public_url = str(attachment.get("public_url") or "").strip()
    if not public_url:
        raise ValueError("对话图片缺少可访问地址，无法提交给 AI。")

    label = f"附件类型：{'视频数据截图' if attachment.get('kind') == 'data' else '参考图片'}；名称：{attachment.get('name') or '未命名图片'}"
    return {"url": public_url, "mime_type": mime_type, "label": label}


def _build_user_prompt(
    *,
    title: str,
    notes: str,
    manuscript: str,
    latest_copy_analysis: str,
    latest_metrics_analysis: str,
    latest_community_analysis: str,
    history: list[dict[str, Any]],
    user_message: str,
    attachments: list[dict[str, str]],
) -> str:
    payload = {
        "project": {
            "title": title or "未命名",
            "notes": notes or "",
            "manuscript": manuscript or "",
        },
        "cached_analysis": {
            "copy": _trim_text(latest_copy_analysis),
            "metrics": _trim_text(latest_metrics_analysis),
            "community": _trim_text(latest_community_analysis),
        },
        "recent_history": [_normalize_history_item(item) for item in history[-10:]],
        "new_message": {
            "content": user_message,
            "attachments": [
                {
                    "name": item.get("name") or "未命名图片",
                    "kind": item.get("kind") or "reference",
                }
                for item in attachments
            ],
        },
    }
    return (
        "下面是当前视频项目的上下文。请根据项目背景、最近对话、已有分析摘要和新的用户问题继续对话式协助。"
        "如果有图片附件，请结合附件类型判断它们是视频数据截图还是普通参考图。"
        "\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )


def _normalize_history_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": str(item.get("role") or "user"),
        "content": _trim_text(str(item.get("content") or ""), 1200),
        "attachments": item.get("attachments") or [],
    }


def _trim_text(text: str, limit: int = 1800) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit] + "..."
