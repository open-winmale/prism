<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useAppStore } from '@/store/useApp';
import AppTopbar from '@/components/ui/AppTopbar.vue';

const store = useAppStore();
const route = useRoute();

// 从配额横幅「了解配额」进入时直接滚到三通道说明。
// 用 query 而不是 #quota：hash 路由下再嵌一个 # 容易把路由路径吃坏。
onMounted(() => {
  if (route.query.focus === 'quota') {
    document.getElementById('quota')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
</script>

<template>
  <div class="wb-shell">
    <AppTopbar>
      <template #actions>
        <RouterLink to="/" class="wb-btn">返回报告</RouterLink>
        <a :href="store.proUrl" target="_blank" rel="noopener" class="wb-btn wb-btn--primary">
          专业版 ↗
        </a>
      </template>
    </AppTopbar>

    <main class="wb-home">
      <section>
        <div class="wb-home__eyebrow">方法论与数据来源</div>
        <h1 class="wb-home__title" style="font-size: 26px">关于「财报透视」</h1>
        <p class="wb-home__sub">
          财报透视是
          <a :href="store.proUrl" target="_blank" rel="noopener" class="text-brand">赢麻了（winmale.com）</a>
          的个人版前端，聚焦「用财报回答四个问题」：利润真不真、生意好不好、有没有雷、贵不贵。
          它复用专业版的分析框架（三表口径、ROE 杜邦、现金流质量、排雷判据），以纯前端方式运行。
        </p>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <h2 class="wb-section__title">怎么开始</h2>
        </div>
        <div class="wb-section__body">
          <ol class="wb-note list-decimal space-y-2 pl-5" style="font-size: 13px; line-height: 22px">
            <li>
              <b>先看样板</b>：工作台默认打开贵州茅台样板；顶部样板画廊可切到五粮液、泸州老窖、演示·制造，
              全部是内置快照，<b>0 EC</b>、离线可用。
            </li>
            <li>
              <b>搜索任意 A 股</b>：工作台顶栏搜索框使用内置体验密钥（共享额度、已限速、24h 缓存）；
              首次拉取一家公司约 3.6 万 EC，缓存命中 0 EC。
            </li>
            <li>
              <b>私有 AppId</b>：在「数据源」里填自己的 AppId，额度自主可控、密钥只存本机；
              样板报告头会出现「拉取最新实时数据」。
            </li>
          </ol>
          <RouterLink to="/company/600519/overview" class="wb-btn mt-3">打开样板报告 →</RouterLink>
        </div>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <h2 class="wb-section__title">用财报回答四个问题</h2>
        </div>
        <div class="wb-section__body">
          <div class="wb-home__questions" style="margin-top: 0">
            <div class="wb-home__question">
              <h3>利润是真的吗？</h3>
              <p>CFO/净利、应计、应收与存货背离</p>
            </div>
            <div class="wb-home__question">
              <h3>生意好不好？</h3>
              <p>ROE/ROIC、毛利率、费用率与成长质量</p>
            </div>
            <div class="wb-home__question">
              <h3>有没有雷？</h3>
              <p>8–10 项判据，四态结论，证据可回查</p>
            </div>
            <div class="wb-home__question">
              <h3>贵不贵？</h3>
              <p>PE/PB/PS、自身 3 年分位与行业分位</p>
            </div>
          </div>
        </div>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <h2 class="wb-section__title">个人版 vs 专业版</h2>
        </div>
        <div class="wb-section__body">
          <div class="wb-table-wrap">
            <table class="wb-table">
              <thead>
                <tr>
                  <th>能力</th>
                  <th>个人版</th>
                  <th>专业版</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>三表、比率、同比/占比、同业估值</td>
                  <td>完整可查</td>
                  <td>完整 + 更长历史 + 更多指标</td>
                </tr>
                <tr>
                  <td>盈利 / 现金 / 债务 / 估值诊断</td>
                  <td>五维 + 五章</td>
                  <td>15 个专题 + 45 条判据 + 附注穿透</td>
                </tr>
                <tr>
                  <td>附注、分部、量价、股东、公告、预测、提醒</td>
                  <td>不做，报告内入口引导</td>
                  <td>完整</td>
                </tr>
                <tr>
                  <td>使用门槛</td>
                  <td>零登录；样板 0 EC；体验密钥或自有 AppId</td>
                  <td>登录 / 会员 / 更完整数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="quota" class="wb-section" style="scroll-margin-top: 64px">
        <div class="wb-section__head">
          <h2 class="wb-section__title">配额与数据源</h2>
        </div>
        <div class="wb-section__body">
          <div class="wb-table-wrap">
            <table class="wb-table">
              <thead>
                <tr>
                  <th>通道</th>
                  <th>数据范围</th>
                  <th>额度</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>快照样板</td>
                  <td>4 个内置案例（3 家真实白酒 + 演示·制造）</td>
                  <td>0 EC</td>
                  <td>年度口径、离线可用；样板画廊随时切换</td>
                </tr>
                <tr>
                  <td>体验密钥</td>
                  <td>任意 A 股非金融公司</td>
                  <td>共享额度、已限速</td>
                  <td>24h 缓存；高峰可能排队；适合初次体验</td>
                </tr>
                <tr>
                  <td>私有 AppId</td>
                  <td>任意 A 股非金融公司</td>
                  <td>自有额度</td>
                  <td>密钥只存本机；样板报告头可「拉取最新实时数据」</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="wb-note mt-2">
            实时取数成本：5 年三表约 3 万 EC、10 年约 6 万 EC；card / members 增强层约 0.6 万 EC；
            24h 内缓存命中 0 EC。季度口径成本更高。所有消耗在取数前都会给出预估。
          </p>
          <p class="wb-callout is-warn mt-3">
            本项目不荐股、不给目标价、不做买卖时点；所有结论均为基于输入数据的客观计算，不构成投资建议。
          </p>
        </div>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <h2 class="wb-section__title">接入开放平台</h2>
        </div>
        <div class="wb-section__body">
          <ol class="wb-note list-decimal space-y-2 pl-5" style="font-size: 13px; line-height: 22px">
            <li>在 <a href="https://open.winmale.com/" target="_blank" rel="noopener" class="text-brand">open.winmale.com</a> 免费注册并创建应用。</li>
            <li>复制 ClientId / ClientSecret，在工作台顶栏「数据源」里粘贴并验证；凭证只保存在本机浏览器。</li>
            <li>也可以在本项目根目录 <code>.env.local</code> 配置 <code>VITE_WM_CLIENT_ID</code>、<code>VITE_WM_CLIENT_SECRET</code>、<code>VITE_WM_API_BASE</code>（自部署场景）。</li>
            <li>连接后首次拉取一家公司约 3.6 万 EC；24 小时内缓存命中 0 EC。季度口径成本更高，需二次确认。</li>
          </ol>
        </div>
      </section>

      <footer class="wb-footer">
        <span>财报透视 · 个人版</span>
        <span>基于赢麻了专业版分析框架</span>
        <span>仅供学习，不构成投资建议</span>
      </footer>
    </main>
  </div>
</template>
