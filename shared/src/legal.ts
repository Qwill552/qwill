import { z } from 'zod';

export const LEGAL_DOC_VALUES = ['terms', 'privacy'] as const;
export type LegalDocId = (typeof LEGAL_DOC_VALUES)[number];

export interface LegalVersionsDto {
  termsVersion: string;
  privacyVersion: string;
}

export interface LegalDocumentDto {
  doc: LegalDocId;
  version: string;
  title: string;
  effectiveDate: string;
  content: string;
}

export interface PendingConsentDto {
  terms: boolean;
  privacy: boolean;
}

export const acceptLegalSchema = z.object({
  termsVersion: z.string().min(1),
  privacyVersion: z.string().min(1),
});

export type AcceptLegalInput = z.infer<typeof acceptLegalSchema>;
