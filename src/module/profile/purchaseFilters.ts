export type PurchaseKind = 'all' | 'physical' | 'digital' | 'auction' | 'commission';
export type PurchaseStatusFilter = 'all' | 'receive' | 'rate' | 'pay';
type FilterablePurchase = {
  status: string; can_rate: boolean; art_type?: string; purchase_type?: string;
  is_commission?: boolean; is_auction?: boolean; purchase_date?: string; created_at?: string;
  delivery?: { status: string };
};
export function purchaseTimestamp(purchase: FilterablePurchase): number {
  const date = Date.parse(purchase.purchase_date || purchase.created_at || '');
  return Number.isFinite(date) ? date : 0;
}
export function filterPurchases<T extends FilterablePurchase>(purchases: T[], status: PurchaseStatusFilter, kind: PurchaseKind): T[] {
  return purchases.filter(p => {
    const matchesStatus = status === 'rate' ? p.can_rate : status === 'pay' ? p.status === 'pending' : status === 'receive' ? p.status === 'paid' && !!p.delivery && p.delivery.status !== 'delivered' : true;
    const matchesKind = kind === 'all' || (kind === 'physical' || kind === 'digital' ? p.art_type?.toLowerCase() === kind : kind === 'commission' ? p.purchase_type === kind || !!p.is_commission : p.purchase_type === kind || !!p.is_auction);
    return matchesStatus && matchesKind;
  }).sort((a, b) => purchaseTimestamp(b) - purchaseTimestamp(a));
}
