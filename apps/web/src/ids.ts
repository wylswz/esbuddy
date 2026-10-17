/** A client-generated id: `<prefix>_<time>_<random>`, unique enough across peers. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
