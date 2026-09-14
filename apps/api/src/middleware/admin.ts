import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}
