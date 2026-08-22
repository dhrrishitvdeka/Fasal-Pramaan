export type AreaUnit = 'kattha' | 'bigha' | 'acre' | 'hectare';

// 1 Kattha in standard North/East Indian revenue (Bihar, UP, Jharkhand, Nepal) = 1361.25 sq ft
// 20 Kattha = 1 Bigha (27,225 sq ft = 0.252929 Ha)
// 1 Kattha = 0.0126464 Hectares ≈ 0.01265 Ha
// 1 Kattha = 0.03125 Acres (32 Kattha = 1 Acre)
export const KATTHA_IN_HECTARES = 0.01265;
export const KATTHA_IN_ACRES = 0.03125;
export const KATTHA_IN_BIGHA = 0.05; // 1/20
export const KATTHA_IN_SQFT = 1361.25;

export function katthaToHectares(kattha: number): number {
  if (!Number.isFinite(kattha) || kattha <= 0) return 0;
  return Number((kattha * KATTHA_IN_HECTARES).toFixed(4));
}

export function hectaresToKattha(hectares: number): number {
  if (!Number.isFinite(hectares) || hectares <= 0) return 0;
  return Number((hectares / KATTHA_IN_HECTARES).toFixed(2));
}

export function katthaToBigha(kattha: number): number {
  if (!Number.isFinite(kattha) || kattha <= 0) return 0;
  return Number((kattha * KATTHA_IN_BIGHA).toFixed(2));
}

export function katthaToAcres(kattha: number): number {
  if (!Number.isFinite(kattha) || kattha <= 0) return 0;
  return Number((kattha * KATTHA_IN_ACRES).toFixed(3));
}

export function toKattha(value: number, unit: AreaUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (unit) {
    case 'kattha':
      return value;
    case 'bigha':
      return value * 20;
    case 'acre':
      return value * 32;
    case 'hectare':
      return value / KATTHA_IN_HECTARES;
    default:
      return value;
  }
}

export function getAreaBreakdown(kattha: number) {
  const k = Math.max(0, kattha || 0);
  return {
    kattha: Number(k.toFixed(2)),
    bigha: katthaToBigha(k),
    acres: katthaToAcres(k),
    hectares: katthaToHectares(k),
    sqFt: Number((k * KATTHA_IN_SQFT).toFixed(0)),
  };
}

export function formatAreaDisplay(
  hectaresOrKattha: number,
  isHectares = true,
  lang = 'en',
): { primary: string; secondary: string } {
  const kattha = isHectares ? hectaresToKattha(hectaresOrKattha) : hectaresOrKattha;
  const hectares = isHectares ? hectaresOrKattha : katthaToHectares(hectaresOrKattha);
  const bigha = katthaToBigha(kattha);
  const acres = katthaToAcres(kattha);

  const isHindi = lang === 'hi';
  const unitKattha = isHindi ? 'कट्ठा' : 'Kattha';
  const unitBigha = isHindi ? 'बीघा' : 'Bigha';
  const unitAcre = isHindi ? 'एकड़' : 'Acre';
  const unitHa = isHindi ? 'हेक्टेयर' : 'Ha';

  return {
    primary: `${kattha} ${unitKattha}`,
    secondary: `~${bigha} ${unitBigha} · ${hectares} ${unitHa} · ${acres} ${unitAcre}`,
  };
}
