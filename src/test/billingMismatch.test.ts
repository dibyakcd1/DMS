import { describe, it, expect } from 'vitest';

// Pure computation logic to be tested for Re-billing and Outstanding sync
function checkCanBill(
  orderStatus: string,
  invoice: { total: number; is_void: boolean } | null,
  orderTotal: number,
  isAdminOrOwn = true
): boolean {
  if (!isAdminOrOwn) return false;
  return (
    ["approved", "dispatched", "delivered"].includes(orderStatus) &&
    (!invoice || invoice.is_void || Math.abs(Number(invoice.total) - Number(orderTotal)) > 0.01)
  );
}

function computeRegeneratedInvoiceStatus(
  existingAmountPaid: number,
  newTotal: number
): { amount_paid: number; payment_status: 'unpaid' | 'partial' | 'paid' } {
  let computedPaymentStatus: 'unpaid' | 'partial' | 'paid' = "unpaid";
  if (existingAmountPaid >= newTotal) {
    computedPaymentStatus = "paid";
  } else if (existingAmountPaid > 0) {
    computedPaymentStatus = "partial";
  }
  return {
    amount_paid: existingAmountPaid,
    payment_status: computedPaymentStatus
  };
}

describe('Re-billing and Mismatch Logic', () => {
  it('should allow billing if no invoice exists', () => {
    const canBill = checkCanBill('approved', null, 14024.00);
    expect(canBill).toBe(true);
  });

  it('should allow billing if invoice is void', () => {
    const canBill = checkCanBill('approved', { total: 17624.00, is_void: true }, 14024.00);
    expect(canBill).toBe(true);
  });

  it('should NOT allow billing if invoice exists with identical total and is not void', () => {
    const canBill = checkCanBill('approved', { total: 14024.00, is_void: false }, 14024.00);
    expect(canBill).toBe(false);
  });

  it('should allow billing if invoice has mismatched total vs order total (e.g. after edit)', () => {
    const canBill = checkCanBill('approved', { total: 17624.00, is_void: false }, 14024.00);
    expect(canBill).toBe(true);
  });

  it('should properly evaluate payment_status upon regeneration - unpaid state', () => {
    const res = computeRegeneratedInvoiceStatus(0, 14024.00);
    expect(res.amount_paid).toBe(0);
    expect(res.payment_status).toBe('unpaid');
  });

  it('should properly evaluate payment_status upon regeneration - partial state', () => {
    const res = computeRegeneratedInvoiceStatus(5000.00, 14024.00);
    expect(res.amount_paid).toBe(5000.00);
    expect(res.payment_status).toBe('partial');
  });

  it('should properly evaluate payment_status upon regeneration - fully paid state', () => {
    const res = computeRegeneratedInvoiceStatus(15000.00, 14024.00);
    expect(res.amount_paid).toBe(15000.00);
    expect(res.payment_status).toBe('paid');
  });
});
