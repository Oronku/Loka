import axios from 'axios';

const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY;
const RAPIDAPI_HOST =
  import.meta.env.VITE_RAPIDAPI_HOST || 'currency-converter5.p.rapidapi.com';

if (!RAPIDAPI_KEY) {
  console.warn('VITE_RAPIDAPI_KEY is not set in environment variables');
}

const currencyApi = axios.create({
  baseURL: `https://${RAPIDAPI_HOST}`,
  headers: {
    'x-rapidapi-host': RAPIDAPI_HOST,
    'x-rapidapi-key': RAPIDAPI_KEY,
  },
});

interface CurrencyListResponse {
  currencies: {
    [key: string]: {
      currency_name: string;
      currency_code: string;
      symbol: string;
    };
  };
}

interface ConversionResponse {
  base_currency_code: string;
  base_currency_name: string;
  amount: string;
  updated_date: string;
  rates: {
    [key: string]: {
      currency_name: string;
      rate: string;
      rate_for_amount: string;
    };
  };
  status: string;
}

// Cache for currencies list
let cachedCurrencies: string[] | null = null;

// Cache for conversion rates (key: "FROM_TO", value: rate)
const conversionCache: Map<string, { rate: number; timestamp: number }> =
  new Map();
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Fetch list of available currencies
 */
export async function getCurrencyList(): Promise<string[]> {
  if (cachedCurrencies) {
    return cachedCurrencies;
  }

  try {
    const response = await currencyApi.get<CurrencyListResponse>(
      '/currency/list',
      {
        params: {
          format: 'json',
          language: 'en',
        },
      }
    );

    if (response.data && response.data.currencies) {
      cachedCurrencies = Object.keys(response.data.currencies);
      return cachedCurrencies;
    }

    // Fallback to common currencies
    return ['USD', 'EUR', 'GBP', 'ILS', 'JPY', 'CAD', 'AUD', 'CHF'];
  } catch (error) {
    console.error('Error fetching currency list:', error);
    // Return common currencies as fallback
    return ['USD', 'EUR', 'GBP', 'ILS', 'JPY', 'CAD', 'AUD', 'CHF'];
  }
}

/**
 * Convert amount from one currency to another
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency code (e.g., 'USD')
 * @param toCurrency - Target currency code (e.g., 'EUR')
 * @returns Converted amount
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  // If same currency, no conversion needed
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const cacheKey = `${fromCurrency}_${toCurrency}`;
  const cached = conversionCache.get(cacheKey);

  // Check if we have a valid cached rate
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return amount * cached.rate;
  }

  try {
    const response = await currencyApi.get<ConversionResponse>(
      '/currency/convert',
      {
        params: {
          format: 'json',
          from: fromCurrency,
          to: toCurrency,
          amount: 1, // Get rate for 1 unit
        },
      }
    );

    if (
      response.data &&
      response.data.rates &&
      response.data.rates[toCurrency]
    ) {
      const rate = parseFloat(response.data.rates[toCurrency].rate);

      // Cache the rate
      conversionCache.set(cacheKey, {
        rate,
        timestamp: Date.now(),
      });

      return amount * rate;
    }

    throw new Error('Invalid response from currency API');
  } catch (error) {
    console.error(`Error converting ${fromCurrency} to ${toCurrency}:`, error);

    // Fallback: use approximate rates if API fails
    const fallbackRates: { [key: string]: number } = {
      USD_EUR: 0.92,
      GBP_EUR: 1.17,
      ILS_EUR: 0.25,
      JPY_EUR: 0.0062,
      CAD_EUR: 0.68,
      AUD_EUR: 0.61,
      CHF_EUR: 1.05,
    };

    const fallbackKey = `${fromCurrency}_${toCurrency}`;
    const reverseKey = `${toCurrency}_${fromCurrency}`;

    if (fallbackRates[fallbackKey]) {
      return amount * fallbackRates[fallbackKey];
    } else if (fallbackRates[reverseKey]) {
      return amount / fallbackRates[reverseKey];
    }

    // If no rate found, return original amount
    console.warn(
      `No conversion rate found for ${fromCurrency} to ${toCurrency}, returning original amount`
    );
    return amount;
  }
}

/**
 * Convert multiple amounts to a target currency
 * @param amounts - Array of {amount, currency} objects
 * @param targetCurrency - Target currency code
 * @returns Total in target currency
 */
export async function convertMultipleCurrencies(
  amounts: Array<{ amount: number; currency: string }>,
  targetCurrency: string
): Promise<number> {
  const conversions = await Promise.all(
    amounts.map((item) =>
      convertCurrency(item.amount, item.currency, targetCurrency)
    )
  );

  return conversions.reduce((sum, val) => sum + val, 0);
}

/**
 * Format currency amount with symbol
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const symbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    ILS: '₪',
    JPY: '¥',
    CAD: 'CA$',
    AUD: 'A$',
    CHF: 'CHF',
  };

  const symbol = symbols[currencyCode] || currencyCode;
  return `${symbol}${amount.toFixed(2)}`;
}
