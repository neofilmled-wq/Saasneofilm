import { Injectable } from '@nestjs/common';

@Injectable()
export class CsvService {
  /**
   * UTF-8 BOM for Excel compatibility.
   * Excel on Windows defaults to the system locale encoding when opening CSV;
   * the BOM tells it to use UTF-8 instead.
   */
  private static readonly UTF8_BOM = '\uFEFF';

  /**
   * Generate a CSV buffer from headers and rows.
   *
   * - Adds a UTF-8 BOM for Excel compatibility.
   * - Fields containing commas, double-quotes, or newlines are enclosed in
   *   double-quotes, with internal double-quotes escaped (RFC 4180).
   *
   * @param headers Column header names
   * @param rows    Array of string arrays (one per row)
   * @returns       Buffer containing the encoded CSV
   */
  generateCsv(headers: string[], rows: string[][]): Buffer {
    const lines: string[] = [];

    lines.push(headers.map((h) => this.escapeField(h)).join(','));

    for (const row of rows) {
      lines.push(row.map((field) => this.escapeField(field)).join(','));
    }

    const content = CsvService.UTF8_BOM + lines.join('\r\n') + '\r\n';
    return Buffer.from(content, 'utf-8');
  }

  /**
   * Escape a single CSV field per RFC 4180:
   * - If the field contains a comma, double-quote, or newline, wrap it in
   *   double-quotes and double any internal double-quotes.
   * - Null/undefined values become an empty string.
   */
  private escapeField(value: string | null | undefined): string {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
}
