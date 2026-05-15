from __future__ import annotations

import asyncio
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from app.models import CombinedAnalysisResponse, CopyAnalysisResponse
from app.services.ai_summary import generate_ai_summary
from app.services.bilibili_service import BilibiliFetchError, fetch_bilibili_payload
from app.services.comment_service import analyze_comments
from app.services.copy_analysis import analyze_copywriting
from app.services.danmaku_service import analyze_danmaku
from app.services.parsers import parse_comments, parse_danmaku


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
app = Flask(__name__, static_folder=str(FRONTEND_DIST), static_url_path="")
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
    except Exception:
        return jsonify({"detail": "抓取 B 站视频数据失败，请稍后重试。"}), 500

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
