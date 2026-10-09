import { describe, it, expect, vi } from 'vitest';
import { downloadCSV } from './businessLogic';

describe('downloadCSV', () => {
  it('writes a UTF-8 file with a BOM so Excel shows the rupee sign correctly', async () => {
    let blob;
    URL.createObjectURL = vi.fn((b) => { blob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    downloadCSV('Supplier Visibility', ['Amount'], [['₹1,80,934.12']]);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM
    expect(new TextDecoder().decode(bytes)).toContain('₹1,80,934.12');
  });
});
