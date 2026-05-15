from __future__ import annotations

import httpx

from app.config import get_settings


class OpenAIServiceError(Exception):
    pass


async def _post_chat_completion(payload: dict) -> str:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.openai_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return str(data["choices"][0]["message"]["content"]).strip()
    except Exception as exc:
        raise OpenAIServiceError(f"AI 请求失败：{exc}") from exc


async def request_chat_completion(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.4,
    model: str | None = None,
) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise OpenAIServiceError("缺少 OPENAI_API_KEY，无法调用 AI。")

    payload = {
        "model": model or settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
    }

    return await _post_chat_completion(payload)


async def request_multimodal_completion(
    *,
    system_prompt: str,
    user_text: str,
    images: list[dict[str, str]],
    temperature: float = 0.35,
    model: str | None = None,
) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise OpenAIServiceError("缺少 OPENAI_API_KEY，无法调用 AI。")

    user_content: list[dict[str, object]] = [{"type": "text", "text": user_text}]
    for image in images:
        user_content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": image["data_url"],
                },
            }
        )

    payload = {
        "model": model or settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }

    return await _post_chat_completion(payload)
