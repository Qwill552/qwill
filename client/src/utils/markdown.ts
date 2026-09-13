function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderTable(rows: string[]): string {
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const [headerRow, , ...bodyRows] = rows;
  const header = cells(headerRow!)
    .map((cell) => `<th>${inline(cell)}</th>`)
    .join('');
  const body = bodyRows
    .map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
    .join('');

  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderLegalDocumentMarkdown(source: string): string {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const html: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) continue;

    if (lines.length === 1 && lines[0]!.trim() === '---') {
      html.push('<hr>');
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0]!);
    if (heading && lines.length === 1) {
      const level = heading[1]!.length;
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    if (lines.every((line) => line.trim().startsWith('|'))) {
      html.push(renderTable(lines));
      continue;
    }

    if (lines.every((line) => line.trim().startsWith('- '))) {
      const items = lines.map((line) => `<li>${inline(line.trim().slice(2))}</li>`).join('');
      html.push(`<ul>${items}</ul>`);
      continue;
    }

    html.push(`<p>${lines.map((line) => inline(line.trim())).join(' ')}</p>`);
  }

  return html.join('\n');
}
