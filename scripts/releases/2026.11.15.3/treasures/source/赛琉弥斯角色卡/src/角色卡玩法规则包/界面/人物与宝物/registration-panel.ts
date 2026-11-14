import type { CastlePanelOrigin, PanelFocusTarget } from '../../../../util/castle-panels';
import { floatRegistrationButton } from './floating-registration';

type RegistrationPanelApi = {
  read(): { token: string; gameplay: { 人物: Record<string, { 姓名: string; 档案类型?: string }> } };
  registration?: {
    submit(request: { name: string; profileType: '长期' | '临时'; notes: string }, token: string): void;
    status(): { name: string; text: string; personId: string | null; busy: boolean } | null;
    cancel(): void;
  };
};

/** Non-modal background task with a draggable floating entry. */
export function mountPersonRegistration(host: Window, openPeople: () => void) {
  const doc = host.document;
  const root = doc.createElement('div');
  root.id = 'selyumis-person-registration';
  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { position:fixed; width:max-content; max-width:calc(100vw - 16px); right:16px; top:56px; z-index:2000; color-scheme:light;
        font:15px/1.6 'Microsoft YaHei',sans-serif; color:#24343b; }
      * { box-sizing:border-box; }
      [hidden] { display:none !important; }
      button,input,select,textarea { font:inherit; }
      button { cursor:pointer; min-height:42px; padding:8px 14px; border:1px solid #526875;
        border-radius:4px; background:#f5ebd6; color:#223947; }
      button:hover { background:#e5d6b9; }
      button:disabled { opacity:.65; cursor:default; }
      button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible {
        outline:3px solid #487b99; outline-offset:3px;
      }
      .primary,.toggle { background:#213e52; color:#fff5df; border-color:#bca780; }
      .primary:hover,.toggle:hover { background:#34586c; }
      .toggle { display:block; max-width:calc(100vw - 16px); font-weight:700; touch-action:none; user-select:none; cursor:grab; }
      :host(.is-dragging) .toggle { cursor:grabbing; }
      section { position:fixed; width:min(400px,calc(100vw - 24px)); max-height:calc(100dvh - 24px); overflow:auto;
        margin:0; padding:20px; background:#f3e9d3; border:1px solid #bca780; border-radius:5px;
        scrollbar-color:#958062 #f3e9d3; }
      header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
      h2 { margin:0; font:700 24px/1.3 'Noto Serif SC','SimSun',serif; }
      .close { padding:4px 10px; background:transparent; }
      p { margin:8px 0; }
      .intro,.help { font-size:14px; color:#45534f; }
      label { display:block; margin:14px 0 5px; font-weight:700; }
      input,select,textarea { display:block; width:100%; padding:9px 10px; background:#fffaf0; color:#24343b;
        border:1px solid #8e8a74; border-radius:3px; caret-color:#213e52; }
      textarea { min-height:88px; resize:vertical; }
      input::placeholder,textarea::placeholder { color:#63665d; opacity:1; }
      details { margin-top:14px; font-size:14px; }
      summary { cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
      .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
      .actions .primary { flex:1; }
      .status { margin:12px 0 0; font-size:14px; white-space:pre-wrap; overflow-wrap:anywhere; }
      .status.error { color:#8a2d1e; }
      ::selection { background:#b8d4dc; color:#182f3a; }
      @media(max-width:600px) { section { padding:16px; } input,select,textarea { font-size:16px; } }
    </style>
    <section id="registration-panel" hidden aria-labelledby="registration-title">
      <header><h2 id="registration-title">人物建档</h2><button class="close" type="button">收起</button></header>
      <form>
        <label for="registration-name">人物全名</label>
        <input id="registration-name" required maxlength="80" autocomplete="off" placeholder="填写人物全名">
        <label for="registration-type">档案类型</label>
        <select id="registration-type"><option value="长期">长期 · 重要人物持续记录</option><option value="临时">临时 · 战斗状态与预备面板</option></select>
        <label for="registration-notes">补充资料（可选）</label>
        <textarea id="registration-notes" maxlength="2000" placeholder="例如：龙形90多米、轻伤；未设定的信息可由 AI 补齐"></textarea>
        <details><summary>建档说明</summary>
          <p>填写正文中的人物全名，单字姓名也可。已有资料不用重填；未设定的必要信息由 AI 合理补齐，采用结果会在建档后列出。</p>
          <p>“90多米”等描述可直接使用，由 AI 选取符合描述的数值。亲和未知可留空，技能可在后续剧情中补登记。已有伤势只影响当前状态，不降低成长基础。</p>
          <p>长期档用于持续关注的重要人物；临时档用于战斗状态，也可手动预建。临时档不会自动删除或转长期。</p>
          <p>点击“开始建档”后自动在后台整理资料，不发送聊天消息、不续写剧情。正文生成中会先排队；身份不明、设定冲突或缺少可用模板时会说明原因。</p>
          <p>已有临时档选择长期可直接转档，保留伤势、能量与成长。建档不代表招募或加入领地。</p>
          <p>收起面板后继续处理，可主动取消。切换聊天、编辑、删除或切换回复会取消未完成的任务。结果保存在当前楼层的有效分支，原始回复不加入聊天记录。</p>
        </details>
        <div class="actions"><button class="primary" type="submit">开始建档</button><button class="cancel" type="button" hidden>取消建档</button></div>
      </form>
      <p class="status" role="status" aria-live="polite"></p>
      <button class="view" type="button" hidden>打开人物名册</button>
    </section>
    <button class="toggle" type="button" aria-controls="registration-panel" aria-expanded="false">人物建档</button>
  `;
  doc.body.append(root);
  const panel = shadow.querySelector('section')!;
  const toggle = shadow.querySelector<HTMLButtonElement>('.toggle')!;
  const name = shadow.querySelector<HTMLInputElement>('#registration-name')!;
  const profileType = shadow.querySelector<HTMLSelectElement>('#registration-type')!;
  const notes = shadow.querySelector<HTMLTextAreaElement>('#registration-notes')!;
  const status = shadow.querySelector<HTMLParagraphElement>('.status')!;
  const submit = shadow.querySelector<HTMLButtonElement>('[type=submit]')!;
  const view = shadow.querySelector<HTMLButtonElement>('.view')!;
  const cancel = shadow.querySelector<HTMLButtonElement>('.cancel')!;
  const api = () => (host as unknown as { __selyumis_equipment_v1__?: RegistrationPanelApi }).__selyumis_equipment_v1__;
  let error = '';
  const render = () => {
    try {
      const bridge = api();
      if (!bridge?.registration) throw new Error('建档功能暂未就绪，请等待变量脚本加载。');
      const people = bridge.read().gameplay.人物;
      const existing = Object.entries(people).find(
        ([id, person]) => id === name.value.trim() || person.姓名 === name.value.trim(),
      );
      const promote = existing?.[1].档案类型 === '临时' && profileType.value === '长期';
      const duplicate = !!existing && !promote;
      const progress = bridge.registration.status();
      submit.disabled = duplicate || !!progress?.busy;
      name.disabled = profileType.disabled = notes.disabled = !!progress?.busy;
      submit.textContent = progress?.busy ? '处理中…' : promote ? '转为长期' : '开始建档';
      view.hidden = !existing && !progress?.personId;
      cancel.hidden = !progress?.busy;
      status.classList.toggle('error', !!error);
      status.textContent =
        error ||
        (duplicate
          ? existing?.[1].档案类型 === '临时'
            ? '已有临时档。重要人物请将上方类型改为长期后提交。'
            : '已有长期档，无需重复申请。'
          : progress?.name === name.value.trim()
            ? `${progress.name}：${progress.text}`
            : promote
              ? '找到同名临时档，点击即可转为长期。'
              : '');
      toggle.textContent = progress?.busy ? '人物建档 · 处理中' : progress?.personId ? '人物建档 · 已完成' : '人物建档';
    } catch (e) {
      submit.disabled = true;
      status.classList.add('error');
      status.textContent = e instanceof Error ? e.message : '当前聊天暂时无法建档。';
    }
  };
  let returnFocus: PanelFocusTarget | undefined;
  const close = (restoreFocus = false) => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = undefined;
  };
  const open = (origin: CastlePanelOrigin = {}) => {
    returnFocus = origin.returnFocus ?? toggle;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    render();
    floating.position();
    if (name.disabled) cancel.focus();
    else name.focus();
  };
  toggle.onclick = () => {
    if (panel.hidden) open();
    else close(true);
  };
  shadow.querySelector<HTMLButtonElement>('.close')!.onclick = () => close(true);
  shadow.addEventListener('keydown', event => {
    if ((event as KeyboardEvent).key === 'Escape') {
      close(true);
      event.stopPropagation();
    }
  });
  name.oninput = () => {
    error = '';
    render();
  };
  profileType.onchange = () => {
    error = '';
    render();
  };
  shadow.querySelector('form')!.onsubmit = event => {
    event.preventDefault();
    try {
      const bridge = api();
      if (!bridge?.registration) throw new Error('建档功能暂未就绪，请稍后重试。');
      bridge.registration.submit(
        { name: name.value, profileType: profileType.value as '长期' | '临时', notes: notes.value },
        bridge.read().token,
      );
      error = '';
      render();
    } catch (e) {
      error = e instanceof Error ? e.message : '建档未能提交，请重试。';
      render();
    }
  };
  view.onclick = () => {
    close();
    openPeople();
  };
  cancel.onclick = () => {
    api()?.registration?.cancel();
    error = '';
    render();
  };
  const floating = floatRegistrationButton(host, root, toggle, panel, {
    read: () => getVariables({ type: 'script' }).personRegistrationPosition,
    save: position => insertOrAssignVariables({ personRegistrationPosition: position }, { type: 'script' }),
  });
  host.addEventListener('selyumis-equipment-changed', render);
  const reset = () => {
    close();
    name.value = '';
    notes.value = '';
    error = '';
    profileType.value = '长期';
    render();
  };
  const listeners = [
    tavern_events.CHAT_CHANGED,
    tavern_events.MESSAGE_SWIPED,
    tavern_events.MESSAGE_EDITED,
    tavern_events.MESSAGE_DELETED,
  ].map(event => eventOn(event, reset));
  render();
  return {
    open,
    close: () => close(true),
    setIntegrated: (_integrated: boolean) => {
      toggle.hidden = false;
    },
    dispose: () => {
      floating.dispose();
      listeners.forEach(l => l.stop());
      host.removeEventListener('selyumis-equipment-changed', render);
      root.remove();
    },
  };
}
