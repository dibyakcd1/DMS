import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import { Line, Shop } from "@/types";
import "@testing-library/jest-dom";

// Mock the format function to be predictable
vi.mock("@/lib/format", () => ({
  fmtINR: (n: number) => `Rs. ${Number(n).toFixed(2)}`
}));

describe("OrderSummary Integration", () => {
  const mockLines: Line[] = [
    {
      product_id: "p1",
      name: "Product 1",
      sku: "SKU1",
      mrp: 100,
      unit_price: 90,
      gst_rate: 18,
      quantity: 2,
      stock: 100,
      packType: "pcs"
    }
  ];

  const mockTotals = {
    subtotal: 180,
    gst: 32.4,
    total: 212.4,
    calculatedDiscount: 0
  };

  const mockShop: Shop = {
    id: "s1",
    name: "Test Shop",
    owner_name: "Owner",
    phone: "123",
    address: "Addr",
    gstin: "123",
    credit_limit: 1000,
    is_active: true,
    shop_type: "premium",
    discount_pct: 0
  };

  it("renders order summary details correctly", () => {
    render(
      <OrderSummaryCard
        lines={mockLines}
        totals={mockTotals}
        shop={mockShop}
        outstandingBalance={0}
        discountType="fixed"
        setDiscountType={vi.fn()}
        discountAmount={0}
        setDiscountAmount={vi.fn()}
        notes="Test note"
        setNotes={vi.fn()}
        onAction={vi.fn()}
        busy={false}
        isAdmin={false}
        onUpdateShop={vi.fn()}
      />
    );

    // Check title and item count
    expect(screen.getByText("Order Summary")).toBeInTheDocument();
    expect(screen.getByText(/1 products listed/i)).toBeInTheDocument();

    // Check totals
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("Rs. 180.00")).toBeInTheDocument();
    expect(screen.getByText("GST Total")).toBeInTheDocument();
    expect(screen.getByText("Rs. 32.40")).toBeInTheDocument();
    expect(screen.getByText("Total Payable")).toBeInTheDocument();
    expect(screen.getByText("Rs. 212.40")).toBeInTheDocument();
  });

  it("shows action buttons", () => {
    render(
      <OrderSummaryCard
        lines={mockLines}
        totals={mockTotals}
        shop={mockShop}
        outstandingBalance={0}
        discountType="fixed"
        setDiscountType={vi.fn()}
        discountAmount={0}
        setDiscountAmount={vi.fn()}
        notes=""
        setNotes={vi.fn()}
        onAction={vi.fn()}
        busy={false}
        isAdmin={false}
        onUpdateShop={vi.fn()}
      />
    );

    expect(screen.getByText("Save Draft")).toBeInTheDocument();
    expect(screen.getByText("Submit for Approval")).toBeInTheDocument();
  });
});
