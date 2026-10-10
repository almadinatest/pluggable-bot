export const STYLES = `
:host {
  display: block;
  box-sizing: border-box;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

#launcher {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--primary, #1a1a2e);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

#launcher:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

#launcher:active {
  transform: scale(0.96);
}

#launcher svg {
  width: 26px;
  height: 26px;
  fill: #fff;
}

#panel {
  position: fixed;
  bottom: 92px;
  right: 24px;
  width: 380px;
  height: 520px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  z-index: 9998;
  transform: translateY(100%) scaleY(0.95);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.25s ease, opacity 0.25s ease;
  overflow: hidden;
}

#panel.open {
  transform: translateY(0) scaleY(1);
  opacity: 1;
  pointer-events: all;
}

#header {
  background: linear-gradient(135deg, var(--primary, #1a1a2e), color-mix(in srgb, var(--primary, #1a1a2e) 70%, #5a4fcf));
  color: #fff;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

#header-title {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

#close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.1s ease;
}

#close:hover {
  color: #fff;
}

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
}

#messages::-webkit-scrollbar {
  width: 4px;
}

#messages::-webkit-scrollbar-track {
  background: transparent;
}

#messages::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 2px;
}

.msg-user {
  align-self: flex-end;
  background: var(--primary, #1a1a2e);
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  max-width: 80%;
  padding: 8px 12px;
  word-break: break-word;
  line-height: 1.45;
}

.msg-bot {
  align-self: flex-start;
  background: #f0f0f0;
  color: #1a1a1a;
  border-radius: 18px 18px 18px 4px;
  max-width: 80%;
  padding: 8px 12px;
  word-break: break-word;
  line-height: 1.45;
}

.typing {
  align-self: flex-start;
  background: #f0f0f0;
  border-radius: 18px 18px 18px 4px;
  padding: 10px 14px;
  display: flex;
  gap: 4px;
  align-items: center;
}

.typing span {
  display: inline-block;
  width: 7px;
  height: 7px;
  background: #999;
  border-radius: 50%;
  animation: bounce 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

#input-row {
  border-top: 1px solid #e8e8e8;
  padding: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

#input {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 20px;
  padding: 8px 14px;
  font-size: 14px;
  font-family: system-ui, -apple-system, sans-serif;
  outline: none;
  background: #fafafa;
  transition: border-color 0.15s ease;
}

#input:focus {
  border-color: var(--primary, #1a1a2e);
  background: #fff;
}

#send {
  background: var(--primary, #1a1a2e);
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: 8px 18px;
  font-size: 14px;
  font-family: system-ui, -apple-system, sans-serif;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
}

#send:hover {
  opacity: 0.88;
}

#send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;
