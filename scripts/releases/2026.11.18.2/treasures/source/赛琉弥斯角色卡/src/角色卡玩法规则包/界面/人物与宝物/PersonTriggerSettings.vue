<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { normalizePersonTriggerWords } from '../../people-context';

const props = defineProps<{
  personId: string;
  name: string;
  words: string[];
  defaults: string[];
  customized: boolean;
  available: boolean;
  saving: boolean;
  save: (words: string[] | null) => Promise<boolean>;
}>();

const draft = ref(props.words.join('\n'));
const feedback = ref('');
const working = ref(false);
const words = computed(() => normalizePersonTriggerWords(draft.value.split(/[\r\n,，;；]+/u)));
const changed = computed(() => JSON.stringify(words.value) !== JSON.stringify(props.words));
const disabled = computed(() => !props.available || props.saving || working.value);
const fieldId = computed(() => `person-trigger-words-${props.personId}`);

watch(
  () => JSON.stringify([props.personId, props.words, props.defaults, props.customized]),
  () => {
    draft.value = props.words.join('\n');
    feedback.value = '';
  },
);

async function submit(reset = false) {
  if (disabled.value) return;
  if (reset && !props.customized) {
    draft.value = props.defaults.join('\n');
    feedback.value = '已恢复默认词。';
    return;
  }
  working.value = true;
  feedback.value = '';
  try {
    const saved = await props.save(reset ? null : words.value);
    feedback.value = saved
      ? reset
        ? '已恢复默认词，今后随姓名和别名更新。'
        : '触发词已保存，下次发送消息时使用。'
      : '保存未完成，请查看提示后重试。';
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <details class="profile-management trigger-settings">
    <summary>
      档案触发词 <span>{{ customized ? '自定义' : '默认' }} · {{ props.words.length }} 个</span>
    </summary>
    <p>本轮输入包含任意触发词，就向 AI 提供此人的档案。读取不会让人物自动出场或参战。</p>
    <form @submit.prevent="submit()">
      <label :for="fieldId">{{ name }}的触发词</label>
      <textarea
        :id="fieldId"
        v-model="draft"
        rows="4"
        :spellcheck="false"
        :disabled="disabled"
        :aria-describedby="`${fieldId}-help`"
      />
      <p :id="`${fieldId}-help`" class="trigger-help">
        默认带入姓名和别名；可直接增删修改，每行一个或用逗号分隔。不限制数量，重复词会合并。
      </p>
      <p class="trigger-count">
        {{ words.length ? `当前 ${words.length} 个触发词` : '清空后只按主角、在场或参战状态提供档案。' }}
      </p>
      <div class="profile-actions">
        <button class="quiet-button" type="submit" :disabled="disabled || !changed">
          {{ working ? '正在保存…' : '保存触发词' }}
        </button>
        <button
          class="text-button"
          type="button"
          :disabled="disabled || (!customized && !changed)"
          @click="submit(true)"
        >
          恢复默认
        </button>
      </div>
      <p v-if="!available" class="trigger-feedback">触发词编辑暂未连接，请重新加载配套变量脚本。</p>
      <p v-if="feedback" class="trigger-feedback" role="status">{{ feedback }}</p>
    </form>
  </details>
</template>
