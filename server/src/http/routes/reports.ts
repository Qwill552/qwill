import { createReportSchema } from '@messenger/shared';
import { Router } from 'express';

import { createReport } from '../../services/admin.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const reportsRouter: Router = Router();

reportsRouter.use(requireAuth);

reportsRouter.post('/', validateBody(createReportSchema), (req, res, next) => {
  createReport(req.userId!, req.body)
    .then((report) => res.status(201).json(report))
    .catch(next);
});
