import { STYLES } from './styles.js';
import { getPageContext } from './context.js';
import { streamSSE } from './stream.js';
import { STRINGS, detectLang, isRtl, type Lang, type WidgetStrings } from './i18n.js';

interface HistoryEntry {
  role: string;
  content: string;
}

// Build-time configuration (injected via esbuild `define` in build.mjs).
// Per-embed `data-*` attributes on the loaded <script> take precedence.
const MAX_HISTORY = Number(process.env.WIDGET_MAX_HISTORY ?? '10');
const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export class PluggableBotWidget extends HTMLElement {
  private shadow: ShadowRoot;
  private apiUrl = process.env.WIDGET_API_URL ?? '';
  private botName = process.env.WIDGET_BOT_NAME ?? 'Bot';
  private primaryColor = process.env.WIDGET_PRIMARY_COLOR ?? '#1a1a2e';
  private position = process.env.WIDGET_POSITION ?? 'bottom-right';
  private uiLang: Lang = 'en';
  private strings: WidgetStrings = STRINGS.en;
  private history: HistoryEntry[] = [];
  private isOpen = false;
  private isStreaming = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Read config from the embed script tag
    const script = document.querySelector<HTMLScriptElement>('script[data-api-url]');
    this.uiLang = detectLang(script?.dataset.lang);
    this.strings = STRINGS[this.uiLang];
    if (script) {
      this.apiUrl = script.dataset.apiUrl ?? this.apiUrl;
      this.botName = script.dataset.botName ?? this.botName;
      this.primaryColor = script.dataset.primaryColor ?? this.primaryColor;
      this.position = script.dataset.position ?? this.position;
    }

    this.render();
    this.wireEvents();
  }

  private positionClass(): string {
    const pos = POSITIONS.includes(this.position) ? this.position : 'bottom-right';
    return `pos-${pos}`;
  }

  private render(): void {
    const styleEl = document.createElement('style');
    styleEl.textContent =
      `:host { --primary: ${this.primaryColor}; }\n` + STYLES;

    this.shadow.innerHTML = '';
    this.shadow.appendChild(styleEl);

    const host = document.createElement('div');
    host.innerHTML = this.buildHTML();
    while (host.firstChild) {
      this.shadow.appendChild(host.firstChild);
    }
  }

  private buildHTML(): string {
    const chatIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>`;
    const s = this.strings;
    const dir = isRtl(this.uiLang) ? 'rtl' : 'ltr';
    const pos = this.positionClass();
    return `
      <button id="launcher" class="${pos}" aria-label="${s.launcherLabel}">${chatIcon}</button>
      <div id="panel" class="${pos}" role="dialog" dir="${dir}" aria-label="${this.botName} ${s.panelLabel}">
        <div id="header">
          <span id="header-title">${this.botName}</span>
          <div id="header-actions">
            <button id="lang-toggle" type="button" aria-label="${s.toggleTitle}" title="${s.toggleTitle}">${s.toggleText}</button>
            <button id="close" aria-label="${s.closeLabel}">&times;</button>
          </div>
        </div>
        <div id="messages" aria-live="polite" aria-atomic="false"></div>
        <div id="input-row">
          <input
            id="input"
            type="text"
            placeholder="${s.placeholder}"
            autocomplete="off"
            aria-label="${s.inputLabel}"
          />
          <button id="send">${s.send}</button>
        </div>
      </div>
    `;
  }

  private wireEvents(): void {
    const launcher = this.shadow.getElementById('launcher')!;
    const closeBtn = this.shadow.getElementById('close')!;
    const sendBtn = this.shadow.getElementById('send')!;
    const langToggle = this.shadow.getElementById('lang-toggle')!;
    const input = this.shadow.getElementById('input') as HTMLInputElement;

    launcher.addEventListener('click', () => this.togglePanel());
    closeBtn.addEventListener('click', () => this.togglePanel());
    langToggle.addEventListener('click', () => this.toggleLang());
    sendBtn.addEventListener('click', () => this.sendMessage());
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  /** Flip the UI language between Arabic and English (chrome only — messages are kept). */
  private toggleLang(): void {
    this.uiLang = this.uiLang === 'ar' ? 'en' : 'ar';
    this.strings = STRINGS[this.uiLang];
    this.applyLang();
  }

  private applyLang(): void {
    const s = this.strings;
    const panel = this.shadow.getElementById('panel')!;
    panel.setAttribute('dir', isRtl(this.uiLang) ? 'rtl' : 'ltr');
    panel.setAttribute('aria-label', `${this.botName} ${s.panelLabel}`);

    this.shadow.getElementById('launcher')!.setAttribute('aria-label', s.launcherLabel);
    this.shadow.getElementById('close')!.setAttribute('aria-label', s.closeLabel);

    const input = this.shadow.getElementById('input') as HTMLInputElement;
    input.placeholder = s.placeholder;
    input.setAttribute('aria-label', s.inputLabel);

    (this.shadow.getElementById('send') as HTMLButtonElement).textContent = s.send;

    const toggle = this.shadow.getElementById('lang-toggle') as HTMLButtonElement;
    toggle.textContent = s.toggleText;
    toggle.setAttribute('aria-label', s.toggleTitle);
    toggle.setAttribute('title', s.toggleTitle);
  }

  private togglePanel(): void {
    this.isOpen = !this.isOpen;
    const panel = this.shadow.getElementById('panel')!;
    if (this.isOpen) {
      panel.classList.add('open');
      (this.shadow.getElementById('input') as HTMLInputElement)?.focus();
    } else {
      panel.classList.remove('open');
    }
  }

  private async sendMessage(): Promise<void> {
    if (this.isStreaming) return;

    const input = this.shadow.getElementById('input') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    this.isStreaming = true;

    const sendBtn = this.shadow.getElementById('send') as HTMLButtonElement;
    sendBtn.disabled = true;

    this.appendMessage('user', text);
    this.history.push({ role: 'user', content: text });

    this.showTyping();

    // Bot streaming message element (created on first token)
    let botMsgEl: HTMLDivElement | null = null;
    let botContent = '';

    await streamSSE(
      `${this.apiUrl}/api/chat`,
      {
        message: text,
        lang: this.uiLang,
        pageContext: getPageContext(),
        history: this.history.slice(-MAX_HISTORY), // send last N turns
      },
      {
        onToken: (token: string) => {
          this.removeTyping();
          botContent += token;
          if (!botMsgEl) {
            botMsgEl = document.createElement('div');
            botMsgEl.className = 'msg-bot';
            this.shadow.getElementById('messages')!.appendChild(botMsgEl);
          }
          botMsgEl.textContent = botContent;
          this.scrollToBottom();
        },
        onDone: () => {
          this.removeTyping();
          if (botContent) {
            this.history.push({ role: 'assistant', content: botContent });
          }
          this.isStreaming = false;
          sendBtn.disabled = false;
        },
        onError: (err: Error) => {
          this.removeTyping();
          this.appendMessage('bot', `${this.strings.errorPrefix}${err.message}`);
          this.isStreaming = false;
          sendBtn.disabled = false;
        },
      }
    );
  }

  private appendMessage(role: 'user' | 'bot', text: string): void {
    const messages = this.shadow.getElementById('messages')!;
    const div = document.createElement('div');
    div.className = role === 'user' ? 'msg-user' : 'msg-bot';
    div.textContent = text;
    messages.appendChild(div);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    const messages = this.shadow.getElementById('messages');
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }
  }

  private showTyping(): void {
    const messages = this.shadow.getElementById('messages')!;
    const div = document.createElement('div');
    div.className = 'typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(div);
    this.scrollToBottom();
  }

  private removeTyping(): void {
    const typing = this.shadow.querySelector('.typing');
    if (typing) {
      typing.remove();
    }
  }
}
