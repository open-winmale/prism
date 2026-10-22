<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAppStore } from '@/store/useApp';
import { clearTokenCache } from '@/data/wm/auth';
import { clearAllCaches } from '@/data/provider';
import { describeError } from '@/data/wm/client';
import { WmClient } from '@/data/wm/client';

// 数据源设置：分步引导用户免费申请 AppId → 填入 → 验证 → 生效。
// 关键信息前置：「完全免费」——降低开通心理门槛。

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useAppStore();

// step: 'guide' 申请引导 | 'form' 填写凭证 | 'verifying' 验证中 | 'done' 完成
const step = ref<'guide' | 'form' | 'verifying' | 'done'>(props.open ? 'guide' : 'guide');
const clientId = ref('');
const secret = ref('');
const error = ref('');

const hasUserCred = computed(() => store.credential.source === 'user');

function goForm() {
  error.value = '';
  step.value = 'form';
}

async function verifyAndSave() {
  error.value = '';
  const id = clientId.value.trim();
  const sec = secret.value.trim();
  if (!id || !sec) {
    error.value = '请填写完整的 ClientId 和 ClientSecret';
    return;
  }
  step.value = 'verifying';
  try {
    // 用待验证凭证实测一次检索（discover 约 620 EC）；只验证凭证可用，不拉完整财报。
    const probe = new WmClient({
      clientId: id,
      clientSecret: sec,
      apiBase: (import.meta.env.VITE_WM_API_BASE as string | undefined)?.trim() || undefined,
    });
    await probe.discover('茅台');
    store.applyCredentials(id, sec);
    step.value = 'done';
  } catch (e) {
    step.value = 'form';
    error.value = `验证失败：${describeError(e)}。请检查两项凭证是否正确、开放平台账号是否已创建应用。`;
  }
}

function clearAll() {
  store.applyCredentials('', '');
  clearTokenCache();
  clearAllCaches();
  clientId.value = '';
  secret.value = '';
  error.value = '';
  step.value = 'guide';
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey);
    else window.removeEventListener('keydown', onKey);
  },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function close() {
  emit('close');
  // 下次打开回到引导页（已配置用户则回表单态）
  setTimeout(() => {
    step.value = hasUserCred.value ? 'form' : 'guide';
  }, 200);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="连接实时财报数据"
    @keydown.escape="close"
  >
    <div class="absolute inset-0 bg-slate-900/40" @click="close" />
    <div class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <div class="flex items-start justify-between">
        <h3 class="m-0 text-base font-semibold">连接实时财报数据</h3>
        <button class="cursor-pointer text-slate-400 hover:text-slate-600" @click="close">✕</button>
      </div>

      <!-- 免费横幅：降低开通门槛的关键信息 -->
      <div class="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <span><b>完全免费</b>：开放平台公开注册、不收费；数据查询按量计 EC，注册即送额度。</span>
      </div>

      <!-- 当前状态 -->
      <div class="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
        <div>
          当前模式：<b>{{ store.dataSource === 'live' ? '实时接口' : '内置快照（离线演示）' }}</b>
          <template v-if="store.credential.source === 'env'">（凭证来自部署环境变量）</template>
          <template v-else-if="store.credential.source === 'user'">（凭证来自本机填写）</template>
        </div>
        <div v-if="store.fetchInfo.ecCost">
          上次取数 {{ store.fetchInfo.ecCost.toLocaleString() }} EC<template v-if="store.fetchInfo.cached">
            （命中本地缓存，本次 0 EC）</template
          >
        </div>
      </div>

      <!-- ══ 步骤 1：申请引导 ══ -->
      <div v-if="step === 'guide'" class="mt-4">
        <ol class="m-0 list-decimal space-y-2.5 pl-5 text-sm leading-6 text-slate-700">
          <li>
            打开
            <a href="https://open.winmale.com/" target="_blank" rel="noopener" class="font-medium text-brand hover:underline"
              >open.winmale.com</a
            >
            （赢麻了开放平台），注册 / 登录 —— <b>免费，支持微信扫码</b>
          </li>
          <li>进入「应用管理」→ 创建应用（名字随意，如 prism），系统自动生成 <b>ClientId</b> 和 <b>ClientSecret</b></li>
          <li>回到这里粘贴两项凭证，本页会先验证再保存</li>
        </ol>

        <button
          class="mt-4 w-full cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          @click="goForm"
        >
          我已拿到凭证，去填写 →
        </button>
        <button
          v-if="store.dataSource === 'live'"
          class="mt-2 w-full cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          @click="step = 'form'"
        >
          查看已保存的凭证
        </button>
      </div>

      <!-- ══ 步骤 2：填写与验证 ══ -->
      <div v-else-if="step === 'form' || step === 'verifying'" class="mt-4">
        <label class="block text-xs font-medium text-slate-600">ClientId</label>
        <input
          v-model="clientId"
          placeholder="wm_open_xxxxxxxx 或 wm_jkpnxxxxxxxx"
          class="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          :class="error ? 'border-red-300' : 'border-slate-200'"
          :disabled="step === 'verifying'"
        />

        <label class="mt-3 block text-xs font-medium text-slate-600">ClientSecret</label>
        <input
          v-model="secret"
          type="password"
          placeholder="保存后不再回显"
          class="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          :class="error ? 'border-red-300' : 'border-slate-200'"
          :disabled="step === 'verifying'"
        />

        <p v-if="error" class="mt-2 rounded bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">{{ error }}</p>

        <p class="mt-3 rounded bg-amber-50 px-2 py-1.5 text-xs leading-6 text-amber-700">
          ⚠ 凭证仅保存在<b>本机浏览器</b>（localStorage），不会上传给包括本站在内的任何第三方。公共/共享设备请勿填写。
        </p>
        <p class="mt-2 text-xs leading-5 text-slate-500">
          验证会发起一次检索（约 620 EC），只确认凭证可用，不会拉取完整财报。完整报告首次约 3 万 EC，24 小时内缓存命中 0 EC。
        </p>

        <button
          class="mt-4 w-full cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          :disabled="step === 'verifying'"
          @click="verifyAndSave"
        >
          {{ step === 'verifying' ? '验证中…（约 1 秒）' : '验证并保存' }}
        </button>
        <button
          class="mt-2 w-full cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
          @click="step = 'guide'"
        >
          ← 返回申请说明
        </button>
      </div>

      <!-- ══ 步骤 3：完成 ══ -->
      <div v-else-if="step === 'done'" class="mt-4 text-center">
        <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-lg text-emerald-700">
          ✓
        </div>
        <p class="mt-2 text-sm font-medium text-slate-700">已连接实时数据</p>
        <p class="mt-1 text-xs leading-6 text-slate-500">
          现在可以搜索任意公司、查看最新财报。数据在本地缓存 24 小时，重复查看不再消耗额度。
        </p>
        <button
          class="mt-4 w-full cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          @click="close"
        >
          开始使用 →
        </button>
      </div>

      <!-- 通用操作 -->
      <div class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button
          class="cursor-pointer text-xs text-slate-400 transition hover:text-slate-600"
          @click="clearAll"
        >
          清除凭证与本地缓存
        </button>
        <a
          href="https://open.winmale.com/"
          target="_blank"
          rel="noopener"
          class="ml-auto text-xs text-slate-400 hover:text-brand"
        >
          打开开放平台 ↗
        </a>
      </div>
    </div>
  </div>
</template>
