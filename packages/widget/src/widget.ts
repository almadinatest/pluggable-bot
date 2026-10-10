import { STYLES } from './styles.js';
import { getPageContext } from './context.js';
import { streamSSE } from './stream.js';

interface HistoryEntry {
  role: string;
  content: string;
}

export class PluggableBotWidget extends HTMLElement {
  private shadow: ShadowRoot;
  private apiUrl = 'http://localhost:8787';
  private botName = 'Bot';
  private primaryColor = '#1a1a2e';
  private position = 'bottom-right';
  private history: HistoryEntry[] = [];
  private isOpen = false;
  private isStreaming = false;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Read config from embed script tag
    const script = document.querySelector<HTMLScriptElement>('script[data-api-url]');
    if (script) {
      this.apiUrl = script.dataset.apiUrl ?? this.apiUrl;
      this.botName = script.dataset.botName ?? this.botName;
      this.primaryColor = script.dataset.primaryColor ?? this.primaryColor;
      this.position = script.dataset.position ?? this.position;
    }

    this.render();
    this.wireEvents();
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
    return `
      <button id="launcher" aria-label="Open chat">${chatIcon}</button>
      <div id="panel" role="dialog" aria-label="${this.botName} chat">
        <div id="header">
          <span id="header-title">${this.botName}</span>
          <button id="close" aria-label="Close chat">&times;</button>
        </div>
        <div id="messages" aria-live="polite" aria-atomic="false"></div>
        <div id="input-row">
          <input
            id="input"
            type="text"
            placeholder="Ask something…"
            autocomplete="off"
            aria-label="Message"
          />
          <button id="send">Send</button>
        </div>
      </div>
    `;
  }

  private wireEvents(): void {
    const launcher = this.shadow.getElementById('launcher')!;
    const closeBtn = this.shadow.getElementById('close')!;
    const sendBtn = this.shadow.getElementById('send')!;
    const input = this.shadow.getElementById('input') as HTMLInputElement;

    launcher.addEventListener('click', () => this.togglePanel());
    closeBtn.addEventListener('click', () => this.togglePanel());
    sendBtn.addEventListener('click', () => this.sendMessage());
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
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
        pageContext: getPageContext(),
        history: this.history.slice(-10), // send last 10 turns
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
          this.appendMessage('bot', `Error: ${err.message}`);
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
