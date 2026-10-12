let nameToCode: Map<string, string> | null = null;

function buildMap() {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      const name = names.of(code);
      if (name && name !== code) map.set(name.toLowerCase(), code);
    }
  }
  return map;
}

export function countryToCode(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  nameToCode ??= buildMap();
  return nameToCode.get(raw.toLowerCase()) ?? null;
}
