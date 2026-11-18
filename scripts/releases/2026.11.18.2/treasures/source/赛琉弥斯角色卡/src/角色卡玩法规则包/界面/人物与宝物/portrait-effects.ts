import { ref, watch } from 'vue';

export type PortraitEffect = 'off' | 'soft' | 'foil';
const storageKey = 'selyumis.portrait-effect.v1';
const valid = (value: unknown): value is PortraitEffect => value === 'off' || value === 'soft' || value === 'foil';

export function usePortraitEffect() {
  let initial: PortraitEffect = 'soft';
  try {
    const saved = localStorage.getItem(storageKey);
    if (valid(saved)) initial = saved;
  } catch {
    /* Embedded pages may deny storage; the current session still works. */
  }
  const portraitEffect = ref<PortraitEffect>(initial);
  watch(
    portraitEffect,
    value => {
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        /* Keep the in-memory selection. */
      }
    },
    { flush: 'sync' },
  );
  return portraitEffect;
}
