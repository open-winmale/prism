<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAppStore } from '@/store/useApp';
import { clearAllCaches } from '@/data/provider';

// 数据源设置：填自己的 AppId 即可动态查看任意标的。
// 公开站点不内置任何 AppId —— 一节 EC 成本由使用者自负，避免共享密钥被刷。

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useAppStore();
const clientId = ref('');
const secret = ref('');
const saved = ref(false);

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    saved.value = false;
    // 只回显 ClientId；Secret 出于安全考虑不回显（要改就重填）
    clientId.value = store.credential.clientId;
    secret.value = '';
  },
);

function save() {
  store.applyCredentials(clientId.value, secret.value);
  secret.value = '';
  saved.value = true;
}

function clear() {
  store.applyCredentials('', '');
  clientId.value = '';
  secret.value = '';
  saved.value = false;
}

function flushCache() {
  clearAllCaches();
  saved.value = false;
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-slate-900/40" @click="emit('close')" />
    <div class="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="m-0 text-base font-semibold">数据源设置</h3>
        <button class="cursor-pointer text-slate-400 hover:text-slate-600" @click="emit('close')">✕</button>
      </div>

      <!-- 当前状态 -->
      <div class="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
        <div>
          当前模式：
          <b>{{ store.dataSource === 'live' ? '实时接口' : '内置快照' }}</b>
          <template v-if="store.credential.source === 'env'">（凭证来自部署环境变量）</template>
          <template v-else-if="store.credential.source === 'user'">（凭证来自本机填写）</template>
        </div>
        <div v-if="store.fetchInfo.ecCost">
          上次取数消耗 {{ store.fetchInfo.ecCost.toLocaleString() }} EC<template
            v-if="store.fetchInfo.cached"
          >
            （命中本地缓存，本次 0 EC）</template
          >
        </div>
      </div>

      <!-- 填写区 -->
      <label class="mt-4 block text-xs font-medium text-slate-600">ClientId</label>
      <input
        v-model="clientId"
        placeholder="如 wm_open_xxxxxxxx"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
      />

      <label class="mt-3 block text-xs font-medium text-slate-600">ClientSecret</label>
      <input
        v-model="secret"
        type="password"
        placeholder="保存后不再回显"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
      />

      <p class="mt-3 text-xs leading-6 text-slate-500">
        在 <a href="https://open.winmale.com/" target="_blank" rel="noopener" class="text-brand hover:underline">open.winmale.com</a>
        免费申请。凭证仅保存在本机浏览器（localStorage），不会上传到任何第三方。
      </p>
      <p class="mt-1 rounded bg-amber-50 px-2 py-1.5 text-xs leading-6 text-amber-700">
        ⚠ 公共/共享设备请勿填写：凭证存在浏览器里，同设备其他人可见。共享部署请把凭证配到环境变量
        <code>VITE_WM_CLIENT_ID</code> / <code>VITE_WM_CLIENT_SECRET</code> 并加访问控制。
      </p>

      <p class="mt-2 text-xs leading-6 text-slate-500">
        成本提示：一次完整刷新（5 年 × 3 张表）约 3 万 EC；结果在本地缓存 24 小时，重复查看不重复计费。
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          :disabled="!clientId.trim()"
          @click="save"
        >
          保存并切换
        </button>
        <button
          class="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          @click="clear"
        >
          清除凭证（回到内置快照）
        </button>
        <button
          class="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          @click="flushCache"
        >
          清空本地缓存
        </button>
      </div>
      <p v-if="saved" class="mt-2 text-xs text-emerald-600">✓ 已保存，正在重新加载数据…</p>
    </div>
  </div>
</template>
