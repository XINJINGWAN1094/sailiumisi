<!-- Only selects an independent renderer. No shared effect, tilt or light logic. -->
<script setup lang="ts">
import { computed } from 'vue';
import PortraitGlareCard from './PortraitGlareCard.vue';
import Portrait151Card from './Portrait151Card.vue';
import PortraitStaticCard from './PortraitStaticCard.vue';
const props = defineProps<{
  src?: string;
  fallbackSrc: string;
  name: string;
  fit: 'contain' | 'cover';
  effect: 'off' | 'soft' | 'foil';
}>();
const emit = defineEmits<{ (event: 'image-error'): void }>();
const renderer = computed(() =>
  props.effect === 'soft' ? PortraitGlareCard : props.effect === 'foil' ? Portrait151Card : PortraitStaticCard,
);
const imageProps = computed(() => ({
  src: props.src,
  fallbackSrc: props.fallbackSrc,
  name: props.name,
  fit: props.fit,
}));
</script>
<template>
  <component :is="renderer" v-bind="imageProps" @image-error="emit('image-error')" />
</template>
