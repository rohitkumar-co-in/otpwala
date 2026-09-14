import { env } from '../config/env.js';
import type {
  TigerService,
  TigerCountry,
  TigerPriceV3,
  TigerActivation,
  TigerStatusV2,
  TigerNumberV2Response,
} from '@otpwala/shared';

const BASE_URL = env.TIGER_SMS_BASE_URL;
const API_KEY = env.TIGER_SMS_API_KEY;

/**
 * Tiger SMS API Client
 * All requests go through /stubs/handler_api.php?action=<name>&api_key=<key>
 */
class TigerSmsClient {
  private async request(action: string, params: Record<string, string | number | boolean> = {}): Promise<string> {
    const url = new URL('/stubs/handler_api.php', BASE_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('api_key', API_KEY);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': '*/*' },
      signal: AbortSignal.timeout(4000),
    });

    const text = (await response.text()).trim();

    // Check for auth errors
    if (text === 'BAD_KEY') {
      throw new TigerSmsError('BAD_KEY', 'Invalid Tiger SMS API key');
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
      // Some responses are plain-text errors even when we expect JSON
      throw new TigerSmsError(text, `Unexpected response from ${action}: ${text}`);
    }
  }

  // ─── Account ───

  async getBalance(): Promise<{ balance: string; currency: number }> {
    return this.requestJson('getBalance', { format: 'json' });
  }

  // ─── Catalog ───

  async getServicesList(lang = 'en'): Promise<TigerService[]> {
    const result = await this.requestJson<{ status: string; services: TigerService[] }>(
      'getServicesList',
      { lang }
    );
    return result.services || [];
  }

  async getCountries(): Promise<TigerCountry[]> {
    return this.requestJson<TigerCountry[]>('getCountries');
  }

  // ─── Pricing ───

  async getPrices(
    service?: string,
    country?: number
  ): Promise<Record<string, Record<string, { cost: string | number; count: number }>>> {
    const params: Record<string, string | number> = {};
    if (service) params.service = service;
    if (country !== undefined) params.country = country;
    return this.requestJson('getPrices', params);
  }

  async getPricesV3(
    service: string,
    country: number
  ): Promise<Record<string, Record<string, TigerPriceV3>>> {
    return this.requestJson('getPricesV3', { service, country });
  }

  async getFreePrices(
    service?: string,
    country?: number
  ): Promise<Record<string, Record<string, {
    prices: Record<string, number>;
    has_multi: Record<string, boolean>;
    saleAveragePrice?: number;
  }>>> {
    const params: Record<string, string | number> = {};
    if (service) params.service = service;
    if (country !== undefined) params.country = country;
    return this.requestJson('getFreePrices', params);
  }

  async getServiceNumbersCount(service: string): Promise<{ countryCode: string; numbersCount: number }[]> {
    return this.requestJson('getServiceNumbersCount', { service });
  }

  // ─── Number Purchase ───

  /**
   * Purchase a number — V1 plain-text response
   * Success: "ACCESS_NUMBER:{activationId}:{phoneNumber}"
   * Errors: NO_NUMBERS, NO_BALANCE, BAD_SERVICE, BAD_COUNTRY, etc.
   */
  async getNumber(
    service: string,
    country: number,
    options?: { maxPrice?: number; multiple?: boolean }
  ): Promise<{ activationId: string; phoneNumber: string }> {
    const params: Record<string, string | number | boolean> = { service, country };
    if (options?.maxPrice) params.maxPrice = options.maxPrice;
    if (options?.multiple !== undefined) params.multiple = options.multiple;

    const text = await this.request('getNumber', params);

    if (text.startsWith('ACCESS_NUMBER:')) {
      const parts = text.split(':');
      return {
        activationId: parts[1],
        phoneNumber: parts[2],
      };
    }

    // Error responses
    throw new TigerSmsError(text, this.getErrorMessage(text));
  }

  /**
   * Purchase a number — V2 JSON response
   */
  async getNumberV2(
    service: string,
    country: number,
    options?: { maxPrice?: number; multiple?: boolean }
  ): Promise<TigerNumberV2Response> {
    const params: Record<string, string | number | boolean> = { service, country };
    if (options?.maxPrice) params.maxPrice = options.maxPrice;
    if (options?.multiple !== undefined) params.multiple = options.multiple;

    // getNumberV2 can return JSON error envelope or plain-text errors
    const text = await this.request('getNumberV2', params);

    try {
      const json = JSON.parse(text);
      // Check if it's an error envelope
      if (json.title) {
        throw new TigerSmsError(json.title, json.details || json.title);
      }
      return json as TigerNumberV2Response;
    } catch (e) {
      if (e instanceof TigerSmsError) throw e;
      // Plain-text error
      throw new TigerSmsError(text, this.getErrorMessage(text));
    }
  }

  // ─── Status ───

  /**
   * Poll activation status — V1 plain-text
   * STATUS_WAIT_CODE — waiting
   * STATUS_WAIT_RETRY:code — code received, awaiting retry decision
   * STATUS_OK:code — code delivered
   * ACCESS_CANCEL — cancelled
   */
  async getStatus(activationId: string): Promise<{ status: string; code?: string }> {
    const text = await this.request('getStatus', { id: activationId });

    if (text === 'STATUS_WAIT_CODE') {
      return { status: 'STATUS_WAIT_CODE' };
    }
    if (text.startsWith('STATUS_WAIT_RETRY:')) {
      return { status: 'STATUS_WAIT_RETRY', code: text.split(':')[1] };
    }
    if (text.startsWith('STATUS_OK:')) {
      return { status: 'STATUS_OK', code: text.split(':')[1] };
    }
    if (text === 'ACCESS_CANCEL') {
      return { status: 'ACCESS_CANCEL' };
    }
    if (text === 'NO_ACTIVATION') {
      throw new TigerSmsError('NO_ACTIVATION', 'Activation not found');
    }

    throw new TigerSmsError(text, `Unexpected status response: ${text}`);
  }

  /**
   * Poll activation status — V2 JSON response
   */
  async getStatusV2(activationId: string): Promise<TigerStatusV2> {
    return this.requestJson<TigerStatusV2>('getStatusV2', { id: activationId });
  }

  // ─── Status Management ───

  /**
   * Change activation status
   * 1 = ACCESS_READY (set ready to receive SMS)
   * 3 = ACCESS_RETRY_GET (request another SMS)
   * 6 = ACCESS_ACTIVATION (complete/confirm)
   * 8 = ACCESS_CANCEL (cancel and refund)
   */
  async setStatus(activationId: string, status: 1 | 3 | 6 | 8): Promise<string> {
    const text = await this.request('setStatus', { id: activationId, status });

    const expectedResponse: Record<number, string> = {
      1: 'ACCESS_READY',
      3: 'ACCESS_RETRY_GET',
      6: 'ACCESS_ACTIVATION',
      8: 'ACCESS_CANCEL',
    };
    if (text === expectedResponse[status]) return text;

    if (text === 'NO_ACTIVATION') {
      throw new TigerSmsError('NO_ACTIVATION', 'Activation not found');
    }
    if (text === 'BAD_STATUS') {
      throw new TigerSmsError('BAD_STATUS', 'Invalid status transition');
    }
    if (text === 'EARLY_CANCEL_DENIED') {
      throw new TigerSmsError('EARLY_CANCEL_DENIED', 'Cannot cancel yet — too early');
    }

    throw new TigerSmsError(text, `Unexpected setStatus response: ${text}`);
  }

  // ─── Active Activations ───

  async getActiveActivations(start = 0, limit = 50): Promise<TigerActivation[]> {
    const result = await this.requestJson<{ status: string; data: TigerActivation[] }>(
      'getActiveActivations',
      { start, limit }
    );
    return result.data || [];
  }

  // ─── Helpers ───

  private getErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      'NO_NUMBERS': 'No numbers available for this service/country',
      'NO_BALANCE': 'Carrier inventory temporarily exhausted for this service/country',
      'BAD_SERVICE': 'Invalid or unavailable service',
      'BAD_COUNTRY': 'Invalid or unavailable country',
      'BAD_VALUES': 'Invalid request parameters',
      'BAD_MULTIPLE': 'Invalid multiple parameter',
      'BAD_MAX_PRICE': 'Invalid max price',
      'NO_PROVIDERS': 'No providers available',
      'NO_ACTIVATION': 'Activation not found',
      'BAD_STATUS': 'Invalid status transition',
      'EARLY_CANCEL_DENIED': 'Cannot cancel yet — minimum activation age not met',
    };
    return messages[code] || `Tiger SMS error: ${code}`;
  }
}

export class TigerSmsError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TigerSmsError';
    this.code = code;
  }
}

// Singleton instance
export const tigerSms = new TigerSmsClient();
