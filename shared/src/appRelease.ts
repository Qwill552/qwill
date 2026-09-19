import { z } from 'zod';

export const APP_RELEASE_MANIFEST_FILE = 'android.json';

export const appReleaseManifestSchema = z.object({
  latestVersionCode: z.number().int().positive(),
  versionName: z.string().trim().min(1),
  minSupportedVersionCode: z.number().int().positive(),
  apkFile: z
    .string()
    .trim()
    .min(1)
    .regex(/^[\w.-]+\.apk$/, 'apkFile — имя файла рядом с манифестом, без путей'),
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{64}$/, 'sha256 — 64 шестнадцатеричных символа'),
  changelog: z.array(z.string().trim().min(1)).default([]),
});

export type AppReleaseManifest = z.infer<typeof appReleaseManifestSchema>;

export interface AppVersionInfo {
  latestVersionCode: number;
  versionName: string;
  minSupportedVersionCode: number;
  apkUrl: string;
  sizeBytes: number;
  sha256: string;
  changelog: string[];
}

export const APK_DOWNLOAD_PATH = '/api/app/apk';

export const WINDOWS_RELEASE_BASE_PATH = '/api/app/win';

export const APP_RELEASE_WINDOWS_MANIFEST_FILE = 'windows.json';

export const windowsReleaseManifestSchema = z.object({
  versionName: z.string().trim().min(1),
  exeFile: z
    .string()
    .trim()
    .min(1)
    .regex(/^[\w.-]+\.exe$/, 'exeFile — имя файла рядом с манифестом, без путей'),
  zipFile: z
    .string()
    .trim()
    .min(1)
    .regex(/^[\w.-]+\.zip$/, 'zipFile — имя файла рядом с манифестом, без путей')
    .optional(),
  sha256: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{64}$/, 'sha256 — 64 шестнадцатеричных символа'),
  changelog: z.array(z.string().trim().min(1)).default([]),
});

export type WindowsReleaseManifest = z.infer<typeof windowsReleaseManifestSchema>;

export interface WindowsVersionInfo {
  versionName: string;
  exeUrl: string;
  sizeBytes: number;
  zipUrl: string | null;
  zipSizeBytes: number | null;
  sha256: string;
  changelog: string[];
}

export const ANNOUNCE_PLATFORMS = ['android', 'windows'] as const;

export type AnnouncePlatform = (typeof ANNOUNCE_PLATFORMS)[number];

export const announceSchema = z.object({
  platforms: z.array(z.enum(ANNOUNCE_PLATFORMS)).min(1),
});
