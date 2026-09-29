/**
 * Affiliate Marketing Simulator — Web / Canvas port
 * Embed: AffiliateMarketing.mount(document.getElementById('game-root'));
 * Host the JS on AWS (S3 + CloudFront). localStorage replaces highscores.json.
 *
 * Logical resolution: 1280×820 (letterboxed to container).
 */
(function (global) {
  "use strict";

  const W = 1280, H = 820;

  // ---- Colours ----
  const C = {
    BG: [22, 24, 32], BEZEL: [45, 48, 58], MONITOR: [18, 20, 28],
    BROWSER: [32, 36, 48], BROWSER_H: [40, 44, 58], CARD: [48, 52, 68],
    BLUE: [64, 160, 255], GREEN: [50, 220, 120], ORANGE: [255, 160, 60],
    WHITE: [240, 242, 250], GRAY: [160, 165, 180], DARK: [70, 75, 90],
    BLACK: [0, 0, 0], RED: [220, 70, 70], PANEL: [28, 30, 42],
    COL: [34, 36, 50], DISABLED: [90, 90, 100],
    TIP_BG: [15, 18, 28], TIP_BD: [80, 140, 220],
  };
  const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  const rgba = (a, al) => `rgba(${a[0]},${a[1]},${a[2]},${al})`;

  // ---- Economy / timing ----
  const MONTHLY_COST = 20;
  const ADSPEND_MONTHLY_CAP = 200, ADSPEND_HARD_CAP = 1000;
  const PAID_SEARCH_DAILY = 6;
  const CONTACT_ENGAGEMENT_BONUS = 1.0, CONTACT_TRAFFIC_BONUS = 15;
  const SEO_TRAFFIC_POINTS = 18;      // cold site / no audience — organic ranking
  const SEO_TRAFFIC_CLUB = 3.5;       // club site with audience — few extra visitors
  const SEO_CLUB_CONV_HAIRCUT = 0.25; // product-searchers convert poorly on a club domain
  const CPC_BASE = 0.75, AUDIENCE_CPC = 0.15, VISITORS_PER_INTENSITY = 0.5;
  const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 25];
  const TOTAL_DAYS = DAYS_PER_MONTH.reduce((a, b) => a + b, 0);
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MIN_WORTH_IT = 600, ACCEPTABLE_DECLINE = 0.5;
  const LOSS_PROMOTE_LIMIT = -100, EARLY_CONTRACT_LOSS = -1000;
  const WELCOME_DURATION = 6, OUTRO_DURATION = 5;
  const MAX_HOLD = 1.0, COOLDOWN = 3.0;

  const NAME_POOL = [
    "Wireless Earbuds Pro","Smart Fitness Watch","Ergo Laptop Stand","USB-C Multiport Hub",
    "Mechanical Keyboard","ANC Headphones","Portable Power Bank","RGB Desk Lamp","Noise-Cancel Mic",
    "4K Webcam","Travel Backpack","Smart Water Bottle","Wireless Charger Pad","Bluetooth Speaker",
    "Gaming Mouse","Standing Desk Mat","Cable Management Kit","Monitor Light Bar","Folding Phone Stand",
    "UV Phone Sanitizer","Mini Projector","Smart LED Strip","Ergo Foot Rest","Laptop Cooling Pad",
    "Wireless Presenter","Portable SSD 1TB","Noise Machine","Desk Organizer Set","Magnetic Cable Pack",
    "Webcam Ring Light","Travel Neck Pillow","Insulated Tumbler","Yoga Mat Roll","Resistance Band Kit",
    "Foam Roller","Grip Strengthener",
  ];
  const PRICE_POOL = [4.99,7.99,9.99,12.99,14.99,19.99,24.99,29.99,34.99,39.99,44.99,49.99,54.99,59.99,69.99,79.99,89.99,99.99];
  const COLOR_POOL = [
    [90,140,255],[255,110,80],[70,200,130],[190,100,220],[255,190,50],[80,210,210],[255,140,180],[140,200,80],
  ];
  const CLUB_TOWNS = ["bristol","leeds","exeter","norwich","york","bath","chester","durham","oxford","cambridge","brighton","plymouth","swansea","cardiff","glasgow","edinburgh","belfast","coventry","sheffield","nottingham","reading","luton"];
  const CLUB_SPORTS = ["rugby","cricket","football","hockey","tennis","netball","rowing","athletics","squash","cycling","golf","sailing","bowls","triathlon"];

  // ---- Layout (logical px) ----
  const MONITOR = { x: 30, y: 50, w: 620, h: 520 };
  const BROWSER = { x: 45, y: 80, w: 590, h: 470 };
  const TRAFFIC_COL = { x: 690, y: 40, w: 270, h: 590 };
  const CONV_COL = { x: 970, y: 40, w: 270, h: 590 };
  const PROMOTE = { x: 710, y: 430, w: 230, h: 48 };
  const START = { x: 990, y: 430, w: 230, h: 48 };
  const RANDOMISE = { x: MONITOR.x + MONITOR.w / 2 - 90, y: MONITOR.y + MONITOR.h - 34, w: 180, h: 28 };
  const AUDIO = { x: MONITOR.x + MONITOR.w - 52, y: MONITOR.y + MONITOR.h - 52, w: 40, h: 40 };
  const FLAG = { x: MONITOR.x + MONITOR.w - 64, y: MONITOR.y + 6, w: 52, h: 36 };
  const STRATEGY_START_Y = 245, STRATEGY_ROW_H = 34, CHECK_H = 34;
  const PARTNER_Y = STRATEGY_START_Y;
  const AUDIENCE_Y = STRATEGY_START_Y + STRATEGY_ROW_H;
  const SEO_Y = STRATEGY_START_Y + 2 * STRATEGY_ROW_H;
  const CONTACT_Y = STRATEGY_START_Y + 3 * STRATEGY_ROW_H;
  const CONTENT_Y = STRATEGY_START_Y + 4 * STRATEGY_ROW_H;
  const CONV_START_Y = STRATEGY_START_Y;
  const TRAFFIC_KNOB = { x: 825, y: 130 }, CONV_KNOB = { x: 1105, y: 130 }, KNOB_R = 55;

  function hudRect() { return { x: CONV_COL.x + 8, y: 400, w: CONV_COL.w - 16, h: 155 }; }
  function quitRect() { const h = hudRect(); return { x: h.x + 10, y: h.y + h.h - 30, w: h.w - 20, h: 24 }; }

  // ---- Help text ----
  const TRAFFIC_HELP = {
    partner: "What: a digital agency with club customers. They recommend a club, log in, and put Smart Catalogue on that club's page. Needs: none — this is the unlock for audience, SEO, contact, content templates, and reviews. Why: you have no website of your own. The partner also proposes the strategy (contact, content updates, product reviews), writes the templates, and the club runs them internally — clubs do not know how to set these up themselves. Cost: $20/mo retained advice + 25% of gross commission.",
    audience: "What: the club has natural member traffic — modelled as ~2k clicks/month on the dial zero. Needs: Partner Promotion (only the partner can confirm an unmonetised engaged audience). Why: without natural traffic you must buy clicks and affiliate marketing is usually loss-making. SEO on a club site adds almost nothing extra — shoppers click vendors, not random club domains.",
    seo: "What: try to rank the club site for product search terms. Needs: Partner Promotion (clubs cannot run SEO themselves). Why it matters: if someone searches for a part they click a main vendor, not a random club website. Effect with no audience: meaningful organic traffic (RepublishAI ~+8 rank positions, p=0.026). Effect with Has an Audience: only a few extra visitors, and those clicks convert poorly. Side effect: Promote costs 2× while SEO is on. Source: https://republishai.com/content-optimization/content-refresh/",
    content: "What: regular content updates so existing members come back. Needs: Has an Audience, and Partner Promotion to set it up. Why: the partner suggests the content strategy and provides templates; the club publishes. Clubs would not know how to set this up themselves. Only members return for club posts — product-search SEO traffic will not come back for the weekend agenda.",
    contact: "What: regular member outreach (email / WhatsApp / newsletter). Needs: Partner Promotion and Has an Audience. Why: the partner proposes the contact strategy and supplies the templates; the club sends them. Clubs would not know how to set mailing templates up themselves. Effect: boosts TRAFFIC and CONVERSION. Engaging members you already have is far cheaper than buying audience.",
  };

  // ---- State ----
  const S = {
    state: "welcome", // welcome | setup | running | gameover | outro
    welcomeT: 0, outroT: 0, flagT: 0,
    hasAudience: false, seo: false, content: false, contact: false, partner: false,
    clubUrl: null,
    conversion: [
      { label: "Paid search", bonus: 1.5, mult: false, checked: false,
        help: "What: always-on Google Ads (~$6/day). Effect: qualified clicks raise conversion. Money: paid to Google — never the partner. Promote costs 2× while on. Source: https://www.affiliatebooster.com/affiliate-conversion-rates-by-traffic-source/" },
      { label: "Product reviews", bonus: 2.0, mult: false, checked: false,
        help: "What: club / product reviews on the catalogue. Needs: Partner Promotion. Why: the partner proposes the review strategy and gives the club a template; members or coaches write the reviews. Clubs would not know how to collect and publish reviews themselves. Effect: social proof lifts conversion." },
      { label: "My club get the commission", bonus: 1.0, mult: true, checked: false,
        help: "What: Smart Catalogue USP — members buy where THEIR club earns commission. Needs: Has an Audience. Effect: +1% conversion; other tactics ~2×; capture ~65%→100%." },
    ],
    intensity: 0, holding: false, holdDur: 0, cooldown: 0, promoteLock: false,
    day: 0, dayTimer: 0, money: 0,
    totalRevenue: 0, totalCommission: 0, totalAdspend: 0, totalPromote: 0, totalPaidSearch: 0, totalCosts: 0,
    salesCount: 0, lastMonthCharged: 0, monthlyAdspend: 0,
    products: [],
    lastSaleMsg: "", lastSaleTimer: 0, flashIdx: -1, flashTimer: 0,
    saleAnims: [],
    audioOn: true, audioCtx: null,
    highScores: [], lastPnl: null, scoresRecorded: false,
    yearsCompleted: 0, lastYearNet: null,
    justFinishedLoss: false, viewingHistorical: false, lastGameoverAvailable: false,
    hoverHelp: null, hsClickRects: [], pnlHoverRects: [], hudHovers: [], gameoverBtn: null, gameoverShowLost: false,
    hudAnimT: 0, hudDisplayMoney: 0, hudPrevMoney: 0, hudPulse: 0, hudSaleFlash: 0,
    mouse: { x: 0, y: 0 }, keys: {},
    welcomeHero: null,
    welcomeHeroReady: false,
  };

  // Preload welcome hero art (same folder as the JS / index.html)
  (function loadWelcomeHero() {
    const img = new Image();
    img.onload = function () { S.welcomeHero = img; S.welcomeHeroReady = true; };
    img.onerror = function () { S.welcomeHeroReady = false; };
    // Try common deploy paths
    const candidates = ["welcome_hero.jpg", "./welcome_hero.jpg", "assets/welcome_hero.jpg"];
    let i = 0;
    img.onerror = function () {
      i++;
      if (i < candidates.length) img.src = candidates[i];
      else S.welcomeHeroReady = false;
    };
    img.src = candidates[0];
  })();


  // ---- Persistence ----
  const LS_HS = "am_highscores_v1", LS_PNL = "am_last_pnl_v1";
  function loadHS() {
    try { S.highScores = JSON.parse(localStorage.getItem(LS_HS) || "[]"); } catch (e) { S.highScores = []; }
  }
  function saveHS() {
    try { localStorage.setItem(LS_HS, JSON.stringify(S.highScores.slice(0, 3))); } catch (e) {}
  }
  function loadLastPnl() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PNL) || "null");
      if (p) { S.lastPnl = p; S.lastGameoverAvailable = true; }
    } catch (e) {}
    if (S.highScores.length) S.lastGameoverAvailable = true;
  }
  function saveLastPnl() {
    try { localStorage.setItem(LS_PNL, JSON.stringify(S.lastPnl)); } catch (e) {}
  }

  // ---- Audio (Web Audio beep) ----
  function ensureAudio() {
    if (!S.audioCtx) {
      try { S.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (S.audioCtx && S.audioCtx.state === "suspended") S.audioCtx.resume();
  }
  function playSaleSound() {
    if (!S.audioOn) return;
    ensureAudio();
    if (!S.audioCtx) return;
    const t0 = S.audioCtx.currentTime;
    const o = S.audioCtx.createOscillator();
    const g = S.audioCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, t0);
    o.frequency.exponentialRampToValueAtTime(440, t0 + 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g); g.connect(S.audioCtx.destination);
    o.start(t0); o.stop(t0 + 0.14);
  }

  // ---- Helpers ----
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fmtMoney(n, signed) {
    const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (signed) return (n >= 0 ? "+$" : "-$") + s;
    return "$" + s;
  }
  function hit(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function pickClubUrl() { return pick(CLUB_TOWNS) + pick(CLUB_SPORTS) + "club.com"; }

  function randomiseProducts() {
    const names = NAME_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 6);
    S.products = names.map((name) => ({
      name,
      price: pick(PRICE_POOL),
      color: pick(COLOR_POOL),
      commission_rate: (10 + Math.floor(Math.random() * 21)) / 100,
    }));
  }

  function resetStrategies() {
    S.hasAudience = false; S.seo = false; S.content = false; S.contact = false;
    S.partner = false; S.clubUrl = null;
    S.conversion.forEach((c) => { c.checked = false; });
  }

  function resetGame(keepStrategies) {
    if (!keepStrategies) resetStrategies();
    S.intensity = 0; S.holding = false; S.holdDur = 0; S.cooldown = 0; S.promoteLock = false;
    S.day = 0; S.dayTimer = 0; S.money = 0;
    S.totalRevenue = 0; S.totalCommission = 0; S.totalAdspend = 0;
    S.totalPromote = 0; S.totalPaidSearch = 0; S.totalCosts = 0;
    S.salesCount = 0; S.lastMonthCharged = 0; S.monthlyAdspend = 0;
    S.lastSaleMsg = ""; S.lastSaleTimer = 0; S.flashIdx = -1; S.flashTimer = 0;
    S.saleAnims = []; S.scoresRecorded = false;
    S.hudAnimT = 0; S.hudDisplayMoney = 0; S.hudPrevMoney = 0; S.hudPulse = 0; S.hudSaleFlash = 0;
    randomiseProducts();
    S.state = "setup";
  }

  function snapshotSettings() {
    return {
      hasAudience: S.hasAudience, seo: S.seo, content: S.content, contact: S.contact,
      partner: S.partner, clubUrl: S.clubUrl,
      conversion: Object.fromEntries(S.conversion.map((c) => [c.label, c.checked])),
    };
  }
  function applySettings(s) {
    if (!s) return;
    S.hasAudience = !!s.hasAudience; S.seo = !!s.seo; S.content = !!s.content;
    S.contact = !!s.contact; S.partner = !!s.partner;
    S.clubUrl = s.clubUrl || (S.partner ? pickClubUrl() : null);
    if (!S.partner) S.clubUrl = null;
    const map = s.conversion || {};
    S.conversion.forEach((c) => { if (c.label in map) c.checked = !!map[c.label]; });
    if (!S.hasAudience) { S.contact = false; S.content = false; S.conversion.filter((c) => c.mult).forEach((c) => { c.checked = false; }); }
    if (!S.partner) { S.hasAudience = false; S.contact = false; S.seo = false; }
  }

  // ---- Formulas (match Python) ----
  function paidSearchOn() { return S.conversion.some((c) => c.label === "Paid search" && c.checked); }
  function clubCommissionOn() { return S.conversion.some((c) => c.mult && c.checked); }

  function getConversion() {
    let base = 1.0, other = 0, clubBonus = 0, clubOn = false;
    S.conversion.forEach((c) => {
      if (c.mult) { clubOn = c.checked; if (clubOn) clubBonus = c.bonus; }
      else if (c.checked) other += c.bonus;
    });
    if (S.contact && S.hasAudience) other += CONTACT_ENGAGEMENT_BONUS;
    let conv = clubOn ? base + clubBonus + other * 2.0 : base + other;
    // Product-intent SEO on a club site: shoppers click Amazon/vendor, not the club
    if (S.seo && S.hasAudience) conv = Math.max(0.5, conv - SEO_CLUB_CONV_HAIRCUT);
    return conv;
  }

  function getTrafficPotential() {
    let seoT = 0;
    if (S.seo) {
      // Club domains rarely win product SERPs vs main vendors
      seoT = S.hasAudience ? SEO_TRAFFIC_CLUB : SEO_TRAFFIC_POINTS;
      if (S.partner && !S.hasAudience) seoT *= 1.25;
    }
    let paidT = paidSearchOn() ? 14 : 0;
    if (paidSearchOn() && S.partner) paidT *= 1.15;
    if (S.hasAudience) {
      let organic = 25, strat = 0;
      if (S.content) strat += 14;
      if (S.contact) strat += CONTACT_TRAFFIC_BONUS;
      let promo;
      if (S.partner) { strat *= 2; promo = S.intensity * 0.5; }
      else promo = S.intensity * 0.35;
      return Math.max(0, Math.min(100, organic + strat + promo + seoT + paidT));
    }
    const promo = S.intensity * (S.partner ? 1.5 : 1.0);
    return Math.max(0, Math.min(100, promo + seoT + paidT));
  }

  function getTraffic() {
    let base = getTrafficPotential();
    if (S.hasAudience && !S.partner) base = Math.max(0, base - 12.5);
    return Math.max(0, Math.min(100, base));
  }

  function getCommissionCapture() {
    if (clubCommissionOn() && S.hasAudience) return 1.0;
    if (S.hasAudience) return 0.65;
    return 0.9;
  }

  function communityShareNow() {
    const fee = Math.max(0, S.totalCosts - S.totalAdspend);
    return S.totalCommission * 0.25 - S.totalAdspend - fee;
  }

  function dayToDate(d) {
    let rem = d;
    for (let mi = 0; mi < DAYS_PER_MONTH.length; mi++) {
      if (rem < DAYS_PER_MONTH[mi]) return { mi, dom: rem + 1 };
      rem -= DAYS_PER_MONTH[mi];
    }
    return { mi: 11, dom: 25 };
  }
  function currentDateStr() {
    const { mi, dom } = dayToDate(Math.min(S.day, TOTAL_DAYS - 1));
    return MONTH_NAMES[mi] + " " + dom;
  }
  function currentMonth() { return dayToDate(Math.min(S.day, TOTAL_DAYS - 1)).mi + 1; }

  function tryAutoSale() {
    if (!S.partner || !S.products.length) return 0;
    const conv = getConversion(), traffic = getTraffic();
    const visitors = (traffic / 100) * 40;
    const expected = visitors * (conv / 100);
    const p = Math.min(0.92, expected);
    if (Math.random() >= p) return 0;
    const prod = pick(S.products);
    const rate = prod.commission_rate;
    const commission = prod.price * rate * getCommissionCapture();
    S.totalRevenue += prod.price;
    S.totalCommission += commission;
    const clubEarn = commission * 0.25;
    S.money += clubEarn;
    S.salesCount += 1;
    S.lastSaleMsg = `SOLD ${prod.name}  +$${Math.round(clubEarn).toLocaleString()}  (${Math.round(rate * 100)}%)`;
    S.lastSaleTimer = 2;
    S.flashIdx = S.products.indexOf(prod);
    S.flashTimer = 0.6;
    playSaleSound();
    // Rising coin + value over the product card (matches original Pygame)
    const cols = 3, gap = 14;
    const content = { x: BROWSER.x + 7, y: BROWSER.y + 48, w: BROWSER.w - 14, h: BROWSER.h - 56 };
    const cw = (content.w - gap * (cols + 1)) / cols;
    const i = Math.max(0, S.flashIdx);
    const col = i % cols, row = Math.floor(i / cols);
    const px = content.x + gap + col * (cw + gap) + cw / 2;
    const py = content.y + gap + row * 145 + 50;
    const label = "+$" + Math.round(clubEarn).toLocaleString("en-US");
    // Main value float
    S.saleAnims.push({
      x: px, y: py, vx: 0, vy: -70, t: 0, life: 1.1,
      text: label, kind: "value", scale: 1,
    });
    // Extra coins fanning up
    for (let k = 0; k < 3; k++) {
      S.saleAnims.push({
        x: px + (k - 1) * 14,
        y: py + 8 + k * 4,
        vx: (k - 1) * 18,
        vy: -55 - k * 12,
        t: 0,
        life: 0.85 + k * 0.08,
        text: "$",
        kind: "coin",
        scale: 1 - k * 0.1,
      });
    }
    return 1;
  }

  function trafficWithIntensity(sim) {
    let seoT = 0;
    if (S.seo) {
      // Club domains rarely win product SERPs vs main vendors
      seoT = S.hasAudience ? SEO_TRAFFIC_CLUB : SEO_TRAFFIC_POINTS;
      if (S.partner && !S.hasAudience) seoT *= 1.25;
    }
    let paidT = paidSearchOn() ? 14 : 0;
    if (paidSearchOn() && S.partner) paidT *= 1.15;
    if (S.hasAudience) {
      let organic = 25, strat = 0;
      if (S.content) strat += 14;
      if (S.contact) strat += CONTACT_TRAFFIC_BONUS;
      let promo;
      if (S.partner) { strat *= 2; promo = sim * 0.5; }
      else promo = sim * 0.35;
      let base = organic + strat + promo + seoT + paidT;
      if (!S.partner) base = Math.max(0, base - 12.5);
      return Math.max(0, Math.min(100, base));
    }
    return Math.max(0, Math.min(100, sim * (S.partner ? 1.5 : 1) + seoT + paidT));
  }

  function finalizeYearAccounts() {
    const ytdSales = S.salesCount, ytdRev = S.totalRevenue, ytdComm = S.totalCommission;
    const ytdAd = S.totalAdspend, ytdCosts = S.totalCosts, ytdMoney = S.money;
    const daysDone = Math.max(0, Math.min(S.day, TOTAL_DAYS));
    const remaining = Math.max(0, TOTAL_DAYS - daysDone);
    const avgPromo = 30;
    const traffic = S.partner ? trafficWithIntensity(avgPromo) : 0;
    const conv = S.partner ? Math.max(0.5, getConversion()) : 0;
    const expectedPerDay = (traffic / 100) * 40 * (conv / 100);
    const nRem = Math.max(0, Math.round(expectedPerDay * remaining * rnd(0.92, 1.08)));
    let extraRev = 0, extraComm = 0, extraSales = 0;
    for (let i = 0; i < nRem; i++) {
      const prod = pick(S.products.length ? S.products : [{ price: 29.99, commission_rate: 0.2 }]);
      const commission = prod.price * (prod.commission_rate || 0.2) * getCommissionCapture();
      extraComm += commission; extraRev += prod.price; extraSales++;
    }
    let cpc = S.hasAudience
      ? AUDIENCE_CPC * (S.partner ? 0.65 : 1)
      : CPC_BASE * (S.partner ? 0.65 : 1);
    if (S.seo || paidSearchOn()) cpc *= 2;
    const visitors = avgPromo * VISITORS_PER_INTENSITY;
    const monthsLeft = Math.max(1, 12 - S.lastMonthCharged);
    const monthlyCap = S.hasAudience ? ADSPEND_MONTHLY_CAP : ADSPEND_HARD_CAP;
    const promoteRest = Math.min(visitors * cpc * remaining * 0.35, monthlyCap * monthsLeft);
    let psRest = 0;
    if (paidSearchOn() && remaining > 0) {
      const daily = PAID_SEARCH_DAILY * (S.partner ? 0.75 : 1);
      psRest = Math.min(daily * remaining, ADSPEND_HARD_CAP * monthsLeft);
    }
    let partnerRest = 0;
    if (S.partner && 12 - S.lastMonthCharged > 0) partnerRest = MONTHLY_COST * (12 - S.lastMonthCharged);

    if (daysDone === 0 && ytdSales === 0) {
      // full-year estimate path
      S.salesCount = 0; S.totalRevenue = 0; S.totalCommission = 0;
      S.totalAdspend = 0; S.totalPromote = 0; S.totalPaidSearch = 0; S.totalCosts = 0; S.money = 0;
      const nFull = Math.max(0, Math.round(expectedPerDay * TOTAL_DAYS * rnd(0.92, 1.08)));
      for (let i = 0; i < nFull; i++) {
        const prod = pick(S.products.length ? S.products : [{ price: 29.99, commission_rate: 0.2 }]);
        const commission = prod.price * (prod.commission_rate || 0.2) * getCommissionCapture();
        S.totalRevenue += prod.price; S.totalCommission += commission;
        S.money += commission * 0.25; S.salesCount++;
      }
      let promoYear = Math.min(visitors * cpc * TOTAL_DAYS * 0.35, monthlyCap * 12);
      if (S.seo || paidSearchOn()) promoYear *= 2;
      S.money -= promoYear; S.totalAdspend += promoYear; S.totalPromote += promoYear; S.totalCosts += promoYear;
      if (paidSearchOn()) {
        const ps = Math.min(PAID_SEARCH_DAILY * (S.partner ? 0.75 : 1) * TOTAL_DAYS, ADSPEND_HARD_CAP * 12);
        S.money -= ps; S.totalAdspend += ps; S.totalPaidSearch += ps; S.totalCosts += ps;
      }
      if (S.partner) { const fee = MONTHLY_COST * 12; S.money -= fee; S.totalCosts += fee; }
    } else {
      S.salesCount = ytdSales + extraSales;
      S.totalRevenue = ytdRev + extraRev;
      S.totalCommission = ytdComm + extraComm;
      S.totalAdspend = ytdAd + promoteRest + psRest;
      S.totalPromote += promoteRest;
      S.totalPaidSearch += psRest;
      S.totalCosts = ytdCosts + promoteRest + psRest + partnerRest;
      S.money = ytdMoney + extraComm * 0.25 - promoteRest - psRest - partnerRest;
    }
    S.lastMonthCharged = 12;
    S.day = TOTAL_DAYS;
    S.monthlyAdspend = 0;
  }

  function snapshotPnl(forceReason) {
    S.money = communityShareNow();
    const net = S.money;
    let lost = false, lossReason = null, disappointment = false;
    if (forceReason) { lost = true; lossReason = forceReason; }
    else {
      // Any negative community share — club always quits (including year 1)
      if (net < 0) {
        lost = true; lossReason = "loss";
      }
      // Year 1: any profit is acceptable — $600 floor only from year 2 onward
      else if (S.yearsCompleted >= 1 && net < MIN_WORTH_IT) {
        lost = true; lossReason = "not_worth";
      }
      if (S.yearsCompleted >= 1 && S.lastYearNet != null) {
        const prev = S.lastYearNet;
        if (prev > 0 && net < prev) {
          const floor = prev * (1 - ACCEPTABLE_DECLINE);
          if (net < floor) { lost = true; lossReason = "worse_than_last"; }
          else if (!lost) disappointment = true;
        } else if (prev <= 0 && net < prev) { lost = true; lossReason = "worse_than_last"; }
      }
    }
    S.justFinishedLoss = lost;
    S.lastPnl = {
      money: net, sales_count: S.salesCount, total_revenue: S.totalRevenue,
      total_commission: S.totalCommission, total_adspend: S.totalAdspend,
      total_promote_adspend: S.totalPromote, total_paidsearch_adspend: S.totalPaidSearch,
      total_costs: S.totalCosts, years_completed: S.yearsCompleted,
      last_year_net: S.lastYearNet, loss_reason: lossReason, disappointment,
      compared_to_year: S.lastYearNet, settings: snapshotSettings(),
    };
    S.lastYearNet = net;
    S.yearsCompleted += 1;
    S.lastPnl.years_completed = S.yearsCompleted;
    S.lastPnl.last_year_net = S.lastYearNet;
    S.lastGameoverAvailable = true;
    S.viewingHistorical = false;
    saveLastPnl();
  }

  function recordHighScore() {
    if (S.scoresRecorded) return;
    S.scoresRecorded = true;
    const entry = {
      net: communityShareNow(), sales: S.salesCount, revenue: S.totalRevenue,
      settings: snapshotSettings(), is_current: true,
    };
    S.highScores.forEach((e) => { e.is_current = false; });
    S.highScores.push(entry);
    S.highScores.sort((a, b) => b.net - a.net);
    S.highScores = S.highScores.slice(0, 3);
    saveHS();
  }

  // ---- Drawing helpers ----
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRound(ctx, color, x, y, w, h, r) {
    ctx.fillStyle = typeof color === "string" ? color : rgb(color);
    roundRect(ctx, x, y, w, h, r); ctx.fill();
  }
  function strokeRound(ctx, color, x, y, w, h, r, lw) {
    ctx.strokeStyle = typeof color === "string" ? color : rgb(color);
    ctx.lineWidth = lw || 2;
    roundRect(ctx, x, y, w, h, r); ctx.stroke();
  }
  function text(ctx, str, x, y, color, size, bold, align) {
    ctx.font = `${bold ? "bold " : ""}${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = typeof color === "string" ? color : rgb(color);
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(str, x, y);
  }
  function textW(ctx, str, size, bold) {
    ctx.font = `${bold ? "bold " : ""}${size}px "Segoe UI", system-ui, sans-serif`;
    return ctx.measureText(str).width;
  }

  function drawKnob(ctx, cx, cy, r, value, maxV, accent, zeroLabel) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = rgb(C.DARK); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = rgb(accent); ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - 8, 0, Math.PI * 2); ctx.fillStyle = "rgb(28,30,40)"; ctx.fill();
    for (let i = 0; i < 11; i++) {
      const a = (-140 + (i / 10) * 280) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx + (r - 14) * Math.sin(a), cy - (r - 14) * Math.cos(a));
      ctx.lineTo(cx + (r - 6) * Math.sin(a), cy - (r - 6) * Math.cos(a));
      ctx.strokeStyle = rgb(C.GRAY); ctx.lineWidth = 2; ctx.stroke();
    }
    if (zeroLabel) {
      // Zero label next to the min tick, clearly OUTSIDE the ring (no overlap)
      // -140° = lower-left of the 280° arc; place beyond stroke + tick + text half-size
      const a0 = -140 * Math.PI / 180;
      const labelR = r + 16;
      const zx = cx + labelR * Math.sin(a0);
      const zy = cy - labelR * Math.cos(a0);
      // text() uses baseline top — nudge so the glyph centres on the radial point
      text(ctx, zeroLabel, zx, zy - 6, C.GRAY, 11, true, "center");
    }
    const ratio = Math.max(0, Math.min(1, maxV ? value / maxV : 0));
    const ang = (-140 + ratio * 280) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (r - 18) * Math.sin(ang), cy - (r - 18) * Math.cos(ang));
    ctx.strokeStyle = rgb(C.WHITE); ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fillStyle = rgb(accent); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = rgb(C.WHITE); ctx.fill();
  }

  function drawCheckbox(ctx, x, y, checked, label, enabled) {
    const box = 18;
    fillRound(ctx, enabled ? C.COL : [40, 42, 52], x, y + 4, box, box, 4);
    strokeRound(ctx, enabled ? C.BLUE : C.DISABLED, x, y + 4, box, box, 4, 2);
    if (checked) {
      ctx.strokeStyle = rgb(C.GREEN); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 13); ctx.lineTo(x + 8, y + 17); ctx.lineTo(x + 14, y + 8); ctx.stroke();
    }
    text(ctx, label, x + 26, y + 5, enabled ? C.WHITE : C.DISABLED, 13, false);
  }

  function drawMonitor(ctx, tint) {
    fillRound(ctx, C.BEZEL, MONITOR.x - 14, MONITOR.y - 14, MONITOR.w + 28, MONITOR.h + 38, 14);
    fillRound(ctx, C.MONITOR, MONITOR.x, MONITOR.y, MONITOR.w, MONITOR.h, 8);
    // stand
    fillRound(ctx, C.BEZEL, MONITOR.x + MONITOR.w / 2 - 36, MONITOR.y + MONITOR.h + 6, 72, 16, 4);
    fillRound(ctx, C.BEZEL, MONITOR.x + MONITOR.w / 2 - 80, MONITOR.y + MONITOR.h + 20, 160, 12, 5);
    // browser chrome
    const bg = [
      Math.min(255, C.BROWSER[0] + (tint[0] - 18)),
      Math.min(255, C.BROWSER[1] + (tint[1] - 20)),
      Math.min(255, C.BROWSER[2] + (tint[2] - 28)),
    ];
    fillRound(ctx, C.BROWSER_H, BROWSER.x, BROWSER.y, BROWSER.w, BROWSER.h, 10);
    fillRound(ctx, bg, BROWSER.x + 7, BROWSER.y + 48, BROWSER.w - 14, BROWSER.h - 56, 6);
    // traffic lights
    [[BROWSER.x + 18, C.RED], [BROWSER.x + 36, C.ORANGE], [BROWSER.x + 54, C.GREEN]].forEach(([x, col]) => {
      ctx.beginPath(); ctx.arc(x, BROWSER.y + 18, 6, 0, Math.PI * 2); ctx.fillStyle = rgb(col); ctx.fill();
    });
    const site = S.partner && S.clubUrl ? S.clubUrl : null;
    text(ctx, site ? `Web Catalogue  –  ${site}` : "Web Catalogue  –  (no club site)", BROWSER.x + 72, BROWSER.y + 10, C.WHITE, 15, true);
    fillRound(ctx, [25, 28, 38], BROWSER.x + 16, BROWSER.y + 38, 420, 22, 5);
    text(ctx, site ? `  https://${site}/catalogue` : "  (no website — partner required to host catalogue)", BROWSER.x + 20, BROWSER.y + 42, site ? C.GRAY : C.DARK, 11);

    if (!S.partner) {
      text(ctx, "No club website", BROWSER.x + BROWSER.w / 2, BROWSER.y + BROWSER.h / 2 - 30, C.GRAY, 18, true, "center");
      text(ctx, "Enable Partner Promotion — they recommend a club and put Smart Catalogue on its page.", BROWSER.x + BROWSER.w / 2, BROWSER.y + BROWSER.h / 2, [140, 150, 170], 13, false, "center");
      text(ctx, "Without a partner there is no site to log into and no storefront — and no sales.", BROWSER.x + BROWSER.w / 2, BROWSER.y + BROWSER.h / 2 + 22, C.DARK, 12, false, "center");
    } else {
      const content = { x: BROWSER.x + 7, y: BROWSER.y + 48, w: BROWSER.w - 14, h: BROWSER.h - 56 };
      const cols = 3, gap = 14, cardW = (content.w - gap * (cols + 1)) / cols, cardH = 145;
      S.products.forEach((prod, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const cx = content.x + gap + col * (cardW + gap);
        const cy = content.y + gap + row * (cardH + gap);
        if (i === S.flashIdx && S.flashTimer > 0 && Math.floor(S.flashTimer * 10) % 2 === 0) {
          fillRound(ctx, [255, 255, 180], cx - 3, cy - 3, cardW + 6, cardH + 6, 10);
        }
        fillRound(ctx, C.CARD, cx, cy, cardW, cardH, 8);
        fillRound(ctx, prod.color, cx + 10, cy + 10, cardW - 20, 68, 6);
        text(ctx, prod.name.slice(0, 22), cx + 10, cy + 84, C.WHITE, 13);
        text(ctx, "$" + prod.price.toFixed(2), cx + 10, cy + 104, C.GREEN, 15, true);
        text(ctx, Math.round(prod.commission_rate * 100) + "% commission", cx + 10, cy + 126, C.ORANGE, 11);
      });
    }
    // randomise (setup only)
    if (S.state === "setup" && S.partner) {
      fillRound(ctx, [40, 50, 70], RANDOMISE.x, RANDOMISE.y, RANDOMISE.w, RANDOMISE.h, 6);
      strokeRound(ctx, C.BLUE, RANDOMISE.x, RANDOMISE.y, RANDOMISE.w, RANDOMISE.h, 6, 1);
      text(ctx, "Randomise parts", RANDOMISE.x + RANDOMISE.w / 2, RANDOMISE.y + 6, C.WHITE, 12, false, "center");
    }
  }

  function monitorTint() {
    if (S.money >= 0) {
      const t = Math.min(1, S.money / 300);
      return [18 + (1 - t) * 40, 20 + t * 60, 28 + (1 - t) * 20];
    }
    const t = Math.min(1, Math.abs(S.money) / 200);
    return [18 + t * 80, 20 - t * 10, 28 - t * 15];
  }

  function drawPromote(ctx) {
    const lossLocked = S.money < LOSS_PROMOTE_LIMIT;
    const disabled = S.state !== "running" || S.promoteLock || S.cooldown > 0 || lossLocked;
    let label = "HOLD TO PROMOTE", color = C.BLUE, border = C.WHITE;
    if (lossLocked) { label = "PROMOTE BLOCKED"; color = C.RED; }
    else if (S.cooldown > 0) { label = `COOLDOWN ${S.cooldown.toFixed(1)}s`; color = C.DARK; }
    else if (S.holding) { label = "PROMOTING..."; color = C.GREEN; }
    else if (disabled) { color = C.DISABLED; }
    fillRound(ctx, color, PROMOTE.x, PROMOTE.y, PROMOTE.w, PROMOTE.h, 12);
    strokeRound(ctx, border, PROMOTE.x, PROMOTE.y, PROMOTE.w, PROMOTE.h, 12, 3);
    text(ctx, label, PROMOTE.x + PROMOTE.w / 2, PROMOTE.y + 14, C.WHITE, 16, true, "center");
    text(ctx, "max 1s hold · 3s cooldown", PROMOTE.x + PROMOTE.w / 2, PROMOTE.y + PROMOTE.h + 6, C.GRAY, 11, false, "center");
  }

  function drawAudio(ctx) {
    const { x, y, w } = AUDIO; const r = w / 2, cx = x + r, cy = y + r;
    ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = S.audioOn ? rgba(C.GREEN, 0.2) : rgba(C.RED, 0.2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = S.audioOn ? "rgb(32,90,68)" : "rgb(55,32,36)"; ctx.fill();
    ctx.strokeStyle = S.audioOn ? rgb(C.GREEN) : rgb(C.RED); ctx.lineWidth = 2; ctx.stroke();
    text(ctx, S.audioOn ? "♪" : "✕", cx, cy - 8, C.WHITE, 16, true, "center");
  }

  function drawCheckeredFlag(ctx, rect, t, mirror) {
    // Waving fabric + pole (original Pygame look)
    const x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    const poleX = mirror ? x + w - 4 : x + 4;
    ctx.strokeStyle = "rgb(200,205,220)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(poleX, y - 2); ctx.lineTo(poleX, y + h + 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(poleX, y - 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(255,210,90)"; ctx.fill();
    const cols = 8, rows = 5;
    const clothW = w - 10, clothH = h - 4;
    const cellW = clothW / cols, cellH = clothH / rows;
    const amp = 3.2;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let edge = c / Math.max(1, cols - 1);
        if (mirror) edge = 1 - edge;
        const ripple = Math.sin(t * 5.5 + c * 0.55 + r * 0.15) * amp * (0.25 + 0.75 * edge);
        const shade = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 5.5 + c * 0.55));
        const light = (r + c) % 2 === 0;
        const v = light ? Math.floor(250 * shade) : Math.floor(22 * shade);
        ctx.fillStyle = light ? `rgb(${v},${v},${v})` : `rgb(${v},${v},${Math.floor(v * 1.1)})`;
        const x0 = mirror
          ? poleX - 3 - (c + 1) * cellW + ripple
          : poleX + 3 + c * cellW + ripple;
        const y0 = y + 2 + r * cellH + Math.sin(t * 4 + c * 0.4) * 0.8;
        ctx.fillRect(x0, y0, cellW + 0.6, cellH + 0.6);
      }
    }
  }

  function drawFlag(ctx, t) {
    if (!S.lastGameoverAvailable || S.state !== "setup") return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
    fillRound(ctx, [40 + 30 * pulse, 50 + 25 * pulse, 80 + 40 * pulse], FLAG.x - 6, FLAG.y - 6, FLAG.w + 12, FLAG.h + 14, 8);
    drawCheckeredFlag(ctx, { x: FLAG.x + 4, y: FLAG.y + 4, w: FLAG.w - 8, h: FLAG.h - 8 }, t, false);
    text(ctx, "Last results", FLAG.x + FLAG.w / 2, FLAG.y + FLAG.h + 4, [160, 190, 230], 10, false, "center");
  }

  function getCommissionProxy() {
    // Matches original: relative strength of commission (drives COMMISSION word size only)
    const traffic = getTraffic();
    const conv = getConversion();
    let base = (traffic / 100) * (conv / 8);
    if (!S.hasAudience) base -= (S.intensity / 100) * 1.0;
    return base;
  }

  function drawEquation(ctx, intensity, conversion) {
    // Original behaviour: PROMOTION & CONVERSION stay fixed size;
    // only COMMISSION grows/shrinks with proxy; parts laid out left→right so they never overlap.
    const fixedSize = 28;
    const opSize = 28;
    const proxy = getCommissionProxy();
    let commSize, commCol;
    if (proxy > 0) {
      commSize = Math.floor(fixedSize + Math.min(1, proxy) * 50);
      if (proxy > 0.55) commCol = [255, 200, 40];
      else {
        const g = Math.min(255, 120 + Math.floor(proxy * 135));
        commCol = [40, g, Math.min(255, 100 + Math.floor(proxy * 100))];
      }
    } else {
      const shrink = Math.max(0, 1 + proxy);
      commSize = Math.floor(16 + shrink * (fixedSize - 16));
      const intensityR = Math.min(1, Math.abs(proxy));
      const r = Math.floor(180 + intensityR * 75);
      const g = Math.floor(60 - intensityR * 40);
      const b = Math.floor(60 - intensityR * 40);
      commCol = [Math.max(120, r), Math.max(20, g), Math.max(20, b)];
    }

    const showAdspend = S.holding && intensity > 1;
    const parts = [
      { str: "PROMOTION", size: fixedSize, col: C.BLUE },
      { str: "×", size: opSize, col: C.WHITE },
      { str: "CONVERSION", size: fixedSize, col: C.ORANGE },
      { str: "=", size: opSize, col: C.WHITE },
      { str: "COMMISSION", size: commSize, col: commCol },
    ];
    if (showAdspend) {
      parts.push({ str: "−", size: opSize, col: C.WHITE });
      parts.push({ str: "AdSpend", size: fixedSize, col: [255, 140, 80] });
    }

    // Measure total width then centre
    let totalW = 0;
    const gaps = 10;
    parts.forEach((p, i) => {
      totalW += textW(ctx, p.str, p.size, true);
      if (i < parts.length - 1) totalW += gaps;
    });
    let x = Math.max(16, (W - totalW) / 2);
    const baseline = H - 42;

    parts.forEach((p) => {
      const w = textW(ctx, p.str, p.size, true);
      // Vertically centre on baseline (text() uses top baseline)
      text(ctx, p.str, x + w / 2, baseline - p.size * 0.55, p.col, p.size, true, "center");
      x += w + gaps;
    });
  }

  function wrapLines(ctx, str, maxW, size) {
    ctx.font = `${size}px "Segoe UI", system-ui, sans-serif`;
    const words = str.split(/\s+/);
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function drawTooltip(ctx, tip, mx, my, preferBelow, anchor) {
    if (!tip) return;
    const maxW = 340, pad = 12, size = 12;
    // Parse sections
    const titles = ["What","Needs","Why","Why it matters","Effect","Money","Evidence","Side effect","Cost","Source","Prerequisite","Reason","USP"];
    const re = new RegExp(`(?=(?:${titles.join("|")}):)`, "g");
    const parts = tip.split(re).map((p) => p.trim()).filter(Boolean);
    const rows = [];
    parts.forEach((part) => {
      const idx = part.indexOf(":");
      if (idx > 0 && titles.includes(part.slice(0, idx).trim())) {
        const title = part.slice(0, idx).trim().toUpperCase();
        const body = part.slice(idx + 1).trim();
        rows.push({ kind: "title", text: title });
        // URLs
        body.split(/(https?:\/\/\S+)/).forEach((chunk) => {
          if (!chunk) return;
          if (/^https?:\/\//.test(chunk)) {
            rows.push({ kind: "url", text: chunk });
          } else {
            wrapLines(ctx, chunk, maxW - pad * 2, size).forEach((ln) => rows.push({ kind: "text", text: ln }));
          }
        });
        rows.push({ kind: "gap" });
      } else {
        wrapLines(ctx, part, maxW - pad * 2, size).forEach((ln) => rows.push({ kind: "text", text: ln }));
      }
    });
    while (rows.length && rows[rows.length - 1].kind === "gap") rows.pop();
    const lineH = 16;
    const boxH = pad * 2 + rows.reduce((a, r) => a + (r.kind === "gap" ? 4 : lineH), 0);
    let x = mx + 16, y = my - boxH - 8;
    if (preferBelow && anchor) {
      x = anchor.x + anchor.w / 2 - maxW / 2;
      y = anchor.y + anchor.h + 28;
    }
    x = Math.max(10, Math.min(W - 10 - maxW, x));
    y = Math.max(10, Math.min(H - 10 - boxH, y));
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, x + 3, y + 4, maxW, boxH, 8); ctx.fill();
    fillRound(ctx, C.TIP_BG, x, y, maxW, boxH, 8);
    strokeRound(ctx, C.TIP_BD, x, y, maxW, boxH, 8, 2);
    ctx.fillStyle = rgb(C.BLUE);
    ctx.fillRect(x, y + 8, 3, boxH - 16);
    const accent = {
      WHAT: C.BLUE, NEEDS: C.ORANGE, WHY: [180, 160, 255], "WHY IT MATTERS": [180, 160, 255],
      EFFECT: C.GREEN, MONEY: [255, 150, 90], COST: [255, 150, 90], EVIDENCE: [140, 190, 230],
      "SIDE EFFECT": [255, 180, 100], SOURCE: [120, 160, 200], PREREQUISITE: C.ORANGE, REASON: [180, 160, 255], USP: C.GREEN,
    };
    let cy = y + pad;
    rows.forEach((r) => {
      if (r.kind === "gap") { cy += 4; return; }
      if (r.kind === "title") {
        const col = accent[r.text] || C.BLUE;
        text(ctx, r.text, x + pad, cy, col, 11, true);
        ctx.strokeStyle = rgb(col); ctx.lineWidth = 1;
        const tw = textW(ctx, r.text, 11, true);
        ctx.beginPath(); ctx.moveTo(x + pad, cy + 12); ctx.lineTo(x + pad + tw, cy + 12); ctx.stroke();
      } else if (r.kind === "url") {
        text(ctx, r.text, x + pad, cy, [64, 168, 255], size);
        const tw = textW(ctx, r.text, size);
        ctx.strokeStyle = "rgb(64,168,255)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + pad, cy + size); ctx.lineTo(x + pad + tw, cy + size); ctx.stroke();
      } else {
        text(ctx, r.text, x + pad, cy, C.WHITE, size);
      }
      cy += lineH;
    });
  }

  function drawWelcome(ctx, t) {
    // Hero art backdrop (promo image) + title card / data / CTA on top
    ctx.fillStyle = rgb(C.BG);
    ctx.fillRect(0, 0, W, H);

    if (S.welcomeHero && S.welcomeHeroReady) {
      // Cover-fit the hero into the canvas (crop edges if needed)
      const img = S.welcomeHero;
      const ir = img.width / img.height;
      const cr = W / H;
      let dw, dh, dx, dy;
      if (ir > cr) {
        // image wider — fit height, crop sides
        dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0;
      } else {
        dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      // Darken slightly so UI card stays readable
      ctx.fillStyle = "rgba(8, 12, 22, 0.45)";
      ctx.fillRect(0, 0, W, H);
    } else {
      // Fallback grid if image not loaded yet
      ctx.strokeStyle = "rgb(32, 38, 52)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    // Soft vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 560);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Industry sources (cycled)
    const sources = [
      "Lucky Orange — returning visitor conversion rates",
      "AffiliateBooster — conversion by traffic source",
      "EcomHint / Dynamic Yield — ecommerce CVR benchmarks",
      "Statista — global conversion rates by industry",
      "Stackmatix — website conversion rate benchmarks",
      "RepublishAI — content refresh ranking study (+8 positions)",
      "Workshop Digital — content refresh organic lifts",
      "Enterprise Research Centre — SME advisory impact",
      "Rule1 / industry email — contact & engagement rates",
      "IRP Commerce 2025 — category conversion baselines",
      "Calibrating traffic × conversion model…",
      "Ready — opening Smart Catalogue",
    ];
    const phase = (t % Math.max(0.5, WELCOME_DURATION * 1.5)) / Math.max(0.5, WELCOME_DURATION * 1.5);
    const si = Math.floor(phase * sources.length) % sources.length;

    // Fire behind card
    const cardW = 680, cardH = 300;
    const cx = W / 2 - cardW / 2, cy = H / 2 - cardH / 2 - 10;
    for (let i = 0; i < 40; i++) {
      const fx = cx + 40 + (i / 39) * (cardW - 80) + Math.sin(t * 4 + i) * 10;
      const baseY = cy + cardH - 10;
      const fh = 30 + Math.sin(t * 6 + i * 0.7) * 18 + (i % 5) * 6;
      const life = (Math.sin(t * 3 + i) * 0.5 + 0.5);
      ctx.globalAlpha = 0.15 + life * 0.25;
      const grd = ctx.createRadialGradient(fx, baseY - fh * 0.3, 2, fx, baseY - fh * 0.5, fh * 0.6);
      grd.addColorStop(0, "rgba(255, 240, 150, 0.9)");
      grd.addColorStop(0.4, "rgba(255, 140, 40, 0.6)");
      grd.addColorStop(1, "rgba(180, 40, 10, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(fx, baseY - fh * 0.4, 10 + life * 8, fh * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const fireGlow = ctx.createRadialGradient(W / 2, cy + cardH, 20, W / 2, cy + cardH, 220);
    fireGlow.addColorStop(0, "rgba(255, 120, 40, 0.35)");
    fireGlow.addColorStop(0.5, "rgba(255, 60, 20, 0.12)");
    fireGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fireGlow;
    ctx.fillRect(cx - 40, cy + cardH - 60, cardW + 80, 140);

    // Title card
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    roundRect(ctx, cx + 5, cy + 7, cardW, cardH, 16); ctx.fill();
    fillRound(ctx, [18, 22, 34], cx, cy, cardW, cardH, 16);
    strokeRound(ctx, C.BLUE, cx, cy, cardW, cardH, 16, 2);

    text(ctx, "Affiliate Marketing Simulator", W / 2, cy + 18, C.WHITE, 26, true, "center");
    text(ctx, "By Simon Barnett", W / 2, cy + 48, C.GRAY, 14, false, "center");

    // CLICK TO CONTINUE — unmissable under title + fire
    const btnW = 360, btnH = 52;
    const btnX = W / 2 - btnW / 2, btnY = cy + 72;
    const pulse = 0.55 + 0.45 * Math.sin(t * 4.2);
    for (let i = 0; i < 28; i++) {
      const fx = btnX + 20 + (i / 27) * (btnW - 40) + Math.sin(t * 5 + i) * 6;
      const fh = 18 + Math.sin(t * 7 + i * 0.9) * 14 + (i % 4) * 4;
      const life = 0.5 + 0.5 * Math.sin(t * 4 + i);
      ctx.globalAlpha = 0.2 + life * 0.35;
      const grd = ctx.createRadialGradient(fx, btnY + btnH * 0.7, 1, fx, btnY + btnH * 0.3, fh);
      grd.addColorStop(0, "rgba(255, 250, 180, 0.95)");
      grd.addColorStop(0.35, "rgba(255, 140, 40, 0.7)");
      grd.addColorStop(1, "rgba(200, 40, 0, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(fx, btnY + btnH * 0.4, 8 + life * 6, fh * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = `rgba(255, 140, 40, ${0.5 + pulse * 0.4})`;
    ctx.shadowBlur = 8 + pulse * 10;
    fillRound(ctx, [255, 160, 40], btnX, btnY, btnW, btnH, 12);
    fillRound(ctx, [255, 200, 80], btnX + 3, btnY + 3, btnW - 6, btnH - 6, 10);
    ctx.shadowBlur = 0;
    strokeRound(ctx, [255, 255, 200], btnX, btnY, btnW, btnH, 12, 2);
    text(ctx, "CLICK TO CONTINUE", W / 2, btnY + 14, [40, 24, 8], 20, true, "center");
    text(ctx, "▼", W / 2, btnY + btnH + 6 + Math.sin(t * 5) * 4, [255, 200, 80], 14, true, "center");

    text(ctx, "INDUSTRY DATA LOADED INTO THIS MODEL", W / 2, cy + 150, C.ORANGE, 11, true, "center");
    text(ctx, "Figures are grounded in published benchmarks — not invented", W / 2, cy + 166, [130, 140, 160], 11, false, "center");

    fillRound(ctx, [12, 16, 26], cx + 28, cy + 186, cardW - 56, 48, 8);
    strokeRound(ctx, [50, 70, 110], cx + 28, cy + 186, cardW - 56, 48, 8, 1);
    text(ctx, "Loading data", W / 2, cy + 192, C.BLUE, 11, true, "center");
    text(ctx, sources[si], W / 2, cy + 210, C.WHITE, 12, false, "center");

    const dotY = cy + 248;
    const total = sources.length;
    const span = Math.min(cardW - 80, total * 16);
    const startX = W / 2 - span / 2;
    for (let i = 0; i < total; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * (span / (total - 1 || 1)), dotY, i === si ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i === si ? rgb(C.BLUE) : "rgb(50, 58, 72)";
      ctx.fill();
    }
    text(ctx, "Clubs  ·  SEO  ·  Promote  ·  Commission", W / 2, cy + 262, [140, 180, 220], 11, false, "center");

    // Money rising from title
    for (let i = 0; i < 24; i++) {
      const life = (t * 0.25 + i / 24) % 1;
      const ox = (i / 23 - 0.5) * 420;
      const px = W / 2 + ox + Math.sin(t * 1.6 + i) * 22 * life;
      const py = cy + 30 - life * 140 - (i % 4) * 8;
      const a = life < 0.1 ? life / 0.1 : (1 - life);
      if (a < 0.04) continue;
      ctx.globalAlpha = a * 0.95;
      if (i % 3 === 0) {
        const rad = 5 + (1 - life) * 2;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(255,210,60)"; ctx.fill();
        ctx.strokeStyle = "rgb(255,240,150)"; ctx.lineWidth = 1.5; ctx.stroke();
        text(ctx, "$", px, py - rad * 0.55, [50, 70, 20], 10, true, "center");
      } else {
        const labels = ["$", "$$", "+$", "$"];
        text(ctx, labels[i % labels.length], px, py - 8, C.GREEN, 14 + (i % 3), true, "center");
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawOutro(ctx, t) {
    // Mirror welcome city, but dimming / powering down
    const phase = Math.min(1, t / OUTRO_DURATION);
    const dim = 1 - phase * 0.7;
    ctx.fillStyle = `rgb(${18 * dim | 0},${24 * dim | 0},${32 * dim | 0})`;
    ctx.fillRect(0, 0, W, H);
    // fading buildings silhouette
    const horizon = H * 0.55;
    for (let i = 0; i < 10; i++) {
      const bx = 60 + i * 120;
      const bh = 40 + (i * 37) % 80;
      ctx.fillStyle = `rgba(40, 50, 70, ${0.4 * (1 - phase)})`;
      ctx.fillRect(bx, horizon - bh, 50, bh);
    }
    text(ctx, "Shutting down systems…", W / 2, H / 2 - 50, C.WHITE, 22, true, "center");
    const msgs = [
      "Closing catalogue session",
      "Saving high scores",
      "Disconnecting partner link",
      "Powering down city systems",
      "Returning to lobby…",
    ];
    const mi = Math.min(msgs.length - 1, Math.floor(phase * msgs.length));
    text(ctx, msgs[mi], W / 2, H / 2, C.GRAY, 14, false, "center");
    fillRound(ctx, [40, 44, 58], W / 2 - 160, H / 2 + 40, 320, 12, 6);
    fillRound(ctx, C.BLUE, W / 2 - 160, H / 2 + 40, 320 * phase, 12, 6);
    // scanlines
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 * phase})`;
      ctx.fillRect(0, y, W, 2);
    }
  }

  function drawGameOver(ctx) {
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
    // Fit inside logical canvas with margin so the page never needs a scrollbar
    const boxH = 560;
    const box = { x: W / 2 - 270, y: Math.max(16, (H - boxH) / 2), w: 540, h: boxH };
    fillRound(ctx, C.PANEL, box.x, box.y, box.w, box.h, 16);
    strokeRound(ctx, C.ORANGE, box.x, box.y, box.w, box.h, 16, 3);
    // Animated checkered flags flanking the title
    drawCheckeredFlag(ctx, { x: box.x + 18, y: box.y + 10, w: 56, h: 34 }, S.flagT, false);
    drawCheckeredFlag(ctx, { x: box.x + box.w - 74, y: box.y + 10, w: 56, h: 34 }, S.flagT + 0.35, true);
    text(ctx, "YEAR-END P&L", box.x + box.w / 2, box.y + 12, C.WHITE, 20, true, "center");
    const yr = (S.lastPnl && S.lastPnl.years_completed) || S.yearsCompleted || 1;
    text(ctx, "Year " + yr, box.x + box.w / 2, box.y + 38, C.ORANGE, 13, true, "center");

    const sales = S.salesCount, rev = S.totalRevenue, comm = S.totalCommission;
    const fee = Math.max(0, S.totalCosts - S.totalAdspend);
    const plat = comm * 0.5, part = comm * 0.25, community = comm * 0.25;
    const promoteSpend = S.totalPromote, paidSpend = S.totalPaidSearch;
    const engageOwn = S.partner && S.hasAudience;
    const promoteToPartner = engageOwn ? promoteSpend : 0;
    const promoteExternal = engageOwn ? 0 : promoteSpend;
    const adToPartner = promoteToPartner;
    const partnerGets = S.partner ? part + fee + adToPartner : 0;
    const communityGets = community - S.totalAdspend - (S.partner ? fee : 0);

    let y = box.y + 62;
    S.pnlHoverRects = [];
    const indents = { 0: 12, 1: 24, 2: 36, 3: 52 };
    const rows = [
      { label: "Sales completed", val: sales, tip: "Number of successful product sales completed this year.", level: 0 },
      { label: "Gross sales value", val: rev, tip: "Total retail value of products sold through your catalogue this year.", level: 0 },
      { label: "Gross commission", val: comm, tip: "Gross affiliate commission (10–30% per product × capture rate).", level: 1 },
      { label: "WHO GETS WHAT", val: null, tip: "How gross commission, AdSpend, and the partner fee are shared.", level: 0 },
      { label: "Platform", val: plat, tip: "Platform receives 50% of gross commission.", level: 2 },
    ];
    if (S.partner) {
      rows.push(
        { label: "Partner", val: partnerGets,
          tip: "Partner receives 25% of gross commission, the $20/mo engagement fee, and promote spend only when engaging your own audience (member materials through the partner). Paid search always goes to Google/external — never to the partner.",
          level: 2 },
        { label: "  commission share", val: part, tip: "25% of gross affiliate commission.", level: 3 },
        { label: "  engagement fee", val: fee, tip: "Community pays $20/mo to the partner while Partner Promotion is on.", level: 3 },
        { label: "  AdSpend received", val: adToPartner, tip: "Partner-routed adspend: promote spend used to engage your own members (not paid search).", level: 3 },
        { label: "Community", val: communityGets,
          tip: "Community keeps 25% of gross commission, then pays AdSpend and the $20/mo partner fee.",
          level: 2 },
        { label: "  Promote to partner", val: -promoteToPartner,
          tip: "Promote cost to the partner when Has an Audience — engaging own members. 2x with SEO/paid links.",
          level: 3, skip: promoteToPartner <= 0 },
        { label: "  Promote (external)", val: -promoteExternal,
          tip: "Promote paid externally (cold acquisition or no partner). 2x with SEO/paid links.",
          level: 3, skip: promoteExternal <= 0 },
        { label: "  Paid search (Google)", val: -paidSpend,
          tip: "Always-on paid search — always paid to Google/external platforms, never to the partner.",
          level: 3, skip: paidSpend <= 0 },
        { label: "  Fee to partner", val: -fee,
          tip: "Community pays $20/mo to the partner for engagement / consultancy.",
          level: 3 }
      );
    } else {
      rows.push(
        { label: "Partner", val: 0,
          tip: "No partner engaged — Partner Promotion was off. Partner receives nothing and the community does not pay the $20/mo fee.",
          level: 2 },
        { label: "Community", val: communityGets,
          tip: "Community keeps 25% of gross commission and pays any AdSpend directly (no partner fee without Partner Promotion).",
          level: 2 },
        { label: "  Promote (external)", val: -promoteSpend,
          tip: "Promote cost — no partner engaged. 2x when SEO or paid-search links are active.",
          level: 3, skip: promoteSpend <= 0 },
        { label: "  Paid search (external)", val: -paidSpend,
          tip: "Always-on paid search paid externally (no partner engaged).",
          level: 3, skip: paidSpend <= 0 }
      );
    }

    rows.forEach((r) => {
      if (r.skip) return;
      const x0 = box.x + (indents[r.level] || 12);
      if (r.val === null) {
        text(ctx, r.label, box.x + 24, y, C.ORANGE, 13, true);
        S.pnlHoverRects.push({ x: box.x + 30, y: y - 2, w: box.w - 60, h: 20, tip: r.tip });
        y += 16;
        return;
      }
      const isSales = r.label === "Sales completed";
      const col = isSales ? (r.val > 0 ? C.GREEN : C.WHITE)
        : (r.val < 0 ? C.RED : (r.val > 0 ? C.GREEN : C.GRAY));
      const valStr = isSales ? String(Math.round(r.val)) : fmtMoney(r.val, true);
      const bold = r.level === 1;
      text(ctx, r.label, x0, y, bold ? C.WHITE : C.GRAY, bold ? 14 : 13, bold);
      text(ctx, valStr, box.x + box.w - 24, y, col, bold ? 15 : 13, bold, "right");
      S.pnlHoverRects.push({ x: box.x + 30, y: y - 2, w: box.w - 60, h: bold ? 22 : 18, tip: r.tip });
      y += bold ? 20 : 15;
    });

    y += 8;
    ctx.strokeStyle = "rgb(60,70,90)"; ctx.beginPath(); ctx.moveTo(box.x + 24, y); ctx.lineTo(box.x + box.w - 24, y); ctx.stroke();
    y += 12;

        if (S.justFinishedLoss && !S.viewingHistorical) {
      text(ctx, "CONTRACT ENDED BY THE COMMUNITY", box.x + box.w / 2, y, C.RED, 14, true, "center");
      y += 20;
      const reason = (S.lastPnl && S.lastPnl.loss_reason) || "loss";
      let msg = "The catalogue lost money.";
      if (reason === "loss") msg = "Community share finished negative — the club will not keep a loss-making catalogue.";
      if (reason === "not_worth") msg = "Year 2+: community share under $600 — not worth keeping.";
      if (reason === "worse_than_last") msg = "Community share fell more than 50% vs last year.";
      if (reason === "early_loss") msg = "Loss exceeded $1,000 mid-year.";
      text(ctx, msg, box.x + box.w / 2, y, C.GRAY, 12, false, "center");
      y += 28;
    } else if (S.lastPnl && S.lastPnl.disappointment) {
      text(ctx, "Community is disappointed (decline within 50% tolerance).", box.x + box.w / 2, y, C.ORANGE, 12, false, "center");
      y += 24;
    }

    text(ctx, "TOP SCORES  ·  click to load setup", box.x + box.w / 2, y, C.BLUE, 12, true, "center");
    y += 18;
    S.hsClickRects = [];
    const medals = ["1st", "2nd", "3rd"];
    const thisNet = Math.round(communityShareNow());
    const thisSales = S.salesCount;
    for (let i = 0; i < 3; i++) {
      const e = S.highScores[i];
      const rowR = { x: box.x + 30, y: y, w: box.w - 60, h: 26 };
      if (e) {
        const isCur = !S.viewingHistorical && (
          e.is_current ||
          (Math.round(e.net) === thisNet && Number(e.sales) === thisSales)
        );
        if (isCur) {
          const pulse = 0.5 + 0.5 * Math.sin(S.flagT * 4);
          fillRound(ctx, [70, 62, 22], rowR.x, rowR.y, rowR.w, rowR.h, 6);
          strokeRound(ctx, [255, 210 + 30 * pulse, 80], rowR.x, rowR.y, rowR.w, rowR.h, 6, 2);
          ctx.beginPath();
          ctx.arc(rowR.x + 4, rowR.y + rowR.h / 2 + Math.sin(S.flagT * 6) * 3, 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgb(255,240,150)"; ctx.fill();
          ctx.beginPath();
          ctx.arc(rowR.x + rowR.w - 4, rowR.y + rowR.h / 2 + Math.sin(S.flagT * 6 + 1) * 3, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          strokeRound(ctx, [60, 80, 110], rowR.x, rowR.y, rowR.w, rowR.h, 6, 1);
        }
        text(ctx, `${medals[i]}  ${fmtMoney(e.net)}  (${e.sales} sales)`, rowR.x + 8, rowR.y + 5, isCur ? [255, 245, 180] : C.WHITE, 12);
        if (isCur) text(ctx, "THIS YEAR", rowR.x + rowR.w - 8, rowR.y + 6, [255, 230, 120], 10, false, "right");
        else text(ctx, "Load setup →", rowR.x + rowR.w - 8, rowR.y + 6, C.GRAY, 10, false, "right");
        S.hsClickRects.push({ rect: rowR, entry: e });
      } else {
        text(ctx, `${medals[i]}  —`, rowR.x + 8, rowR.y + 5, C.DARK, 12);
      }
      y += 28;
    }

    const ng = { x: box.x + box.w / 2 - 120, y: box.y + box.h - 48, w: 240, h: 38 };
    S.gameoverBtn = ng;
    S.gameoverShowLost = !S.viewingHistorical && S.justFinishedLoss;
    if (S.gameoverShowLost) {
      fillRound(ctx, [160, 40, 50], ng.x, ng.y, ng.w, ng.h, 10);
      strokeRound(ctx, [255, 100, 110], ng.x, ng.y, ng.w, ng.h, 10, 2);
      text(ctx, "CATALOGUE LOST", ng.x + ng.w / 2, ng.y + 9, C.WHITE, 16, true, "center");
    } else {
      fillRound(ctx, C.GREEN, ng.x, ng.y, ng.w, ng.h, 10);
      text(ctx, "CONTINUE", ng.x + ng.w / 2, ng.y + 9, C.BLACK, 16, true, "center");
    }
  }

  function drawMain(ctx) {
    ctx.fillStyle = rgb(C.BG); ctx.fillRect(0, 0, W, H);
    const tint = monitorTint();
    // columns
    fillRound(ctx, C.COL, TRAFFIC_COL.x, TRAFFIC_COL.y, TRAFFIC_COL.w, TRAFFIC_COL.h, 10);
    fillRound(ctx, C.COL, CONV_COL.x, CONV_COL.y, CONV_COL.w, CONV_COL.h, 10);
    text(ctx, "TRAFFIC", TRAFFIC_COL.x + TRAFFIC_COL.w / 2, 50, C.BLUE, 16, true, "center");
    text(ctx, "CONVERSION", CONV_COL.x + CONV_COL.w / 2, 50, C.ORANGE, 16, true, "center");

    drawKnob(ctx, TRAFFIC_KNOB.x, TRAFFIC_KNOB.y, KNOB_R, getTrafficPotential(), 100, C.BLUE, S.hasAudience ? "2k" : "0");
    drawKnob(ctx, CONV_KNOB.x, CONV_KNOB.y, KNOB_R, Math.max(0, getConversion() - 1), 7, C.ORANGE, "1%");

    // strategy headings
    text(ctx, "Traffic Strategy", TRAFFIC_COL.x + TRAFFIC_COL.w / 2, STRATEGY_START_Y - 28, C.BLUE, 13, true, "center");
    text(ctx, "Conversion Strategy", CONV_COL.x + CONV_COL.w / 2, STRATEGY_START_Y - 28, C.ORANGE, 13, true, "center");

    const canEdit = S.state === "setup";
    drawCheckbox(ctx, 710, PARTNER_Y, S.partner, "Partner Promotion", canEdit);
    drawCheckbox(ctx, 710, AUDIENCE_Y, S.hasAudience, "Has an Audience", canEdit && S.partner);
    drawCheckbox(ctx, 710, SEO_Y, S.seo, "SEO optimized content", canEdit && S.partner);
    drawCheckbox(ctx, 710, CONTACT_Y, S.contact, "Regular Contact", canEdit && S.partner && S.hasAudience);
    drawCheckbox(ctx, 710, CONTENT_Y, S.content, "Regular content updates", canEdit && S.hasAudience);

    S.conversion.forEach((c, i) => {
      const cy = CONV_START_Y + i * CHECK_H;
      let enabled = canEdit;
      if (c.label === "Product reviews") enabled = canEdit && S.partner;
      else if (c.mult) enabled = canEdit && S.hasAudience;
      drawCheckbox(ctx, 990, cy, c.checked, c.label, enabled);
    });

    drawMonitor(ctx, tint);
    drawPromote(ctx);
    drawAudio(ctx);
    drawFlag(ctx, S.flagT);

    if (S.state === "setup") {
      fillRound(ctx, C.GREEN, START.x, START.y, START.w, START.h, 12);
      strokeRound(ctx, C.WHITE, START.x, START.y, START.w, START.h, 12, 3);
      text(ctx, "START YEAR", START.x + START.w / 2, START.y + 14, C.BLACK, 18, true, "center");
    }

    // HUD when running (+ per-metric hover tips)
    S.hudHovers = [];
    if (S.state === "running") {
      const ease = 1 - Math.pow(1 - Math.min(1, S.hudAnimT), 3);
      const slide = Math.floor((1 - ease) * 28);
      const hr = hudRect();
      const hx = hr.x, hy = hr.y + slide, hw = hr.w, hh = hr.h;
      const addHover = (x, y, w, h, tip) => S.hudHovers.push({ x, y, w, h, tip });

      ctx.globalAlpha = 0.85 * ease;
      fillRound(ctx, [18, 22, 34], hx, hy, hw, hh, 10);
      strokeRound(ctx, C.BLUE, hx, hy, hw, hh, 10, 2);
      ctx.globalAlpha = 1;

      text(ctx, currentDateStr(), hx + 28, hy + 6, C.WHITE, 14, true);
      addHover(hx + 8, hy + 2, 120, 20,
        "Date: simulated calendar (Jan 1 → Dec 25). 1 real second ≈ 6 game-days. "
        + "Sales and costs accrue each game-day while the year is running.");

      const disp = S.hudDisplayMoney;
      text(ctx, fmtMoney(disp), hx + hw - 10, hy + 4, disp >= 0 ? C.GREEN : C.RED, 16, true, "right");
      addHover(hx + hw - 110, hy + 2, 100, 20,
        "Community balance: running community share of commission minus all community costs. "
        + "Calculation: Σ(sale commission × 25%) − promote − paid search − $20/mo engagement. "
        + "Any negative community share ends the contract. Year 1: any profit is enough. From year 2: under $600 or a >50% drop vs last year also ends it.");

      const mid = hx + hw / 2;
      const y0 = hy + 28;
      text(ctx, "Sales", hx + 10, y0, C.GRAY, 11);
      text(ctx, String(S.salesCount.toLocaleString()), hx + 100, y0, C.WHITE, 11, false, "right");
      addHover(hx + 8, y0 - 1, 100, 14,
        "Sales: number of catalogue purchases completed so far this year. "
        + "Each sale is rolled from traffic × conversion% each game-day "
        + "(visitors ≈ traffic dial / 100 × 40; buy chance = conversion / 100).");

      text(ctx, "Gross", mid, y0, C.GRAY, 11);
      text(ctx, fmtMoney(S.totalRevenue), hx + hw - 10, y0, C.GRAY, 11, false, "right");
      addHover(mid - 2, y0 - 1, 100, 14,
        "Gross sales value: sum of product retail prices for every completed sale. "
        + "Not commission — full catalogue price before the affiliate rate is applied.");

      const partnerFees = Math.max(0, S.totalCosts - S.totalAdspend);
      const promoteSpent = S.totalPromote, paidSpent = S.totalPaidSearch;
      const hudAd = S.totalAdspend + partnerFees;
      text(ctx, "AdSpend", hx + 10, y0 + 14, C.GRAY, 11);
      text(ctx, fmtMoney(hudAd), hx + hw - 10, y0 + 14, [255, 150, 90], 11, false, "right");
      addHover(hx + 8, y0 + 13, hw - 20, 14,
        "AdSpend — all community marketing outlay: "
        + "promote $" + Math.round(promoteSpent).toLocaleString() + " (2× while SEO or Paid search is on) + "
        + "paid search $" + Math.round(paidSpent).toLocaleString() + " + partner engagement $" + Math.round(partnerFees).toLocaleString()
        + " ($20/mo while Partner Promotion is on). "
        + "Promote → partner only when engaging own members; otherwise external. "
        + "Paid search → always Google. Retainer → always partner.");

      text(ctx, "COMMISSION", hx + 10, y0 + 32, C.ORANGE, 11, true);
      addHover(hx + 8, y0 + 31, 90, 12,
        "Commission section: gross affiliate earnings from sales, then split "
        + "Platform 50% / Partner 25% / Community 25%. "
        + "Per sale: price × product rate (10–30%) × capture rate "
        + "(~65–100% with audience / club-benefit framing).");

      const plat = S.totalCommission * 0.5, partC = S.totalCommission * 0.25, commC = S.totalCommission * 0.25;
      const cw = (hw - 20) / 4;
      const cy = y0 + 46;
      const cols = [
        ["Gross", S.totalCommission, C.GREEN,
          "Gross commission: sum over sales of (price × product commission rate × capture). "
          + "Product rates are random 10–30%. Capture is ~90% cold, ~65% audience without "
          + "'My club get the commission', 100% when club-benefit is on."],
        ["Platform", plat, [140, 180, 220],
          "Platform share: 50% of gross commission. "
          + "Calculation: $" + Math.round(S.totalCommission).toLocaleString() + " × 0.50 = $" + Math.round(plat).toLocaleString() + ". "
          + "Not reduced by AdSpend — the platform is paid off the top."],
        ["Partner", partC, [180, 160, 255],
          "Partner commission share: 25% of gross commission only (not the engagement fee). "
          + "Calculation: $" + Math.round(S.totalCommission).toLocaleString() + " × 0.25 = $" + Math.round(partC).toLocaleString() + ". "
          + "On the P&L the partner also receives the $20/mo fee and promote spend when engaging own members."],
        ["Community", commC, [120, 220, 160],
          "Community commission share: 25% of gross before costs. "
          + "Calculation: $" + Math.round(S.totalCommission).toLocaleString() + " × 0.25 = $" + Math.round(commC).toLocaleString() + ". "
          + "Running balance (top-right) is this share minus promote, paid search, and engagement fees."],
      ];
      cols.forEach((row, i) => {
        const cx = hx + 10 + i * cw;
        text(ctx, row[0], cx, cy, C.GRAY, 10);
        text(ctx, fmtMoney(row[1]), cx, cy + 12, row[2], 11);
        addHover(cx - 2, cy - 1, cw, 28, row[3]);
      });

      const qr = quitRect();
      fillRound(ctx, [160, 50, 55], qr.x, qr.y + slide, qr.w, qr.h, 8);
      text(ctx, "QUIT YEAR", qr.x + qr.w / 2, qr.y + slide + 4, C.WHITE, 12, true, "center");
      addHover(qr.x, qr.y + slide, qr.w, qr.h,
        "Quit year: stops the calendar, projects remaining days from current traffic × conversion, "
        + "then opens the year-end P&L. Community share is what contract rules use.");
    }

    // sale anims — rising coins + value labels
    S.saleAnims.forEach((a) => {
      const life = Math.min(1, a.t / a.life);
      const fade = life < 0.15 ? life / 0.15 : life > 0.7 ? (1 - life) / 0.3 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      if (a.kind === "coin") {
        const rad = Math.max(4, 8 * (a.scale || 1) * (1 - life * 0.25));
        ctx.beginPath();
        ctx.arc(a.x, a.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(255, 210, 60)";
        ctx.fill();
        ctx.strokeStyle = "rgb(255, 240, 150)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        text(ctx, "$", a.x, a.y - rad * 0.55, [40, 60, 20], Math.max(9, Math.floor(11 * (a.scale || 1))), true, "center");
      } else {
        const sz = Math.floor(16 + 6 * (1 - life));
        // soft shadow
        text(ctx, a.text || "+$", a.x + 1, a.y + 1, [0, 0, 0], sz, true, "center");
        text(ctx, a.text || "+$", a.x, a.y, C.GREEN, sz, true, "center");
      }
      ctx.globalAlpha = 1;
    });
    if (S.lastSaleTimer > 0) {
      text(ctx, S.lastSaleMsg, BROWSER.x + BROWSER.w / 2, BROWSER.y + BROWSER.h - 22, C.GREEN, 13, false, "center");
    }

    drawEquation(ctx, S.intensity, getConversion());
    text(ctx, "10–30% commission  ·  Partner $20/mo  ·  1s≈6 days  ·  Esc quit", W / 2, H - 28, C.GRAY, 11, false, "center");

    if (S.state === "gameover") drawGameOver(ctx);

    if (S.hoverHelp) {
      const prefer = hit(PROMOTE, S.mouse.x, S.mouse.y);
      drawTooltip(ctx, S.hoverHelp, S.mouse.x, S.mouse.y, prefer, PROMOTE);
    }
  }

  // ---- Input / update ----
  function lockTraffic(kind) {
    if (kind === "audience" && !S.partner) return "Locked: Has an Audience needs Partner Promotion — only the partner can confirm an unmonetised engaged audience.";
    if (kind === "seo" && !S.partner) return "Locked: SEO needs Partner Promotion — communities cannot run search optimisation alone.";
    if (kind === "contact") {
      if (!S.partner) return "Locked: needs Partner Promotion first.";
      if (!S.hasAudience) return "Locked: needs Has an Audience first.";
    }
    if (kind === "content" && !S.hasAudience) return "Locked: Regular content updates need Has an Audience — only members return for club posts.";
    return null;
  }
  function lockConv(c) {
    if (c.label === "Product reviews" && !S.partner) return "Locked: Product reviews need Partner Promotion.";
    if (c.mult && !S.hasAudience) return "Locked: needs Has an Audience first.";
    return null;
  }

  function updateHover() {
    S.hoverHelp = null;
    const { x, y } = S.mouse;
    // P&L row tips (year-end)
    if (S.state === "gameover" && S.pnlHoverRects && S.pnlHoverRects.length) {
      for (const h of S.pnlHoverRects) {
        if (hit(h, x, y)) { S.hoverHelp = h.tip; return; }
      }
    }
    // HUD metric tips (running year)
    if (S.state === "running" && S.hudHovers && S.hudHovers.length) {
      for (const h of S.hudHovers) {
        if (hit(h, x, y)) { S.hoverHelp = h.tip; return; }
      }
    }
    if (S.state === "setup" || S.state === "running") {
      if (hit({ x: 710, y: PARTNER_Y, w: 250, h: 28 }, x, y)) S.hoverHelp = TRAFFIC_HELP.partner;
      else if (hit({ x: 710, y: AUDIENCE_Y, w: 250, h: 28 }, x, y)) S.hoverHelp = lockTraffic("audience") || TRAFFIC_HELP.audience;
      else if (hit({ x: 710, y: SEO_Y, w: 250, h: 28 }, x, y)) S.hoverHelp = lockTraffic("seo") || TRAFFIC_HELP.seo;
      else if (hit({ x: 710, y: CONTACT_Y, w: 250, h: 28 }, x, y)) S.hoverHelp = lockTraffic("contact") || TRAFFIC_HELP.contact;
      else if (hit({ x: 710, y: CONTENT_Y, w: 250, h: 28 }, x, y)) S.hoverHelp = lockTraffic("content") || TRAFFIC_HELP.content;
      else if (hit(PROMOTE, x, y)) {
        if (S.money < LOSS_PROMOTE_LIMIT) S.hoverHelp = "Promote blocked: community is more than $100 in the red.";
        else if (S.state !== "running") S.hoverHelp = "Available after START YEAR — lock strategies and begin.";
        else S.hoverHelp = "What: hold to promote (max 1s, then 3s cooldown). Money: to the partner only when Has an Audience; otherwise external. Costs 2× while SEO or Paid search is on.";
      }
      else {
        S.conversion.forEach((c, i) => {
          if (hit({ x: 990, y: CONV_START_Y + i * CHECK_H, w: 250, h: 28 }, x, y))
            S.hoverHelp = lockConv(c) || c.help;
        });
      }
      if (!S.partner && hit(BROWSER, x, y))
        S.hoverHelp = "What: no club website yet. Needs: Partner Promotion — partner recommends a club and places Smart Catalogue on its page.";
    }
  }

  function onPointerDown(lx, ly) {
    ensureAudio();
    S.mouse = { x: lx, y: ly };

    if (S.state === "welcome") {
      resetStrategies(); resetGame(false);
      S.state = "setup"; S.welcomeT = 0;
      return;
    }
    if (S.state === "outro") return;

    if (hit(AUDIO, lx, ly)) { S.audioOn = !S.audioOn; return; }

    if (S.state === "setup" && S.partner && hit(RANDOMISE, lx, ly)) { randomiseProducts(); return; }
    if (S.state === "setup" && S.lastGameoverAvailable && hit(FLAG, lx, ly)) {
      if (S.lastPnl) {
        S.money = S.lastPnl.money || 0;
        S.salesCount = S.lastPnl.sales_count || 0;
        S.totalRevenue = S.lastPnl.total_revenue || 0;
        S.totalCommission = S.lastPnl.total_commission || 0;
        S.totalAdspend = S.lastPnl.total_adspend || 0;
        S.totalPromote = S.lastPnl.total_promote_adspend || 0;
        S.totalPaidSearch = S.lastPnl.total_paidsearch_adspend || 0;
        S.totalCosts = S.lastPnl.total_costs || 0;
        S.viewingHistorical = true; S.justFinishedLoss = false;
      }
      S.state = "gameover";
      return;
    }

    if (S.state === "gameover") {
      if (S.gameoverBtn && hit(S.gameoverBtn, lx, ly)) {
        if (S.gameoverShowLost || (S.justFinishedLoss && !S.viewingHistorical)) {
          resetStrategies(); resetGame(false);
          S.yearsCompleted = 0; S.lastYearNet = null;
          S.viewingHistorical = false; S.justFinishedLoss = false;
          S.welcomeT = 0; S.state = "welcome";
        } else {
          resetGame(true);
          S.viewingHistorical = false; S.justFinishedLoss = false;
          S.state = "setup";
        }
        return;
      }
      for (const { rect, entry } of S.hsClickRects) {
        if (hit(rect, lx, ly)) {
          applySettings(entry.settings || {});
          resetGame(true);
          applySettings(entry.settings || {});
          S.viewingHistorical = false; S.justFinishedLoss = false;
          S.state = "setup";
          return;
        }
      }
      return;
    }

    if (S.state === "setup") {
      if (hit({ x: 710, y: PARTNER_Y, w: 250, h: 28 }, lx, ly)) {
        S.partner = !S.partner;
        if (S.partner) S.clubUrl = pickClubUrl();
        else {
          S.clubUrl = null; S.hasAudience = false; S.contact = false; S.seo = false; S.content = false; S.intensity = 0;
          S.conversion.forEach((c) => { if (c.label === "Product reviews" || c.mult) c.checked = false; });
        }
      }
      if (hit({ x: 710, y: AUDIENCE_Y, w: 250, h: 28 }, lx, ly) && S.partner) {
        S.hasAudience = !S.hasAudience;
        if (!S.hasAudience) { S.contact = false; S.content = false; S.intensity = 0; S.conversion.filter((c) => c.mult).forEach((c) => { c.checked = false; }); }
      }
      if (hit({ x: 710, y: SEO_Y, w: 250, h: 28 }, lx, ly) && S.partner) S.seo = !S.seo;
      if (hit({ x: 710, y: CONTENT_Y, w: 250, h: 28 }, lx, ly) && S.hasAudience) S.content = !S.content;
      if (hit({ x: 710, y: CONTACT_Y, w: 250, h: 28 }, lx, ly) && S.partner && S.hasAudience) S.contact = !S.contact;
      S.conversion.forEach((c, i) => {
        if (!hit({ x: 990, y: CONV_START_Y + i * CHECK_H, w: 250, h: 28 }, lx, ly)) return;
        if (c.label === "Product reviews" && !S.partner) return;
        if (c.mult && !S.hasAudience) return;
        c.checked = !c.checked;
      });
      if (hit(START, lx, ly)) {
        S.state = "running"; S.day = 0; S.hudAnimT = 0; S.hudDisplayMoney = 0;
      }
      return;
    }

    if (S.state === "running") {
      const qr = quitRect();
      if (hit(qr, lx, ly)) {
        finalizeYearAccounts(); recordHighScore(); snapshotPnl();
        S.state = "gameover";
        return;
      }
      if (hit(PROMOTE, lx, ly) && S.money >= LOSS_PROMOTE_LIMIT && S.cooldown <= 0 && !S.promoteLock) {
        S.holding = true; S.holdDur = 0;
      }
    }
  }

  function onPointerUp() {
    if (S.holding) {
      S.holding = false;
      S.cooldown = COOLDOWN;
      S.promoteLock = true;
      // traffic starts falling immediately when cooldown begins
    }
  }

  function tick(dt) {
    S.flagT += dt;
    if (S.state === "welcome") S.welcomeT += dt;
    if (S.state === "outro") {
      S.outroT += dt;
      if (S.outroT >= OUTRO_DURATION) {
        // Web page never exits — loop back to welcome
        resetStrategies();
        resetGame(false);
        S.yearsCompleted = 0;
        S.lastYearNet = null;
        S.justFinishedLoss = false;
        S.viewingHistorical = false;
        S.welcomeT = 0;
        S.outroT = 0;
        S.state = "welcome";
      }
    }
    if (S.lastSaleTimer > 0) S.lastSaleTimer -= dt;
    if (S.flashTimer > 0) { S.flashTimer -= dt; if (S.flashTimer <= 0) S.flashIdx = -1; }
    S.saleAnims = S.saleAnims.filter((a) => { a.t += dt; a.x += (a.vx || 0) * dt; a.y += a.vy * dt; a.vy += 20 * dt; return a.t < a.life; });

    if (S.state === "running") {
      S.hudAnimT = Math.min(1, S.hudAnimT + dt * 2.2);
      S.hudDisplayMoney += (S.money - S.hudDisplayMoney) * Math.min(1, dt * 8);
      if (Math.abs(S.money - S.hudPrevMoney) > 0.5) {
        S.hudPulse = 1; if (S.money > S.hudPrevMoney) S.hudSaleFlash = 1;
        S.hudPrevMoney = S.money;
      }
      S.hudPulse = Math.max(0, S.hudPulse - dt * 2.5);
      S.hudSaleFlash = Math.max(0, S.hudSaleFlash - dt * 2);

      if (S.cooldown > 0) {
        S.cooldown -= dt;
        if (S.cooldown <= 0) { S.cooldown = 0; S.promoteLock = false; }
        // decay intensity during cooldown
        S.intensity = Math.max(0, S.intensity - dt * 80);
      }

      if (S.holding) {
        S.holdDur += dt;
        S.intensity = Math.min(100, S.intensity + dt * 120);
        if (S.holdDur >= MAX_HOLD) {
          S.holding = false; S.cooldown = COOLDOWN; S.promoteLock = true;
        }
        // adspend while promoting
        if (S.intensity > 1) {
          const visitors = S.intensity * VISITORS_PER_INTENSITY;
          let cpc = S.hasAudience ? AUDIENCE_CPC : CPC_BASE;
          if (S.partner) cpc *= 0.65;
          if (S.seo || paidSearchOn()) cpc *= 2;
          let spend = visitors * cpc * dt * 6; // scale to game-days in tick later — per frame estimate
          // actual charge on day step
        }
      } else if (S.cooldown <= 0) {
        S.intensity = Math.max(0, S.intensity - dt * 50);
      }

      // day progression: 1s real ≈ 6 game days
      S.dayTimer += dt * 6;
      while (S.dayTimer >= 1 && S.state === "running") {
        S.dayTimer -= 1;
        S.day += 1;

        // paid search daily
        if (paidSearchOn()) {
          const rem = Math.max(0, ADSPEND_HARD_CAP - S.monthlyAdspend);
          const daily = PAID_SEARCH_DAILY * (S.partner ? 0.75 : 1);
          const ps = Math.min(daily, rem);
          if (ps > 0) {
            S.money -= ps; S.totalAdspend += ps; S.totalPaidSearch += ps;
            S.totalCosts += ps; S.monthlyAdspend += ps;
          }
        }
        // promote cost for this day if intensity high
        if (S.intensity > 1) {
          const visitors = S.intensity * VISITORS_PER_INTENSITY;
          let cpc = S.hasAudience ? AUDIENCE_CPC : CPC_BASE;
          if (S.partner) cpc *= 0.65;
          if (S.seo || paidSearchOn()) cpc *= 2;
          let spend = visitors * cpc;
          const cap = S.hasAudience ? Math.min(ADSPEND_MONTHLY_CAP, ADSPEND_HARD_CAP) : ADSPEND_HARD_CAP;
          const rem = Math.max(0, cap - S.monthlyAdspend);
          spend = Math.min(spend, rem);
          if (S.hasAudience && rem > 0 && spend < 0.05) spend = Math.min(0.05, rem);
          if (spend > 0) {
            S.money -= spend; S.totalAdspend += spend; S.totalPromote += spend;
            S.totalCosts += spend; S.monthlyAdspend += spend;
          }
        }
        tryAutoSale();
        const m = currentMonth();
        if (m > S.lastMonthCharged && m <= 12) {
          if (S.partner) { S.money -= MONTHLY_COST; S.totalCosts += MONTHLY_COST; }
          S.lastMonthCharged = m;
          S.monthlyAdspend = 0;
        }
        if (S.money < EARLY_CONTRACT_LOSS) {
          finalizeYearAccounts(); recordHighScore(); snapshotPnl("early_loss");
          S.state = "gameover"; break;
        }
        if (S.day >= TOTAL_DAYS) {
          finalizeYearAccounts(); recordHighScore(); snapshotPnl();
          S.state = "gameover"; break;
        }
      }
    }
    updateHover();
  }

  // ---- Mount API ----
  function mount(container, opts) {
    opts = opts || {};
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = "display:block;background:#12141c;touch-action:none;";
    container.innerHTML = "";
    // Ensure container can host a full-viewport game
    container.style.position = container.style.position || "relative";
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    loadHS(); loadLastPnl();
    randomiseProducts();

    /**
     * Fit canvas inside container with uniform scale (never stretch).
     * Equal left/right padding when the viewport is wider than 1280:820;
     * equal top/bottom padding when taller. Always letterboxed.
     */
    function fitCanvas() {
      const cw = container.clientWidth || window.innerWidth || W;
      const ch = container.clientHeight || window.innerHeight || H;
      const scale = Math.min(cw / W, ch / H);
      const dw = Math.max(1, Math.floor(W * scale));
      const dh = Math.max(1, Math.floor(H * scale));
      // Equal side padding (and vertical) via absolute center
      const left = Math.floor((cw - dw) / 2);
      const top = Math.floor((ch - dh) / 2);
      canvas.style.position = "absolute";
      canvas.style.left = left + "px";
      canvas.style.top = top + "px";
      canvas.style.margin = "0";
      canvas.style.width = dw + "px";
      canvas.style.height = dh + "px";
    }
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    if (typeof ResizeObserver !== "undefined") {
      try { new ResizeObserver(fitCanvas).observe(container); } catch (e) {}
    }

    function mapMouse(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / W;
      const scaleY = rect.height / H;
      const lx = (clientX - rect.left) / scaleX;
      const ly = (clientY - rect.top) / scaleY;
      return { x: Math.max(0, Math.min(W - 1, lx)), y: Math.max(0, Math.min(H - 1, ly)) };
    }

    canvas.addEventListener("mousemove", (e) => {
      const p = mapMouse(e.clientX, e.clientY); S.mouse = p;
    });
    canvas.addEventListener("mousedown", (e) => {
      const p = mapMouse(e.clientX, e.clientY); onPointerDown(p.x, p.y);
    });
    window.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const p = mapMouse(t.clientX, t.clientY); onPointerDown(p.x, p.y);
    }, { passive: false });
    canvas.addEventListener("touchend", (e) => { e.preventDefault(); onPointerUp(); }, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (S.state === "outro") {
          // Skip remaining outro → welcome
          resetStrategies();
          resetGame(false);
          S.yearsCompleted = 0;
          S.lastYearNet = null;
          S.justFinishedLoss = false;
          S.viewingHistorical = false;
          S.welcomeT = 0;
          S.outroT = 0;
          S.state = "welcome";
        } else if (S.state !== "welcome") {
          S.state = "outro";
          S.outroT = 0;
        }
      }
    });

    let last = performance.now(), raf;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(dt);
      // letterbox clear
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = rgb(C.BG); ctx.fillRect(0, 0, W, H);
      if (S.state === "welcome") drawWelcome(ctx, S.welcomeT);
      else if (S.state === "outro") drawOutro(ctx, S.outroT);
      else drawMain(ctx);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      destroy() { cancelAnimationFrame(raf); container.innerHTML = ""; },
      canvas,
    };
  }

  global.AffiliateMarketing = { mount, WIDTH: W, HEIGHT: H };
})(typeof window !== "undefined" ? window : globalThis);
