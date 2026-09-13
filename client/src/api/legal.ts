import type { AcceptLegalInput, LegalDocId, LegalDocumentDto, LegalVersionsDto, PublicUser } from '@messenger/shared';

import { apiRequest } from './client';

export function getCurrentLegalVersionsRequest(): Promise<LegalVersionsDto> {
  return apiRequest<LegalVersionsDto>('/api/legal/current');
}

export function getLegalDocumentRequest(doc: LegalDocId, version: string): Promise<LegalDocumentDto> {
  return apiRequest<LegalDocumentDto>(`/api/legal/${doc}/${version}`);
}

export function acceptLegalRequest(input: AcceptLegalInput): Promise<PublicUser> {
  return apiRequest<PublicUser>('/api/legal/accept', { method: 'POST', body: input });
}
