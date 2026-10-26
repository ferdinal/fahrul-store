import Papa from 'papaparse';
function parseNumber(value) {
    if (!value) {
        return 0;
    }
    const normalized = value.replace(/,/g, '').trim();
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
}
export function normalizeProductName(value) {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}
export function normalizeProductOptionName(value) {
    return normalizeProductName(value.replace(/\s+for\s+/i, ' '));
}
export function parseBigCartelItems(value) {
    if (!value?.trim()) {
        return [];
    }
    return value
        .split(';')
        .map((rawItem) => rawItem.trim())
        .filter(Boolean)
        .map((rawItem) => {
        const fields = {};
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
export function parseBigCartelCsv(csv) {
    const result = Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
    });
    if (result.errors.length > 0) {
        const firstError = result.errors[0];
        throw new Error(`CSV tidak valid: ${firstError?.message ?? 'Format CSV tidak valid'}`);
    }
    return result.data.map((row) => {
        const orderDate = row['Order date']?.trim() ?? '';
        const time = row.Time?.trim() ?? '';
        const combinedOrderDate = time.length > 0 ? `${orderDate} ${time}` : orderDate;
        return {
            orderNumber: row.Number?.trim() ?? '',
            buyer: {
                firstName: row['Buyer first name']?.trim() ?? '',
                lastName: row['Buyer last name']?.trim() ?? '',
                email: row['Buyer email']?.trim() ?? '',
                phone: row['Buyer phone number']?.trim() ?? '',
            },
            orderDate: combinedOrderDate,
            paymentStatus: row['Payment status']?.trim() ?? '',
            shippingStatus: row['Shipping status']?.trim() ?? '',
            shippingMethod: row['Shipping methods']?.trim() ?? '',
            shippingAddress: {
                address1: row['Shipping address 1']?.trim() ?? '',
                address2: row['Shipping address 2']?.trim() ?? '',
                city: row['Shipping city']?.trim() ?? '',
                state: row['Shipping state']?.trim() ?? '',
                zip: row['Shipping zip']?.trim() ?? '',
                country: row['Shipping country']?.trim() ?? '',
            },
            currency: row.Currency?.trim() || 'USD',
            subtotal: parseNumber(row['Item total']),
            shippingCost: parseNumber(row['Total shipping']),
            tax: parseNumber(row['Total tax']),
            discount: parseNumber(row['Total discount']),
            total: parseNumber(row['Total price']),
            note: row.Note?.trim() ?? '',
            items: parseBigCartelItems(row.Items),
        };
    });
}
export function extractProductVersion(value) {
    const normalized = normalizeProductName(value);
    const match = normalized.match(/^(.+?)\s+for\s+/i);
    return match?.[1]?.trim() ?? '';
}
export function extractProductDescription(value) {
    const normalized = normalizeProductName(value);
    const match = normalized.match(/^.+?\s+for\s+(.+)$/i);
    return match?.[1]?.trim() ?? '';
}
export function getMatchingTokens(value) {
    return normalizeProductName(value)
        .split(/\s+/)
        .map((token) => token.replace(/[^a-z0-9@.-]/g, ''))
        .filter((token) => token.length >= 3);
}
//# sourceMappingURL=big-cartel-csv.js.map