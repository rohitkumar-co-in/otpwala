import { getSupabaseAdmin } from './supabase';

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
  options?: { customBotToken?: string; customChatId?: string; parseMode?: string },
  env?: any
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const config = await getTelegramConfig(env);
    const botToken = options?.customBotToken?.trim() || config.botToken;
    const chatId = options?.customChatId?.trim() || config.adminChatId;

    if (!botToken) return { success: false, error: 'Telegram Bot Token is missing.' };
    if (!chatId) return { success: false, error: 'Telegram Admin User ID / Chat ID is missing.' };

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode || 'HTML',
        disable_web_page_preview: true,
      }),
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
    'You will receive instant alerts here whenever a user submits a UPI deposit for your approval.',
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
  },
  env?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await getTelegramConfig(env);
    if (!config.enabled || !config.botToken || !config.adminChatId) {
      console.log('Telegram payment notification skipped: bot not configured or enabled');
      return { success: false, error: 'Telegram bot not configured or enabled' };
    }

    const timeFormatted = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const userLabel = details.userName ? `${details.userName} (${details.userEmail})` : details.userEmail;

    const message = [
      '🔔 <b>NEW UPI DEPOSIT FOR APPROVAL</b>',
      '',
      `💰 <b>Amount:</b> ₹${details.amount.toFixed(2)}`,
      `🧾 <b>UTR / Ref ID:</b> <code>${details.utr}</code>`,
      `👤 <b>User:</b> ${userLabel}`,
      `🆔 <b>Request ID:</b> <code>${details.requestId}</code>`,
      `⏰ <b>Time:</b> ${timeFormatted} (IST)`,
      '',
      '👉 <i>Please verify the UTR in your UPI statement and approve in Admin Dashboard to credit the user.</i>',
    ].join('\n');

    return await sendTelegramMessage(message, undefined, env);
  } catch (err: any) {
    console.error('Error sending payment approval notification to Telegram:', err);
    return { success: false, error: err.message };
  }
}
