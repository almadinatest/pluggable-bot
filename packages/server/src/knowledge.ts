import type { KnowledgeChunk } from './types.js';

// In-memory store — populated at startup from disk (wrangler dev only) and by /api/train
let chunks: KnowledgeChunk[] = [];

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
  const raw = await fs.readFile('data/knowledge.json', 'utf8');
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
    await fs.mkdir('data', { recursive: true });
    await fs.writeFile('data/knowledge.json', JSON.stringify(chunks, null, 2), 'utf8');
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

/** Tokenize a string into lowercase words. */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

/**
 * TF-IDF search — returns topK chunks ranked by relevance to query.
 */
export function search(query: string, topK = 5): KnowledgeChunk[] {
  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
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
    const termFreq: Record<string, number> = {};
    for (const t of chunkTokens) {
      termFreq[t] = (termFreq[t] ?? 0) + 1;
    }

    let score = 0;
    for (const token of queryTokens) {
      const tf = (termFreq[token] ?? 0) / (chunkTokens.length || 1);
      const idf = Math.log(1 + N / (1 + (df[token] ?? 0)));
      score += tf * idf;
    }

    return { ...chunk, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, topK);
}

/**
 * Pre-seed the knowledge base with MHT ePortal content.
 * No-op if chunks have already been loaded (from disk or a previous call).
 */
export function seedMhtKnowledge(): void {
  if (getChunkCount() > 0) return; // don't double-seed
  addChunks([
    {
      id: 'mht-001',
      title: 'Tourist Guide Licensing Services',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'The Tourist Guide Licensing service allows individuals to apply for and renew official tourist guide licenses in Oman. Applicants must submit a valid Omani ID or residency card, pass a certified guide training course, and pay the licensing fee. Renewals are due every two years. Applications are submitted online through the MHT ePortal.',
    },
    {
      id: 'mht-002',
      title: 'Adventure Tourism',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Adventure Tourism services cover permits and regulations for activities such as hiking, mountain climbing, desert safaris, diving, and off-road tours in Oman. Operators must register their business, submit safety plans, and renew activity permits annually. Individual adventurers can also apply for activity access passes.',
    },
    {
      id: 'mht-003',
      title: 'Cave Entry Permits',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Cave Entry permits are required for visiting protected cave sites in Oman, including Al Hoota Cave and other heritage caves. Visitors apply online, choose a visit date and time slot, and receive a QR-code entry ticket. Group bookings require advance notice of 3 business days.',
    },
    {
      id: 'mht-004',
      title: 'Tourism Land Investment Services',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Tourism Land Investment services facilitate the licensing of tourism development projects on designated land parcels in Oman. Investors submit a project proposal, environmental impact assessment, and proof of financial capacity. Approval timelines are typically 30–60 business days depending on project complexity.',
    },
    {
      id: 'mht-005',
      title: 'Hotel Licensing Services',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Hotel Licensing covers the registration, classification, and annual renewal of hotels, hotel apartments, and tourist resorts in Oman. New licenses require a building completion certificate, fire safety clearance, and health inspection report. Star ratings are assigned by the MHT classification committee.',
    },
    {
      id: 'mht-006',
      title: 'Fine Arts Band',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'The Fine Arts Band service manages permits for artistic performances, exhibitions, and cultural events in Oman. Performers and organizers must apply at least 14 days before the event, provide a content description, and obtain approval from the Ministry. International artists require additional clearance.',
    },
    {
      id: 'mht-007',
      title: 'Tourism Establishment Classification Certificate',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Tourism establishments including restaurants, cafes, travel agencies, and tour operators must hold a valid Classification Certificate from the MHT. Classification is based on facility quality, staff qualifications, and service standards. Certificates are renewed every three years after an on-site inspection.',
    },
    {
      id: 'mht-008',
      title: 'Quality Monitoring',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'The Quality Monitoring service enables tourism businesses and the public to submit feedback, complaints, and quality reports about tourism establishments in Oman. Reports are reviewed by MHT inspectors within 5 business days. Businesses found in violation may be fined or have their license suspended.',
    },
    {
      id: 'mht-009',
      title: 'Media and Content',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Media and Content services cover permits for filming, photography, and content creation at heritage sites and tourism areas in Oman. Commercial productions require a filming permit, location fee, and MHT-assigned liaison officer. Personal photography for non-commercial purposes is generally free but subject to site rules.',
    },
    {
      id: 'mht-010',
      title: 'Tourism Center',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Tourism Centers are licensed visitor information and tourism service hubs. Operators apply for a Tourism Center license, must maintain bilingual (Arabic and English) staff, and provide approved tourism materials. Annual renewal requires a compliance audit.',
    },
    {
      id: 'mht-011',
      title: 'Museum and Heritage House Services',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Museum and Heritage House services cover licensing, registration, and support for public and private museums, heritage houses, and archaeological exhibition spaces in Oman. New museum licenses require an artifact inventory, curator qualifications, and facility safety inspection. The MHT provides advisory support for heritage conservation.',
    },
    {
      id: 'mht-012',
      title: 'Event and Filming',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Event and Filming permits are required for organizing public tourism events, festivals, and professional filming activities in Oman. Event organizers submit a detailed event plan, safety assessment, and crowd management procedures. Filming crews must have liability insurance and MHT approval before commencing.',
    },
    {
      id: 'mht-faq-001',
      title: 'How to apply for eServices on the MHT portal',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'To use MHT eServices, create an account on the ePortal using your Omani civil ID or Resident ID. After login, select the desired service, fill in the application form, upload required documents (PDF or JPG), and pay any applicable fees online. You will receive SMS and email notifications on your application status.',
    },
    {
      id: 'mht-faq-002',
      title: 'MHT portal language support',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'The MHT ePortal supports both Arabic and English. Users can switch between languages using the language toggle in the navigation bar. All official documents and certificates are issued in Arabic; English translations may be requested for an additional fee.',
    },
    {
      id: 'mht-faq-003',
      title: 'Contact Ministry of Heritage and Tourism Oman',
      url: 'https://stg-eportal.mht.gov.om/',
      content: 'Ministry of Heritage and Tourism, Sultanate of Oman. Address: P.O. Box 550, Muscat, Oman. Phone: +968 2468 4000. Email: info@mht.gov.om. Working hours: Sunday to Thursday, 7:30 AM to 2:30 PM. The ePortal technical support hotline is available 8 AM to 8 PM.',
    },
  ]);
}

/**
 * Split a long content string into overlapping ~500-char chunks.
 */
export function splitIntoChunks(
  content: string,
  title: string,
  url: string
): KnowledgeChunk[] {
  const chunkSize = 500;
  const overlap = 50;
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
