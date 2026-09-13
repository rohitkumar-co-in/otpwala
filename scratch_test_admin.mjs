import { supabaseAdmin } from './apps/api/src/config/supabase.js';
import { tigerSms } from './apps/api/src/services/tigerSms.js';

async function test() {
  console.log('Testing admin queries...');
  try {
    const [
      { count: totalUsers },
      { count: totalOrders },
      revenueResult,
      todayOrdersResult,
      activeOrdersResult,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('orders').select('sell_price_inr').in('status', ['completed', 'code_received']),
      supabaseAdmin.from('orders').select('sell_price_inr')
        .gte('created_at', new Date().toISOString().split('T')[0])
        .in('status', ['completed', 'code_received']),
      supabaseAdmin.from('orders').select('*', { count: 'exact', head: true })
        .eq('status', 'waiting'),
    ]);
    console.log('Dashboard stats:', { totalUsers, totalOrders });
  } catch (err) {
    console.error('Dashboard stats error:', err);
  }

  try {
    const bal = await tigerSms.getBalance();
    console.log('Tiger balance:', bal);
  } catch (err) {
    console.error('Tiger getBalance error:', err);
  }

  try {
    const { data, count, error } = await supabaseAdmin
      .from('orders')
      .select('*, profiles(email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 7);
    if (error) console.error('Orders query error:', error);
    else console.log('Orders count:', count, 'data len:', data?.length);
  } catch (err) {
    console.error('Orders query exception:', err);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('payment_requests')
      .select('*, profiles(email)')
      .eq('status', 'created')
      .order('created_at', { ascending: false });
    if (error) console.error('Payment requests query error:', error);
    else console.log('Payment requests len:', data?.length);
  } catch (err) {
    console.error('Payment requests exception:', err);
  }
}

test();
