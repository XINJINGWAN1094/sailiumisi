import { BLOCK_MESSAGE, TARGET_SIGNATURES } from './config';
import { collectRuntimeSnapshot, detectBlockedRuntime } from './detector';

const OVERLAY_ID = 'character-card-runtime-guard';

function getHostWindow() {
  try {
    if (window.top?.document) {
      return window.top;
    }
  } catch {
    // 跨域时退回当前可访问的宿主。
  }
  try {
    if (window.parent?.document) {
      return window.parent;
    }
  } catch {
    // 同上。
  }
  return window;
}

function installBlockPage() {
  const hostWindow = getHostWindow();
  const hostDocument = hostWindow.document;
  // 多个独立脚本可同时命中；每个脚本仍须抛错终止，但宿主只安装一次阻断器。
  if ((hostWindow as unknown as Record<string, unknown>).__CHARACTER_CARD_RUNTIME_BLOCKED__ === true) {
    return;
  }
  const render = () => {
    if (!hostDocument.body || hostDocument.getElementById(OVERLAY_ID)) {
      return;
    }

    const overlay = hostDocument.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.textContent = BLOCK_MESSAGE;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'grid',
      placeItems: 'center',
      padding: '32px',
      color: '#f4f1ea',
      background: '#151414',
      font: '600 16px/1.7 system-ui, sans-serif',
      textAlign: 'center',
      whiteSpace: 'pre-wrap',
    });
    hostDocument.body.append(overlay);
    Array.from(hostDocument.body.children).forEach(element => {
      if (element !== overlay) {
        element.setAttribute('inert', '');
      }
    });
  };

  const stopInteraction = (event: Event) => {
    if (event.target === hostDocument.getElementById(OVERLAY_ID)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  ['click', 'submit', 'keydown', 'pointerdown', 'touchstart'].forEach(eventName => {
    hostDocument.addEventListener(eventName, stopInteraction, true);
  });

  render();
  const observer = new (hostWindow as Window & typeof globalThis).MutationObserver(render);
  observer.observe(hostDocument.documentElement, { childList: true, subtree: true });
  hostWindow.setInterval(render, 750);
  (hostWindow as unknown as Record<string, unknown>).__CHARACTER_CARD_RUNTIME_BLOCKED__ = true;
}

/**
 * 在其他角色卡脚本初始化的第一行调用。命中目标平台时会安装阻断页并抛出错误，
 * 因此调用之后的业务代码不会继续执行。
 */
export function assertSupportedRuntime() {
  const result = detectBlockedRuntime(TARGET_SIGNATURES, collectRuntimeSnapshot());
  if (!result.blocked) {
    return;
  }

  console.warn('[角色卡平台防盗] 已阻止不受支持的运行环境。', {
    signatureId: result.signatureId,
    matchedRuleIds: result.matchedRuleIds,
  });
  installBlockPage();
  throw new Error(BLOCK_MESSAGE);
}
