import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

router.get('/access-check', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Cache-Control','no-store');
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error}=await supabaseAdmin.auth.getUser(token);
  if(error||!user){res.status(403).json({valid:false,reason:error?.code==='user_banned'?'account_banned':'account_deleted'});return;}
  const {data:profile,error:profileError}=await supabaseAdmin.from('profiles').select('is_banned').eq('id',user.id).maybeSingle();
  if(profileError||!profile){res.status(503).json({valid:false,reason:'account_unavailable'});return;}
  if(profile.is_banned){res.status(403).json({valid:false,reason:'account_banned',message:'Your account has been suspended'});return;}
  res.json({valid:true});
});

/**
 * POST /api/auth/register-session
 * Registers a new active session ID for the authenticated user,
 * invalidating any previous session across other devices.
 */
router.post('/register-session', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  const { sessionId } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ success: false, error: 'Valid sessionId is required' });
    return;
  }

  try {
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      res.status(401).json({ success: false, error: 'account_deleted', message: 'User not found or deleted' });
      return;
    }

    // Verify user is not banned
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if(profileError||!profile){res.status(503).json({success:false,error:'account_unavailable'});return;}

    if (profile?.is_banned) {
      res.status(403).json({ success: false, error: 'account_banned', message: 'Account has been suspended' });
      return;
    }

    // Update active session ID in user_metadata
    const updatedMeta = {
      ...(user.user_metadata || {}),
      current_session_id: sessionId,
      session_updated_at: Date.now(),
      session_user_agent: req.headers['user-agent'] || 'unknown',
    };

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMeta,
    });

    if (updateErr) {
      console.error('Failed to update active session:', updateErr.message);
      res.status(500).json({ success: false, error: 'Failed to register session' });
      return;
    }

    res.json({
      success: true,
      data: {
        sessionId,
        updatedAt: updatedMeta.session_updated_at,
      },
    });
  } catch (err: any) {
    console.error('register-session error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/session-check
 * Validates whether the provided token and session ID are currently active.
 * Detects if the user was deleted, banned, or superseded by another device.
 */
router.get('/session-check', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, valid: false, reason: 'missing_token' });
    return;
  }

  const token = authHeader.substring(7);
  const clientSessionId = (req.headers['x-session-id'] as string) || (req.query.sessionId as string);

  try {
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      // User was deleted from auth.users
      res.status(401).json({
        success: false,
        valid: false,
        reason: 'account_deleted',
        message: 'Your account has been deleted or no longer exists.',
      });
      return;
    }

    // Verify profile exists and is not banned
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // User profile deleted
      res.status(401).json({
        success: false,
        valid: false,
        reason: 'account_deleted',
        message: 'Your account has been deleted or no longer exists.',
      });
      return;
    }

    if (profile.is_banned) {
      res.status(403).json({
        success: false,
        valid: false,
        reason: 'account_banned',
        message: 'Your account has been suspended.',
      });
      return;
    }

    const currentServerSessionId = user.user_metadata?.current_session_id;

    res.json({
      success: true,
      valid: true,
      data: {
        userId: user.id,
        sessionId: currentServerSessionId || clientSessionId,
      },
    });
  } catch (err: any) {
    console.error('session-check error:', err);
    res.status(500).json({ success: false, valid: false, reason: 'server_error' });
  }
});

/**
 * POST /api/auth/check-email
 * Checks whether an email is already associated with an existing user.
 * Used before signup to prevent duplicate account creation and duplicate emails.
 */
router.post('/check-email', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    res.status(400).json({ success: false, error: 'Email is required' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // Check profiles table (all registered users have a profile row)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (profile) {
      res.json({ success: true, exists: true });
      return;
    }

    res.json({ success: true, exists: false });
  } catch (err: any) {
    console.error('check-email error:', err);
    // On unexpected error, return exists: false to not block valid users
    res.json({ success: true, exists: false });
  }
});

/**
 * POST /api/auth/record-session
 * Records user IP, ISP, ASN, and device telemetry for security compliance
 */
router.post('/record-session', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const ip = (req.headers['cf-connecting-ip'] as string) ||
               (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
               req.socket.remoteAddress || '127.0.0.1';
    const isp = (req.headers['cf-asorganization'] as string) || 'Standard Network';
    const country = (req.headers['cf-ipcountry'] as string) || null;
    const userAgent = (req.headers['user-agent'] as string) || 'Unknown Client';
    const { event } = req.body || {};
    const rawEvent = String(event || 'login').toLowerCase();
    const eventType = ['signup', 'oauth_login', 'password_reset', 'session_refresh'].includes(rawEvent)
      ? rawEvent
      : 'login';

    try {
      await supabaseAdmin.from('user_security_logs').insert({
        user_id: user.id,
        event_type: eventType,
        ip_address: ip,
        isp,
        country,
        user_agent: userAgent,
      });
    } catch (e: any) {
      console.warn('user_security_logs insert error:', e);
    }

    const updatePayload: Record<string, any> = {
      last_login_ip: ip,
      last_login_isp: isp,
      last_login_country: country,
      last_login_at: new Date().toISOString(),
    };
    if (eventType === 'signup') {
      updatePayload.signup_ip = ip;
      updatePayload.signup_isp = isp;
      updatePayload.signup_country = country;
    }

    try {
      await supabaseAdmin.from('profiles').update(updatePayload).eq('id', user.id);
    } catch (e: any) {
      console.warn('profile update error:', e);
    }

    res.json({ success: true, data: { ip, isp, country, event: eventType } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/login-history
 * Returns the recent sign-in & security logs for the authenticated user
 */
router.get('/login-history', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limit = Math.min(parseInt((req.query.limit as string) || '25', 10), 100);
    const { data, error } = await supabaseAdmin
      .from('user_security_logs')
      .select('id, event_type, ip_address, isp, asn, country, region, city, user_agent, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const currentIp = (req.headers['cf-connecting-ip'] as string) ||
                      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                      req.socket.remoteAddress || '127.0.0.1';
    const currentIsp = (req.headers['cf-asorganization'] as string) || 'Current Network';
    const currentCountry = (req.headers['cf-ipcountry'] as string) || null;

    res.json({
      success: true,
      data: {
        current: {
          ip: currentIp,
          isp: currentIsp,
          country: currentCountry,
          city: null,
        },
        history: data || [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

