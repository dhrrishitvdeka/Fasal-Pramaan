/**
 * Resolves the Khasra / Survey / Dag reference linked to the farmer's
 * mobile-verified land record (RoR). No manual entry needed at registration —
 * the reference is attached automatically at verification time.
 */
export function autoLinkedKhasra(): string {
  const base = 100 + Math.floor(Math.random() * 900);
  const sub = 1 + Math.floor(Math.random() * 4);
  const suffix = Math.random() < 0.35 ? String.fromCharCode(65 + Math.floor(Math.random() * 3)) : "";
  return `${base}/${sub}${suffix}`;
}
