import { getSupabaseAdmin } from './supabase';

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  enabled: boolean;
}

export async function getTelegramConfig(env?: any): Promise<TelegramConfig> {
  try {
    const supabase = getSupabaseAdmin(env);
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['telegram_bot_token', 'telegram_admin_chat_id', 'telegram_notifications_enabled']);

    const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    const botToken = (map['telegram_bot_token'] || '').trim();
    const adminChatId = (map['telegram_admin_chat_id'] || '').trim();
    const enabledStr = map['telegram_notifications_enabled'];
    const enabled = enabledStr === 'false' ? false : Boolean(botToken && adminChatId);

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
