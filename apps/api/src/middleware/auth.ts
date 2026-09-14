import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    // Create a temporary client to verify the JWT
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        error: 'account_deleted',
        code: 'account_deleted',
        message: 'Your account has been deleted or no longer exists.'
      });
      return;
    }

    // Fetch user profile for role check
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // Check if user account was deleted or if new registrations are closed
      res.status(401).json({
        success: false,
        error: 'account_deleted',
        code: 'account_deleted',
        message: 'Your account has been deleted or no longer exists.'
      });
      return;
    }

    if (profile.is_banned) {
      res.status(403).json({
        success: false,
        error: 'account_banned',
        code: 'account_banned',
        message: 'Your account has been suspended. Please contact support.'
      });
      return;
    }

    // Single-device login check
    const clientSessionId = req.headers['x-session-id'] as string;
    const currentServerSessionId = user.user_metadata?.current_session_id;

    if (clientSessionId && currentServerSessionId && clientSessionId !== currentServerSessionId) {
      res.status(401).json({
        success: false,
        error: 'concurrent_session',
        code: 'concurrent_session',
        message: 'You have been logged out because a new device logged in to your account.'
      });
      return;
    }

    // Full-Site Maintenance Mode Check (admins bypass)
    if (profile.role !== 'admin') {
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      if (setting?.value === 'true' || setting?.value === true) {
        res.status(503).json({
          success: false,
          error: 'maintenance_mode',
          code: 'maintenance_mode',
          message: 'The platform is currently undergoing maintenance. Please try again shortly.',
        });
        return;
      }
    }

    req.userId = user.id;
    req.userEmail = user.email;
    req.userRole = profile.role || 'user';

    next();
  } catch {
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      req.userId = user.id;
      req.userEmail = user.email;
    }
  } catch {}
  next();
}

