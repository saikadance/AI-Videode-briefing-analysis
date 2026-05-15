from __future__ import annotations

import mimetypes
from pathlib import Path
from uuid import uuid4


TMP_IMAGE_DIR = Path(__file__).resolve().parents[2] / "tmp_images"


def save_temp_image(*, filename: str, content: bytes) -> str:
    TMP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename or "image.png").suffix or ".png"
    image_name = f"{uuid4().hex}{suffix.lower()}"
    (TMP_IMAGE_DIR / image_name).write_bytes(content)
    return image_name


def resolve_temp_image(image_name: str) -> tuple[Path, str]:
    path = (TMP_IMAGE_DIR / image_name).resolve()
    if path.parent != TMP_IMAGE_DIR.resolve() or not path.exists():
      raise FileNotFoundError(image_name)
    mime_type, _ = mimetypes.guess_type(path.name)
    return path, mime_type or "application/octet-stream"
