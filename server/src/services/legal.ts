import { ErrorCode, type AcceptLegalInput, type PublicUser } from '@messenger/shared';

import { CURRENT_LEGAL_VERSIONS } from '../config/legal.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { getUserById, toPublicUser } from './user.js';

export async function acceptLegal(userId: string, input: AcceptLegalInput): Promise<PublicUser> {
  if (
    input.termsVersion !== CURRENT_LEGAL_VERSIONS.termsVersion ||
    input.privacyVersion !== CURRENT_LEGAL_VERSIONS.privacyVersion
  ) {
    throw new AppError(
      ErrorCode.LEGAL_VERSION_OUTDATED,
      409,
      'Документы обновились, обновите страницу и попробуйте снова',
    );
  }

  await getUserById(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      termsVersion: input.termsVersion,
      termsAcceptedAt: new Date(),
      privacyVersion: input.privacyVersion,
    },
  });
  return toPublicUser(user);
}
