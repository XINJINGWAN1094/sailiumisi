<!-- SPDX-License-Identifier: GPL-3.0-only
  Independent Vue port of simeydotme/pokemon-cards-151 by Simon Goellner.
  Source: src/lib/components/Card.svelte at 98030f941cdc4919b648457200277e29b60d5f5a.
  Modified 2026-11-12: Vue lifecycle, local portraits, on-demand spring loop,
  no Pokemon card-back, expansion or analytics; reduced-motion and visibility guards.
  This component has no dependency on Inspira UI / PortraitGlareCard.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
defineProps<{ src?: string; fallbackSrc: string; name: string; fit: 'contain' | 'cover' }>();
const emit = defineEmits<{ (event: 'image-error'): void }>();
const element = ref<HTMLElement | null>(null);
const enabled = ref(false);
const resting = () => ({
  rotateX: 0,
  rotateY: 0,
  glareX: 50,
  glareY: 50,
  opacity: 0,
  backgroundX: 50,
  backgroundY: 50,
});
type State = ReturnType<typeof resting>;
const state = ref(resting());
let target = resting();
const velocity: State = { rotateX: 0, rotateY: 0, glareX: 0, glareY: 0, opacity: 0, backgroundX: 0, backgroundY: 0 };
const keys = Object.keys(target) as Array<keyof State>;
let frame = 0,
  previousTime = 0,
  accumulator = 0;
let stiffness = 0.066,
  damping = 0.25;
let returnTimer: ReturnType<typeof setTimeout> | undefined;
let motion: MediaQueryList | undefined;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;
const styles = computed(() => ({
  '--pointer-x': `${state.value.glareX}%`,
  '--pointer-y': `${state.value.glareY}%`,
  '--pointer-from-center': clamp(Math.hypot(state.value.glareX - 50, state.value.glareY - 50) / 50, 0, 1),
  '--pointer-from-top': state.value.glareY / 100,
  '--pointer-from-left': state.value.glareX / 100,
  '--card-opacity': clamp(state.value.opacity, 0, 1),
  '--rotate-x': `${state.value.rotateX}deg`,
  '--rotate-y': `${state.value.rotateY}deg`,
  '--rotate-delta': '0deg',
  '--background-x': `${clamp(state.value.backgroundX)}%`,
  '--background-y': `${clamp(state.value.backgroundY)}%`,
  '--card-scale': 1,
  // Leave room for the original 151 tilt inside this fixed-height character panel.
  '--portrait-fit-scale':
    1 - 0.14 * clamp(Math.max(Math.abs(state.value.rotateX) / 14.3, Math.abs(state.value.rotateY) / 25), 0, 1),
}));
function tick(time: number) {
  frame = 0;
  if (!enabled.value) return;
  accumulator += previousTime ? Math.min(64, time - previousTime) : 1000 / 60;
  previousTime = time;
  const next = { ...state.value };
  // Fixed 60 Hz spring steps keep the response consistent on 60/120/144 Hz displays.
  while (accumulator >= 1000 / 60) {
    for (const key of keys) {
      velocity[key] = velocity[key] * (1 - damping) + (target[key] - next[key]) * stiffness;
      next[key] += velocity[key];
    }
    accumulator -= 1000 / 60;
  }
  const settled = keys.every(key => Math.abs(target[key] - next[key]) < 0.001 && Math.abs(velocity[key]) < 0.001);
  state.value = settled ? { ...target } : next;
  if (!settled) frame = requestAnimationFrame(tick);
  else {
    previousTime = 0;
    accumulator = 0;
    for (const key of keys) velocity[key] = 0;
  }
}
function animate() {
  if (enabled.value && !frame) frame = requestAnimationFrame(tick);
}
function clearReturn() {
  if (returnTimer !== undefined) clearTimeout(returnTimer);
  returnTimer = undefined;
}
function interact(event: PointerEvent) {
  if (!enabled.value || (event.pointerType === 'touch' && !event.buttons)) return;
  clearReturn();
  const rect = element.value?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return;
  const x = clamp(round((100 * (event.clientX - rect.left)) / rect.width));
  const y = clamp(round((100 * (event.clientY - rect.top)) / rect.height));
  // Original 151 mappings and interaction constants, without the first effect's .25 multiplier.
  target = {
    backgroundX: 37 + x * 0.26,
    backgroundY: 33 + y * 0.34,
    rotateX: round(-(x - 50) / 3.5),
    rotateY: round((y - 50) / 2),
    glareX: x,
    glareY: y,
    opacity: 1,
  };
  stiffness = 0.066;
  damping = 0.25;
  animate();
}
function leave() {
  clearReturn();
  returnTimer = setTimeout(() => {
    returnTimer = undefined;
    target = resting();
    stiffness = 0.01;
    damping = 0.06;
    animate();
  }, 500);
}
function stop() {
  clearReturn();
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
  accumulator = 0;
  target = resting();
  state.value = resting();
  for (const key of keys) velocity[key] = 0;
}
function syncAvailability() {
  enabled.value = !motion?.matches && !document.hidden;
  if (!enabled.value) stop();
}
const listeners = computed(() =>
  enabled.value
    ? {
        pointermove: interact,
        pointerdown: interact,
        pointerleave: leave,
        pointercancel: stop,
        pointerup: (event: PointerEvent) => {
          if (event.pointerType === 'touch') leave();
        },
      }
    : {},
);
onMounted(() => {
  motion = matchMedia('(prefers-reduced-motion: reduce)');
  syncAvailability();
  motion.addEventListener('change', syncAvailability);
  document.addEventListener('visibilitychange', syncAvailability);
});
onUnmounted(() => {
  stop();
  motion?.removeEventListener('change', syncAvailability);
  document.removeEventListener('visibilitychange', syncAvailability);
});
</script>
<template>
  <div
    ref="element"
    class="portrait-card portrait151"
    :class="{ 'portrait151--disabled': !enabled }"
    :style="styles"
    data-card-effect="foil"
    data-effect-engine="pokemon-151"
    v-on="listeners"
  >
    <div class="portrait151__surface" data-card-surface>
      <div class="portrait151__front">
        <img
          v-if="src"
          class="portrait-card__image"
          :src="src"
          :alt="`${name}的人物图片`"
          :style="{ objectFit: fit }"
          @error="emit('image-error')"
        />
        <template v-else>
          <img class="portrait-card__default" :src="fallbackSrc" alt="女性人物徽记羊皮纸底图" />
          <div class="portrait151__caption">
            <strong>{{ name }}</strong
            ><span>尚未放置人物图片</span>
          </div>
        </template>
        <template v-if="enabled">
          <div class="portrait151__shine" data-effect-layer aria-hidden="true"></div>
          <div class="portrait151__glitter" data-effect-layer aria-hidden="true"></div>
          <div class="portrait151__glare" data-effect-layer aria-hidden="true"></div>
        </template>
      </div>
    </div>
  </div>
</template>
