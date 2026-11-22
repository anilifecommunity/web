const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function buildWasiImports(shim: Record<string, Record<string, unknown>>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const m = /^wasi:([a-z]+)\/([a-z0-9-]+)(?:@.+)?$/.exec(key);
    if (!m) throw new Error(`unrecognised WASI import ${key}`);
    const impl = shim[m[1]]?.[camel(m[2])];
    if (!impl) throw new Error(`preview2-shim has no implementation for ${key}`);
    out[key] = impl;
  }
  return out;
}
