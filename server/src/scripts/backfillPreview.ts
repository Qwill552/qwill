import { PREVIEW_MAX_DIMENSION } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { processImage } from '../lib/processImage.js';
import { readStoredFile, storeServerFile } from '../services/file.js';

const BATCH = 200;
const BATCH_PAUSE_MS = 200;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const prefix = dryRun ? '[dry-run] ' : '';

  const total = await prisma.attachment.count({
    where: { previewFileId: null, thumbnailFileId: { not: null } },
  });

  if (total === 0) {
    console.log('Вложений без preview не найдено.');
    return;
  }

  console.log(`${prefix}вложений без preview: ${total}`);

  let cursor = '';
  let done = 0;
  let skipped = 0;

  for (;;) {
    const batch = await prisma.attachment.findMany({
      where: { previewFileId: null, thumbnailFileId: { not: null }, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, thumbnailFileId: true },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    const updates: { id: string; previewFileId: string }[] = [];
    for (const attachment of batch) {
      const bytes = attachment.thumbnailFileId ? await readStoredFile(attachment.thumbnailFileId) : null;
      if (!bytes) {
        skipped += 1;
        console.log(`пропущено: attachment=${attachment.id} thumbnailFileId=${attachment.thumbnailFileId}`);
        continue;
      }

      try {
        const processed = await processImage(bytes, { maxDimension: PREVIEW_MAX_DIMENSION, maxBytes: MAX_INPUT_BYTES });
        if (dryRun) {
          updates.push({ id: attachment.id, previewFileId: '' });
        } else {
          const file = await storeServerFile(processed.data, processed.mime);
          updates.push({ id: attachment.id, previewFileId: file.id });
        }
      } catch {
        skipped += 1;
        console.log(`пропущено: attachment=${attachment.id} thumbnailFileId=${attachment.thumbnailFileId}`);
      }
    }

    if (!dryRun && updates.length > 0) {
      await prisma.$transaction(
        updates.map(({ id, previewFileId }) => prisma.attachment.update({ where: { id }, data: { previewFileId } })),
      );
    }

    done += updates.length;
    console.log(`${prefix}готово ${done + skipped}/${total} — посчитано ${done}, пропущено ${skipped}`);

    if (batch.length < BATCH) break;
    await sleep(BATCH_PAUSE_MS);
  }

  console.log(
    dryRun
      ? `завершено, изменений не внесено. Посчитано бы было ${done}, пропущено ${skipped}.`
      : `готово. Посчитано ${done}, пропущено ${skipped}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
