import {
  LINK_PREVIEW_DESCRIPTION_MAX_LENGTH,
  LINK_PREVIEW_SITE_NAME_MAX_LENGTH,
  LINK_PREVIEW_TITLE_MAX_LENGTH,
  LINK_PREVIEW_URL_MAX_LENGTH,
  type LinkPreviewDto,
} from '@messenger/shared';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { fileUrl } from '../lib/fileUrl.js';
import { logger } from '../lib/logger.js';
import { processImage } from '../lib/processImage.js';
import { safeFetch, SafeFetchError, type SafeFetchOptions } from '../lib/safeFetch.js';
import { storeServerFile } from './file.js';
import type { LinkPreview } from '../generated/prisma/client.js';

type ChildNode = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

export interface LinkPreviewFetchOptions {
  isAddressAllowed?: (address: string) => boolean;
}

export function normalizeLinkUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > LINK_PREVIEW_URL_MAX_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  url.hash = '';
  url.username = '';
  url.password = '';

  const normalized = url.toString();
  return normalized.length > LINK_PREVIEW_URL_MAX_LENGTH ? null : normalized;
}

function toDto(url: string, record: LinkPreview | null): LinkPreviewDto {
  if (!record) {
    return { url, status: 'pending', siteName: null, title: null, description: null, imageUrl: null };
  }
  return {
    url,
    status: record.status === 'READY' ? 'ready' : record.status === 'FAILED' ? 'failed' : 'pending',
    siteName: record.siteName,
    title: record.title,
    description: record.description,
    imageUrl: fileUrl(record.imageFileId),
  };
}

export function failedDto(url: string): LinkPreviewDto {
  return { url, status: 'failed', siteName: null, title: null, description: null, imageUrl: null };
}

const fetchTimestamps: number[] = [];

function takeExternalSlot(): boolean {
  const now = Date.now();
  while (fetchTimestamps.length > 0 && now - fetchTimestamps[0]! >= 60_000) fetchTimestamps.shift();
  if (fetchTimestamps.length >= env.LINK_PREVIEW_FETCHES_PER_MINUTE) return false;
  fetchTimestamps.push(now);
  return true;
}

const inFlight = new Map<string, Promise<void>>();

function isExpired(record: LinkPreview): boolean {
  return record.expiresAt !== null && record.expiresAt.getTime() <= Date.now();
}

function needsFetch(record: LinkPreview | null): boolean {
  if (!record) return true;
  if (record.status === 'PENDING') return true;
  return isExpired(record);
}

function elementsOf(node: ParentNode): Element[] {
  const found: Element[] = [];
  const walk = (parent: ParentNode): void => {
    for (const child of parent.childNodes as ChildNode[]) {
      if ('tagName' in child) {
        found.push(child);
        walk(child);
      }
    }
  };
  walk(node);
  return found;
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((candidate) => candidate.name === name)?.value ?? null;
}

function textOf(element: Element): string {
  let text = '';
  for (const child of element.childNodes as ChildNode[]) {
    if ('value' in child && child.nodeName === '#text') text += child.value;
  }
  return text;
}

function clean(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const withoutTags = value.replace(/<[^>]*>/gu, ' ');
  const collapsed = withoutTags.replace(/\s+/gu, ' ').trim();
  if (!collapsed) return null;
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…` : collapsed;
}

export interface ParsedPage {
  siteName: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

export function parseOpenGraph(html: string, pageUrl: string): ParsedPage {
  const document = parse(html);
  const elements = elementsOf(document);

  const meta = new Map<string, string>();
  let titleTag: string | null = null;

  for (const element of elements) {
    if (element.tagName === 'title' && titleTag === null) {
      titleTag = textOf(element);
      continue;
    }
    if (element.tagName !== 'meta') continue;

    const key = (attr(element, 'property') ?? attr(element, 'name'))?.trim().toLowerCase();
    const content = attr(element, 'content');
    if (!key || content === null || meta.has(key)) continue;
    meta.set(key, content);
  }

  let host: string | null;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./u, '');
  } catch {
    host = null;
  }

  const rawImage = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image') ?? null;
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage.trim(), pageUrl);
      imageUrl = resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.toString() : null;
    } catch {
      imageUrl = null;
    }
  }

  return {
    siteName: clean(meta.get('og:site_name') ?? host, LINK_PREVIEW_SITE_NAME_MAX_LENGTH),
    title: clean(meta.get('og:title') ?? titleTag, LINK_PREVIEW_TITLE_MAX_LENGTH),
    description: clean(
      meta.get('og:description') ?? meta.get('description') ?? null,
      LINK_PREVIEW_DESCRIPTION_MAX_LENGTH,
    ),
    imageUrl,
  };
}

function fetchOptions(overrides: Partial<SafeFetchOptions> & LinkPreviewFetchOptions): SafeFetchOptions {
  return {
    maxBytes: env.LINK_PREVIEW_PAGE_MAX_BYTES,
    timeoutMs: env.LINK_PREVIEW_TIMEOUT_MS,
    maxRedirects: env.LINK_PREVIEW_MAX_REDIRECTS,
    userAgent: env.LINK_PREVIEW_USER_AGENT,
    accept: 'text/html',
    acceptContentType: (contentType) => (contentType ?? '').toLowerCase().includes('text/html'),
    ...overrides,
  };
}

async function downloadImage(imageUrl: string, options: LinkPreviewFetchOptions): Promise<string | null> {
  if (!takeExternalSlot()) return null;

  const response = await safeFetch(
    imageUrl,
    fetchOptions({
      maxBytes: env.LINK_PREVIEW_IMAGE_MAX_BYTES,
      accept: 'image/*',
      acceptContentType: (contentType) => (contentType ?? '').toLowerCase().startsWith('image/'),
      isAddressAllowed: options.isAddressAllowed,
    }),
  );

  const processed = await processImage(response.body, {
    maxDimension: env.LINK_PREVIEW_IMAGE_MAX_DIMENSION,
    maxBytes: env.LINK_PREVIEW_IMAGE_MAX_BYTES,
  });
  const file = await storeServerFile(processed.data, processed.mime);
  return file.id;
}

async function markFailed(url: string): Promise<void> {
  const current = await prisma.linkPreview.findUnique({ where: { url } });
  const attempts = (current?.attempts ?? 0) + 1;
  const ttlMs =
    attempts >= env.LINK_PREVIEW_MAX_ATTEMPTS
      ? env.LINK_PREVIEW_TTL_HOURS * 60 * 60 * 1000
      : env.LINK_PREVIEW_FAILED_TTL_MINUTES * 60 * 1000;

  const data = {
    status: 'FAILED' as const,
    attempts,
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
  };
  await prisma.linkPreview.upsert({ where: { url }, create: { url, ...data }, update: data });
}

export async function fetchLinkPreview(url: string, options: LinkPreviewFetchOptions = {}): Promise<void> {
  try {
    const page = await safeFetch(url, fetchOptions({ isAddressAllowed: options.isAddressAllowed }));
    const parsed = parseOpenGraph(page.body.toString('utf8'), page.url);

    let imageFileId: string | null = null;
    if (parsed.imageUrl) {
      imageFileId = await downloadImage(parsed.imageUrl, options).catch((error: unknown) => {
        logger.debug({ url, imageUrl: parsed.imageUrl, error }, 'Картинка превью не скачалась');
        return null;
      });
    }

    const data = {
      status: 'READY' as const,
      siteName: parsed.siteName,
      title: parsed.title,
      description: parsed.description,
      imageFileId,
      attempts: 0,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + env.LINK_PREVIEW_TTL_HOURS * 60 * 60 * 1000),
    };
    await prisma.linkPreview.upsert({ where: { url }, create: { url, ...data }, update: data });
  } catch (error) {
    if (error instanceof SafeFetchError) {
      logger.info({ url, reason: error.reason }, 'Превью ссылки не добыто');
    } else {
      logger.warn({ url, error }, 'Превью ссылки не добыто');
    }
    await markFailed(url);
  }
}

function startFetch(url: string, options: LinkPreviewFetchOptions): Promise<void> {
  const running = inFlight.get(url);
  if (running) return running;

  const task = fetchLinkPreview(url, options).finally(() => inFlight.delete(url));
  inFlight.set(url, task);
  return task;
}

export async function getLinkPreviews(
  urls: string[],
  options: LinkPreviewFetchOptions & { awaitFetch?: boolean } = {},
): Promise<LinkPreviewDto[]> {
  const normalized = urls.map((url) => ({ requested: url, key: normalizeLinkUrl(url) }));
  const keys = [...new Set(normalized.map((item) => item.key).filter((key): key is string => key !== null))];

  const records = await prisma.linkPreview.findMany({ where: { url: { in: keys } } });
  const byUrl = new Map(records.map((record) => [record.url, record]));

  const started: Promise<void>[] = [];
  for (const key of keys) {
    const record = byUrl.get(key) ?? null;
    if (!needsFetch(record)) continue;

    if (!record) {
      await prisma.linkPreview
        .create({ data: { url: key, status: 'PENDING' } })
        .catch(() => undefined);
    }
    if (inFlight.has(key)) continue;
    if (!takeExternalSlot()) continue;

    started.push(startFetch(key, options));
  }

  if (options.awaitFetch && started.length > 0) {
    await Promise.all(started);
    const refreshed = await prisma.linkPreview.findMany({ where: { url: { in: keys } } });
    for (const record of refreshed) byUrl.set(record.url, record);
  }

  return normalized.map((item) =>
    item.key === null ? failedDto(item.requested) : toDto(item.requested, byUrl.get(item.key) ?? null),
  );
}
