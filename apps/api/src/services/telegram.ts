import { supabaseAdmin } from '../config/supabase.js';

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  enabled: boolean;
}

/**
 * Fetch active Telegram bot settings from database.
 */
export async function getTelegramConfig(): Promise<TelegramConfig> {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['telegram_bot_token', 'telegram_admin_chat_id', 'telegram_notifications_enabled']);

    if (error || !data) {
      return { botToken: '', adminChatId: '', enabled: false };
    }

    const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));
    const botToken = (map['telegram_bot_token'] || '').trim();
    const adminChatId = (map['telegram_admin_chat_id'] || '').trim();
    const enabledStr = map['telegram_notifications_enabled'];
    // Enabled by default if token and chat ID exist and not explicitly set to 'false'
    const enabled = enabledStr === 'false' ? false : Boolean(botToken && adminChatId);

    return { botToken, adminChatId, enabled };
  } catch (err) {
    console.error('Failed to load telegram config:', err);
    return { botToken: '', adminChatId: '', enabled: false };
  }
}

/**
 * Generic Telegram message dispatcher via Bot API sendMessage.
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    customBotToken?: string;
    customChatId?: string;
    parseMode?: string;
  }
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const config = await getTelegramConfig();
    const botToken = options?.customBotToken?.trim() || config.botToken;
    const chatId = options?.customChatId?.trim() || config.adminChatId;

    if (!botToken) {
      return { success: false, error: 'Telegram Bot Token is missing.' };
    }
    if (!chatId) {
      return { success: false, error: 'Telegram Admin User ID / Chat ID is missing.' };
    }

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
      console.error('Telegram API error response:', errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true, messageId: result.result?.message_id };
  } catch (err: any) {
    console.error('Failed to dispatch Telegram message:', err);
    return { success: false, error: err.message || 'Network error while contacting Telegram API' };
  }
}

/**
 * Notify administrator on Telegram when a user submits a UPI payment with UTR.
 */
export async function notifyPaymentApprovalRequest(details: {
  requestId: string;
  amount: number;
  utr: string;
  userEmail: string;
  userName?: string;
  userId: string;
  createdAt?: string;
}): Promise<void> {
  try {
    const config = await getTelegramConfig();
    if (!config.enabled || !config.botToken || !config.adminChatId) {
      console.log('Telegram payment notification skipped: Telegram bot or chat ID is not configured/enabled.');
      return;
    }

    const timeFormatted = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const userLabel = details.userName ? `${details.userName} (${details.userEmail})` : details.userEmail;

    const message = [
      '🔔 <b>NEW PAYMENT REQUEST FOR APPROVAL</b>',
      '',
      `💰 <b>Amount:</b> ₹${details.amount.toFixed(2)}`,
      `🧾 <b>UTR / Ref ID:</b> <code>${details.utr}</code>`,
      `👤 <b>User:</b> ${userLabel}`,
      `🆔 <b>Request ID:</b> <code>${details.requestId}</code>`,
      `⏰ <b>Time:</b> ${timeFormatted} (IST)`,
      '',
      '👉 <i>Please verify the UTR in your UPI/Bank statement, then approve in the Admin Dashboard to credit the user\'s wallet.</i>',
    ].join('\n');

    await sendTelegramMessage(message);
  } catch (err) {
    console.error('Error sending payment approval notification to Telegram:', err);
  }
}

/**
 * Test Telegram bot connection and send verification alert.
 */
export async function testTelegramConnection(
  customBotToken?: string,
  customChatId?: string
): Promise<{ success: boolean; message: string }> {
  const config = await getTelegramConfig();
  const botToken = customBotToken?.trim() || config.botToken;
  const chatId = customChatId?.trim() || config.adminChatId;

  if (!botToken) {
    throw new Error('Please enter a valid Telegram Bot Token from @BotFather.');
  }
  if (!chatId) {
    throw new Error('Please enter your Telegram User ID / Chat ID.');
  }

  const testMessage = [
    '⚡ <b>Telegram Notification Test Successful!</b>',
    '',
    'Your OTPWala Admin Telegram Alert bot is working properly.',
    'You will receive instant alerts here whenever a user submits a UPI deposit with a UTR for your approval.',
    '',
    `🕒 <i>Tested at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`,
  ].join('\n');

  const res = await sendTelegramMessage(testMessage, {
    customBotToken: botToken,
    customChatId: chatId,
  });

  if (!res.success) {
    throw new Error(res.error || 'Failed to send test message via Telegram');
  }

  return { success: true, message: 'Test message sent to your Telegram chat successfully!' };
}
