import { CombinedAnalysis, CopyAnalysisResult, DataScreenshotAnalysisResult } from "./types";

export async function analyzeFiles(input: {
  commentsFile: File;
  danmakuFile: File;
  useAi: boolean;
}): Promise<CombinedAnalysis> {
  const formData = new FormData();
  formData.append("comments_file", input.commentsFile);
  formData.append("danmaku_file", input.danmakuFile);
  formData.append("use_ai", String(input.useAi));

  const response = await fetch("/api/analyze/combined", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "分析失败");
  }

  return response.json();
}

export async function analyzeBilibili(input: {
  videoInput: string;
  useAi: boolean;
}): Promise<CombinedAnalysis> {
  const response = await fetch("/api/analyze/bilibili", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      video_input: input.videoInput,
      use_ai: input.useAi
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "抓取并分析失败");
  }

  return response.json();
}

export async function analyzeCopy(input: {
  manuscript: string;
  title: string;
  notes: string;
}): Promise<CopyAnalysisResult> {
  const response = await fetch("/api/analyze/copy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      manuscript: input.manuscript,
      title: input.title,
      notes: input.notes
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (data?.detail) {
      throw new Error(data.detail);
    }
    const text = await response.text().catch(() => "");
    throw new Error(text || "文案分析失败");
  }

  return response.json();
}

export async function analyzeDataScreenshots(input: {
  images: File[];
  manuscript: string;
  title: string;
  notes: string;
}): Promise<DataScreenshotAnalysisResult> {
  const formData = new FormData();
  input.images.forEach((image) => {
    formData.append("images", image);
  });
  formData.append("manuscript", input.manuscript);
  formData.append("title", input.title);
  formData.append("notes", input.notes);

  const response = await fetch("/api/analyze/data-screenshots", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (data?.detail) {
      throw new Error(data.detail);
    }
    const text = await response.text().catch(() => "");
    throw new Error(text || "视频数据分析失败");
  }

  return response.json();
}
