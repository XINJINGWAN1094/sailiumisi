import { equipmentSlots, type EquipmentSlot, type EquipmentState, type GameplayCommand } from '../../equipment';
import type { Person, Treasure } from './fixture';
import type { PortraitApi } from './portraits';
import { defaultPersonTriggerWords, personTriggerWords } from '../../people-context';
import {
  describeTreasure,
  accumulationName,
  growthVersion,
  growthPerDay,
  promotionSupported,
  realmTrainingBudget,
  talentMultiplier,
  worldSeconds,
  type Gameplay,
  type GrowingPerson,
} from '../../progression';

export type EquipmentApi = {
  version: number;
  treasureVersion?: number;
  personTriggersVersion?: number;
  read(): { token: string; gameplay: EquipmentState & Record<string, any> };
  apply(command: GameplayCommand, token: string): Promise<ReturnType<EquipmentApi['read']>>;
};
type MountedWindow = Window & {
  __selyumis_treasure_mount__?: { screen: 'people' | 'treasures'; assets: Record<string, string> };
};
export const mountedOptions = (window as MountedWindow).__selyumis_treasure_mount__;
export function findPortraitApi(): PortraitApi | undefined {
  try {
    return (window.parent as Window & { __selyumis_people_portraits_v1__?: PortraitApi }).__selyumis_people_portraits_v1__;
  } catch { return undefined; }
}
export function requiresLiveRuntime(): boolean {
  if (mountedOptions) return true;
  try {
    return !!(window.parent as Window & { TavernHelper?: unknown }).TavernHelper;
  } catch {
    return false;
  }
}
export function findEquipmentApi(): EquipmentApi | undefined {
  for (const frame of [window, window.parent]) {
    try {
      const api = (frame as unknown as Record<string, any>).__selyumis_equipment_v1__;
      if ([1, 2, 3].includes(api?.version) && typeof api.read === 'function' && typeof api.apply === 'function')
        return api;
    } catch {
      /* 跨源独立预览无权访问宿主，保持演示模式。 */
    }
  }
  return undefined;
}
const knightRealms = ['', '见习骑士', '正式骑士', '大骑士', '大地骑士', '天空骑士', '圣域骑士', '传奇骑士', '半神骑士'];

export function viewFromEquipmentState(gameplay: EquipmentState & Record<string, any>): {
  people: Person[];
  treasures: Treasure[];
} {
  const people = Object.entries(gameplay.人物).map(([id, value]) => {
    const data = value as Record<string, any>;
    const routes = Object.keys(data.路线);
    const route = data.路线.斗气 ?? data.路线.法力 ?? (Object.values(data.路线)[0] as any);
    const routeName = data.路线.斗气 ? '斗气' : data.路线.法力 ? '法力' : routes[0];
    return {
      id,
      name: data.姓名,
      profileType: data.档案类型 ?? '长期',
      isPlayer: gameplay.玩家人物ID === id,
      present: data.在场 === true,
      combat: data.参战 === true,
      triggerWords: personTriggerWords(value),
      defaultTriggerWords: defaultPersonTriggerWords(value),
      customTriggerWords: data._档案触发词 !== undefined,
      realm: data.路线.斗气 ? (knightRealms[route.境界] ?? `斗气 ${route.境界}阶`) : `法力 ${route?.境界 ?? '?'}阶`,
      hp: data.生命.当前,
      hpMax: data.生命.上限,
      energy: route?.当前能量 ?? 0,
      energyMax: route?.能量上限 ?? 0,
      defense: data.有效防御,
      attack: data.无资源攻击,
      cap: route?.单次投入上限 ?? 0,
      progress: route?.修炼进度 ?? 0,
      progressLabel: `${accumulationName(routeName ?? '成长')}积累`,
      demigod: route?.境界 === 8,
      aptitudes: data.资质,
      baseStats: data._成长?.基础面板 ? {
        生命: data._成长.基础面板.生命上限,
        防御: data._成长.基础面板.防御,
        普攻: data._成长.基础面板.攻击,
        能量: data._成长.基础面板.路线能量[routeName],
      } : undefined,
      progressMax: route && route.境界 < 8
        ? data._成长?.规则版本 === growthVersion
          ? realmTrainingBudget(route.境界)
          : 100 * route.境界 * route.品质
        : 0,
      nextRealm: route?.境界 === 8 ? '成神尚未开放' :
        data.路线.斗气 ? (knightRealms[route.境界 + 1] ?? '待定') : `法师 ${route.境界 + 1}阶`,
      routes,
      routeRanks: Object.fromEntries(routes.map(name => [name, data.路线[name].境界])),
      talent: data.天赋?.等级,
      talentFactor: data.天赋 ? talentMultiplier(data as GrowingPerson) : undefined,
      growthNote: !data.天赋
        ? '随世界时间成长'
        : worldSeconds(gameplay.时间?.剧情时间) === null
          ? '待剧情时间确定'
          : !promotionSupported(data as GrowingPerson)
              ? '晋阶面板待明确'
              : `每日 +${growthPerDay(gameplay as Gameplay, id, routeName).toFixed(1)} ${accumulationName(routeName)}积累；${
                route?.境界 === 8 ? '四维持续增长，无培养上限' : '积累达标晋阶，四维按资质成长'}`,
    };
  });
  const treasures: Treasure[] = [];
  for (const [stockId, stock] of Object.entries(gameplay.库存)) {
    for (const [itemId, item] of Object.entries(stock.物品)) {
      if (!item.宝物 || item.数量 <= 0) continue;
      let ownerId = item.宝物.归属人物ID ?? undefined;
      let slot: EquipmentSlot | undefined;
      for (const [personId, person] of Object.entries(gameplay.人物)) {
        for (const slotId of equipmentSlots) {
          const ref = person.装备?.[slotId];
          if (ref?.库存ID === stockId && ref.物品ID === itemId) {
            ownerId = personId;
            slot = slotId;
          }
        }
      }
      treasures.push({
        id: JSON.stringify([stockId, itemId]),
        name: item.名称,
        category: item.宝物.大类,
        quantity: item.数量,
        use: item.宝物.使用方式 === '佩戴' ? 'wear' : item.宝物.使用方式 === '消耗' ? 'consume' : 'special',
        effect: describeTreasure(item.宝物) ?? item.固定规格,
        description: '',
        ownerId,
        slot,
        metadata: item.宝物,
        inventoryRef: { 库存ID: stockId, 物品ID: itemId },
      });
    }
  }
  return { people, treasures };
}
