<!-- Adapted from Inspira UI GlareCard.vue, commit eec920b047589058b4b02ba64deb614869e7237a.
     Copyright (c) 2024-2026 rahulv.dev. MIT; see licenses/inspira-ui/LICENSE.txt.
     Adaptation: portrait fitting, local art, restrained reflection, touch and reduced-motion support. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
const props = defineProps<{ src?: string; fallbackSrc: string; name: string; fit: 'contain' | 'cover' }>();
const emit = defineEmits<{ (event: 'image-error'): void }>();
const refElement = ref<HTMLElement | null>(null);
const isPointerInside = ref(false);
const reduceMotion = ref(false);
const pageVisible = ref(true);
const effectsEnabled = computed(() => !reduceMotion.value && pageVisible.value);
const state = ref({ glare: { x: 50, y: 50 }, background: { x: 50, y: 50 }, rotate: { x: 0, y: 0 } });
const style = computed(() => ({
  '--m-x': `${state.value.glare.x}%`,
  '--m-y': `${state.value.glare.y}%`,
  '--r-x': `${state.value.rotate.x}deg`,
  '--r-y': `${state.value.rotate.y}deg`,
  '--bg-x': `${state.value.background.x}%`,
  '--bg-y': `${state.value.background.y}%`,
}));
let frame = 0;
let pointer = { x: 0, y: 0 };
function updatePointer() {
  frame = 0;
  if (!effectsEnabled.value) return;
  const rect = refElement.value?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return;
  isPointerInside.value = true;
  const percentage = {
    x: Math.max(0, Math.min(100, (100 * (pointer.x - rect.left)) / rect.width)),
    y: Math.max(0, Math.min(100, (100 * (pointer.y - rect.top)) / rect.height)),
  };
  const delta = { x: percentage.x - 50, y: percentage.y - 50 };
  const rotateFactor = 0.25;
  state.value.background.x = 50 + percentage.x / 4 - 12.5;
  state.value.background.y = 50 + percentage.y / 3 - 16.67;
  state.value.rotate.x = -(delta.x / 3.5) * rotateFactor;
  state.value.rotate.y = (delta.y / 2) * rotateFactor;
  state.value.glare.x = percentage.x;
  state.value.glare.y = percentage.y;
}
function handlePointerMove(event: PointerEvent) {
  if (!effectsEnabled.value || (event.pointerType === 'touch' && !event.buttons)) return;
  pointer = { x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(updatePointer);
}
function reset() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  isPointerInside.value = false;
  state.value.rotate = { x: 0, y: 0 };
}
let media: MediaQueryList | undefined;
function motionChanged() {
  reduceMotion.value = media?.matches ?? false;
  if (reduceMotion.value) reset();
}
function visibilityChanged() {
  pageVisible.value = !document.hidden;
}
const pointerListeners = computed(() =>
  effectsEnabled.value
    ? {
        pointermove: handlePointerMove,
        pointerdown: handlePointerMove,
        pointerleave: reset,
        pointercancel: reset,
        pointerup: (event: PointerEvent) => {
          if (event.pointerType === 'touch') reset();
        },
      }
    : {},
);
watch(effectsEnabled, enabled => {
  if (!enabled) reset();
});
onMounted(() => {
  media = matchMedia('(prefers-reduced-motion: reduce)');
  motionChanged();
  media.addEventListener('change', motionChanged);
  visibilityChanged();
  document.addEventListener('visibilitychange', visibilityChanged);
});
onUnmounted(() => {
  reset();
  media?.removeEventListener('change', motionChanged);
  document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>

<template>
  <div
    ref="refElement"
    class="portrait-card"
    :class="{ 'is-active': isPointerInside, 'has-image': !!src, 'effects-disabled': !effectsEnabled }"
    :style="style"
    data-card-effect="soft"
    data-effect-engine="inspira-glare"
    v-on="pointerListeners"
  >
    <div class="portrait-card__surface" data-card-surface>
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
        <div class="portrait-card__caption">
          <strong>{{ name }}</strong
          ><span>尚未放置人物图片</span>
        </div>
      </template>
      <template v-if="effectsEnabled">
        <div class="portrait-card__foil" aria-hidden="true"></div>
        <div class="portrait-card__glare" aria-hidden="true"></div>
      </template>
      <div class="portrait-card__rim" aria-hidden="true"></div>
    </div>
  </div>
</template>

<style scoped>
.portrait-card {
  position: relative;
  perspective: 900px;
  isolation: isolate;
  touch-action: pan-y;
}
.portrait-card__surface {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #efe4cf var(--portrait-paper);
  transform: rotateY(var(--r-x)) rotateX(var(--r-y));
  transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 3px 7px #4f3d2b2b;
}
.is-active .portrait-card__surface {
  transition-duration: 120ms;
}
.effects-disabled .portrait-card__surface {
  transform: none;
  transition: none;
}
.portrait-card__image,
.portrait-card__default {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.portrait-card__caption {
  position: absolute;
  inset: auto 16px 7%;
  text-align: center;
  color: #20364b;
}
.portrait-card__caption strong {
  display: block;
  font-size: clamp(20px, 4cqw, 28px);
  line-height: 1.4;
}
.portrait-card__caption span {
  display: block;
  margin-top: 8px;
  color: #706552;
  font-size: 13px;
}
.portrait-card__glare,
.portrait-card__foil,
.portrait-card__rim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
}
.portrait-card__glare {
  background: radial-gradient(
    farthest-corner circle at var(--m-x) var(--m-y),
    #fff9e9bb 0%,
    #fff7e650 22%,
    transparent 74%
  );
  mix-blend-mode: soft-light;
  opacity: 0;
  transition: opacity 220ms ease-out;
}
.portrait-card__foil {
  background: linear-gradient(125deg, transparent 24%, #e7c77a60 43%, #e8f6ff50 50%, #b4d8df30 57%, transparent 74%);
  background-size: 240% 240%;
  background-position: var(--bg-x) var(--bg-y);
  mix-blend-mode: soft-light;
  opacity: 0;
  transition: opacity 220ms ease-out;
}
.portrait-card__rim {
  box-shadow:
    inset 0 0 0 1px #aa8b5866,
    inset 0 0 0 3px #fff9e922;
}
.is-active .portrait-card__glare {
  opacity: 0.7;
}
.is-active .portrait-card__foil {
  opacity: 0.55;
}
@media (prefers-reduced-motion: reduce) {
  .portrait-card__surface {
    transform: none;
    transition: none;
  }
  .portrait-card__glare,
  .portrait-card__foil {
    display: none;
  }
}
</style>
