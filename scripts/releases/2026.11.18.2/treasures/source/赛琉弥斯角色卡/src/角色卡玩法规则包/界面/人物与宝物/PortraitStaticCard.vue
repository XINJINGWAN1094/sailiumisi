<script setup lang="ts">
defineProps<{ src?: string; fallbackSrc: string; name: string; fit: 'contain' | 'cover' }>();
const emit = defineEmits<{ (event: 'image-error'): void }>();
</script>
<template>
  <div class="portrait-card portrait-static" data-card-effect="off" data-effect-engine="static">
    <div class="portrait-static__surface" data-card-surface>
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
        <div class="portrait-static__caption">
          <strong>{{ name }}</strong
          ><span>尚未放置人物图片</span>
        </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.portrait-static__surface {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #efe4cf var(--portrait-paper);
  box-shadow: 0 3px 7px #4f3d2b2b;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.portrait-static__caption {
  position: absolute;
  inset: auto 16px 7%;
  text-align: center;
  color: #20364b;
}
.portrait-static__caption strong {
  display: block;
  font-size: clamp(20px, 4cqw, 28px);
  line-height: 1.4;
}
.portrait-static__caption span {
  display: block;
  margin-top: 8px;
  color: #706552;
  font-size: 13px;
}
.portrait-static__surface::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px #aa8b5866,
    inset 0 0 0 3px #fff9e922;
}
</style>
