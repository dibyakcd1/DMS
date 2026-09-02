/**
 * @name: WAC_ENGINE_V2_WEIGHT_AWARE
 * @description: Updates the inventory valuation logic to support weight-based landed costs.
 * 
 * CORE RULES:
 * 1. products.cost_price ALWAYS stores the WAC normalized to PER UNIT (pcs).
 * 2. When weight data (weight_per_unit_grams) is present, display functions 
 *    should preferentially derive and show per-kg WAC.
 * 3. GRN entry basis is weight (per kg) IF product belongs to weight basis; 
 *    otherwise FALLBACK to per-unit (per pcs).
 */
-- [NO SCHEMA CHANGES REQUIRED - LOGIC HANDLED IN CLIENT & RPC]
-- This comment serves as the documentation for the WAC Engine v2 behavior.
