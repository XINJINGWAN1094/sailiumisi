import { parsePersonCommandValue, personCommandPath } from './脚本/变量结构/person-command-values';

type State = Record<string, any>;
type Command = { type: string; args: unknown[] };
const privateFields = ['领地', '合同', '当日修炼'] as const;
const lossFields = ['存活人数', '其中伤员', '累计死亡'] as const;

function validLosses(before: State, after: State): boolean {
  if (!after || !lossFields.every(field => Number.isSafeInteger(after[field]) && after[field] >= 0)) return false;
  const lost = before.存活人数 - after.存活人数;
  const deaths = after.累计死亡 - before.累计死亡;
  return (
    lost >= 0 &&
    deaths >= 0 &&
    deaths <= lost &&
    after.其中伤员 <= after.存活人数 &&
    after.其中伤员 >= Math.max(0, before.其中伤员 - lost)
  );
}

export function personalLearningProject(project: any): boolean {
  return (
    !!project && ['启蒙', '学习', '元素学习'].includes(project.类型) && project.军队ID == null && project.领地ID == null
  );
}

export function scriptOwnedStockIds(state: State): Set<string> {
  return new Set(
    [...Object.values(state.军队 ?? {}), ...Object.values(state.领地 ?? {})].map((entry: any) => entry.库存ID),
  );
}

/** 只收口 AI 写入；军队发展与经营仍由各自脚本另行实现。 */
export function protectEconomyCommands(variables: { stat_data: State }, commands: Command[]): void {
  const state = variables.stat_data.玩法;
  if (!state) return;
  const stocks = scriptOwnedStockIds(state);
  const allowed = (command: Command, path: string[]) => {
    if (!path.length) return false;
    if (path[0] !== '玩法') return true;
    if (path.length < 2 || privateFields.includes(path[1] as (typeof privateFields)[number])) return false;
    if (path[1] === '玩法正文') return false;
    if (path[1] === '时间') return path.length === 3 && path[2] === '已结束交锋';
    if (path[1] === '库存') return path.length > 2 && !stocks.has(path[2]);
    if (path[1] === '军队') {
      const group = state.军队?.[path[2]]?.构成?.[path[4]];
      if (path.length === 5 && path[3] === '构成' && group && command.type === 'set') {
        const value = parsePersonCommandValue(command.args.at(-1));
        return value?.职业 === group.职业 && value?.境界 === group.境界 && validLosses(group, value);
      }
      if (
        path.length !== 6 ||
        path[3] !== '构成' ||
        !group ||
        !lossFields.includes(path[5] as (typeof lossFields)[number]) ||
        !['set', 'add'].includes(command.type)
      )
        return false;
      const value = Number(parsePersonCommandValue(command.args.at(-1)));
      const result = command.type === 'add' ? group[path[5]] + value : value;
      return (
        Number.isSafeInteger(result) &&
        result >= 0 &&
        (path[5] === '存活人数'
          ? result <= group.存活人数
          : path[5] === '累计死亡'
            ? result >= group.累计死亡
            : result <= group.存活人数)
      );
    }
    if (path[1] === '项目') {
      if (path.length < 3) return false;
      const existing = state.项目?.[path[2]];
      if (existing && (!personalLearningProject(existing) || stocks.has(existing.库存ID))) return false;
      if (path.length === 3 && ['insert', 'set'].includes(command.type))
        return (
          personalLearningProject(parsePersonCommandValue(command.args.at(-1))) &&
          !stocks.has(parsePersonCommandValue(command.args.at(-1)).库存ID)
        );
      if (path.length === 4 && path[3] === '库存ID' && command.type === 'set')
        return !stocks.has(parsePersonCommandValue(command.args.at(-1)));
      if (path.length === 4 && ['军队ID', '领地ID'].includes(path[3]) && command.type === 'set')
        return parsePersonCommandValue(command.args.at(-1)) == null;
      if (path.length === 4 && path[3] === '类型' && command.type === 'set')
        return ['启蒙', '学习', '元素学习'].includes(parsePersonCommandValue(command.args.at(-1)));
      return !!existing;
    }
    return true;
  };
  const filtered = commands.filter(command => {
    try {
      const path = personCommandPath(command.args[0]);
      if (['insert', 'delete'].includes(command.type) && command.args.length === (command.type === 'insert' ? 3 : 2))
        path.push(String(parsePersonCommandValue(command.args[1])));
      return (
        allowed(command, path) && (command.type !== 'move' || allowed(command, personCommandPath(command.args[1])))
      );
    } catch {
      return false;
    }
  });
  commands.splice(0, commands.length, ...filtered);
}

/** 保留脚本账户和军队身份，仅接受已有分组的实际损失；不推算战斗伤亡。 */
export function protectEconomyVariables(next: State, previous: State): void {
  const before = previous.玩法;
  if (!before) return;
  const after = (next.玩法 ??= structuredClone(before));
  for (const field of privateFields) after[field] = structuredClone(before[field] ?? {});
  after.库存 ??= {};
  for (const id of scriptOwnedStockIds(before)) {
    if (before.库存?.[id]) after.库存[id] = structuredClone(before.库存[id]);
  }
  const proposed = after.军队 ?? {};
  after.军队 = structuredClone(before.军队 ?? {});
  for (const [id, army] of Object.entries(after.军队) as [string, State][]) {
    for (const [groupId, group] of Object.entries(army.构成) as [string, State][]) {
      const value = proposed[id]?.构成?.[groupId];
      if (!validLosses(group, value)) continue;
      for (const field of lossFields) group[field] = value[field];
    }
  }
  const projects = after.项目 ?? {};
  const stocks = scriptOwnedStockIds(before);
  after.项目 = Object.fromEntries(
    Object.entries(projects).filter(
      ([id, project]) =>
        personalLearningProject(project) &&
        !stocks.has((project as State).库存ID) &&
        (!before.项目?.[id] || personalLearningProject(before.项目[id])),
    ),
  );
  for (const [id, project] of Object.entries(before.项目 ?? {})) {
    if (
      !personalLearningProject(project) ||
      stocks.has((project as State).库存ID) ||
      (Object.hasOwn(projects, id) && (!personalLearningProject(projects[id]) || stocks.has(projects[id].库存ID)))
    )
      after.项目[id] = structuredClone(project);
  }
}
