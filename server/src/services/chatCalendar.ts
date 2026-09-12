import {
  PLAYABLE_VIDEO_MIME_TYPES,
  type ChatCalendarDay,
  type ChatCalendarQuery,
  type ChatCalendarResponse,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { assertMember } from './chat.js';
import { toFileDto } from './file.js';
import { Prisma } from '../generated/prisma/client.js';

interface DayRow {
  date: string;
  count: number;
  firstMessageId: number;
}

interface PreviewRow {
  date: string;
  previewFileId: string | null;
  thumbnailFileId: string | null;
  imageFileId: string | null;
}

interface BoundRow {
  date: string;
}

function dayExpression(tz: string): Prisma.Sql {
  return Prisma.sql`(m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date`;
}

function mediaCondition(): Prisma.Sql {
  return Prisma.sql`cardinality(a.peaks) = 0
    AND (
      (f."mimeType" LIKE 'image/%' AND f."mimeType" <> 'image/gif')
      OR f."mimeType" IN (${Prisma.join([...PLAYABLE_VIDEO_MIME_TYPES])})
    )`;
}

export async function getChatCalendar(
  chatId: string,
  userId: string,
  query: ChatCalendarQuery,
): Promise<ChatCalendarResponse> {
  await assertMember(chatId, userId);

  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  const floor = member.clearedUpToMessageId ?? 0;
  const day = dayExpression(query.tz);
  const scope = Prisma.sql`m."chatId" = ${chatId} AND m."deletedAt" IS NULL AND m.id > ${floor}`;
  const range = Prisma.sql`${day} BETWEEN ${query.from}::date AND ${query.to}::date`;

  const daysQuery =
    query.filter === 'media'
      ? prisma.$queryRaw<DayRow[]>`
          SELECT to_char(${day}, 'YYYY-MM-DD') AS date,
                 count(*)::int AS count,
                 min(a."messageId")::int AS "firstMessageId"
          FROM "Attachment" a
          JOIN "Message" m ON m.id = a."messageId"
          JOIN "File" f ON f.id = a."fileId"
          WHERE ${scope} AND ${mediaCondition()} AND ${range}
          GROUP BY 1
          ORDER BY 1`
      : prisma.$queryRaw<DayRow[]>`
          SELECT to_char(${day}, 'YYYY-MM-DD') AS date,
                 count(*)::int AS count,
                 min(m.id)::int AS "firstMessageId"
          FROM "Message" m
          WHERE ${scope} AND ${range}
          GROUP BY 1
          ORDER BY 1`;

  const previewsQuery = prisma.$queryRaw<PreviewRow[]>`
    SELECT DISTINCT ON (date) date, "previewFileId", "thumbnailFileId", "imageFileId"
    FROM (
      SELECT to_char(${day}, 'YYYY-MM-DD') AS date,
             a."messageId" AS "messageId",
             a."previewFileId" AS "previewFileId",
             a."thumbnailFileId" AS "thumbnailFileId",
             CASE WHEN f."mimeType" LIKE 'image/%' THEN a."fileId" END AS "imageFileId"
      FROM "Attachment" a
      JOIN "Message" m ON m.id = a."messageId"
      JOIN "File" f ON f.id = a."fileId"
      WHERE ${scope} AND ${mediaCondition()} AND ${range}
    ) picked
    ORDER BY date, "messageId" DESC`;

  const boundQuery = (direction: Prisma.Sql) => prisma.$queryRaw<BoundRow[]>`
    SELECT to_char(${day}, 'YYYY-MM-DD') AS date
    FROM "Message" m
    WHERE ${scope}
    ORDER BY m.id ${direction}
    LIMIT 1`;

  const [dayRows, previewRows, oldest, newest] = await Promise.all([
    daysQuery,
    previewsQuery,
    boundQuery(Prisma.sql`ASC`),
    boundQuery(Prisma.sql`DESC`),
  ]);

  const previewFileIdOf = (row: PreviewRow): string | null =>
    row.previewFileId ?? row.thumbnailFileId ?? row.imageFileId;

  const fileIds = [...new Set(previewRows.map(previewFileIdOf).filter((id): id is string => id !== null))];
  const files = fileIds.length > 0 ? await prisma.file.findMany({ where: { id: { in: fileIds } } }) : [];
  const fileById = new Map(files.map((file) => [file.id, file]));

  const previewByDate = new Map(
    previewRows.map((row) => {
      const file = fileById.get(previewFileIdOf(row) ?? '');
      return [row.date, file ? toFileDto(file) : null];
    }),
  );

  const days: ChatCalendarDay[] = dayRows.map((row) => ({
    date: row.date,
    count: row.count,
    firstMessageId: row.firstMessageId,
    preview: previewByDate.get(row.date) ?? null,
  }));

  return {
    days,
    minDate: oldest[0]?.date ?? null,
    maxDate: newest[0]?.date ?? null,
  };
}
