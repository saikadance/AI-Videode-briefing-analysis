import { ChangeEvent, ClipboardEvent, useRef, useState } from "react";
import { ProjectAttachmentKind } from "../types";

export interface PendingAttachment {
  id: string;
  file: File;
  kind: ProjectAttachmentKind;
  previewUrl: string;
}

interface ChatComposerProps {
  loading: boolean;
  onSend: (payload: { content: string; attachments: PendingAttachment[] }) => Promise<void> | void;
}

export function ChatComposer({ loading, onSend }: ChatComposerProps) {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const appendFiles = (files: File[]) => {
    const incoming = files.filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) {
      return;
    }
    setAttachments((current) => [
      ...current,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: "reference" as ProjectAttachmentKind,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles: File[] = [];
    for (const item of Array.from(event.clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length) {
      event.preventDefault();
      appendFiles(pastedFiles);
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const updateAttachmentKind = (attachmentId: string, kind: ProjectAttachmentKind) => {
    setAttachments((current) => current.map((item) => (item.id === attachmentId ? { ...item, kind } : item)));
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === attachmentId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== attachmentId);
    });
  };

  const handleSend = async () => {
    if (!content.trim() && !attachments.length) {
      return;
    }
    const sendingAttachments = [...attachments];
    await onSend({ content, attachments: sendingAttachments });
    sendingAttachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setContent("");
    setAttachments([]);
  };

  return (
    <div className="panel chat-composer-panel">
      <div className="panel-header">
        <div className="stack compact">
          <span className="section-kicker">项目对话</span>
          <h3>继续追问、改稿、贴图复盘</h3>
        </div>
        <button className="summary-nav-button" type="button" onClick={() => inputRef.current?.click()}>
          添加图片
        </button>
      </div>

      <input ref={inputRef} accept="image/png,image/jpeg,image/webp" hidden multiple type="file" onChange={handleFileSelect} />

      <textarea
        className="chat-input"
        placeholder="像 GPT / Gemini 一样继续对话：你可以补充修改需求、贴图、追问原因，或者让它直接改一段文案。"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onPaste={handlePaste}
      />

      {attachments.length ? (
        <div className="chat-attachment-grid">
          {attachments.map((attachment) => (
            <article className="chat-attachment-card" key={attachment.id}>
              <img alt={attachment.file.name} src={attachment.previewUrl} />
              <div className="chat-attachment-meta">
                <strong>{attachment.file.name}</strong>
                <select
                  value={attachment.kind}
                  onChange={(event) => updateAttachmentKind(attachment.id, event.target.value as ProjectAttachmentKind)}
                >
                  <option value="reference">参考图片</option>
                  <option value="data">数据截图</option>
                </select>
              </div>
              <button className="preview-remove" type="button" onClick={() => removeAttachment(attachment.id)}>
                移除
              </button>
            </article>
          ))}
        </div>
      ) : null}

      <div className="toolbar">
        <span className="muted">图片会跟着当前这条消息一起提交；选择“数据截图”后，AI 会优先按视频后台指标来解读。</span>
        <button className="primary-button" type="button" disabled={loading} onClick={handleSend}>
          {loading ? "发送中..." : "发送对话"}
        </button>
      </div>
    </div>
  );
}
