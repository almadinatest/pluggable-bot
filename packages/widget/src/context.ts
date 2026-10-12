export interface PageContext {
  url: string;
  title: string;
  visibleText: string;
}

// Build-time configuration (injected via esbuild `define` in build.mjs).
const MAX_CONTEXT_CHARS = Number(process.env.WIDGET_CONTEXT_MAX_CHARS ?? '2000');

export function getPageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title,
    visibleText: (document.body?.innerText ?? '').slice(0, MAX_CONTEXT_CHARS),
  };
}