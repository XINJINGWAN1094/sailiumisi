import { z } from 'zod';
import { type Gameplay, describeTreasure } from './progression';
import type { InventoryItem, TreasureMetadata } from './equipment';
import { TreasureItemSchema, treasureElements, treasureTargetKinds, type TreasureEffect } from './treasure-effects';

import { OPPORTUNITY_LIMIT, PITY_ROUNDS, TREASURE_INVENTORY_LIMIT } from './treasure-config';
export { OPPORTUNITY_LIMIT, PITY_ROUNDS, TREASURE_INVENTORY_LIMIT } from './treasure-config';
export const TREASURE_STOCK = '宝物藏室';
// Independent generated records, rather than the number of stacked ordinary story items.
export const OpportunitySchema = z.object({
  序号: z.number().int().positive(),
  状态: z.enum(['待命名', '命名失败', '待追寻', '追寻中', '待领取']),
  物品: TreasureItemSchema,
  命名错误: z.string().max(160).optional(),
});
export const TreasureOpportunitiesSchema = z.object({
  版本: z.literal(1),
  种子: z.number().int().min(1).max(4294967295),
  序号: z.number().int().nonnegative(),
  已计毫秒: z.number().finite().nonnegative(),
  间隔毫秒: z.number().int().min(1200000).max(3000000),
  已计轮数: z.number().int().min(0).max(PITY_ROUNDS),
  最后计轮楼层: z.number().int().min(-1),
  机会: z.record(z.string().min(1), OpportunitySchema).refine(items => Object.keys(items).length <= OPPORTUNITY_LIMIT),
});
export type TreasureOpportunities = z.infer<typeof TreasureOpportunitiesSchema>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type TreasureGameplay = Gameplay & {
  玩家人物ID?: string | null;
  宝物系统?: TreasureOpportunities;
  宝物取得?: string[];
};
export function initialTreasureOpportunities(): TreasureOpportunities {
  return {
    版本: 1,
    种子: Math.floor(Math.random() * 4294967294) + 1,
    序号: 0,
    已计毫秒: 0,
    间隔毫秒: 1200000 + Math.floor(Math.random() * 1800001),
    已计轮数: 0,
    最后计轮楼层: -1,
    机会: {},
  };
}
function randomOf(system: TreasureOpportunities): () => number {
  return () => {
    let value = system.种子;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    system.种子 = value >>> 0 || 1;
    return system.种子 / 4294967296;
  };
}
const pick = <T>(values: readonly T[], random: () => number): T => values[Math.floor(random() * values.length)];
const common = ['固定属性', '比例属性', '定向培养', '修为'] as const;
const practical = [
  '成长加速',
  '护盾强化',
  '护盾延续',
  '元素专精',
  '对类特攻',
  '元素抗性',
  '技能节能',
  '恢复增效',
  '感应',
  '隐匿',
  '环境适应',
] as const;
const rare = [
  '破盾',
  '穿透',
  '主动护盾',
  '蓄能',
  '临时强化',
  '汲取',
  '反震',
  '持续侵蚀',
  '守护',
  '短距移动',
  '净化',
] as const;

/** The rarity roll reserves exactly 2 percentage points for Phoenix, not 2% of 5%. */
export function rollTreasure(mainRank: number, route: '斗气' | '法力', random: () => number): Opportunity['物品'] {
  const rankRoll = random();
  const offset = rankRoll < 0.2 ? -1 : rankRoll < 0.9 ? 0 : 1;
  const candidate = mainRank + offset;
  const rank = candidate < 1 || candidate > 8 ? mainRank : candidate;
  const chance = random();
  const type =
    chance < 0.02
      ? '不死之鸟'
      : chance < 0.05
        ? '瞬间治愈'
        : chance < 0.2
          ? pick(rare, random)
          : chance < 0.5
            ? pick(practical, random)
            : pick(common, random);
  const rarity = chance < 0.05 ? '珍奇' : chance < 0.2 ? '稀有' : chance < 0.5 ? '实用' : '常规';
  const effect: TreasureEffect = {
    类型: type,
    份额: 1,
    强度: type === '不死之鸟' ? 1 : Math.round((0.8 + random() * 0.4) * 100) / 100,
  };
  if (['固定属性', '比例属性', '定向培养'].includes(type))
    effect.属性 = pick(['生命', '防御', '攻击', '能量'] as const, random);
  if (['修为', '成长加速'].includes(type) || effect.属性 === '能量') effect.路线 = route;
  if (['元素专精', '元素抗性', '环境适应'].includes(type)) effect.元素 = pick(treasureElements, random);
  if (type === '对类特攻') effect.对象类别 = pick(treasureTargetKinds, random);
  const cultivation = ['修为', '定向培养', '成长加速'].includes(type);
  const category =
    type === '不死之鸟' ? '特殊物品' : cultivation ? '修为秘宝' : pick(['武器', '防具', '饰品'] as const, random);
  const meta: TreasureMetadata = {
    大类: category,
    子类: category === '武器' && route === '法力' ? '法杖' : '普通',
    适用路线:
      (category === '武器' && route === '法力') || effect.路线 === '法力'
        ? '法力'
        : effect.路线 === '斗气'
          ? '斗气'
          : '通用',
    使用方式: ['修为', '定向培养'].includes(type) ? '消耗' : '佩戴',
    归属人物ID: null,
    品阶: rank,
    珍贵度: rarity,
    效果: [effect],
  };
  if (effect.属性 && random() < 0.2) {
    effect.份额 = 0.5;
    const attribute = pick(
      (['生命', '防御', '攻击', '能量'] as const).filter(attr => attr !== effect.属性),
      random,
    );
    meta.效果!.push({
      类型: type,
      属性: attribute,
      ...(attribute === '能量' ? { 路线: route } : {}),
      份额: 0.5,
      强度: Math.round((0.8 + random() * 0.4) * 100) / 100,
    });
    if (attribute === '能量') meta.适用路线 = route;
  }
  return TreasureItemSchema.parse({
    名称: type === '不死之鸟' ? '纹章：不死之鸟' : '待命名宝物',
    数量: 1,
    固定规格: describeTreasure(meta) ?? type,
    宝物: meta,
  });
}

export function advanceTreasureOpportunities(
  state: TreasureGameplay,
  elapsedMs: number,
  newReplyId?: number,
): string | null {
  const system = state.宝物系统;
  if (!system) return null;
  // Mark a reply even when full: freeing a slot must never backfill old full-capacity rounds.
  const countReply = newReplyId !== undefined && newReplyId > system.最后计轮楼层;
  if (countReply) system.最后计轮楼层 = newReplyId!;
  if (Object.keys(system.机会).length >= OPPORTUNITY_LIMIT) return null;
  const person = state.人物[state.玩家人物ID ?? ''];
  const routes = Object.entries(person?.路线 ?? {}).filter(([key]) => key === '斗气' || key === '法力');
  if (!routes.length) return null;
  const [route, value] = routes.sort((a, b) => b[1].境界 - a[1].境界)[0];
  system.已计毫秒 = Math.min(system.间隔毫秒, system.已计毫秒 + Math.max(0, elapsedMs));
  if (countReply) system.已计轮数 = Math.min(PITY_ROUNDS, system.已计轮数 + 1);
  if (system.已计毫秒 < system.间隔毫秒 && system.已计轮数 < PITY_ROUNDS) return null;
  const random = randomOf(system);
  const item = rollTreasure(value.境界, route as '斗气' | '法力', random);
  const serial = ++system.序号;
  const id = `treasure-${serial}-${system.种子.toString(36)}`;
  system.机会[id] = { 序号: serial, 状态: item.名称 === '纹章：不死之鸟' ? '待追寻' : '待命名', 物品: item };
  system.已计毫秒 = 0;
  system.已计轮数 = 0;
  system.间隔毫秒 = 1200000 + Math.floor(random() * 1800001);
  return id;
}

export const inventoryTreasureCount = (state: TreasureGameplay) =>
  Object.values(state.库存).reduce(
    (sum, stock) => sum + Object.values(stock.物品).filter(item => !!item.宝物).length,
    0,
  );
export function claimTreasure(state: TreasureGameplay, id: string): boolean {
  const opportunity = state.宝物系统?.机会[id];
  if (!opportunity || !['追寻中', '待领取'].includes(opportunity.状态)) return false;
  if (inventoryTreasureCount(state) >= TREASURE_INVENTORY_LIMIT) {
    opportunity.状态 = '待领取';
    return false;
  }
  const stocks = state.库存 as Record<
    string,
    { 所属?: string; 资金?: number; 补给?: number; 材料?: number; 物品: Record<string, InventoryItem> }
  >;
  stocks[TREASURE_STOCK] ??= { 所属: '脚本宝物藏室', 资金: 0, 补给: 0, 材料: 0, 物品: {} };
  if (stocks[TREASURE_STOCK].物品[id]) return false;
  stocks[TREASURE_STOCK].物品[id] = structuredClone(opportunity.物品);
  delete state.宝物系统!.机会[id];
  return true;
}
export function protectTreasureOpportunities(next: Record<string, any>, previous: Record<string, any>): void {
  if (!next.玩法) return;
  if (previous.玩法?.宝物系统) next.玩法.宝物系统 = structuredClone(previous.玩法.宝物系统);
  else delete next.玩法.宝物系统;
  const claims = Array.isArray(next.玩法.宝物取得) ? next.玩法.宝物取得.slice(0, OPPORTUNITY_LIMIT) : [];
  for (const id of new Set(claims)) if (typeof id === 'string') claimTreasure(next.玩法, id);
  next.玩法.宝物取得 = [];
}
export function addTreasureOpportunitiesToView(view: Record<string, any>, state: TreasureGameplay): void {
  if (view.玩法) {
    delete view.玩法.宝物系统;
    delete view.玩法.宝物取得;
  }
  const pursuits = Object.entries(state.宝物系统?.机会 ?? {}).filter(([, entry]) => entry.状态 === '追寻中');
  if (pursuits.length)
    view.追寻中的宝物 = pursuits.map(([id, entry]) => ({
      机会ID: id,
      名称: entry.物品.名称,
      品阶: entry.物品.宝物.品阶,
      效果: describeTreasure(entry.物品.宝物) ?? entry.物品.固定规格,
      说明: '用户已选择追寻，请结合现有剧情安排来源和取得过程；尚未取得。确实取得后将机会ID写入玩法.宝物取得，脚本入库。',
    }));
}
