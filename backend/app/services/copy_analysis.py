from __future__ import annotations

from pathlib import Path

from app.config import get_settings
from app.services.openai_client import request_chat_completion


SKILL_PATH = Path(__file__).resolve().parents[3] / "skills" / "video-copy-analyst" / "SKILL.md"


async def analyze_copywriting(*, manuscript: str, title: str = "", notes: str = "") -> str:
    skill_prompt = _load_skill_prompt()
    prompt = _build_user_prompt(manuscript=manuscript, title=title, notes=notes)
    return await request_chat_completion(
        system_prompt=skill_prompt,
        user_prompt=prompt,
        temperature=0.55,
        model=get_settings().openai_copy_model,
    )


def _load_skill_prompt() -> str:
    content = SKILL_PATH.read_text(encoding="utf-8")
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            return parts[2].strip()
    return content.strip()


def _build_user_prompt(*, manuscript: str, title: str, notes: str) -> str:
    title_block = f"拟定标题/定位：{title.strip()}" if title.strip() else "拟定标题/定位：未提供"
    notes_block = f"补充说明：{notes.strip()}" if notes.strip() else "补充说明：无"
    return (
        "请从专业视频媒体运营和内容策划的角度，对下面这份视频文案/文稿做深度点评。"
        "重点关注点击动机、前30秒钩子、结构节奏、观众理解门槛、包装定位是否错位、互动潜力，以及哪些段落更像图文而不是视频。"
        "请不要泛泛而谈，要明确指出最关键的问题、为什么会拖数据，以及最优先怎么改。"
        "\n\n"
        f"{title_block}\n"
        f"{notes_block}\n\n"
        "文稿正文：\n"
        f"{manuscript.strip()}"
    )
