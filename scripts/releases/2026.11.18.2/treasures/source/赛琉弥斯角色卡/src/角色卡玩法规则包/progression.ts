import type { EquipmentState, EquipmentRef, TreasureMetadata } from './equipment';
import { describeConditionalEffect, effectStrength, isConditionalEffect } from './treasure-effects';
import {
  dragonBodyAt,
  dragonBodyLabel,
  dragonCoefficients,
  dragonScale,
  dragonTemplates,
  type DragonBody,
  type DragonGrowth,
} from './dragon-growth';
export { dragonTemplates } from './dragon-growth';

export const talentNames = ['平常', '良好', '优秀', '卓越', '天才', '绝世'] as const;
export const talentMultipliers = [1, 1.5, 2, 3, 4.5, 6] as const;
/** 各行合计 100；初始境界提高时，各高档天赋的累计概率均不下降。 */
export const talentWeights = [
  [60, 25, 10, 4, 0.9, 0.1],
  [42, 30, 18, 8, 1.8, 0.2],
  [25, 30, 27, 14, 3.5, 0.5],
  [12, 23, 32, 24, 8, 1],
  [5, 13, 27, 36, 16, 3],
  [2, 6, 17, 36, 32, 7],
  [0.5, 2.5, 9, 28, 43, 17],
  [0.1, 0.9, 4, 15, 45, 35],
] as const;
export type Talent = { 等级: (typeof talentNames)[number]; 初始境界: number; 规则版本: 1 };
export const aptitudeAttributes = ['生命', '防御', '攻击', '能量'] as const;
export type Aptitudes = Record<(typeof aptitudeAttributes)[number], number>;
/** 存档路线键保持稳定；这里仅规定成长名称，不混同战斗余额或元素亲和。 */
export const accumulationName = (route: string) => (route === '法力' ? '元素' : route);
export const treasureCategoryName = (category: string) => (category === '修为秘宝' ? '成长秘宝' : category);
export const growthVersion = 3 as const;
export const attributeCap = (rank: number) => (rank === 8 ? Infinity : 2.25);
export function aptitudesFor(scope: string, personId: string): Aptitudes {
  return Object.fromEntries(aptitudeAttributes.map(attribute => {
    let hash = 2166136261;
    for (const char of `aptitudes-v1|${scope}|${personId}|${attribute}`)
      hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    return [attribute, (80 + (hash >>> 0) % 41) / 100];
  })) as Aptitudes;
}
export type Route = {
  境界: number;
  品质: number;
  当前能量: number;
  能量上限: number;
  单次投入上限: number;
  修炼进度: number;
};
export type BasePanel = { 生命上限: number; 防御: number; 攻击: number; 路线能量: Record<string, number> };
type Growth = {
  /** 战斗仍采用质变V2；成长V3为独立积累，不隐式转换旧版派生进度。 */
  规则版本?: 3;
  结算至: string | null;
  基础面板: BasePanel;
  吸收: Record<string, { 日期: string; 上限: number; 已用: number }>;
  晋升待报: Record<string, { 原境界: number; 新境界: number }>;
  巨龙生长?: DragonGrowth;
};
export type GrowingPerson = EquipmentState['人物'][string] & {
  种族?: string;
  体型模板?: string | null;
  巨龙体型?: DragonBody;
  面板依据: string;
  生命: { 当前: number; 上限: number };
  有效防御: number;
  无资源攻击: number;
  路线: Record<string, Route>;
  天赋?: Talent;
  资质?: Aptitudes;
  _成长?: Growth;
};
export type Gameplay = EquipmentState & {
  _规则确认?: { 数值体系?: '质变V2' };
  时间: { 剧情时间: string | null };
  人物: Record<string, GrowingPerson>;
};
const DAY = 86400;
const EPSILON = 1e-9;
const round = (value: number) => Math.round(value * 1e9) / 1e9;
export const threshold = (route: Route) => 100 * route.境界 * route.品质;
/** R1—R7为晋阶预算；R8仅用于线性属性增长与秘宝额度，不代表成神门槛。 */
export const realmTrainingBudget = (rank: number) => 100 * rank * 2 ** (rank - 1);
export function realmQuality(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 8) throw new Error('境界须为 R1—R8。');
  return 3 ** (rank - 1);
}
export function realmBasePanel(
  name: string,
  rank: number,
  species = '人类',
  body?: string | null,
  length?: number,
): BasePanel {
  if (name !== '斗气' && name !== '法力') throw new Error('尚未定义此路线的质变模板。');
  const q = realmQuality(rank),
    knight = name === '斗气';
  if (species === '巨龙' && (length !== undefined || (body && Object.hasOwn(dragonTemplates, body)))) {
    const t = length !== undefined ? dragonScale(length) : dragonTemplates[body!];
    return {
      生命上限: 100 * t.s * q * q,
      防御: t.defense * q * q,
      攻击: t.attack * q * q,
      路线能量: { [name]: 150 * t.s * q },
    };
  }
  if (species !== '人类') throw new Error('种族或巨龙体型模板尚未明确。');
  return {
    生命上限: (knight ? 100 : 80) * q * q,
    防御: round((knight ? 0.9 : 0.7) * q * q),
    攻击: (knight ? 5 : 3) * q * q,
    路线能量: { [name]: (knight ? 100 : 150) * q },
  };
}
export function realmGrowthSupported(person: GrowingPerson): boolean {
  const routes = Object.entries(person.路线);
  return (
    person._成长?.规则版本 === growthVersion &&
    (person.种族 === '人类' || (person.种族 === '巨龙' && dragonCoefficients(person) !== null)) &&
    routes.length === 1 &&
    ['斗气', '法力'].includes(routes[0][0]) &&
    Number.isInteger(routes[0][1].境界) &&
    routes[0][1].境界 >= 1 &&
    routes[0][1].境界 <= 8 &&
    routes[0][1].品质 === realmQuality(routes[0][1].境界)
  );
}

/** 新聊天采用明确数值体系后建立新人物；拒绝旧档隐式迁移。 */
export function initializeRealmGrowth(state: Gameplay, personId: string): void {
  const person = state.人物[personId];
  if (
    !person ||
    person._成长 ||
    person.面板依据.includes('N2') ||
    !['人类', '巨龙'].includes(person.种族 ?? '') ||
    Object.values(person.装备 ?? {}).some(Boolean)
  )
    throw new Error('新制建档只接受尚无成长记录、未装备的明确模板人物；不处理旧档迁移。');
  const routes = Object.entries(person.路线);
  if (routes.length !== 1) throw new Error('新制目前只接受单路线人物。');
  const [name, route] = routes[0],
    standard = realmBasePanel(name, route.境界, person.种族, person.体型模板, person.巨龙体型?.全长米);
  if (route.品质 !== realmQuality(route.境界) || !Number.isFinite(route.修炼进度) ||
      route.修炼进度 < 0 || (route.境界 < 8 && route.修炼进度 >= realmTrainingBudget(route.境界)))
    throw new Error('建档须使用当前品质及有效本阶积累；普通境界积累已满的人物须按晋阶后的状态建档。');
  const base = basePanel(person);
  const actual = [base.生命上限, base.防御, base.攻击, base.路线能量[name]];
  const reference = [standard.生命上限, standard.防御, standard.攻击, standard.路线能量[name]];
  if (
    actual.some(
      (value, i) =>
        !Number.isFinite(value) || value < 0 || ((i === 0 || i === 3) && value === 0) ||
        value > reference[i] * attributeCap(route.境界),
    )
  )
    throw new Error('基础属性无效，或超过普通境界本阶标准的225%；半神基础属性不设培养上限。');
  if (
    !Number.isFinite(person.生命.当前) ||
    person.生命.当前 < 0 ||
    person.生命.当前 > person.生命.上限 ||
    !Number.isFinite(route.当前能量) ||
    route.当前能量 < 0 ||
    route.当前能量 > route.能量上限 ||
    route.单次投入上限 !== route.能量上限 / 5
  )
    throw new Error('新制建档须提供有效生命、能量余额与单次投入上限。');
  person._成长 = {
    规则版本: growthVersion,
    结算至: worldSeconds(state.时间.剧情时间) === null ? null : state.时间.剧情时间,
    基础面板: base,
    吸收: {},
    晋升待报: {},
  };
  person.面板依据 = `质变V2；${person.种族}${name} R${route.境界}／Q${route.品质}`;
  if (person.种族 === '巨龙' && person.巨龙体型) {
    person.体型模板 = dragonBodyLabel(person.巨龙体型.全长米);
    initializeDragonAnchor(person, person._成长.结算至);
  }
}

function initializeDragonAnchor(person: GrowingPerson, time: string | null): void {
  const body = person.巨龙体型;
  if (person.种族 !== '巨龙' || !body || person._成长?.规则版本 !== growthVersion) return;
  person._成长.巨龙生长 = { 规则版本: 1, 建档年龄: body.年龄, 建档全长米: body.全长米, 起算时间: time };
}

/** 先按原体型结清境界进度，再等比例换体型基准，两者不相互赠送进度。 */
function settleDragonBody(state: Gameplay, id: string, time: string, now: number): void {
  const person = state.人物[id],
    growth = person._成长,
    oldBody = person.巨龙体型;
  if (person.种族 !== '巨龙' || !oldBody || growth?.规则版本 !== growthVersion) return;
  const anchor = growth.巨龙生长,
    start = worldSeconds(anchor?.起算时间 ?? null);
  if (!anchor || start === null || anchor.起算时间?.startsWith('星辉历') !== time.startsWith('星辉历')) {
    initializeDragonAnchor(person, time);
    return;
  }
  if (now < start) return;
  const next = dragonBodyAt(anchor, (now - start) / (360 * DAY));
  if (next.全长米 !== oldBody.全长米) {
    const before = dragonScale(oldBody.全长米),
      after = dragonScale(next.全长米);
    const hpRatio = person.生命.当前 / person.生命.上限;
    const energyRatios = Object.fromEntries(
      Object.entries(person.路线).map(([name, route]) => [name, route.当前能量 / route.能量上限]),
    );
    growth.基础面板.生命上限 *= after.s / before.s;
    growth.基础面板.防御 *= after.defense / before.defense;
    growth.基础面板.攻击 *= after.attack / before.attack;
    for (const name of Object.keys(growth.基础面板.路线能量)) growth.基础面板.路线能量[name] *= after.s / before.s;
    person.巨龙体型 = next;
    person.体型模板 = dragonBodyLabel(next.全长米);
    recalculatePanel(state, id, false);
    person.生命.当前 = Math.min(person.生命.上限, round(hpRatio * person.生命.上限));
    for (const [name, route] of Object.entries(person.路线))
      route.当前能量 = Math.min(route.能量上限, round(energyRatios[name] * route.能量上限));
  } else person.巨龙体型 = next;
}
export const talentMultiplier = (person: GrowingPerson) =>
  person.天赋 ? talentMultipliers[talentNames.indexOf(person.天赋.等级)] : 0;

/** 星辉历每月 30 天、每年 360 天；另兼容独立玩法“第N日”。不读取现实时间。 */
export function worldSeconds(time: string | null): number | null {
  if (!time) return null;
  const star = /^星辉历\s*(\d+)年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  const day = /^第(\d+)日\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!star && !day) return null;
  const y = star ? Number(star[1]) : 0,
    m = star ? Number(star[2]) : 1;
  const d = Number(star ? star[3] : day![1]);
  const h = Number(star ? star[4] : day![2]),
    min = Number(star ? star[5] : day![3]);
  const sec = Number((star ? star[6] : day![4]) ?? 0);
  if (m < 1 || m > 12 || d < 1 || (star && d > 30) || h > 23 || min > 59 || sec > 59) return null;
  const result = ((y * 360 + (m - 1) * 30 + d - 1) * 24 + h) * 3600 + min * 60 + sec;
  return Number.isSafeInteger(result) ? result : null;
}

/** 按聊天身份与稳定人物 ID 固定抽签；无全局抽签表，刷新/同分支重生成不会刷结果。 */
export function talentFor(scope: string, personId: string, initialRank: number): Talent {
  const rank = Math.max(1, Math.min(8, initialRank));
  let hash = 2166136261;
  for (const char of `talent-v1|${scope}|${personId}`) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  let pick = ((hash >>> 0) / 4294967296) * 100;
  let index = 0;
  for (; index < talentNames.length - 1; index++) {
    pick -= talentWeights[rank - 1][index];
    if (pick < 0) break;
  }
  return { 等级: talentNames[index], 初始境界: rank, 规则版本: 1 };
}

export function bonusEligible(person: GrowingPerson, item: TreasureMetadata): boolean {
  const route = item.子类 === '法杖' ? '法力' : item.适用路线;
  const ranks = Object.entries(person.路线)
    .filter(([key]) => route === '通用' || key === route)
    .map(([, value]) => value.境界);
  return ranks.length > 0 && Math.max(...ranks) >= (item.品阶 ?? 1);
}
function worn(state: Gameplay, person: GrowingPerson): TreasureMetadata[] {
  const result: TreasureMetadata[] = [];
  const seen = new Set<string>();
  for (const ref of Object.values(person.装备 ?? {})) {
    if (!ref) continue;
    const key = JSON.stringify(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = state.库存[ref.库存ID]?.物品[ref.物品ID];
    if (item?.数量 === 1 && item.宝物 && bonusEligible(person, item.宝物)) result.push(item.宝物);
  }
  return result;
}
export function effectUnit(rank: number, attribute: string): number {
  const q = realmQuality(rank);
  // 由物品品阶决定绝对值，不随使用者的境界、体型或半神积累放大。
  return attribute === '生命' ? 10 * q * q : attribute === '能量' ? 10 * q :
    attribute === '防御' ? 0.045 * q * q : 0.5 * q * q;
}
const effectPercent = (rank: number) => Math.min(0.05 * rank, 0.2);
const baseSpeed = (rank: number) => (100 * rank) / 360;

export function growthPerDay(state: Gameplay, personId: string, routeName: string): number {
  const person = state.人物[personId],
    route = person?.路线[routeName];
  if (!route || route.境界 > 8 || (route.境界 === 8 && person._成长?.规则版本 !== growthVersion)) return 0;
  const speed = baseSpeed(route.境界) * talentMultiplier(person);
  let bonus = 0;
  for (const item of worn(state, person))
    for (const effect of item.效果 ?? []) {
      if (effect.类型 !== '成长加速' || effect.路线 !== routeName || !item.品阶 || route.境界 < item.品阶) continue;
      const p = effectPercent(item.品阶),
        cap = baseSpeed(item.品阶) * p * 1.5;
      bonus += Math.min(speed * p, cap) * effectStrength(effect);
    }
  return speed + Math.min(bonus, speed * 0.5);
}

function basePanel(person: GrowingPerson): BasePanel {
  return {
    生命上限: person.生命.上限,
    防御: person.有效防御,
    攻击: person.无资源攻击,
    路线能量: Object.fromEntries(Object.entries(person.路线).map(([key, route]) => [key, route.能量上限])),
  };
}
/** 零基础只用已定义 N2 单路线的参考额度；百分比自身仍为零。 */
function referenceBase(person: GrowingPerson, attribute: string): number {
  const routes = Object.entries(person.路线);
  if (realmGrowthSupported(person)) {
    const base = realmBasePanel(routes[0][0], routes[0][1].境界, person.种族, person.体型模板, person.巨龙体型?.全长米);
    return attribute === '攻击' ? base.攻击 : attribute === '防御' ? base.防御 : 0;
  }
  if (routes.length !== 1 || !person.面板依据.includes('N2')) return 0;
  const [name, route] = routes[0],
    q2 = route.品质 ** 2;
  if (name !== '斗气' && name !== '法力') return 0;
  return attribute === '攻击'
    ? (name === '斗气' ? 5 : 3) * q2
    : attribute === '防御'
      ? (name === '斗气' ? 2 : 1) * q2
      : 0;
}

export function recalculatePanel(state: Gameplay, personId: string, clampCurrent = true): void {
  const person = state.人物[personId],
    base = person._成长?.基础面板;
  if (!base) return;
  const items = worn(state, person);
  function total(attribute: string, original: number, routeName?: string): number {
    let add = 0;
    for (const item of items) {
      if (attribute === '攻击') add += item.固定加成?.攻击 ?? 0;
      if (attribute === '防御') add += item.固定加成?.防御 ?? 0;
      if (!item.品阶) continue;
      for (const effect of item.效果 ?? []) {
        if (
          effect.属性 !== attribute ||
          (attribute === '能量' && (effect.路线 !== routeName || person.路线[routeName!].境界 < item.品阶))
        )
          continue;
        const fixed = effectUnit(item.品阶, attribute);
        if (effect.类型 === '固定属性') add += fixed * effectStrength(effect);
        if (effect.类型 === '比例属性') add += Math.min(original * effectPercent(item.品阶), fixed * 1.5) * effectStrength(effect);
      }
    }
    // 普通境界防御装备以本阶标准的10%封顶，避免培养与比例装备相乘越过不破防临界点。
    const routes = Object.values(person.路线);
    const cap = attribute === '防御' && realmGrowthSupported(person) && routes[0].境界 < 8
      ? referenceBase(person, attribute) * 0.1
      : (original || referenceBase(person, attribute)) * 0.5;
    return round(original + Math.min(add, cap));
  }
  person.生命.上限 = total('生命', base.生命上限);
  person.有效防御 = total('防御', base.防御);
  person.无资源攻击 = total('攻击', base.攻击);
  if (clampCurrent) person.生命.当前 = Math.min(person.生命.当前, person.生命.上限);
  for (const [name, route] of Object.entries(person.路线)) {
    if (!Object.hasOwn(base.路线能量, name)) base.路线能量[name] = route.能量上限;
    route.能量上限 = total('能量', base.路线能量[name], name);
    route.单次投入上限 = route.能量上限 / 5;
    if (clampCurrent) route.当前能量 = Math.min(route.当前能量, route.能量上限);
  }
}
export function promotionSupported(person: GrowingPerson): boolean {
  if (person._成长?.规则版本 === growthVersion) return realmGrowthSupported(person);
  const routes = Object.entries(person.路线);
  return (
    routes.length === 1 &&
    ['斗气', '法力'].includes(routes[0][0]) &&
    person.面板依据.includes('N2') &&
    routes[0][1].品质 === 2 ** (routes[0][1].境界 - 1)
  );
}
function promote(state: Gameplay, personId: string, routeName: string): void {
  const person = state.人物[personId],
    route = person.路线[routeName],
    growth = person._成长!;
  const hpRatio = person.生命.当前 / person.生命.上限,
    energyRatio = route.当前能量 / route.能量上限;
  const from = route.境界;
  route.修炼进度 = Math.max(0, route.修炼进度 - threshold(route));
  route.境界++;
  route.品质 = 2 ** (route.境界 - 1);
  growth.基础面板.生命上限 *= 4;
  growth.基础面板.防御 *= 4;
  growth.基础面板.攻击 *= 4;
  growth.基础面板.路线能量[routeName] *= 2;
  recalculatePanel(state, personId, false);
  person.生命.当前 = Math.floor(hpRatio * person.生命.上限);
  route.当前能量 = Math.floor(energyRatio * route.能量上限);
  person.面板依据 = `N2待评审测试基准；${routeName} R${route.境界}／Q${route.品质}；沿用原体型模板`;
  growth.晋升待报[routeName] = { 原境界: growth.晋升待报[routeName]?.原境界 ?? from, 新境界: route.境界 };
}
function advance(state: Gameplay, id: string, name: string, days: number): void {
  const person = state.人物[id],
    route = person.路线[name];
  if (person._成长?.规则版本 === growthVersion) {
    advanceRealm(state, id, name, days);
    return;
  }
  if (route.境界 >= 8) return;
  if (!promotionSupported(person)) {
    route.修炼进度 += growthPerDay(state, id, name) * days;
    return;
  }
  // 每次循环至多跨一阶，最多七次；不逐日或逐秒执行。
  while (route.境界 < 8) {
    const speed = growthPerDay(state, id, name),
      needed = Math.max(0, threshold(route) - route.修炼进度);
    if (route.修炼进度 + days * speed + EPSILON < threshold(route)) {
      route.修炼进度 += days * speed;
      break;
    }
    days = Math.max(0, days - (speed > 0 ? needed / speed : 0));
    route.修炼进度 = Math.max(route.修炼进度, threshold(route));
    promote(state, id, name);
    if (days <= EPSILON && route.修炼进度 < threshold(route)) break;
  }
}

/** 独立积累决定普通晋阶；按资质奖励四维。半神持续线性积累，不自动进入神阶。 */
function advanceRealm(state: Gameplay, id: string, name: string, days: number, extraBudget = 0): void {
  const person = state.人物[id],
    route = person.路线[name],
    growth = person._成长!;
  if (!realmGrowthSupported(person) || !person.资质) throw new Error('人物成长版本、资质或模板不匹配，停止结算。');
  const hpRatio = person.生命.当前 / person.生命.上限;
  const energyRatio = route.当前能量 / route.能量上限;
  let changed = false;
  // 最多七次晋阶，再结算一次半神剩余积累，不逐日循环。
  while (true) {
    const standard = realmBasePanel(name, route.境界, person.种族, person.体型模板, person.巨龙体型?.全长米),
      base = growth.基础面板;
    const b = [standard.生命上限, standard.防御, standard.攻击, standard.路线能量[name]];
    const values = [base.生命上限, base.防御, base.攻击, base.路线能量[name]];
    const budget = realmTrainingBudget(route.境界),
      speed = growthPerDay(state, id, name);
    const needed = route.境界 < 8 ? Math.max(0, budget - route.修炼进度) : Infinity;
    const available = extraBudget + days * speed;
    const ready = route.境界 < 8 && needed <= available + budget * 1e-10;
    const spent = ready ? needed : available;
    const fromExtra = Math.min(extraBudget, spent);
    extraBudget -= fromExtra;
    if (speed > 0) days = Math.max(0, days - (spent - fromExtra) / speed);
    const grown = values.map((v, i) => Math.min(b[i] * attributeCap(route.境界),
      v + (b[i] * 0.5 * spent * person.资质![aptitudeAttributes[i]]) / budget));
    if (grown.some(v => !Number.isFinite(v))) throw new Error('属性数值超出可计算范围，本次结算未写入。');
    [base.生命上限, base.防御, base.攻击, base.路线能量[name]] = grown;
    changed ||= spent > 0 || ready;
    if (!ready) {
      route.修炼进度 += spent;
      if (!Number.isFinite(route.修炼进度)) throw new Error('积累数值超出可计算范围，本次结算未写入。');
      break;
    }
    const from = route.境界++;
    route.品质 = realmQuality(route.境界);
    base.生命上限 *= 6;
    base.防御 *= 6;
    base.攻击 *= 6;
    base.路线能量[name] *= 2;
    route.修炼进度 = 0;
    growth.晋升待报[name] = { 原境界: growth.晋升待报[name]?.原境界 ?? from, 新境界: route.境界 };
    person.面板依据 = `质变V2；${person.种族}${name} R${route.境界}／Q${route.品质}`;
  }
  if (changed) {
    recalculatePanel(state, id, false);
    person.生命.当前 = Math.min(person.生命.上限, round(hpRatio * person.生命.上限));
    route.当前能量 = Math.min(route.能量上限, round(energyRatio * route.能量上限));
  }
}

export function settleGameplay(state: Gameplay, scope: string): void {
  const time = state.时间.剧情时间,
    now = worldSeconds(time);
  for (const [id, person] of Object.entries(state.人物)) {
    if (state._规则确认?.数值体系 === '质变V2' && person._成长 && person._成长.规则版本 !== growthVersion)
      throw new Error('本包采用独立积累成长V3；检测到旧成长记录，不执行隐式迁移或重置。');
    person.别名 ??= [];
    person.档案类型 ??= '长期';
    person.在场 ??= false;
    person.参战 ??= false;
    person.元素亲和 ??= null;
    const ranks = Object.values(person.路线).map(route => route.境界);
    if (!person._成长 && state._规则确认?.数值体系 === '质变V2') initializeRealmGrowth(state, id);
    person.天赋 ??= talentFor(scope, id, Math.max(1, ...ranks));
    person.资质 ??= aptitudesFor(scope, id);
    person._成长 ??= { 结算至: now === null ? null : time, 基础面板: basePanel(person), 吸收: {}, 晋升待报: {} };
    recalculatePanel(state, id);
    if (now === null) continue;
    const before = worldSeconds(person._成长.结算至);
    // 首次接入从现在起算；不补发未知历史。时间倒退也不降低游标再次领取。
    if (before === null || person._成长.结算至?.startsWith('星辉历') !== time?.startsWith('星辉历')) {
      settleDragonBody(state, id, time!, now);
      person._成长.结算至 = time;
      continue;
    }
    if (now < before) continue;
    for (const name of Object.keys(person.路线)) advance(state, id, name, (now - before) / DAY);
    settleDragonBody(state, id, time!, now);
    person._成长.结算至 = time;
  }
}

/** 调用方在副本上执行并一次写回；失败不会吞物品或占用日额度。 */
export function consumeCultivation(state: Gameplay, ref: EquipmentRef, personId: string, name: string): void {
  const person = state.人物[personId],
    route = person?.路线[name];
  const item = state.库存[ref.库存ID]?.物品[ref.物品ID],
    meta = item?.宝物;
  if (!person?._成长 || !route || !realmGrowthSupported(person) || !person.资质)
    throw new Error('该人物尚未采用独立积累成长规则。');
  const now = worldSeconds(state.时间.剧情时间);
  if (now === null) throw new Error('剧情时间尚未确定，秘宝已保留。');
  if (now < (worldSeconds(person._成长.结算至) ?? now))
    throw new Error('剧情时间早于成长存档，请恢复匹配的分支后再使用。');
  if (
    !item ||
    item.数量 < 1 ||
    !meta?.品阶 ||
    meta.大类 !== '修为秘宝' ||
    meta.使用方式 !== '消耗' ||
    !bonusEligible(person, meta) ||
    route.境界 < meta.品阶
  )
    throw new Error('秘宝不存在，或路线、境界不满足使用要求。');
  const effects = meta.效果 ?? [];
  if (!effects.length || effects.some(effect =>
    !['修为', '定向培养'].includes(effect.类型) ||
    (effect.类型 === '修为' || effect.属性 === '能量' ? effect.路线 !== name : Boolean(effect.路线))))
    throw new Error('此秘宝没有匹配路线的积累或定向培养效果。');
  if (effects.some(effect => effect.类型 !== effects[0].类型))
    throw new Error('积累秘宝与定向培养使用独立效果预算。');
  if (effects[0].类型 === '定向培养') {
    const base = person._成长.基础面板;
    const standard = realmBasePanel(name, route.境界, person.种族, person.体型模板, person.巨龙体型?.全长米);
    const before = [base.生命上限, base.防御, base.攻击, base.路线能量[name]];
    const references = [standard.生命上限, standard.防御, standard.攻击, standard.路线能量[name]];
    const after = [...before];
    for (const effect of effects) {
      const i = aptitudeAttributes.indexOf(effect.属性!);
      if (i < 0) throw new Error('定向培养属性未定义。');
      after[i] += effectUnit(meta.品阶, effect.属性!) * effectStrength(effect);
    }
    if (after.some((v, i) => !Number.isFinite(v) || v > references[i] * attributeCap(route.境界) + EPSILON))
      throw new Error('使用后会超过本阶培养上限，秘宝已保留。');
    const hpRatio = person.生命.当前 / person.生命.上限;
    const energyRatio = route.当前能量 / route.能量上限;
    [base.生命上限, base.防御, base.攻击, base.路线能量[name]] = after;
    recalculatePanel(state, personId, false);
    person.生命.当前 = Math.min(person.生命.上限, round(hpRatio * person.生命.上限));
    route.当前能量 = Math.min(route.能量上限, round(energyRatio * route.能量上限));
    item.数量--;
    if (item.数量 === 0) delete state.库存[ref.库存ID].物品[ref.物品ID];
    return;
  }
  const amount = effects.reduce((sum, effect) => sum + realmTrainingBudget(meta.品阶!) * 0.1 * effectStrength(effect), 0);
  const date = String(Math.floor(now / DAY));
  const limit =
    person._成长.吸收[name]?.日期 === date
      ? person._成长.吸收[name]
      : {
          日期: date,
          上限: realmTrainingBudget(route.境界) * 0.2,
          已用: 0,
        };
  if (limit.已用 + amount > limit.上限 + EPSILON) throw new Error('今日剩余吸收额度不足以完整使用，秘宝已保留。');
  limit.已用 += amount;
  person._成长.吸收[name] = limit;
  advanceRealm(state, personId, name, 0, amount);
  item.数量--;
  if (item.数量 === 0) delete state.库存[ref.库存ID].物品[ref.物品ID];
}

/** 天赋、基础面板、成长与效果归脚本；正文仍可更新实际伤势和能量消耗。 */
export function protectProgression(next: Record<string, any>, previous: Record<string, any>): void {
  if (previous.玩法?._规则确认) next.玩法._规则确认 = structuredClone(previous.玩法._规则确认);
  for (const [id, old] of Object.entries(previous.玩法?.人物 ?? {}) as [string, GrowingPerson][]) {
    if (old._成长 && !next.玩法?.人物?.[id]) next.玩法.人物[id] = structuredClone(old);
  }
  for (const [id, person] of Object.entries(next.玩法?.人物 ?? {}) as [string, GrowingPerson][]) {
    const before: GrowingPerson | undefined = previous.玩法?.人物?.[id];
    delete person.天赋;
    delete person.资质;
    delete person._成长;
    if (!before) continue;
    person.档案类型 = before.档案类型 ?? '长期';
    if (before.天赋) person.天赋 = structuredClone(before.天赋);
    if (before.资质) person.资质 = structuredClone(before.资质);
    if (!before._成长) continue;
    person._成长 = structuredClone(before._成长);
    if (before._成长.规则版本 === growthVersion) {
      person.种族 = before.种族;
      person.体型模板 = before.体型模板;
      delete person.巨龙体型;
      if (before.巨龙体型) person.巨龙体型 = structuredClone(before.巨龙体型);
      // 兼修合并尚未定义；不得新增路线绕过既有基础面板保护。
      for (const name of Object.keys(person.路线)) if (!Object.hasOwn(before.路线, name)) delete person.路线[name];
    }
    // 成功的 MVU 回复已看到父分支的提示；本轮新晋升会在结算后重新排入。
    person._成长.晋升待报 = {};
    person.有效防御 = before.有效防御;
    person.无资源攻击 = before.无资源攻击;
    person.生命.上限 = before.生命.上限;
    person.面板依据 = before.面板依据;
    for (const [name, old] of Object.entries(before.路线)) {
      const energy = person.路线[name]?.当前能量 ?? old.当前能量;
      person.路线[name] = { ...old, 当前能量: energy };
    }
  }
}

export function addProgressionToView(view: Record<string, any>, state: Gameplay): void {
  const promotions: string[] = [];
  for (const [id, person] of Object.entries(state.人物)) {
    for (const [name, event] of Object.entries(person._成长?.晋升待报 ?? {}))
      promotions.push(`${person.姓名}：${name} R${event.原境界}→R${event.新境界}`);
    const visible = view.玩法?.人物?.[id];
    if (!visible) continue;
    delete visible._成长;
    if (person.巨龙体型)
      visible.巨龙体型 = {
        年龄: person.巨龙体型.年龄 === null ? null : Number(person.巨龙体型.年龄.toFixed(2)),
        全长米: Number(person.巨龙体型.全长米.toFixed(3)),
      };
    if (person.天赋) visible.天赋 = { 等级: person.天赋.等级, 成长倍率: talentMultiplier(person) };
    if (person.资质) visible.资质 = { ...person.资质 };
    visible.成长说明 = '斗气／元素积累由脚本结算；普通境界积累达标晋阶。半神持续培养，当前版本不执行成神。';
  }
  if (promotions.length)
    view.晋升提示 = {
      人物: promotions,
      描写: '晋升已由脚本结算。按人物关系、剧情与领地实力决定出场、略提或不写，不必逐一庆祝。',
    };
}

export function describeTreasure(meta: TreasureMetadata): string | undefined {
  if (!meta.品阶 || !meta.效果) return undefined;
  return meta.效果
    .map(effect => {
      const fraction = effectStrength(effect),
        rank = meta.品阶!;
      if (isConditionalEffect(effect)) return describeConditionalEffect(rank, effect);
      if (effect.类型 === '修为') return `${accumulationName(effect.路线!)}积累 +${(realmTrainingBudget(rank) * 0.1 * fraction).toFixed(1)}，按资质增长四维，使用后消耗`;
      if (effect.类型 === '定向培养') return `基础${effect.属性}永久 +${(effectUnit(rank, effect.属性!) * fraction).toFixed(1)}，不增加积累，使用后消耗`;
      const percent = effectPercent(rank) * fraction * 100;
      if (effect.类型 === '成长加速')
        return `${accumulationName(effect.路线!)}积累速度 +${percent.toFixed(1)}%，额外最多 ${(baseSpeed(rank) * effectPercent(rank) * 1.5 * fraction).toFixed(1)}/日`;
      const fixed = effectUnit(rank, effect.属性!) * fraction;
      return effect.类型 === '固定属性'
        ? `${effect.路线 ?? ''}${effect.属性} +${fixed.toFixed(1)}`
        : `${effect.路线 ?? ''}${effect.属性} +${percent.toFixed(1)}%，最多 +${(fixed * 1.5).toFixed(1)}`;
    })
    .join('；');
}
