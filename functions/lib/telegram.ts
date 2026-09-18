import { getSupabaseAdmin } from './supabase';
import { createActionToken, getTelegramWebhookSecret } from './telegram-security';
export { createActionToken, getTelegramWebhookSecret, verifyActionToken } from './telegram-security';

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  enabled: boolean;
}

function cleanJsonVal(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      try {
        return JSON.parse(s);
      } catch {
        return s.slice(1, -1).trim();
      }
    }
    return s;
  }
  return String(v).trim();
}

export async function getTelegramConfig(env?: any): Promise<TelegramConfig> {
  try {
    const supabase = getSupabaseAdmin(env);
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['telegram_bot_token', 'telegram_admin_chat_id', 'telegram_notifications_enabled']);

    const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    const botToken = cleanJsonVal(map['telegram_bot_token']);
    const adminChatId = cleanJsonVal(map['telegram_admin_chat_id']);
    const enabledRaw = cleanJsonVal(map['telegram_notifications_enabled']);
    const enabled = enabledRaw === 'false' ? false : Boolean(botToken && adminChatId);

    return { botToken, adminChatId, enabled };
  } catch {
    return { botToken: '', adminChatId: '', enabled: false };
  }
}

export async function sendTelegramMessage(
  text: string,
  options?: {
    customBotToken?: string;
    customChatId?: string;
    parseMode?: string;
    replyMarkup?: any;
  },
  env?: any
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const config = await getTelegramConfig(env);
    const botToken = options?.customBotToken?.trim() || config.botToken;
    const chatId = options?.customChatId?.trim() || config.adminChatId;

    if (!botToken) return { success: false, error: 'Telegram Bot Token is missing.' };
    if (!chatId) return { success: false, error: 'Telegram Admin User ID / Chat ID is missing.' };

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode || 'HTML',
      disable_web_page_preview: true,
    };
    if (options?.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as any;
    if (!response.ok || !result.ok) {
      const errMsg = result.description || `Telegram API error (${response.status})`;
      return { success: false, error: errMsg };
    }

    return { success: true, messageId: result.result?.message_id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error while contacting Telegram API' };
  }
}

export async function notifyLowProviderBalance(balance: number, threshold: number, env?: any) {
  if (!Number.isFinite(balance) || balance >= threshold) return { sent: false, reason: 'above_threshold' };
  const config = await getTelegramConfig(env);
  if (!config.enabled) return { sent: false, reason: 'not_configured' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const timeParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const halfDay = Number(timeParts.hour) < 12 ? 'am' : 'pm';
  const alertKey = `provider_low_balance:${timeParts.year}-${timeParts.month}-${timeParts.day}:${halfDay}`;
  const supabase = getSupabaseAdmin(env);
  const claim = await supabase.from('operational_alerts').insert({
    alert_key: alertKey,
    alert_type: 'provider_low_balance',
    channel: 'telegram',
    details: { balance, threshold },
  });
  if (claim.error?.code === '23505') return { sent: false, reason: 'already_alerted' };
  if (claim.error) throw claim.error;
  const response = await sendTelegramMessage([
    '⚠️ <b>OTPWala provider balance is low</b>',
    '',
    `<b>Current Tiger balance:</b> $${balance.toFixed(2)}`,
    `<b>Alert threshold:</b> $${threshold.toFixed(2)}`,
    '',
    'Top up the provider account to prevent customer purchase failures.',
  ].join('\n'), undefined, env);
  await supabase.from('operational_alerts').update({
    status: response.success ? 'sent' : 'failed',
    last_error: response.success ? null : String(response.error || 'Notification failed').slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq('alert_key', alertKey);
  return { sent: response.success, reason: response.error || null };
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
  botToken: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
  } catch (e) {
    console.warn('Failed to answer callback query:', e);
  }
}

export async function editTelegramMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  botToken: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.warn('Failed to edit telegram message text:', e);
  }
}

export async function ensureTelegramWebhook(origin: string, env?: any): Promise<void> {
  try {
    const config = await getTelegramConfig(env);
    if (!config.botToken || !origin) return;
    const webhookUrl = `${origin.replace(/\/+$/, '')}/api/telegram/webhook`;
    const secretToken = await getTelegramWebhookSecret(config.botToken);
    await fetch(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['callback_query', 'message'],
      }),
    });
  } catch (err) {
    console.warn('Failed to ensure telegram webhook:', err);
  }
}

export async function testTelegramConnection(
  customBotToken?: string,
  customChatId?: string,
  env?: any
): Promise<{ success: boolean; message: string }> {
  const config = await getTelegramConfig(env);
  const botToken = customBotToken?.trim() || config.botToken;
  const chatId = customChatId?.trim() || config.adminChatId;

  if (!botToken) throw new Error('Please enter a valid Telegram Bot Token from @BotFather.');
  if (!chatId) throw new Error('Please enter your Telegram User ID / Chat ID.');

  const testMessage = [
    '⚡ <b>Telegram Notification Test Successful!</b>',
    '',
    'Your OTPWala Admin Telegram Alert bot is working properly.',
    'You will receive instant alerts here whenever a user submits a UPI deposit, with one-tap <b>Approve</b> and <b>Reject</b> buttons.',
    '',
    `🕒 <i>Tested at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`,
  ].join('\n');

  const res = await sendTelegramMessage(testMessage, { customBotToken: botToken, customChatId: chatId }, env);

  if (!res.success) throw new Error(res.error || 'Failed to send test message via Telegram');
  return { success: true, message: 'Test message sent to your Telegram chat successfully!' };
}

export async function notifyPaymentApprovalRequest(
  details: {
    requestId: string;
    amount: number;
    utr: string;
    userEmail: string;
    userName?: string;
    userId: string;
    createdAt?: string;
    origin?: string;
    paymentMethod?: string;
  },
  env?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getTelegramConfig(env);
    if (!config.enabled || !config.botToken || !config.adminChatId) {
      console.log('Telegram payment notification skipped: bot not configured or enabled');
      return { success: false, error: 'Telegram bot not configured or enabled' };
    }

    const origin = (details.origin || '').replace(/\/+$/, '') || 'https://otpwala.pages.dev';
    const token = await createActionToken(details.requestId, config.botToken);
    const approveActionUrl = `${origin}/api/telegram/action?action=approve&id=${details.requestId}&token=${token}`;
    const rejectActionUrl = `${origin}/api/telegram/action?action=reject&id=${details.requestId}&token=${token}`;

    const timeFormatted = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const userLabel = details.userName ? `${details.userName} (${details.userEmail})` : details.userEmail;
    const isBinance = details.paymentMethod?.toLowerCase() === 'binance';

    const message = [
      isBinance ? '🔔 <b>NEW BINANCE PAY DEPOSIT FOR APPROVAL</b>' : '🔔 <b>NEW UPI DEPOSIT FOR APPROVAL</b>',
      '',
      `💰 <b>Amount:</b> ₹${details.amount.toFixed(2)}`,
      `💳 <b>Method:</b> ${isBinance ? 'Binance Pay (Crypto / USDT)' : 'UPI'}`,
      `${isBinance ? '🧾 <b>Binance Order / TxID:</b>' : '🧾 <b>UTR / Ref ID:</b>'} <code>${details.utr}</code>`,
      `👤 <b>User:</b> ${userLabel}`,
      `🆔 <b>Request ID:</b> <code>${details.requestId}</code>`,
      `⏰ <b>Time:</b> ${timeFormatted} (IST)`,
      '',
      isBinance
        ? '👉 <i>Please verify the transfer in your Binance App (Pay Transaction History), then approve to credit the user\'s wallet.</i>'
        : '👉 <i>Please verify the UTR in your UPI/Bank statement, then approve to credit the user\'s wallet.</i>',
      '',
      '👉 <b>One-Click Approval:</b>',
      `• <a href="${approveActionUrl}"><b>✅ Click Here to Approve &amp; Credit ₹${details.amount.toFixed(2)}</b></a>`,
      `• <a href="${rejectActionUrl}"><b>❌ Click Here to Reject</b></a>`,
    ].join('\n');

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: `✅ Approve ₹${details.amount.toFixed(2)}`, callback_data: `approve_${details.requestId}` },
          { text: '❌ Reject', callback_data: `reject_${details.requestId}` },
        ],
        [
          { text: '🌐 Open Admin Dashboard', url: `${origin}/admin` },
        ],
      ],
    };

    // Also ensure webhook is registered
    ensureTelegramWebhook(origin, env).catch(() => {});

    return await sendTelegramMessage(message, { replyMarkup }, env);
  } catch (err: any) {
    console.error('Error sending payment approval notification to Telegram:', err);
    return { success: false, error: err.message };
  }
}
