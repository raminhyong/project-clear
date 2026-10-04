/* =========================================================
   CLEAR Space — Data layer
   A4 page generator, curated books, room-scoped seeds.
   Loaded before space.js (classic scripts share global scope).
   ========================================================= */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function xmlEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatRelativeTimeTH(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'วันนี้';
  if (diffDays === 1) return 'เมื่อวาน';
  if (diffDays < 7) return diffDays + ' วันที่แล้ว';
  if (diffDays < 30) return Math.floor(diffDays / 7) + ' สัปดาห์ที่แล้ว';
  return Math.floor(diffDays / 30) + ' เดือนที่แล้ว';
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.readAsDataURL(file);
  });
}

/* ── A4 SVG Page Generator (Graphic-Novel Layout, 210 x 297 mm) ── */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM;

function createA4PageSVG(o) {
  const w = 840;
  const h = 1188;
  const title = o.title || '';
  const subtitle = o.subtitle || '';
  const author = o.author || '';
  const chapter = o.chapter || '';
  const verses = o.verses || '';
  const themeGrad = o.themeGrad || '<stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#0f172a"/>';
  const accentColor = o.accentColor || '#10b981';
  const iconFa = o.iconFa || '📖';
  let content = '';

  if (o.isCover) {
    content = `
      <rect width="${w}" height="${h}" fill="url(#coverGrad)" rx="8"/>
      <rect x="36" y="36" width="${w - 72}" height="${h - 72}" fill="none" stroke="${accentColor}" stroke-width="3" stroke-dasharray="12,6" opacity="0.45" rx="6"/>
      <rect x="48" y="48" width="${w - 96}" height="${h - 96}" fill="none" stroke="${accentColor}" stroke-width="1.5" opacity="0.75" rx="4"/>
      <rect x="${w/2 - 130}" y="120" width="260" height="42" rx="21" fill="rgba(0,0,0,0.5)" stroke="${accentColor}" stroke-width="1.5"/>
      <text x="${w/2}" y="147" font-family="'Sarabun', sans-serif" font-size="20" font-weight="700" fill="${accentColor}" text-anchor="middle">วรรณคดีวิจักษ์ ม.6</text>
      <text x="${w/2}" y="280" font-family="'Sarabun', sans-serif" font-size="52" font-weight="800" fill="#ffffff" text-anchor="middle">${xmlEsc(title)}</text>
      <text x="${w/2}" y="335" font-family="'Sarabun', sans-serif" font-size="26" font-weight="500" fill="#e2e8f0" text-anchor="middle">${xmlEsc(subtitle)}</text>
      <circle cx="${w/2}" cy="580" r="170" fill="rgba(0,0,0,0.4)" stroke="${accentColor}" stroke-width="4"/>
      <circle cx="${w/2}" cy="580" r="156" fill="rgba(255,255,255,0.06)" stroke="${accentColor}" stroke-width="1" stroke-dasharray="6,4"/>
      <text x="${w/2}" y="595" font-family="'Sarabun', sans-serif" font-size="78" fill="${accentColor}" text-anchor="middle" dominant-baseline="middle">${iconFa}</text>
      <rect x="100" y="800" width="${w - 200}" height="150" rx="14" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.15)"/>
      <text x="${w/2}" y="845" font-family="'Sarabun', sans-serif" font-size="22" font-style="italic" fill="#f8fafc" text-anchor="middle">"${xmlEsc(verses || 'ลำนำกวีสะท้อนภูมิปัญญา ถ่ายทอดสู่คอมมิกวรรณคดี')}"</text>
      <text x="${w/2}" y="885" font-family="'Sarabun', sans-serif" font-size="18" fill="${accentColor}" text-anchor="middle">— สาระการเรียนรู้ภาษาไทย ชั้นมัธยมศึกษาปีที่ 6 —</text>
      <text x="${w/2}" y="1030" font-family="'Sarabun', sans-serif" font-size="22" font-weight="600" fill="#ffffff" text-anchor="middle">ผู้จัดทำ: ${xmlEsc(author)}</text>
      <text x="${w/2}" y="1070" font-family="'Sarabun', sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">Project CLEAR Space • Digital Library</text>
    `;
  } else {
    const bodyTexts = o.bodyTexts || [];
    const bodyLines = bodyTexts.map((txt, i) => `
      <text x="75" y="${320 + (i * 44)}" font-family="'Sarabun', sans-serif" font-size="24" fill="#1e293b">${xmlEsc(txt)}</text>
    `).join('');

    const verseLines = verses ? `
      <rect x="65" y="660" width="${w - 130}" height="240" rx="12" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>
      <rect x="65" y="660" width="8" height="240" rx="4" fill="${accentColor}"/>
      <text x="95" y="710" font-family="'Sarabun', sans-serif" font-size="22" font-weight="700" fill="${accentColor}">บทกวีและคำกลอนคัดสรร:</text>
      <text x="95" y="760" font-family="'Sarabun', sans-serif" font-size="23" font-style="italic" fill="#0f172a">${xmlEsc(verses)}</text>
    ` : '';

    content = `
      <rect width="${w}" height="${h}" fill="#ffffff"/>
      <rect x="25" y="25" width="${w - 50}" height="${h - 50}" fill="#fcfcfd" stroke="#e2e8f0" stroke-width="1.5" rx="6"/>
      <text x="75" y="70" font-family="'Sarabun', sans-serif" font-size="17" font-weight="600" fill="#94a3b8" letter-spacing="1">PROJECT CLEAR • E-BOOK SPACE</text>
      <text x="${w - 75}" y="70" font-family="'Sarabun', sans-serif" font-size="17" font-weight="600" fill="${accentColor}" text-anchor="end">${xmlEsc(chapter)}</text>
      <line x1="75" y1="88" x2="${w - 75}" y2="88" stroke="#e2e8f0" stroke-width="1.5"/>
      <rect x="75" y="130" width="8" height="48" rx="4" fill="${accentColor}"/>
      <text x="98" y="170" font-family="'Sarabun', sans-serif" font-size="38" font-weight="800" fill="#0f172a">${xmlEsc(title)}</text>
      <text x="98" y="215" font-family="'Sarabun', sans-serif" font-size="20" font-weight="500" fill="#64748b">${xmlEsc(subtitle)}</text>
      ${bodyLines}
      ${verseLines}
      <line x1="75" y1="${h - 85}" x2="${w - 75}" y2="${h - 85}" stroke="#e2e8f0" stroke-width="1.5"/>
      <text x="75" y="${h - 50}" font-family="'Sarabun', sans-serif" font-size="18" fill="#94a3b8">${xmlEsc(author)}</text>
      <text x="${w - 75}" y="${h - 50}" font-family="'Sarabun', sans-serif" font-size="19" font-weight="700" fill="#0f172a" text-anchor="end">${o.pageNum} / ${o.totalPages}</text>
    `;
  }

  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="coverGrad" x1="0%" y1="0%" x2="100%" y2="100%">${themeGrad}</linearGradient></defs>
      ${content}
    </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
}

/* ── Curated Thai Literature Comic Books (scoped by room slug) ── */
const BOOKS_DATA = [
  {
    id: 0, roomSlug: "61-k9f2",
    title: "นิทานเวตาล ฉบับการ์ตูนช่อง",
    subtitle: "ปริศนาเรื่องที่ 10 • บททดสอบปัญญาศพเวตาล",
    author: "ม.6/1 (กลุ่มที่ 3)", createdAt: "2026-10-02T10:00:00Z", colorClass: "card-purple",
    desc: "การ์ตูนเล่าเรื่องปริศนาเวตาลเรื่องที่ 10 เมื่อพระวิกรมาทิตย์ต้องตอบปัญหาศพเวตาลในป่าช้าอันมืดมิด",
    pages: [
      { isCover: true, title: "นิทานเวตาล", subtitle: "ฉบับการ์ตูนช่อง • ปริศนาเรื่องที่ 10", author: "ม.6/1 (กลุ่มที่ 3)", themeGrad: '<stop offset="0%" stop-color="#1e1b4b"/><stop offset="60%" stop-color="#312e81"/><stop offset="100%" stop-color="#0f172a"/>', accentColor: "#a5b4fc", verses: "หากพระองค์ตรัสสิ่งใดออกมา แม้เพียงคำเดียว ข้าจะบินกลับสู่ต้นอโศกทันที!", iconFa: "🦇" },
      { title: "ตอนที่ 1: ณ ป่าช้าอันมืดมิด", subtitle: "พระวิกรมาทิตย์และศพเวตาล", chapter: "ฉากเปิดเรื่อง", bodyTexts: ["ในคืนเดือนมืดอันเงียบสงัด พระวิกรมาทิตย์และพระธรรมวัชเสด็จสู่ป่าช้า", "เพื่อปลดศพเวตาลที่ห้อยอยู่บนต้นอโศกตามบัญชาของโยคีศานติศีล", "เวตาลผู้มีปัญญาเฉียบแหลมรู้ทัน จึงเริ่มกล่าวเล่านิทานชวนฉงน", "เพื่อล่อลวงให้พระราชาตรัสตอบและทำลายพันธสัญญาแห่งความเงียบ..."], verses: "พระราชาทรงนิ่งตั้งสติ แบกศพไว้บนพระอังสาอย่างแน่วแน่", pageNum: 2, totalPages: 8, accentColor: "#6366f1", author: "ม.6/1 (กลุ่มที่ 3)" },
      { title: "ตอนที่ 2: สองพ่อลูกและสองแม่ลูก", subtitle: "การพบกันกลางพงไพร", chapter: "ปมความสัมพันธ์", bodyTexts: ["ท้าวยโสธรและพระโอรส เสด็จประพาสป่าจนพบรอยเท้านารีสองคู่", "รอยเท้าหนึ่งเล็ก รอยเท้าหนึ่งใหญ่ ทรงตกลงสัญญากันว่า:", "พระบิดาจะอภิเษกกับหญิงผู้มีรอยเท้าใหญ่ พระโอรสจะอภิเษกกับหญิงรอยเท้าเล็ก", "แต่เมื่อพบตัวจริง ปรากฏว่ามารดามีเท้าเล็ก ส่วนธิดากลับมีเท้าใหญ่!"], verses: "คำสัญญากลับตาลปัตร บิดาได้บุตรสาว โอรสได้มารดาเป็นชายา", pageNum: 3, totalPages: 8, accentColor: "#6366f1", author: "ม.6/1 (กลุ่มที่ 3)" },
      { title: "ตอนที่ 3: กำเนิดทายาทสับสน", subtitle: "ปมปริศนาทวีความซับซ้อน", chapter: "ปัญหาครอบครัว", bodyTexts: ["กาลเวลาผ่านไป ทั้งสองคู่ต่างให้กำเนิดพระโอรสและพระธิดา", "สายโลหิตของทั้งสองสายเริ่มเกี่ยวพันจนยากจะอธิบาย", "เวตาลจึงหยุดเล่า แล้วหันมาถามพระวิกรมาทิตย์ด้วยเสียงเย้ยหยัน:", "'ข้าแต่พระราชา เด็กเหล่านั้นที่เกิดมา จะนับญาติกันอย่างไรเล่า?'"], verses: "พี่น้องหรือน้านหลาน ลุงป้าหรือลูกตา ปริศนายากหยั่งถึง!", pageNum: 4, totalPages: 8, accentColor: "#6366f1", author: "ม.6/1 (กลุ่มที่ 3)" },
      { title: "ตอนที่ 4: ชัยชนะแห่งปัญญา", subtitle: "ความเงียบคืออาวุธที่ทรงพลังที่สุด", chapter: "บทสรุป", bodyTexts: ["พระวิกรมาทิตย์ทรงครุ่นคิด พระองค์ทรงทราบคำตอบอันซับซ้อนดี", "แต่ทรงระลึกได้ถึงคำเตือนของเวตาลว่า 'หากตรัสออกมา เวตาลจะหนีไป'", "พระราชาจึงทรงนิ่งสงบ ไม่ยอมเอ่ยพระวาจาแม้แต่คำเดียว", "เวตาลจนด้วยปัญญา ไม่อาจหลบหนีได้อีก จึงยอมจำนนต่อพระองค์ในที่สุด!"], verses: "สติคุ้มครองตน ปัญญาระงับวจี คือยอดวีรบุรุษผู้พิชิต", pageNum: 5, totalPages: 8, accentColor: "#6366f1", author: "ม.6/1 (กลุ่มที่ 3)" },
      { title: "ถอดบทเรียน: คุณค่าทางวรรณศิลป์", subtitle: "การวิเคราะห์โครงเรื่องและอุบายวรรณคดี", chapter: "บทวิจักษ์", bodyTexts: ["1. โครงเรื่องซ้อนโครงเรื่อง (Frame Story) สร้างความน่าติดตามอย่างชาญฉลาด", "2. การประลองปัญญาสอนเรื่องการยับยั้งชั่งใจและการรักษาคำมั่นสัญญา", "3. สะท้อนว่า 'การพูดมีค่าดั่งเงิน แต่ความนิ่งเงียบในกาลที่ควรมีค่าดั่งทองคำ'", "4. กิจกรรมโครงงานการ์ตูนช่องภาษาไทย ม.6 โรงเรียนพัฒนาการเรียนรู้"], verses: "นิทานเวตาล พระราชนิพนธ์ กรมหมื่นพิทยาลงกรณ์ (น.ม.ส.)", pageNum: 6, totalPages: 8, accentColor: "#6366f1", author: "ม.6/1 (กลุ่มที่ 3)" }
    ]
  },
  {
    id: 1, roomSlug: "62-m4x7",
    title: "พระอภัยมณี ตอนศึกเก้าทัพ",
    subtitle: "ภาพประกอบโคลงกลอน • เสียงปี่สะท้านคลื่นสมุทร",
    author: "ม.6/2 (กลุ่มที่ 1)", createdAt: "2026-10-01T14:30:00Z", colorClass: "card-green",
    desc: "ภาพวาดประกอบโคลงกลอนสุนทรภู่ ฉากกองทัพเมืองผลึกประจันบาน และอานุภาพเสียงปี่แก้ว",
    pages: [
      { isCover: true, title: "พระอภัยมณี", subtitle: "ตอน ศึกเก้าทัพ & เสียงปี่สะท้านคลื่น", author: "ม.6/2 (กลุ่มที่ 1)", themeGrad: '<stop offset="0%" stop-color="#064e3b"/><stop offset="60%" stop-color="#047857"/><stop offset="100%" stop-color="#022c22"/>', accentColor: "#6ee7b7", verses: "พระโหยหวนครวญเพลงวังเวงจิต ให้คนคิดถึงถิ่นถวิลหวัง", iconFa: "🪈" },
      { title: "บทที่ 1: กองทัพประจัญบาน", subtitle: "การศึกเมืองผลึกอันดุเดือด", chapter: "สมรภูมิรบ", bodyTexts: ["กองเรือทัพศัตรูเข้าล้อมประชิด พระอภัยมณีทรงนำปี่แก้ววิเศษขึ้นประทับ", "บนยอดเนินสูงริมฝั่ง ทรงสูดลมปราณเข้าสู่ทรวงอกลึก", "ก่อนจะเริ่มบรรเลงเพลงปี่มนตราที่ไม่มีผู้ใดในสามโลกต้านทานได้", "เสียงดนตรีสะท้อนผิวน้ำ กังวานไปทั่วผืนมหาสมุทรอันกว้างใหญ่..."], verses: "วังเวงจิตคิดถึงถิ่นถวิลหวัง โอ้จากเรือนเหมือนนกที่พลัดรัง", pageNum: 2, totalPages: 6, accentColor: "#10b981", author: "ม.6/2 (กลุ่มที่ 1)" },
      { title: "บทที่ 2: มนต์สะกดแห่งเสียงดนตรี", subtitle: "ไพร่พลหลับใหลไร้การต่อสู้", chapter: "อานุภาพปี่แก้ว", bodyTexts: ["ทหารหาญนับหมื่นที่กำอาวุธแน่น เริ่มรู้สึกเคลิบเคลิ้มอ่อนเปลี้ย", "ดาบและหอกหลุดจากมือ ทหารต่างทรุดตัวลงนอนหลับใหลไปทั้งกองทัพ", "สุนทรภู่แสดงให้เห็นถึงอำนาจของ 'ศิลปะและดนตรี' ที่เหนือกว่าศาสตราวุธ", "ชัยชนะที่ได้มาโดยไม่ต้องหลั่งเลือดแม้แต่หยดเดียว!"], verses: "ทั้งไพร่พลหลับทับกันสลอน ไร้อาวุธรอนรานผลาญชีวา", pageNum: 3, totalPages: 6, accentColor: "#10b981", author: "ม.6/2 (กลุ่มที่ 1)" },
      { title: "บทที่ 3: ข้อคิดวรรณกรรม", subtitle: "สันติวิธีและสุนทรียศาสตร์ของสุนทรภู่", chapter: "บทสรุปคุณค่า", bodyTexts: ["วรรณคดีชิ้นเอกของกวีเอกสุนทรภู่ ได้รับการยกย่องจาก UNESCO", "สะท้อนคุณธรรมเรื่องการเจรจาและการใช้ปัญญามากกว่ากำลัง", "ภาพวาดประกอบชุดนี้สร้างสรรค์โดยนักเรียนชั้น ม.6/2 แผนกศิลป์-ภาษา", "ผลงานบูรณาการวิชาภาษาไทยและศิลปกรรมดิจิทัล 2569"], verses: "สดุดีครูกลอนสุนทรภู่ ผู้สร้างตำนานแห่งจินตนาการไทย", pageNum: 4, totalPages: 6, accentColor: "#10b981", author: "ม.6/2 (กลุ่มที่ 1)" }
    ]
  },
  {
    id: 2, roomSlug: "65-w1c8",
    title: "มัทนะพาธา ตำนานดอกกุหลาบ",
    subtitle: "บทละครพูดคำฉันท์ • พระราชนิพนธ์ ร.6",
    author: "ม.6/5 (กลุ่มที่ 4)", createdAt: "2026-09-30T09:15:00Z", colorClass: "card-pink",
    desc: "บทละครพูดคำฉันท์ วรรณคดีพระราชนิพนธ์ ร.6 ถ่ายทอดเป็นคอมมิกมังงะ ความเจ็บปวดแห่งรักแท้",
    pages: [
      { isCover: true, title: "มัทนะพาธา", subtitle: "ตำนานแห่งดอกกุหลาบ • มังงะคอมมิก", author: "ม.6/5 (กลุ่มที่ 4)", themeGrad: '<stop offset="0%" stop-color="#831843"/><stop offset="60%" stop-color="#be185d"/><stop offset="100%" stop-color="#500724"/>', accentColor: "#fbcfe8", verses: "ความรักเหมือนโรคา บันดาลตาให้มืดมน ไม่ยินและไม่ยล อุปสัคคะใดใด", iconFa: "🌹" },
      { title: "องก์ที่ 1: แดนสวรรค์และคำปฏิเสธ", subtitle: "สุเทษณ์เทพบุตรและนางฟ้ามัทนา", chapter: "จุดกำเนิดคำสาป", bodyTexts: ["สุเทษณ์เทพบุตรทรงหลงรักนางฟ้ามัทนาอย่างยิ่ง แต่เมื่อตรัสถามความรัก", "มัทนานางฟ้าผู้ซื่อตรงต่อหัวใจตนเองได้ทูลตอบอย่างสุภาพว่า:", "'หม่อมฉันมิอาจปดว่ารัก ในเมื่อใจมิได้มีรักต่อพระองค์'", "ความพิโรธทำให้สุเทษณ์สาปให้นางจุติลงไปเป็นดอกไม้ในโลกมนุษย์..."], verses: "ไม่อาจรักตอบได้ หากใจไร้ซึ่งเสน่หา แม้เป็นเทพบุตรผู้ยิ่งใหญ่", pageNum: 2, totalPages: 6, accentColor: "#ec4899", author: "ม.6/5 (กลุ่มที่ 4)" },
      { title: "องก์ที่ 2: กำเนิดดอกกุพชกะ", subtitle: "ดอกไม้ที่มีหนามแหลมคมแต่กลิ่นหอม", chapter: "ตำนานดอกกุหลาบ", bodyTexts: ["มัทนาเลือกเกิดเป็น 'ดอกกุพชกะ' (ดอกกุหลาบ) ซึ่งจะกลายร่างเป็นมนุษย์", "ได้เฉพาะในคืนวันเพ็ญเพียงคืนเดียวเท่านั้น ยกเว้นแต่จะมีความรักแท้", "ดอกกุหลาบจึงเป็นตัวแทนของความรักที่งดงาม หอมหวาน", "แต่ทว่าแฝงไปด้วยหนามแหลมคมอันเป็นเครื่องเตือนใจถึงความเจ็บปวด"], verses: "ความรักที่แท้จริงคือความบริสุทธิ์ มิอาจบังคับครอบครองได้", pageNum: 3, totalPages: 6, accentColor: "#ec4899", author: "ม.6/5 (กลุ่มที่ 4)" },
      { title: "บทวิเคราะห์: คุณค่าเชิงปรัชญา", subtitle: "ความรักคือความเสียสละ มิใช่การผูกขาด", chapter: "บทสรุปคุณค่า", bodyTexts: ["พระบาทสมเด็จพระมงกุฎเกล้าเจ้าอยู่หัวทรงพระราชนิพนธ์ด้วยฉันท์หลากหลายชนิด", "แสดงให้เห็นว่าความรักที่เกิดจากตัณหาความอยากได้ ย่อมนำมาซึ่งความทุกข์ระทม", "ผลงานการ์ตูนช่องของกลุ่ม 4 ม.6/5 ถ่ายทอดภาพวาดสไตล์นีโอคลาสสิก", "ได้รับรางวัลผลงานสร้างสรรค์ดีเด่นประจำห้องเรียน CLEAR"], verses: "วรรณคดีสโมสรยกย่องให้เป็นยอดแห่งบทละครพูดคำฉันท์", pageNum: 4, totalPages: 6, accentColor: "#ec4899", author: "ม.6/5 (กลุ่มที่ 4)" }
    ]
  },
  {
    id: 3, roomSlug: "68-p7y2",
    title: "กาพย์เห่เรือ ลำนำสายน้ำ",
    subtitle: "เจ้าฟ้าธรรมาธิเบศร์ (เจ้าฟ้ากุ้ง) • ขบวนพยุหยาตรา",
    author: "ม.6/8 (กลุ่มที่ 2)", createdAt: "2026-09-28T16:00:00Z", colorClass: "card-blue",
    desc: "รวบรวมภาพประกอบขบวนพยุหยาตราและเห่ชมปลา ชมไม้ ชมนก พร้อมคำแปลและเสียงสัมผัสกวี",
    pages: [
      { isCover: true, title: "กาพย์เห่เรือ", subtitle: "ลำนำสายน้ำเจ้าพระยา • มนต์กวีอยุธยา", author: "ม.6/8 (กลุ่มที่ 2)", themeGrad: '<stop offset="0%" stop-color="#0c4a6e"/><stop offset="60%" stop-color="#0284c7"/><stop offset="100%" stop-color="#082f49"/>', accentColor: "#7dd3fc", verses: "สุวรรณหงส์ทรงพู่ห้อย งามชดช้อยลอยหลังสินธุ์ เพียงหงส์ทรงพรหมินทร์ ลินลาศเลื่อนเตือนตาชม", iconFa: "⛵" },
      { title: "บทเห่ชมเรือกระบวน", subtitle: "ความงดงามแห่งขบวนชลมารค", chapter: "พยุหยาตรา", bodyTexts: ["ปางเสด็จประเวศด้าว ชลมารค ทรงเรือต้นงามเฉิดฉาย กิ่งแก้วแพร้วพรรณราย", "เรือครุฑยุดนาคหิ้ว ลิ่วลอยมาในสาคร พายอ่อนหยับจับงามงอน สลอนสาครลั่นครั่นครื้นฟอง", "กวีบรรยายภาพขบวนเรือพระที่นั่งได้อย่างวิจิตรอลังการ", "เสียงฝีพายและบทขับเห่สอดรับกันเป็นจังหวะสะกดใจผู้ฟัง..."], verses: "นาวาแน่นเป็นขนัด ล้วนรูปสัตว์แสนยากร เรือริ้วทิวธงสลอน", pageNum: 2, totalPages: 6, accentColor: "#0284c7", author: "ม.6/8 (กลุ่มที่ 2)" },
      { title: "บทเห่ชมปลาและสายนที", subtitle: "ธรรมชาติอันรื่นรมย์และความคำนึง", chapter: "สุนทรียภาพธรรมชาติ", bodyTexts: ["พิศพรรณปลาว่ายเคล้า คลึงกัน ถวิลสุดาบพิตรพลัน สวาทเศร้า", "นวลจันทร์เป็นนวลจริง เจ้างามพริ้งยิ่งนวลปลา คางเบือนเบือนหน้ามา ไม่งามเท่าเจ้าเบือนชาย", "กวีใช้การเล่นคำพ้องเสียงเปรียบเทียบชื่อปลากับหญิงที่รัก", "ถ่ายทอดอารมณ์ความเหงาและความคิดถึงได้อย่างประณีตยิ่ง"], verses: "มัสยาน่าชมชื่น แหวกว่ายคลื่นในคงคา ดั่งใจคิดถึงกานดา", pageNum: 3, totalPages: 6, accentColor: "#0284c7", author: "ม.6/8 (กลุ่มที่ 2)" },
      { title: "บทสรุป: คุณค่าทางวรรณศิลป์", subtitle: "แบบแผนการขับเห่เรือหลวงแห่งกรุงรัตนโกสินทร์", chapter: "มรดกวัฒนธรรม", bodyTexts: ["กาพย์เห่เรือของเจ้าฟ้ากุ้ง เป็นต้นแบบแห่งการเห่เรือพระราชพิธีจนถึงปัจจุบัน", "โดดเด่นด้วยการใช้สัมผัสสระและสัมผัสอักษรอย่างแพรวพราว", "ทีมงานนักเรียน ม.6/8 ได้นำภาพเรือพระราชพิธีจำลองมาผสานเข้ากับตัวอักษรไทย", "เปิดอ่านเสมือนได้ร่วมล่องเรือชมลำน้ำแห่งประวัติศาสตร์"], verses: "มรดกวรรณคดีไทยอันล้ำค่า คู่สายน้ำเจ้าพระยาตลอดกาล", pageNum: 4, totalPages: 6, accentColor: "#0284c7", author: "ม.6/8 (กลุ่มที่ 2)" }
    ]
  }
];

function getBookPageUrls(book) {
  if (!book) return [];
  return book.pages.map((p, idx) => p.url || createA4PageSVG({
    isCover: p.isCover || idx === 0,
    title: p.title || book.title, subtitle: p.subtitle || book.subtitle,
    author: p.author || book.author, chapter: p.chapter || '',
    bodyTexts: p.bodyTexts || [], verses: p.verses || '',
    themeGrad: p.themeGrad, accentColor: p.accentColor,
    pageNum: idx + 1, totalPages: book.pages.length, iconFa: p.iconFa || '📖'
  }));
}

function getPostPageUrls(post) {
  if (post.bookId != null && BOOKS_DATA[post.bookId]) return getBookPageUrls(BOOKS_DATA[post.bookId]);
  if (Array.isArray(post.pages) && post.pages.length) {
    return post.pages.map((p, idx) => p.url || createA4PageSVG({
      isCover: p.isCover || idx === 0,
      title: p.title || post.topic, subtitle: p.subtitle || post.content,
      author: p.author || post.author_name, chapter: p.chapter || '',
      bodyTexts: p.bodyTexts || [], verses: p.verses || '',
      themeGrad: p.themeGrad, accentColor: p.accentColor,
      pageNum: idx + 1, totalPages: post.pages.length, iconFa: p.iconFa || '📖'
    }));
  }
  if (Array.isArray(post.images) && post.images.length) return post.images.map(i => i.url);
  return [];
}

/* ── Placeholder art for seeded photo/link posts ── */
function makePlaceholderImage(title, subtitle, emoji, c1, c2) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>'
    + '<rect width="800" height="600" fill="url(#g)"/>'
    + '<text x="400" y="250" font-size="120" text-anchor="middle">' + emoji + '</text>'
    + '<text x="400" y="370" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="sans-serif">' + xmlEsc(title) + '</text>'
    + '<text x="400" y="428" font-size="24" fill="#e2e8f0" text-anchor="middle" font-family="sans-serif">' + xmlEsc(subtitle) + '</text>'
    + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* Seeded comments (shown until a post gets its first saved comment). */
const SEED_COMMENTS = {};

function buildSeedPhotoPosts(room) {
  const idx = (window.CLEAR_ROOMS || []).findIndex(r => r.slug === room.slug);
  const variants = [
    { emoji: '📜', c1: '#0ea5e9', c2: '#2563eb' },
    { emoji: '🎨', c1: '#8b5cf6', c2: '#ec4899' },
    { emoji: '🗺️', c1: '#10b981', c2: '#0ea5e9' }
  ];
  const v = variants[(idx < 0 ? 0 : idx) % variants.length];
  const pid1 = 'p_' + room.slug + '_1';
  const pid2 = 'p_' + room.slug + '_2';
  const pid3 = 'p_' + room.slug + '_3';

  SEED_COMMENTS[pid1] = [{
    id: 'c_seed_' + room.slug, author_name: 'ครูรามิล', author_code: '', is_teacher: true,
    content: 'ผลงานออกแบบได้สวยงามมากครับ ลองเพิ่มคำอธิบายแนวคิดของชิ้นงานด้วยนะ',
    image: null, created_at: '2026-10-01T09:00:00Z'
  }];

  return [
    {
      id: pid1, type: 'blog', topic: 'โปสเตอร์สรุปวรรณคดี ' + room.title,
      content: 'สรุปแก่นเรื่อง ตัวละคร และคุณค่าทางวรรณศิลป์ของวรรณคดีประจำบทเรียน',
      author_name: 'นักเรียน ' + room.room, is_teacher: false, is_mine: false,
      image: makePlaceholderImage('โปสเตอร์วรรณคดี', room.title, v.emoji, v.c1, v.c2),
      external_url: null, created_at: '2026-10-01T08:30:00Z', color: ''
    },
    {
      id: pid2, type: 'blog', topic: 'ลิงก์รวมผลงานและแผนการสอน (Padlet)',
      content: 'รวมลิงก์ผลงานของเพื่อนในห้อง และลิงก์เอกสารสรุปบทเรียนเพิ่มเติม',
      author_name: 'นักเรียน ' + room.room, is_teacher: false, is_mine: false,
      image: null, external_url: 'https://padlet.com/raminhyong',
      created_at: '2026-09-30T13:10:00Z', color: 'card-blue'
    },
    {
      id: pid3, type: 'blog', topic: 'แผนภาพโครงเรื่องและตัวละคร',
      content: 'แผนภาพความสัมพันธ์ของตัวละครและลำดับเหตุการณ์ในเรื่อง',
      author_name: 'นักเรียน ' + room.room, is_teacher: false, is_mine: false,
      image: makePlaceholderImage('โครงเรื่อง', 'Character Map', '🧩', v.c2, v.c1),
      external_url: null, created_at: '2026-09-29T10:00:00Z', color: 'card-purple'
    }
  ];
}

function buildSeedBookPosts(room) {
  return BOOKS_DATA.filter(b => b.roomSlug === room.slug).map(b => ({
    id: 'b_' + b.id, type: 'book', bookId: b.id,
    topic: b.title, content: b.desc || b.subtitle,
    author_name: b.author, is_teacher: false, is_mine: false,
    images: [], external_url: null, created_at: b.createdAt, color: b.colorClass || ''
  }));
}
