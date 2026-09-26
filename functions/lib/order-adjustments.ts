// Keep the original order charge and wallet debit intact. A pricing correction is
// a separate wallet credit, so history needs to show the resulting net price.
export async function addNetOrderPrices(supabase: any, orders: any[]): Promise<any[]> {
  if (!orders.length) return orders;

  const orderIds = orders.map((order) => String(order.id));
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('reference_id,amount')
    .eq('type', 'refund')
    .eq('status', 'completed')
    .eq('reference_type', 'pricing_adjustment')
    .in('reference_id', orderIds);
  if (error) throw error;

  const creditsByOrder = new Map<string, number>();
  for (const credit of data || []) {
    const orderId = String(credit.reference_id);
    creditsByOrder.set(orderId, (creditsByOrder.get(orderId) || 0) + Number(credit.amount || 0));
  }

  return orders.map((order) => {
    const originalPrice = Number(order.sell_price_inr ?? order.price_inr ?? 0);
    const correction = Math.min(originalPrice, creditsByOrder.get(String(order.id)) || 0);
    return {
      ...order,
      pricing_adjustment_inr: correction,
      net_price_inr: Math.round((originalPrice - correction) * 100) / 100,
    };
  });
}

export async function getDeliveredPricingCorrectionTotal(supabase: any): Promise<number> {
  let total = 0;
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('reference_id,amount')
      .eq('type', 'refund')
      .eq('status', 'completed')
      .eq('reference_type', 'pricing_adjustment')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;

    const credits = data || [];
    if (credits.length) {
      const orderIds = [...new Set(credits.map((credit: any) => String(credit.reference_id)))];
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id,status,sms_code')
        .in('id', orderIds);
      if (ordersError) throw ordersError;
      const deliveredIds = new Set((orders || [])
        .filter((order: any) => order.sms_code || ['code_received', 'completed'].includes(order.status))
        .map((order: any) => String(order.id)));
      total += credits.reduce((sum: number, credit: any) =>
        sum + (deliveredIds.has(String(credit.reference_id)) ? Number(credit.amount || 0) : 0), 0);
    }

    if (credits.length < pageSize) break;
  }

  return Math.round(total * 100) / 100;
}
