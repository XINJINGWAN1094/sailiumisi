import JSON5 from 'json5';

// COMMAND_PARSED fires before MVU removes literal quotes from function arguments.
export const parsePersonCommandValue = (value: unknown): any => typeof value === 'string' ? JSON5.parse(value) : value;

export function personCommandPath(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  let path = raw.trim();
  if (/^["'`]/u.test(path)) {
    try {
      path = path.startsWith('`') && path.endsWith('`') ? path.slice(1, -1) : JSON5.parse(path);
      if (typeof path !== 'string') return [];
    } catch { return []; }
  }
  const parts = _.toPath(path);
  return ['stat_data', 'status_current_variables'].includes(parts[0]) ? parts.slice(1) : parts;
}
