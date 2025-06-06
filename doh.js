if (globalThis.window === undefined) {
  await import("./doh_js/index.js");
} else {
  await import("./doh_js/deploy.js");
}

const Doh = globalThis.Doh;
export { Doh };
export { Doh as default };
