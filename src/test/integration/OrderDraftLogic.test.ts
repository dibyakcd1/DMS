import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useOrderDraft } from "@/hooks/useOrderDraft";
import { Product, Shop } from "@/types";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockReturnValue({ data: null, error: null }),
  },
}));

// Mock current user
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    id: "user-1",
    role: "salesperson",
    isPinUser: false,
  }),
}));

const mockProduct = {
  id: "p1",
  name: "Spices",
  sku: "SP01",
  mrp: 100,
  gst_rate: 18,
  units_per_packet: 10,
  packets_per_case: 50,
  unit_type: "pcs",
  inventory: { stock_base_units: 1000, avg_landed_cost: 50 },
} as unknown as Product;

const mockShop = {
  id: "s1",
  name: "Shop A",
  shop_type: "premium",
  discount_pct: 0
} as unknown as Shop;

describe("useOrderDraft Integration Logic", () => {
  it("calculates totals correctly when adding products", async () => {
    const { result } = renderHook(() => useOrderDraft());

    await act(async () => {
      result.current.setShopId("s1");
      result.current.addProduct(mockProduct, mockShop);
    });

    // 1 unit of Product 1
    // Landed cost 50. Margin 3% (Premium) -> 50 / 0.97 = 51.54.
    // Selling price (rounded to nearest 0.5) = 52.0
    // GST 18% of 52 = 9.36
    // Total = 61.36
    
    expect(result.current.lines.length).toBe(1);
    expect(result.current.totals.subtotal).toBe(52);
    expect(result.current.totals.gst).toBe(9.36);
    expect(result.current.totals.total).toBe(61.36);
  });

  it("updates totals when quantity changes", async () => {
    const { result } = renderHook(() => useOrderDraft());

    await act(async () => {
      result.current.setShopId("s1");
      result.current.addProduct(mockProduct, mockShop);
    });

    await act(async () => {
      result.current.updateLineQty("p1", 2);
    });

    // 2 units * 52 = 104
    // GST 18% of 104 = 18.72
    // Total = 122.72
    expect(result.current.totals.subtotal).toBe(104);
    expect(result.current.totals.gst).toBe(18.72);
    expect(result.current.totals.total).toBe(122.72);
  });

  it("applies fixed discount correctly", async () => {
    const { result } = renderHook(() => useOrderDraft());

    await act(async () => {
      result.current.setShopId("s1");
      result.current.addProduct(mockProduct, mockShop); // Total 61.36
      result.current.setDiscountType("flat");
      result.current.setDiscountAmount(9.36);
    });

    // Subtotal 52, GST 9.36 -> Pre-discount Total 61.36
    // Discount 9.36 -> Final Total 52.00
    expect(result.current.totals.total).toBe(52);
  });
});
