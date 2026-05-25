import { FormEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { analyzeBilibili, analyzeCopy, analyzeDataScreenshots, analyzeFiles, chatWithProject } from "./api";
import { AiSummary } from "./components/AiSummary";
import { ChatComposer, PendingAttachment } from "./components/ChatComposer";
import { ChatThread } from "./components/ChatThread";
import { CommentSummary } from "./components/CommentSummary";
import { FileUploader } from "./components/FileUploader";
import { ImagePasteUploader } from "./components/ImagePasteUploader";
import { PeakSegments } from "./components/PeakSegments";
import { ProjectList } from "./components/ProjectList";
import { SourceSummary } from "./components/SourceSummary";
import { loadActiveProjectId, loadProjects, saveActiveProjectId, saveProjects } from "./projectStore";
import { CombinedAnalysis, ProjectAttachment, ProjectMessage, ProjectRecord } from "./types";

const DanmakuTimeline = lazy(() =>
  import("./components/DanmakuTimeline").then((module) => ({ default: module.DanmakuTimeline }))
);

type AssistMode = "metrics" | "bilibili" | "files";
type ResultView = "copy" | "metrics" | "community";
type WorkspaceView = "workspace" | "projects" | "detail";

interface BootState {
  initialProjects: ProjectRecord[];
  initialActiveProjectId: string | null;
  initialDraftProject: ProjectRecord;
}

function normalizeAnalysisStage(value: string | undefined): "pre_publish" | "post_publish" {
  return value === "post_publish" ? "post_publish" : "pre_publish";
}

function getDefaultAnalysisContext(stage: "pre_publish" | "post_publish") {
  if (stage === "post_publish") {
    return "这条视频已经发布。请按复盘视角判断：现有文稿和当前数据是否匹配，哪些判断已经被数据验证，哪些地方该作为下一轮改稿和包装优化重点。";
  }

  return "这条视频还未发布。请按审稿视角判断：标题、开头钩子、结构节奏、信息门槛和互动点是否足够支撑上线表现，并优先给出最该先改的部分。";
}

function sortProjects(projects: ProjectRecord[]) {
  return [...projects].sort(
    (left, right) => {
      if (Boolean(left.isFavorite) !== Boolean(right.isFavorite)) {
        return left.isFavorite ? -1 : 1;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
  );
}

function isProjectMeaningful(project: ProjectRecord) {
  return Boolean(
    project.title.trim() ||
      project.notes.trim() ||
      project.manuscript.trim() ||
      project.messages.length ||
      project.latestCopyAnalysis ||
      project.latestMetricsAnalysis ||
      project.latestCommunityAnalysis
  );
}

function createProjectRecord(): ProjectRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    notes: "",
    manuscript: "",
    isFavorite: false,
    analysisStage: "pre_publish",
    analysisContext: getDefaultAnalysisContext("pre_publish"),
    createdAt: now,
    updatedAt: now,
    messages: [],
    latestCopyAnalysis: null,
    latestMetricsAnalysis: null,
    latestCommunityAnalysis: null,
  };
}

function bootstrapProjects(): BootState {
  const loadedProjects = sortProjects(loadProjects())
    .map((project): ProjectRecord => {
      const analysisStage = normalizeAnalysisStage(project.analysisStage);
      return {
        ...project,
        isFavorite: Boolean(project.isFavorite),
        analysisStage,
        analysisContext:
          typeof project.analysisContext === "string" && project.analysisContext.trim()
            ? project.analysisContext
            : getDefaultAnalysisContext(analysisStage),
      };
    })
    .filter((project) => isProjectMeaningful(project));
  const initialProjects = loadedProjects;
  const savedActiveProjectId = loadActiveProjectId();
  const initialActiveProjectId =
    savedActiveProjectId && initialProjects.some((project) => project.id === savedActiveProjectId)
      ? savedActiveProjectId
      : initialProjects[0]?.id ?? null;

  return {
    initialProjects,
    initialActiveProjectId,
    initialDraftProject: createProjectRecord(),
  };
}

function defaultResultView(project: ProjectRecord | null): ResultView {
  if (project?.latestCopyAnalysis) {
    return "copy";
  }
  if (project?.latestMetricsAnalysis) {
    return "metrics";
  }
  if (project?.latestCommunityAnalysis) {
    return "community";
  }
  return "copy";
}

function createAssistantMessage(content: string, source: ProjectMessage["source"]): ProjectMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    attachments: [],
    source,
  };
}

function createUserMessage(content: string, attachments: ProjectAttachment[]): ProjectMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    attachments,
    source: "chat",
  };
}

function serializeCommunityAnalysis(result: CombinedAnalysis | null | undefined) {
  if (!result) {
    return "";
  }

  const peakSegments = result.danmaku.peak_segments
    .slice(0, 3)
    .map(
      (segment) =>
        `${formatTime(segment.start_second)}-${formatTime(segment.end_second)}：${segment.summary}`
    )
    .join("\n");

  const topWords = result.comments.high_frequency_words
    .slice(0, 8)
    .map((item) => `${item.word}(${item.count})`)
    .join("、");

  return [
    result.source ? `视频：${result.source.title}` : "",
    result.ai_summary ? `AI 总结：${result.ai_summary}` : "",
    `评论总数：${result.comments.total_comments}`,
    `弹幕总数：${result.danmaku.total_danmaku}`,
    topWords ? `高频词：${topWords}` : "",
    peakSegments ? `高能区间：\n${peakSegments}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function buildStoredAttachments(attachments: PendingAttachment[]): Promise<ProjectAttachment[]> {
  const now = new Date().toISOString();
  return Promise.all(
    attachments.map(async (attachment) => ({
      id: crypto.randomUUID(),
      name: attachment.file.name || "未命名图片",
      mimeType: attachment.file.type || "image/png",
      dataUrl: await fileToDataUrl(attachment.file),
      kind: attachment.kind,
      createdAt: now,
    }))
  );
}

function buildProjectHistory(messages: ProjectMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    attachments: message.attachments.map((attachment) => ({
      name: attachment.name,
      kind: attachment.kind,
    })),
  }));
}

function getProjectDisplayTitle(project: ProjectRecord) {
  return project.title.trim() || "未命名";
}

function getAnalysisStageLabel(stage: "pre_publish" | "post_publish") {
  return stage === "post_publish" ? "发布后复盘" : "发布前审稿";
}

function countProjectAnalyses(project: ProjectRecord) {
  let total = 0;
  if (project.latestCopyAnalysis) {
    total += 1;
  }
  if (project.latestMetricsAnalysis) {
    total += 1;
  }
  if (project.latestCommunityAnalysis) {
    total += 1;
  }
  return total;
}

function countProjectAttachments(project: ProjectRecord) {
  return project.messages.reduce((total, message) => total + message.attachments.length, 0);
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildProjectExport(project: ProjectRecord) {
  const sections: string[] = [];

  sections.push(`# ${getProjectDisplayTitle(project)}`);
  sections.push("");
  sections.push(`- 分析阶段：${getAnalysisStageLabel(project.analysisStage)}`);
  sections.push(`- 最近更新：${new Date(project.updatedAt).toLocaleString("zh-CN")}`);
  sections.push(`- 对话条数：${project.messages.length}`);
  sections.push(`- 已保存分析：${countProjectAnalyses(project)}`);
  sections.push(`- 图片附件：${countProjectAttachments(project)}`);
  sections.push("");

  if (project.notes.trim()) {
    sections.push("## 补充备注");
    sections.push(project.notes.trim());
    sections.push("");
  }

  if (project.analysisContext.trim()) {
    sections.push("## 分析上下文");
    sections.push(project.analysisContext.trim());
    sections.push("");
  }

  if (project.manuscript.trim()) {
    sections.push("## 文稿正文");
    sections.push(project.manuscript.trim());
    sections.push("");
  }

  if (project.latestCopyAnalysis) {
    sections.push("## 文稿分析");
    sections.push(project.latestCopyAnalysis.trim());
    sections.push("");
  }

  if (project.latestMetricsAnalysis) {
    sections.push("## 数据截图分析");
    sections.push(project.latestMetricsAnalysis.trim());
    sections.push("");
  }

  if (project.latestCommunityAnalysis) {
    sections.push("## 评论弹幕复盘");
    if (project.latestCommunityAnalysis.ai_summary) {
      sections.push(project.latestCommunityAnalysis.ai_summary.trim());
      sections.push("");
    }
    sections.push(`- 评论数：${project.latestCommunityAnalysis.comments.total_comments}`);
    sections.push(`- 弹幕数：${project.latestCommunityAnalysis.danmaku.total_danmaku}`);
    sections.push("");
  }

  sections.push("## 对话分析历史");
  sections.push("");
  for (const message of project.messages) {
    sections.push(`### ${message.role === "assistant" ? "AI 助手" : "你"} · ${new Date(message.createdAt).toLocaleString("zh-CN")}`);
    sections.push(message.content.trim() || "（空内容）");
    if (message.attachments.length) {
      sections.push("");
      sections.push("附件：");
      message.attachments.forEach((attachment) => {
        sections.push(`- ${attachment.name}（${attachment.kind === "data" ? "数据截图" : "参考图片"}）`);
      });
    }
    sections.push("");
  }

  return sections.join("\n");
}

export default function App() {
  const [bootState] = useState<BootState>(() => bootstrapProjects());
  const [projects, setProjects] = useState<ProjectRecord[]>(bootState.initialProjects);
  const [draftProject, setDraftProject] = useState<ProjectRecord>(bootState.initialDraftProject);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(bootState.initialActiveProjectId);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("workspace");
  const [assistMode, setAssistMode] = useState<AssistMode>("metrics");
  const [videoInput, setVideoInput] = useState("");
  const [commentsFile, setCommentsFile] = useState<File | null>(null);
  const [danmakuFile, setDanmakuFile] = useState<File | null>(null);
  const [metricImages, setMetricImages] = useState<File[]>([]);
  const [useAi, setUseAi] = useState(true);
  const [bucketSize, setBucketSize] = useState(1);
  const [copyLoading, setCopyLoading] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView>("copy");
  const detailPageRef = useRef<HTMLElement | null>(null);
  const summarySectionRef = useRef<HTMLElement | null>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const conversationSectionRef = useRef<HTMLElement | null>(null);

  const orderedProjects = useMemo(() => sortProjects(projects), [projects]);
  const activeProject = useMemo(
    () => orderedProjects.find((project) => project.id === activeProjectId) ?? null,
    [orderedProjects, activeProjectId]
  );
  const currentProject = activeProject ?? draftProject;
  const recentProjects = useMemo(() => orderedProjects.slice(0, 4), [orderedProjects]);

  useEffect(() => {
    if (activeProjectId && !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(projects[0]?.id ?? null);
    }
  }, [projects, activeProjectId]);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    saveActiveProjectId(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    setResultView(defaultResultView(activeProject));
    setCopyError(null);
    setAssistError(null);
    setChatError(null);
  }, [activeProjectId]);

  const updateProject = (projectId: string, updater: (project: ProjectRecord) => ProjectRecord) => {
    setProjects((current) =>
      sortProjects(
        current.map((project) => {
          if (project.id !== projectId) {
            return project;
          }
          const next = updater(project);
          return {
            ...next,
            updatedAt: new Date().toISOString(),
          };
        })
      )
    );
  };

  const persistDraftProject = (project: ProjectRecord) => {
    const nextProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };
    setProjects((current) => sortProjects([nextProject, ...current]));
    setActiveProjectId(nextProject.id);
    setDraftProject(createProjectRecord());
    return nextProject;
  };

  const updateActiveProjectField = (
    field: "title" | "notes" | "manuscript" | "analysisContext",
    value: string
  ) => {
    if (activeProjectId) {
      updateProject(activeProjectId, (project) => ({
        ...project,
        [field]: value,
      }));
      return;
    }
    setDraftProject((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleAnalysisStageChange = (stage: "pre_publish" | "post_publish") => {
    const applyStageChange = (project: ProjectRecord) => {
      const previousDefault = getDefaultAnalysisContext(project.analysisStage);
      const nextDefault = getDefaultAnalysisContext(stage);
      const shouldReplaceContext =
        !project.analysisContext.trim() || project.analysisContext.trim() === previousDefault;

      return {
        ...project,
        analysisStage: stage,
        analysisContext: shouldReplaceContext ? nextDefault : project.analysisContext,
      };
    };

    if (activeProjectId) {
      updateProject(activeProjectId, applyStageChange);
      return;
    }
    setDraftProject((current) => applyStageChange(current));
  };

  const applyDefaultAnalysisContext = () => {
    if (activeProjectId && activeProject) {
      updateProject(activeProjectId, (project) => ({
        ...project,
        analysisContext: getDefaultAnalysisContext(project.analysisStage),
      }));
      return;
    }
    setDraftProject((current) => ({
      ...current,
      analysisContext: getDefaultAnalysisContext(current.analysisStage),
    }));
  };

  const handleCreateProject = () => {
    setDraftProject(createProjectRecord());
    setActiveProjectId(null);
    setWorkspaceView("workspace");
    setResultView("copy");
    setCopyError(null);
    setAssistError(null);
    setChatError(null);
  };

  const openProjectDetail = (projectId: string) => {
    setActiveProjectId(projectId);
    setWorkspaceView("detail");
  };

  const handleToggleFavoriteProject = (projectId: string) => {
    updateProject(projectId, (project) => ({
      ...project,
      isFavorite: !project.isFavorite,
    }));
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((current) => sortProjects(current.filter((project) => project.id !== projectId)));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
      setDraftProject(createProjectRecord());
      setWorkspaceView("projects");
      setResultView("copy");
    }
  };

  const handleCopySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentProject) {
      return;
    }

    setCopyLoading(true);
    setCopyError(null);

    try {
      const analysis = await analyzeCopy({
        manuscript: currentProject.manuscript,
        title: currentProject.title,
        notes: currentProject.notes,
        analysisStage: currentProject.analysisStage,
        analysisContext: currentProject.analysisContext,
      });

      const nextProject = {
        ...currentProject,
        latestCopyAnalysis: analysis.analysis,
        messages: [
          ...currentProject.messages,
          createAssistantMessage("已完成文稿分析，结果已保存到“文稿分析”页，可以继续追问和改稿。", "copy-analysis"),
        ],
      };

      if (activeProjectId) {
        updateProject(activeProjectId, () => nextProject);
      } else {
        persistDraftProject(nextProject);
      }

      setResultView("copy");
      setWorkspaceView("detail");
      window.setTimeout(() => {
        detailPageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (submitError) {
      setCopyError(submitError instanceof Error ? submitError.message : "文稿分析失败");
    } finally {
      setCopyLoading(false);
    }
  };

  const submitFiles = async () => {
    if (!commentsFile || !danmakuFile) {
      throw new Error("请先同时选择评论文件和弹幕文件。");
    }
    return analyzeFiles({ commentsFile, danmakuFile, useAi });
  };

  const handleAssistSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentProject) {
      return;
    }

    setAssistLoading(true);
    setAssistError(null);

    try {
      if (assistMode === "metrics") {
        if (!metricImages.length) {
          throw new Error("请先添加至少一张视频数据截图。");
        }

        const screenshotAnalysis = await analyzeDataScreenshots({
          images: metricImages,
          manuscript: currentProject.manuscript,
          title: currentProject.title,
          notes: currentProject.notes,
          analysisStage: currentProject.analysisStage,
          analysisContext: currentProject.analysisContext,
        });

        const nextProject = {
          ...currentProject,
          latestMetricsAnalysis: screenshotAnalysis.analysis,
          messages: [
            ...currentProject.messages,
            createAssistantMessage("已完成数据截图分析，结果已保存到“数据截图”页。", "metrics-analysis"),
          ],
        };

        if (activeProjectId) {
          updateProject(activeProjectId, () => nextProject);
        } else {
          persistDraftProject(nextProject);
        }

        setMetricImages([]);
        setResultView("metrics");
        setWorkspaceView("detail");
        window.setTimeout(() => {
          detailPageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      } else {
        const analysis =
          assistMode === "bilibili"
            ? await analyzeBilibili({ videoInput, useAi })
            : await submitFiles();

        const nextProject = {
          ...currentProject,
          latestCommunityAnalysis: analysis,
          messages: [
            ...currentProject.messages,
            createAssistantMessage("已完成评论与弹幕复盘，结果已保存到“评论弹幕”页。", "community-analysis"),
          ],
        };

        if (activeProjectId) {
          updateProject(activeProjectId, () => nextProject);
        } else {
          persistDraftProject(nextProject);
        }

        setResultView("community");
        setWorkspaceView("detail");
        window.setTimeout(() => {
          detailPageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    } catch (submitError) {
      setAssistError(submitError instanceof Error ? submitError.message : "辅助分析失败");
    } finally {
      setAssistLoading(false);
    }
  };

  const handleProjectChat = async (payload: { content: string; attachments: PendingAttachment[] }) => {
    if (!currentProject) {
      return;
    }

    setChatLoading(true);
    setChatError(null);

    const storedAttachments = await buildStoredAttachments(payload.attachments);
    const userContent = payload.content.trim() || "附上了新的图片，请结合当前项目继续分析。";
    const userMessage = createUserMessage(userContent, storedAttachments);
    const nextProject = {
      ...currentProject,
      messages: [...currentProject.messages, userMessage],
    };
    const nextHistory = nextProject.messages;

    if (activeProjectId) {
      updateProject(activeProjectId, () => nextProject);
    } else {
      persistDraftProject(nextProject);
    }

    try {
      const response = await chatWithProject({
        title: currentProject.title,
        notes: currentProject.notes,
        manuscript: currentProject.manuscript,
        analysisStage: currentProject.analysisStage,
        analysisContext: currentProject.analysisContext,
        latestCopyAnalysis: currentProject.latestCopyAnalysis ?? "",
        latestMetricsAnalysis: currentProject.latestMetricsAnalysis ?? "",
        latestCommunityAnalysis: serializeCommunityAnalysis(currentProject.latestCommunityAnalysis),
        history: buildProjectHistory(nextHistory),
        message: userContent,
        attachments: payload.attachments.map((attachment) => ({
          file: attachment.file,
          kind: attachment.kind,
          name: attachment.file.name || "未命名图片",
        })),
      });

      const repliedProject = {
        ...nextProject,
        messages: [...nextProject.messages, createAssistantMessage(response.reply, "chat")],
      };

      if (activeProjectId) {
        updateProject(activeProjectId, () => repliedProject);
      } else {
        const savedDraftId = nextProject.id;
        setProjects((current) =>
          sortProjects(
            current.map((project) => (project.id === savedDraftId ? { ...repliedProject, updatedAt: new Date().toISOString() } : project))
          )
        );
      }
    } catch (requestError) {
      setChatError(requestError instanceof Error ? requestError.message : "项目对话失败");
    } finally {
      setChatLoading(false);
    }
  };

  const handleExportProject = () => {
    if (!activeProject) {
      return;
    }
    const safeTitle = getProjectDisplayTitle(activeProject).replace(/[\\/:*?"<>|]/g, "_");
    downloadTextFile(`${safeTitle}-项目导出.md`, buildProjectExport(activeProject));
  };

  const jumpToSection = (target: "summary" | "result" | "conversation") => {
    const refMap = {
      summary: summarySectionRef,
      result: resultSectionRef,
      conversation: conversationSectionRef,
    };
    refMap[target].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copyResult = activeProject?.latestCopyAnalysis
    ? {
        analysis: activeProject.latestCopyAnalysis,
        title: activeProject.title,
        notes: activeProject.notes,
      }
    : null;

  const metricResult = activeProject?.latestMetricsAnalysis
    ? {
        analysis: activeProject.latestMetricsAnalysis,
        image_count: 0,
        title: activeProject.title,
        notes: activeProject.notes,
        manuscript_attached: Boolean(activeProject.manuscript.trim()),
      }
    : null;

  const communityResult = activeProject?.latestCommunityAnalysis ?? null;
  const hasAnyResult = Boolean(copyResult || metricResult || communityResult);

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Project Copy Review Workspace</p>
          <h1 className="hero-title">先做文稿主分析，再让数据、评论和弹幕成为持续复盘的辅助证据。</h1>
          <p className="hero-text">
            现在这套工作台已经支持持续对话、贴图追问和本地项目缓存。每个项目都会在当前浏览器里保留，方便你反复改稿、补数据和继续复盘。
          </p>
        </div>

        <div className="hero-actions">
          <button
            className={workspaceView === "workspace" ? "summary-nav-button active-chip" : "summary-nav-button"}
            type="button"
            onClick={() => setWorkspaceView("workspace")}
          >
            主分析台
          </button>
          <button
            className={workspaceView === "projects" ? "summary-nav-button active-chip" : "summary-nav-button"}
            type="button"
            onClick={() => setWorkspaceView("projects")}
          >
            项目列表
          </button>
          {workspaceView === "detail" ? (
            <button className="summary-nav-button active-chip" type="button" onClick={() => setWorkspaceView("detail")}>
              项目结果页
            </button>
          ) : null}
          <button className="primary-button" type="button" onClick={handleCreateProject}>
            新建项目
          </button>
        </div>
      </header>

      <main className="layout">
        {workspaceView === "projects" ? (
          <section className="stack">
            <ProjectList
              projects={orderedProjects}
              activeProjectId={activeProjectId}
              onSelect={openProjectDetail}
              onCreate={handleCreateProject}
              onToggleFavorite={handleToggleFavoriteProject}
              onDelete={handleDeleteProject}
            />

            <section className="panel project-storage-note">
              <div className="stack compact">
                <span className="section-kicker">当前缓存方式</span>
                <h3>项目结果保存在当前浏览器</h3>
                <p className="muted">
                  这是为了兼容 Render 免费版的休眠和临时文件限制。现在的项目、对话和已保存结果会在这台设备当前浏览器里保留，但不会自动跨设备同步，后续如果要多人共享，建议再补数据库或导出功能。
                </p>
              </div>
            </section>
          </section>
        ) : (
          <>
            <section className="panel recent-projects-panel">
              <div className="panel-header">
                <div className="stack compact">
                  <span className="section-kicker">最近项目</span>
                  <h2>继续上次的工作</h2>
                </div>
                <span className="muted">项目名默认取文稿标题，没填标题时会显示为“未命名”。</span>
              </div>

              <div className="recent-project-grid">
                {recentProjects.map((project) => (
                  <button
                    className={project.id === activeProjectId ? "recent-project-card active" : "recent-project-card"}
                    key={project.id}
                    type="button"
                    onClick={() => openProjectDetail(project.id)}
                  >
                    <strong>{getProjectDisplayTitle(project)}</strong>
                    <span>{project.notes.trim() || "暂无补充说明"}</span>
                    <small>{new Date(project.updatedAt).toLocaleString("zh-CN")}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="workspace-grid">
              <section className="panel control-panel primary-panel">
                <div className="panel-header">
                  <div className="stack compact">
                    <span className="section-kicker">主分析台</span>
                    <h2>文稿文案分析</h2>
                  </div>
                  <span className="muted">
                    当前项目：{activeProject ? getProjectDisplayTitle(activeProject) : "未保存草稿"}
                  </span>
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
                          placeholder="例如：B站游戏稿、开发者采访、剧情向长文稿"
                          value={currentProject.title}
                          onChange={(event) => updateActiveProjectField("title", event.target.value)}
                        />
                      </div>
                      <div className="stack compact">
                        <label className="field-label" htmlFor="copyNotes">
                          补充备注
                        </label>
                        <input
                          id="copyNotes"
                          className="text-input"
                          placeholder="例如：想保留采访质感、这是系列第二条、视频时长目标 8 分钟"
                          value={currentProject.notes}
                          onChange={(event) => updateActiveProjectField("notes", event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="two-column copy-meta-grid">
                      <div className="stack compact">
                        <label className="field-label" htmlFor="analysisStage">
                          分析阶段
                        </label>
                        <select
                          id="analysisStage"
                          className="text-input"
                          value={currentProject.analysisStage}
                          onChange={(event) =>
                            handleAnalysisStageChange(event.target.value as "pre_publish" | "post_publish")
                          }
                        >
                          <option value="pre_publish">发布前审稿</option>
                          <option value="post_publish">发布后复盘</option>
                        </select>
                      </div>
                      <div className="stack compact">
                        <label className="field-label" htmlFor="analysisContextAction">
                          默认上下文模板
                        </label>
                        <button
                          id="analysisContextAction"
                          className="summary-nav-button context-apply-button"
                          type="button"
                          onClick={applyDefaultAnalysisContext}
                        >
                          重新套用当前阶段模板
                        </button>
                      </div>
                    </div>

                    <label className="field-label" htmlFor="analysisContext">
                      分析上下文
                    </label>
                    <textarea
                      id="analysisContext"
                      className="context-area"
                      placeholder="这里写清楚这次想让 GPT 站在哪个工作场景下分析。比如：已经发到 B站，播放 38W，互动尚可，现在要做复盘并准备下一版。"
                      value={currentProject.analysisContext}
                      onChange={(event) => updateActiveProjectField("analysisContext", event.target.value)}
                    />

                    <label className="field-label" htmlFor="manuscript">
                      文稿 / 文案正文
                    </label>
                    <textarea
                      id="manuscript"
                      className="text-area"
                      placeholder="把完整文稿贴到这里。分析完成后，结果会跟着这个项目一起缓存在当前浏览器里。"
                      value={currentProject.manuscript}
                      onChange={(event) => updateActiveProjectField("manuscript", event.target.value)}
                    />

                    <p className="muted">
                      主分析台现在会把“分析阶段 + 分析上下文 + 文稿正文”一起发给 GPT。分析后你也可以继续在右侧对话区追问，后续对话会继承同一份项目上下文。
                    </p>
                  </section>

                  <div className="toolbar">
                    <div className="muted">文稿结果会直接保存到当前项目里，后续刷新页面也还能继续对话和修改。</div>
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
                    这部分负责补充上线后的反馈证据。你可以贴后台截图、输入 B 站链接，或者导入本地评论和弹幕，让辅助分析跟当前文稿项目一起工作。
                  </p>
                </div>

                <form className="stack" onSubmit={handleAssistSubmit}>
                  <div className="mode-switch secondary-switch">
                    <button
                      className={assistMode === "metrics" ? "mode-pill active" : "mode-pill"}
                      type="button"
                      onClick={() => setAssistMode("metrics")}
                    >
                      数据截图
                    </button>
                    <button
                      className={assistMode === "bilibili" ? "mode-pill active" : "mode-pill"}
                      type="button"
                      onClick={() => setAssistMode("bilibili")}
                    >
                      B站抓取
                    </button>
                    <button
                      className={assistMode === "files" ? "mode-pill active" : "mode-pill"}
                      type="button"
                      onClick={() => setAssistMode("files")}
                    >
                      本地导入
                    </button>
                  </div>

                  {assistMode === "metrics" ? (
                    <section className="input-card subtle-card">
                      <label className="field-label">视频数据截图输入</label>
                      <ImagePasteUploader files={metricImages} onChange={setMetricImages} />
                      <p className="muted">
                        推荐粘贴核心数据、播放趋势、留存/流失、游客吸引力、点击率、互动率、转粉率等页面截图。AI 会自动结合当前文稿一起判断。
                      </p>
                    </section>
                  ) : assistMode === "bilibili" ? (
                    <section className="input-card subtle-card">
                      <label className="field-label" htmlFor="videoInput">
                        B站视频链接或 BV 号
                      </label>
                      <input
                        id="videoInput"
                        className="text-input"
                        placeholder="例如 https://www.bilibili.com/video/BV... 或直接输入 BV 号"
                        value={videoInput}
                        onChange={(event) => setVideoInput(event.target.value)}
                      />
                      <p className="muted">支持普通视频链接、b23 短链和直接输入 BV 号。</p>
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
                        helper="推荐直接导入 B站 XML 弹幕，也支持 JSON"
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
                      <div className="muted">当前会优先结合文稿来解读截图数据，而不是只做孤立读图。</div>
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
          </>
        )}
        {workspaceView === "detail" ? (
          <section className="detail-page stack" ref={detailPageRef}>
            <section className="panel detail-hero-panel">
              <div className="panel-header detail-hero-header">
                <div className="stack compact">
                  <span className="section-kicker">项目结果页</span>
                  <h2>{activeProject ? getProjectDisplayTitle(activeProject) : "未命名项目"}</h2>
                </div>
                <div className="detail-hero-actions">
                  <button className="summary-nav-button" type="button" onClick={handleExportProject}>
                    导出项目
                  </button>
                  <button className="summary-nav-button" type="button" onClick={() => setWorkspaceView("workspace")}>
                    返回主分析台
                  </button>
                  <button className="summary-nav-button" type="button" onClick={() => setWorkspaceView("projects")}>
                    返回项目列表
                  </button>
                </div>
              </div>
              <p className="muted detail-hero-copy">
                这里集中查看当前项目的已保存分析和对话记录。分析结果、聊天历史和图片附件都会跟着项目一起保存在当前浏览器里，方便后续导出和查阅。
              </p>
            </section>

            <section className="panel detail-jump-panel">
              <div className="panel-header">
                <div className="stack compact">
                  <span className="section-kicker">快速跳转</span>
                  <h3>在长项目里快速定位</h3>
                </div>
              </div>
              <div className="detail-jump-strip">
                <button className="summary-nav-button" type="button" onClick={() => jumpToSection("summary")}>
                  项目摘要
                </button>
                <button className="summary-nav-button" type="button" onClick={() => jumpToSection("result")}>
                  项目结果
                </button>
                <button className="summary-nav-button" type="button" onClick={() => jumpToSection("conversation")}>
                  对话历史
                </button>
              </div>
            </section>

            {activeProject ? (
              <section className="panel project-summary-panel" ref={summarySectionRef}>
                <div className="panel-header">
                  <div className="stack compact">
                    <span className="section-kicker">项目摘要</span>
                    <h3>快速了解当前项目状态</h3>
                  </div>
                </div>

                <div className="project-summary-grid">
                  <article className="project-summary-card">
                    <span>分析阶段</span>
                    <strong>{getAnalysisStageLabel(activeProject.analysisStage)}</strong>
                  </article>
                  <article className="project-summary-card">
                    <span>最近更新</span>
                    <strong>{new Date(activeProject.updatedAt).toLocaleString("zh-CN")}</strong>
                  </article>
                  <article className="project-summary-card">
                    <span>已保存分析</span>
                    <strong>{countProjectAnalyses(activeProject)} 项</strong>
                  </article>
                  <article className="project-summary-card">
                    <span>对话记录</span>
                    <strong>{activeProject.messages.length} 条</strong>
                  </article>
                  <article className="project-summary-card">
                    <span>图片附件</span>
                    <strong>{countProjectAttachments(activeProject)} 张</strong>
                  </article>
                </div>

                {activeProject.notes.trim() ? (
                  <div className="project-summary-block">
                    <span className="section-kicker">补充备注</span>
                    <p>{activeProject.notes.trim()}</p>
                  </div>
                ) : null}

                {activeProject.analysisContext.trim() ? (
                  <div className="project-summary-block">
                    <span className="section-kicker">分析上下文</span>
                    <p>{activeProject.analysisContext.trim()}</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {hasAnyResult ? (
              <section className="panel result-shell" ref={resultSectionRef}>
                <div className="panel-header result-shell-header">
                  <div className="stack compact">
                    <span className="section-kicker">项目结果</span>
                    <h2>已保存分析</h2>
                  </div>
                  <span className="muted">分析前和分析后的内容现在已经拆开，主分析台只负责输入，这一页负责集中查看结果和后续复盘。</span>
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
                  {communityResult ? (
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
                    <AiSummary content={copyResult.analysis} title="AI 文稿分析" />
                  ) : null}

                  {resultView === "metrics" && metricResult ? (
                    <AiSummary content={metricResult.analysis} title="AI 数据截图分析" />
                  ) : null}

                  {resultView === "community" && communityResult ? (
                    <div className="stack">
                      {communityResult.source ? <SourceSummary source={communityResult.source} /> : null}
                      {communityResult.ai_summary ? <AiSummary content={communityResult.ai_summary} title="AI 评论弹幕复盘" /> : null}
                      <CommentSummary data={communityResult.comments} />
                      <Suspense fallback={<section className="panel">弹幕时间轴加载中...</section>}>
                        <DanmakuTimeline
                          data={communityResult.danmaku}
                          bucketSize={bucketSize}
                          onBucketSizeChange={setBucketSize}
                        />
                      </Suspense>
                      <PeakSegments data={communityResult.danmaku} />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="panel placeholder-panel">
                <h2>当前项目还没有分析结果</h2>
                <p>先从主分析台发起一次文稿分析，完成后会自动跳回这里。</p>
              </section>
            )}

            <section className="panel conversation-panel" ref={conversationSectionRef}>
              <div className="panel-header">
                <div className="stack compact">
                  <span className="section-kicker">对话分析历史</span>
                  <h2>持续追问、改稿和复盘记录</h2>
                </div>
                <span className="muted">这一块会长期保留当前项目的分析对话、图片附件和后续改稿记录。</span>
              </div>

              <div className="conversation-stack">
                <ChatThread messages={activeProject?.messages ?? []} />
                <ChatComposer loading={chatLoading} onSend={handleProjectChat} />
                {chatError ? <div className="error-banner">{chatError}</div> : null}
              </div>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
