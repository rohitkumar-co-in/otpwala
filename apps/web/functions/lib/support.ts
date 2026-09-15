import { getSupabaseAdmin } from './supabase';

const allowedStatuses = new Set(['open', 'in_progress', 'resolved', 'closed']);
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);

export async function createSupportTicket(userId: string, input: any, env?: any) {
  const subject = String(input?.subject || '').trim();
  const message = String(input?.message || '').trim();
  const orderId = input?.orderId ? String(input.orderId) : null;
  if (subject.length < 5 || subject.length > 120) throw new Error('Subject must be 5–120 characters.');
  if (message.length < 10 || message.length > 2000) throw new Error('Message must be 10–2000 characters.');
  const supabase = getSupabaseAdmin(env);
  if (orderId) {
    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).eq('user_id', userId).maybeSingle();
    if (!order) throw new Error('Order not found for this account.');
  }
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', oneHourAgo);
  if (countError) throw countError;
  if ((count || 0) >= 5) throw new Error('Support ticket limit reached. Please wait before creating another ticket.');
  const { data, error } = await supabase.from('support_tickets').insert({ user_id: userId, order_id: orderId, subject, message }).select().single();
  if (error) throw error;
  return data;
}

export async function getUserSupportTickets(userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.from('support_tickets').select('id,order_id,subject,message,status,priority,public_reply,resolved_at,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
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
