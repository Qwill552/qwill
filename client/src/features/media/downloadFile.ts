export function downloadHref(src: string, fileName: string): string {
  return `${src}${src.includes('?') ? '&' : '?'}name=${encodeURIComponent(fileName)}`;
}

export function downloadFile(src: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = downloadHref(src, fileName);
  link.download = fileName;
  link.rel = 'noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
}
