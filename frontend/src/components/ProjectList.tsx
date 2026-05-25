import { useMemo, useState } from "react";
import { ProjectRecord } from "../types";

interface ProjectListProps {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
  onToggleFavorite: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectList({
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onToggleFavorite,
  onDelete,
}: ProjectListProps) {
  const [query, setQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return projects;
    }
    return projects.filter((project) => {
      const haystack = [project.title, project.notes, project.manuscript].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [projects, query]);
  const favoriteProjects = filteredProjects.filter((project) => project.isFavorite);
  const regularProjects = filteredProjects.filter((project) => !project.isFavorite);

  const handleDelete = (projectId: string) => {
    if (pendingDeleteId === projectId) {
      onDelete(projectId);
      setPendingDeleteId(null);
      return;
    }
    setPendingDeleteId(projectId);
  };

  return (
    <section className="panel project-list-panel">
      <div className="panel-header">
        <div className="stack compact">
          <span className="section-kicker">项目列表</span>
          <h2>工作项目</h2>
        </div>
        <button className="primary-button" type="button" onClick={onCreate}>
          新建项目
        </button>
      </div>

      <div className="project-list-toolbar">
        <input
          className="text-input"
          placeholder="搜索项目标题、备注或文稿内容"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filteredProjects.length ? (
        <div className="stack compact">
          {favoriteProjects.length ? (
            <div className="stack compact">
              <div className="project-section-label">收藏项目</div>
              <div className="project-list-grid">
                {favoriteProjects.map((project) => (
                  <article className={project.id === activeProjectId ? "project-card active" : "project-card"} key={project.id}>
                    <button className="project-card-main" type="button" onClick={() => onSelect(project.id)}>
                      <strong>{project.title || "未命名"}</strong>
                      <span>{project.notes || "暂无补充说明"}</span>
                      <small>最近更新：{new Date(project.updatedAt).toLocaleString("zh-CN")}</small>
                    </button>
                    <div className="project-card-actions">
                      <button className="summary-nav-button" type="button" onClick={() => onToggleFavorite(project.id)}>
                        取消收藏
                      </button>
                      <button
                        className={pendingDeleteId === project.id ? "delete-confirm-button" : "summary-nav-button"}
                        type="button"
                        onClick={() => handleDelete(project.id)}
                      >
                        {pendingDeleteId === project.id ? "确认删除" : "删除"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {regularProjects.length ? (
            <div className="stack compact">
              <div className="project-section-label">全部项目</div>
              <div className="project-list-grid">
                {regularProjects.map((project) => (
                  <article className={project.id === activeProjectId ? "project-card active" : "project-card"} key={project.id}>
                    <button className="project-card-main" type="button" onClick={() => onSelect(project.id)}>
                      <strong>{project.title || "未命名"}</strong>
                      <span>{project.notes || "暂无补充说明"}</span>
                      <small>最近更新：{new Date(project.updatedAt).toLocaleString("zh-CN")}</small>
                    </button>
                    <div className="project-card-actions">
                      <button className="summary-nav-button" type="button" onClick={() => onToggleFavorite(project.id)}>
                        收藏
                      </button>
                      <button
                        className={pendingDeleteId === project.id ? "delete-confirm-button" : "summary-nav-button"}
                        type="button"
                        onClick={() => handleDelete(project.id)}
                      >
                        {pendingDeleteId === project.id ? "确认删除" : "删除"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="project-empty">
          <h3>{projects.length ? "没有找到匹配项目" : "还没有保存的项目"}</h3>
          <p>
            {projects.length
              ? "换个关键词试试，或者先回到主分析台创建并保存新的项目。"
              : "先在主分析台输入内容并发起分析，项目才会真正保存到列表里。"}
          </p>
        </div>
      )}
    </section>
  );
}
