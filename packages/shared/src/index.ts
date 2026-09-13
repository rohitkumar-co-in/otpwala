// ─── Tiger SMS Types ───

export interface TigerService {
  code: string;
  name: string;
}

export interface TigerCountry {
  id: number;
  rus: string;
  eng: string;
  chn: string;
  visible: number;
  retry: number;
}

export interface TigerPriceV3 {
  price: number;
  count: number;
  currency: number;
  saleAveragePrice?: number;
  providers: Record<string, {
    count: number;
    price: number[];
    provider_id: number;
  }>;
}

export interface TigerActivation {
  activationId: string;
  serviceCode: string;
  phoneNumber: string;
  activationCost: number;
  activationStatus: string;
  smsCode: string;
  smsText: string;
  activationTime: string;
  countryCode: number;
  countryName: string;
  canGetAnotherSms: boolean;
  currency: number;
}

export interface TigerStatusV2 {
  verificationType: number;
  sms: {
    dateTime: string;
    code: string;
    text: string;
  } | null;
}

export interface TigerNumberV2Response {
  activationId: string;
  phoneNumber: string;
  activationCost: string;
  canGetAnotherSms: boolean;
  activationTime: string;
  countryCode: number;
  currency: number;
}

// ─── App Types ───

export type UserRole = 'user' | 'admin';
export type OrderStatus = 'waiting' | 'code_received' | 'completed' | 'cancelled' | 'refunded' | 'expired';
export type WalletTransactionType = 'topup' | 'deduction' | 'refund' | 'admin_credit';
export type MarkupType = 'percentage' | 'flat' | 'fixed_price';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  wallet_balance: number;
  total_spent: number;
  total_orders: number;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: WalletTransactionType;
  amount: number;
  balance_after: number;
  description: string | null;
  payment_id: string | null;
  payment_method: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  activation_id: string;
  service_code: string;
  service_name: string;
  country_code: number;
  country_name: string;
  phone_number: string;
  cost_price_usd: number;
  sell_price_inr: number;
  sms_code: string | null;
  sms_text: string | null;
  status: OrderStatus;
  tiger_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingRule {
  id: string;
  service_code: string | null;
  country_code: number | null;
  markup_type: MarkupType;
  markup_value: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformSettings {
  usd_to_inr_rate: number;
  default_markup_percentage: number;
  min_deposit_inr: number;
  max_deposit_inr: number;
  platform_name: string;
  maintenance_mode: boolean;
}

// ─── API Response Types ───

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ServiceWithPrice {
  code: string;
  name: string;
  minPriceInr: number;
  countriesAvailable: number;
  icon?: string;
}

export interface CountryWithPrice {
  id: number;
  name: string;
  priceInr: number;
  available: number;
}

export interface BuyNumberRequest {
  service: string;
  country: number;
}

export interface BuyNumberResponse {
  orderId: string;
  activationId: string;
  phoneNumber: string;
  priceInr: number;
  serviceName: string;
  countryName: string;
}

export interface OrderStatusResponse {
  orderId: string;
  status: OrderStatus;
  phoneNumber: string;
  smsCode: string | null;
  smsText: string | null;
  serviceName: string;
  countryName: string;
  priceInr: number;
  createdAt: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  tigerBalance: number;
  ordersToday: number;
  revenueToday: number;
  activeOrders: number;
}
