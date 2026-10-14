import type { KnowledgeChunk } from './types.js';
import { env } from './env.js';
import { MHT_CRAWL_JSON } from './assets.generated.js';

// In-memory store — populated at startup from disk (wrangler dev only) and by /api/train
let chunks: KnowledgeChunk[] = [];

// Location of the on-disk knowledge store (only used where a filesystem exists).
const knowledgeFile = `${env.dataDir}/knowledge.json`;

type FsModule = {
  readFile: (path: string, enc: string) => Promise<string>;
  mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
  writeFile: (path: string, data: string, enc: string) => Promise<void>;
};

/**
 * Try to load node:fs/promises via a standard dynamic import.
 * Works under wrangler dev (nodejs_compat); throws in prod Workers — caught below.
 */
// Try to seed from disk on module init (only works under wrangler dev with nodejs_compat)
try {
  // @ts-ignore — node:fs/promises is not in @cloudflare/workers-types but is available under nodejs_compat
  const fs = await import('node:fs/promises') as FsModule;
  const raw = await fs.readFile(knowledgeFile, 'utf8');
  const parsed = JSON.parse(raw) as KnowledgeChunk[];
  if (Array.isArray(parsed)) {
    chunks = parsed;
  }
} catch {
  // Not available in prod Workers or file doesn't exist yet — start empty
}

/** Persist current chunks to disk (best-effort, silently ignored in prod). */
async function persist(): Promise<void> {
  try {
    // @ts-ignore — node:fs/promises is not in @cloudflare/workers-types but is available under nodejs_compat
    const fs = await import('node:fs/promises') as FsModule;
    await fs.mkdir(env.dataDir, { recursive: true });
    await fs.writeFile(knowledgeFile, JSON.stringify(chunks, null, 2), 'utf8');
  } catch {
    // Ignore — expected to fail in Cloudflare Workers prod
  }
}

/** Add new chunks to the store, replacing any with the same id. */
export function addChunks(newChunks: KnowledgeChunk[]): void {
  const existingIds = new Set(chunks.map((c) => c.id));
  for (const chunk of newChunks) {
    if (existingIds.has(chunk.id)) {
      const idx = chunks.findIndex((c) => c.id === chunk.id);
      if (idx !== -1) chunks[idx] = chunk;
    } else {
      chunks.push(chunk);
    }
  }
  // Fire-and-forget persist
  void persist();
}

/** Return the current chunk count. */
export function getChunkCount(): number {
  return chunks.length;
}

/**
 * Normalize Arabic orthography so spelling variants collapse to one form:
 * drop diacritics/tatweel and unify alef / yaa / waw-hamza / taa-marbuta.
 */
function normalizeArabic(word: string): string {
  return word
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // harakat / tashkeel
    .replace(/\u0640/g, '') // tatweel
    .replace(/[\u0622\u0623\u0625\u0627\u0671]/g, '\u0627') // آ أ إ ا ٱ → ا
    .replace(/\u0649/g, '\u064A') // ى → ي
    .replace(/\u0626/g, '\u064A') // ئ → ي
    .replace(/\u0624/g, '\u0648') // ؤ → و
    .replace(/\u0629/g, '\u0647'); // ة → ه
}

/**
 * Very light English stemmer: folds plurals and a few common suffixes so that
 * e.g. license / licensing / licenses and renewal / renew share a token.
 * Both the raw and the stemmed form are indexed, so exact matches still win.
 */
function stemEn(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 6 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('al')) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/**
 * Tokenize to lowercase Unicode words, emitting extra normalized variants for
 * Arabic (orthography + definite article) and English (light stemming).
 */
function tokenize(text: string): string[] {
  const words = text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    const n = normalizeArabic(w);
    if (!n) continue;
    out.push(n);
    if (/^[\p{Script=Arabic}]+$/u.test(n)) {
      if (n.length > 4 && n.startsWith('\u0627\u0644')) out.push(n.slice(2)); // strip الـ
      if (n.length > 5 && n.startsWith('\u0648')) out.push(n.slice(1)); // strip وـ
    } else if (/[a-z]/.test(n)) {
      const st = stemEn(n);
      if (st !== n && st.length >= 3) out.push(st);
    }
  }
  return out;
}

/**
 * TF-IDF search — returns topK chunks ranked by relevance to query, with a
 * title boost and a query-coverage bonus so specific service names rank first.
 */
export function search(query: string, topK = 5): KnowledgeChunk[] {
  if (chunks.length === 0) return [];

  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return chunks.slice(0, topK);

  const N = chunks.length;

  // Document frequency: how many chunks contain each token
  const df: Record<string, number> = {};
  for (const chunk of chunks) {
    const chunkTokens = new Set(tokenize(chunk.content + ' ' + chunk.title));
    for (const token of chunkTokens) {
      df[token] = (df[token] ?? 0) + 1;
    }
  }

  // Score each chunk
  const scored = chunks.map((chunk) => {
    const chunkTokens = tokenize(chunk.content + ' ' + chunk.title);
    const titleTokens = new Set(tokenize(chunk.title));
    const termFreq: Record<string, number> = {};
    for (const t of chunkTokens) {
      termFreq[t] = (termFreq[t] ?? 0) + 1;
    }

    let score = 0;
    let matched = 0;
    for (const token of queryTokens) {
      const idf = Math.log(1 + N / (1 + (df[token] ?? 0)));
      const freq = termFreq[token] ?? 0;
      if (freq > 0) {
        matched++;
        score += (freq / (chunkTokens.length || 1)) * idf;
        if (titleTokens.has(token)) score += idf * 0.8; // title/name boost
      }
    }
    // Reward chunks that cover more of the query.
    score *= 1 + 0.5 * (matched / queryTokens.length);

    return { ...chunk, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, topK);
}

/**
 * Pre-seed the knowledge base with MHT ePortal content.
 *
 * Two sources are merged:
 *   1. a curated bilingual (EN/AR) seed of the main services + FAQs, so
 *      retrieval works for questions in either language;
 *   2. a baked snapshot of the live ePortal (`data/mht-crawl.json` → the
 *      complete eServices catalogue and page text), produced by
 *      `npx tsx scripts/crawl-mht.ts`.
 *
 * Idempotent: chunks are keyed by id, so re-seeding merely refreshes the
 * curated + baked entries and never disturbs chunks trained at runtime.
 */
export function seedMhtKnowledge(): void {
  const url = 'https://stg-eportal.mht.gov.om/';
  const en = (title: string, body: string, ar: string): KnowledgeChunk => ({
    id: '',
    title,
    content: `${body}\n\n[ar] ${ar}`,
    url,
  });
  const seed: KnowledgeChunk[] = [
    en(
      'Tourist Guide Licensing Services | خدمات ترخيص المرشد السياحي',
      'The Tourist Guide Licensing service allows individuals to apply for and renew official tourist guide licenses in Oman. Applicants must submit a valid Omani ID or residency card, pass a certified guide training course, and pay the licensing fee. Renewals are due every two years. Applications are submitted online through the MHT ePortal.',
      'خدمة ترخيص المرشد السياحي تتيح للأفراد التقدّم بطلب إصدار وتجديد رخصة المرشد السياحي في سلطنة عُمان. يجب تقديم البطاقة الشخصية العُمانية أو بطاقة الإقامة سارية المفعول، واجتياز دورة تدريب المرشدين المعتمدة، وسداد رسوم الترخيص. يتم التجديد كل سنتين، وتُقدَّم الطلبات إلكترونياً عبر بوابة وزارة التراث والسياحة.'
    ),
    en(
      'Adventure Tourism | السياحة المغامرة',
      'Adventure Tourism services cover permits and regulations for activities such as hiking, mountain climbing, desert safaris, diving, and off-road tours in Oman. Operators must register their business, submit safety plans, and renew activity permits annually. Individual adventurers can also apply for activity access passes.',
      'تشمل خدمات السياحة المغامرة التصاريح واللوائح لأنشطة المشي الجبلي والتسلق والسفاري الصحراوي والغوص والرحلات البرية في عُمان. يجب على المشغلين تسجيل النشاط وتقديم خطط السلامة وتجديد تصاريح الأنشطة سنوياً، كما يمكن للأفراد التقدّم بطلب تصاريح المشاركة.'
    ),
    en(
      'Cave Entry Permits | تصاريح دخول الكهوف',
      'Cave Entry permits are required for visiting protected cave sites in Oman, including Al Hoota Cave and other heritage caves. Visitors apply online, choose a visit date and time slot, and receive a QR-code entry ticket. Group bookings require advance notice of 3 business days.',
      'يلزم الحصول على تصريح دخول الكهوف لزيارة مواقع الكهوف المحمية في عُمان مثل كهف الهوته وغيره من الكهوف التراثية. يتقدّم الزائر إلكترونياً ويختار تاريخ الزيارة والفترة الزمنية ويستلم تذكرة دخول برمز QR. تتطلب الحجوزات الجماعية إشعاراً مسبقاً بثلاثة أيام عمل.'
    ),
    en(
      'Tourism Land Investment Services | خدمات الاستثمار في الأراضي السياحية',
      'Tourism Land Investment services facilitate the licensing of tourism development projects on designated land parcels in Oman. Investors submit a project proposal, environmental impact assessment, and proof of financial capacity. Approval timelines are typically 30–60 business days depending on project complexity.',
      'تسهّل خدمات الاستثمار في الأراضي السياحية ترخيص المشاريع السياحية على قطع الأراضي المخصصة في عُمان. يقدّم المستثمر مقترح المشروع ودراسة الأثر البيئي وإثبات القدرة المالية. تستغرق الموافقات عادة من 30 إلى 60 يوم عمل حسب حجم المشروع.'
    ),
    en(
      'Hotel Licensing Services | خدمات ترخيص الفنادق',
      'Hotel Licensing covers the registration, classification, and annual renewal of hotels, hotel apartments, and tourist resorts in Oman. New licenses require a building completion certificate, fire safety clearance, and health inspection report. Star ratings are assigned by the MHT classification committee.',
      'تشمل خدمة ترخيص الفنادق تسجيل وتصنيف وتجديد تراخيص الفنادق والشقق الفندقية والمنتجعات السياحية في عُمان سنوياً. يتطلب الترخيص الجديد شهادة إنجاز البناء وموافقة السلامة من الحريق وتقرير الفحص الصحي. تُمنح تصنيفات النجوم من لجنة التصنيف بالوزارة.'
    ),
    en(
      'Fine Arts Band | الفرقة الفنية',
      'The Fine Arts Band service manages permits for artistic performances, exhibitions, and cultural events in Oman. Performers and organizers must apply at least 14 days before the event, provide a content description, and obtain approval from the Ministry. International artists require additional clearance.',
      'تدير خدمة الفرقة الفنية تصاريح العروض الفنية والمعارض والفعاليات الثقافية في عُمان. يجب على الفنانين والمنظمين التقدّم قبل 14 يوماً على الأقل من الفعالية وتقديم وصف المحتوى والحصول على موافقة الوزارة، كما يحتاج الفنانون الدوليون إلى تصريح إضافي.'
    ),
    en(
      'Tourism Establishment Classification Certificate | شهادة تصنيف المنشآت السياحية',
      'Tourism establishments including restaurants, cafes, travel agencies, and tour operators must hold a valid Classification Certificate from the MHT. Classification is based on facility quality, staff qualifications, and service standards. Certificates are renewed every three years after an on-site inspection.',
      'يجب أن تحمل المنشآت السياحية مثل المطاعم والمقاهي ووكالات السفر ومنظمي الرحلات شهادة تصنيف سارية من الوزارة. يعتمد التصنيف على جودة المرافق ومؤهلات العاملين ومعايير الخدمة، ويُجدّد كل ثلاث سنوات بعد تفتيش ميداني.'
    ),
    en(
      'Quality Monitoring | مراقبة الجودة',
      'The Quality Monitoring service enables tourism businesses and the public to submit feedback, complaints, and quality reports about tourism establishments in Oman. Reports are reviewed by MHT inspectors within 5 business days. Businesses found in violation may be fined or have their license suspended.',
      'تتيح خدمة مراقبة الجودة للمنشآت السياحية والجمهور تقديم الملاحظات والشكاوى وتقارير الجودة حول المنشآت السياحية في عُمان. يراجع مفتشو الوزارة التقارير خلال خمسة أيام عمل، وقد تُفرض غرامات أو يُعلَّق الترخيص على المنشآت المخالفة.'
    ),
    en(
      'Media and Content | الإعلام والمحتوى',
      'Media and Content services cover permits for filming, photography, and content creation at heritage sites and tourism areas in Oman. Commercial productions require a filming permit, location fee, and MHT-assigned liaison officer. Personal photography for non-commercial purposes is generally free but subject to site rules.',
      'تشمل خدمات الإعلام والمحتوى تصاريح التصوير الفوتوغرافي وإنتاج المحتوى في المواقع التراثية والمناطق السياحية في عُمان. تتطلب الإنتاجات التجارية تصريح تصوير ورسوم موقع ومنسّقاً من الوزارة، أما التصوير الشخصي غير التجاري فمجاني عادة مع الالتزام بأنظمة الموقع.'
    ),
    en(
      'Tourism Center | مركز السياحة',
      'Tourism Centers are licensed visitor information and tourism service hubs. Operators apply for a Tourism Center license, must maintain bilingual (Arabic and English) staff, and provide approved tourism materials. Annual renewal requires a compliance audit.',
      'تُرخَّص مراكز السياحة كمراكز معلومات وخدمات سياحية. يتقدّم المشغل بطلب ترخيص مركز سياحة، ويلتزم بتوفير موظفين يتحدثون العربية والإنجليزية وتقديم مواد سياحية معتمدة، مع تجديد سنوي يتطلب تدقيق الالتزام.'
    ),
    en(
      'Museum and Heritage House Services | خدمات المتاحف والبيوت التراثية',
      'Museum and Heritage House services cover licensing, registration, and support for public and private museums, heritage houses, and archaeological exhibition spaces in Oman. New museum licenses require an artifact inventory, curator qualifications, and facility safety inspection. The MHT provides advisory support for heritage conservation.',
      'تشمل خدمات المتاحف والبيوت التراثية الترخيص والتسجيل ودعم المتاحف العامة والخاصة والبيوت التراثية ومساحات العرض الأثرية في عُمان. يتطلب ترخيص المتحف الجديد جرداً للمقتنيات ومؤهلات أمين المتحف وفحص سلامة المرفق، وتقدّم الوزارة الدعم الاستشاري لصون التراث.'
    ),
    en(
      'Event and Filming | الفعاليات والتصوير',
      'Event and Filming permits are required for organizing public tourism events, festivals, and professional filming activities in Oman. Event organizers submit a detailed event plan, safety assessment, and crowd management procedures. Filming crews must have liability insurance and MHT approval before commencing.',
      'يلزم الحصول على تصاريح الفعاليات والتصوير لتنظيم الفعاليات والمهرجانات السياحية العامة وأنشطة التصوير المهني في عُمان. يقدّم المنظمون خطة فعالية مفصّلة وتقييماً للسلامة وإجراءات إدارة الحشود، ويجب أن يكون لدى فرق التصوير تأمين مسؤولية وموافقة الوزارة قبل البدء.'
    ),
    en(
      'How to apply for eServices on the MHT portal | كيفية التقدّم للخدمات الإلكترونية',
      'To use MHT eServices, create an account on the ePortal using your Omani civil ID or Resident ID. After login, select the desired service, fill in the application form, upload required documents (PDF or JPG), and pay any applicable fees online. You will receive SMS and email notifications on your application status.',
      'لاستخدام الخدمات الإلكترونية للوزارة، أنشئ حساباً على البوابة الإلكترونية باستخدام البطاقة الشخصية العُمانية أو بطاقة المقيم. بعد تسجيل الدخول، اختر الخدمة المطلوبة واملأ النموذج وارفع المستندات المطلوبة (PDF أو JPG) وسدّد الرسوم إلكترونياً. ستصلك إشعارات عبر الرسائل النصية والبريد الإلكتروني بحالة الطلب.'
    ),
    en(
      'MHT portal language support | دعم اللغات في البوابة',
      'The MHT ePortal supports both Arabic and English. Users can switch between languages using the language toggle in the navigation bar. All official documents and certificates are issued in Arabic; English translations may be requested for an additional fee.',
      'تدعم بوابة وزارة التراث والسياحة اللغتين العربية والإنجليزية، ويمكن للمستخدم التبديل بينهما عبر زر تغيير اللغة في شريط التنقل. تصدر جميع الوثائق والشهادات الرسمية باللغة العربية، ويمكن طلب ترجمتها إلى الإنجليزية مقابل رسوم إضافية.'
    ),
    en(
      'Contact Ministry of Heritage and Tourism Oman | تواصل مع وزارة التراث والسياحة',
      'Ministry of Heritage and Tourism, Sultanate of Oman. Address: P.O. Box 550, Muscat, Oman. Phone: +968 2468 4000. Email: info@mht.gov.om. Working hours: Sunday to Thursday, 7:30 AM to 2:30 PM. The ePortal technical support hotline is available 8 AM to 8 PM.',
      'وزارة التراث والسياحة، سلطنة عُمان. العنوان: ص.ب 550، مسقط، عُمان. الهاتف: ‎+968 2468 4000. البريد الإلكتروني: info@mht.gov.om. ساعات العمل: الأحد إلى الخميس، من 7:30 صباحاً إلى 2:30 ظهراً. ويعمل خط دعم البوابة الإلكترونية من الساعة 8 صباحاً حتى 8 مساءً.'
    ),
  ].map((chunk, i) => {
    const ids = [
      'mht-001', 'mht-002', 'mht-003', 'mht-004', 'mht-005', 'mht-006',
      'mht-007', 'mht-008', 'mht-009', 'mht-010', 'mht-011', 'mht-012',
      'mht-faq-001', 'mht-faq-002', 'mht-faq-003',
    ];
    return { ...chunk, id: ids[i] ?? `mht-${String(i + 1).padStart(3, '0')}` };
  });

  addChunks([...seed, ...crawlSeedChunks(url)]);
}

/**
 * Turn the baked site snapshot (`data/mht-crawl.json`, inlined at build time by
 * scripts/generate-assets.mjs) into knowledge chunks. Returns [] when the
 * snapshot is missing or malformed.
 */
function crawlSeedChunks(fallbackUrl: string): KnowledgeChunk[] {
  if (!MHT_CRAWL_JSON) return [];
  const out: KnowledgeChunk[] = [];
  try {
    const data = JSON.parse(MHT_CRAWL_JSON) as {
      pages?: Array<{ url?: string; title?: string; text?: string }>;
    };
    for (const page of data.pages ?? []) {
      const text = (page.text ?? '').trim();
      if (!text) continue;
      const pageUrl = page.url ?? fallbackUrl;
      out.push(...splitIntoChunks(text, page.title ?? pageUrl, pageUrl));
    }
  } catch {
    // Malformed snapshot — the curated seed still applies.
  }
  return out;
}

/**
 * Split a long content string into overlapping ~500-char chunks.
 */
export function splitIntoChunks(
  content: string,
  title: string,
  url: string
): KnowledgeChunk[] {
  const chunkSize = env.chunkSize;
  const overlap = env.chunkOverlap;
  const result: KnowledgeChunk[] = [];

  // Normalize whitespace
  const text = content.replace(/\s+/g, ' ').trim();

  if (text.length === 0) return result;

  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkContent = text.slice(start, end);
    const id = `${url || title}-chunk-${index}`.replace(/[^a-zA-Z0-9-_]/g, '_');

    result.push({
      id,
      title,
      content: chunkContent,
      url,
    });

    index++;
    if (end >= text.length) break;
    start = end - overlap;
  }

  return result;
}
