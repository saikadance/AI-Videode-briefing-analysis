import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(slots=True)
class Settings:
    openai_api_key: str
    openai_base_url: str
    openai_model: str
    bilibili_cookie: str


def _clean_env(value: str | None, *, multiline: bool = False) -> str:
    cleaned = str(value or "")
    cleaned = cleaned.strip().strip("\"'").strip()
    if multiline:
        return cleaned.replace("\r", "").replace("\n", "").strip()
    return cleaned.replace("\r", "").replace("\n", "").strip()


@lru_cache
def get_settings() -> Settings:
    return Settings(
        openai_api_key=_clean_env(os.getenv("OPENAI_API_KEY", "")),
        openai_base_url=_clean_env(os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")).rstrip("/"),
        openai_model=_clean_env(os.getenv("OPENAI_MODEL", "gpt-5.4-mini")),
        bilibili_cookie=_clean_env(os.getenv("BILIBILI_COOKIE", ""), multiline=True),
    )
