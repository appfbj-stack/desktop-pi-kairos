/**
 * Tipos da API exposta pelo preload no `window.kairos`.
 *
 * Sprint 1.2: API completa (ping, start, send, onAgentEvent, stop, provider, listTools).
 */

import type { KairosAPI } from "../preload/index.js";

declare global {
  interface Window {
    kairos?: KairosAPI;
    kairosPath?: {
      fromFile: (file: File) => string;
    };
  }
}

export {};
