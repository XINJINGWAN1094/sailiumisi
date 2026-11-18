import { isSupportedRuntime } from '../../../../util/platform-guard';
// INT-18: UI only. The installed variable script owns every read/write transaction.
import {
  openCastlePanel,
  registerCastlePanel,
  type CastlePanelOrigin,
  type PanelFocusTarget,
} from '../../../../util/castle-panels';
import { mountPersonRegistration } from './registration-panel';
import { installPortraitRuntime } from './portraits';

declare const __TREASURE_BUNDLE__: {
  javascript: string;
  stylesheet: string;
  assets: string[];
  optionalAssets: Record<string, string>;
};

$(() => {
  if (!isSupportedRuntime()) return;
  const host = window.frameElement?.ownerDocument.defaultView ?? window.parent;
  const doc = host.document;
  const id = 'selyumis-people-treasures-dialog';
  if (doc.getElementById(id)) throw new Error('人物与宝物入口已启用，请勿重复安装。');
  const dialog = doc.createElement('dialog');
  dialog.id = id;
  dialog.setAttribute('aria-label', '人物与宝物');
  const style = doc.createElement('style');
  style.textContent = `
    #${id} { position:fixed; inset:0; box-sizing:border-box; width:100vw; height:100dvh;
      max-width:none; max-height:none; margin:0; padding:0; border:0; background:#192a3a; color:#efe4cf; }
    #${id}[open] { display:flex; flex-direction:column; }
    #${id}::backdrop { background:#192a3a; }
    #${id} .treasure-toolbar { position:absolute; top:8px; right:12px; z-index:1; display:flex; }
    #${id} .treasure-toolbar button { height:36px; padding:0 16px; font:16px/1.5 sans-serif; }
    #${id} button { min-height:36px; padding:4px 16px; border:1px solid #b7a381;
      border-radius:3px; color:#efe4cf; background:#20364b; cursor:pointer; font:inherit; }
    #${id} button:hover { background:#365069; }
    #${id} button:focus-visible { outline:2px solid #efe4cf; outline-offset:2px; }
    #${id} iframe { display:block; flex:1; width:100%; min-height:0; border:0; }
  `;
  const toolbar = doc.createElement('div');
  toolbar.className = 'treasure-toolbar';
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '关闭';
  closeButton.title = '关闭（Esc）';
  closeButton.setAttribute('aria-label', '关闭人物与宝物');
  toolbar.append(closeButton);
  dialog.append(toolbar);
  doc.head.append(style);
  doc.body.append(dialog);
  let frame: HTMLIFrameElement | undefined;
  let returnFocus: PanelFocusTarget | undefined;
  let activeScreen: 'people' | 'treasures' = 'people';
  const portraits = installPortraitRuntime(host);
  const clearFrame = () => {
    portraits.cancel();
    frame?.contentWindow?.dispatchEvent(new Event('pagehide'));
    frame?.remove();
    frame = undefined;
  };
  const close = () => {
    clearFrame();
    if (dialog.open) dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = undefined;
  };
  const mount = () => {
    const storedAssets = getVariables({ type: 'script', script_id: getScriptId() }).assetUrls as Record<string, string>;
    const assets = { ...__TREASURE_BUNDLE__.optionalAssets, ...storedAssets };
    if (__TREASURE_BUNDLE__.assets.some(name => !assets?.[name]))
      throw new Error('人物与宝物图片尚未安装，请使用配套资源安装包。');
    clearFrame();
    frame = doc.createElement('iframe');
    frame.title = '赛琉弥斯 · 人物与宝物';
    const stylesheet = __TREASURE_BUNDLE__.stylesheet.replace(
      /url\((['"]?)\.\/assets\/([^)'"\s]+)\1\)/g,
      (_match, _quote, name: string) => `url(${JSON.stringify(assets[name])})`,
    );
    const settings = JSON.stringify({ screen: activeScreen, assets }).replace(/</g, '\\u003c');
    const javascript = __TREASURE_BUNDLE__.javascript.replace(/<\/script/gi, '<\\/script');
    frame.srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style></head>
      <body><div id="treasure-ui"></div><script>window.__selyumis_treasure_mount__=${settings};</script>
      <script>${javascript}</script></body></html>`;
    frame.addEventListener('load', () => {
      frame?.contentDocument?.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      });
    });
    dialog.append(frame);
  };
  const open = (screen: 'people' | 'treasures', origin: CastlePanelOrigin = {}) => {
    try {
      activeScreen = screen;
      returnFocus = origin.returnFocus ?? (doc.activeElement as PanelFocusTarget);
      mount();
      if (!dialog.open) dialog.showModal();
      closeButton.focus();
    } catch (error) {
      close();
      console.error('[人物与宝物] 挂载失败', error);
      throw error;
    }
  };
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', clearFrame);
  const openStandalone = (panel: 'people' | 'treasures') => {
    try {
      openCastlePanel(doc, panel);
    } catch (error) {
      toastr.error(error instanceof Error ? error.message : '人物与宝物暂时无法打开。');
    }
  };
  const registration = mountPersonRegistration(host, () => openStandalone('people'));
  const unregisterPanels = (['people', 'treasures'] as const).map(screen =>
    registerCastlePanel(doc, screen, {
      dialog,
      open: origin => {
        registration.close();
        open(screen, origin);
      },
      close: () => {
        if (activeScreen === screen) close();
      },
      setIntegrated: () => {},
    }),
  );
  unregisterPanels.push(registerCastlePanel(doc, 'registration', registration));
  const listeners = [
    eventOn(getButtonEvent('领地人物'), () => openStandalone('people')),
    eventOn(getButtonEvent('宝物藏室'), () => openStandalone('treasures')),
    eventOn(tavern_events.CHAT_CHANGED, close),
    ...[tavern_events.MESSAGE_SWIPED, tavern_events.MESSAGE_DELETED, tavern_events.MESSAGE_EDITED].map(event =>
      eventOn(event, close),
    ),
  ];
  $(window).one('pagehide', () => {
    listeners.forEach(listener => listener.stop());
    close();
    unregisterPanels.forEach(unregister => unregister());
    registration.dispose();
    portraits.dispose();
    dialog.remove();
    style.remove();
  });
});
