<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useAppStore } from '@/store/useApp';
import { verifyCredentialPair } from '@/data/wm/verify';
import guideOpenPlatform from '@/assets/guide/step-open-platform.png';
import guideMyApps from '@/assets/guide/step-my-apps.png';

// 数据源设置：表单优先。填入 AppId/Secret → 测试连接（只换 OAuth 令牌，0 EC）
// → 保存并使用。申请引导收进可折叠区，不再挡在表单前面。

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useAppStore();

const step = ref<'form' | 'done'>('form');
const clientId = ref('');
const secret = ref('');
const showSecret = ref(false);
const testing = ref(false);
const testState = ref<'idle' | 'ok' | 'fail'>('idle');
const testMessage = ref('');
const error = ref('');
const testedFor = ref('');
const idInput = ref<HTMLInputElement | null>(null);
let probeController: AbortController | null = null;

const fingerprint = () => `${clientId.value.trim()}\u0000${secret.value.trim()}`;
const testedOk = computed(() => testState.value === 'ok' && testedFor.value === fingerprint());
const hasUserCred = computed(() => store.credential.source === 'user');
const primaryLabel = computed(() => {
  if (testing.value) return '测试中…';
  return testedOk.value ? '保存并使用' : '测试连接';
});

const sourceNote = computed(() => {
  switch (store.credential.source) {
    case 'user':
      return '当前使用本机填写的 AppId；密钥只存本机浏览器。';
    case 'env':
      return '当前凭证来自部署环境变量（所有访客共用）；填写下方可覆盖为本机凭证。';
    case 'demo':
      return '当前使用内置体验密钥：多人共享额度、已限速。填自己的 AppId 可解除限制。';
    default:
      return '当前为内置快照（离线演示，0 EC）。填写 AppId 后可连接实时数据。';
  }
});

watch([clientId, secret], () => {
  if (testing.value) return;
  testState.value = 'idle';
  testMessage.value = '';
  error.value = '';
  testedFor.value = '';
});

let prevOverflow = '';
watch(
  () => props.open,
  (open) => {
    if (open) {
      probeController?.abort();
      probeController = null;
      step.value = 'form';
      showSecret.value = false;
      testing.value = false;
      testState.value = 'idle';
      testMessage.value = '';
      error.value = '';
      testedFor.value = '';
      const user = store.credential.source === 'user';
      clientId.value = user ? store.credential.clientId : '';
      secret.value = user ? store.credential.clientSecret : '';
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
      // 移动端不自动聚焦，避免一打开就弹键盘挡住表单
      if (window.innerWidth >= 768) void nextTick(() => idInput.value?.focus());
    } else {
      probeController?.abort();
      probeController = null;
      testing.value = false;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  probeController?.abort();
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = prevOverflow;
});

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

function close() {
  probeController?.abort();
  probeController = null;
  testing.value = false;
  emit('close');
}

async function testConnection() {
  if (testing.value) return;
  error.value = '';
  testMessage.value = '';
  testState.value = 'idle';
  const id = clientId.value.trim();
  const sec = secret.value.trim();
  if (!id || !sec) {
    testState.value = 'fail';
    error.value = '请填写完整的 AppId（ClientId）与 Secret（ClientSecret）';
    return;
  }
  const controller = new AbortController();
  probeController?.abort();
  probeController = controller;
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  testing.value = true;
  const res = await verifyCredentialPair(
    {
      clientId: id,
      clientSecret: sec,
      apiBase: import.meta.env.VITE_WM_API_BASE as string | undefined,
    },
    controller.signal,
  );
  window.clearTimeout(timer);
  // 对话框已关闭/已发起新测试：丢弃过期结果，避免回填到下一次打开的表单
  if (probeController !== controller) return;
  probeController = null;
  testing.value = false;
  if (res.ok) {
    testState.value = 'ok';
    testMessage.value = res.message;
    testedFor.value = fingerprint();
  } else {
    testState.value = 'fail';
    error.value = controller.signal.aborted
      ? '验证超时：开放平台未响应，请检查网络后重试'
      : res.message;
  }
}

function save() {
  store.applyCredentials(clientId.value.trim(), secret.value.trim());
  step.value = 'done';
}

function onPrimary() {
  if (testedOk.value) save();
  else void testConnection();
}

function clearAll() {
  probeController?.abort();
  probeController = null;
  testing.value = false;
  store.applyCredentials('', '');
  clientId.value = '';
  secret.value = '';
  showSecret.value = false;
  testState.value = 'idle';
  testMessage.value = '';
  error.value = '';
  testedFor.value = '';
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="ds-title"
  >
    <div class="absolute inset-0 bg-slate-900/40" @click="close" />
    <div class="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-slate-200 bg-white p-5 shadow-2xl">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 id="ds-title" class="m-0 text-base font-semibold">数据源 · AppId 与密钥</h3>
          <p class="mt-1 text-xs leading-5 text-slate-500">
            连接开放平台后按自己的额度取数；开放平台免费注册，凭证只存本机浏览器。
          </p>
        </div>
        <button
          type="button"
          class="cursor-pointer text-slate-400 transition hover:text-slate-600"
          aria-label="关闭"
          @click="close"
        >
          ✕
        </button>
      </div>

      <!-- 当前来源与模式 -->
      <div class="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
        <div class="flex flex-wrap items-center gap-x-2">
          <span>当前来源：<b>{{ store.sourceLabel }}</b></span>
        </div>
        <p class="mt-1">{{ sourceNote }}</p>
        <p v-if="store.fetchInfo.ecCost">
          上次取数 {{ store.fetchInfo.ecCost.toLocaleString() }} EC<template v-if="store.fetchInfo.cached">
            （命中本地缓存，本次 0 EC）</template
          >
        </p>
      </div>

      <template v-if="step === 'form'">
        <form class="mt-4" @submit.prevent="onPrimary">
          <label for="ds-client-id" class="block text-xs font-medium text-slate-700">AppId（ClientId）</label>
          <input
            id="ds-client-id"
            ref="idInput"
            v-model="clientId"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="wm_open_xxxxxxxx 或 wm_jkpnxxxxxxxx"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm transition focus:border-brand focus:outline-none disabled:bg-slate-50"
            :disabled="testing"
          />

          <label for="ds-secret" class="mt-3 block text-xs font-medium text-slate-700">Secret（ClientSecret）</label>
          <div class="relative mt-1">
            <input
              id="ds-secret"
              v-model="secret"
              :type="showSecret ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="粘贴 Secret 后测试"
              class="w-full rounded border border-slate-300 px-3 py-1.5 pr-16 text-sm transition focus:border-brand focus:outline-none disabled:bg-slate-50"
              :disabled="testing"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-xs text-slate-400 transition hover:text-slate-600"
              @click="showSecret = !showSecret"
            >
              {{ showSecret ? '隐藏' : '显示' }}
            </button>
          </div>

          <div v-if="hasUserCred" class="mt-2 inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
            已保存本机凭证，Secret 已回填并隐藏
          </div>

          <p
            v-if="error"
            role="alert"
            class="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
          >
            {{ error }}
          </p>
          <p
            v-else-if="testedOk"
            class="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700"
          >
            ✓ {{ testMessage }}
          </p>

          <p class="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            凭证只保存在<b>本机浏览器</b>（localStorage），不会上传给包括本站在内的任何第三方；公共/共享设备请勿填写。
          </p>
          <p class="mt-2 text-xs leading-5 text-slate-500">
            「测试连接」只向开放平台换取一次访问令牌，不查询财报数据（0 EC）。保存后当前公司会按新凭证刷新；内置样板仍走快照 0 EC，非样板首次取数约 3 万 EC（24h 缓存命中 0 EC）。
          </p>

          <button type="submit" class="wb-btn wb-btn--primary mt-4 w-full" :disabled="testing">
            {{ primaryLabel }}
          </button>
        </form>

        <details class="mt-4 rounded border border-slate-200 bg-white">
          <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
            如何获取 AppId 与 Secret？（附截图）
          </summary>
          <div class="border-t border-slate-100 px-3 py-3 text-xs leading-6 text-slate-600">
            <p class="m-0 rounded bg-sky-50 px-2 py-1.5 text-sky-700">
              开放平台免费注册；数据查询按量计 EC，注册即送额度。内置体验密钥供初次体验，自有 AppId 额度更充足、不限速。
            </p>
            <ol class="m-0 mt-2 list-decimal space-y-2 pl-4">
              <li>
                打开
                <a
                  href="https://open.winmale.com/"
                  target="_blank"
                  rel="noopener"
                  class="font-medium text-brand hover:underline"
                  >open.winmale.com</a
                >，<b>微信扫码</b>注册 / 登录（免费）
              </li>
              <li>
                点右上角<b>「我的」</b>→ 进入<b>「开放平台」</b>
                <img
                  :src="guideOpenPlatform"
                  alt="右上角「我的」→ 开放平台 入口截图"
                  class="mt-1.5 w-full rounded border border-slate-200"
                  loading="lazy"
                />
              </li>
              <li>
                导航<b>「我的应用」</b>→ 查看应用信息，复制 <b>AppId（ClientId）</b>与
                <b>Secret（ClientSecret）</b>
                <img
                  :src="guideMyApps"
                  alt="「我的应用」页面，AppId 与 Secret 凭证区截图"
                  class="mt-1.5 w-full rounded border border-slate-200"
                  loading="lazy"
                />
              </li>
              <li>回到这里粘贴两项凭证，先「测试连接」，通过后保存。</li>
            </ol>
          </div>
        </details>
      </template>

      <div v-else class="mt-5">
        <div class="rounded border border-emerald-200 bg-emerald-50 p-4">
          <p class="m-0 text-sm font-semibold text-emerald-800">已保存，正在按新凭证刷新</p>
          <p class="mt-1 text-xs leading-6 text-emerald-700">
            当前公司会按新凭证重新取数；内置样板仍走快照（0 EC）。需要最新实时数据时，点报告头的「拉取最新实时数据」。
          </p>
        </div>
        <button type="button" class="wb-btn wb-btn--primary mt-4 w-full" @click="close">开始使用 →</button>
      </div>

      <!-- 通用操作 -->
      <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <button
          v-if="hasUserCred"
          type="button"
          class="cursor-pointer text-xs text-slate-400 transition hover:text-slate-600"
          @click="clearAll"
        >
          清除本机凭证与缓存
        </button>
        <a
          href="https://open.winmale.com/"
          target="_blank"
          rel="noopener"
          class="ml-auto text-xs text-slate-400 transition hover:text-brand"
        >
          打开开放平台 ↗
        </a>
      </div>
    </div>
  </div>
</template>
