import { ProjectRecord } from "./types";

const PROJECTS_KEY = "video-copy-projects-v3";
const ACTIVE_PROJECT_KEY = "video-copy-active-project-v3";

export function loadProjects(): ProjectRecord[] {
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectRecord[]) {
  const ordered = [...projects].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
  window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(ordered));
}

export function loadActiveProjectId(): string | null {
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function saveActiveProjectId(projectId: string | null) {
  if (!projectId) {
    window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}
