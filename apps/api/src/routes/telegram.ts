import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import {
  getTelegramConfig,
  verifyActionToken,
  verifyTelegramWebhookSecret,
  answerCallbackQuery,
  editTelegramMessageText,
} from '../services/telegram.js';

const router = Router();

function renderActionPageHtml(props: { success: boolean; title: string; message: string; isReject?: boolean }): string {
  const accentColor = props.success ? (props.isReject ? '#ef4444' : '#10b981') : '#f59e0b';
  const iconEmoji = props.success ? (props.isReject ? '❌' : '✅') : '⚠️';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.title} - OTPWala Admin</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b0f19;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid ${accentColor}55;
      border-radius: 16px;
      padding: 36px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .icon {
      font-size: 52px;
      margin-bottom: 16px;
      line-height: 1;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
      color: ${accentColor};
      font-weight: 700;
    }
    p {
      margin: 0 0 24px;
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #2563eb;
      color: #ffffff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${iconEmoji}</div>
    <h1>${props.title}</h1>
    <p>${props.message}</p>
    <a href="/admin" class="btn">Open Admin Dashboard</a>
  </div>
</body>
</html>`;
}

async function approvePayment(id: string) {
  const { error } = await supabaseAdmin.rpc('approve_payment_request_atomic', {
    p_request_id: id,
    p_admin_id: 'telegram',
  });
  if (error) throw error;
}

async function rejectPayment(id: string, reason = '') {
  const updateRes = await supabaseAdmin
    .from('payment_requests')
    .update({ status: 'rejected', admin_notes: reason, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateRes.error) {
    await supabaseAdmin
      .from('payment_requests')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id);
  }
}

/**
 * GET /api/telegram/webhook
 */
router.get('/webhook', (_req: Request, res: Response) => {
  res.json({ ok: true, status: 'Telegram webhook active' });
});

/**
 * POST /api/telegram/webhook
 * Handles inline button clicks (approve_*, reject_*) from Telegram bot messages.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const config = await getTelegramConfig();
    const suppliedSecret = String(req.header('X-Telegram-Bot-Api-Secret-Token') || '');
    if (!verifyTelegramWebhookSecret(suppliedSecret, config.botToken)) {
      res.status(401).json({ ok: false, error: 'Unauthorized webhook' });
      return;
    }

    const update = req.body;
    const callbackQuery = update?.callback_query;

    if (callbackQuery) {
      const config = await getTelegramConfig();
      const callbackId = callbackQuery.id;
      const fromId = String(callbackQuery.from?.id || '');
      const chatId = String(callbackQuery.message?.chat?.id || fromId);
      const messageId = callbackQuery.message?.message_id;
      const data = String(callbackQuery.data || '');

      const configuredAdmin = String(config.adminChatId || '').trim();
      if (configuredAdmin && configuredAdmin !== chatId.trim() && configuredAdmin !== fromId.trim()) {
        await answerCallbackQuery(callbackId, '⚠️ Unauthorized: Only admin can approve or reject deposits', true, config.botToken);
        res.json({ ok: true });
        return;
      }

      if (data.startsWith('approve_')) {
        const requestId = data.replace(/^approve_/, '');
        try {
          await approvePayment(requestId);
          await answerCallbackQuery(callbackId, '✅ Deposit approved & credited successfully!', false, config.botToken);

          if (messageId && chatId && config.botToken) {
            const oldText = callbackQuery.message?.text || 'UPI Deposit Request';
            const updatedText = `${oldText}\n\n━━━━━━━━━━━━━━━\n✅ <b>STATUS: APPROVED & CREDITED</b>\n🕒 <i>Processed via Telegram at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;
            await editTelegramMessageText(chatId, messageId, updatedText, config.botToken);
          }
        } catch (appErr: any) {
          const msg = appErr.message?.includes('already been approved')
            ? 'ℹ️ Already approved and credited!'
            : `⚠️ ${appErr.message || 'Approval failed'}`;
          await answerCallbackQuery(callbackId, msg, true, config.botToken);
        }
      } else if (data.startsWith('reject_')) {
        const requestId = data.replace(/^reject_/, '');
        try {
          await rejectPayment(requestId, 'Rejected by Admin via Telegram Bot');
          await answerCallbackQuery(callbackId, '❌ Deposit request rejected', false, config.botToken);

          if (messageId && chatId && config.botToken) {
            const oldText = callbackQuery.message?.text || 'UPI Deposit Request';
            const updatedText = `${oldText}\n\n━━━━━━━━━━━━━━━\n❌ <b>STATUS: REJECTED</b>\n🕒 <i>Rejected via Telegram at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;
            await editTelegramMessageText(chatId, messageId, updatedText, config.botToken);
          }
        } catch (rejErr: any) {
          await answerCallbackQuery(callbackId, `⚠️ ${rejErr.message || 'Rejection failed'}`, true, config.botToken);
        }
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('Error handling Telegram webhook:', err);
    res.json({ ok: true });
  }
});

/**
 * GET /api/telegram/action
 * One-click action URLs from Telegram notifications.
 */
router.get('/action', async (req: Request, res: Response) => {
  const action = req.query.action as string;
  const id = req.query.id as string;
  const token = req.query.token as string;

  const config = await getTelegramConfig();
  if (!id || !token || !action || !verifyActionToken(id, token, config.botToken)) {
    res.status(403).send(
      renderActionPageHtml({
        success: false,
        title: 'Unauthorized or Expired Link',
        message: 'This action token is invalid or has expired. Please use the Telegram bot button or Admin Dashboard.',
      })
    );
    return;
  }

  try {
    if (action === 'approve') {
      await approvePayment(id);
      res.status(200).send(
        renderActionPageHtml({
          success: true,
          title: 'Deposit Approved & Credited! ✅',
          message: `Payment request <b>${id}</b> has been approved. The user's wallet has been credited successfully.`,
        })
      );
    } else if (action === 'reject') {
      await rejectPayment(id, 'Rejected via one-click Telegram action');
      res.status(200).send(
        renderActionPageHtml({
          success: true,
          isReject: true,
          title: 'Deposit Rejected ❌',
          message: `Payment request <b>${id}</b> was rejected and marked as declined.`,
        })
      );
    } else {
      res.status(400).send(
        renderActionPageHtml({
          success: false,
          title: 'Unknown Action',
          message: `Action "${action}" is not supported.`,
        })
      );
    }
  } catch (err: any) {
    const isAlreadyApproved = err.message?.includes('already been approved');
    res.status(200).send(
      renderActionPageHtml({
        success: isAlreadyApproved,
        title: isAlreadyApproved ? 'Already Approved ✅' : 'Action Failed ⚠️',
        message: isAlreadyApproved
          ? `This payment request has already been approved and credited to the user's wallet.`
          : err.message || 'An unexpected error occurred while processing this request.',
      })
    );
  }
});

export default router;
