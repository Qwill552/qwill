import { linkPreviewRequestSchema, type LinkPreviewsResponse } from '@messenger/shared';
import { Router } from 'express';

import { getLinkPreviews } from '../../services/linkPreview.js';
import { requireAuth } from '../middleware/auth.js';
import { linkPreviewLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

export const linksRouter: Router = Router();

linksRouter.post('/preview', requireAuth, linkPreviewLimiter, validateBody(linkPreviewRequestSchema), (req, res, next) => {
  getLinkPreviews(req.body.urls)
    .then((previews) => {
      const body: LinkPreviewsResponse = { previews };
      res.json(body);
    })
    .catch(next);
});
