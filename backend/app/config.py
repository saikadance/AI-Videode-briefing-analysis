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


@lru_cache
def get_settings() -> Settings:
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
        bilibili_cookie=os.getenv("BILIBILI_COOKIE", "").strip(),
    )
