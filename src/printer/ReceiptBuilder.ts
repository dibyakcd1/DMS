export class ReceiptBuilder {
  protected lines: unknown[] = [];
  protected encoder = new TextEncoder();

  getPreview() {
    return this.lines;
  }

  // Basic ESC/POS commands
  protected ESC = 0x1b;
  protected GS = 0x1d;
  protected LF = 0x0a;

  protected initialize(): number[] {
    return [this.ESC, 0x40];
  }

  protected setAlignment(align: 'left' | 'center' | 'right'): number[] {
    const val = align === 'left' ? 0 : align === 'center' ? 1 : 2;
    return [this.ESC, 0x61, val];
  }

  protected setBold(on: boolean): number[] {
    return [this.ESC, 0x45, on ? 1 : 0];
  }

  protected setSize(width: 1 | 2, height: 1 | 2): number[] {
    // GS ! n (n=0..255)
    // Bits 0-3: height (0=1x, 1=2x...)
    // Bits 4-7: width (0=1x, 1=2x...)
    const n = ((width - 1) << 4) | (height - 1);
    return [this.GS, 0x21, n];
  }

  protected text(str: string): number[] {
    return Array.from(this.encoder.encode(str + '\n'));
  }

  protected divider(): number[] {
    return this.text('-'.repeat(32));
  }

  protected feed(count = 3): number[] {
    return Array(count).fill(this.LF);
  }

  protected cut(): number[] {
    return [this.GS, 0x56, 0x42, 0x00];
  }

  build(data: Record<string, unknown>): Uint8Array {
    // Default implementation
    const bytes: number[] = [
      ...this.initialize(),
      ...this.setAlignment('center'),
      ...this.setSize(2, 2),
      ...this.text('RECEIPT'),
      ...this.setSize(1, 1),
      ...this.divider(),
      ...this.setAlignment('left'),
      ...this.text(String(data.content || 'Generic Receipt Content')),
      ...this.feed(),
      ...this.cut()
    ];
    return new Uint8Array(bytes);
  }
}
