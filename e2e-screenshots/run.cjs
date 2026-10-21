/* eslint-disable */
// report-lens E2E（M1 新 IA）：首页公司卡片直达报告（无选行业步骤）→ Hero 四段 → 清单展开 → 制造对照 → 次级维度。
// 三视口截图基线输出至 docs/ui-baseline/（IMPLEMENTATION_PLAN.md §7）。
const { chromium } = require('/Users/congwuzhang/.npm/_npx/423231821c231c73/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE || 'http://localhost:5173/report-lens';
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

    // ── 1. 首页：公司卡片（无选行业步骤）──
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1200);
    ok('首页标题', (await page.title()).includes('财报透视'), await page.title());
    ok('无「选择行业」步骤（M1 收窄白酒）', (await page.locator('text=公司属于哪个行业').count()) === 0);
    ok('公司卡片出现', (await page.locator('button:has-text("演示·白酒龙头")').count()) > 0);
    await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

    // ── 2. 点公司卡片直达报告（URL 带 symbol）──
    await page.locator('button:has-text("演示·白酒龙头")').first().click();
    await page.waitForTimeout(1500);
    ok('URL 带 symbol 参数', page.url().includes('symbol='), page.url());
    ok('示例数据标签（amber 强化）', (await page.locator('span:has-text("示例数据")').count()) > 0);

    // ── 3. Hero 报告（白酒=安全画像，六维）──
    const verdictEl = page.locator('main, body').locator('text=/^(安全|关注|高危)$/').first();
    const verdictText = (await verdictEl.textContent().catch(() => '')) || '';
    ok('白酒样例 verdict=安全', verdictText === '安全', `实际=${verdictText}`);
    ok('老唐排雷清单', (await page.locator('text=老唐排雷清单').count()) > 0);
    ok('质量体检六维（白酒）', (await page.locator('text=质量体检 · 六维构成').count()) > 0);
    ok('渠道信心检查项存在', (await page.locator('text=渠道信心').count()) > 0);
    ok('结论与下一步', (await page.locator('h3:has-text("结论与下一步")').count()) > 0);
    ok('情境化 CTA 出现在结论后', (await page.locator('a:has-text("前往专业版")').count()) > 0);
    // 锚点条
    ok('章节锚点条出现', (await page.locator('nav[aria-label="报告章节导航"]').count()) > 0);
    await page.locator('nav[aria-label="报告章节导航"] button:has-text("结论")').click();
    await page.waitForTimeout(700);
    const conclusionInView = await page.locator('#sec-conclusion').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight;
    });
    ok('锚点点击后结论区进入视口', conclusionInView);
    await page.screenshot({ path: `${OUT}/03-hero-liquor.png`, fullPage: true });

    // ── 4. 展开排雷清单（为什么 + 佐证）──
    await page.locator('nav[aria-label="报告章节导航"] button:has-text("排雷")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("经营现金流长期低于净利润")').first().click();
    await page.waitForTimeout(600);
    ok('清单展开-为什么', (await page.locator('text=/为什么(危险|安全)/').count()) > 0);
    await page.screenshot({ path: `${OUT}/04-check-expanded.png`, fullPage: false });

    // ── 5. 切制造样例 → verdict=高危（行业化没削弱通用能力）──
    await page.locator('select').first().selectOption({ index: 1 });
    await page.waitForTimeout(1500);
    const verdict2 = (await page.locator('main, body').locator('text=/^(安全|关注|高危)$/').first().textContent().catch(() => '')) || '';
    ok('制造样例 verdict=高危', verdict2 === '高危', `实际=${verdict2}`);
    ok('制造样例走通用七维', (await page.locator('text=质量体检 · 七维构成').count()) > 0);
    await page.screenshot({ path: `${OUT}/05-hero-manufacturing.png`, fullPage: true });

    // ── 6. 次级维度 ──
    await page.locator('button:has-text("更多维度")').click();
    await page.waitForTimeout(400);
    await page.locator('aside button:has-text("ROE")').first().click();
    await page.waitForTimeout(1000);
    ok('次级 ROE 视图渲染', (await page.locator('text=杜邦').count()) > 0);

    await page.close();

    // ═══ 三视口截图基线（白酒报告页）═══
    for (const vp of VIEWPORTS.slice(1)) {
      const p = await browser.newPage({ viewport: vp });
      p.setDefaultTimeout(15000);
      await p.goto(BASE + '/#/analyze?symbol=DEMO-600519', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(1500);
      // 375px 关键断言：佐证可见（未隐藏）
      if (vp.width === 375) {
        const evVisible = await p
          .locator('button:has-text("经营现金流长期低于净利润") span')
          .filter({ hasText: /均值|最新/ })
          .first()
          .isVisible()
          .catch(() => false);
        ok('375px 清单佐证可见（修复 hidden sm:block 信息丢失）', evVisible);
      }
      await p.screenshot({ path: `${BASELINE}/analyze-${vp.name}.png`, fullPage: true });
      await p.close();
    }
    // desktop 基线
    const pd = await browser.newPage({ viewport: VIEWPORTS[0] });
    await pd.goto(BASE + '/#/analyze?symbol=DEMO-600519', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await pd.waitForTimeout(1500);
    await pd.screenshot({ path: `${BASELINE}/analyze-desktop.png`, fullPage: true });
    await pd.close();
    ok('三视口基线截图已生成', fs.existsSync(`${BASELINE}/analyze-mobile.png`));
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
