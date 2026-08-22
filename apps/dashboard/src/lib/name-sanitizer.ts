const WIN1252_MAP: Record<number, number> = {
  0x20AC: 0x80,
  0x201A: 0x82,
  0x0192: 0x83,
  0x201E: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02C6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8A,
  0x2039: 0x8B,
  0x0152: 0x8C,
  0x017D: 0x8E,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201C: 0x93,
  0x201D: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02DC: 0x98,
  0x2122: 0x99,
  0x0161: 0x9A,
  0x203A: 0x9B,
  0x0153: 0x9C,
  0x017E: 0x9E,
  0x0178: 0x9F,
};

function charToByte(c: string): number {
  const code = c.charCodeAt(0);
  if (code <= 0xFF) return code;
  return WIN1252_MAP[code] ?? 0x20;
}

export function sanitizeMojibake(text: string | null | undefined, fallback = ""): string {
  if (!text) return fallback;
  const clean = text.trim();
  if (!clean) return fallback;

  // Detect double-encoded UTF-8 mojibake (e.g. à¤•à¤¿à¤¸à¤¾à¤¨)
  if (/à[¤¥¦§ª²³´®¯°¨©¬­]/.test(clean) || /[\u00C0-\u00FF][\u0080-\u00BF]/.test(clean)) {
    try {
      const bytes = Uint8Array.from(clean, charToByte);
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (decoded && !/à[¤¥¦§ª²³´®¯°¨©¬­]/.test(decoded)) {
        return decoded.trim();
      }
    } catch {
      // ignore
    }
    return fallback;
  }
  return clean;
}

export function getFarmerNavLabel(
  profile: { name?: string | null; nameHi?: string | null } | null | undefined,
  lang = 'en',
): { name: string; initial: string } {
  const rawName = sanitizeMojibake(profile?.name, 'Farmer');
  const rawNameHi = sanitizeMojibake(profile?.nameHi, '');

  // Email address login: always display email in clean English
  if (rawName.includes('@')) {
    return {
      name: rawName,
      initial: rawName.charAt(0).toUpperCase(),
    };
  }

  const isGeneric =
    !rawName ||
    rawName.toLowerCase() === 'farmer' ||
    rawName === 'किसान' ||
    rawName.toLowerCase() === 'kisan';

  if (!isGeneric) {
    if (lang === 'hi' && rawNameHi && rawNameHi !== 'किसान') {
      return {
        name: rawNameHi,
        initial: rawNameHi.charAt(0),
      };
    }
    return {
      name: rawName,
      initial: rawName.charAt(0).toUpperCase(),
    };
  }

  if (lang === 'hi') {
    return {
      name: 'किसान',
      initial: 'क',
    };
  }

  return {
    name: 'Farmer',
    initial: 'F',
  };
}