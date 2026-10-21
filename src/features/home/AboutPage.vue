<script setup lang="ts">
import { useAppStore } from '@/store/useApp';
import AppTopbar from '@/components/ui/AppTopbar.vue';

const store = useAppStore();
</script>

<template>
  <div class="wb-shell">
    <AppTopbar>
      <template #actions>
        <RouterLink to="/" class="wb-btn">返回首页</RouterLink>
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
          它复用专业版的分析框架（三表口径、ROE 杜邦、现金流质量、排雷判据），以纯前端方式运行；
          数据来自用户自己的开放平台 AppId。
        </p>
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
                  <td>零登录；示例 0 EC；AppId 可选</td>
                  <td>登录 / 会员 / 更完整数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="wb-section">
        <div class="wb-section__head">
          <h2 class="wb-section__title">接入开放平台</h2>
        </div>
        <div class="wb-section__body">
          <ol class="wb-note list-decimal space-y-2 pl-5" style="font-size: 13px; line-height: 22px">
            <li>在 <a href="https://open.winmale.com/" target="_blank" rel="noopener" class="text-brand">open.winmale.com</a> 免费注册并创建应用。</li>
            <li>复制 ClientId / ClientSecret，在首页「数据源」里粘贴并验证；凭证只保存在本机浏览器。</li>
            <li>也可以在本项目根目录 <code>.env.local</code> 配置 <code>VITE_WM_CLIENT_ID</code>、<code>VITE_WM_CLIENT_SECRET</code>、<code>VITE_WM_API_BASE</code>（自部署场景）。</li>
            <li>连接后首次拉取一家公司约 3.6 万 EC；24 小时内缓存命中 0 EC。季度口径成本更高，需二次确认。</li>
          </ol>
          <p class="wb-callout is-warn mt-3">
            本项目不荐股、不给目标价、不做买卖时点；所有结论均为基于输入数据的客观计算，不构成投资建议。
          </p>
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
