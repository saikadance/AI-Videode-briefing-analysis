from __future__ import annotations

import asyncio
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

import json

from app.models import CombinedAnalysisResponse, CopyAnalysisResponse, DataScreenshotAnalysisResponse, ProjectChatResponse
from app.services.ai_summary import generate_ai_summary
from app.services.bilibili_service import BilibiliFetchError, fetch_bilibili_payload
from app.services.comment_service import analyze_comments
from app.services.copy_analysis import analyze_copywriting
from app.services.data_screenshot_analysis import analyze_data_screenshots
from app.services.danmaku_service import analyze_danmaku
from app.services.parsers import parse_comments, parse_danmaku
from app.services.project_chat import reply_in_project_chat
from app.services.temp_image_store import resolve_temp_image, save_temp_image


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
app = Flask(__name__, static_folder=str(FRONTEND_DIST), static_url_path="")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)  # type: ignore[assignment]
CORS(app)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/analyze/combined")
def analyze_combined():
    comments_file = request.files.get("comments_file")
    danmaku_file = request.files.get("danmaku_file")
    use_ai = request.form.get("use_ai", "true").lower() == "true"

    if comments_file is None or danmaku_file is None:
        return jsonify({"detail": "请同时上传评论文件和弹幕文件。"}), 400

    try:
        comments_texts = parse_comments(comments_file.filename or "", comments_file.read())
        danmaku_records = parse_danmaku(danmaku_file.filename or "", danmaku_file.read())
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400
    except Exception:
        return jsonify({"detail": "文件解析失败，请检查文件内容是否完整。"}), 500

    comments_analysis = analyze_comments(comments_texts)
    danmaku_analysis = analyze_danmaku(danmaku_records)
    combined = CombinedAnalysisResponse(comments=comments_analysis, danmaku=danmaku_analysis)

    if use_ai:
        combined.ai_summary = asyncio.run(generate_ai_summary(combined))

    return jsonify(combined.to_dict())


@app.post("/api/analyze/bilibili")
def analyze_bilibili():
    payload = request.get_json(silent=True) or {}
    video_input = str(payload.get("video_input") or "").strip()
    use_ai = bool(payload.get("use_ai", True))

    if not video_input:
        return jsonify({"detail": "请输入 B 站视频链接或 BV 号。"}), 400

    try:
        bilibili_payload = fetch_bilibili_payload(video_input)
    except BilibiliFetchError as exc:
        return jsonify({"detail": str(exc)}), 400
    except Exception as exc:
        return jsonify({"detail": f"抓取 B 站视频数据失败：{exc}"}), 500

    comments_analysis = analyze_comments(bilibili_payload.comments)
    danmaku_analysis = analyze_danmaku(bilibili_payload.danmaku_records)
    combined = CombinedAnalysisResponse(
        comments=comments_analysis,
        danmaku=danmaku_analysis,
        source=bilibili_payload.source,
    )

    if use_ai:
        combined.ai_summary = asyncio.run(generate_ai_summary(combined))

    return jsonify(combined.to_dict())


@app.post("/api/analyze/copy")
def analyze_copy():
    payload = request.get_json(silent=True) or {}
    manuscript = str(payload.get("manuscript") or "").strip()
    title = str(payload.get("title") or "").strip()
    notes = str(payload.get("notes") or "").strip()

    if not manuscript:
        return jsonify({"detail": "请输入需要分析的文案或文稿正文。"}), 400

    try:
        analysis = asyncio.run(analyze_copywriting(manuscript=manuscript, title=title, notes=notes))
    except Exception as exc:
        return jsonify({"detail": str(exc) or "AI 文案分析失败，请稍后重试。"}), 502

    return jsonify(CopyAnalysisResponse(analysis=analysis, title=title, notes=notes).to_dict())


@app.post("/api/analyze/data-screenshots")
def analyze_data_screenshot_input():
    image_files = request.files.getlist("images")
    manuscript = str(request.form.get("manuscript") or "").strip()
    title = str(request.form.get("title") or "").strip()
    notes = str(request.form.get("notes") or "").strip()

    if not image_files:
        return jsonify({"detail": "请至少粘贴或上传一张视频数据截图。"}), 400

    images: list[dict[str, str | bytes]] = []
    base_url = request.host_url.rstrip("/")
    for image_file in image_files:
        raw_bytes = image_file.read()
        if not raw_bytes:
            continue
        image_name = save_temp_image(filename=image_file.filename or "screenshot.png", content=raw_bytes)
        images.append(
            {
                "filename": image_file.filename or "screenshot",
                "mime_type": image_file.mimetype or "application/octet-stream",
                "public_url": f"{base_url}/api/tmp-image/{image_name}",
            }
        )

    if not images:
        return jsonify({"detail": "上传的截图为空，请重新粘贴或选择图片。"}), 400

    try:
        analysis = asyncio.run(
            analyze_data_screenshots(
                images=images,
                manuscript=manuscript,
                title=title,
                notes=notes,
            )
        )
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400
    except Exception as exc:
        return jsonify({"detail": str(exc) or "AI 视频数据分析失败，请稍后重试。"}), 502

    return jsonify(
        DataScreenshotAnalysisResponse(
            analysis=analysis,
            image_count=len(images),
            title=title,
            notes=notes,
            manuscript_attached=bool(manuscript),
        ).to_dict()
    )


@app.post("/api/projects/chat")
def project_chat():
    payload_raw = request.form.get("payload", "")
    image_files = request.files.getlist("images")

    try:
        payload = json.loads(payload_raw) if payload_raw else {}
    except json.JSONDecodeError:
        return jsonify({"detail": "项目对话请求格式错误，无法解析 payload。"}), 400

    title = str(payload.get("title") or "").strip()
    notes = str(payload.get("notes") or "").strip()
    manuscript = str(payload.get("manuscript") or "").strip()
    latest_copy_analysis = str(payload.get("latest_copy_analysis") or "").strip()
    latest_metrics_analysis = str(payload.get("latest_metrics_analysis") or "").strip()
    latest_community_analysis = str(payload.get("latest_community_analysis") or "").strip()
    user_message = str(payload.get("message") or "").strip()
    history = payload.get("history") or []
    attachment_meta = payload.get("attachments") or []

    if not user_message and not image_files:
        return jsonify({"detail": "请输入对话内容，或至少附上一张图片。"}), 400

    base_url = request.host_url.rstrip("/")
    attachments: list[dict[str, str]] = []
    for index, image_file in enumerate(image_files):
        raw_bytes = image_file.read()
        if not raw_bytes:
            continue
        image_name = save_temp_image(filename=image_file.filename or "chat-image.png", content=raw_bytes)
        meta = attachment_meta[index] if index < len(attachment_meta) and isinstance(attachment_meta[index], dict) else {}
        attachments.append(
            {
                "name": str(meta.get("name") or image_file.filename or "未命名图片"),
                "kind": str(meta.get("kind") or "reference"),
                "mime_type": image_file.mimetype or "application/octet-stream",
                "public_url": f"{base_url}/api/tmp-image/{image_name}",
            }
        )

    try:
        reply = asyncio.run(
            reply_in_project_chat(
                title=title,
                notes=notes,
                manuscript=manuscript,
                latest_copy_analysis=latest_copy_analysis,
                latest_metrics_analysis=latest_metrics_analysis,
                latest_community_analysis=latest_community_analysis,
                history=history if isinstance(history, list) else [],
                user_message=user_message,
                attachments=attachments,
            )
        )
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400
    except Exception as exc:
        return jsonify({"detail": str(exc) or "项目对话分析失败，请稍后重试。"}), 502

    return jsonify(ProjectChatResponse(reply=reply, attachment_count=len(attachments)).to_dict())


@app.get("/api/tmp-image/<path:image_name>")
def serve_temp_image(image_name: str):
    try:
        file_path, mime_type = resolve_temp_image(image_name)
    except FileNotFoundError:
        return jsonify({"detail": "Image Not Found"}), 404
    return send_from_directory(file_path.parent, file_path.name, mimetype=mime_type)


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def serve_frontend(path: str):
    if path.startswith("api/"):
        return jsonify({"detail": "Not Found"}), 404

    if FRONTEND_DIST.exists():
        target = FRONTEND_DIST / path
        if path and target.exists() and target.is_file():
            return send_from_directory(FRONTEND_DIST, path)
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return send_from_directory(FRONTEND_DIST, "index.html")

    return (
        jsonify(
            {
                "detail": "前端构建文件不存在，请先执行 frontend 的 npm run build，或使用根目录 start_app.cmd 启动。"
            }
        ),
        503,
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
