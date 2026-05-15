import { FormEvent, Suspense, lazy, useState } from "react";
import { analyzeBilibili, analyzeCopy, analyzeDataScreenshots, analyzeFiles } from "./api";
import { AiSummary } from "./components/AiSummary";
import { CommentSummary } from "./components/CommentSummary";
import { FileUploader } from "./components/FileUploader";
import { ImagePasteUploader } from "./components/ImagePasteUploader";
import { PeakSegments } from "./components/PeakSegments";
import { SourceSummary } from "./components/SourceSummary";
import { CombinedAnalysis, CopyAnalysisResult, DataScreenshotAnalysisResult } from "./types";

const DanmakuTimeline = lazy(() =>
  import("./components/DanmakuTimeline").then((module) => ({ default: module.DanmakuTimeline }))
);

type AssistMode = "metrics" | "bilibili" | "files";
type ResultView = "copy" | "metrics" | "community";

export default function App() {
  const [assistMode, setAssistMode] = useState<AssistMode>("metrics");
  const [videoInput, setVideoInput] = useState("");
  const [commentsFile, setCommentsFile] = useState<File | null>(null);
  const [danmakuFile, setDanmakuFile] = useState<File | null>(null);
  const [metricImages, setMetricImages] = useState<File[]>([]);
  const [copyTitle, setCopyTitle] = useState("");
  const [copyNotes, setCopyNotes] = useState("");
  const [manuscript, setManuscript] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [bucketSize, setBucketSize] = useState(1);
  const [copyLoading, setCopyLoading] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [result, setResult] = useState<CombinedAnalysis | null>(null);
  const [copyResult, setCopyResult] = useState<CopyAnalysisResult | null>(null);
  const [metricResult, setMetricResult] = useState<DataScreenshotAnalysisResult | null>(null);
  const [resultView, setResultView] = useState<ResultView>("copy");

  const handleCopySubmit = async (event: FormEvent) => {
    event.preventDefault();
    setCopyLoading(true);
    setCopyError(null);

    try {
      const analysis = await analyzeCopy({ manuscript, title: copyTitle, notes: copyNotes });
      setCopyResult(analysis);
      setResultView("copy");
    } catch (submitError) {
      setCopyError(submitError instanceof Error ? submitError.message : "分析失败");
    } finally {
      setCopyLoading(false);
    }
  };

  const handleAssistSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAssistLoading(true);
    setAssistError(null);

    try {
      if (assistMode === "metrics") {
        const screenshotAnalysis = await analyzeDataScreenshots({
          images: metricImages,
          manuscript,
          title: copyTitle,
          notes: copyNotes,
        });
        setMetricResult(screenshotAnalysis);
        setResultView("metrics");
      } else {
        const analysis =
          assistMode === "bilibili"
            ? await analyzeBilibili({ videoInput, useAi })
            : await submitFiles();
        setResult(analysis);
        setResultView("community");
      }
    } catch (submitError) {
      setAssistError(submitError instanceof Error ? submitError.message : "分析失败");
    } finally {
      setAssistLoading(false);
    }
  };

  const submitFiles = async () => {
    if (!commentsFile || !danmakuFile) {
      throw new Error("请先同时选择评论文件和弹幕文件。");
    }
    return analyzeFiles({ commentsFile, danmakuFile, useAi });
  };

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Video Copy Analysis Studio</p>
          <h1 className="hero-title">先分析文稿，再让视频数据和评论弹幕做辅助判断。</h1>
          <p className="hero-text">
            当前主功能已经切到文案文稿分析，适合优先判断钩子、结构、包装和留存风险。评论、弹幕和视频数据分析会继续保留，作为后续验证内容效果的辅助链路。
          </p>
        </div>
      </header>

      <main className="layout">
        <section className="workspace-grid">
          <section className="panel control-panel primary-panel">
            <div className="panel-header">
              <div className="stack compact">
                <span className="section-kicker">主分析台</span>
                <h2>文案文稿分析</h2>
              </div>
              <span className="muted">先判断这稿子值不值得发、该怎么改，再让后续视频数据来验证判断。</span>
            </div>

            <form className="stack" onSubmit={handleCopySubmit}>
              <section className="input-card">
                <div className="two-column copy-meta-grid">
                  <div className="stack compact">
                    <label className="field-label" htmlFor="copyTitle">
                      标题 / 定位
                    </label>
                    <input
                      id="copyTitle"
                      className="text-input"
                      placeholder="例如：开发者采访、游戏分析、人物故事、选题包装方向"
                      value={copyTitle}
                      onChange={(event) => setCopyTitle(event.target.value)}
                    />
                  </div>
                  <div className="stack compact">
                    <label className="field-label" htmlFor="copyNotes">
                      补充说明
                    </label>
                    <input
                      id="copyNotes"
                      className="text-input"
                      placeholder="例如：准备发 B 站、10 分钟稿、担心点击率低"
                      value={copyNotes}
                      onChange={(event) => setCopyNotes(event.target.value)}
                    />
                  </div>
                </div>
                <label className="field-label" htmlFor="manuscript">
                  文案 / 文稿正文
                </label>
                <textarea
                  id="manuscript"
                  className="text-area"
                  placeholder="把完整稿件贴到这里，AI 会从专业视频媒体运营视角分析钩子、结构、节奏、包装和改稿方向。"
                  value={manuscript}
                  onChange={(event) => setManuscript(event.target.value)}
                />
                <p className="muted">
                  适合优先分析：视频脚本、口播文案、采访稿、选题包装方案、标题方向、开头钩子。后续可再结合评论、弹幕和视频数据做综合判断。
                </p>
              </section>

              <div className="toolbar">
                <div className="muted">优先调用 GPT-5.5 进行文案主分析，如代理兼容异常会自动回退到稳定模型。</div>
                <button className="primary-button" type="submit" disabled={copyLoading}>
                  {copyLoading ? "分析中..." : "分析文稿"}
                </button>
              </div>
            </form>

            {copyError ? <div className="error-banner">{copyError}</div> : null}
          </section>

          <aside className="panel secondary-panel">
            <div className="stack compact">
              <span className="section-kicker">辅助分析台</span>
              <h3>视频数据 / 评论 / 弹幕</h3>
              <p className="muted auxiliary-copy">
                这部分用于补充判断视频上线后的观众反馈、后台数据和高能片段。你可以直接粘贴后台截图，让 AI 结合当前文稿一起做联合判断。
              </p>
            </div>

            <form className="stack" onSubmit={handleAssistSubmit}>
              <div className="mode-switch secondary-switch">
                <button
                  className={assistMode === "metrics" ? "mode-pill active" : "mode-pill"}
                  type="button"
                  onClick={() => setAssistMode("metrics")}
                >
                  视频数据截图
                </button>
                <button
                  className={assistMode === "bilibili" ? "mode-pill active" : "mode-pill"}
                  type="button"
                  onClick={() => setAssistMode("bilibili")}
                >
                  B 站链接抓取
                </button>
                <button
                  className={assistMode === "files" ? "mode-pill active" : "mode-pill"}
                  type="button"
                  onClick={() => setAssistMode("files")}
                >
                  本地文件导入
                </button>
              </div>

              {assistMode === "metrics" ? (
                <section className="input-card subtle-card">
                  <label className="field-label">视频数据截图输入</label>
                  <ImagePasteUploader files={metricImages} onChange={setMetricImages} />
                  <p className="muted">
                    推荐粘贴：核心数据汇总、播放趋势、留存/流失、游客吸引力、封面标题点击率、互动率、转粉率等页面截图。当前主分析台里的文稿会自动一起带入做联合分析。
                  </p>
                </section>
              ) : assistMode === "bilibili" ? (
                <section className="input-card subtle-card">
                  <label className="field-label" htmlFor="videoInput">
                    B 站视频链接或 BV 号
                  </label>
                  <input
                    id="videoInput"
                    className="text-input"
                    placeholder="例如 https://www.bilibili.com/video/BV... 或直接输入 BV 号"
                    value={videoInput}
                    onChange={(event) => setVideoInput(event.target.value)}
                  />
                  <p className="muted">
                    支持 `www.bilibili.com/video/...`、`b23.tv/...` 和直接输入 `BV` 号。多 P 视频会自动识别链接里的 `p=` 参数。
                  </p>
                </section>
              ) : (
                <div className="two-column assist-upload-grid">
                  <FileUploader
                    label="评论文件"
                    accept=".json,.csv"
                    helper="支持 JSON / CSV，字段可为 content、message、text、comment"
                    file={commentsFile}
                    onChange={setCommentsFile}
                  />
                  <FileUploader
                    label="弹幕文件"
                    accept=".xml,.json"
                    helper="推荐直接导入 B 站弹幕 XML，也支持 JSON"
                    file={danmakuFile}
                    onChange={setDanmakuFile}
                  />
                </div>
              )}

              <div className="toolbar secondary-toolbar">
                {assistMode !== "metrics" ? (
                  <label className="toggle">
                    <input type="checkbox" checked={useAi} onChange={(event) => setUseAi(event.target.checked)} />
                    <span>生成 AI 辅助摘要</span>
                  </label>
                ) : (
                  <div className="muted">优先调用 GPT-5.5 做视频数据读图分析，并结合当前文稿一起汇总。</div>
                )}

                <button className="primary-button secondary-button" type="submit" disabled={assistLoading}>
                  {assistLoading
                    ? "分析中..."
                    : assistMode === "metrics"
                      ? "分析截图"
                      : assistMode === "bilibili"
                        ? "抓取并分析"
                        : "开始分析"}
                </button>
              </div>
            </form>

            {assistError ? <div className="error-banner">{assistError}</div> : null}
          </aside>
        </section>

        {copyResult || metricResult || result ? (
          <section className="stack">
            <section className="panel result-shell">
              <div className="panel-header result-shell-header">
                <div className="stack compact">
                  <span className="section-kicker">结果分页</span>
                  <h2>分析结果台</h2>
                </div>
                <span className="muted">将文稿、截图和评论弹幕拆成独立阅读页，减少来回滚动。</span>
              </div>

              <div className="result-tab-strip">
                {copyResult ? (
                  <button
                    className={resultView === "copy" ? "result-tab active" : "result-tab"}
                    type="button"
                    onClick={() => setResultView("copy")}
                  >
                    文稿分析
                  </button>
                ) : null}
                {metricResult ? (
                  <button
                    className={resultView === "metrics" ? "result-tab active" : "result-tab"}
                    type="button"
                    onClick={() => setResultView("metrics")}
                  >
                    数据截图
                  </button>
                ) : null}
                {result ? (
                  <button
                    className={resultView === "community" ? "result-tab active" : "result-tab"}
                    type="button"
                    onClick={() => setResultView("community")}
                  >
                    评论弹幕
                  </button>
                ) : null}
              </div>

              <div className="result-page">
                {resultView === "copy" && copyResult ? (
                  <AiSummary content={copyResult.analysis} title="AI 文案文稿分析" />
                ) : null}

                {resultView === "metrics" && metricResult ? (
                  <AiSummary content={metricResult.analysis} title="AI 视频数据截图分析" />
                ) : null}

                {resultView === "community" && result ? (
                  <div className="stack">
                    {result.source ? <SourceSummary source={result.source} /> : null}
                    {result.ai_summary ? <AiSummary content={result.ai_summary} /> : null}
                    <CommentSummary data={result.comments} />
                    <Suspense fallback={<section className="panel">弹幕时间轴加载中...</section>}>
                      <DanmakuTimeline
                        data={result.danmaku}
                        bucketSize={bucketSize}
                        onBucketSizeChange={setBucketSize}
                      />
                    </Suspense>
                    <PeakSegments data={result.danmaku} />
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        ) : (
          <section className="panel placeholder-panel">
            <h2>当前还没有分析结果</h2>
            <p>
              先把文稿贴进主分析台，确认这条视频的钩子、结构和包装方向。评论、弹幕和视频数据复盘可以放在后面，作为上线后的辅助验证。
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
