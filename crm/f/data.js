const ZONES = ['SEA', 'APAC', 'MENA', 'LATM', 'CIS', 'Europe', 'Africa', 'Canada', 'United States'];
const COUNTRIES = {
  CA: ['Canada', 'Canada'], US: ['United States', 'United States'],
  BR: ['Brazil', 'LATM'], MX: ['Mexico', 'LATM'], AR: ['Argentina', 'LATM'], CL: ['Chile', 'LATM'], PE: ['Peru', 'LATM'],
  DE: ['Germany', 'Europe'], FR: ['France', 'Europe'], ES: ['Spain', 'Europe'], IT: ['Italy', 'Europe'], NL: ['Netherlands', 'Europe'], PL: ['Poland', 'Europe'], SE: ['Sweden', 'Europe'], GB: ['United Kingdom', 'Europe'], IE: ['Ireland', 'Europe'], AT: ['Austria', 'Europe'], FI: ['Finland', 'Europe'],
  RU: ['Russia', 'CIS'], KZ: ['Kazakhstan', 'CIS'], UA: ['Ukraine', 'CIS'], UZ: ['Uzbekistan', 'CIS'], AZ: ['Azerbaijan', 'CIS'],
  AE: ['United Arab Emirates', 'MENA'], SA: ['Saudi Arabia', 'MENA'], TR: ['Turkey', 'MENA'], EG: ['Egypt', 'MENA'], MA: ['Morocco', 'MENA'],
  NG: ['Nigeria', 'Africa'], ZA: ['South Africa', 'Africa'], KE: ['Kenya', 'Africa'], GH: ['Ghana', 'Africa'],
  TH: ['Thailand', 'SEA'], VN: ['Vietnam', 'SEA'], ID: ['Indonesia', 'SEA'], PH: ['Philippines', 'SEA'], MY: ['Malaysia', 'SEA'],
  IN: ['India', 'APAC'], JP: ['Japan', 'APAC'], KR: ['South Korea', 'APAC'], AU: ['Australia', 'APAC'], NZ: ['New Zealand', 'APAC'], BD: ['Bangladesh', 'APAC'],
};
const zoneOf = code => (COUNTRIES[code] || [code, ''])[1];
const zonesOf = codes => ZONES.filter(z => codes.some(c => zoneOf(c) === z));
const inZone = z => Object.keys(COUNTRIES).filter(c => zoneOf(c) === z);
const ALL_SEGMENTS = ['REGISTERED', 'NO_DEPOSIT', 'KYC_VERIFIED', 'FIRST_DEP', 'VIP', 'HIGH_ROLLER', 'MOBILE'];
const METHODS = ['Visa', 'MasterCard', 'Apple Pay', 'Google Pay', 'Bank transfer', 'SEPA', 'Open banking', 'E-wallet', 'Prepaid voucher', 'UPI', 'Paytm', 'QR Code', 'Pix', 'Crypto', 'Mobile money', 'Interac', 'ACH'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'INR', 'BRL', 'MXN', 'TRY', 'AED', 'NGN', 'KES', 'ZAR', 'THB', 'VND', 'IDR', 'PHP', 'JPY', 'AUD', 'RUB', 'KZT', 'USDT', 'BTC'];
const EU = ['DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'SE', 'IE', 'AT', 'FI'];
const CONN = { online: 'Connected', degraded: 'Degraded', offline: 'Disconnected' };
const DECLINE_REASONS = ['Insufficient funds', 'Do not honor', '3-D Secure failed', 'Suspected fraud', 'Issuer unavailable', 'Expired card', 'Any decline'];
const TX_STATUSES = ['Approved', 'Declined', 'Pending', 'Refunded', 'Chargeback'];
const TX_TYPES = ['Deposit', 'Withdrawal', 'Refund'];
const TX_DAY = 864e5;
const WALLET_TYPES = ['Real', 'Bonus'];
const WALLET_TX_TYPES = ['Deposit', 'Withdrawal', 'Bet', 'Win', 'Bonus granted', 'Bonus wagering', 'Bonus cancelled', 'Adjustment'];
const BRAND_SETTINGS_FIELDS = {
  Stripe: [
    { k: 'account_id', label: NexLuckI18n.t("Stripe Account ID") },
    { k: 'secret_key', label: NexLuckI18n.t("Secret API Key"), secret: true },
    { k: 'webhook_secret', label: NexLuckI18n.t("Webhook Signing Secret"), secret: true },
    { k: 'terminal_id', label: NexLuckI18n.t("Terminal / Reader ID") },
  ],
  Adyen: [
    { k: 'merchant_account', label: NexLuckI18n.t("Merchant Account") },
    { k: 'api_key', label: NexLuckI18n.t("Adyen Web API Key"), secret: true },
    { k: 'live_url_prefix', label: NexLuckI18n.t("Live Endpoint Prefix") },
    { k: 'hmac_key', label: NexLuckI18n.t("HMAC Webhook Key"), secret: true },
  ],
  'Checkout.com': [
    { k: 'channel_id', label: NexLuckI18n.t("Processing Channel ID") },
    { k: 'secret_key', label: NexLuckI18n.t("Secret Key"), secret: true },
    { k: 'public_key', label: NexLuckI18n.t("Public Key") },
    { k: 'mcc', label: NexLuckI18n.t("Merchant Category Code (MCC)") },
  ],
  Trustly: [
    { k: 'username', label: NexLuckI18n.t("Trustly API Username") },
    { k: 'password', label: NexLuckI18n.t("Password"), secret: true },
    { k: 'private_key', label: NexLuckI18n.t("RSA Private Key (PEM)"), secret: true },
  ],
  Razorpay: [
    { k: 'key_id', label: NexLuckI18n.t("Key ID") },
    { k: 'key_secret', label: NexLuckI18n.t("Key Secret"), secret: true },
    { k: 'vpa', label: NexLuckI18n.t("Merchant VPA (UPI handle)") },
  ],
  EBANX: [
    { k: 'integration_key', label: NexLuckI18n.t("Integration Key"), secret: true },
    { k: 'pix_key', label: NexLuckI18n.t("Pix Key / CNPJ") },
  ],
  CoinsPaid: [
    { k: 'api_key', label: NexLuckI18n.t("CoinsPaid API Key"), secret: true },
    { k: 'secret', label: NexLuckI18n.t("CoinsPaid Secret"), secret: true },
    { k: 'deposit_callback', label: NexLuckI18n.t("Deposit Callback URL") },
  ],
};

function defaultSettingsForBrand(brand) {
  const fields = BRAND_SETTINGS_FIELDS[brand] || [{ k: 'merchant_id' }, { k: 'api_key' }, { k: 'endpoint_url' }];
  return Object.fromEntries(fields.map(field => [field.k, '']));
}

// Runtime business records are installed only from the authenticated casino response.
let PAYMENT_CONNECTIONS = [], GATEWAYS = [], CASCADES = [], WALLETS = [], WALLET_TX = [], TRANSACTIONS = [], PLAYERS = [], DEMO_GAME_CATALOG = [];
function installFinanceData(payload) {
  const keys = ['connections', 'gateways', 'cascades', 'wallets', 'wallet_transactions', 'transactions', 'players', 'game_catalog'];
  if (!payload || keys.some(key => !Array.isArray(payload[key]))) throw new Error(NexLuckI18n.t("Invalid finance response"));
  const records = keys.map(key => JSON.parse(JSON.stringify(payload[key])));
  [PAYMENT_CONNECTIONS, GATEWAYS, CASCADES, WALLETS, WALLET_TX, TRANSACTIONS, PLAYERS, DEMO_GAME_CATALOG] = records;
}
window.installFinanceData = installFinanceData;

async function saveFinanceRecord(resource, record) {
  const { id, casino_id, created_at, updated_at, ...body } = record;
  const response = await CRMContext.fetch('/crm/ui-api/v1/finance/' + resource + (id ? '/' + encodeURIComponent(id) : ''), {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload;
  try { payload = await response.json(); } catch (_) { throw new Error(NexLuckI18n.t("Finance server returned an invalid response.")); }
  if (!response.ok) {
    const details = payload.errors || payload.fields;
    throw new Error(details ? Object.entries(details).map(([key, value]) => `${key}: ${value}`).join('; ') : (payload.message || payload.error || 'Could not save finance configuration.'));
  }
  const saved = payload.data || payload;
  if (!saved || !saved.id || saved.name !== body.name) throw new Error(NexLuckI18n.t("Finance server did not confirm the saved record."));
  return saved;
}

const txLogs = transaction => transaction.logs || [];
