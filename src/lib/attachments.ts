import { apiGet, apiDelete, type TaskAttachment } from "./api";

const API = "/api";

export async function getAttachments(taskId: string): Promise<TaskAttachment[]> {
  return apiGet<TaskAttachment[]>(`${API}/tasks/${taskId}/attachments`);
}

export async function uploadAttachments(
  taskId: string,
  files: FileList | File[]
): Promise<{ attachments: TaskAttachment[] }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch(`${API}/tasks/${taskId}/attachments`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.message || err.error || "Upload failed");
  }

  return res.json();
}

export async function deleteAttachment(id: number): Promise<void> {
  await apiDelete(`${API}/attachments/${id}`);
}

export function getDownloadUrl(id: number): string {
  return `${API}/attachments/${id}/download`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.startsWith("text/")) return "📝";
  if (mimeType.includes("spreadsheet")) return "📊";
  if (mimeType.includes("document")) return "📃";
  if (mimeType.includes("zip") || mimeType.includes("gzip") || mimeType.includes("tar")) return "📦";
  return "📎";
}
