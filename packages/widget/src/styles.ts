// Widget styles — authored MOBILE-FIRST.
//
// On phones/tablets the panel is a full-screen sheet sized to the *visual*
// viewport (so the on-screen keyboard never covers the input), with safe-area
// inset padding for notches. From 480px up it becomes the floating desktop
// card. Hover effects are gated behind `@media (hover: hover)` so touch
// devices don't get sticky hover states, and the input is 16px on mobile to
// stop iOS Safari from zooming the page in when it gains focus.

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

/* ---------------------------------------------------------------- launcher */

#launcher {
  position: fixed;
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
  z-index: 9998;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

#launcher svg {
  width: 26px;
  height: 26px;
  fill: #fff;
  pointer-events: none;
}

#launcher:active {
  transform: scale(0.94);
}

/* Touch-friendly safe-area placement (mobile default) */
#launcher.pos-bottom-right { bottom: calc(16px + env(safe-area-inset-bottom, 0px)); right: calc(16px + env(safe-area-inset-right, 0px)); }
#launcher.pos-bottom-left  { bottom: calc(16px + env(safe-area-inset-bottom, 0px)); left:  calc(16px + env(safe-area-inset-left, 0px)); }
#launcher.pos-top-right    { top:    calc(16px + env(safe-area-inset-top, 0px));    right: calc(16px + env(safe-area-inset-right, 0px)); }
#launcher.pos-top-left     { top:    calc(16px + env(safe-area-inset-top, 0px));    left:  calc(16px + env(safe-area-inset-left, 0px)); }

/* ----------------------------------------------------------------- panel */
/* Mobile: full-screen sheet. --pb-height/--pb-top are set from the
   VisualViewport API while open so the keyboard shrinks the panel correctly. */

#panel {
  position: fixed;
  left: 0;
  right: 0;
  top: var(--pb-top, 0px);
  height: 100vh;
  height: var(--pb-height, 100dvh);
  background: #fff;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
  transition: opacity 0.22s ease, transform 0.22s ease;
  overflow: hidden;
  overscroll-behavior: contain;
}

#panel.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* ---------------------------------------------------------------- header */

#header {
  background: linear-gradient(135deg, var(--primary, #1a1a2e), color-mix(in srgb, var(--primary, #1a1a2e) 70%, #5a4fcf));
  color: #fff;
  padding: calc(14px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 14px calc(16px + env(safe-area-inset-left, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

#header-title {
  font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

#lang-toggle {
  background: rgba(255, 255, 255, 0.16);
  border: none;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  font-size: 13px;
  font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
  line-height: 1;
  padding: 8px 12px;
  border-radius: 999px;
  min-height: 36px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.1s ease, color 0.1s ease;
}

#close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 26px;
  line-height: 1;
  /* large tap target on touch */
  padding: 0 4px;
  min-width: 40px;
  height: 40px;
  border-radius: 8px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.1s ease, background 0.1s ease;
}

/* -------------------------------------------------------------- messages */

#messages {
  flex: 1;
  min-height: 0;               /* let this flex item actually scroll */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
  font-size: 15px;
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

/* Right-to-left (Arabic) */
#panel[dir="rtl"] {
  direction: rtl;
  text-align: right;
}

.msg-user {
  align-self: flex-end;
  background: var(--primary, #1a1a2e);
  color: #fff;
  border-radius: 18px 18px 4px 18px;
  max-width: 85%;
  padding: 9px 13px;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.6;
  white-space: pre-wrap;
}

.msg-bot {
  align-self: flex-start;
  background: #f0f0f0;
  color: #1a1a1a;
  border-radius: 18px 18px 18px 4px;
  max-width: 85%;
  padding: 9px 13px;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.6;
  white-space: pre-wrap;
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

/* ------------------------------------------------------------- input row */

#input-row {
  border-top: 1px solid #e8e8e8;
  padding: 8px calc(8px + env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) calc(8px + env(safe-area-inset-left, 0px));
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  background: #fff;
}

#input {
  flex: 1;
  min-width: 0;
  border: 1px solid #ddd;
  border-radius: 20px;
  padding: 11px 14px;
  font-size: 16px;              /* ≥16px stops iOS zoom-on-focus */
  font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
  outline: none;
  background: #fafafa;
  -webkit-appearance: none;
  appearance: none;
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
  padding: 11px 18px;
  font-size: 15px;
  font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
  cursor: pointer;
  flex-shrink: 0;
  min-height: 44px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s ease;
}

#send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --------------------------------------------------------- hover (fine pointers only) */

@media (hover: hover) and (pointer: fine) {
  #launcher:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }
  #lang-toggle:hover {
    background: rgba(255, 255, 255, 0.28);
    color: #fff;
  }
  #close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
  #send:hover {
    opacity: 0.88;
  }
}

/* ------------------------------------------------------------ desktop card */

@media (min-width: 480px) {
  #panel {
    left: auto;
    right: auto;
    top: auto;
    width: 380px;
    height: min(520px, calc(100dvh - 120px));
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
    transform: translateY(100%) scaleY(0.95);
  }

  #panel.pos-bottom-right { bottom: 92px; right: 24px; }
  #panel.pos-bottom-left  { bottom: 92px; left: 24px; }
  #panel.pos-top-right    { top: 92px; right: 24px; }
  #panel.pos-top-left     { top: 92px; left: 24px; }

  #panel.pos-top-right,
  #panel.pos-top-left {
    transform: translateY(-100%) scaleY(0.95);
  }

  #panel.open {
    transform: translateY(0) scaleY(1);
    opacity: 1;
  }

  #launcher.pos-bottom-right { bottom: 24px; right: 24px; }
  #launcher.pos-bottom-left  { bottom: 24px; left: 24px; }
  #launcher.pos-top-right    { top: 24px; right: 24px; }
  #launcher.pos-top-left     { top: 24px; left: 24px; }

  #header { padding: 14px 16px; }
  #input-row { padding: 8px; }
  #messages { font-size: 14px; }
  .msg-user, .msg-bot { max-width: 80%; padding: 8px 12px; }
  #input { font-size: 14px; padding: 8px 14px; }
  #send { font-size: 14px; padding: 8px 18px; min-height: 0; }
}
`;