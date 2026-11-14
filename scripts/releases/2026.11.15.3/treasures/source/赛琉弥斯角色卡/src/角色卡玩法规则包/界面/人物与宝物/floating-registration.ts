type Position = { x: number; y: number };

/** Stores only a UI position. Pointer capture supports mouse, pen and touch in the host document. */
export function floatRegistrationButton(
  host: Window,
  root: HTMLElement,
  button: HTMLButtonElement,
  panel: HTMLElement,
  preferences: { read(): unknown; save(position: Position | null): void },
) {
  const stored = preferences.read() as Partial<Position> | null;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
  let preferred: Position | null =
    stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)
      ? { x: clamp(stored.x!, 0, 1), y: clamp(stored.y!, 0, 1) }
      : null;
  let drag: {
    id: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
    x: number;
    y: number;
    moved: boolean;
  } | null = null;
  let suppressClickUntil = 0;
  let frame = 0;
  const viewport = () => {
    const visible = host.visualViewport;
    const left = visible?.offsetLeft ?? 0,
      top = visible?.offsetTop ?? 0;
    const width = visible?.width ?? host.innerWidth,
      height = visible?.height ?? host.innerHeight;
    const size = button.getBoundingClientRect();
    return {
      left,
      top,
      width,
      height,
      minX: left + 8,
      minY: top + 8,
      maxX: Math.max(left + 8, left + width - size.width - 8),
      maxY: Math.max(top + 8, top + height - size.height - 8),
    };
  };
  function position() {
    const v = viewport();
    const size = button.getBoundingClientRect();
    const composer = host.document.querySelector('#send_form')?.getBoundingClientRect();
    const left = drag?.moved
      ? drag.x
      : preferred
        ? v.minX + preferred.x * (v.maxX - v.minX)
        : composer?.width
          ? composer.right - size.width - 8
          : v.maxX;
    const top = drag?.moved
      ? drag.y
      : preferred
        ? v.minY + preferred.y * (v.maxY - v.minY)
        : composer?.height
          ? composer.top - size.height - 10
          : v.maxY - 80;
    root.style.right = 'auto';
    root.style.left = `${clamp(left, v.minX, v.maxX)}px`;
    root.style.top = `${clamp(top, v.minY, v.maxY)}px`;
    if (panel.hidden) return;
    const anchor = button.getBoundingClientRect();
    const gap = 10;
    const above = Math.max(0, anchor.top - v.top - gap - 8);
    const below = Math.max(0, v.top + v.height - anchor.bottom - gap - 8);
    const upwards = above >= Math.min(320, v.height * 0.6) || above >= below;
    const available = upwards ? above : below;
    panel.style.width = `${Math.max(0, Math.min(400, v.width - 24))}px`;
    panel.style.maxHeight = `${available}px`;
    const bounds = panel.getBoundingClientRect();
    panel.style.left = `${clamp(anchor.right - bounds.width, v.left + 12, v.left + v.width - bounds.width - 12)}px`;
    panel.style.top = `${clamp(upwards ? anchor.top - gap - bounds.height : anchor.bottom + gap, v.top + 8, v.top + v.height - bounds.height - 8)}px`;
  }
  const schedule = () => {
    if (!frame)
      frame = host.requestAnimationFrame(() => {
        frame = 0;
        position();
      });
  };
  const remember = () => {
    const v = viewport(),
      rect = button.getBoundingClientRect();
    preferred = {
      x: v.maxX > v.minX ? clamp((rect.left - v.minX) / (v.maxX - v.minX), 0, 1) : 0,
      y: v.maxY > v.minY ? clamp((rect.top - v.minY) / (v.maxY - v.minY), 0, 1) : 0,
    };
    preferences.save(preferred);
  };
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      x: rect.left,
      y: rect.top,
      moved: false,
    };
    button.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX,
      dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.x = drag.left + dx;
    drag.y = drag.top + dy;
    root.classList.add('is-dragging');
    event.preventDefault();
    position();
  };
  const finish = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag;
    if (current.moved) {
      suppressClickUntil = host.performance.now() + 600;
      if (event.type === 'pointerup') remember();
    }
    drag = null;
    root.classList.remove('is-dragging');
    if (button.hasPointerCapture(current.id)) button.releasePointerCapture(current.id);
    position();
  };
  const click = (event: MouseEvent) => {
    if (event.detail > 0 && host.performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const key = (event: KeyboardEvent) => {
    if (!event.altKey) return;
    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      preferred = null;
      preferences.save(null);
      position();
      return;
    }
    const offset = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!offset) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = button.getBoundingClientRect(),
      v = viewport(),
      step = event.shiftKey ? 24 : 8;
    root.style.left = `${clamp(rect.left + offset[0] * step, v.minX, v.maxX)}px`;
    root.style.top = `${clamp(rect.top + offset[1] * step, v.minY, v.maxY)}px`;
    remember();
    position();
  };
  button.title = '点击建档；拖动移动。Alt + 方向键微调，Alt + Home 恢复默认位置。';
  button.setAttribute('aria-description', button.title);
  button.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+Home');
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointermove', move);
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('lostpointercapture', finish);
  button.addEventListener('click', click, true);
  button.addEventListener('keydown', key);
  const observer = new ResizeObserver(schedule);
  observer.observe(button);
  observer.observe(panel);
  const composer = host.document.querySelector('#send_form');
  if (composer) observer.observe(composer);
  host.addEventListener('resize', schedule);
  host.visualViewport?.addEventListener('resize', schedule);
  host.visualViewport?.addEventListener('scroll', schedule);
  position();
  return {
    position,
    dispose() {
      if (frame) host.cancelAnimationFrame(frame);
      observer.disconnect();
      button.removeEventListener('pointerdown', down);
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerup', finish);
      button.removeEventListener('pointercancel', finish);
      button.removeEventListener('lostpointercapture', finish);
      button.removeEventListener('click', click, true);
      button.removeEventListener('keydown', key);
      host.removeEventListener('resize', schedule);
      host.visualViewport?.removeEventListener('resize', schedule);
      host.visualViewport?.removeEventListener('scroll', schedule);
      drag = null;
    },
  };
}
