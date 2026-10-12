// Build-time configuration for the widget.
//
// `process.env.WIDGET_*` is replaced by esbuild `define` (see build.mjs) and
// never exists at runtime in the browser — these are bake-time values only.
// Per-embed `data-*` attributes on the loaded <script> tag take precedence.

declare const process: {
  env: {
    WIDGET_API_URL?: string;
    WIDGET_BOT_NAME?: string;
    WIDGET_PRIMARY_COLOR?: string;
    WIDGET_POSITION?: string;
    WIDGET_CONTEXT_MAX_CHARS?: string;
    WIDGET_MAX_HISTORY?: string;
  };
};