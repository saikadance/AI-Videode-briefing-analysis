import { ChangeEvent, ClipboardEvent, DragEvent, useEffect, useRef, useState } from "react";

interface PreviewItem {
  file: File;
  url: string;
}

interface ImagePasteUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
}

export function ImagePasteUploader({ files, onChange, maxFiles = 8 }: ImagePasteUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);

  useEffect(() => {
    const items = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews(items);
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [files]);

  const appendFiles = (incoming: File[]) => {
    const images = incoming.filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      return;
    }

    const nextFiles: File[] = [...files];
    for (const image of images) {
      if (nextFiles.length >= maxFiles) {
        break;
      }
      const exists = nextFiles.some(
        (file) => file.name === image.name && file.size === image.size && file.lastModified === image.lastModified
      );
      if (!exists) {
        nextFiles.push(image);
      }
    }
    onChange(nextFiles);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
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

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    appendFiles(Array.from(event.dataTransfer.files));
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  return (
    <div className="stack compact">
      <input
        ref={inputRef}
        hidden
        accept="image/png,image/jpeg,image/webp"
        multiple
        type="file"
        onChange={handleFileSelect}
      />
      <div
        className="image-paste-zone"
        onPaste={handlePaste}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
      >
        <strong>粘贴或拖入视频数据截图</strong>
        <p>支持 `Ctrl+V` 粘贴截图，也可以点击选择多张图片。适合贴播放趋势、留存、互动、游客吸引力等后台页面。</p>
        <span>{files.length ? `已添加 ${files.length} / ${maxFiles} 张截图` : "建议一次上传 1-8 张关键截图"}</span>
      </div>

      {previews.length ? (
        <div className="image-preview-grid">
          {previews.map((item, index) => (
            <article className="image-preview-card" key={`${item.file.name}-${item.file.lastModified}-${index}`}>
              <img alt={item.file.name} src={item.url} />
              <div className="image-preview-meta">
                <strong>{item.file.name || `截图 ${index + 1}`}</strong>
                <span>{Math.max(1, Math.round(item.file.size / 1024))} KB</span>
              </div>
              <button className="preview-remove" type="button" onClick={() => removeFile(index)}>
                移除
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
