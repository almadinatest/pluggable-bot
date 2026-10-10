import { PluggableBotWidget } from './widget.js';

if (!customElements.get('pluggable-bot-widget')) {
  customElements.define('pluggable-bot-widget', PluggableBotWidget);
}

function insertWidget(): void {
  if (!document.querySelector('pluggable-bot-widget')) {
    document.body.appendChild(document.createElement('pluggable-bot-widget'));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', insertWidget);
} else {
  insertWidget();
}
