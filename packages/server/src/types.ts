export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PageContext {
  url: string;
  title: string;
  visibleText: string;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  url: string;
  score?: number;
}

export interface ChatRequest {
  message: string;
  pageContext: PageContext;
  history: Message[];
}

export interface TrainRequest {
  url?: string;
  content?: string;
  title?: string;
}

export interface Bindings {
  OPENAI_API_KEY: string;   // kept for reference (not used as Hono generic — env vars come from process.env)
  OPENROUTER_API_KEY: string;
  LLM_MODEL: string;
  WIDGET_JS: string;
  MHT_HTML: string;
}
