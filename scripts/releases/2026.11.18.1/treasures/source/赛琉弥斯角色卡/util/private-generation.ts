import { castleHostDocument } from './castle-panels';

const ATTRIBUTE = 'data-selyumis-private-generation';
/** Transient request ownership only; no story facts, balances or chat state are stored globally. */
export function isPrivateGeneration(): boolean {
  return typeof document !== 'undefined' && castleHostDocument(document).documentElement.hasAttribute(ATTRIBUTE);
}
export function beginPrivateGeneration(id: string): () => void {
  const root = castleHostDocument(document).documentElement;
  if (root.hasAttribute(ATTRIBUTE)) throw new Error('另一项后台请求尚未结束，请稍候。');
  root.setAttribute(ATTRIBUTE, id);
  return () => {
    if (root.getAttribute(ATTRIBUTE) === id) root.removeAttribute(ATTRIBUTE);
  };
}
