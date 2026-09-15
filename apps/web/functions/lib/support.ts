import { getSupabaseAdmin } from './supabase';
import { getTelegramConfig, sendTelegramMessage } from './telegram';

const allowedStatuses = new Set(['open', 'in_progress', 'resolved', 'closed']);
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const allowedTypes = new Set(['general_help', 'payment_issue', 'bug_report', 'account_security', 'order_issue']);

export async function createSupportTicket(userId: string, input: any, env?: any) {
  const subject = String(input?.subject || '').trim();
  const message = String(input?.message || '').trim();
  const orderId = input?.orderId ? String(input.orderId) : null;
  const ticketType = String(input?.ticketType || 'general_help');
  const attachment = input?.attachment && typeof input.attachment === 'object' ? input.attachment : null;
  if (subject.length < 5 || subject.length > 120) throw new Error('Subject must be 5–120 characters.');
  if (message.length < 10 || message.length > 2000) throw new Error('Message must be 10–2000 characters.');
  if (!allowedTypes.has(ticketType)) throw new Error('Invalid ticket type.');
  if (attachment) {
    if (!String(attachment.name || '').match(/\.(png|jpe?g|webp|gif)$/i) || !String(attachment.type || '').startsWith('image/')) throw new Error('Only PNG, JPG, WEBP, or GIF images are allowed.');
    if (String(attachment.data || '').length > 2_000_000) throw new Error('Image must be smaller than 1.5 MB.');
  }
  const supabase = getSupabaseAdmin(env);
  if (orderId) {
    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).eq('user_id', userId).maybeSingle();
    if (!order) throw new Error('Order not found for this account.');
  }
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', oneHourAgo);
  if (countError) throw countError;
  if ((count || 0) >= 5) throw new Error('Support ticket limit reached. Please wait before creating another ticket.');
  const { data, error } = await supabase.from('support_tickets').insert({ user_id: userId, order_id: orderId, subject, message, ticket_type: ticketType, attachment }).select().single();
  if (error) throw error;
  try {
    const telegram = await getTelegramConfig(env);
    if (telegram.enabled) {
      await sendTelegramMessage([
        '🎫 <b>New OTPWala support ticket</b>',
        '',
        `<b>Ticket:</b> <code>${data.id}</code>`,
        `<b>Order linked:</b> ${orderId ? 'Yes' : 'No'}`,
        '',
        'Open the protected admin Support Queue to review the customer message.',
      ].join('\n'), undefined, env);
    }
  } catch {
    // Ticket creation must not fail if the optional notification channel is unavailable.
  }
  return data;
}

export async function getUserSupportTickets(userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.from('support_tickets').select('id,order_id,subject,message,ticket_type,attachment,status,priority,public_reply,resolved_at,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function getAdminSupportTickets(status = 'all', env?: any) {
  const supabase = getSupabaseAdmin(env);
  let query = supabase.from('support_tickets').select('*,profiles:user_id(email,full_name)').order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateSupportTicket(ticketId: string, actorId: string, input: any, env?: any) {
  const status = String(input?.status || '');
  const priority = String(input?.priority || 'normal');
  const adminNotes = String(input?.adminNotes || '').trim();
  const publicReply = String(input?.publicReply || '').trim();
  if (!allowedStatuses.has(status)) throw new Error('Invalid ticket status.');
  if (!allowedPriorities.has(priority)) throw new Error('Invalid ticket priority.');
  if (adminNotes.length > 4000) throw new Error('Admin notes are too long.');
  if (publicReply.length > 4000) throw new Error('Public reply is too long.');
  const update: any = { status, priority, admin_notes: adminNotes || null, public_reply: publicReply || null, assigned_to: actorId, updated_at: new Date().toISOString() };
  if (status === 'resolved' || status === 'closed') update.resolved_at = new Date().toISOString();
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.from('support_tickets').update(update).eq('id', ticketId).select().single();
  if (error) throw error;
  return data;
}

export async function replyToSupportTicket(ticketId: string, actorId: string, replyInput: any, isAdmin: boolean, env?: any) {
  const reply = String(replyInput?.reply || '').trim();
  if (reply.length < 1 || reply.length > 4000) throw new Error('Reply must be 1–4000 characters.');
  const supabase = getSupabaseAdmin(env);
  let query = supabase.from('support_tickets').select('id,user_id,status,public_reply').eq('id', ticketId);
  if (!isAdmin) query = query.eq('user_id', actorId);
  const { data: ticket, error: fetchError } = await query.maybeSingle();
  if (fetchError) throw fetchError;
  if (!ticket) throw new Error('Support ticket not found.');
  if (ticket.status === 'resolved' || ticket.status === 'closed') throw new Error('This ticket is closed and cannot receive further replies. Please create a new ticket if you need more help.');
  const label = isAdmin ? 'Support' : 'Customer';
  const entry = `[${label} · ${new Date().toISOString()}]\n${reply}`;
  const combined = ticket.public_reply ? `${ticket.public_reply}\n\n${entry}` : entry;
  const update: any = { public_reply: combined.slice(-12000), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('support_tickets').update(update).eq('id', ticketId).select().single();
  if (error) throw error;
  return data;
}
