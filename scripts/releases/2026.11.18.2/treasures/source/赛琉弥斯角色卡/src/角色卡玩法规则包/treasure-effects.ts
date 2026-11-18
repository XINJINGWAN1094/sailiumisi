import { z } from 'zod';

export const treasureEffectTypes = [
  '固定属性',
  '比例属性',
  '成长加速',
  '修为',
  '定向培养',
  '护盾强化',
  '护盾延续',
  '破盾',
  '穿透',
  '元素专精',
  '对类特攻',
  '元素抗性',
  '技能节能',
  '恢复增效',
  '主动护盾',
  '蓄能',
  '临时强化',
  '汲取',
  '反震',
  '持续侵蚀',
  '守护',
  '感应',
  '隐匿',
  '环境适应',
  '短距移动',
  '净化',
  '瞬间治愈',
  '不死之鸟',
] as const;
export const treasureRarities = ['常规', '实用', '稀有', '珍奇'] as const;
export const treasureElements = ['火', '水', '风', '土', '冰', '雷', '光', '暗'] as const;
export const treasureTargetKinds = ['人类', '巨龙', '魔兽', '亡灵', '恶魔'] as const;
export const TreasureEffectSchema = z.object({
  类型: z.enum(treasureEffectTypes),
  属性: z.enum(['生命', '能量', '攻击', '防御']).optional(),
  路线: z.string().min(1).optional(),
  份额: z.union([z.literal(0.5), z.literal(1)]),
  强度: z.number().min(0.8).max(1.2).optional(),
  元素: z.enum(treasureElements).optional(),
  对象类别: z.enum(treasureTargetKinds).optional(),
});
export type TreasureEffect = z.infer<typeof TreasureEffectSchema>;
export type TreasureRarity = (typeof treasureRarities)[number];
export const isConditionalEffect = (effect: TreasureEffect) =>
  !['固定属性', '比例属性', '成长加速', '修为', '定向培养'].includes(effect.类型);
export const effectStrength = (effect: TreasureEffect) => effect.份额 * (effect.强度 ?? 1);
export const TreasureMetadataSchema = z
  .object({
    大类: z.enum(['武器', '防具', '饰品', '修为秘宝', '特殊物品']),
    子类: z.enum(['普通', '法杖']),
    适用路线: z.enum(['通用', '斗气', '法力']),
    使用方式: z.enum(['佩戴', '消耗', '特殊']),
    归属人物ID: z.string().min(1).nullable(),
    品阶: z.number().int().min(1).max(8).optional(),
    珍贵度: z.enum(treasureRarities).optional(),
    效果: z.array(TreasureEffectSchema).min(1).max(2).optional(),
    固定加成: z.object({ 攻击: z.number().nonnegative(), 防御: z.number().nonnegative() }).optional(),
  })
  .superRefine((item, context) => {
    const invalid = () => context.addIssue({ code: 'custom', message: '宝物效果须符合品阶、用途、参数和一份总预算。' });
    if (item.子类 === '法杖' && (item.大类 !== '武器' || item.适用路线 !== '法力')) invalid();
    if (!item.效果) return;
    if (!item.品阶 || item.固定加成 || item.效果.reduce((sum, e) => sum + e.份额, 0) > 1) invalid();
    for (const e of item.效果) {
      if (isConditionalEffect(e)) {
        if (item.使用方式 !== '佩戴' || e.属性 || e.路线 || e.份额 !== 1 || item.效果.length !== 1) invalid();
        if (['元素专精', '元素抗性', '环境适应'].includes(e.类型) !== Boolean(e.元素)) invalid();
        if ((e.类型 === '对类特攻') !== Boolean(e.对象类别)) invalid();
        if (e.类型 === '不死之鸟' && (item.大类 !== '特殊物品' || (e.强度 ?? 1) !== 1)) invalid();
        continue;
      }
      const attr = ['固定属性', '比例属性', '定向培养'].includes(e.类型);
      if (attr !== Boolean(e.属性) || (e.属性 === '能量' || !attr) !== Boolean(e.路线)) invalid();
      if (e.元素 || e.对象类别 || item.大类 === '特殊物品') invalid();
      if (item.适用路线 !== '通用' && e.路线 && e.路线 !== item.适用路线) invalid();
      if (['修为', '定向培养'].includes(e.类型)) {
        if (item.使用方式 !== '消耗' || item.大类 !== '修为秘宝') invalid();
      } else if (item.使用方式 !== '佩戴') invalid();
    }
    if (item.使用方式 === '消耗' && item.效果.some(e => e.类型 !== item.效果![0].类型)) invalid();
  });
export const TreasureItemSchema = z.object({
  名称: z.string().min(1).max(80),
  数量: z.literal(1),
  固定规格: z.string().min(1),
  宝物: TreasureMetadataSchema,
});
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;

/** All amounts are fixed by item rank and its saved roll, never re-rolled by reading a panel. */
export function conditionalEffectSpec(rank: number, effect: TreasureEffect) {
  const q = 3 ** (rank - 1),
    s = effectStrength(effect);
  const amount = (value: number) => rounded(value * s);
  const percentage = (value: number) => rounded(value * s);
  const hp = 100 * q * q,
    attack = 5 * q * q,
    energy = 100 * q;
  const specs: Record<
    string,
    { 比例?: number; 上限?: number; 数值?: number; 持续交锋?: number; 冷却秒?: number; 说明: string }
  > = {
    护盾强化: { 比例: percentage(0.2), 上限: amount(hp * 0.2), 说明: '施展个人护盾时增加盾量；不补回旧盾损失。' },
    护盾延续: { 数值: 1, 说明: '新施展的个人护盾延长1交锋；同类不叠加，不能刷新已存在护盾。' },
    破盾: {
      比例: percentage(0.3),
      上限: amount(attack * 0.6),
      说明: '仅对护盾增加伤害；额外破盾伤害不溢出为生命伤害。',
    },
    穿透: { 比例: percentage(0.15), 上限: amount(0.9 * q * q * 0.2), 说明: '忽略部分有效防御，防御最低为0。' },
    元素专精: {
      比例: percentage(0.15),
      上限: amount(attack * 0.4),
      说明: `已掌握且明确为${effect.元素}元素的伤害技能增伤，不授予新技能。`,
    },
    对类特攻: {
      比例: percentage(0.2),
      上限: amount(attack * 0.5),
      说明: `对已确认类别为${effect.对象类别}的目标增伤，不按名字猜测类别。`,
    },
    元素抗性: { 比例: percentage(0.15), 上限: amount(attack * 0.4), 说明: `抵御明确为${effect.元素}元素的生命伤害。` },
    技能节能: {
      比例: percentage(0.1),
      上限: amount(energy * 0.04),
      说明: '降低实际施展的技能能量消耗；不扩大单次投入或威力。',
    },
    恢复增效: {
      比例: percentage(0.2),
      上限: amount(hp * 0.1),
      说明: '增强实际获得的生命恢复，不凭空治疗、不解除失能。',
    },
    主动护盾: {
      数值: amount(hp * 0.2),
      持续交锋: 3,
      冷却秒: 3600,
      说明: '占一次主要行动展开护盾，与已有个人护盾互相替换。',
    },
    蓄能: {
      数值: amount(attack * 0.8),
      冷却秒: 3600,
      说明: '用一次主要行动蓄能；下次命中的直接伤害获得固定增幅后清空，不反复叠存。',
    },
    临时强化: {
      数值: amount(attack * 0.2),
      持续交锋: 3,
      冷却秒: 3600,
      说明: '占一次主要行动启动，3交锋内直接攻击获得固定增幅；不是永久面板。',
    },
    汲取: {
      比例: percentage(0.08),
      上限: amount(hp * 0.08),
      说明: '仅按直接攻击实际造成的生命伤害恢复自身生命；不从护盾、反伤或持续伤害吸取。',
    },
    反震: {
      比例: percentage(0.1),
      上限: amount(attack * 0.3),
      说明: '受到直接生命伤害后有限反伤；不触发汲取、反震、持续侵蚀或新的伤害词条。',
    },
    持续侵蚀: {
      数值: amount(attack * 0.12),
      持续交锋: 2,
      说明: '直接命中并造成生命伤害后，后续2交锋末造成固定伤害；同来源不叠层，不递归触发伤害词条。',
    },
    守护: {
      比例: percentage(0.2),
      上限: amount(attack * 0.5),
      冷却秒: 3600,
      说明: '消耗一次反应，降低一位同伴本次将承受的生命伤害；不能在自身失能时发动。',
    },
    感应: {
      数值: amount(20 * rank),
      说明: '范围内感知明显魔力异常的方向，不揭示身份、完整机制或隔绝屏障后的信息。单位：米。',
    },
    隐匿: { 比例: percentage(0.2), 说明: '降低自身气息暴露程度，不等于视觉消失或绝对无法侦测；主动攻击暴露位置。' },
    环境适应: {
      比例: percentage(0.3),
      说明: `减轻${effect.元素}对应普通环境的不适与损害；不是战斗抗性、免疫或无需呼吸。`,
    },
    短距移动: {
      数值: amount(5 + 2 * rank),
      冷却秒: 3600,
      说明: '占一次主要行动，移动至视线内可站立位置；不可穿越实体、封印或空间封锁。单位：米。',
    },
    净化: {
      数值: 1,
      冷却秒: 3600,
      说明: '占一次主要行动，移除一项不高于宝物品阶的普通中毒、灼烧、迟缓或侵蚀；不解除免死失能、封印、诅咒或死亡。',
    },
    瞬间治愈: {
      数值: amount(hp * 0.4),
      冷却秒: 3600,
      说明: '受伤后生命不高于25%且仍未死亡时自动瞬间恢复；至多回满，每件独立冷却，不解除免死失能。',
    },
    不死之鸟: {
      说明: '佩戴期间持续免死，不是一次性消耗。触发后约一天无法战斗，AI按剧情判断恢复，无需报告触发或起止时间；期间继续保命，再次保命不重新计算一天，仍可被俘或封印。免死不回血；治疗、卸下或换人不立即解除原人物失能。',
    },
  };
  return specs[effect.类型];
}

export function describeConditionalEffect(rank: number, effect: TreasureEffect): string {
  const spec = conditionalEffectSpec(rank, effect);
  if (!spec) return '';
  return [
    effect.类型,
    spec.说明,
    ...(spec.比例 !== undefined ? [`比例${(spec.比例 * 100).toFixed(1)}%`] : []),
    ...(spec.上限 !== undefined ? [`每次上限${spec.上限.toFixed(1)}`] : []),
    ...(spec.数值 !== undefined && !['不死之鸟', '护盾延续', '净化'].includes(effect.类型) ? [`额度${spec.数值.toFixed(1)}`] : []),
    ...(spec.冷却秒 ? [`冷却${(spec.冷却秒 / 3600).toFixed(1)}剧情小时`] : []),
  ].join('；');
}
