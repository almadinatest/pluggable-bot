export interface PageContext {
  url: string;
  title: string;
  visibleText: string;
}

export function getPageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title,
    visibleText: (document.body?.innerText ?? '').slice(0, 2000),
  };
}
