import { ChangeEvent } from "react";

interface FileUploaderProps {
  label: string;
  accept: string;
  helper: string;
  file: File | null;
  onChange: (file: File | null) => void;
}

export function FileUploader(props: FileUploaderProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    props.onChange(event.target.files?.[0] ?? null);
  };

  return (
    <label className="upload-card">
      <span className="upload-label">{props.label}</span>
      <span className="upload-helper">{props.helper}</span>
      <input type="file" accept={props.accept} onChange={handleChange} />
      <strong>{props.file?.name ?? "选择文件"}</strong>
    </label>
  );
}
