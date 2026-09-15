export type PurchaseCounts = { active: number; recent: number; daily: number };

export function assertPurchaseAllowed(counts: PurchaseCounts) {
  if (counts.active >= 3) throw new Error('You already have 3 active numbers. Complete or cancel one before buying another.');
  if (counts.recent >= 10) throw new Error('Purchase limit reached. Please wait 10 minutes before trying again.');
  if (counts.daily >= 50) throw new Error('Daily purchase limit reached. Contact support if you need a higher limit.');
}

export function assertProviderCanFund(providerBalance: number, costPriceUsd: number) {
  if (!Number.isFinite(providerBalance) || !Number.isFinite(costPriceUsd) || costPriceUsd <= 0 || providerBalance < costPriceUsd) {
    const error = new Error('Carrier numbers are temporarily unavailable. Please try again later.');
    (error as any).code = 'PROVIDER_LOW_BALANCE';
    throw error;
  }
}

export function assertValidAdminCredit(amount: number, note: string) {
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
    throw new Error('Admin credit must be between ₹1 and ₹10,00,000.');
  }
  if (!note || note.trim().length < 5) throw new Error('A reason of at least 5 characters is required.');
}

export function classifyExpiredProviderStatus(status: string) {
  if (status === 'code_received') return 'deliver' as const;
  if (status === 'waiting' || status.startsWith('status_wait')) return 'cancel_and_refund' as const;
  if (['cancelled', 'completed', 'status_finish', 'no_activation'].includes(status)) return 'refund' as const;
  return 'unsupported' as const;
}
