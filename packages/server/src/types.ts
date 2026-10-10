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
  OPENAI_API_KEY: string;   // kept for backwards-compat (optional)
  OPENROUTER_API_KEY: string;
  LLM_MODEL: string;        // override default model, e.g. "google/gemma-3-27b-it:free"
  WIDGET_JS: string;
  MHT_HTML: string;
}
