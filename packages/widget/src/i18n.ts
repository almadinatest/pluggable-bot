// Widget UI localization (English / Arabic) with RTL support.
//
// Language resolution order (see `detectLang`):
//   1. `data-lang` attribute on the embed <script>
//   2. the host page's <html lang="…"> / dir="rtl"
//   3. the browser's preferred language
//   4. English

export type Lang = 'en' | 'ar';

export interface WidgetStrings {
  launcherLabel: string;
  closeLabel: string;
  panelLabel: string;
  placeholder: string;
  send: string;
  inputLabel: string;
  errorPrefix: string;
  /** aria-label for the language-toggle button */
  toggleTitle: string;
  /** visible text of the language-toggle button (always the *other* language) */
  toggleText: string;
}

export const STRINGS: Record<Lang, WidgetStrings> = {
  en: {
    launcherLabel: 'Open chat',
    closeLabel: 'Close chat',
    panelLabel: 'chat',
    placeholder: 'Ask something…',
    send: 'Send',
    inputLabel: 'Message',
    errorPrefix: 'Error: ',
    toggleTitle: 'Switch to Arabic',
    toggleText: 'العربية',
  },
  ar: {
    launcherLabel: 'افتح المحادثة',
    closeLabel: 'إغلاق المحادثة',
    panelLabel: 'محادثة',
    placeholder: 'اكتب سؤالك…',
    send: 'إرسال',
    inputLabel: 'رسالة',
    errorPrefix: 'خطأ: ',
    toggleTitle: 'Switch to English',
    toggleText: 'English',
  },
};

/** Resolve the widget language from an explicit value, the page, or the browser. */
export function detectLang(explicit?: string): Lang {
  const value = (explicit ?? '').trim().toLowerCase();
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('en')) return 'en';

  const doc = document.documentElement;
  if ((doc.lang ?? '').toLowerCase().startsWith('ar')) return 'ar';
  if (doc.dir === 'rtl') return 'ar';

  const nav = (navigator.language ?? '').toLowerCase();
  if (nav.startsWith('ar')) return 'ar';

  return 'en';
}

export function isRtl(lang: Lang): boolean {
  return lang === 'ar';
}
