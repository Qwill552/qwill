/** Путь без origin — клиент достраивает его через VITE_API_URL (секция 6: клиент не предполагает общий origin с API). */
export function fileUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/files/${fileId}` : null;
}
