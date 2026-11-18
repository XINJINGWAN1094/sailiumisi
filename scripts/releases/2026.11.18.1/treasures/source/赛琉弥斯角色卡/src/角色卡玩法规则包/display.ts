/** Display only. Never feed the rounded result back into calculations or the source snapshot. */
const decimal = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function displayAmount(value: number): string {
  if (!Number.isFinite(value)) return '未记录';
  const rounded = Number(value.toFixed(1));
  return decimal.format(Object.is(rounded, -0) ? 0 : rounded);
}

/** A fresh read-only AI view; integer counts, IDs, strings and original data remain intact. */
export function roundedPublicView<T>(value: T): T {
  if (typeof value === 'number') return (Number.isFinite(value) ? Number(value.toFixed(1)) : value) as T;
  if (Array.isArray(value)) return value.map(item => roundedPublicView(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundedPublicView(item)])) as T;
  }
  return value;
}
