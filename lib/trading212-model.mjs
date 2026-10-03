export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0,200) : null;
export function summary(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('schema');
  return {currency:text(data.currency),totalValue:number(data.totalValue),available:number(data.cash?.availableToTrade),reserved:number(data.cash?.reservedForOrders),invested:number(data.investments?.currentValue),cost:number(data.investments?.totalCost),realized:number(data.investments?.realizedProfitLoss),unrealized:number(data.investments?.unrealizedProfitLoss)};
}
export function position(p) {
  return {ticker:text(p.instrument?.ticker),name:text(p.instrument?.name),isin:text(p.instrument?.isin),instrumentCurrency:text(p.instrument?.currency),quantity:number(p.quantity),averagePrice:number(p.averagePricePaid),currentPrice:number(p.currentPrice),currency:text(p.walletImpact?.currency),value:number(p.walletImpact?.currentValue),unrealized:number(p.walletImpact?.unrealizedProfitLoss),openedAt:text(p.createdAt)};
}
export function historyItem(item, kind) {
  if (kind === 'orders') {
    const o=item.order||{}, f=item.fill||{},w=f.walletImpact||{};
    return {id:text(f.id),orderId:text(o.id),ticker:text(o.instrument?.ticker),date:text(f.filledAt||o.createdAt),type:text(f.type||o.type),side:text(o.side),status:text(o.status),quantity:number(f.quantity),price:number(f.price),priceCurrency:text(o.instrument?.currency),amount:number(w.netValue),currency:text(w.currency),realized:number(w.realisedProfitLoss)};
  }
  return {id:text(item.reference),ticker:text(item.instrument?.ticker||item.ticker),date:text(kind==='dividends'?item.paidOn:item.dateTime),type:text(item.type),amount:number(item.amount),currency:text(item.currency)};
}
