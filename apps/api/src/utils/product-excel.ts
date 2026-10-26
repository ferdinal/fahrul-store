import * as XLSX from 'xlsx';

export interface ProductImportRow {
  version: string;
  body: string;
  rowNumber: number;
}

export function parseProductExcel(buffer: Buffer): ProductImportRow[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Excel tidak memiliki worksheet');
  }

  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) {
    throw new Error('Worksheet tidak ditemukan');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });

  return rows.map((row, index) => {
    const version = String(row.VERSI ?? row.Versi ?? row.version ?? '').trim();

    const body = String(row.BODY ?? row.Body ?? row.body ?? '').trim();

    return {
      version,
      body,
      rowNumber: index + 2,
    };
  });
}
