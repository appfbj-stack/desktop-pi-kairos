/** Cosine similarity entre dois vetores. Numerico-estavel. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Converte Float32Array <-> Buffer pra persistir embeddings no SQLite. */
export function floatArrayToBuffer(arr: number[]): Buffer {
  const buf = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i] ?? 0, i * 4);
  return buf;
}

export function bufferToFloatArray(buf: Buffer): number[] {
  if (!buf || buf.length === 0) return [];
  const n = Math.floor(buf.length / 4);
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = buf.readFloatLE(i * 4);
  return arr;
}
