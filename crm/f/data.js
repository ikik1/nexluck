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
const zoneOf = (code) => COUNTRIES[code][1];
const zonesOf = (codes) => ZONES.filter((z) => codes.some((c) => zoneOf(c) === z));
const inZone = (z) => Object.keys(COUNTRIES).filter((c) => COUNTRIES[c][1] === z);
const ALL_SEGMENTS = ['REGISTERED', 'NO_DEPOSIT', 'KYC_VERIFIED', 'FIRST_DEP', 'VIP', 'HIGH_ROLLER', 'MOBILE'];
const METHODS = ['Visa', 'MasterCard', 'Apple Pay', 'Google Pay', 'Bank transfer', 'SEPA', 'Open banking', 'E-wallet', 'Prepaid voucher', 'UPI', 'Paytm', 'QR Code', 'Pix', 'Crypto', 'Mobile money', 'Interac', 'ACH'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'INR', 'BRL', 'MXN', 'TRY', 'AED', 'NGN', 'KES', 'ZAR', 'THB', 'VND', 'IDR', 'PHP', 'JPY', 'AUD', 'RUB', 'KZT', 'USDT', 'BTC'];
const EU = ['DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'SE', 'IE', 'AT', 'FI'];
const GATEWAYS = [
  { id: 1, brand: 'Stripe', desc: 'term 101 for highrisk', methods: ['Visa', 'MasterCard', 'Apple Pay', 'Google Pay'], currencies: ['EUR', 'USD', 'GBP'], countries: [...EU, 'GB'], segments: ['REGISTERED', 'KYC_VERIFIED'], conn: 'online' },
  { id: 2, brand: 'Adyen', desc: 'enterprise acquirer, global cards', methods: ['Visa', 'MasterCard', 'Apple Pay'], currencies: ['EUR', 'USD', 'GBP', 'AUD'], countries: ['DE', 'FR', 'NL', 'GB', 'AU', 'NZ', 'SE'], segments: ['REGISTERED', 'FIRST_DEP', 'KYC_VERIFIED'], conn: 'online' },
  { id: 3, brand: 'Checkout.com', desc: 'cards and local payments, gambling MCC 7995', methods: ['Visa', 'MasterCard', 'Google Pay'], currencies: ['EUR', 'USD', 'AED', 'TRY'], countries: ['AE', 'SA', 'TR', 'DE', 'FR'], segments: ['REGISTERED', 'MOBILE'], conn: 'degraded' },
  { id: 4, brand: 'Trustly', desc: 'pay-n-play open banking', methods: ['Open banking', 'Bank transfer'], currencies: ['EUR', 'SEK', 'GBP'], countries: ['SE', 'FI', 'DE', 'AT', 'ES', 'GB'], segments: ['NO_DEPOSIT', 'FIRST_DEP'], conn: 'online' },
  { id: 5, brand: 'Skrill', desc: 'e-wallet, VIP limits', methods: ['E-wallet'], currencies: ['EUR', 'USD', 'GBP', 'CAD'], countries: ['DE', 'GB', 'IE', 'CA', 'ES', 'IT'], segments: ['VIP', 'HIGH_ROLLER'], conn: 'online' },
  { id: 6, brand: 'Neteller', desc: 'e-wallet, VIP limits', methods: ['E-wallet'], currencies: ['EUR', 'USD', 'GBP'], countries: ['DE', 'GB', 'IE', 'IT', 'ES', 'PL'], segments: ['VIP', 'REGISTERED'], conn: 'online' },
  { id: 7, brand: 'Razorpay', desc: 'UPI and wallets for India', methods: ['UPI', 'Paytm', 'QR Code'], currencies: ['INR'], countries: ['IN'], segments: ['REGISTERED', 'MOBILE', 'FIRST_DEP'], conn: 'online' },
  { id: 8, brand: 'PayU', desc: 'India cards and netbanking', methods: ['Visa', 'MasterCard', 'UPI'], currencies: ['INR', 'PLN'], countries: ['IN', 'PL'], segments: ['REGISTERED'], conn: 'degraded' },
  { id: 9, brand: 'EBANX', desc: 'Pix and local cards for LATAM', methods: ['Pix', 'Visa', 'MasterCard'], currencies: ['BRL', 'MXN', 'USD'], countries: ['BR', 'MX', 'AR', 'CL', 'PE'], segments: ['REGISTERED', 'MOBILE', 'FIRST_DEP'], conn: 'online' },
  { id: 10, brand: 'AstroPay', desc: 'prepaid voucher and wallet, LATAM', methods: ['Prepaid voucher', 'E-wallet'], currencies: ['BRL', 'MXN', 'USD'], countries: ['BR', 'MX', 'AR', 'CL', 'PE'], segments: ['NO_DEPOSIT', 'REGISTERED'], conn: 'online' },
  { id: 11, brand: 'Interac', desc: 'Canadian online banking', methods: ['Interac', 'Bank transfer'], currencies: ['CAD'], countries: ['CA'], segments: ['REGISTERED', 'KYC_VERIFIED'], conn: 'online' },
  { id: 12, brand: 'Nuvei', desc: 'cards and ACH, US and Canada', methods: ['Visa', 'MasterCard', 'ACH'], currencies: ['USD', 'CAD'], countries: ['US', 'CA'], segments: ['REGISTERED', 'FIRST_DEP'], conn: 'online' },
  { id: 13, brand: 'Plaid ACH', desc: 'instant bank link, United States', methods: ['ACH', 'Bank transfer'], currencies: ['USD'], countries: ['US'], segments: ['KYC_VERIFIED', 'REGISTERED'], conn: 'offline' },
  { id: 14, brand: 'CoinsPaid', desc: 'crypto processing, BTC USDT', methods: ['Crypto'], currencies: ['USDT', 'BTC', 'EUR'], countries: [...EU, 'TR', 'AE', 'BR', 'NG'], segments: ['HIGH_ROLLER', 'VIP', 'NO_DEPOSIT'], conn: 'online' },
  { id: 15, brand: 'Paystack', desc: 'Nigeria and Ghana cards and bank', methods: ['Visa', 'MasterCard', 'Bank transfer'], currencies: ['NGN', 'USD'], countries: ['NG', 'GH'], segments: ['REGISTERED', 'MOBILE'], conn: 'online' },
  { id: 16, brand: 'M-Pesa', desc: 'mobile money, East Africa', methods: ['Mobile money'], currencies: ['KES'], countries: ['KE'], segments: ['MOBILE', 'REGISTERED'], conn: 'degraded' },
  { id: 17, brand: 'Fawry', desc: 'cash and wallet payments in Egypt', methods: ['Prepaid voucher', 'E-wallet'], currencies: ['USD'], countries: ['EG', 'MA'], segments: ['REGISTERED'], conn: 'online' },
  { id: 18, brand: 'PayTR', desc: 'Turkey cards and bank transfer, highrisk', methods: ['Visa', 'MasterCard', 'Bank transfer'], currencies: ['TRY'], countries: ['TR'], segments: ['REGISTERED', 'FIRST_DEP'], conn: 'online' },
  { id: 19, brand: 'Network International', desc: 'Gulf acquirer', methods: ['Visa', 'MasterCard'], currencies: ['AED', 'USD'], countries: ['AE', 'SA'], segments: ['KYC_VERIFIED', 'VIP'], conn: 'offline' },
  { id: 20, brand: 'GCash', desc: 'Philippines e-wallet', methods: ['E-wallet', 'QR Code'], currencies: ['PHP'], countries: ['PH'], segments: ['MOBILE', 'REGISTERED'], conn: 'online' },
  { id: 21, brand: 'Momo', desc: 'Vietnam wallet and QR bank', methods: ['E-wallet', 'QR Code'], currencies: ['VND'], countries: ['VN'], segments: ['MOBILE', 'FIRST_DEP'], conn: 'online' },
  { id: 22, brand: 'Xendit', desc: 'Indonesia and Thailand, QR and bank', methods: ['QR Code', 'Bank transfer', 'E-wallet'], currencies: ['IDR', 'THB'], countries: ['ID', 'TH', 'MY'], segments: ['REGISTERED', 'MOBILE'], conn: 'online' },
  { id: 23, brand: 'PayPay', desc: 'Japan QR wallet', methods: ['QR Code', 'E-wallet'], currencies: ['JPY'], countries: ['JP'], segments: ['REGISTERED'], conn: 'degraded' },
  { id: 24, brand: 'Payeer', desc: 'CIS e-wallet and cards', methods: ['E-wallet', 'Visa', 'MasterCard'], currencies: ['RUB', 'KZT', 'USD'], countries: ['RU', 'KZ', 'UA', 'UZ', 'AZ'], segments: ['REGISTERED', 'NO_DEPOSIT'], conn: 'online' },
  { id: 25, brand: 'Paysafecard', desc: 'prepaid voucher, low limits', methods: ['Prepaid voucher'], currencies: ['EUR', 'GBP', 'USD'], countries: ['DE', 'AT', 'IT', 'ES', 'GB', 'CA'], segments: ['NO_DEPOSIT', 'REGISTERED'], conn: 'online' },
  { id: 26, brand: 'Rapyd', desc: 'global local-methods aggregator', methods: ['Bank transfer', 'E-wallet', 'Visa'], currencies: ['EUR', 'USD', 'ZAR', 'INR'], countries: ['ZA', 'IN', 'BD', 'KR', 'AU'], segments: ['REGISTERED', 'KYC_VERIFIED'], conn: 'online' },
];
const BRAND_SETTINGS_FIELDS = {
  'Stripe': [
    { k: 'account_id', label: 'Stripe Account ID', placeholder: 'acct_1N0AbcXYZ', def: 'acct_1N8482Stripe' },
    { k: 'secret_key', label: 'Secret API Key', placeholder: 'sk_live_...', def: 'sk_live_51M0...92jK', secret: true },
    { k: 'webhook_secret', label: 'Webhook Signing Secret', placeholder: 'whsec_...', def: 'whsec_9b2a...77' },
    { k: 'terminal_id', label: 'Terminal / Reader ID', placeholder: 'tm_101_highrisk', def: 'tm_101_highrisk' },
  ],
  'Adyen': [
    { k: 'merchant_account', label: 'Merchant Account', placeholder: 'NextLuckECOM', def: 'NextLuck_EUR' },
    { k: 'api_key', label: 'Adyen Web API Key', placeholder: 'AQEyhm...', def: 'AQEyhm...K92z', secret: true },
    { k: 'live_url_prefix', label: 'Live Endpoint Prefix', placeholder: '1797a7906aade9e3-NextLuck', def: '1797a7906-NextLuck' },
    { k: 'hmac_key', label: 'HMAC Webhook Key', placeholder: '4A3F...', def: '4A3F...B91E', secret: true },
  ],
  'Checkout.com': [
    { k: 'channel_id', label: 'Processing Channel ID', placeholder: 'pc_xyz123', def: 'pc_mcc7995_eu' },
    { k: 'secret_key', label: 'Secret Key', placeholder: 'sk_sbox_...', def: 'sk_live_c4...9a', secret: true },
    { k: 'public_key', label: 'Public Key', placeholder: 'pk_sbox_...', def: 'pk_live_81...0f' },
    { k: 'mcc', label: 'Merchant Category Code (MCC)', placeholder: '7995', def: '7995' },
  ],
  'Trustly': [
    { k: 'username', label: 'Trustly API Username', placeholder: 'nextluck_trustly', def: 'nextluck_eu' },
    { k: 'password', label: 'Password', placeholder: '••••••••', def: 'tr_sec_9918', secret: true },
    { k: 'private_key', label: 'RSA Private Key (PEM)', placeholder: '-----BEGIN RSA PRIVATE KEY-----', def: 'rsa_key_loaded' },
  ],
  'Razorpay': [
    { k: 'key_id', label: 'Key ID', placeholder: 'rzp_live_...', def: 'rzp_live_IN9921' },
    { k: 'key_secret', label: 'Key Secret', placeholder: '••••••••', def: 'rzp_sec_k291', secret: true },
    { k: 'vpa', label: 'Merchant VPA (UPI handle)', placeholder: 'nextluck@razorpay', def: 'nextluck@icici' },
  ],
  'EBANX': [
    { k: 'integration_key', label: 'Integration Key', placeholder: '••••••••', def: 'ebx_live_br_441', secret: true },
    { k: 'pix_key', label: 'Pix Key / CNPJ', placeholder: '12.345.678/0001-90', def: '48.910.223/0001-55' },
  ],
  'CoinsPaid': [
    { k: 'api_key', label: 'CoinsPaid API Key', placeholder: '••••••••', def: 'cp_api_live_881', secret: true },
    { k: 'secret', label: 'CoinsPaid Secret', placeholder: '••••••••', def: 'cp_sec_281a', secret: true },
    { k: 'deposit_callback', label: 'Deposit Callback URL', placeholder: 'https://...', def: 'https://api.nexluck.com/cb/coinspaid' },
  ],
};

function defaultSettingsForBrand(brand) {
  const fields = BRAND_SETTINGS_FIELDS[brand] || [
    { k: 'merchant_id', label: 'Merchant / Terminal ID', placeholder: 'mid_123', def: 'mid_' + brand.toLowerCase().replace(/[^a-z0-9]/g, '') + '_01' },
    { k: 'api_key', label: 'API / Secret Key', placeholder: '••••••••', def: 'key_live_' + brand.toLowerCase().replace(/[^a-z0-9]/g, ''), secret: true },
    { k: 'endpoint_url', label: 'Gateway Endpoint', placeholder: 'https://api...', def: 'https://api.' + brand.toLowerCase().replace(/[^a-z0-9]/g, '') + '.example/v2' },
  ];
  const obj = {};
  fields.forEach(f => { obj[f.k] = f.def || ''; });
  return obj;
}

const INITIAL_CONNECTIONS = [
  { id: 1, name: 'Stripe terminal 101 for highrisk', brand: 'Stripe', currency: 'EUR', methods: ['Visa', 'MasterCard', 'Apple Pay', 'Google Pay'], countries: [...EU, 'GB'], segments: ['REGISTERED', 'KYC_VERIFIED'], conn: 'online', settings: defaultSettingsForBrand('Stripe') },
  { id: 2, name: 'Adyen global cards primary', brand: 'Adyen', currency: 'EUR', methods: ['Visa', 'MasterCard', 'Apple Pay'], countries: ['DE', 'FR', 'NL', 'GB', 'AU', 'NZ', 'SE'], segments: ['REGISTERED', 'FIRST_DEP', 'KYC_VERIFIED'], conn: 'online', settings: defaultSettingsForBrand('Adyen') },
  { id: 3, name: 'Checkout.com highrisk MCC 7995', brand: 'Checkout.com', currency: 'USD', methods: ['Visa', 'MasterCard', 'Google Pay'], countries: ['AE', 'SA', 'TR', 'DE', 'FR'], segments: ['REGISTERED', 'MOBILE'], conn: 'degraded', settings: defaultSettingsForBrand('Checkout.com') },
  { id: 4, name: 'Trustly pay-n-play Europe', brand: 'Trustly', currency: 'EUR', methods: ['Open banking', 'Bank transfer'], countries: ['SE', 'FI', 'DE', 'AT', 'ES', 'GB'], segments: ['NO_DEPOSIT', 'FIRST_DEP'], conn: 'online', settings: defaultSettingsForBrand('Trustly') },
  { id: 5, name: 'Skrill VIP e-wallet', brand: 'Skrill', currency: 'EUR', methods: ['E-wallet'], countries: ['DE', 'GB', 'IE', 'CA', 'ES', 'IT'], segments: ['VIP', 'HIGH_ROLLER'], conn: 'online', settings: defaultSettingsForBrand('Skrill') },
  { id: 6, name: 'Neteller VIP e-wallet', brand: 'Neteller', currency: 'USD', methods: ['E-wallet'], countries: ['DE', 'GB', 'IE', 'IT', 'ES', 'PL'], segments: ['VIP', 'REGISTERED'], conn: 'online', settings: defaultSettingsForBrand('Neteller') },
  { id: 7, name: 'Razorpay UPI & Paytm instant', brand: 'Razorpay', currency: 'INR', methods: ['UPI', 'Paytm', 'QR Code'], countries: ['IN'], segments: ['REGISTERED', 'MOBILE', 'FIRST_DEP'], conn: 'online', settings: defaultSettingsForBrand('Razorpay') },
  { id: 8, name: 'PayU India & Poland netbanking', brand: 'PayU', currency: 'INR', methods: ['Visa', 'MasterCard', 'UPI'], countries: ['IN', 'PL'], segments: ['REGISTERED'], conn: 'degraded', settings: defaultSettingsForBrand('PayU') },
  { id: 9, name: 'EBANX Pix & local cards Brazil', brand: 'EBANX', currency: 'BRL', methods: ['Pix', 'Visa', 'MasterCard'], countries: ['BR', 'MX', 'AR', 'CL', 'PE'], segments: ['REGISTERED', 'MOBILE', 'FIRST_DEP'], conn: 'online', settings: defaultSettingsForBrand('EBANX') },
  { id: 10, name: 'AstroPay prepaid LATAM', brand: 'AstroPay', currency: 'USD', methods: ['Prepaid voucher', 'E-wallet'], countries: ['BR', 'MX', 'AR', 'CL', 'PE'], segments: ['NO_DEPOSIT', 'REGISTERED'], conn: 'online', settings: defaultSettingsForBrand('AstroPay') },
  { id: 11, name: 'Interac Canada online banking', brand: 'Interac', currency: 'CAD', methods: ['Interac', 'Bank transfer'], countries: ['CA'], segments: ['REGISTERED', 'KYC_VERIFIED'], conn: 'online', settings: defaultSettingsForBrand('Interac') },
  { id: 12, name: 'Nuvei US/CA acquirer', brand: 'Nuvei', currency: 'USD', methods: ['Visa', 'MasterCard', 'ACH'], countries: ['US', 'CA'], segments: ['REGISTERED', 'FIRST_DEP'], conn: 'online', settings: defaultSettingsForBrand('Nuvei') },
  { id: 13, name: 'Plaid ACH instant US bank', brand: 'Plaid ACH', currency: 'USD', methods: ['ACH', 'Bank transfer'], countries: ['US'], segments: ['KYC_VERIFIED', 'REGISTERED'], conn: 'offline', settings: defaultSettingsForBrand('Plaid ACH') },
  { id: 14, name: 'CoinsPaid crypto gateway (BTC/USDT)', brand: 'CoinsPaid', currency: 'USDT', methods: ['Crypto'], countries: [...EU, 'TR', 'AE', 'BR', 'NG'], segments: ['HIGH_ROLLER', 'VIP', 'NO_DEPOSIT'], conn: 'online', settings: defaultSettingsForBrand('CoinsPaid') },
  { id: 15, name: 'Paystack West Africa cards & bank', brand: 'Paystack', currency: 'NGN', methods: ['Visa', 'MasterCard', 'Bank transfer'], countries: ['NG', 'GH'], segments: ['REGISTERED', 'MOBILE'], conn: 'online', settings: defaultSettingsForBrand('Paystack') },
  { id: 16, name: 'M-Pesa Kenya mobile money', brand: 'M-Pesa', currency: 'KES', methods: ['Mobile money'], countries: ['KE'], segments: ['MOBILE', 'REGISTERED'], conn: 'degraded', settings: defaultSettingsForBrand('M-Pesa') },
  { id: 17, name: 'Fawry Egypt vouchers & wallets', brand: 'Fawry', currency: 'USD', methods: ['Prepaid voucher', 'E-wallet'], countries: ['EG', 'MA'], segments: ['REGISTERED'], conn: 'online', settings: defaultSettingsForBrand('Fawry') },
  { id: 18, name: 'PayTR Turkey cards terminal', brand: 'PayTR', currency: 'TRY', methods: ['Visa', 'MasterCard', 'Bank transfer'], countries: ['TR'], segments: ['REGISTERED', 'FIRST_DEP'], conn: 'online', settings: defaultSettingsForBrand('PayTR') },
  { id: 19, name: 'Network International Gulf merchant', brand: 'Network International', currency: 'AED', methods: ['Visa', 'MasterCard'], countries: ['AE', 'SA'], segments: ['KYC_VERIFIED', 'VIP'], conn: 'offline', settings: defaultSettingsForBrand('Network International') },
  { id: 20, name: 'GCash Philippines QR wallet', brand: 'GCash', currency: 'PHP', methods: ['E-wallet', 'QR Code'], countries: ['PH'], segments: ['MOBILE', 'REGISTERED'], conn: 'online', settings: defaultSettingsForBrand('GCash') },
  { id: 21, name: 'Momo Vietnam QR & bank gateway', brand: 'Momo', currency: 'VND', methods: ['E-wallet', 'QR Code'], countries: ['VN'], segments: ['MOBILE', 'FIRST_DEP'], conn: 'online', settings: defaultSettingsForBrand('Momo') },
  { id: 22, name: 'Xendit SEA multi-rail', brand: 'Xendit', currency: 'IDR', methods: ['QR Code', 'Bank transfer', 'E-wallet'], countries: ['ID', 'TH', 'MY'], segments: ['REGISTERED', 'MOBILE'], conn: 'online', settings: defaultSettingsForBrand('Xendit') },
  { id: 23, name: 'PayPay Japan QR terminal', brand: 'PayPay', currency: 'JPY', methods: ['QR Code', 'E-wallet'], countries: ['JP'], segments: ['REGISTERED'], conn: 'degraded', settings: defaultSettingsForBrand('PayPay') },
  { id: 24, name: 'Payeer CIS wallet & cards', brand: 'Payeer', currency: 'RUB', methods: ['E-wallet', 'Visa', 'MasterCard'], countries: ['RU', 'KZ', 'UA', 'UZ', 'AZ'], segments: ['REGISTERED', 'NO_DEPOSIT'], conn: 'online', settings: defaultSettingsForBrand('Payeer') },
  { id: 25, name: 'Paysafecard Europe vouchers', brand: 'Paysafecard', currency: 'EUR', methods: ['Prepaid voucher'], countries: ['DE', 'AT', 'IT', 'ES', 'GB', 'CA'], segments: ['NO_DEPOSIT', 'REGISTERED'], conn: 'online', settings: defaultSettingsForBrand('Paysafecard') },
  { id: 26, name: 'Rapyd Global aggregator multi-currency', brand: 'Rapyd', currency: 'EUR', methods: ['Bank transfer', 'E-wallet', 'Visa'], countries: ['ZA', 'IN', 'BD', 'KR', 'AU'], segments: ['REGISTERED', 'KYC_VERIFIED'], conn: 'online', settings: defaultSettingsForBrand('Rapyd') },
];

let PAYMENT_CONNECTIONS = [...INITIAL_CONNECTIONS];

const CONN = { online: 'Connected', degraded: 'Degraded', offline: 'Disconnected' };
const DECLINE_REASONS = ['Insufficient funds', 'Do not honor', '3-D Secure failed', 'Suspected fraud', 'Issuer unavailable', 'Expired card', 'Any decline'];
const CASCADES = [
  { id: 1, name: 'Cascade by declined transaction', type: 'decline', country: '', zone: 'Europe', segments: ['REGISTERED'], method: 'Visa', currency: 'EUR', steps: [{ psp: 'Stripe terminal 101 for highrisk', value: 'Do not honor' }, { psp: 'Adyen global cards primary', value: 'Issuer unavailable' }, { psp: 'Checkout.com highrisk MCC 7995', value: 'Any decline' }] },
  { id: 2, name: 'Europe cards by success rate', type: 'success', country: '', zone: 'Europe', segments: [], method: 'MasterCard', currency: 'EUR', steps: [{ psp: 'Adyen global cards primary', value: 85 }, { psp: 'Stripe terminal 101 for highrisk', value: 80 }, { psp: 'Checkout.com highrisk MCC 7995', value: 70 }] },
  { id: 3, name: 'India UPI routing', type: 'success', country: 'IN', zone: 'APAC', segments: ['MOBILE'], method: 'UPI', currency: 'INR', steps: [{ psp: 'Razorpay UPI & Paytm instant', value: 90 }, { psp: 'PayU India & Poland netbanking', value: 80 }] },
  { id: 4, name: 'Brazil Pix fallback', type: 'decline', country: 'BR', zone: 'LATM', segments: ['REGISTERED', 'FIRST_DEP'], method: 'Pix', currency: 'BRL', steps: [{ psp: 'EBANX Pix & local cards Brazil', value: 'Issuer unavailable' }, { psp: 'AstroPay prepaid LATAM', value: 'Any decline' }] },
  { id: 5, name: 'Canada deposits', type: 'success', country: 'CA', zone: 'Canada', segments: ['KYC_VERIFIED'], method: 'Interac', currency: 'CAD', steps: [{ psp: 'Interac Canada online banking', value: 88 }, { psp: 'Nuvei US/CA acquirer', value: 75 }] },
  { id: 6, name: 'US ACH high success', type: 'success', country: 'US', zone: 'United States', segments: [], method: 'ACH', currency: 'USD', steps: [{ psp: 'Nuvei US/CA acquirer', value: 85 }, { psp: 'Plaid ACH instant US bank', value: 70 }] },
  { id: 7, name: 'Turkey cards fraud decline', type: 'decline', country: 'TR', zone: 'MENA', segments: ['REGISTERED'], method: 'Visa', currency: 'TRY', steps: [{ psp: 'PayTR Turkey cards terminal', value: 'Suspected fraud' }, { psp: 'Checkout.com highrisk MCC 7995', value: '3-D Secure failed' }] },
  { id: 8, name: 'Global crypto', type: 'success', country: '', zone: '', segments: ['VIP', 'HIGH_ROLLER'], method: 'Crypto', currency: 'USDT', steps: [{ psp: 'CoinsPaid crypto gateway (BTC/USDT)', value: 95 }] },
];
const TX_STATUSES = ['Approved', 'Declined', 'Pending', 'Refunded', 'Chargeback'];
const TX_TYPES = ['Deposit', 'Withdrawal', 'Refund'];
const TX_DAY = 864e5;
const TRANSACTIONS = (() => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const players = ['luna.play', 'max_rider', 'k.novak', 'sofia88', 'jhon_d', 'anita.s', 'tigerking', 'mila_r', 'omar77', 'lee.w'];
  const reasons = ['Insufficient funds', 'Do not honor', '3-D Secure failed', 'Suspected fraud', 'Issuer unavailable', 'Expired card'];
  const now = Date.parse('2026-10-12T17:00:00');
  const out = [];
  for (let i = 0; i < 120; i++) {
    const g = pick(GATEWAYS);
    const country = pick(g.countries);
    const method = pick(g.methods);
    const currency = pick(g.currencies);
    const type = rnd() < 0.78 ? 'Deposit' : rnd() < 0.85 ? 'Withdrawal' : 'Refund';
    const r = rnd();
    let status = r < 0.66 ? 'Approved' : r < 0.84 ? 'Declined' : r < 0.92 ? 'Pending' : r < 0.97 ? 'Refunded' : 'Chargeback';
    if (type === 'Withdrawal' && status === 'Declined') status = 'Pending';
    const amount = Math.round((rnd() * 480 + 10) * 100) / 100;
    const ts = now - Math.floor(rnd() * 30 * TX_DAY);
    const reason = status === 'Declined' ? pick(reasons) : '';
    const ref = 'PSP-' + Math.floor(rnd() * 9e8 + 1e8);
    out.push({ id: 'TX-' + (480100 + i), ts, player: pick(players), type, status, amount, currency, gateway: g.brand, method, country, zone: zoneOf(country), segments: g.segments.slice(0, 2), reason, ref });
  }
  return out.sort((a, b) => b.ts - a.ts);
})();
const txLogs = (t) => {
  const T = (ms) => t.ts + ms;
  const code = t.status === 'Declined' ? (t.reason === 'Insufficient funds' ? '51' : t.reason === 'Suspected fraud' ? '59' : '05') : '00';
  const logs = [
    { at: T(0), dir: 'internal', title: 'Transaction created', body: { id: t.id, player: t.player, type: t.type, amount: t.amount, currency: t.currency, method: t.method } },
    { at: T(120), dir: 'internal', title: 'Routing: gateway selected', body: { cascade: 'Cascade by declined transaction', selected: t.gateway, country: t.country, zone: t.zone } },
    { at: T(310), dir: 'request', title: 'Request to ' + t.gateway, body: { endpoint: 'POST /v2/payments', reference: t.id, amount: Math.round(t.amount * 100), currency: t.currency, method: t.method, country: t.country, card: t.method.match(/Visa|MasterCard/) ? '**** **** **** 4242' : undefined } },
  ];
  if (t.status === 'Pending') {
    logs.push({ at: T(1450), dir: 'response', title: 'Response from ' + t.gateway, body: { http: 202, status: 'processing', gatewayRef: t.ref } });
  } else {
    logs.push({ at: T(1820), dir: 'response', title: 'Response from ' + t.gateway, body: { http: 200, status: t.status === 'Declined' ? 'declined' : 'approved', code, message: t.reason || 'Approved', gatewayRef: t.ref } });
    logs.push({ at: T(1840), dir: 'internal', title: t.status === 'Declined' ? 'Declined: player notified' : 'Balance updated', body: t.status === 'Declined' ? { reason: t.reason } : { ledger: t.type === 'Withdrawal' ? 'debit' : 'credit', amount: t.amount } });
  }
  if (t.status === 'Declined' && rndFlag(t)) logs.push({ at: T(2100), dir: 'internal', title: 'Cascade: retry on next system', body: { reason: t.reason, next: 'Adyen' } });
  if (t.status === 'Refunded' || t.status === 'Chargeback') {
    logs.push({ at: T(3 * TX_DAY), dir: 'webhook', title: t.gateway + ' webhook: ' + (t.status === 'Refunded' ? 'refund.processed' : 'dispute.opened'), body: { event: t.status === 'Refunded' ? 'refund.processed' : 'dispute.opened', gatewayRef: t.ref, amount: Math.round(t.amount * 100) } });
  }
  return logs;
};
const rndFlag = (t) => (parseInt(t.id.slice(3), 10) % 2) === 0;
const WALLET_TYPES = ['Real', 'Bonus'];
const WALLET_TX_TYPES = ['Deposit', 'Withdrawal', 'Bet', 'Win', 'Bonus granted', 'Bonus wagering', 'Bonus cancelled', 'Adjustment'];
const PLAYERS = [
  { name: 'luna.play', country: 'DE', currency: 'EUR', segments: ['REGISTERED', 'KYC_VERIFIED'] },
  { name: 'max_rider', country: 'SE', currency: 'EUR', segments: ['REGISTERED', 'FIRST_DEP'] },
  { name: 'k.novak', country: 'PL', currency: 'EUR', segments: ['VIP', 'KYC_VERIFIED'] },
  { name: 'sofia88', country: 'BR', currency: 'BRL', segments: ['REGISTERED', 'MOBILE'] },
  { name: 'jhon_d', country: 'CA', currency: 'CAD', segments: ['KYC_VERIFIED', 'HIGH_ROLLER'] },
  { name: 'anita.s', country: 'IN', currency: 'INR', segments: ['REGISTERED', 'MOBILE', 'FIRST_DEP'] },
  { name: 'tigerking', country: 'US', currency: 'USD', segments: ['VIP', 'HIGH_ROLLER'] },
  { name: 'mila_r', country: 'GB', currency: 'GBP', segments: ['NO_DEPOSIT', 'REGISTERED'] },
  { name: 'omar77', country: 'AE', currency: 'USD', segments: ['REGISTERED', 'KYC_VERIFIED'] },
  { name: 'lee.w', country: 'TH', currency: 'THB', segments: ['MOBILE', 'FIRST_DEP'] },
  { name: 'kofi_g', country: 'NG', currency: 'NGN', segments: ['REGISTERED'] },
  { name: 'ivan.k', country: 'KZ', currency: 'USD', segments: ['NO_DEPOSIT'] },
];
const { WALLETS, WALLET_TX } = (() => {
  let seed = 23;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const scale = { EUR: 1, USD: 1.1, GBP: 0.85, CAD: 1.5, INR: 90, BRL: 6, THB: 38, NGN: 1700 };
  const games = ['Gates of Olympus', 'Sweet Bonanza', 'Book of Dead', 'European Roulette', 'Aviator', 'Live Blackjack'];
  const now = Date.parse('2026-10-12T17:00:00');
  const wallets = [], txs = [];
  PLAYERS.forEach((pl, pi) => {
    const k = scale[pl.currency];
    ['Real', 'Bonus'].forEach((type) => {
      const id = 'W-' + (7000 + pi * 2 + (type === 'Bonus' ? 1 : 0));
      const n = 8 + Math.floor(rnd() * 8);
      const times = Array.from({ length: n }, () => now - Math.floor(rnd() * 40 * TX_DAY)).sort((a, b) => a - b);
      let bal = 0;
      const list = [];
      times.forEach((ts, i) => {
        let t, amt, note;
        const room = bal;
        if (type === 'Real') {
          if (i === 0 || room < 20 * k) { t = 'Deposit'; amt = pick([50, 100, 200, 500]) * k; note = pick(['Visa', 'MasterCard', 'Bank transfer', 'E-wallet']); }
          else {
            const r = rnd();
            if (r < 0.45) { t = 'Bet'; amt = -Math.min(room, (rnd() * 60 + 5) * k); note = pick(games); }
            else if (r < 0.75) { t = 'Win'; amt = (rnd() * 120 + 5) * k; note = pick(games); }
            else if (r < 0.88) { t = 'Deposit'; amt = pick([50, 100, 200]) * k; note = pick(['Visa', 'E-wallet', 'QR Code']); }
            else if (r < 0.96) { t = 'Withdrawal'; amt = -Math.min(room, pick([40, 80, 150]) * k); note = 'Bank transfer'; }
            else { t = 'Adjustment'; amt = (rnd() < 0.5 ? 1 : -1) * Math.min(room, 10 * k); note = 'Manual correction by support'; }
          }
        } else {
          if (i === 0 || room < 5 * k) { t = 'Bonus granted'; amt = pick([20, 40, 100]) * k; note = pick(['Welcome Pack 100%', 'Boost 20%', 'Reload Friday 50%']); }
          else {
            const r = rnd();
            if (r < 0.6) { t = 'Bonus wagering'; amt = -Math.min(room, (rnd() * 25 + 3) * k); note = pick(['Welcome Pack 100%', 'Boost 20%']) + ' · ' + pick(games); }
            else if (r < 0.9) { t = 'Bonus granted'; amt = pick([10, 20, 50]) * k; note = pick(['Reload Friday 50%', 'Birthday Gift']); }
            else { t = 'Bonus cancelled'; amt = -Math.min(room, 10 * k); note = 'Cancelled by player'; }
          }
        }
        amt = Math.round(amt * 100) / 100;
        bal = Math.round((bal + amt) * 100) / 100;
        list.push({ id: 'WT-' + id.slice(2) + '-' + (i + 1), wallet: id, ts, player: pl.name, type: t, amount: amt, balance: bal, currency: pl.currency, note, walletType: type, country: pl.country, segments: pl.segments });
      });
      wallets.push({ id, player: pl.name, country: pl.country, segments: pl.segments, type, currency: pl.currency, balance: bal });
      txs.push(...list);
    });
  });
  txs.sort((a, b) => b.ts - a.ts);
  return { WALLETS: wallets, WALLET_TX: txs };
})();
