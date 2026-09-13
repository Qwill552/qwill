import {
  acceptLegalSchema,
  ErrorCode,
  LEGAL_DOC_VALUES,
  type LegalDocId,
  type LegalVersionsDto,
} from '@messenger/shared';
import { Router } from 'express';

import { CURRENT_LEGAL_VERSIONS, getLegalDocument } from '../../config/legal.js';
import { notFound } from '../../lib/errors.js';
import * as legalService from '../../services/legal.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const legalRouter: Router = Router();

legalRouter.get('/current', (_req, res) => {
  const body: LegalVersionsDto = CURRENT_LEGAL_VERSIONS;
  res.json(body);
});

legalRouter.get('/:doc/:version', (req, res, next) => {
  const { doc, version } = req.params;
  if (!(LEGAL_DOC_VALUES as readonly string[]).includes(doc)) {
    next(notFound(ErrorCode.NOT_FOUND, 'Документ не найден'));
    return;
  }

  const document = getLegalDocument(doc as LegalDocId, version!);
  if (!document) {
    next(notFound(ErrorCode.NOT_FOUND, 'Версия документа не найдена'));
    return;
  }
  res.json(document);
});

legalRouter.post('/accept', requireAuth, validateBody(acceptLegalSchema), (req, res, next) => {
  legalService
    .acceptLegal(req.userId!, req.body)
    .then((user) => res.status(200).json(user))
    .catch(next);
});
