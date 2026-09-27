// Captures the live fuci.family/risk screens (desktop 1440 wide and phone 390 wide) for the tutorial video,
// plus the position of every element the camera zooms to (public/tutorial/boxes.json).
// Needs Playwright:  PW=$(npm root -g)/playwright/index.mjs node scripts/capture-risk.mjs
const { chromium } = await import(process.env.PW || "playwright");
const OUT = new URL("../public/tutorial/", import.meta.url).pathname;
const SITE = "https://www.fuci.family";
const FUCI = "0xe66d5169c5d235209d74e976e594060c44c64420";
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const b = await chromium.launch({ proxy });
const boxes = {};
const box = async (p, name, sel) => {
  const el = typeof sel === "string" ? await p.$(sel) : sel;
  if (!el) return;
  const r = await el.boundingBox();
  const y = await p.evaluate(() => window.scrollY);
  if (r) boxes[name] = { x: Math.round(r.x), y: Math.round(r.y + y), w: Math.round(r.width), h: Math.round(r.height) };
};
for (const [dev, vp, mobile, dpr] of [["desk", { width: 1440, height: 900 }, false, 1], ["mob", { width: 390, height: 844 }, true, 2]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dpr, colorScheme: "dark" });
  const page = async (path) => {
    const p = await ctx.newPage();
    if (proxy) await p.route("**/*", async (r) => { try { await r.fulfill({ response: await r.fetch() }); } catch { await r.abort(); } });
    await p.goto(SITE + path, { waitUntil: "networkidle", timeout: 120000 });
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += 600) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(120); }
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
    return p;
  };
  // 1. Landing (warm the card grades first)
  let p = await page("/risk"); await p.close(); await new Promise((r) => setTimeout(r, 15000));
  p = await page("/risk");
  await box(p, `${dev}.input`, "#risk-q");
  await box(p, `${dev}.cards`, "#arc-protocols");
  await p.screenshot({ path: `${OUT}${dev}-landing.png`, fullPage: true });
  // 2. Suggestions
  await p.fill("#risk-q", "morpho"); await p.waitForTimeout(2500);
  await box(p, `${dev}.suggest`, "[role=listbox]");
  await p.screenshot({ path: `${OUT}${dev}-suggest.png` });
  await p.close();
  // 3. Protocol report, closed and with one factor opened
  p = await page("/risk?protocol=morpho-blue");
  await box(p, `${dev}.grade`, "article > div.card");
  for (const k of ["Audits", "Security history", "Track record", "TVL depth & stability", "Governance & decentralization", "Yield sustainability"]) {
    const li = p.locator("article li.card", { hasText: k }).first();
    await box(p, `${dev}.f.${k}`, await li.elementHandle());
  }
  await p.screenshot({ path: `${OUT}${dev}-morpho.png`, fullPage: true });
  await p.locator("article li.card", { hasText: "Yield sustainability" }).locator("summary").click(); await p.waitForTimeout(500);
  await box(p, `${dev}.yieldOpen`, await p.locator("article li.card", { hasText: "Yield sustainability" }).elementHandle());
  await p.screenshot({ path: `${OUT}${dev}-morpho-open.png`, fullPage: true });
  await p.close();
  // 4. Token report ($FUCI)
  p = await page(`/risk?token=${FUCI}`);
  await box(p, `${dev}.tgrade`, "article > div.card");
  await box(p, `${dev}.limits`, await p.locator("article > div", { hasText: "Why the grade is limited" }).first().elementHandle());
  await box(p, `${dev}.holders`, await p.locator("article li.card", { hasText: "Holder concentration" }).first().elementHandle());
  await p.screenshot({ path: `${OUT}${dev}-fuci.png`, fullPage: true });
  await p.close();
  await ctx.close();
}
const fs = await import("node:fs");
fs.writeFileSync(`${OUT}boxes.json`, JSON.stringify(boxes, null, 1));
console.log(Object.keys(boxes).length, "boxes");
await b.close();
