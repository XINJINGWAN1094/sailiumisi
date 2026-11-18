/** UI-only bridge between independently installed scripts. No chat or story data is shared. */
export const castlePanelNames = {
  maid: '女仆招募',
  codex: '领地法典',
  magic: '魔法书',
  administration: '领地政务',
  people: '人物信息',
  treasures: '装备与宝物',
  registration: '人物建档',
  expedition: '帝国征召',
} as const;
export type CastlePanelId = keyof typeof castlePanelNames;
export type PanelFocusTarget = Element & { focus(options?: FocusOptions): void };
export interface CastlePanelOrigin {
  owner?: object;
  returnFocus?: PanelFocusTarget;
}
interface PanelRequest extends CastlePanelOrigin {
  panel?: CastlePanelId;
  action: 'open' | 'release';
  accepted?: boolean;
  error?: unknown;
}
const REQUEST = 'th:castle-panel-request:v1';
const HUB_CHANGED = 'th:castle-panel-hub:v1';
const HUB_ATTRIBUTE = 'data-th-castle-panel-hub';
const PROVIDER_ATTRIBUTE = 'data-th-castle-panel-provider';
const PANEL_VISIBLE_ATTRIBUTE = 'data-th-castle-panel-visible';
const VISIBILITY_CHANGED = 'th:castle-panel-visibility:v1';

export function castleHostDocument(source: Document): Document {
  let host = source;
  // The Vue execution realm and the visible scene iframe can be different.
  while (host.defaultView) {
    try {
      const parent = host.defaultView.frameElement?.ownerDocument;
      if (!parent || parent === host) break;
      host = parent;
    } catch {
      break;
    }
  }
  return host;
}

function dispatch(doc: Document, name: string, detail?: PanelRequest) {
  const event = doc.createEvent('CustomEvent');
  event.initCustomEvent(name, false, false, detail);
  doc.dispatchEvent(event);
}

export function registerCastlePanelHub(source: Document): () => void {
  const doc = castleHostDocument(source);
  const marker = doc.createElement('span');
  marker.hidden = true;
  marker.setAttribute(HUB_ATTRIBUTE, '');
  doc.body.append(marker);
  dispatch(doc, HUB_CHANGED);
  return () => {
    marker.remove();
    dispatch(doc, HUB_CHANGED);
  };
}

export function isCastlePanelRegistered(source: Document, panel: CastlePanelId): boolean {
  return !!castleHostDocument(source).querySelector(`[${PROVIDER_ATTRIBUTE}="${panel}"]`);
}

export function openCastlePanel(source: Document, panel: CastlePanelId, origin: CastlePanelOrigin = {}) {
  const doc = castleHostDocument(source);
  const request: PanelRequest = { ...origin, panel, action: 'open' };
  dispatch(doc, REQUEST, request);
  if (request.error) throw request.error;
  if (!request.accepted)
    throw new Error(
      panel === 'administration'
        ? '请从更新后的领地地图打开城堡功能菜单或书房，再打开领地政务。'
        : panel === 'people' || panel === 'treasures' || panel === 'registration'
          ? '请先更新并启用「人物与宝物」入口脚本，再打开此处。'
          : `请先导入并启用配套的「${castlePanelNames[panel]}」脚本，再打开此处。`,
    );
}

export function releaseCastlePanels(source: Document, owner: object) {
  dispatch(castleHostDocument(source), REQUEST, { action: 'release', owner });
}

/** UI visibility only: no story values or cross-chat cache. */
export function observeCastlePanelVisibility(source: Document, listener: (visible: boolean) => void): () => void {
  const doc = castleHostDocument(source);
  const sync = () => listener(!!doc.querySelector(`[${PANEL_VISIBLE_ATTRIBUTE}]`));
  doc.addEventListener(VISIBILITY_CHANGED, sync);
  sync();
  return () => doc.removeEventListener(VISIBILITY_CHANGED, sync);
}

export function registerCastlePanel(
  source: Document,
  panel: CastlePanelId,
  controller: {
    dialog?: HTMLDialogElement;
    open(origin: CastlePanelOrigin): void;
    close(): void;
    setIntegrated(integrated: boolean): void;
  },
): () => void {
  const doc = castleHostDocument(source);
  if (isCastlePanelRegistered(doc, panel)) throw new Error(`「${castlePanelNames[panel]}」已经启用，请勿重复安装。`);
  const marker = doc.createElement('span');
  marker.hidden = true;
  marker.setAttribute(PROVIDER_ATTRIBUTE, panel);
  doc.body.append(marker);
  let owner: object | undefined;
  let visible = false;
  const syncVisibility = () => {
    const next = !!controller.dialog?.open;
    if (next === visible) return;
    visible = next;
    if (visible) marker.setAttribute(PANEL_VISIBLE_ATTRIBUTE, '');
    else marker.removeAttribute(PANEL_VISIBLE_ATTRIBUTE);
    dispatch(doc, VISIBILITY_CHANGED);
  };
  // Observe the actual dialog so Escape, chat changes, async failures and direct closes all agree.
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const observer = controller.dialog ? new Observer(syncVisibility) : undefined;
  if (controller.dialog) {
    observer?.observe(controller.dialog, { attributes: true, attributeFilter: ['open'] });
    controller.dialog.addEventListener('close', syncVisibility);
  }
  syncVisibility();
  const receive = (event: Event) => {
    const request = (event as CustomEvent<PanelRequest>).detail;
    if (request.action === 'release') {
      if (owner && owner === request.owner) {
        controller.close();
        syncVisibility();
        owner = undefined;
      }
      return;
    }
    if (request.panel !== panel || request.accepted) return;
    request.accepted = true;
    try {
      controller.open(request);
      owner = request.owner;
    } catch (error) {
      request.error = error;
    } finally {
      syncVisibility();
    }
  };
  const syncHub = () => controller.setIntegrated(!!doc.querySelector(`[${HUB_ATTRIBUTE}]`));
  doc.addEventListener(REQUEST, receive);
  doc.addEventListener(HUB_CHANGED, syncHub);
  syncHub();
  return () => {
    doc.removeEventListener(REQUEST, receive);
    doc.removeEventListener(HUB_CHANGED, syncHub);
    observer?.disconnect();
    controller.dialog?.removeEventListener('close', syncVisibility);
    marker.remove();
    if (visible) dispatch(doc, VISIBILITY_CHANGED);
    owner = undefined;
    controller.close();
  };
}
