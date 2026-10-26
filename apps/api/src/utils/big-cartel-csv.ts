// import Papa from 'papaparse';

// export interface BigCartelCsvRow {
//   Number?: string;
//   'Buyer first name'?: string;
//   'Buyer last name'?: string;
//   'Buyer email'?: string;
//   'Buyer phone number'?: string;
//   'Order date'?: string;
//   Time?: string;
//   'Refund date'?: string;
//   'Refund amount'?: string;
//   Status?: string;
//   'Canceled date'?: string;
//   'Payment status'?: string;
//   'Transaction ID'?: string;
//   'Shipping status'?: string;
//   'Shipping methods'?: string;
//   'Shipping address 1'?: string;
//   'Shipping address 2'?: string;
//   'Shipping city'?: string;
//   'Shipping state'?: string;
//   'Shipping zip'?: string;
//   'Shipping country'?: string;
//   Currency?: string;
//   Items?: string;
//   'Item count'?: string;
//   'Item total'?: string;
//   'Total price'?: string;
//   'Total shipping'?: string;
//   'Total tax'?: string;
//   'Tax remitted by Big Cartel'?: string;
//   'Total discount'?: string;
//   'Discount code'?: string;
//   Source?: string;
//   Note?: string;
//   'Private notes'?: string;
// }

// export interface ParsedBigCartelItem {
//   productName: string;
//   productOptionName: string;
//   quantity: number;
//   price: number;
//   total: number;
// }

// export interface ParsedBigCartelOrder {
//   orderNumber: string;

//   buyer: {
//     firstName: string;
//     lastName: string;
//     email: string;
//     phone: string;
//   };

//   orderDate: string;

//   paymentStatus: string;
//   shippingStatus: string;
//   shippingMethod: string;

//   shippingAddress: {
//     address1: string;
//     address2: string;
//     city: string;
//     state: string;
//     zip: string;
//     country: string;
//   };

//   currency: string;

//   subtotal: number;
//   shippingCost: number;
//   tax: number;
//   discount: number;
//   total: number;

//   note: string;

//   items: ParsedBigCartelItem[];
// }

// function parseNumber(value: string | undefined): number {
//   if (!value) {
//     return 0;
//   }

//   const normalized = value.replace(/,/g, '').trim();

//   const number = Number(normalized);

//   return Number.isFinite(number) ? number : 0;
// }

// export function normalizeProductName(value: string): string {
//   return value.replace(/\s+/g, ' ').trim().toLowerCase();
// }

// export function normalizeProductOptionName(value: string): string {
//   return normalizeProductName(value.replace(/\s+for\s+/i, ' '));
// }

// export function parseBigCartelItems(
//   value: string | undefined,
// ): ParsedBigCartelItem[] {
//   if (!value?.trim()) {
//     return [];
//   }

//   return value
//     .split(';')
//     .map((rawItem) => rawItem.trim())
//     .filter(Boolean)
//     .map((rawItem) => {
//       const fields: Record<string, string> = {};

//       for (const field of rawItem.split('|')) {
//         const separatorIndex = field.indexOf(':');

//         if (separatorIndex === -1) {
//           continue;
//         }

//         const key = field.slice(0, separatorIndex).trim();

//         const fieldValue = field.slice(separatorIndex + 1).trim();

//         fields[key] = fieldValue;
//       }

//       return {
//         productName: fields.product_name ?? '',
//         productOptionName: fields.product_option_name ?? '',
//         quantity: parseNumber(fields.quantity),
//         price: parseNumber(fields.price),
//         total: parseNumber(fields.total),
//       };
//     });
// }

// export function parseBigCartelCsv(csv: string): ParsedBigCartelOrder[] {
//   const result = Papa.parse<BigCartelCsvRow>(csv, {
//     header: true,
//     skipEmptyLines: true,
//   });

//   if (result.errors.length > 0) {
//     const firstError = result.errors[0];

//     throw new Error(
//       `CSV tidak valid: ${firstError?.message ?? 'Format CSV tidak valid'}`,
//     );
//   }

//   return result.data.map((row) => {
//     const orderDate = row['Order date']?.trim() ?? '';

//     const time = row.Time?.trim() ?? '';

//     const combinedOrderDate =
//       time.length > 0 ? `${orderDate} ${time}` : orderDate;

//     return {
//       orderNumber: row.Number?.trim() ?? '',

//       buyer: {
//         firstName: row['Buyer first name']?.trim() ?? '',
//         lastName: row['Buyer last name']?.trim() ?? '',
//         email: row['Buyer email']?.trim() ?? '',
//         phone: row['Buyer phone number']?.trim() ?? '',
//       },

//       orderDate: combinedOrderDate,

//       paymentStatus: row['Payment status']?.trim() ?? '',

//       shippingStatus: row['Shipping status']?.trim() ?? '',

//       shippingMethod: row['Shipping methods']?.trim() ?? '',

//       shippingAddress: {
//         address1: row['Shipping address 1']?.trim() ?? '',
//         address2: row['Shipping address 2']?.trim() ?? '',
//         city: row['Shipping city']?.trim() ?? '',
//         state: row['Shipping state']?.trim() ?? '',
//         zip: row['Shipping zip']?.trim() ?? '',
//         country: row['Shipping country']?.trim() ?? '',
//       },

//       currency: row.Currency?.trim() || 'USD',

//       subtotal: parseNumber(row['Item total']),

//       shippingCost: parseNumber(row['Total shipping']),

//       tax: parseNumber(row['Total tax']),

//       discount: parseNumber(row['Total discount']),

//       total: parseNumber(row['Total price']),

//       note: row.Note?.trim() ?? '',

//       items: parseBigCartelItems(row.Items),
//     };
//   });
// }

// export function extractProductVersion(value: string): string {
//   const normalized = normalizeProductName(value);

//   const match = normalized.match(/^(.+?)\s+for\s+/i);

//   return match?.[1]?.trim() ?? '';
// }

// export function extractProductDescription(value: string): string {
//   const normalized = normalizeProductName(value);

//   const match = normalized.match(/^.+?\s+for\s+(.+)$/i);

//   return match?.[1]?.trim() ?? '';
// }

// export function getMatchingTokens(value: string): string[] {
//   return normalizeProductName(value)
//     .split(/\s+/)
//     .map((token) => token.replace(/[^a-z0-9@.-]/g, ''))
//     .filter((token) => token.length >= 3);
// }

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface BigCartelCsvRow {
  Number?: string;
  'Buyer first name'?: string;
  'Buyer last name'?: string;
  'Buyer email'?: string;
  'Buyer phone number'?: string;
  'Order date'?: string;
  Time?: string;
  'Refund date'?: string;
  'Refund amount'?: string;
  Status?: string;
  'Canceled date'?: string;
  'Payment status'?: string;
  'Transaction ID'?: string;
  'Shipping status'?: string;
  'Shipping methods'?: string;
  'Shipping address 1'?: string;
  'Shipping address 2'?: string;
  'Shipping city'?: string;
  'Shipping state'?: string;
  'Shipping zip'?: string;
  'Shipping country'?: string;
  Currency?: string;
  Items?: string;
  'Item count'?: string;
  'Item total'?: string;
  'Total price'?: string;
  'Total shipping'?: string;
  'Total tax'?: string;
  'Tax remitted by Big Cartel'?: string;
  'Total discount'?: string;
  'Discount code'?: string;
  Source?: string;
  Note?: string;
  'Private notes'?: string;
}

export interface ParsedBigCartelItem {
  productName: string;
  productOptionName: string;
  quantity: number;
  price: number;
  total: number;
}

export interface ParsedBigCartelOrder {
  orderNumber: string;
  buyer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  orderDate: string;
  paymentStatus: string;
  shippingStatus: string;
  shippingMethod: string;
  shippingAddress: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  currency: string;
  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;
  note: string;
  items: ParsedBigCartelItem[];
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function parseNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/,/g, '').trim();
  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
}

export function normalizeProductName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeProductOptionName(value: string): string {
  return normalizeProductName(value.replace(/\s+for\s+/i, ' '));
}

export function parseBigCartelItems(
  value: string | undefined,
): ParsedBigCartelItem[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(';')
    .map((rawItem) => rawItem.trim())
    .filter(Boolean)
    .map((rawItem) => {
      const fields: Record<string, string> = {};

      for (const field of rawItem.split('|')) {
        const separatorIndex = field.indexOf(':');

        if (separatorIndex === -1) {
          continue;
        }

        const key = field.slice(0, separatorIndex).trim();
        const fieldValue = field.slice(separatorIndex + 1).trim();

        fields[key] = fieldValue;
      }

      return {
        productName: fields.product_name ?? '',
        productOptionName: fields.product_option_name ?? '',
        quantity: parseNumber(fields.quantity),
        price: parseNumber(fields.price),
        total: parseNumber(fields.total),
      };
    });
}

function mapBigCartelRow(row: Record<string, unknown>): ParsedBigCartelOrder {
  const orderDate = toStringValue(row['Order date']);
  const time = toStringValue(row.Time);

  const combinedOrderDate = [orderDate, time].filter(Boolean).join(' ');

  return {
    orderNumber: toStringValue(row.Number),

    buyer: {
      firstName: toStringValue(row['Buyer first name']),
      lastName: toStringValue(row['Buyer last name']),
      email: toStringValue(row['Buyer email']),
      phone: toStringValue(row['Buyer phone number']),
    },

    orderDate: combinedOrderDate,

    paymentStatus: toStringValue(row['Payment status']),
    shippingStatus: toStringValue(row['Shipping status']),
    shippingMethod: toStringValue(row['Shipping methods']),

    shippingAddress: {
      address1: toStringValue(row['Shipping address 1']),
      address2: toStringValue(row['Shipping address 2']),
      city: toStringValue(row['Shipping city']),
      state: toStringValue(row['Shipping state']),
      zip: toStringValue(row['Shipping zip']),
      country: toStringValue(row['Shipping country']),
    },

    currency: toStringValue(row.Currency) || 'USD',

    subtotal: parseNumber(toStringValue(row['Item total'])),
    shippingCost: parseNumber(toStringValue(row['Total shipping'])),
    tax: parseNumber(toStringValue(row['Total tax'])),
    discount: parseNumber(toStringValue(row['Total discount'])),
    total: parseNumber(toStringValue(row['Total price'])),

    note: toStringValue(row.Note),

    items: parseBigCartelItems(toStringValue(row.Items)),
  };
}

/**
 * Parse file CSV Big Cartel.
 */
export function parseBigCartelCsv(csv: string): ParsedBigCartelOrder[] {
  const result = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0];

    throw new Error(
      `CSV tidak valid: ${firstError?.message ?? 'Format CSV tidak valid'}`,
    );
  }

  return result.data.map((row) => mapBigCartelRow(row));
}

/**
 * Parse file Excel Big Cartel (.xlsx / .xls).
 * Baris pertama worksheet harus berisi nama kolom Big Cartel.
 */
export function parseBigCartelExcel(buffer: Buffer): ParsedBigCartelOrder[] {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
    });
  } catch {
    throw new Error('File Excel tidak valid atau tidak dapat dibaca.');
  }

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('File Excel tidak memiliki worksheet.');
  }

  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    throw new Error('Worksheet Excel tidak dapat dibaca.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0] ?? {});

  if (!headers.includes('Number') || !headers.includes('Items')) {
    throw new Error(
      'Format Excel tidak sesuai. Pastikan menggunakan kolom ekspor order Big Cartel, termasuk kolom "Number" dan "Items".',
    );
  }

  return rows.map((row) => mapBigCartelRow(row));
}

/**
 * Parse file berdasarkan ekstensi.
 * Mendukung CSV, XLSX, dan XLS.
 */
export function parseBigCartelFile(
  buffer: Buffer,
  originalname: string,
): ParsedBigCartelOrder[] {
  const extension = originalname.toLowerCase().split('.').pop();

  if (extension === 'csv') {
    // UTF-8 BOM dapat muncul pada file CSV hasil ekspor.
    const csv = buffer.toString('utf-8').replace(/^\uFEFF/, '');

    return parseBigCartelCsv(csv);
  }

  if (extension === 'xlsx' || extension === 'xls') {
    return parseBigCartelExcel(buffer);
  }

  throw new Error(
    'Format file tidak didukung. Upload file CSV, XLSX, atau XLS.',
  );
}

export function extractProductVersion(value: string): string {
  const normalized = normalizeProductName(value);
  const match = normalized.match(/^(.+?)\s+for\s+/i);

  return match?.[1]?.trim() ?? '';
}

export function extractProductDescription(value: string): string {
  const normalized = normalizeProductName(value);
  const match = normalized.match(/^.+?\s+for\s+(.+)$/i);

  return match?.[1]?.trim() ?? '';
}

export function getMatchingTokens(value: string): string[] {
  return normalizeProductName(value)
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9@.-]/g, ''))
    .filter((token) => token.length >= 3);
}
