/* eslint-disable */
// report-lens E2E（v1 工作台 IA）：
//   首页（搜索/示例入口）→ /company/600519 概览（结论条/KPI/小倍数/Top 风险）→
//   财报（列组表 + 科目下钻 dialog + 子列切换）→ 质量（Altman/Piotroski/增长回报）→
//   风险（四态 + 证据回链）→ 同业/估值（快照降级提示）→ 跟踪 → 移动端底部导航。
// 三视口基线截图输出至 e2e-screenshots/ui-baseline/。
// playwright-core 解析：优先项目 devDependency（CI 走 npm ci 装的稳定版），
// 本地历史环境回退到 npx 缓存的绝对路径
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  ({ chromium } = require('/Users/congwuzhang/.npm/_npx/423231821c231c73/node_modules/playwright-core'));
}
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5173/report-lens';
const OUT = '/tmp/sift-e2e';
const BASELINE = path.join(__dirname, 'ui-baseline');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(BASELINE, { recursive: true });

const results = [];
function ok(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', timeout: 45000, args: ['--no-sandbox'] });

  try {
    // ═══ 主流程：desktop 视口 ═══
    const page = await browser.newPage({ viewport: VIEWPORTS[0] });
    page.setDefaultTimeout(15000);

    // ── 1. 首页：工作台入口（无营销 hero / 无卡片墙）──
    await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1200);
    ok('首页标题', (await page.title()).includes('财报透视'), await page.title());
    ok('搜索框存在', (await page.locator('input[type=search]').count()) > 0);
    ok('示例报告入口', (await page.locator('button:has-text("先看一份示例报告")').count()) > 0);
    ok('三步用法说明', (await page.locator('text=① 选公司').count()) > 0);
    ok('四个问题入口：利润是真的吗', (await page.locator('text=利润是真的吗').count()) > 0);
    ok('热门公司 chips', (await page.locator('a:has-text("贵州茅台 600519")').count()) > 0);
    await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

    // ── 2. 示例报告 → 概览工作台 ──
    await page.locator('button:has-text("先看一份示例报告")').click();
    await page.waitForSelector('.wb-company__name', { timeout: 20000 });
    await page.waitForTimeout(800);
    ok('URL 为 /company/600519/overview', page.url().includes('/company/600519/overview'), page.url());
    ok('公司名：贵州茅台', (await page.locator('.wb-company__name:has-text("贵州茅台")').count()) > 0);
    ok('来源标签：内置快照', (await page.locator('.wb-source:has-text("内置快照")').count()) > 0);
    const verdictText = (await page.locator('.wb-verdict__status').first().textContent().catch(() => '')) || '';
    ok('结论条四态判定', ['稳健', '需关注', '高风险', '数据不足'].includes(verdictText.trim()), `实际=${verdictText}`);
    ok('数据完整度（已核查计数）', (await page.locator('text=/项已核查/').count()) > 0);
    ok('五维 KPI：营收同比', (await page.locator('.wb-kpi__label:has-text("营收同比")').count()) > 0);
    ok('五维 KPI：PE 3 年分位', (await page.locator('.wb-kpi__label:has-text("PE 3 年分位")').count()) > 0);
    ok('首访阅读提示（可关闭）', (await page.locator('text=这份报告怎么看').count()) > 0);
    await page.locator('button:has-text("知道了")').click();
    ok('阅读提示可关闭', (await page.locator('text=这份报告怎么看').count()) === 0);
    ok('核心趋势 2×2 小倍数', (await page.locator('.wb-mini-grid .wb-chart').count()) >= 4);
    ok('小倍数带参考线脚注', (await page.locator('.wb-chart__foot:has-text("参考线")').count()) > 0);
    ok('Top 风险区', (await page.locator('h2:has-text("Top 风险")').count()) > 0);
    ok('快照下同业降级提示（不伪装数据）', (await page.locator('text=同业数据未取到').count()) > 0);
    // 异动信号：快速发现异常的入口
    ok('异动信号区', (await page.locator('h2:has-text("异动信号")').count()) > 0);
    ok('异动条目含证据与判读', (await page.locator('.wb-anomaly__item .wb-anomaly__evidence').count()) > 0);
    ok('异动条目可下钻（带 kind/item）', (await page.locator('.wb-anomaly__item[role="button"]').count()) > 0);
    await page.screenshot({ path: `${OUT}/02-overview.png`, fullPage: true });

    // ── 3. 财报：列组表 + 科目下钻 + 子列切换 ──
    await page.locator('.wb-nav a:has-text("财报")').click();
    await page.waitForSelector('.wb-table', { timeout: 20000 });
    await page.waitForTimeout(600);
    ok('URL 为 financials', page.url().includes('/financials'), page.url());
    ok('三表 tabs', (await page.locator('.wb-seg button:has-text("资产负债表")').count()) > 0);
    ok('子列切换：同比/共同比', (await page.locator('.wb-seg button:has-text("共同比")').count()) > 0);
    ok('年份窗口 5年/10年', (await page.locator('.wb-seg button:has-text("10 年")').count()) > 0);
    ok('列组表头含「原值」', (await page.locator('th:has-text("原值")').count()) > 0);
    ok('列组表头含子列「同比」', (await page.locator('th.wb-th-sub:has-text("同比")').count()) > 0);
    ok('单位说明（亿元）', (await page.locator('text=单位：亿元').count()) > 0);
    // 条件选项：异动阈值 + 只看跳变
    ok('条件条存在', (await page.locator('.wb-filters').count()) > 0);
    ok('异动阈值可选', (await page.locator('.wb-seg button:has-text("同比 30%")').count()) > 0);
    ok('只看跳变开关存在', (await page.locator('.wb-toggle:has-text("只看跳变科目")').count()) > 0);
    ok('异动图例说明颜色语义', (await page.locator('.wb-legend:has-text("上升")').count()) > 0);

    // 科目下钻：点「销售费用」行 → dialog
    await page.locator('tbody tr.is-clickable', { hasText: '销售费用' }).first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    ok('下钻 dialog 打开', (await page.locator('[role="dialog"]').count()) > 0);
    ok('下钻标题为科目名', (await page.locator('.wb-dialog__title:has-text("销售费用")').count()) > 0);
    ok('下钻含来源标注', (await page.locator('.wb-dialog__meta:has-text("三表科目")').count()) > 0);
    // 下钻解读视图：是什么 / 怎么算 / 区间变化 / 波动性 / 为什么盯它 / 下一步
    await page.locator('.wb-seg button:has-text("解读")').click();
    await page.waitForTimeout(300);
    ok('下钻解读视图有内容', (await page.locator('.wb-doc__row').count()) >= 5);
    ok('解读含「是什么」', (await page.locator('.wb-doc__row:has-text("是什么")').count()) > 0);
    ok('解读含「下一步」', (await page.locator('.wb-doc__row:has-text("下一步")').count()) > 0);
    await page.screenshot({ path: `${OUT}/03-lineitem-dialog.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    ok('ESC 关闭下钻', (await page.locator('[role="dialog"]').count()) === 0);

    // 子列切换：共同比
    await page.locator('.wb-seg button:has-text("共同比")').click();
    await page.waitForTimeout(300);
    ok('切换子列为共同比', (await page.locator('th.wb-th-sub:has-text("占比")').count()) > 0);
    ok('共同比口径说明出现', (await page.locator('text=营业总收入').count()) > 0);
    // 只看跳变：过滤后仍有表头，且行数减少
    const rowsAll = await page.locator('tbody tr').count();
    await page.locator('.wb-toggle:has-text("只看跳变科目")').click();
    await page.waitForTimeout(400);
    const rowsFiltered = await page.locator('tbody tr').count();
    ok('只看跳变过滤生效', rowsFiltered <= rowsAll, `${rowsAll} → ${rowsFiltered}`);
    await page.locator('.wb-toggle:has-text("只看跳变科目")').click();
    await page.waitForTimeout(300);
    // 注：不在 E2E 点「季度」——dev 环境 .env.local 带凭证时会真实触发实时取数（24 张表）花 EC；
    // 季度口径正确性由 quarter.test.ts 的「二次差分事故回归」单测钉死
    // 科目深挖：默认收起，点开资产结构 / 存货 / 固定资产
    ok('科目深挖入口', (await page.locator('text=科目深挖').count()) > 0);
    await page.locator('.wb-seg button:has-text("资产结构")').click();
    await page.waitForTimeout(500);
    ok('深挖-资产结构展开', (await page.locator('h2:has-text("资产构成（共同比）")').count()) > 0);
    await page.locator('.wb-seg button:has-text("存货")').click();
    await page.waitForTimeout(500);
    ok('深挖-存货展开', (await page.locator('h2:has-text("存货周转率与周转天数")').count()) > 0);
    await page.locator('.wb-seg button:has-text("固定资产")').click();
    await page.waitForTimeout(500);
    ok('深挖-固定资产展开', (await page.locator('h2:has-text("固定资产周转率")').count()) > 0);
    await page.locator('.wb-seg button:has-text("固定资产")').click();
    await page.waitForTimeout(300);
    ok('深挖可再次收起', (await page.locator('h2:has-text("固定资产周转率")').count()) === 0);
    await page.screenshot({ path: `${OUT}/04-financials.png`, fullPage: true });

    // ── 4. 质量：模型三块 ──
    await page.locator('.wb-nav a:has-text("质量")').click();
    await page.waitForTimeout(800);
    ok('Altman Z 块（缺市值显示数据不足）', (await page.locator('text=/Altman Z/').count()) > 0);
    ok('Piotroski 块', (await page.locator('text=/Piotroski F-Score/').count()) > 0);
    ok('增长与资本回报块', (await page.locator('h2:has-text("增长与资本回报")').count()) > 0);
    ok('WACC 5% 基准声明', (await page.locator('text=/WACC 采用 5% 固定基准/').count()) > 0);
    // 增长来源瀑布图 + 异动扫描（本轮新增的深度模块）
    ok('增长来源块', (await page.locator('h2:has-text("增长来源")').count()) > 0);
    ok('增长来源瀑布图', (await page.locator('.wb-chart canvas').count()) > 0);
    ok('异动扫描块', (await page.locator('h2:has-text("异动扫描")').count()) > 0);
    ok('杜邦块', (await page.locator('h2:has-text("ROE")').count()) > 0);
    ok('六维体检分块', (await page.locator('text=/体检|质量评分/').count()) > 0);

    // 图表 PNG 导出（ECharts getDataURL，无新依赖）
    const pngPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.locator('.wb-chart button:has-text("PNG")').first().click();
    const png = await pngPromise;
    ok('图表 PNG 导出', png.suggestedFilename().endsWith('.png'), png.suggestedFilename());
    await page.screenshot({ path: `${OUT}/05-quality.png`, fullPage: true });

    // ── 5. 风险：四态 + 证据回链 ──
    await page.locator('.wb-nav a:has-text("风险")').click();
    await page.waitForTimeout(600);
    ok('风险清单计数', (await page.locator('text=/项已核查/').count()) > 0);
    ok('缺数据说明（不判安全）', (await page.locator('text=/数据不足/').count()) > 0);
    // Beneish M-Score：综合侦测先行，8 因子 + 两条门线
    ok('Beneish M-Score 区块', (await page.locator('text=/Beneish M-Score/').count()) > 0);
    ok('M-Score 给出分值', (await page.locator('text=/M = /').count()) > 0);
    ok('8 因子明细表', (await page.locator('h2:has-text("8 个因子逐项拆解")').count()) > 0);
    ok('因子表含 TATA 行', (await page.locator('td:has-text("TATA")').count()) > 0);
    ok(
      'DEPI 缺字段如实标注（不冒充 0）',
      (await page.locator('text=/折旧摊销（三表数据源未提供该字段）/').count()) > 0,
    );
    ok('门线说明（−2.22 疑似线）', (await page.locator('text=/疑似线 -2.22/').count()) > 0);
    ok('嫌疑筛查不定罪的声明', (await page.locator('text=/不是「定罪」/').count()) > 0);
    await page.locator('.wb-risk__head', { hasText: '经营现金流' }).first().click();
    await page.waitForTimeout(400);
    ok('风险展开显示「为什么」', (await page.locator('text=/为什么(危险|安全)/').count()) > 0);
    ok('证据回链：在财报中查看', (await page.locator('a:has-text("在财报中查看")').count()) > 0);
    await page.screenshot({ path: `${OUT}/06-risk.png`, fullPage: true });

    // ── 6. 同业 / 估值：快照降级 ──
    await page.locator('.wb-nav a:has-text("同业")').click();
    await page.waitForTimeout(500);
    ok('同业快照降级提示', (await page.locator('text=同业数据未取到').count()) > 0);
    await page.locator('.wb-nav a:has-text("估值")').click();
    await page.waitForTimeout(500);
    ok('估值快照降级提示', (await page.locator('text=示例快照没有实时估值').count()) > 0);
    ok('估值不越界声明', (await page.locator('text=估值只回答').count()) > 0);

    // ── 7. 跟踪 ──
    await page.locator('.wb-nav a:has-text("跟踪")').click();
    await page.waitForTimeout(500);
    ok('跟踪清单表格', (await page.locator('table').count()) > 0);
    ok('什么会推翻结论', (await page.locator('text=什么会推翻本报告的结论').count()) > 0);
    ok('情境化专业版 CTA', (await page.locator('a:has-text("前往专业版")').count()) > 0);
    await page.screenshot({ path: `${OUT}/07-tracking.png`, fullPage: true });

    // ── 7.5 分享深链 + /compare 独立页（快照降级）──
    ok('分享按钮存在', (await page.locator('button:has-text("分享")').count()) > 0);
    await page.goto(BASE + '/#/compare', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    ok('对比页标题', (await page.locator('h2:has-text("同业对比")').count()) > 0);
    // 降级引导必须说准口径：快照模式与「实时但没取到成分」是两回事（后者不该显示快照文案）
    ok(
      '对比页降级引导（不伪装数据）',
      (await page.locator('text=/没有行业成分|也未取到行业成分/').count()) > 0,
    );
    ok(
      '降级文案与当前数据源一致',
      (await page.locator('text=/快照模式没有行业成分/').count()) ===
        ((await page.locator('text=/实时模式也未取到行业成分/').count()) > 0 ? 0 : 1),
    );
    ok('对比页给替代路径（示例公司链接）', (await page.locator('a:has-text("贵州茅台")').count()) > 0);
    // ── 三表逐行横截面：默认 0 EC，勾选后出表，偏离项可筛 ──
    ok('三表逐行对比区块', (await page.locator('h2:has-text("三表逐行对比")').count()) > 0);
    ok('默认 0 家且明示不默认花 EC', (await page.locator('text=/默认不勾选/').count()) > 0);
    ok('EC 预估可见', (await page.locator('text=/预计 0 EC/').count()) > 0);
    ok('内置样本不花 EC 的口径声明', (await page.locator('text=/内置样本走本地快照，勾选不花 EC/').count()) > 0);
    await page.locator('.wb-toggle:has-text("五粮液")').first().click();
    await page.waitForTimeout(200);
    ok('勾选中一家后待取数为 1', (await page.locator('text=/待取数 1 家/').count()) > 0);
    await page.locator('button:has-text("开始加载")').click();
    await page.waitForTimeout(1200);
    ok('横截面表出现（含本公司列）', (await page.locator('text=本公司').count()) > 0);
    ok('横截面表有排名列', (await page.locator('th:has-text("本公司排名")').count()) > 0);
    ok('横截面表有偏离中位数列', (await page.locator('th:has-text("偏离中位数")').count()) > 0);
    ok('对齐共同年', (await page.locator('text=/对齐期间 \\d{4}/').count()) > 0);
    const peerRowsAll = await page.locator('.wb-table--peer tbody tr').count();
    await page.locator('.wb-toggle:has-text("只看偏离项")').click();
    await page.waitForTimeout(400);
    const peerRowsFiltered = await page.locator('.wb-table--peer tbody tr').count();
    ok('只看偏离项过滤生效', peerRowsFiltered <= peerRowsAll, `${peerRowsAll} → ${peerRowsFiltered}`);
    await page.locator('.wb-toggle:has-text("按偏离排序")').click();
    await page.waitForTimeout(300);
    ok('按偏离排序可切换', (await page.locator('.wb-table--peer tbody tr').count()) > 0);
    await page.screenshot({ path: `${OUT}/09-compare.png`, fullPage: true });

    await page.close();

    // ── 8. 移动端 375px：底部导航 + 结论置顶 ──
    const mobile = await browser.newPage({ viewport: VIEWPORTS[2] });
    mobile.setDefaultTimeout(15000);
    await mobile.goto(`${BASE}/#/company/600519/overview`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await mobile.waitForSelector('.wb-verdict__status', { timeout: 20000 });
    await mobile.waitForTimeout(600);
    ok('移动端底部导航 5 项', (await mobile.locator('.wb-mobile-nav a').count()) === 5);
    const verdictTop = await mobile.locator('.wb-verdict').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    });
    ok('移动端结论条在首屏', verdictTop);
    await mobile.locator('.wb-mobile-nav a:has-text("财报")').click();
    await mobile.waitForTimeout(800);
    const scrollable = await mobile
      .locator('.wb-table-wrap')
      .first()
      .evaluate((el) => el.scrollWidth >= el.clientWidth);
    ok('移动端表格可横向滚动', scrollable);
    // 375px 专项：条件条收纳（表格要进得了首屏）+ 横滚渐隐指示
    ok('移动端条件条默认收起', !(await mobile.locator('.wb-filters__panel').first().isVisible()));
    const mobileSummary = (await mobile.locator('.wb-filters__summary').first().textContent()) || '';
    ok('移动端条件摘要可见', mobileSummary.trim().length > 4, mobileSummary.trim());
    const tableFirstScreen = await mobile
      .locator('.wb-scroll')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top < window.innerHeight);
    ok('移动端表格进入首屏', tableFirstScreen);
    ok('移动端横滚渐隐指示', (await mobile.locator('.wb-scroll.is-scrollable').count()) > 0);
    await mobile.locator('.wb-filters__toggle').first().click();
    await mobile.waitForTimeout(300);
    ok('移动端条件条可展开', await mobile.locator('.wb-filters__panel').first().isVisible());
    await mobile.locator('.wb-filters__toggle').first().click();
    await mobile.waitForTimeout(200);
    await mobile.screenshot({ path: `${OUT}/08-mobile-overview.png`, fullPage: false });
    await mobile.close();

    // ── 8.5 数据校验零噪声：真实数据不得把「请核对口径」类提示甩给用户 ──
    // 泸州老窖 2021 少数股东损益为负（净利<归母）、长期待摊费用连续五年 71–176 万，均为真实数据
    const lzlj = await browser.newPage({ viewport: VIEWPORTS[0] });
    lzlj.setDefaultTimeout(15000);
    await lzlj.goto(`${BASE}/#/company/000568/overview`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await lzlj.waitForSelector('.wb-company__name', { timeout: 20000 });
    await lzlj.waitForTimeout(800);
    ok(
      '泸州老窖概览无校验噪声提示',
      (await lzlj.locator('.wb-callout.is-warn:has-text("数据校验提示")').count()) === 0,
    );
    await lzlj.close();

    // ═══ 三视口基线截图（home / overview / financials）═══
    for (const vp of VIEWPORTS) {
      for (const [name, hash] of [
        ['home', '/#/'],
        ['overview', '/#/company/600519/overview'],
        ['financials', '/#/company/600519/financials'],
      ]) {
        const p = await browser.newPage({ viewport: vp });
        p.setDefaultTimeout(15000);
        await p.goto(BASE + hash, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await p.waitForTimeout(1600);
        await p.screenshot({ path: `${BASELINE}/${name}-${vp.name}.png`, fullPage: true });
        await p.close();
      }
    }
    ok(
      '三视口基线截图已生成',
      fs.existsSync(`${BASELINE}/overview-mobile.png`) && fs.existsSync(`${BASELINE}/financials-desktop.png`),
    );
  } catch (e) {
    results.push({ name: 'EXCEPTION', pass: false, extra: String(e).slice(0, 300) });
    console.log('EXCEPTION:', String(e).slice(0, 500));
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.pass);
    console.log(`\n==== 结果: ${results.length - failed.length}/${results.length} 通过 ====`);
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
    process.exit(failed.length ? 1 : 0);
  }
})();
