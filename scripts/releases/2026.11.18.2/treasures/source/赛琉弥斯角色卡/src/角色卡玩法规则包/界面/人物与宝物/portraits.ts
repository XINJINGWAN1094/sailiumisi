import { isPrivateGeneration } from '../../../../util/private-generation';

/** UI-only image bindings. Stored outside stat_data and never included in the AI view. */
export const PORTRAIT_KEY = '_selyumis_people_portraits_v1';
export const PORTRAIT_API_KEY = '__selyumis_people_portraits_v1__';
export const PORTRAIT_LIMIT = 8 * 1024 * 1024;
export type PortraitSnapshot = { token: string; urls: Record<string, string> };
export type PortraitApi = {
  read(): PortraitSnapshot;
  save(id: string, url: string, token: string): PortraitSnapshot;
  upload(id: string, file: File, token: string, signal: AbortSignal): Promise<PortraitSnapshot>;
};

/** Errors from the launcher iframe do not share the Vue iframe's Error constructor. */
export function portraitErrorMessage(error: unknown, fallback: string): string {
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message || fallback
    : fallback;
}

type Message = Pick<ChatMessageSwiped, 'message_id' | 'swipe_id' | 'swipes'>;
type PortraitRecord = { urls: Record<string, string> };
const fingerprint = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
};

export function portraitPath(value: string, baseUrl: string): string {
  const url = new URL(value, baseUrl);
  if (
    url.origin !== new URL(baseUrl).origin ||
    !/^https?:$/.test(url.protocol) ||
    !url.pathname.startsWith('/user/images/') ||
    !/\.(png|jpe?g|webp)$/i.test(url.pathname) ||
    url.username ||
    url.password
  )
    throw new Error('请填写当前酒馆 /user/images/ 下的 PNG、JPG 或 WebP 图片地址。');
  return url.pathname + url.search;
}

/** Select the nearest ancestor binding from a separate, chat-scoped journal. */
export function readPortraitBranch(
  messages: Message[],
  identity: string,
  baseUrl: string,
  records: Record<string, PortraitRecord>,
) {
  const branch = messages.map(message => [
    message.message_id,
    message.swipe_id,
    fingerprint(message.swipes[message.swipe_id] ?? ''),
  ]);
  let urls: Record<string, string> = {};
  let depth = -1;
  for (const [scope, record] of Object.entries(records)) {
    try {
      const [savedIdentity, ancestry] = JSON.parse(scope);
      if (
        savedIdentity !== identity ||
        !Array.isArray(ancestry) ||
        ancestry.length <= depth ||
        ancestry.length > branch.length ||
        ancestry.some(
          (entry, i) => !Array.isArray(entry) || entry.length !== 3 || entry.some((part, j) => part !== branch[i][j]),
        )
      )
        continue;
      if (!record?.urls || typeof record.urls !== 'object' || Array.isArray(record.urls)) continue;
      depth = ancestry.length;
    } catch {
      continue;
    }
    urls = Object.fromEntries(
      Object.entries(record.urls).flatMap(([id, value]) => {
        try {
          return typeof value === 'string' && value ? [[id, portraitPath(value, baseUrl)]] : [];
        } catch {
          return [];
        }
      }),
    );
  }
  const scope = JSON.stringify([identity, branch]);
  return { scope, urls, token: JSON.stringify([scope, urls]) };
}

type Host = Window & {
  [PORTRAIT_API_KEY]?: PortraitApi;
  __selyumis_equipment_v1__?: {
    read(): { gameplay: { 人物: Record<string, unknown> } };
  };
};

export function installPortraitRuntime(host: Window) {
  const target = host as Host;
  const baseUrl = host.location.origin;
  let stopped = false;
  let generating = false;
  let epoch = 0;
  const pending = new Set<AbortController>();
  const current = () => {
    if (stopped) throw new Error('图片功能已关闭，请重新打开人物面板。');
    const chatId = SillyTavern.getCurrentChatId();
    if (!chatId) throw new Error('请先打开聊天。');
    const avatar = SillyTavern.characters[Number(SillyTavern.characterId)]?.avatar;
    if (!avatar) throw new Error('请在角色卡聊天中设置人物图片。');
    const messages = getChatMessages('0-{{lastMessageId}}', { include_swipes: true });
    if (!messages.length) throw new Error('当前聊天没有可保存图片的楼层。');
    const records = getVariables({ type: 'chat' })[PORTRAIT_KEY];
    return readPortraitBranch(
      messages,
      JSON.stringify([avatar, chatId]),
      baseUrl,
      records && typeof records === 'object' && !Array.isArray(records) ? records : {},
    );
  };
  const assertTarget = (id: string, token: string) => {
    if (generating) throw new Error('请等本轮回复结束后再修改人物图片。');
    const snapshot = current();
    if (snapshot.token !== token) throw new Error('聊天或分支已变化，请重新选择图片。');
    const people = target.__selyumis_equipment_v1__?.read().gameplay.人物;
    if (!people || !Object.hasOwn(people, id)) throw new Error('当前分支中已找不到此人物，请重新打开面板。');
    return snapshot;
  };
  const read = (): PortraitSnapshot => {
    const { token, urls } = current();
    return { token, urls };
  };
  const save: PortraitApi['save'] = (id, value, token) => {
    const url = value.trim() ? portraitPath(value.trim(), baseUrl) : '';
    const snapshot = assertTarget(id, token);
    const urls = { ...snapshot.urls };
    if (url) Object.defineProperty(urls, id, { value: url, enumerable: true, configurable: true, writable: true });
    else delete urls[id];
    // Separate chat data cannot be overwritten by an MVU equipment/growth message writeback.
    updateVariablesWith(
      data => ({
        ...data,
        [PORTRAIT_KEY]: {
          ...data[PORTRAIT_KEY],
          [snapshot.scope]: { urls },
        },
      }),
      { type: 'chat' },
    );
    return read();
  };
  const upload: PortraitApi['upload'] = async (id, file, token, signal) => {
    assertTarget(id, token);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > PORTRAIT_LIMIT)
      throw new Error('请选择 8 MB 以内的 PNG、JPG 或 WebP 图片。');
    const operation = epoch;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.add(controller);
    try {
      controller.signal.throwIfAborted();
      const bytes = new Uint8Array(await file.arrayBuffer());
      controller.signal.throwIfAborted();
      // Check the signature before sending data to the native image endpoint.
      const ascii = (at: number, text: string) => [...text].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));
      const valid =
        file.type === 'image/png'
          ? bytes[0] === 137 && ascii(1, 'PNG\r\n\x1a\n')
          : file.type === 'image/jpeg'
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : ascii(0, 'RIFF') && ascii(8, 'WEBP');
      if (!valid) throw new Error('图片内容与文件格式不符，请换一张有效图片。');
      let binary = '';
      for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
      const format = file.type === 'image/jpeg' ? 'jpg' : file.type.slice(6);
      const filename = `v1-${Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('')}`;
      const folder = 'selyumis-people-portraits';
      const expected = `/user/images/${folder}/${filename}.${format}`;
      assertTarget(id, token);
      const response = await fetch(new URL('/api/images/upload', baseUrl), {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: SillyTavern.getRequestHeaders(),
        body: JSON.stringify({ image: btoa(binary), format, ch_name: folder, filename }),
      });
      if (!response.ok) throw new Error('图片未能保存到酒馆，请稍后重试；原图片未更改。');
      const result = await response.json();
      controller.signal.throwIfAborted();
      if (operation !== epoch) throw new Error('面板或聊天已切换，本次图片未绑定。');
      const returned =
        typeof result.path === 'string'
          ? portraitPath(result.path.startsWith('/') ? result.path : `/${result.path}`, baseUrl)
          : '';
      if (returned !== expected) throw new Error('酒馆返回的图片地址不正确，原图片未更改。');
      return save(id, returned, token);
    } finally {
      signal.removeEventListener('abort', abort);
      pending.delete(controller);
    }
  };
  const api: PortraitApi = { read, save, upload };
  target[PORTRAIT_API_KEY] = api;
  const cancel = () => {
    epoch++;
    pending.forEach(controller => controller.abort());
    pending.clear();
  };
  const listeners = [
    ...[
      tavern_events.MESSAGE_SWIPED,
      tavern_events.MESSAGE_EDITED,
      tavern_events.MESSAGE_DELETED,
      tavern_events.MESSAGE_SENT,
      tavern_events.MESSAGE_RECEIVED,
    ].map(event => eventOn(event, cancel)),
    eventOn(tavern_events.CHAT_CHANGED, () => {
      generating = false;
      cancel();
    }),
    eventOn(tavern_events.GENERATION_STARTED, (_type, _options, dryRun) => {
      // Token counting previews emit STARTED without a matching ENDED event.
      if (dryRun || isPrivateGeneration()) return;
      generating = true;
      cancel();
    }),
    eventOn(tavern_events.GENERATION_ENDED, () => {
      if (isPrivateGeneration()) return;
      generating = false;
    }),
    eventOn(tavern_events.GENERATION_STOPPED, () => {
      if (isPrivateGeneration()) return;
      generating = false;
    }),
  ];
  return {
    cancel,
    dispose() {
      stopped = true;
      cancel();
      listeners.forEach(listener => listener.stop());
      if (target[PORTRAIT_API_KEY] === api) delete target[PORTRAIT_API_KEY];
    },
  };
}
