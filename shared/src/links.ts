import { z } from 'zod';

export const LINK_PREVIEW_MAX_URLS = 20;
export const LINK_PREVIEW_URL_MAX_LENGTH = 2048;
export const LINK_PREVIEW_TITLE_MAX_LENGTH = 120;
export const LINK_PREVIEW_DESCRIPTION_MAX_LENGTH = 200;
export const LINK_PREVIEW_SITE_NAME_MAX_LENGTH = 64;

export type LinkPreviewStatus = 'pending' | 'ready' | 'failed';

export interface LinkPreviewDto {
  url: string;
  status: LinkPreviewStatus;
  siteName: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface LinkPreviewsResponse {
  previews: LinkPreviewDto[];
}

export const linkPreviewRequestSchema = z.object({
  urls: z
    .array(z.string().trim().min(1).max(LINK_PREVIEW_URL_MAX_LENGTH))
    .min(1, 'Нужен хотя бы один адрес')
    .max(LINK_PREVIEW_MAX_URLS, `Не больше ${LINK_PREVIEW_MAX_URLS} адресов за раз`),
});
export type LinkPreviewRequest = z.infer<typeof linkPreviewRequestSchema>;
