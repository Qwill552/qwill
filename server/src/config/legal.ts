import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LegalDocId, LegalDocumentDto, LegalVersionsDto, PendingConsentDto } from '@messenger/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const legalDir = path.resolve(here, '../../..', 'legal');

interface LegalDocVersion {
  version: string;
  fileName: string;
}

const LEGAL_DOC_VERSIONS: Record<LegalDocId, LegalDocVersion[]> = {
  terms: [{ version: '1.0', fileName: 'terms-1.0.md' }],
  privacy: [{ version: '1.0', fileName: 'privacy-1.0.md' }],
};

export const CURRENT_LEGAL_VERSIONS: LegalVersionsDto = {
  termsVersion: LEGAL_DOC_VERSIONS.terms[0]!.version,
  privacyVersion: LEGAL_DOC_VERSIONS.privacy[0]!.version,
};

const documentCache = new Map<string, LegalDocumentDto>();

function parseDocument(doc: LegalDocId, version: string, fileName: string): LegalDocumentDto {
  const raw = readFileSync(path.join(legalDir, fileName), 'utf8');
  const titleMatch = /^#\s+(.+)$/m.exec(raw);
  const dateMatch = /\*\*Дата вступления в силу:\*\*\s*(.+)$/m.exec(raw);
  return {
    doc,
    version,
    title: titleMatch?.[1]?.trim() ?? fileName,
    effectiveDate: dateMatch?.[1]?.trim() ?? '',
    content: raw,
  };
}

export function getLegalDocument(doc: LegalDocId, version: string): LegalDocumentDto | null {
  const key = `${doc}:${version}`;
  const cached = documentCache.get(key);
  if (cached) return cached;

  const entry = LEGAL_DOC_VERSIONS[doc]?.find((item) => item.version === version);
  if (!entry) return null;

  const parsed = parseDocument(doc, version, entry.fileName);
  documentCache.set(key, parsed);
  return parsed;
}

export function pendingConsentFor(user: {
  termsVersion: string | null;
  privacyVersion: string | null;
}): PendingConsentDto | null {
  const terms = user.termsVersion !== CURRENT_LEGAL_VERSIONS.termsVersion;
  const privacy = user.privacyVersion !== CURRENT_LEGAL_VERSIONS.privacyVersion;
  if (!terms && !privacy) return null;
  return { terms, privacy };
}
