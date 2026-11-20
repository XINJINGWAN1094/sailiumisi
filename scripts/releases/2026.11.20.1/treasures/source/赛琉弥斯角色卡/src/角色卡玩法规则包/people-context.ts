export type ContextPerson = {
  姓名: string;
  别名?: string[];
  档案类型?: '长期' | '临时';
  在场?: boolean;
  参战?: boolean;
  _发送策略?: '自动' | '暂停自动补漏';
  /** 缺省使用姓名与别名；空数组表示用户关闭文字触发，不影响在场／参战发送。 */
  _档案触发词?: string[];
  _建档记录?: { 依据: string; 待补技能: string[] };
};

export type PersonContextState = {
  玩家人物ID?: string | null;
  人物: Record<string, ContextPerson>;
};

export type PersonContext = {
  currentInput: string;
  recentAssistant: string[];
};

const ACTIVE_CUES =
  /在场|出场|登场|参战|同行|跟随|陪同|会合|过来|回来|叫来|召来|带上|交战|战斗|攻击|防御|施法|受伤|负伤|治疗|救治|看向|走向|来到|进入|离开|追击|保护|说道|问道|答道|拔剑|挥剑|冲向|拦住|面板|状态|伤势|生命|能量|修为|境界|天赋|装备|武器|技能|属性|查看|查询|看看|情况/;
const MEMORY_CUES = /回忆|想起|记得|梦见|传闻|听说|曾经|从前|往事|只提到|名字/;
const EXPLICIT_INFO_CUES = /面板|状态|伤势|生命|能量|修为|境界|天赋|装备|武器|技能|属性|查看|查询|看看|情况/;
const SINGLE_NAME_LEFT = String.raw`(?:^|[\s，。！？、；：,.!?;:“”"'「」『』（）()【】\[\]<>])`;
const SINGLE_NAME_RIGHT = String.raw`(?=$|[\s，。！？、；：,.!?;:“”"'「」『』（）()【】\[\]<>]|的|在|与|和|跟|向|对|被|将|正|又|也|已|便|则|拔|挥|攻|守|走|来|去|说|问|答|看|望|冲|追|施|受|伤|躲|闪)`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 只保留可作为剧情线索的正文，避免变量块、状态栏占位与既有注入文本自触发。 */
export function cleanPersonContextProse(text: string): string {
  return text
    .replace(/<UpdateVariable\b[^>]*>[\s\S]*?(?:<\/UpdateVariable\s*>|$)/giu, '')
    .replace(/<StatusPlaceHolder(?:Impl)?\s*\/?>/giu, '')
    .replace(
      /<(computed_story_facts_v1|selyumis_(?:location|travel)_control_v1|maid_manor_v1|gameplay_person_slice_v1)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      '',
    )
    .replace(/```[\s\S]*?```/gu, block =>
      /(?:stat_data|玩法正文|UpdateVariable|JSONPatch|变量更新)/iu.test(block) ? '' : block,
    )
    .trim();
}

function containsStableName(text: string, name: string): boolean {
  const normalized = name.trim();
  if (!normalized) return false;
  if ([...normalized].length > 1) return text.includes(normalized);
  return new RegExp(`${SINGLE_NAME_LEFT}${escapeRegExp(normalized)}${SINGLE_NAME_RIGHT}`, 'u').test(text);
}

export function normalizePersonTriggerWords(words: readonly string[]): string[] {
  return [...new Set(words.map(word => word.trim()).filter(Boolean))];
}

export function defaultPersonTriggerWords(person: Pick<ContextPerson, '姓名' | '别名'>): string[] {
  return normalizePersonTriggerWords([person.姓名, ...(person.别名 ?? [])]);
}

export function personTriggerWords(person: ContextPerson): string[] {
  return person._档案触发词 === undefined
    ? defaultPersonTriggerWords(person)
    : normalizePersonTriggerWords(person._档案触发词);
}

/** 用户本轮输入按字面命中任意词即可读取，不附加动作、查询或同句条件。 */
function triggeredByUser(person: ContextPerson, raw: string): boolean {
  const text = cleanPersonContextProse(raw);
  return Boolean(text) && personTriggerWords(person).some(word => text.includes(word));
}

/**
 * 文本只作补漏：必须同句出现动作/状态线索；纯回忆、传闻或随口提名不展开完整面板。
 * 这是保守字面判据，不宣称理解语义。
 */
function mentionedAsActive(person: ContextPerson, raw: string): boolean {
  const text = cleanPersonContextProse(raw);
  if (!text) return false;
  const names = personTriggerWords(person);
  return text.split(/[。！？!?\n]+/u).some(sentence => {
    if (!names.some(name => containsStableName(sentence, name))) return false;
    if (EXPLICIT_INFO_CUES.test(sentence)) return true;
    return !MEMORY_CUES.test(sentence) && ACTIVE_CUES.test(sentence);
  });
}

/** 主角、在场者和参战者直接提供；用户输入命中触发词即补入，近期 AI 正文保守补漏。 */
export function selectPeopleForView(state: PersonContextState, context: PersonContext): Set<string> {
  const selected = new Set<string>();
  if (state.玩家人物ID && state.人物[state.玩家人物ID]) selected.add(state.玩家人物ID);
  const recent = context.recentAssistant.slice(-3);
  for (const [id, person] of Object.entries(state.人物)) {
    const paused = person._发送策略 === '暂停自动补漏';
    if (
      person.在场 === true ||
      person.参战 === true ||
      triggeredByUser(person, context.currentInput) ||
      (!paused && recent.some(text => mentionedAsActive(person, text)))
    )
      selected.add(id);
  }
  return selected;
}

/** 发送策略归脚本：AI 只更新真实入离场；临时人物离场后不被旧正文重新激活。 */
export function protectPersonContext(next: PersonContextState, previous: PersonContextState): void {
  for (const [id, person] of Object.entries(next.人物)) {
    const before = previous.人物[id];
    delete person._发送策略;
    if (before?._发送策略) person._发送策略 = before._发送策略;
    delete person._档案触发词;
    if (before?._档案触发词 !== undefined) person._档案触发词 = [...before._档案触发词];
    delete person._建档记录;
    if (before?._建档记录) person._建档记录 = structuredClone(before._建档记录);
    if (
      id !== next.玩家人物ID &&
      person.档案类型 === '临时' &&
      (!before || before.在场 === true || before.参战 === true) &&
      person.在场 !== true &&
      person.参战 !== true
    )
      person._发送策略 = '暂停自动补漏';
  }
}
