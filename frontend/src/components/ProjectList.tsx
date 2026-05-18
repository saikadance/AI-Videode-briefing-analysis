import { ProjectRecord } from "../types";

interface ProjectListProps {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
}

export function ProjectList({ projects, activeProjectId, onSelect, onCreate }: ProjectListProps) {
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

      {projects.length ? (
        <div className="project-list-grid">
          {projects.map((project) => (
            <button
              className={project.id === activeProjectId ? "project-card active" : "project-card"}
              key={project.id}
              type="button"
              onClick={() => onSelect(project.id)}
            >
              <strong>{project.title || "未命名"}</strong>
              <span>{project.notes || "暂无补充说明"}</span>
              <small>最近更新：{new Date(project.updatedAt).toLocaleString("zh-CN")}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="project-empty">
          <h3>还没有保存的项目</h3>
          <p>先创建一个项目，再开始文稿分析、截图分析和项目对话。项目会保存在当前浏览器里，刷新页面后还能继续工作。</p>
        </div>
      )}
    </section>
  );
}
