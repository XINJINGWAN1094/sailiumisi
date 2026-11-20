<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { displayAmount } from '../../display';
import {
  categories,
  createTreasures,
  people as examplePeople,
  slots,
  type Category,
  type Slot,
  type Treasure,
  type Person,
} from './fixture';
import { categoryIcons, equipmentBenefitsApply, type GameplayCommand } from '../../equipment';
import { describeTreasure, treasureCategoryName } from '../../progression';
import { OPPORTUNITY_LIMIT, PITY_ROUNDS, TREASURE_INVENTORY_LIMIT } from '../../treasure-config';
import type { TreasureOpportunities } from '../../treasure-opportunities';
import {
  findEquipmentApi,
  findPortraitApi,
  mountedOptions,
  requiresLiveRuntime,
  viewFromEquipmentState,
  type EquipmentApi,
} from './runtime';
import { portraitErrorMessage, type PortraitSnapshot } from './portraits';
import PersonTriggerSettings from './PersonTriggerSettings.vue';
import PortraitCard from './PortraitCard.vue';
import { usePortraitEffect } from './portrait-effects';
const portraitEffect = usePortraitEffect();
const portraitFit = ref<'contain' | 'cover'>('contain');

const art = (name: string) => mountedOptions?.assets[`${name}.webp`] ?? `./assets/${name}.webp`;
const screen = ref(mountedOptions?.screen ?? (location.hash === '#people' ? 'people' : 'treasures'));
const treasurePane = ref('collection');
const peoplePane = ref('portrait');
const liveOnly = requiresLiveRuntime();
const treasures = ref<Treasure[]>(liveOnly ? [] : createTreasures());
const people = ref<Person[]>(liveOnly ? [] : structuredClone(examplePeople));
const isLive = ref(liveOnly);
const saving = ref(false);
const triggerEditingSupported = ref(false);
const opportunityMode = ref(false);
const opportunityState = ref<TreasureOpportunities>();
const opportunityItems = computed<Treasure[]>(() =>
  Object.entries(opportunityState.value?.机会 ?? {}).map(([id, value]) => ({
    id,
    name: value.物品.名称,
    category: value.物品.宝物.大类,
    quantity: 1,
    use: value.物品.宝物.使用方式 === '消耗' ? 'consume' : 'wear',
    effect: describeTreasure(value.物品.宝物) ?? value.物品.固定规格,
    description: value.状态,
    metadata: value.物品.宝物,
  })),
);
const listedItems = computed(() => (opportunityMode.value ? opportunityItems.value : treasures.value));
const selectedOpportunity = computed(() =>
  opportunityMode.value ? opportunityState.value?.机会[selectedId.value] : undefined,
);
const opportunityNote = computed(() => {
  const state = opportunityState.value;
  if (!state)
    return isLive.value
      ? '等待机会系统就绪；请确认主角已建档并更新变量脚本。'
      : '获取机会在实际聊天中刷新，预览不会生成宝物。';
  if (opportunityItems.value.length >= OPPORTUNITY_LIMIT) return '机会已满。取得或放弃后恢复刷新，已有机会不会过期。';
  const minutes = Math.ceil(Math.max(0, state.间隔毫秒 - state.已计毫秒) / 60000);
  return `约 ${minutes} 分钟活跃游玩后刷新 · 轮次保底 ${state.已计轮数}/${PITY_ROUNDS}`;
});
const runtimeError = ref('');
let runtimeApi: EquipmentApi | undefined;
let runtimeToken = '';
const emptyPerson: Person = {
  id: '',
  name: '尚未建档',
  realm: '未知',
  hp: 0,
  energy: 0,
  defense: 0,
  attack: 0,
  cap: 0,
  progressMax: 0,
  nextRealm: '待定',
};
const itemArt = (item: Pick<Treasure, 'category'>) => art(categoryIcons[item.category]);
const category = ref<Category | '全部'>('全部');
const search = ref('');
const rosterSearch = ref('');
const rosterFilter = ref('all');
const personDeleting = ref(false);
const selectedId = ref('demo-crystal');
const personId = ref('lia');
const recipient = ref('yun');
const ownerFilter = ref('');
const selected = computed(() => listedItems.value.find(item => item.id === selectedId.value));
const person = computed(() => people.value.find(p => p.id === personId.value) ?? emptyPerson);
const energyLabel = computed(() =>
  person.value.routes?.includes('法力') && !person.value.routes.includes('斗气') ? '法力' : '斗气',
);
const visiblePeople = computed(() =>
  people.value.filter(
    p =>
      `${p.name}${p.realm}`.includes(rosterSearch.value.trim()) &&
      (rosterFilter.value === 'all' ||
        (rosterFilter.value === 'equipped' && treasures.value.some(t => t.ownerId === p.id && t.slot)) ||
        (rosterFilter.value === 'temporary' && p.profileType === '临时')),
  ),
);
const visibleItems = computed(() =>
  listedItems.value.filter(
    item =>
      (category.value === '全部' || item.category === category.value) &&
      (!ownerFilter.value || item.ownerId === ownerFilter.value) &&
      `${item.name}${treasureCategoryName(item.category)}`.includes(search.value.trim()),
  ),
);
const equippedItems = computed(() => treasures.value.filter(t => t.ownerId === personId.value && t.slot));
const equipped = (slot: Slot) => equippedItems.value.find(t => t.slot === slot);
const ownerName = (id?: string) => people.value.find(p => p.id === id)?.name ?? '未分配';
function benefitsApply(item: Treasure, id = item.ownerId ?? recipient.value) {
  if (!item.metadata) return true;
  const target = people.value.find(p => p.id === id);
  if (!target) return false;
  const routeFits = equipmentBenefitsApply(
    { 姓名: target.name, 路线: Object.fromEntries((target.routes ?? ['斗气']).map(route => [route, {}])) },
    item.metadata,
  );
  const ranks = Object.entries(target.routeRanks ?? {})
    .filter(([name]) => item.metadata!.适用路线 === '通用' || name === item.metadata!.适用路线)
    .map(([, rank]) => rank);
  return routeFits && (!item.metadata.品阶 || Math.max(0, ...ranks) >= item.metadata.品阶);
}
function refreshRuntime() {
  runtimeApi = findEquipmentApi();
  triggerEditingSupported.value = runtimeApi?.personTriggersVersion === 1;
  if (!runtimeApi) {
    opportunityState.value = undefined;
    if (isLive.value) {
      people.value = [];
      treasures.value = [];
      runtimeToken = '';
      portraitUrls.value = {};
      portraitToken.value = '';
      runtimeError.value = '装备脚本未连接，请重新加载角色脚本。';
    }
    return;
  }
  isLive.value = true;
  try {
    const snapshot = runtimeApi.read();
    const view = viewFromEquipmentState(snapshot.gameplay);
    opportunityState.value = snapshot.gameplay.宝物系统;
    if (snapshot.token !== runtimeToken) {
      personDeleting.value = false;
      discarding.value = false;
      discardQuantity.value = 1;
    }
    runtimeToken = snapshot.token;
    people.value = view.people;
    treasures.value = view.treasures;
    if (!people.value.some(p => p.id === personId.value)) personId.value = people.value[0]?.id ?? '';
    if (!people.value.some(p => p.id === recipient.value)) recipient.value = personId.value;
    if (!listedItems.value.some(t => t.id === selectedId.value)) selectedId.value = listedItems.value[0]?.id ?? '';
    refreshPortraits();
    runtimeError.value = '';
  } catch (error) {
    people.value = [];
    treasures.value = [];
    runtimeToken = '';
    portraitUrls.value = {};
    portraitToken.value = '';
    opportunityState.value = undefined;
    runtimeError.value = error instanceof Error ? error.message : '当前存档无法读取。';
  }
}
function showOpportunities(value: boolean) {
  treasurePane.value = 'collection';
  opportunityMode.value = value;
  category.value = '全部';
  search.value = '';
  ownerFilter.value = '';
  discarding.value = false;
  selectedId.value = listedItems.value[0]?.id ?? '';
}
async function actOnOpportunity(type: 'pursueTreasure' | 'abandonTreasure' | 'retryTreasureName' | 'claimTreasure') {
  if (!selectedOpportunity.value) return;
  if (await commitEquipment({ type, id: selectedId.value })) {
    discarding.value = false;
    notice(
      type === 'pursueTreasure'
        ? '已选择追寻，下一次对话将提供这件宝物的线索。'
        : type === 'abandonTreasure'
          ? '已放弃机会，刷新按原进度继续。'
          : type === 'claimTreasure'
            ? '宝物已收入藏室。'
            : '正在重新命名，效果保持不变。',
    );
  }
}
async function commitEquipment(command: GameplayCommand) {
  if (!runtimeApi || !runtimeToken || saving.value) return false;
  saving.value = true;
  try {
    await runtimeApi.apply(command, runtimeToken);
    refreshRuntime();
    return true;
  } catch (error) {
    notice(error instanceof Error ? error.message : '保存失败。');
    refreshRuntime();
    return false;
  } finally {
    saving.value = false;
  }
}

async function savePersonTriggerWords(words: string[] | null): Promise<boolean> {
  const target = person.value;
  if (!target.id) return false;
  if (!isLive.value) {
    target.triggerWords = words === null ? [...(target.defaultTriggerWords ?? [target.name])] : [...words];
    target.customTriggerWords = words !== null;
    return true;
  }
  if (!triggerEditingSupported.value) return false;
  return commitEquipment({ type: 'setPersonTriggers', personId: target.id, words });
}

async function managePerson(type: 'archivePerson' | 'promotePerson' | 'removePerson') {
  const target = person.value;
  if (!target.id || target.isPlayer || (type !== 'removePerson' && target.profileType !== '临时')) return;
  if (await commitEquipment({ type, personId: target.id })) {
    personDeleting.value = false;
    notice(
      type === 'archivePerson'
        ? `已保留${target.name}的临时面板，并停止发送`
        : type === 'promotePerson'
          ? `${target.name}已转为长期人物`
          : `${target.name}的档案已从当前分支删除`,
    );
  }
}
const mode = ref('normal');
const discarding = ref(false);
const discardQuantity = ref(1);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout>;
const notice = (message: string) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 3600);
};
const detail = ref<HTMLElement>();
const portraitUrls = ref<Record<string, string>>({});
const brokenPortraits = ref<Record<string, boolean>>({});
const portraitStatus = ref('');
const portraitBusy = ref(false);
const portraitInput = ref<HTMLInputElement>();
const localAddress = ref('');
const portraitToken = ref('');
let portraitUpload: AbortController | undefined;
function applyPortraitSnapshot(snapshot: PortraitSnapshot) {
  for (const id of Object.keys(brokenPortraits.value)) {
    if (portraitUrls.value[id] !== snapshot.urls[id]) delete brokenPortraits.value[id];
  }
  if (portraitUrls.value[personId.value] !== snapshot.urls[personId.value])
    localAddress.value = snapshot.urls[personId.value] ?? '';
  portraitUrls.value = snapshot.urls;
  portraitToken.value = snapshot.token;
}
function refreshPortraits() {
  try {
    const api = findPortraitApi();
    if (!api) throw new Error('请更新人物与宝物入口脚本以启用图片上传。');
    applyPortraitSnapshot(api.read());
  } catch (error) {
    portraitUrls.value = {};
    portraitToken.value = '';
    portraitStatus.value = error instanceof Error ? error.message : '人物图片暂时无法读取。';
  }
}

function switchScreen(value: string) {
  screen.value = value;
  if (!mountedOptions) history.replaceState(null, '', `#${value}`);
  discarding.value = false;
}
function selectItem(item: Treasure, focus = false) {
  treasurePane.value = 'detail';
  selectedId.value = item.id;
  discarding.value = false;
  discardQuantity.value = 1;
  if (item.ownerId) recipient.value = item.ownerId;
  if (focus || matchMedia('(max-width: 650px)').matches)
    nextTick(() =>
      detail.value?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      }),
    );
}
function filterCategory(value: Category | '全部') {
  treasurePane.value = 'collection';
  category.value = value;
  discarding.value = false;
  nextTick(() => {
    if (!visibleItems.value.some(i => i.id === selectedId.value)) selectedId.value = visibleItems.value[0]?.id ?? '';
  });
}
function showEquipment(slot: Slot) {
  opportunityMode.value = false;
  const item = equipped(slot);
  search.value = '';
  ownerFilter.value = '';
  recipient.value = personId.value;
  switchScreen('treasures');
  category.value = item ? '全部' : slots.find(s => s.id === slot)!.category;
  selectedId.value = item?.id ?? visibleItems.value[0]?.id ?? '';
  nextTick(() => document.querySelector('h1')?.scrollIntoView({ block: 'start' }));
}
function destination(item: Treasure): Slot {
  if (item.category === '武器') return 'weapon';
  if (item.category === '防具') return 'armor';
  if (item.category === '修为秘宝') return 'growth';
  if (item.category === '特殊物品') return 'special';
  return treasures.value.some(t => t.ownerId === recipient.value && t.slot === 'accessory1' && t.id !== item.id)
    ? 'accessory2'
    : 'accessory1';
}
const replacement = computed(() => {
  const item = selected.value;
  if (!item || item.use !== 'wear' || item.slot) return undefined;
  return treasures.value.find(t => t.ownerId === recipient.value && t.slot === destination(item));
});
function removeItem(item: Treasure, quantity: number) {
  item.quantity -= quantity;
  if (item.quantity <= 0) {
    treasures.value = treasures.value.filter(t => t.id !== item.id);
    selectedId.value = visibleItems.value[0]?.id ?? '';
  }
  discarding.value = false;
}
async function useSelected() {
  const item = selected.value;
  if (!item || item.use === 'special' || saving.value) return;
  if (isLive.value) {
    if (!item.inventoryRef) return;
    if (item.use === 'consume') {
      const target = people.value.find(p => p.id === recipient.value);
      const route =
        item.metadata?.效果?.find(effect => effect.路线)?.路线 ??
        (item.metadata?.适用路线 !== '通用' ? item.metadata?.适用路线 : undefined) ??
        target?.routes?.[0];
      if (![2, 3].includes(runtimeApi?.version ?? 0) || !route) {
        notice('此秘宝的效果规格尚未完善，物品已保留。');
        return;
      }
      if (await commitEquipment({ type: 'consume', ref: item.inventoryRef, personId: recipient.value, route }))
        notice(`${ownerName(recipient.value)}已使用${item.name}，培养结果已保存`);
      return;
    }
    const command: EquipmentCommand = item.slot
      ? { type: 'unequip', ref: item.inventoryRef }
      : {
          type: 'equip',
          ref: item.inventoryRef,
          personId: recipient.value,
          slot: destination(item),
          splitId: crypto.randomUUID(),
        };
    if (await commitEquipment(command))
      notice(
        item.slot
          ? `已卸下${item.name}`
          : `已佩戴${item.name}${benefitsApply(item, recipient.value) ? '' : '；路线不符，增幅不生效'}`,
      );
    return;
  }
  if (item.use === 'consume') {
    removeItem(item, 1);
    notice(`${ownerName(recipient.value)}已使用一份${item.name}`);
    return;
  }
  if (item.slot) {
    item.slot = undefined;
    notice(`已卸下${item.name}`);
    return;
  }
  const targetSlot = destination(item);
  const previous = treasures.value.find(t => t.ownerId === recipient.value && t.slot === targetSlot);
  if (previous) previous.slot = undefined;
  // 叠放示例佩戴一件时拆分，保持每件只占一个装备位置。
  if (item.quantity > 1) {
    item.quantity--;
    const copy = {
      ...item,
      id: `${item.id}-${crypto.randomUUID()}`,
      quantity: 1,
      ownerId: recipient.value,
      slot: targetSlot,
    };
    treasures.value.push(copy);
    selectedId.value = copy.id;
  } else {
    item.ownerId = recipient.value;
    item.slot = targetSlot;
  }
  notice(`${ownerName(recipient.value)}已佩戴${item.name}${benefitsApply(item) ? '' : '；路线不符，增幅不生效'}`);
}
async function discardSelected() {
  const item = selected.value;
  if (!item) return;
  const count = Math.min(item.quantity, Math.max(1, Math.floor(Number(discardQuantity.value) || 1)));
  const name = item.name;
  if (isLive.value) {
    if (item.inventoryRef && (await commitEquipment({ type: 'discard', ref: item.inventoryRef, quantity: count }))) {
      discarding.value = false;
      notice(`已丢弃${name}${count > 1 ? ` × ${count}` : ''}`);
    }
    return;
  }
  removeItem(item, count);
  notice(`已丢弃${name}${count > 1 ? ` × ${count}` : ''}`);
}
function setPreviewState(value: string) {
  if (isLive.value) return;
  mode.value = value;
  discarding.value = false;
  treasures.value = value === 'empty' ? [] : createTreasures();
  category.value = '全部';
  ownerFilter.value = '';
  search.value = '';
  selectedId.value = treasures.value[0]?.id ?? '';
}
function selectPerson(id: string) {
  peoplePane.value = 'portrait';
  personId.value = id;
  personDeleting.value = false;
  portraitStatus.value = '';
  localAddress.value = portraitUrls.value[id] ?? '';
}
async function uploadPortrait(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || portraitBusy.value || !person.value.id) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    portraitStatus.value = '请选择 8 MB 以内的 PNG、JPG 或 WebP 图片。';
    return;
  }
  const id = personId.value;
  const name = person.value.name;
  const controller = new AbortController();
  portraitUpload = controller;
  portraitBusy.value = true;
  portraitStatus.value = '';
  try {
    if (isLive.value) {
      const api = findPortraitApi();
      if (!api || !portraitToken.value) throw new Error('图片功能尚未就绪，请重新打开人物面板。');
      applyPortraitSnapshot(await api.upload(id, file, portraitToken.value, controller.signal));
      brokenPortraits.value[id] = false;
      notice(`${name}的图片已保存`);
      return;
    }
    const response = await fetch(`./api/portraits/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('图片未保存，请确认本地预览服务正在运行后重试。');
    const result = await response.json();
    portraitUrls.value[id] = result.url;
    brokenPortraits.value[id] = false;
    if (id === personId.value) localAddress.value = result.url;
    notice(`${ownerName(id)}的图片已保存`);
  } catch (error) {
    if (!controller.signal.aborted) {
      if (isLive.value) refreshRuntime();
      portraitStatus.value =
        error instanceof Error && error.name === 'AbortError'
          ? '上传已取消，请在当前人物页重新选择图片。'
          : portraitErrorMessage(error, '上传失败，请重试。');
    }
  } finally {
    portraitBusy.value = false;
    portraitUpload = undefined;
  }
}
async function saveAddress() {
  if (portraitBusy.value || !person.value.id) return;
  const id = personId.value;
  portraitStatus.value = '';
  try {
    if (isLive.value) {
      const api = findPortraitApi();
      if (!api || !portraitToken.value) throw new Error('图片功能尚未就绪，请重新打开人物面板。');
      if (!localAddress.value.trim()) throw new Error('请填写图片地址，或点击“恢复默认”。');
      applyPortraitSnapshot(api.save(id, localAddress.value, portraitToken.value));
      brokenPortraits.value[id] = false;
      notice('人物图片地址已保存');
      return;
    }
    const url = new URL(localAddress.value.trim(), location.href);
    if (
      !localAddress.value.trim() ||
      !['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error('请填写本地服务的图片地址，例如 /portraits/人物.png。');
    portraitBusy.value = true;
    portraitStatus.value = '';
    const response = await fetch(`./api/portraits/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href }),
    });
    if (!response.ok) throw new Error('地址未保存，请检查本地服务后重试。');
    const result = await response.json();
    portraitUrls.value[id] = result.url;
    brokenPortraits.value[id] = false;
    notice('人物图片地址已保存');
  } catch (error) {
    portraitStatus.value = portraitErrorMessage(error, '地址无法使用。');
  } finally {
    portraitBusy.value = false;
  }
}
function clearPortrait() {
  if (portraitBusy.value || !person.value.id) return;
  portraitStatus.value = '';
  try {
    const api = findPortraitApi();
    if (!api || !portraitToken.value) throw new Error('图片功能尚未就绪，请重新打开人物面板。');
    applyPortraitSnapshot(api.save(personId.value, '', portraitToken.value));
    notice('已恢复默认人物底图');
  } catch (error) {
    portraitStatus.value = portraitErrorMessage(error, '图片未能移除，请重试。');
  }
}
function hashChanged() {
  screen.value = location.hash === '#people' ? 'people' : 'treasures';
}
onMounted(async () => {
  window.addEventListener('hashchange', hashChanged);
  window.addEventListener('focus', refreshRuntime);
  try {
    window.parent.addEventListener('selyumis-equipment-changed', refreshRuntime);
  } catch {
    /* 跨源独立预览没有宿主事件。 */
  }
  refreshRuntime();
  if (isLive.value) return;
  try {
    const response = await fetch('./api/portraits');
    if (response.ok) {
      portraitUrls.value = await response.json();
      localAddress.value = portraitUrls.value[personId.value] ?? '';
    }
  } catch {
    /* 独立 HTML 仍可浏览；上传时提供明确错误。 */
  }
});
onUnmounted(() => {
  portraitUpload?.abort();
  clearTimeout(toastTimer);
  window.removeEventListener('hashchange', hashChanged);
  window.removeEventListener('focus', refreshRuntime);
  try {
    window.parent.removeEventListener('selyumis-equipment-changed', refreshRuntime);
  } catch {
    /* 跨源独立预览没有宿主事件。 */
  }
});
</script>

<template>
  <div class="selyumis-shell" :class="screen">
    <p v-if="isLive && runtimeError" class="runtime-error" role="alert">{{ runtimeError }}</p>

    <main v-if="screen === 'treasures'" class="treasure-layout" :class="'compact-' + treasurePane">
      <nav class="panel-tabs" aria-label="宝物页面区域">
        <button :aria-pressed="treasurePane === 'categories'" @click="treasurePane = 'categories'">分类</button>
        <button :aria-pressed="treasurePane === 'collection'" @click="treasurePane = 'collection'">藏品</button>
        <button :aria-pressed="treasurePane === 'detail'" @click="treasurePane = 'detail'">详情</button>
      </nav>
      <aside class="category-sidebar" aria-label="宝物分类">
        <div class="opportunity-switch" aria-label="藏品与获取机会">
          <button :aria-pressed="!opportunityMode" @click="showOpportunities(false)">已获宝物</button>
          <button :aria-pressed="opportunityMode" @click="showOpportunities(true)">
            获取机会 <span>{{ opportunityItems.length }}/{{ OPPORTUNITY_LIMIT }}</span>
          </button>
        </div>
        <div class="category-list">
          <button
            v-for="entry in categories"
            :key="entry.name"
            :class="{ active: category === entry.name }"
            :aria-pressed="category === entry.name"
            @click="filterCategory(entry.name)"
          >
            <img :src="art(entry.art)" alt="" /><span>{{ treasureCategoryName(entry.name) }}</span>
            <small class="sr-only">{{
              entry.name === '全部' ? listedItems.length : listedItems.filter(t => t.category === entry.name).length
            }}</small>
          </button>
        </div>
      </aside>
      <section class="collection paper-panel">
        <div class="section-title">
          <h1>{{ opportunityMode ? '获取机会' : '宝物藏室' }}</h1>
          <span class="collection-count">{{ listedItems.length }} {{ opportunityMode ? '个机会' : '件藏品' }}</span>
        </div>
        <div class="search-field">
          <label class="sr-only" for="treasure-search">搜索宝物</label
          ><input id="treasure-search" v-model="search" placeholder="搜索宝物" type="search" />
        </div>
        <p v-if="opportunityMode" class="opportunity-note" role="status">{{ opportunityNote }}</p>
        <div
          v-if="!opportunityMode && (mode === 'capacity' || treasures.length >= TREASURE_INVENTORY_LIMIT * 0.9)"
          class="capacity-notice"
          role="status"
        >
          <strong>藏室将满</strong><span>清理不再需要的宝物，为新的收获留出位置。</span>
        </div>
        <button v-if="ownerFilter" class="filter-reset" @click="ownerFilter = ''">
          正在查看{{ ownerName(ownerFilter) }}的宝物 · 显示全部
        </button>
        <div v-if="visibleItems.length" class="item-grid">
          <button
            v-for="item in visibleItems"
            :key="item.id"
            class="item-card"
            :class="{ selected: selectedId === item.id }"
            :aria-pressed="selectedId === item.id"
            :aria-label="`${item.name}，${treasureCategoryName(item.category)}，数量 ${item.quantity}${item.slot ? '，已佩戴' : ''}`"
            @click="selectItem(item)"
          >
            <span class="item-illustration"
              ><img :src="itemArt(item)" alt="" loading="lazy" /><span v-if="item.slot" class="wear-label"
                >{{ ownerName(item.ownerId) }}佩戴</span
              ><span class="quantity">{{ item.quantity }}</span></span
            >
            <span class="item-name">{{ item.name }}</span>
            <small v-if="opportunityMode" class="opportunity-state">{{ opportunityState?.机会[item.id]?.状态 }}</small>
          </button>
        </div>
        <div v-else class="empty-collection">
          <img :src="art('crest')" alt="" />
          <h2>{{ listedItems.length ? '未找到宝物' : opportunityMode ? '新的机会尚未到来' : '藏室静候新的收获' }}</h2>
          <p>
            {{
              listedItems.length
                ? '试试其他名称或分类。'
                : opportunityMode
                  ? '继续游玩即可积累刷新进度。机会出现后，可自行决定何时追寻。'
                  : '获得的宝物将在这里陈列。'
            }}
          </p>
          <button
            v-if="listedItems.length"
            class="text-button"
            @click="
              search = '';
              ownerFilter = '';
              filterCategory('全部');
            "
          >
            清除筛选
          </button>
        </div>
        <p class="collection-footnote">
          {{ opportunityMode ? '选择之后，再启程。' : category === '全部' ? '收藏于此，随行于你。' : category
          }}<span>容量 {{ opportunityMode ? OPPORTUNITY_LIMIT : TREASURE_INVENTORY_LIMIT }}</span>
        </p>
      </section>
      <aside ref="detail" class="item-detail paper-panel" aria-label="宝物详情">
        <template v-if="selected">
          <div class="detail-body">
            <h2>{{ selected.name }}</h2>
            <div class="item-classification">
              <span>{{ treasureCategoryName(selected.category) }}</span
              ><span>{{ selected.metadata?.品阶 ? `${selected.metadata.品阶}阶` : '品阶待定' }}</span>
              <span v-if="selected.metadata?.珍贵度">{{ selected.metadata.珍贵度 }}</span>
            </div>
            <dl class="item-facts">
              <div>
                <dt>数量</dt>
                <dd>{{ selected.quantity }}</dd>
              </div>
              <div>
                <dt>{{ opportunityMode ? '获取状态' : '当前归属' }}</dt>
                <dd>
                  {{ selectedOpportunity?.状态 ?? ownerName(selected.ownerId) }}{{ selected.slot ? ' · 已佩戴' : '' }}
                </dd>
              </div>
            </dl>
            <div class="effect-description">
              <h3>宝物效果</h3>
              <p>{{ selected.effect }}</p>
              <small v-if="selected.metadata?.子类 === '法杖'">法师系武器 · 骑士佩戴不产生增幅</small>
              <small v-if="!opportunityMode && selected.use === 'wear' && !benefitsApply(selected)"
                >路线或境界不符，增幅不生效</small
              >
              <small v-else-if="!isLive">具体数值待定</small>
            </div>
            <div v-if="selectedOpportunity" class="item-actions opportunity-actions">
              <p>机会会保留至取得或主动放弃。选择追寻后，由剧情决定如何获得。</p>
              <p v-if="selectedOpportunity.命名错误" role="alert">{{ selectedOpportunity.命名错误 }}</p>
              <button
                v-if="selectedOpportunity.状态 === '待追寻'"
                class="ornate-button"
                :disabled="saving"
                @click="actOnOpportunity('pursueTreasure')"
              >
                追寻这件宝物
              </button>
              <button
                v-else-if="selectedOpportunity.状态 === '命名失败'"
                class="ornate-button"
                :disabled="saving"
                @click="actOnOpportunity('retryTreasureName')"
              >
                重试命名
              </button>
              <button
                v-else-if="selectedOpportunity.状态 === '待领取'"
                class="ornate-button"
                :disabled="saving"
                @click="actOnOpportunity('claimTreasure')"
              >
                收入藏室
              </button>
              <p v-else role="status">
                {{
                  selectedOpportunity.状态 === '待命名'
                    ? '正在准备名字，效果已固定。'
                    : '正在追寻。实际取得后会自动收入藏室。'
                }}
              </p>
              <button v-if="!discarding" class="discard-button" :disabled="saving" @click="discarding = true">
                放弃这个机会
              </button>
              <div v-else class="discard-confirm">
                <p>放弃{{ selected.name }}的获取机会？腾出名额后继续累计刷新进度。</p>
                <div>
                  <button class="quiet-button" :disabled="saving" @click="discarding = false">保留</button>
                  <button class="danger-button" :disabled="saving" @click="actOnOpportunity('abandonTreasure')">
                    确认放弃
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="item-actions">
              <template v-if="!selected.slot"
                ><label for="recipient">{{ selected.use === 'consume' ? '使用对象' : '佩戴对象' }}</label
                ><select id="recipient" v-model="recipient">
                  <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }} · {{ p.realm }}</option>
                </select></template
              >
              <p v-if="replacement" class="replacement-note">
                将替换{{ ownerName(recipient) }}的{{ replacement.name }}
              </p>
              <button
                class="ornate-button"
                :disabled="saving || selected.use === 'special' || !people.length"
                @click="useSelected"
              >
                {{
                  selected.use === 'special'
                    ? '机制待定'
                    : selected.slot
                      ? '卸下'
                      : selected.use === 'consume'
                        ? '使用'
                        : '佩戴'
                }}
              </button>
              <button v-if="!discarding" class="discard-button" @click="discarding = true">丢弃宝物</button>
              <div v-else class="discard-confirm">
                <p>丢弃{{ selected.name }}？{{ selected.slot ? '同时解除佩戴。' : '' }}</p>
                <label v-if="selected.quantity > 1"
                  >数量 <input v-model="discardQuantity" type="number" min="1" :max="selected.quantity"
                /></label>
                <div>
                  <button class="quiet-button" @click="discarding = false">保留</button
                  ><button class="danger-button" @click="discardSelected">确认丢弃</button>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty-detail">
          <h2>宝物详情</h2>
          <p>选择一件宝物，查看它的用途与归属。</p>
        </div>
      </aside>
    </main>

    <main v-else class="people-layout" :class="'compact-' + peoplePane">
      <nav class="panel-tabs" aria-label="人物页面区域">
        <button :aria-pressed="peoplePane === 'roster'" @click="peoplePane = 'roster'">名册</button>
        <button :aria-pressed="peoplePane === 'portrait'" @click="peoplePane = 'portrait'">人物</button>
        <button :aria-pressed="peoplePane === 'stats'" @click="peoplePane = 'stats'">属性</button>
      </nav>
      <aside class="roster paper-panel" aria-label="领地人物名册">
        <h1 class="roster-title">领地人物</h1>
        <label class="sr-only" for="person-search">搜索人物</label
        ><input id="person-search" v-model="rosterSearch" class="roster-search" type="search" placeholder="搜索人物" />
        <div class="roster-tabs" aria-label="人物筛选">
          <button :aria-pressed="rosterFilter === 'all'" @click="rosterFilter = 'all'">全部</button>
          <button :aria-pressed="rosterFilter === 'equipped'" @click="rosterFilter = 'equipped'">已装备</button>
          <button :aria-pressed="rosterFilter === 'temporary'" @click="rosterFilter = 'temporary'">临时</button>
        </div>
        <button
          v-for="p in visiblePeople"
          :key="p.id"
          class="person-row"
          :class="{ active: personId === p.id }"
          :aria-pressed="personId === p.id"
          @click="selectPerson(p.id)"
        >
          <span class="person-avatar"
            ><img
              v-if="portraitUrls[p.id] && !brokenPortraits[p.id]"
              :src="portraitUrls[p.id]"
              alt=""
              @error="brokenPortraits[p.id] = true" /><img v-else :src="art('heraldry')" alt="" /></span
          ><span
            ><strong>{{ p.name }}</strong
            ><small
              >{{ p.realm
              }}{{ p.profileType === '临时' ? ` · ${p.combat ? '参战中' : p.present ? '在场' : '已收起'}` : '' }}</small
            ></span
          >
        </button>
        <p v-if="!visiblePeople.length" class="roster-empty">未找到人物，换个名字试试。</p>
      </aside>
      <section class="character-inspection paper-panel" :aria-label="`${person.name}的人物图片与装备`">
        <div class="inspection-heading">
          <span>{{ person.name }}</span
          ><span>全身宝物</span>
        </div>
        <div class="equipment-stage">
          <figure class="portrait-canvas">
            <PortraitCard
              :key="personId"
              :name="person.name"
              :fit="portraitFit"
              :effect="portraitEffect"
              :src="portraitUrls[personId] && !brokenPortraits[personId] ? portraitUrls[personId] : undefined"
              :fallback-src="art('portrait-default-female')"
              :style="{ '--portrait-paper': 'url(' + art('paper') + ')' }"
              @image-error="brokenPortraits[personId] = true"
            />
          </figure>
          <button
            v-for="(slot, index) in slots"
            :key="slot.id"
            class="equipment-slot"
            :class="[`slot-${index}`, { filled: equipped(slot.id) }]"
            :title="equipped(slot.id)?.name ?? `选择${slot.label}`"
            @click="showEquipment(slot.id)"
          >
            <span>{{ slot.label }}</span
            ><img v-if="equipped(slot.id)" :src="itemArt(equipped(slot.id)!)" alt="" /><img
              v-else
              class="empty-emblem"
              :src="art(categoryIcons[slot.category])"
              alt=""
            /><small>{{ equipped(slot.id)?.name ?? '未装备' }}</small>
          </button>
        </div>
        <div class="portrait-effect-picker" role="group" aria-label="卡面质感">
          <span>卡面质感</span>
          <button
            type="button"
            :aria-pressed="portraitEffect === 'off'"
            @click="portraitEffect = 'off'"
            title="关闭光效与倾斜，减少性能消耗"
          >
            关闭
          </button>
          <button type="button" :aria-pressed="portraitEffect === 'soft'" @click="portraitEffect = 'soft'">
            原版柔光
          </button>
          <button type="button" :aria-pressed="portraitEffect === 'foil'" @click="portraitEffect = 'foil'">
            151 全息
          </button>
        </div>
        <div v-if="person.id" class="portrait-tools" :aria-busy="portraitBusy">
          <input
            ref="portraitInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            @change="uploadPortrait"
          /><button
            class="text-button"
            :disabled="portraitBusy || (isLive && !portraitToken)"
            @click="portraitInput?.click()"
          >
            {{ portraitBusy ? '正在保存图片…' : portraitUrls[personId] ? '更换人物图片' : '上传图片' }}
          </button>
          <button
            v-if="isLive && portraitUrls[personId]"
            class="text-button"
            :disabled="portraitBusy"
            @click="clearPortrait"
          >
            恢复默认
          </button>
          <details :key="personId" class="portrait-options">
            <summary>图片选项</summary>
            <div class="portrait-options-content">
              <div class="portrait-fit" aria-label="人物图片适配">
                <span>画面适配</span>
                <button :aria-pressed="portraitFit === 'contain'" @click="portraitFit = 'contain'">完整显示</button>
                <button :aria-pressed="portraitFit === 'cover'" @click="portraitFit = 'cover'">铺满卡面</button>
              </div>
              <p class="portrait-hint">PNG / JPG / WebP · 最大 8 MB</p>
              <div class="address-editor">
                <label :for="`portrait-${personId}`">使用本地图片地址</label
                ><input
                  :id="`portrait-${personId}`"
                  v-model="localAddress"
                  :placeholder="isLive ? '/user/images/人物图片.png' : 'http://127.0.0.1:8356/portraits/…'"
                /><button
                  class="quiet-button"
                  :disabled="portraitBusy || (isLive && !portraitToken)"
                  @click="saveAddress"
                >
                  保存地址
                </button>
              </div>
            </div>
          </details>
        </div>
        <p v-if="portraitStatus" class="portrait-error" role="alert">{{ portraitStatus }}</p>
      </section>
      <aside class="character-stats paper-panel" aria-label="人物属性">
        <h2>{{ person.name }}</h2>
        <p class="realm">
          {{ person.realm }} · {{ energyLabel }}
          <span v-if="isLive" class="profile-badge">{{ person.profileType === '临时' ? '临时战斗档' : '长期档' }}</span>
        </p>
        <section class="stats-section" aria-label="战斗属性">
          <div class="vital">
            <div>
              <span><img class="stat-icon" :src="art('icon-life')" alt="" />生命</span
              ><strong
                >{{ displayAmount(person.hp) }} <small>/ {{ displayAmount(person.hpMax ?? person.hp) }}</small></strong
              >
            </div>
            <progress :value="person.hp" :max="(person.hpMax ?? person.hp) || 1" aria-label="当前生命" />
          </div>
          <div class="vital energy">
            <div>
              <span><img class="stat-icon" :src="art('icon-special')" alt="" />{{ energyLabel }}</span
              ><strong
                >{{ displayAmount(person.energy) }}
                <small>/ {{ displayAmount(person.energyMax ?? person.energy) }}</small></strong
              >
            </div>
            <progress
              :value="person.energy"
              :max="(person.energyMax ?? person.energy) || 1"
              :aria-label="`当前${energyLabel}`"
            />
          </div>
          <dl class="stat-list">
            <div>
              <dt><img class="stat-icon" :src="art('icon-defense')" alt="" />防御</dt>
              <dd>{{ displayAmount(person.defense) }}</dd>
            </div>
            <div>
              <dt><img class="stat-icon" :src="art('icon-attack')" alt="" />普通攻击</dt>
              <dd>{{ displayAmount(person.attack) }}</dd>
            </div>
            <div>
              <dt><img class="stat-icon" :src="art('icon-cap')" alt="" />单次投入上限</dt>
              <dd>{{ displayAmount(person.cap) }}</dd>
            </div>
          </dl>
        </section>
        <section class="growth-section">
          <h3>成长</h3>
          <p>
            天赋
            <span :title="person.talent ? '决定积累速度；四维资质决定每份积累带来的属性增长' : undefined"
              >{{ person.talent ?? '待抽取'
              }}{{ person.talentFactor ? ` · ×${displayAmount(person.talentFactor)}` : '' }}</span
            >
          </p>
          <div class="growth-value">
            <span>{{ person.progressLabel ?? '斗气积累' }}</span
            ><strong
              >{{ displayAmount(person.progress ?? 0) }}
              <small v-if="!person.demigod">/ {{ displayAmount(person.progressMax) }}</small></strong
            >
          </div>
          <progress
            v-if="!person.demigod"
            :max="person.progressMax || 1"
            :value="person.progress ?? 0"
            :aria-label="person.progressLabel ?? '斗气积累'"
          />
          <p v-if="!person.demigod">
            下一境界 <span>{{ person.nextRealm }}</span>
          </p>
          <p v-else>半神仍可持续培养，成神尚未开放。</p>
          <small>{{ person.growthNote ?? '随世界时间成长' }}</small>
          <details v-if="person.aptitudes">
            <summary>四维资质与基础属性</summary>
            <p v-for="(value, key) in person.aptitudes" :key="key">
              {{ key === '攻击' ? '普攻' : key }}资质 <span>×{{ displayAmount(value) }}</span>
            </p>
            <p v-for="(value, key) in person.baseStats" :key="key">
              基础{{ key }} <span>{{ displayAmount(value) }}</span>
            </p>
            <small>面板总值含装备加成；培养宝物增加基础属性。普攻资质不放大技能伤害。</small>
          </details>
        </section>
        <PersonTriggerSettings
          v-if="person.id"
          :key="person.id"
          :person-id="person.id"
          :name="person.name"
          :words="person.triggerWords ?? [person.name]"
          :defaults="person.defaultTriggerWords ?? [person.name]"
          :customized="person.customTriggerWords ?? false"
          :available="!isLive || (triggerEditingSupported && !runtimeError)"
          :saving="saving"
          :save="savePersonTriggerWords"
        />
        <details v-if="isLive && !person.isPlayer" class="profile-management">
          <summary>{{ person.profileType === '临时' ? '临时档案管理 · 重要人物请转长期' : '长期档案管理' }}</summary>
          <p v-if="person.profileType === '临时'">
            临时档用于战斗状态，也会成长、不会自动删除；战后可收起，但不会自动转长期。需要持续关注的人物，请转为长期。
          </p>
          <p v-else>长期档用于持续关注的重要人物，完整面板仍按需发送。转档或建档不代表招募、归属领地或回满状态。</p>
          <p>
            当前{{
              person.combat
                ? '标记为参战，持续提供档案'
                : person.present
                  ? '标记为在场，持续提供档案'
                  : '未标记在场或参战；命中触发词仍可读取'
            }}。
          </p>
          <div v-if="!personDeleting" class="profile-actions">
            <button
              v-if="person.profileType === '临时'"
              class="quiet-button"
              :disabled="saving"
              @click="managePerson('archivePerson')"
            >
              保留并停止发送
            </button>
            <button
              v-if="person.profileType === '临时'"
              class="quiet-button"
              :disabled="saving"
              @click="managePerson('promotePerson')"
            >
              转为长期
            </button>
            <button class="danger-button" :disabled="saving" @click="personDeleting = true">删除档案</button>
          </div>
          <div v-else class="profile-delete-confirm" role="alert">
            <p>
              删除{{
                person.name
              }}的档案，并清理装备归属、战斗状态、军队与项目引用；物品保留。操作随当前楼层分支保存，回退到操作前的楼层可恢复。不设置禁止再次建档的标记。
            </p>
            <div>
              <button class="quiet-button" :disabled="saving" @click="personDeleting = false">取消</button>
              <button class="danger-button" :disabled="saving" @click="managePerson('removePerson')">确认删除</button>
            </div>
          </div>
        </details>
        <section class="equipped-section">
          <h3>
            已装备宝物 <small>{{ equippedItems.length }}</small>
          </h3>
          <button v-for="item in equippedItems" :key="item.id" class="equipped-row" @click="showEquipment(item.slot!)">
            <img :src="itemArt(item)" alt="" /><span
              ><strong>{{ item.name }}</strong
              ><small>{{ benefitsApply(item, personId) ? item.effect : '路线不符，增幅不生效' }}</small></span
            >
          </button>
          <p v-if="!equippedItems.length" class="no-equipment">尚未佩戴宝物。</p>
        </section>
      </aside>
    </main>
    <div class="feedback-toast" role="status" aria-live="polite">
      <span v-if="toast">{{ toast }}</span>
    </div>
  </div>
</template>
