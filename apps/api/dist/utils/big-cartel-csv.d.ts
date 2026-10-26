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
export declare function normalizeProductName(value: string): string;
export declare function normalizeProductOptionName(value: string): string;
export declare function parseBigCartelItems(value: string | undefined): ParsedBigCartelItem[];
export declare function parseBigCartelCsv(csv: string): ParsedBigCartelOrder[];
export declare function extractProductVersion(value: string): string;
export declare function extractProductDescription(value: string): string;
export declare function getMatchingTokens(value: string): string[];
//# sourceMappingURL=big-cartel-csv.d.ts.map