export function nowIso() {
  return new Date().toISOString();
}

export function uuid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

