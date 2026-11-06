import os
import sys
from playwright.sync_api import sync_playwright

html_content = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ROYAL ELITE X (REX) — الوثيقة الفنية والدليل الشامل للمشروع</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Orbitron:wght@600;800;900&display=swap" rel="stylesheet">
<style>
  @page {
    size: A4;
    margin: 18mm 14mm 18mm 14mm;
    @bottom-center {
      content: "ROYAL ELITE X · الوثيقة الرسمية للمشروع · صفحة " counter(page);
      font-family: 'Cairo', sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
  }

  :root {
    --gold: #b45309;
    --gold-bright: #d97706;
    --gold-lt: #f59e0b;
    --cyan: #0284c7;
    --dark: #0f172a;
    --card: #f8fafc;
    --border: #e2e8f0;
    --text: #1e293b;
    --muted: #64748b;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', sans-serif;
    color: var(--text);
    background: #ffffff;
    line-height: 1.65;
    font-size: 10.5pt;
  }

  .page-break { page-break-after: always; }
  .avoid-break { page-break-inside: avoid; }

  /* ════ COVER PAGE ════ */
  .cover {
    height: 100%;
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-align: center;
    padding: 30mm 10mm 20mm;
    border: 3px double #d97706;
    border-radius: 12px;
    background: linear-gradient(180deg, #fffdfa 0%, #fff 100%);
  }
  .cover-top { margin-bottom: 20mm; }
  .cover-badge {
    display: inline-block;
    background: #fef3c7;
    color: #92400e;
    font-weight: 800;
    font-size: 11pt;
    padding: 5px 18px;
    border-radius: 20px;
    border: 1px solid #fde68a;
    margin-bottom: 12mm;
    letter-spacing: 0.5px;
  }
  .cover-logo-img {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 3px solid #d97706;
    box-shadow: 0 10px 25px rgba(217, 119, 6, 0.25);
    margin: 0 auto 8mm;
    display: block;
  }
  .cover-title {
    font-family: 'Orbitron', monospace;
    font-size: 32pt;
    font-weight: 900;
    color: #92400e;
    letter-spacing: 2px;
    margin-bottom: 4mm;
  }
  .cover-subtitle {
    font-size: 16pt;
    font-weight: 800;
    color: #1e293b;
    margin-bottom: 6mm;
  }
  .cover-desc {
    font-size: 11.5pt;
    color: var(--muted);
    max-width: 80%;
    margin: 0 auto;
    line-height: 1.8;
  }

  .cover-meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 15mm 0;
    text-align: center;
  }
  .cover-meta-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px;
  }
  .cover-meta-label { font-size: 9pt; color: var(--muted); font-weight: 700; margin-bottom: 4px; }
  .cover-meta-val { font-family: 'Orbitron', 'Cairo', sans-serif; font-size: 13pt; font-weight: 900; color: #b45309; }

  .cover-footer {
    border-top: 1px solid #e2e8f0;
    padding-top: 8mm;
    font-size: 9pt;
    color: var(--muted);
    line-height: 1.7;
  }

  /* ════ HEADERS & SECTIONS ════ */
  h1 {
    font-size: 19pt;
    font-weight: 900;
    color: #92400e;
    border-bottom: 2px solid #fde68a;
    padding-bottom: 6px;
    margin: 16mm 0 8mm;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1:first-of-type { margin-top: 0; }
  h2 {
    font-size: 13.5pt;
    font-weight: 800;
    color: #1e293b;
    margin: 8mm 0 4mm;
  }
  h3 {
    font-size: 11.5pt;
    font-weight: 800;
    color: #b45309;
    margin: 6mm 0 3mm;
  }
  p { margin-bottom: 4mm; text-align: justify; }

  /* ════ TABLES ════ */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6mm 0 8mm;
    font-size: 9.5pt;
  }
  th {
    background: #fef3c7;
    color: #92400e;
    font-weight: 800;
    padding: 8px 12px;
    text-align: right;
    border: 1px solid #fde68a;
  }
  td {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    vertical-align: middle;
  }
  tr:nth-child(even) td { background: #f8fafc; }

  /* ════ HIGHLIGHT BOXES ════ */
  .callout {
    background: #fffbeb;
    border-right: 4px solid #f59e0b;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 5mm 0;
    font-size: 10pt;
  }
  .callout-title { font-weight: 800; color: #92400e; margin-bottom: 3px; }

  .callout-blue {
    background: #f0f9ff;
    border-right: 4px solid #0284c7;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 5mm 0;
    font-size: 10pt;
  }
  .callout-blue .callout-title { color: #0369a1; }

  .callout-red {
    background: #fef2f2;
    border-right: 4px solid #ef4444;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 5mm 0;
    font-size: 10pt;
  }
  .callout-red .callout-title { color: #b91c1c; }

  /* ════ CODE & MONOSPACE ════ */
  .mono {
    font-family: 'Orbitron', monospace;
    font-size: 9pt;
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    color: #0f172a;
    direction: ltr;
    display: inline-block;
  }

  /* ════ GRID CARDS ════ */
  .grid-dual {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 6mm 0;
  }
  .feature-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
  }
  .feature-card h4 { font-size: 11pt; font-weight: 800; color: #b45309; margin-bottom: 4px; }
  .feature-card p { font-size: 9.5pt; color: #475569; margin-bottom: 0; }

  /* ════ BADGES ════ */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 8.5pt;
    font-weight: 800;
  }
  .badge-gold  { background: #fef3c7; color: #92400e; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-cyan  { background: #e0f2fe; color: #0369a1; }
</style>
</head>
<body>

<!-- ═════════════════════════ COVER PAGE ═════════════════════════ -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-badge">👑 المستند الفني والسيادي المعتمد · OFFICIAL WHITEPAPER v3.5</div>
    <img src="https://iili.io/nsECVNn.jpg" class="cover-logo-img" alt="REX LOGO">
    <div class="cover-title">ROYAL ELITE X</div>
    <div class="cover-subtitle">إمبراطورية التعدين السيادية على شبكة TON Blockchain</div>
    <p class="cover-desc">
      الدليل المرجعي الشامل لمنظومة التعدين السحابي اللامركزي، اقتصاد رمز REX، بروتوكولات الأمان والحظر السيادي، شرط الـ 20% للسحب، ونظام إدارة البلاط الملكي.
    </p>
  </div>

  <div class="cover-meta-grid">
    <div class="cover-meta-box">
      <div class="cover-meta-label">الشبكة والبروتوكول</div>
      <div class="cover-meta-val">TON NETWORK</div>
    </div>
    <div class="cover-meta-box">
      <div class="cover-meta-label">المعروض النهائي الأقصى</div>
      <div class="cover-meta-val">1,000,000 REX</div>
    </div>
    <div class="cover-meta-box">
      <div class="cover-meta-label">معرف البوت الرسمي</div>
      <div class="cover-meta-val" style="font-size:10pt;">@Royalelitexbot</div>
    </div>
  </div>

  <div class="cover-footer">
    <strong>عقد الصك والتوزيع الذكي (Jetton Master Minter):</strong><br>
    <span class="mono">EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53</span><br><br>
    <strong>محفظة الخزينة والإدارة المعتمدة (Admin Master Wallet):</strong><br>
    <span class="mono">UQDcvNuFSROi4VFR1kzca-O17z5shUVyc5X6ep4pPGAPltYz</span><br><br>
    تاريخ الإصدار: نوفمبر 2026 · إصدار الإنتاج السيادي (Mainnet Live Edition)
  </div>
</div>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 1 ═════════════════════════ -->
<h1><span>🏛️</span> الفصل الأول: الهوية السيادية واقتصاد الرمز (Tokenomics)</h1>

<h2>1. مقدمة المشروع ورؤيته</h2>
<p>
  مشروع <strong>ROYAL ELITE X (REX)</strong> هو أول إمبراطورية تعدين نخبوي متكاملة تُدار بالكامل عبر تطبيق ويب مصغر (Telegram WebApp) على شبكة <strong>The Open Network (TON)</strong>. تم تصميم النظام ليجمع بين سهولة الوصول الفائقة لمليار مستخدم على تيليجرام مع صرامة العقود الذكية على البلوكشين وقواعد الأمان السيادية.
</p>

<h2>2. البيانات الفنية الدقيقة للرمز (Jetton Specs)</h2>
<p>
  تم نشر رمز REX وفق المعيار الرسمي للأصول الرقمية على شبكة TON (المعيار TEP-74 Jetton)، ويتميز بالخصائص الفنية التالية:
</p>

<table>
  <thead>
    <tr>
      <th>المعيار</th>
      <th>القيمة الرسمية</th>
      <th>الوصف والملاحظات</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>اسم الرمز</strong></td>
      <td>ROYAL ELITE X</td>
      <td>الاسم المعترف به رسمياً على شبكة TON</td>
    </tr>
    <tr>
      <td><strong>الرمز المختصر</strong></td>
      <td><span class="mono">REX</span></td>
      <td>رمز التداول الرسمي</td>
    </tr>
    <tr>
      <td><strong>الشبكة الأساسية</strong></td>
      <td>TON Blockchain (Mainnet)</td>
      <td>بلوكشين الطبقة الأولى فائق السرعة والموثوقية</td>
    </tr>
    <tr>
      <td><strong>العقد الذكي الرئيسي (Minter)</strong></td>
      <td><span class="mono" style="font-size:7.5pt;">EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53</span></td>
      <td>عقد صك الرمز وتوزيع المحافظ الفرعية على الشبكة</td>
    </tr>
    <tr>
      <td><strong>إجمالي المعروض النهائي</strong></td>
      <td><strong>1,000,000 REX</strong></td>
      <td>مليون عملة نهائية ثابتة بالكامل (Non-Mintable)</td>
    </tr>
    <tr>
      <td><strong>الكسور العشرية (Decimals)</strong></td>
      <td>9 Decimals</td>
      <td>مطابق لمعيار NanoTON (1 REX = 10^9 NanoREX)</td>
    </tr>
    <tr>
      <td><strong>محفظة الإدارة والخزينة</strong></td>
      <td><span class="mono" style="font-size:7.5pt;">UQDcvNuFSROi4VFR1kzca-O17z5shUVyc5X6ep4pPGAPltYz</span></td>
      <td>محفظة جمع رسوم التفعيل وتغذية أرصدة السحوبات</td>
    </tr>
  </tbody>
</table>

<div class="callout">
  <div class="callout-title">💎 حماية من التضخم المالي</div>
  عقد عملة REX مغلق بالكامل (Fixed Supply)، ولا يمكن لأي جهة أو مطور أو إدارة صك حتى عملة إضافية واحدة فوق المليون عملة، مما يضمن ندرة العملة وحماية حقوق المالكين والمعدنين.
</div>

<h2>3. خريطة توزيع المعروض الإجمالي (Distribution Matrix)</h2>
<ul>
  <li><strong>60% (600,000 REX):</strong> مخصصة حصرياً لمكافآت التعدين السحابي اليومي والمهام.</li>
  <li><strong>15% (150,000 REX):</strong> مخصصة لبرامج الشركاء والسفراء وعمولات الإحالة الملكية (5% مدى الحياة).</li>
  <li><strong>15% (150,000 REX):</strong> مخصصة لسيولة التداول على منصات التداول اللامركزية (DEX) مثل DeDust و STON.fi.</li>
  <li><strong>10% (100,000 REX):</strong> خزانة التطوير المستمر وصندوق تأمين ودعم شبكة البلاط الملكي.</li>
</ul>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 2 ═════════════════════════ -->
<h1><span>🔐</span> الفصل الثاني: بوابة البلاط وبروتوكول القفل الشامل (Gatekeeper)</h1>

<h2>1. فلسفة بوابة الحماية السيادية</h2>
<p>
  تعاني معظم بوتات التعدين على تيليجرام من هجمات الحسابات الوهمية (Sybil Attacks) التي تفرغ خزينة العملة دون فائدة حقيقية للمجتمع. لذلك يطبق نظام <strong>ROYAL ELITE X</strong> بروتوكول قفل سيادي إلزامي (Total Lockdown Gatekeeper) كشرط مسبق للدخول.
</p>

<div class="grid-dual avoid-break">
  <div class="feature-card">
    <h4>الخطوة الأولى: ربط المحفظة الخارجية</h4>
    <p>
      ربط محفظة TON غير احتجازية عبر بروتوكول TON Connect 2.0 المعتمد (مثل Tonkeeper أو MyTonWallet أو محفظة تيليجرام الرسمية). لا يُسمح بربط محفظة واحدة بأكثر من حساب تيليجرام نهائياً.
    </p>
  </div>
  <div class="feature-card">
    <h4>الخطوة الثانية: رسوم فتح البلاط (0.1 TON)</h4>
    <p>
      دفع رسم سيادي لمرة واحدة قيمته 0.1 TON عبر شبكة TON مباشرة إلى محفظة الإدارة. يضمن هذا الرسم الجدية ويستبعد الحسابات الوهمية والسكربتات المؤتمتة تماماً.
    </p>
  </div>
</div>

<h2>2. نظام القفل الشامل للمنصة (Total Lockdown Architecture)</h2>
<p>
  إذا لم يكمل المستخدم الخطوتين السابقتين بنجاح، يتم تفعيل القفل الشامل الآلي:
</p>
<ul>
  <li><strong>إخفاء شريط التنقل السفلي:</strong> لا يظهر شريط الأزرار مطلقاً للمستخدم غير المفعّل.</li>
  <li><strong>إخفاء بطاقة الخزينة والأرصدة:</strong> لا يستطيع المستخدم الاطلاع على الأرصدة أو أي أرقام داخلية.</li>
  <li><strong>إغلاق كافة الأقسام والصفحات:</strong> صفحات التعدين، المهام، السحب، ولوحة الأصدقاء مقفولة ومعزولة تماماً.</li>
  <li><strong>الحماية من جهة الخادم (Backend Protection):</strong> جميع استدعاءات API الخاصة بالتعدين والمهام والسحب محصنة وتتحقق من قيمة <span class="mono">is_activated = 1</span> قبل تنفيذ أي أمر برمجي.</li>
</ul>

<h2>3. رادار الأمان ومكافحة تعدد الحسابات (Anti-Sybil Radar)</h2>
<p>
  تم دمج محرك البصمة الرقمية <strong>FingerprintJS</strong> المطور لرصد بصمة الجهاز (Device Fingerprint) وعنوان IP في الخلفية. في حال رصد محاولة لفتح أكثر من حساب على نفس المتصفح أو الجهاز، يقوم النظام بحظر الحسابات المتكررة آلياً لمنع التلاعب.
</p>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 3 ═════════════════════════ -->
<h1><span>⛏️</span> الفصل الثالث: محرك التعدين السحابي وجدول المضاعفات</h1>

<h2>1. آلية عمل دورة الـ 24 ساعة</h2>
<p>
  يقوم نظام التعدين في ROYAL ELITE X على دورات شمسية مستمرة مدتها <strong>24 ساعة بالضبط</strong> (86,400 ثانية). خلال الدورة، يراقب المستخدم شريط التقدم اللحظي والعداد الزمني التنازلي التفاعلي الذي يعكس الأرباح المتراكمة بدقة.
</p>

<h2>2. جدول مضاعفات الرتب والسرعات (Holding Multipliers)</h2>
<p>
  لتحفيز شراء واحتفاظ العملة خارجياً على البلوكشين، يقوم النظام تلقائياً بقراءة رصيد محفظة المستخدم على شبكة TON وتطبيق مضاعف السرعة الفوري التالي:
</p>

<table>
  <thead>
    <tr>
      <th>الرتبة الملكية</th>
      <th>الرصيد المطلوب في المحفظة On-Chain</th>
      <th>المضاعف</th>
      <th>الإنتاج لكل ساعة</th>
      <th>الإنتاج لكل 24 ساعة</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>مواطن ملكي</strong> <span class="badge badge-gold">Citizen</span></td>
      <td>0 إلى 499 REX</td>
      <td><strong>1.0x</strong></td>
      <td>4.17 REX</td>
      <td><strong>100 REX</strong></td>
    </tr>
    <tr>
      <td><strong>فارس ملكي</strong> <span class="badge badge-cyan">Knight</span></td>
      <td>500 إلى 1,999 REX</td>
      <td><strong>2.0x</strong></td>
      <td>8.33 REX</td>
      <td><strong>200 REX</strong></td>
    </tr>
    <tr>
      <td><strong>بارون ملكي</strong> <span class="badge badge-cyan">Baron</span></td>
      <td>2,000 إلى 4,999 REX</td>
      <td><strong>4.0x</strong></td>
      <td>16.67 REX</td>
      <td><strong>400 REX</strong></td>
    </tr>
    <tr>
      <td><strong>دوق ملكي</strong> <span class="badge badge-gold">Duke</span></td>
      <td>5,000 إلى 14,999 REX</td>
      <td><strong>7.0x</strong></td>
      <td>29.17 REX</td>
      <td><strong>700 REX</strong></td>
    </tr>
    <tr>
      <td><strong>حوت البلاط</strong> <span class="badge badge-green">Whale</span></td>
      <td>15,000 REX فما فوق</td>
      <td><strong>15.0x</strong></td>
      <td>62.50 REX</td>
      <td><strong>1,500 REX</strong></td>
    </tr>
  </tbody>
</table>

<div class="callout-blue">
  <div class="callout-title">⚡ الترقية التلقائية الفورية</div>
  بمجرد شراء عملات REX على البلوكشين وإيداعها في محفظتك، يقرأ محرك السيرفر رصيدك فورياً ويرفع مضاعفك في الدورة التالية دون الحاجة لأي تدخل يدوي!
</div>

<h2>3. الواجهة التفاعلية ثلاثية الأبعاد (Interactive 3D Core)</h2>
<ul>
  <li><strong>العملة الفضائية:</strong> عملة ذهبية متحركة ثلاثية الأبعاد تتوسط حلقات مدارية كونية دوارة.</li>
  <li><strong>المؤثرات اللمسية والصوتية:</strong> عند لمس العملة، يُصدر النظام نبضات اهتزازية (Haptic Feedback)، نغمات سنثسايزر تفاعلية (Web Audio API)، وجزيئات ألعاب نارية متطايرة (Confetti).</li>
  <li><strong>زر الإجراء الديناميكي:</strong> يتحول الزر آلياً بين حالاته الثلاث (ابدأ التعدين ⚡ / جاري التعدين ⏳ / استلام الأرباح 🎁).</li>
</ul>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 4 ═════════════════════════ -->
<h1><span>📜</span> الفصل الرابع: المهام المتجددة وبرنامج السفراء</h1>

<h2>1. نظام المهام الملكية الدورية (Repeatable Quests)</h2>
<p>
  يتيح التطبيق مهاماً دورية تتيح للمستخدمين جمع مكافآت REX إضافية تعزز من رصيدهم، وتتجدد تلقائياً بعد انقضاء فترة التهدئة الخاصة بكل مهمة:
</p>

<table>
  <thead>
    <tr>
      <th>المهمة</th>
      <th>المكافأة (REX)</th>
      <th>فترة التجدد (Cooldown)</th>
      <th>نوع المهمة والهدف</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>تسجيل الحضور اليومي</strong></td>
      <td><strong>+50 REX</strong></td>
      <td>كل 24 ساعة</td>
      <td>مكافأة الاستمرارية والنشاط اليومي</td>
    </tr>
    <tr>
      <td><strong>صندوق الحظ الغامض</strong></td>
      <td><strong>+20 إلى +60 REX</strong></td>
      <td>كل 4 ساعات</td>
      <td>مكافأة حظ متغيرة لتشجيع العودة للتطبيق</td>
    </tr>
    <tr>
      <td><strong>شحنة الطاقة السحابية</strong></td>
      <td><strong>+35 REX</strong></td>
      <td>كل 6 ساعات</td>
      <td>شحنة مساعدة لتسريع نمو الرصيد</td>
    </tr>
    <tr>
      <td><strong>مشاركة البلاط في القنوات</strong></td>
      <td><strong>+75 REX</strong></td>
      <td>كل 12 ساعة</td>
      <td>توسيع الانتشار المجتمعي للمشروع</td>
    </tr>
  </tbody>
</table>

<h2>2. برنامج الشركاء والسفراء الملكي (Royal Ambassador Program)</h2>
<p>
  يقدم ROYAL ELITE X نظام إحالات سخي ومستمر يدعم نمو المجتمع بقوة:
</p>

<div class="grid-dual avoid-break">
  <div class="feature-card">
    <h4>مكافأة الانضمام الفورية</h4>
    <p>
      يحصل الفارس المستضيف على <strong>50 REX</strong> فورية تُضاف إلى حسابه بمجرد تسجيل صديقه عبر رابط الإحالة الخاص به وتفعيل حسابه.
    </p>
  </div>
  <div class="feature-card">
    <h4>عمولة ملكية 5% مدى الحياة</h4>
    <p>
      يحصل المستضيف على <strong>5% عمولة نقدية فورية</strong> من كل عملية جمع أرباح تعدين (Claim) يقوم بها الصديق المدعو إلى الأبد، مع إشعار تيليجرام لحظي.
    </p>
  </div>
</div>

<h2>3. منصة التتويج ولوحة الصدارة (Leaderboard Podium)</h2>
<p>
  يحتوي التطبيق على لوحة شرف ملكية ترتب المتصدرين بحسب إجمالي رصيدهم والمبالغ المُعدَّنة، وتبرز المراكز الثلاثة الأولى فوق منصة تتويج أولمبية ثلاثية الأبعاد (🥇 ذهبي، 🥈 فضي، 🥉 برونزي) مع التيجان المشعة لتعزيز روح المنافسة.
</p>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 5 ═════════════════════════ -->
<h1><span>📤</span> الفصل الخامس: بروتوكول السحب وشرط الاحتفاظ الـ 20%</h1>

<h2>1. القواعد المنظمة لعمليات السحب</h2>
<p>
  تخضع عمليات السحب من بوت ROYAL ELITE X إلى بروتوكول سيادي صارم ومحكم لضمان استقرار العملة وسلامة اقتصاد المنظومة:
</p>

<table>
  <thead>
    <tr>
      <th>المعيار</th>
      <th>الشرط الإلزامي</th>
      <th>آلية التطبيق والتحقق</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>الحد الأدنى للسحب</strong></td>
      <td><strong>5,000 REX</strong></td>
      <td>لا يُقبل أي طلب سحب يقل عن 5,000 عملة من رصيد البوت</td>
    </tr>
    <tr>
      <td><strong>شرط الاحتفاظ في المحفظة</strong></td>
      <td><strong>20% من قيمة السحب</strong></td>
      <td>يجب حيازة عملات REX حقيقية مشتراة ومحفوظة في المحفظة On-Chain</td>
    </tr>
    <tr>
      <td><strong>وجهة التحويل</strong></td>
      <td>محفظة TON المربوطة فقط</td>
      <td>التحويل يتم حصرياً لنفس المحفظة التي اجتازت فحص الملكية والأمان</td>
    </tr>
    <tr>
      <td><strong>فترة التنفيذ والاعتماد</strong></td>
      <td>24 إلى 48 ساعة</td>
      <td>مراجعة أمنية وموافقة إدارية لمنع الحسابات الاحتيالية</td>
    </tr>
  </tbody>
</table>

<h2>2. شرح تفصيلي لشرط الاحتفاظ بنسبة 20% في المحفظة (On-Chain Hold)</h2>
<div class="callout-red">
  <div class="callout-title">⚠️ توضيح جوهري لشرط الأمان</div>
  نسبة الـ 20% لا تُخصم من رصيد البوت، بل يجب أن يكون المستخدم قد قام بشرائها واحتفظ بها بالفعل كأصل حقيقي داخل محفظته الخارجية (مثل Tonkeeper) على شبكة TON Blockchain.
</div>

<p>
  <strong>أمثلة حسابية توضيحية:</strong>
</p>
<ul>
  <li><strong>مثال 1:</strong> إذا رغب المستخدم في سحب <strong>5,000 REX</strong> من البوت، يجب أن تمتلك محفظته الخارجية ما لا يقل عن <strong>1,000 REX</strong> (أي 20% من 5,000).</li>
  <li><strong>مثال 2:</strong> إذا رغب المستخدم في سحب <strong>10,000 REX</strong> من البوت، يجب أن تمتلك محفظته الخارجية ما لا يقل عن <strong>2,000 REX</strong> (أي 20% من 10,000).</li>
  <li><strong>مثال 3:</strong> إذا رغب المستخدم في سحب <strong>50,000 REX</strong> من البوت، يجب أن تمتلك محفظته الخارجية ما لا يقل عن <strong>10,000 REX</strong> (أي 20% من 50,000).</li>
</ul>

<h2>3. الفحص البرمجي التلقائي اللحظي</h2>
<p>
  عند قيام المستخدم بإدخال مبلغ السحب، يقوم الكود البرمجي بالتحقق اللحظي عبر استدعاء عقد الجيتون من خادم <strong>TonCenter RPC</strong>:
</p>
<ul>
  <li>إذا كان الرصيد الخارجي كافياً: يُضاء مؤشر السحب باللون الأخضر ويُتاح زر <strong>"تأكيد طلب السحب"</strong>.</li>
  <li>إذا كان الرصيد الخارجي غير كافٍ: يُظهر النظام رسالة واضحة تخبر المستخدم بالمبلغ الناقص في محفظته بدقة، مع توفير زر سريع للشراء المباشر عبر منصات TON.</li>
</ul>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 6 ═════════════════════════ -->
<h1><span>👑</span> الفصل السادس: غرفة العمليات المركزية (Admin Dashboard)</h1>

<h2>1. نظرة عامة على لوحة التحكم</h2>
<p>
  تم بناء لوحة تحكم إدارية متكاملة وسحابية (Institutional Admin Command Center) تعمل عبر مسار <span class="mono">/admin/</span>، ومحمية بنظام توثيق سري (<span class="mono">REX_ADMIN_2026</span>) ومشفر بالكامل عبر ترويسات HTTP الآمنة.
</p>

<h2>2. الميزات والإمكانيات الإدارية المتاحة للقائد:</h2>

<div class="grid-dual avoid-break">
  <div class="feature-card">
    <h4>📊 لوحة الإحصائيات الحية (Live KPIs)</h4>
    <p>
      متابعة فورية لحظية لـ 8 مؤشرات رئيسية: إجمالي المستخدمين، الحسابات المفعّلة، المتعدنين النشطين، المحظورين، إجمالي REX في البوت، إجمالي المُعدَّن، وإجمالي المسحوبات.
    </p>
  </div>
  <div class="feature-card">
    <h4>🔍 فاحص الحسابات الشامل (User Inspector)</h4>
    <p>
      البحث عن أي مستخدم بالاسم أو اليوزرنيم أو Telegram ID، استعراض محفظته ورصيده On-Chain، تعديل رصيده، إضافة مكافآت، تصفير التعدين، حظر وفك حظر الحساب.
    </p>
  </div>
  <div class="feature-card">
    <h4>✉️ نظام المراسلة الخاصة للمستخدمين</h4>
    <p>
      إمكانية إرسال رسائل خاصة مباشرة وموجهة من البوت إلى أي مستخدم محدد على تيليجرام بنقرة زر واحدة عبر واجهة لوحة التحكم.
    </p>
  </div>
  <div class="feature-card">
    <h4>🛡️ رادار مكافحة الحسابات الوهمية (Anti-Sybil)</h4>
    <p>
      كشف الأجهزة المشتركة (بصمات المتصفح المكررة) وشبكات IP المشبوهة، مع زر "حظر الكل" بنقرة واحدة لحماية الخزينة من الاستنزاف.
    </p>
  </div>
  <div class="feature-card">
    <h4>⚙️ تعديل قواعد الاقتصاد لحظياً</h4>
    <p>
      التحكم الفوري في: الحد الأدنى للسحب، نسبة الاحتفاظ (20%)، رسوم التفعيل (0.1 TON)، والمكافأة اليومية الأساسية من اللوحة دون إعادة تشغيل الخادم.
    </p>
  </div>
  <div class="feature-card">
    <h4>📢 نظام الإذاعة والبث الجماعي (Broadcast)</h4>
    <p>
      إرسال رسائل وإشعارات وتحديثات رسمية لجميع المسجلين في البوت دفعة واحدة وبسرعة فائقة مع دعم كامل لتنسيق Markdown.
    </p>
  </div>
</div>

<h2>3. جدول مراجعة السحوبات وإدارتها</h2>
<p>
  توفر اللوحة قسماً مخصصاً لطلبات السحب المعلقة، يعرض رقم الطلب، اسم المستخدم، يوزرنيم تيليجرام، المبلغ المطلوب، عنوان المحفظة الخارجي، وتاريخ الطلب، مع خيارين مباشرين:
</p>
<ul>
  <li><strong>قبول السحب (Approve):</strong> اعتماد العملية، خصم الرصيد، وإرسال إشعار مباركة وتأكيد فوري للمستخدم على تيليجرام.</li>
  <li><strong>رفض السحب (Reject):</strong> رفض العملية وإعادة الرصيد المسحوب كاملاً لحساب المستخدم في البوت مع إرسال إشعار توضيحي.</li>
</ul>

<div class="page-break"></div>

<!-- ═════════════════════════ CHAPTER 7 ═════════════════════════ -->
<h1><span>💻</span> الفصل السابع: البنية البرمجية والروابط الرسمية</h1>

<h2>1. التقنيات والمكتبات المستخدمة (Technology Stack)</h2>
<table>
  <thead>
    <tr>
      <th>المكون البرمجي</th>
      <th>التقنية المستخدمة</th>
      <th>الوظيفة والدور في المنظومة</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>خادم الويب والـ API</strong></td>
      <td>Node.js v24 + Express</td>
      <td>معالجة الطلبات العالية وتوفير واجهات RESTful سريعة</td>
    </tr>
    <tr>
      <td><strong>محرك التيليجرام</strong></td>
      <td>Telegraf.js Framework</td>
      <td>إدارة البوت، رسائل /start، الأوامر، والإشعارات المباشرة</td>
    </tr>
    <tr>
      <td><strong>قاعدة البيانات</strong></td>
      <td>SQLite3 (WAL Mode + ACID)</td>
      <td>تخزين فائق السرعة وموثوق للبيانات مع قفل متزامن محكم</td>
    </tr>
    <tr>
      <td><strong>التفاعل مع البلوكشين</strong></td>
      <td>@ton/ton + TonClient RPC</td>
      <td>فحص عقود الجيتون الذكية وأرصدة المحافظ اللحظية</td>
    </tr>
    <tr>
      <td><strong>بروتوكول المحافظ</strong></td>
      <td>TON Connect UI 2.0</td>
      <td>ربط سلس وآمن مع محافظ Tonkeeper و MyTonWallet و Telegram</td>
    </tr>
    <tr>
      <td><strong>نفق الاتصال الآمن</strong></td>
      <td>Cloudflare Tunnel HTTPS</td>
      <td>حماية ضد هجمات DDoS وتأمين الاتصال المشفر عبر TLS</td>
    </tr>
    <tr>
      <td><strong>البصمة الرقمية</strong></td>
      <td>FingerprintJS Engine</td>
      <td>رصد الأجهزة المتعددة ومنع التلاعب والحسابات الوهمية</td>
    </tr>
    <tr>
      <td><strong>المؤثرات التفاعلية</strong></td>
      <td>Web Audio API + Canvas Confetti</td>
      <td>توليد نغمات صوتية واحتفالات بصرية ثلاثية الأبعاد دون ملفات ثقيلة</td>
    </tr>
  </tbody>
</table>

<h2>2. الروابط الرسمية والمعلومات التشغيلية</h2>
<ul>
  <li><strong>البوت الرسمي على تيليجرام:</strong> <a href="https://t.me/Royalelitexbot" style="color:#b45309;font-weight:700;">@Royalelitexbot</a></li>
  <li><strong>رابط تطبيق التعدين المصغر (WebApp Live):</strong><br>
    <span class="mono">https://wires-clerk-scsi-merchants.trycloudflare.com</span>
  </li>
  <li><strong>رابط لوحة تحكم الإدارة (Command Center):</strong><br>
    <span class="mono">https://wires-clerk-scsi-merchants.trycloudflare.com/admin/</span>
  </li>
  <li><strong>كلمة سر الإدارة السرية:</strong> <span class="mono">REX_ADMIN_2026</span></li>
  <li><strong>مستكشف بلوكشين TON الرسمي (TonViewer Explorer):</strong><br>
    <a href="https://tonviewer.com/EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53" style="color:#0284c7;font-size:9pt;font-family:monospace;">https://tonviewer.com/EQBSYVo_WE0fAlAWUSec1o42x1LiYKNFOCoaxb8Dz_vsU_53 ↗</a>
  </li>
</ul>

<div class="callout" style="margin-top:12mm; text-align:center;">
  <strong>خاتمة واعتماد البلاط الملكي</strong><br>
  تم إعداد هذا المستند الفني ليكون الدليل المرجعي الكامل والموثق لمشروع ROYAL ELITE X.<br>
  جميع الحقوق محفوظة لمنظومة البلاط الملكي © 2026.
</div>

</body>
</html>
"""

# Output paths
output_pdf_public = r"C:\Users\wael1\.gemini\antigravity\scratch\royal-elite-x\bot\public\ROYAL_ELITE_X_Whitepaper_and_Guide.pdf"
output_pdf_artifact = r"C:\Users\wael1\.gemini\antigravity\brain\2afaa034-6897-4524-ae44-9b80cf6cf65e\ROYAL_ELITE_X_Whitepaper_and_Guide.pdf"

print("Starting PDF generation via Playwright Edge...")
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        headless=True
    )
    page = browser.new_page()
    page.set_content(html_content, wait_until="networkidle")
    
    # Generate PDF in public directory
    page.pdf(
        path=output_pdf_public,
        format="A4",
        print_background=True,
        margin={"top": "16mm", "bottom": "16mm", "left": "14mm", "right": "14mm"}
    )
    
    # Also generate in artifact directory
    page.pdf(
        path=output_pdf_artifact,
        format="A4",
        print_background=True,
        margin={"top": "16mm", "bottom": "16mm", "left": "14mm", "right": "14mm"}
    )
    
    browser.close()

print(f"[SUCCESS] PDF successfully generated at:\n1. {output_pdf_public}\n2. {output_pdf_artifact}")
