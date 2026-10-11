// src/ambient.d.ts
declare module "*.html" {
  const content: string;
  export default content;
}

declare module "*.js" {
  const content: string;
  export default content;
}
