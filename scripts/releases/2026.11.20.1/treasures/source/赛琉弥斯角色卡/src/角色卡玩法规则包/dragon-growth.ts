/** 巨龙自然生长与战斗体型标尺；纯函数，不读取现实时间或聊天全局状态。 */
export type DragonBody = { 年龄: number | null; 全长米: number };
export type DragonGrowth = {
  规则版本: 1;
  建档年龄: number | null;
  建档全长米: number;
  起算时间: string | null;
};
export type DragonScale = { s: number; defense: number; attack: number; skill: number };
// 兼容仅登记旧体型标签的档案；没有真实全长时不猜年龄、长度或自动迁移。
export const dragonTemplates: Record<string, DragonScale> = {
  不足5米: { s: 2, defense: 2, attack: 7, skill: 2 },
  '5—不足20米': { s: 3, defense: 3, attack: 9, skill: 3 },
  '20—不足70米': { s: 4, defense: 4, attack: 12, skill: 4 },
  '70—不足200米': { s: 6, defense: 5, attack: 16, skill: 5 },
  '200—不足400米': { s: 8, defense: 6, attack: 20, skill: 6 },
  '400—不足1000米': { s: 12, defense: 7, attack: 25, skill: 8 },
  '1000—不足2000米': { s: 16, defense: 8, attack: 30, skill: 10 },
};
export const dragonScaleAnchors = [
  [1, 2, 2, 7, 2],
  [5, 3, 3, 9, 3],
  [20, 4, 4, 12, 4],
  [70, 6, 5, 16, 5],
  [200, 8, 6, 20, 6],
  [400, 12, 7, 25, 8],
  [1000, 16, 8, 30, 10],
  [2000, 20, 9, 35, 12],
  [3000, 24, 10, 40, 14],
] as const;
const finiteLength = (length: number) => Number.isFinite(length) && length > 0;
export function dragonScale(length: number): DragonScale {
  if (!finiteLength(length)) throw new Error('巨龙全长须为有限正数。');
  if (length <= 1) return { s: 2, defense: 2, attack: 7, skill: 2 };
  if (length > 3000) {
    const d = Math.log2(length / 3000);
    return { s: 24 + 4 * d, defense: 10 + d, attack: 40 + 5 * d, skill: 14 + 2 * d };
  }
  const i = dragonScaleAnchors.findIndex(a => a[0] >= length);
  const a = dragonScaleAnchors[i - 1],
    b = dragonScaleAnchors[i];
  const t = (length - a[0]) / (b[0] - a[0]);
  const lerp = (column: 1 | 2 | 3 | 4) => a[column] + (b[column] - a[column]) * t;
  return { s: lerp(1), defense: lerp(2), attack: lerp(3), skill: lerp(4) };
}
export function dragonBodyLabel(length: number): string {
  if (!finiteLength(length)) throw new Error('巨龙全长须为有限正数。');
  const edges = [5, 20, 70, 200, 400, 1000, 2000];
  const i = edges.findIndex(edge => length < edge);
  return i >= 0 ? Object.keys(dragonTemplates)[i] : length < 3000 ? '2000—不足3000米' : '3000米及以上';
}
export function dragonCoefficients(person: { 体型模板?: string | null; 巨龙体型?: DragonBody }): DragonScale | null {
  if (person.巨龙体型) return dragonScale(person.巨龙体型.全长米);
  const label = person.体型模板 ?? '';
  return Object.hasOwn(dragonTemplates, label) ? dragonTemplates[label] : null;
}
// 共用360日历。个体建档尺寸保留，只累加参考曲线的长度增量，不强行拉回平均体长。
const ageAnchors = [
  [0, 1.5],
  [15, 5],
  [100, 25],
  [200, 80],
  [600, 180],
  [1000, 400],
  [2000, 1000],
] as const;
export function dragonReferenceLength(age: number): number {
  if (!Number.isFinite(age) || age < 0) throw new Error('巨龙年龄须为有限非负数或明确未知。');
  if (age >= 2000) return 1000 + (age - 2000) * 0.5;
  const i = ageAnchors.findIndex(a => a[0] > age);
  const a = ageAnchors[i - 1],
    b = ageAnchors[i];
  return a[1] + ((age - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
}
export function dragonBodyAt(anchor: DragonGrowth, elapsedYears: number): DragonBody {
  if (!Number.isFinite(elapsedYears) || elapsedYears < 0) throw new Error('巨龙生长时段无效。');
  if (anchor.建档年龄 === null) return { 年龄: null, 全长米: anchor.建档全长米 };
  const age = anchor.建档年龄 + elapsedYears;
  const length = anchor.建档全长米 + dragonReferenceLength(age) - dragonReferenceLength(anchor.建档年龄);
  if (!finiteLength(length)) throw new Error('巨龙体长超出可计算范围。');
  return { 年龄: age, 全长米: length };
}
