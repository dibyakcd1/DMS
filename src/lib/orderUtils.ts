import { Product, NewOrderPackType } from "@/types";
import { getAvailableSellUnits } from "@/lib/packaging";

export function getDefaultPackType(product: Product): NewOrderPackType {
  if (product.preferred_sell_unit) {
    const psu = product.preferred_sell_unit.toLowerCase();
    if (psu === 'doz' || psu === 'dozen' || psu === 'dz') return 'doz';
    if (psu === 'packet' || psu === 'pkt' || psu === 'pack') return 'packet';
    if (psu === 'kg') return 'kg';
    if (psu === 'case' || psu === 'ctn' || psu === 'carton') return 'case';
    if (psu === 'g' || psu === 'gms') return 'g';
    if (psu === 'ml') return 'ml';
    if (psu === 'ltr' || psu === 'l') return 'ltr';
    if (psu === 'pcs' || psu === 'unit' || psu === 'pc') return 'pcs';
  }
  const available = getAvailableSellUnits(product as unknown as Product);
  const u = available[0] || 'pcs';
  const lower = u.toLowerCase();
  if (lower === 'doz' || lower === 'dozen' || lower === 'dz') return 'doz';
  if (lower === 'packet' || lower === 'pkt') return 'packet';
  if (lower === 'case' || lower === 'ctn' || lower === 'carton') return 'case';
  if (lower === 'kg') return 'kg';
  if (lower === 'g' || lower === 'gms') return 'g';
  if (lower === 'ml') return 'ml';
  if (lower === 'ltr' || lower === 'l') return 'ltr';
  return 'pcs';
}
