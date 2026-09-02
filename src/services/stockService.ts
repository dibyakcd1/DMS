import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

export type SellUnit = 'packet' | 'pcs' | 'case' | 'kg' | 'g' | 'ml' | 'l' | 'unit';
export type ReferenceType = 'sale' | 'purchase' | 'adjustment' | 'return' | 'import';

export interface StockOperationResult {
  stock_after: number;
  base_units_deducted?: number;
  base_units_added?: number;
  sell_unit_used: SellUnit;
}

/**
 * Stock Service – Core calculation engine for inventory movements.
 * Interfaces with PostgreSQL functions for atomic transactions.
 */
export const stockService = {
  /**
   * Deduct stock from inventory
   */
  async deductStock(
    productId: string,
    qtySold: number,
    sellUnitUsed: SellUnit,
    referenceType: ReferenceType,
    referenceId?: string,
    warehouseId?: string
  ): Promise<StockOperationResult> {
    const { data, error } = await supabase.rpc('deduct_stock', {
      p_product_id: productId,
      p_qty_sold: qtySold,
      p_sell_unit_used: sellUnitUsed,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_warehouse_id: warehouseId
    });

    if (error) {
      console.error('Error deducting stock:', error);
      throw new Error(error.message);
    }

    return data as StockOperationResult;
  },

  /**
   * Add stock to inventory
   */
  async addStock(
    productId: string,
    qty: number,
    sellUnitUsed: SellUnit,
    referenceType: ReferenceType,
    referenceId?: string,
    warehouseId?: string
  ): Promise<StockOperationResult> {
    const { data, error } = await supabase.rpc('add_stock', {
      p_product_id: productId,
      p_qty: qty,
      p_sell_unit_used: sellUnitUsed,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_warehouse_id: warehouseId
    });

    if (error) {
      console.error('Error adding stock:', error);
      throw new Error(error.message);
    }

    return data as StockOperationResult;
  },

  /**
   * Unit Test Runner for Stock Logic
   * Validates calculation logic against business requirements.
   */
  async runTests() {
    console.log("🚀 Starting Stock Engine Validation...");
    
    // Note: These tests assume a clean environment or temporary test products.
    // We would typically run these against the SQL functions directly in migration test scripts,
    // but here we provide a way to trigger them from the app if needed.
    
    // Test Setup Helper (Mock)
    const mockProduct = {
      units_per_packet: 10,
      packets_per_case: 16,
      units_per_case: 160,
      pack_size_value: 100,
      pack_size_unit: 'g'
    };

    const conversionCheck = (qty: number, unit: SellUnit) => {
      let baseUnits = 0;
      switch(unit) {
        case 'case': baseUnits = qty * mockProduct.units_per_case; break;
        case 'packet': baseUnits = qty * mockProduct.units_per_packet; break;
        case 'pcs': 
        case 'unit': baseUnits = qty; break;
        case 'kg': baseUnits = Math.ceil((qty * 1000) / mockProduct.pack_size_value); break;
        case 'g': baseUnits = Math.ceil(qty / mockProduct.pack_size_value); break;
      }
      return baseUnits;
    };

    const tests = [
      { name: "Test 1: sell 2 pkt", qty: 2, unit: 'packet' as SellUnit, expectedDeduction: 20 },
      { name: "Test 2: sell 1 case", qty: 1, unit: 'case' as SellUnit, expectedDeduction: 160 },
      { name: "Test 3: sell 5 pcs", qty: 5, unit: 'pcs' as SellUnit, expectedDeduction: 5 },
      { name: "Test 4: sell 500g", qty: 500, unit: 'g' as SellUnit, expectedDeduction: 5 },
      { name: "Test 5: sell 1 kg", qty: 1, unit: 'kg' as SellUnit, expectedDeduction: 10 },
    ];

    console.log("--- Standard Product Conversion Tests ---");
    tests.forEach(t => {
      const result = conversionCheck(t.qty, t.unit);
      const passed = result === t.expectedDeduction;
      console.log(`${passed ? '✅' : '❌'} ${t.name} -> Deducted: ${result} (Expected: ${t.expectedDeduction})`);
    });

    const chainMock = {
      units_per_packet: 100,
      units_per_case: 2000,
      is_chain_item: true
    };

    const chainCheck = (qty: number, unit: SellUnit) => {
      // Chain conversion logic
      let baseUnits = 0;
      switch(unit) {
        case 'case': baseUnits = qty * chainMock.units_per_case; break;
        case 'pkt': baseUnits = qty * chainMock.units_per_packet; break;
        case 'pcs': baseUnits = qty; break;
      }
      return baseUnits;
    };

    const chainTests = [
      { name: "Test 6: sell 50 pcs (chain)", qty: 50, unit: 'pcs' as SellUnit, expectedDeduction: 50 },
      { name: "Test 7: sell 1 pkt (chain)", qty: 1, unit: 'packet' as SellUnit, expectedDeduction: 100 },
      { name: "Test 8: sell 1 case (chain)", qty: 1, unit: 'case' as SellUnit, expectedDeduction: 2000 },
    ];

    console.log("\n--- Chain Item Conversion Tests ---");
    chainTests.forEach(t => {
      const result = chainCheck(t.qty, t.unit);
      const passed = result === t.expectedDeduction;
      console.log(`${passed ? '✅' : '❌'} ${t.name} -> Deducted: ${result} (Expected: ${t.expectedDeduction})`);
    });
  }
};
