import { ErrorCode, IP_BANNED_MESSAGE, type ApiErrorBody } from '@messenger/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { ipFromRequest } from '../../lib/clientIp.js';
import { isIpBanned } from '../../services/ipBan.js';

export const ipBanGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!isIpBanned(ipFromRequest(req))) {
    next();
    return;
  }

  const body: ApiErrorBody = { error: { code: ErrorCode.IP_BANNED, message: IP_BANNED_MESSAGE } };
  res.status(403).json(body);
};
