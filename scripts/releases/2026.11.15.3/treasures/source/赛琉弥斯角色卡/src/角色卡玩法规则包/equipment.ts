import { personalLearningProject, scriptOwnedStockIds } from './economy-ownership';
import { normalizePersonTriggerWords } from './people-context';
import type { TreasureEffect, TreasureRarity } from './treasure-effects';
export type { TreasureEffect } from './treasure-effects';

/** 装备只引用既有库存。图标由大类决定；武器外形与路线限制另行记录。 */
export const treasureCategories = ['武器', '防具', '饰品', '修为秘宝', '特殊物品'] as const;
export type TreasureCategory = (typeof treasureCategories)[number];
export const equipmentSlots = ['weapon', 'armor', 'accessory1', 'accessory2', 'growth', 'special'] as const;
export type EquipmentSlot = (typeof equipmentSlots)[number];
export const categoryIcons: Record<TreasureCategory, string> = {
  武器: 'category-weapon',
  防具: 'category-armor',
  饰品: 'category-accessory',
  修为秘宝: 'category-cultivation',
  特殊物品: 'category-special',
};
export const slotCategories: Record<EquipmentSlot, TreasureCategory> = {
  weapon: '武器',
  armor: '防具',
  accessory1: '饰品',
  accessory2: '饰品',
  growth: '修为秘宝',
  special: '特殊物品',
};
export type EquipmentRef = { 库存ID: string; 物品ID: string };
export type TreasureMetadata = {
  大类: TreasureCategory;
  子类: '普通' | '法杖';
  适用路线: '通用' | '斗气' | '法力';
  使用方式: '佩戴' | '消耗' | '特殊';
  归属人物ID: string | null;
  固定加成?: { 攻击: number; 防御: number };
  品阶?: number;
  效果?: TreasureEffect[];
  珍贵度?: TreasureRarity;
};
/** 只生成一份合法效果规格；获取机会与入库仍由各自入口决定，不自动投放。 */
export function generateTreasureMetadata(
  options: {
    品阶: number;
    大类: Exclude<TreasureCategory, '特殊物品'>;
    路线: '斗气' | '法力';
    用途: '装备' | '积累' | '培养' | '加速';
    兼顾?: boolean;
  },
  random: () => number = Math.random,
): TreasureMetadata {
  if (!Number.isInteger(options.品阶) || options.品阶 < 1 || options.品阶 > 8)
    throw new Error('宝物品阶须为1至8。');
  if (options.用途 !== '装备' && options.大类 !== '修为秘宝')
    throw new Error('积累、培养和加速效果使用成长秘宝分类。');
  const attributes = ['生命', '防御', '攻击', '能量'] as const;
  const pool: TreasureEffect[] = options.用途 === '积累' || options.用途 === '加速'
    ? [{ 类型: options.用途 === '积累' ? '修为' : '成长加速', 路线: options.路线, 份额: 1 }]
    : attributes.flatMap(属性 =>
      (options.用途 === '培养' ? ['定向培养'] as const : ['固定属性', '比例属性'] as const).map(类型 => ({
        类型, 属性, ...(属性 === '能量' ? { 路线: options.路线 } : {}), 份额: 1 as const,
      })));
  const effects: TreasureEffect[] = [];
  const count = options.兼顾 && pool.length > 1 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('效果抽取值须在0至1之间。');
    const effect = pool.splice(Math.floor(value * pool.length), 1)[0];
    effects.push({ ...effect, 份额: count === 2 ? 0.5 : 1 });
    // 兼顾两种用途，不把同一属性的固定和比例加成包装成两个不同培养方向。
    for (let j = pool.length - 1; j >= 0; j--) if (pool[j].属性 === effect.属性) pool.splice(j, 1);
  }
  return {
    大类: options.大类, 子类: '普通', 适用路线: options.路线,
    使用方式: options.用途 === '积累' || options.用途 === '培养' ? '消耗' : '佩戴',
    归属人物ID: null, 品阶: options.品阶, 效果: effects,
  };
}
export type InventoryItem = {
  名称: string;
  数量: number;
  固定规格: string;
  宝物?: TreasureMetadata;
};
export type EquippedPerson = {
  姓名: string;
  /** null／缺省为未确认，空对象为明确无亲和；只存事实，不提供数值加成。 */
  元素亲和?: Partial<Record<'火' | '水' | '风' | '土' | '冰' | '雷' | '光' | '暗', true>> | null;
  别名?: string[];
  档案类型?: '长期' | '临时';
  在场?: boolean;
  参战?: boolean;
  _发送策略?: '自动' | '暂停自动补漏';
  _档案触发词?: string[];
  路线: Record<string, unknown>;
  装备?: Partial<Record<EquipmentSlot, EquipmentRef>>;
};
export type EquipmentState = {
  人物: Record<string, EquippedPerson>;
  库存: Record<string, { 物品: Record<string, InventoryItem> }>;
};
export type EquipmentCommand =
  | { type: 'equip'; ref: EquipmentRef; personId: string; slot: EquipmentSlot; splitId: string }
  | { type: 'unequip'; ref: EquipmentRef }
  | { type: 'discard'; ref: EquipmentRef; quantity: number }
  | { type: 'consume'; ref: EquipmentRef; personId: string; route: string };
export type PersonManagementCommand =
  | { type: 'setPersonTriggers'; personId: string; words: string[] | null }
  | { type: 'archivePerson'; personId: string }
  | { type: 'promotePerson'; personId: string }
  | { type: 'removePerson'; personId: string };
export type TreasureOpportunityCommand = { type: 'pursueTreasure' | 'abandonTreasure' | 'retryTreasureName' | 'claimTreasure'; id: string };
export type GameplayCommand = EquipmentCommand | PersonManagementCommand | TreasureOpportunityCommand;

export function sameItem(a: EquipmentRef, b: EquipmentRef): boolean {
  return a.库存ID === b.库存ID && a.物品ID === b.物品ID;
}
export function resolveEquipment(state: EquipmentState, ref: EquipmentRef): InventoryItem | undefined {
  return state.库存[ref.库存ID]?.物品[ref.物品ID];
}
/** 法杖强制归法力；只掌握斗气的人可以持有，但任何装备增幅均不启用。 */
export function equipmentBenefitsApply(person: EquippedPerson, treasure: TreasureMetadata): boolean {
  const route = treasure.子类 === '法杖' ? '法力' : treasure.适用路线;
  return route === '通用' || Object.hasOwn(person.路线, route);
}
function clearReferences(state: EquipmentState, ref: EquipmentRef): void {
  for (const person of Object.values(state.人物)) {
    for (const [slot, equipped] of Object.entries(person.装备 ?? {})) {
      if (equipped && sameItem(equipped, ref)) delete person.装备![slot as EquipmentSlot];
    }
  }
}
/** 调用方在副本上执行；失败不写回存档。没有 AI 通知或新增物件入口。 */
export function applyEquipmentCommand(state: EquipmentState, command: EquipmentCommand): void {
  if (command.type === 'consume') throw new Error('消耗须通过成长结算入口提交。');
  const item = resolveEquipment(state, command.ref);
  if (!item?.宝物 || item.数量 <= 0) throw new Error('宝物已不存在，请刷新后重试。');
  if (command.type === 'unequip') {
    clearReferences(state, command.ref);
    return;
  }
  if (command.type === 'discard') {
    if (!Number.isInteger(command.quantity) || command.quantity < 1 || command.quantity > item.数量)
      throw new Error('丢弃数量无效。');
    item.数量 -= command.quantity;
    if (item.数量 === 0) {
      clearReferences(state, command.ref);
      delete state.库存[command.ref.库存ID].物品[command.ref.物品ID];
    }
    return;
  }
  const person = state.人物[command.personId];
  if (!person) throw new Error('人物已不存在。');
  if (item.宝物.使用方式 !== '佩戴' || slotCategories[command.slot] !== item.宝物.大类)
    throw new Error('该宝物不适用于此装备位置。');
  let targetRef = { ...command.ref };
  let targetItem = item;
  if (item.数量 > 1) {
    const inventory = state.库存[command.ref.库存ID].物品;
    if (!command.splitId || Object.hasOwn(inventory, command.splitId)) throw new Error('拆分编号冲突，请重试。');
    targetItem = structuredClone(item);
    targetItem.数量 = 1;
    item.数量 -= 1;
    inventory[command.splitId] = targetItem;
    targetRef = { 库存ID: command.ref.库存ID, 物品ID: command.splitId };
  }
  clearReferences(state, targetRef);
  targetItem.宝物!.归属人物ID = command.personId;
  person.装备 ??= {};
  person.装备[command.slot] = targetRef;
}

/** 只计已定稿的固定加成；不推断百分比、成长速度或特殊机制。 */
export function fixedEquipmentBonuses(state: EquipmentState, personId: string): { 攻击: number; 防御: number } {
  const total = { 攻击: 0, 防御: 0 };
  const person = state.人物[personId];
  if (!person) return total;
  for (const ref of Object.values(person.装备 ?? {})) {
    const item = resolveEquipment(state, ref);
    if (!item?.宝物 || !equipmentBenefitsApply(person, item.宝物)) continue;
    total.攻击 += item.宝物.固定加成?.攻击 ?? 0;
    total.防御 += item.宝物.固定加成?.防御 ?? 0;
  }
  return total;
}

export function equippedWeaponNames(state: EquipmentState, personId: string): string[] {
  const ref = state.人物[personId]?.装备?.weapon;
  const item = ref && resolveEquipment(state, ref);
  return item?.宝物?.大类 === '武器' && item.数量 > 0 ? [item.名称] : [];
}

function clearPersonBattleReferences(state: Record<string, any>, personId: string): void {
  for (const key of ['护盾', '准备', '实验性地缚', '休整']) delete state[key]?.[personId];
}

/** 人物管理只修改当前分支副本；两类档案可删除，不记录跨分支的删除保护。 */
export function applyPersonManagementCommand(state: Record<string, any>, command: PersonManagementCommand): void {
  const person = state.人物?.[command.personId] as EquippedPerson | undefined;
  if (!person) throw new Error('人物档案已不存在，请刷新后重试。');
  if (command.type === 'setPersonTriggers') {
    if (command.words === null) delete person._档案触发词;
    else {
      if (!Array.isArray(command.words) || command.words.some(word => typeof word !== 'string'))
        throw new Error('触发词须为文本列表，请重新填写。');
      person._档案触发词 = normalizePersonTriggerWords(command.words);
    }
    return;
  }
  if (state.玩家人物ID === command.personId) throw new Error('主角档案不能删除或转换。');
  if (command.type !== 'removePerson' && (person.档案类型 ?? '长期') !== '临时')
    throw new Error('只有临时人物可以执行此操作。');
  if (command.type === 'promotePerson') {
    person.档案类型 = '长期';
    return;
  }
  if (command.type === 'archivePerson') {
    person.在场 = false;
    person.参战 = false;
    person._发送策略 = '暂停自动补漏';
    clearPersonBattleReferences(state, command.personId);
    return;
  }
  for (const stock of Object.values(state.库存 ?? {}) as { 物品?: Record<string, InventoryItem> }[]) {
    for (const item of Object.values(stock.物品 ?? {})) {
      if (item.宝物?.归属人物ID === command.personId) item.宝物.归属人物ID = null;
    }
  }
  clearPersonBattleReferences(state, command.personId);
  delete state.当日修炼?.[command.personId];
  for (const group of Object.values(state.军队 ?? {}) as { 关键人物?: Record<string, true> }[])
    delete group.关键人物?.[command.personId];
  for (const project of Object.values(state.项目 ?? {}) as { 人物ID?: string | null }[]) {
    if (project.人物ID === command.personId) project.人物ID = null;
  }
  delete state.人物[command.personId];
}

/** AI 只读投影，不是第二套库存：隐藏脚本宝物记录、装备引用和增幅配置。 */
export function gameplayPublicView(
  statData: Record<string, any>,
  selectedPersonIds?: ReadonlySet<string>,
): Record<string, any> {
  const visible = structuredClone(statData);
  delete visible.玩法正文;
  const gameplay = visible.玩法;
  if (!gameplay?.人物 || !gameplay?.库存) return visible;
  const scriptStocks = scriptOwnedStockIds(statData.玩法);
  for (const key of ['领地', '合同', '当日修炼', '_规则确认', '宝物系统', '宝物运行', '宝物事件', '宝物取得']) delete gameplay[key];
  gameplay.项目 = Object.fromEntries(
    Object.entries(gameplay.项目 ?? {}).filter(
      ([, project]) => personalLearningProject(project) && !scriptStocks.has((project as any).库存ID),
    ),
  );
  if (!Object.keys(gameplay.项目).length) delete gameplay.项目;
  gameplay.军队 = Object.fromEntries(
    Object.entries(gameplay.军队 ?? {}).map(([id, army]: [string, any]) => [
      id,
      {
        名称: army.名称,
        构成: structuredClone(army.构成),
      },
    ]),
  );
  if (!Object.keys(gameplay.军队).length) delete gameplay.军队;
  for (const id of scriptStocks) delete gameplay.库存[id];
  const allPeople = statData.玩法.人物 as Record<string, Record<string, any>>;
  visible.已建档人物索引 = {
    用途: '当前分支已建档人物，用于防止重复建档；不是领地成员名单。姓名即ID时只列姓名，其他项列出对应ID。离场不等于删档。',
    人物: Object.entries(allPeople).map(([id, person]) => (id === person.姓名 ? id : { 姓名: person.姓名, ID: id })),
  };
  if (selectedPersonIds) {
    for (const id of Object.keys(gameplay.人物)) if (!selectedPersonIds.has(id)) delete gameplay.人物[id];
    for (const key of ['护盾', '准备', '实验性地缚', '休整']) {
      for (const id of Object.keys(gameplay[key] ?? {})) if (!selectedPersonIds.has(id)) delete gameplay[key][id];
    }
    const skillIds = new Set<string>();
    for (const id of selectedPersonIds) {
      for (const skillId of Object.keys(allPeople[id]?.已掌握技能 ?? {})) skillIds.add(skillId);
      for (const key of ['护盾', '准备', '实验性地缚']) {
        const skillId = statData.玩法[key]?.[id]?.技能版本ID;
        if (skillId) skillIds.add(skillId);
      }
    }
    for (const id of Object.keys(gameplay.技能定义 ?? {})) if (!skillIds.has(id)) delete gameplay.技能定义[id];
    visible.人物发送 = {
      本轮人物ID: [...selectedPersonIds],
      未发送人物数: Math.max(0, Object.keys(allPeople).length - selectedPersonIds.size),
      说明: '人物为当前分支按需切片；未列出不代表不存在，不得据此删除、覆盖或重新建档。',
    };
  }
  for (const [id, person] of Object.entries(gameplay.人物) as [string, Record<string, any>][]) {
    delete person.装备;
    delete person._发送策略;
    delete person._档案触发词;
    const registration = person._建档记录;
    delete person._建档记录;
    if (registration) {
      person.建档时说明 = `以下仅为首次录入依据；当前状态以本面板为准，不回灌旧伤势或余额：${registration.依据}`;
      const registeredNames = new Set(Object.keys(person.已掌握技能 ?? {}).flatMap(skillId =>
        [skillId, statData.玩法.技能定义?.[skillId]?.名称].filter(Boolean)));
      const pending = registration.待补技能.filter((name: string) => !registeredNames.has(name));
      if (pending.length) person.待补技能 = pending;
    }
    person.当前武器 = equippedWeaponNames(statData.玩法, id);
  }
  for (const stock of Object.values(gameplay.库存) as { 物品: Record<string, InventoryItem> }[]) {
    for (const [id, item] of Object.entries(stock.物品 ?? {})) if (item.宝物) delete stock.物品[id];
  }
  return visible;
}

/** 恢复脚本掌管的装备与宝物记录；普通剧情资产仍可按原规则更新。 */
export function protectEquipmentVariables(next: Record<string, any>, previous: Record<string, any>): void {
  const before = previous.玩法;
  if (!before) return;
  next.玩法 ??= structuredClone(before);
  const after = next.玩法;
  after.人物 ??= {};
  after.库存 ??= {};
  for (const person of Object.values(after.人物) as Record<string, any>[]) delete person.装备;
  for (const [id, person] of Object.entries(before.人物 ?? {}) as [string, Record<string, any>][]) {
    if (!person.装备) continue;
    after.人物[id] ??= structuredClone(person);
    after.人物[id].装备 = structuredClone(person.装备);
  }
  for (const stock of Object.values(after.库存) as Record<string, any>[]) {
    for (const item of Object.values(stock.物品 ?? {}) as Record<string, any>[]) delete item.宝物;
  }
  for (const [stockId, stock] of Object.entries(before.库存 ?? {}) as [string, Record<string, any>][]) {
    for (const [itemId, item] of Object.entries(stock.物品 ?? {}) as [string, InventoryItem][]) {
      if (!item.宝物) continue;
      after.库存[stockId] ??= structuredClone(stock);
      after.库存[stockId].物品 ??= {};
      after.库存[stockId].物品[itemId] = structuredClone(item);
    }
  }
}
