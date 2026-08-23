import { searchQuerySchema } from '@messenger/shared';
import { Router } from 'express';

import { parseOrThrow } from '../../lib/validate.js';
import { search } from '../../services/search.js';
import { requireAuth } from '../middleware/auth.js';

export const searchRouter: Router = Router();

searchRouter.use(requireAuth);

searchRouter.get('/', (req, res, next) => {
  try {
    const { q } = parseOrThrow(searchQuerySchema, req.query);
    search(q, req.userId!)
      .then((results) => res.json(results))
      .catch(next);
  } catch (error) {
    next(error);
  }
});
