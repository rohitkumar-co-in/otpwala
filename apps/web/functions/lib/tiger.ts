import { getConfig } from './config';

export class TigerSmsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'TigerSmsError';
  }
}

export class TigerSmsClient {
  constructor(private env?: any) {}

  private async request(action: string, params: Record<string, string | number | boolean> = {}): Promise<string> {
    const conf = getConfig(this.env);
    const url = new URL('/stubs/handler_api.php', conf.TIGER_SMS_BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('api_key', conf.TIGER_SMS_API_KEY);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': '*/*' },
      signal: AbortSignal.timeout(action === 'getServicesList' ? 15_000 : 4000),
    });

    const text = (await response.text()).trim();

    if (text === 'BAD_KEY') {
      throw new TigerSmsError('SERVICE_CONFIGURATION_ERROR', 'Service configuration error');
    }
    if (text === 'BAD_ACTION') {
      throw new TigerSmsError('BAD_ACTION', `Unknown action: ${action}`);
    }

    return text;
  }

  private async requestJson<T>(action: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const text = await this.request(action, params);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new TigerSmsError(text, `Unexpected response from ${action}: ${text}`);
    }
  }

  async getBalance(): Promise<{ balance: string; currency: number }> {
    return this.requestJson('getBalance', { format: 'json' });
  }

  async getServicesList(lang = 'en'): Promise<{ code: string; name: string }[]> {
    const result = await this.requestJson<{ status: string; services: { code: string; name: string }[] }>(
      'getServicesList',
      { lang }
    );
    return result.services || [];
  }

  async getCountries(): Promise<any[]> {
    const result = await this.requestJson<any>('getCountries');
    return Array.isArray(result) ? result : (result?.countries || []);
  }

  async getPrices(service?: string, country?: number): Promise<Record<string, Record<string, { cost: string | number; count: number }>>> {
    const params: Record<string, string | number> = {};
    if (service) params.service = service;
    if (country !== undefined) params.country = country;
    return this.requestJson('getPrices', params);
  }

  async getPricesV3(service?: string, country?: number): Promise<Record<string, Record<string, { price: number; count: number }>>> {
    const params: Record<string, string | number> = {};
    if (service) params.service = service;
    if (country !== undefined) params.country = country;
    return this.requestJson('getPricesV3', params);
  }

  async getFreePrices(service?: string, country?: number): Promise<Record<string, Record<string, { prices: Record<string, number> }>>> {
    const params: Record<string, string | number> = {};
    if (service) params.service = service;
    if (country !== undefined) params.country = country;
    return this.requestJson('getFreePrices', params);
  }

  async getNumber(service: string, country: number, maxPrice: number): Promise<{ activationId: string; phoneNumber: string }> {
    if (!Number.isFinite(maxPrice) || maxPrice <= 0) throw new Error('Invalid provider price limit');
    const text = await this.request('getNumber', { service, country, maxPrice });
    const match = text.match(/^ACCESS_NUMBER:(\d+):(\+?\d+)$/);
    if (match) {
      return { activationId: match[1], phoneNumber: match[2] };
    }
    if (text === 'NO_NUMBERS') throw new TigerSmsError('NO_NUMBERS', 'No numbers available right now');
    if (text === 'NO_BALANCE') throw new TigerSmsError('PROVIDER_OUT_OF_STOCK', 'Carrier numbers temporarily unavailable for this service/country. Please choose another country.');
    throw new TigerSmsError(text, `Failed to get number: ${text}`);
  }

  async getStatus(activationId: string): Promise<{ status: string; code?: string; text?: string }> {
    const response = await this.request('getStatus', { id: activationId });
    if (response === 'STATUS_WAIT_CODE') {
      return { status: 'waiting' };
    }
    const okMatch = response.match(/^STATUS_OK:(.+)$/);
    if (okMatch) {
      const code = okMatch[1];
      return { status: 'code_received', code, text: `Your code is ${code}` };
    }
    const retryMatch = response.match(/^STATUS_WAIT_RETRY:(.+)$/);
    if (retryMatch) {
      const code = retryMatch[1];
      return { status: 'code_received', code, text: `Your code is ${code}` };
    }
    if (response === 'STATUS_CANCEL' || response === 'ACCESS_CANCEL') return { status: 'cancelled' };
    if (response === 'STATUS_ACCESS' || response === 'ACCESS_ACTIVATION') return { status: 'code_received' };
    if (response === 'NO_ACTIVATION') return { status: 'no_activation' };
    return { status: response.toLowerCase() };
  }

  async setStatus(activationId: string, status: number): Promise<string> {
    const text = await this.request('setStatus', { id: activationId, status });
    const expectedResponse: Record<number, string> = {
      1: 'ACCESS_READY',
      3: 'ACCESS_RETRY_GET',
      6: 'ACCESS_ACTIVATION',
      8: 'ACCESS_CANCEL',
    };

    if (text === expectedResponse[status]) return text;

    throw new TigerSmsError(text || 'EMPTY_RESPONSE', text || 'EMPTY_RESPONSE');
  }
}
