/**
 * PMFBY & Indian Agricultural Crop Synonym Matching.
 * Resolves declared crops and AI-detected crops (e.g. paddy <-> rice,
 * maize <-> corn, gram <-> chickpea, wheat <-> gehun) to prevent false
 * 'wrong_crop' gate rejections.
 */

// Equivalence clusters for Indian crops under PMFBY / CROPIC
const CROP_CLUSTERS: string[][] = [
  // Paddy / Rice
  ["paddy", "rice", "dhan", "dhaan", "chawal", "oryza", "oryza sativa", "asian rice", "rough rice"],
  // Maize / Corn
  ["maize", "corn", "makka", "makkai", "bhutta", "zea mays", "sweet corn", "field corn"],
  // Gram / Chickpea / Chana
  ["gram", "chickpea", "chana", "bengal gram", "garbanzo", "cicer arietinum", "kabuli chana", "desi chana", "chana dal"],
  // Wheat
  ["wheat", "gehun", "gehu", "kanak", "gandum", "triticum", "triticum aestivum"],
  // Mustard / Rapeseed / Sarson
  ["mustard", "rapeseed", "sarson", "raya", "toria", "brassica", "canola", "mustard seed", "brassica juncea", "brassica napus"],
  // Cotton
  ["cotton", "kapas", "kapasi", "gossypium", "raw cotton"],
  // Soybean
  ["soybean", "soy", "soya", "soya bean", "glycine max"],
  // Sugarcane
  ["sugarcane", "sugar cane", "ganna", "saccharum", "saccharum officinarum", "cane"],
  // Groundnut / Peanut
  ["groundnut", "peanut", "mungfali", "moongphali", "singdana", "arachis", "arachis hypogaea"],
  // Onion
  ["onion", "pyaz", "pyaaz", "kanda", "allium cepa", "red onion", "white onion"],
  // Potato
  ["potato", "aloo", "alu", "batata", "solanum tuberosum"],
  // Tomato
  ["tomato", "tamatar", "solanum lycopersicum"],
  // Chilli
  ["chilli", "chili", "mirch", "mirchi", "green chilli", "red chilli", "capsicum", "capsicum annuum"],
  // Pulses / Dal / Legumes
  ["pulses", "dal", "daal", "pulse", "legume", "legumes"],
  // Bajra / Pearl Millet
  ["bajra", "pearl millet", "millet", "millets", "bajri", "pennisetum glaucum"],
  // Jowar / Sorghum
  ["jowar", "sorghum", "chari", "great millet", "sorghum bicolor"],
  // Barley
  ["barley", "jau", "hordeum", "hordeum vulgare"],
  // Pigeonpea / Arhar / Tur
  ["pigeon pea", "pigeonpea", "arhar", "tur", "toor", "red gram", "cajanus cajan"],
  // Moong / Green Gram
  ["moong", "mung", "mung bean", "green gram", "moong dal", "vigna radiata"],
  // Urad / Black Gram
  ["urad", "mash", "black gram", "urad dal", "vigna mungo"],
  // Lentil / Masur
  ["lentil", "masur", "masoor", "lens culinaris"],
];

// Lookup map from normalized term to cluster index
const TERM_TO_CLUSTER = new Map<string, number>();
CROP_CLUSTERS.forEach((cluster, idx) => {
  cluster.forEach((term) => {
    TERM_TO_CLUSTER.set(term.toLowerCase().trim(), idx);
  });
});

const BROAD_PULSES_CLUSTER_IDX = 13;
const SPECIFIC_PULSE_CLUSTER_IDXS = new Set([2, 17, 18, 19, 20]);
const GENERIC_CROP_TOKENS = new Set([
  "crop", "crops", "field", "fields", "plant", "plants", "grain", "grains",
  "gram", "millet", "millets", "bean", "beans", "pea", "peas", "seed", "seeds",
  "dal", "daal", "pulse", "pulses", "desi", "hybrid", "raw", "asian",
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes a crop string by trimming, lowercasing, stripping punctuation,
 * and discarding noise words like "crop", "field", "plants", "foliage", "stand".
 */
export function normalizeCropName(name?: string | null): string {
  if (!name) return "";
  let clean = name.toLowerCase().trim();
  clean = clean.replace(/[\/\\(),._-]/g, " ");
  clean = clean.replace(/\b(crop|crops|field|fields|plant|plants|foliage|stand|cultivation|canopy)\b/gi, " ");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

function matchSingleTerms(t1: string, t2: string): boolean {
  if (!t1 || !t2) return true;
  if (t1 === "unknown" || t2 === "unknown") return true;
  if (t1 === t2) return true;

  const c1 = TERM_TO_CLUSTER.get(t1);
  const c2 = TERM_TO_CLUSTER.get(t2);
  if (c1 != null && c2 != null) {
    if (c1 === c2) return true;
    if (c1 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(c2)) return true;
    if (c2 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(c1)) return true;
    return false;
  }

  // Word-boundary phrase containment if substantive non-generic word
  if (!GENERIC_CROP_TOKENS.has(t1) && new RegExp(`\\b${escapeRegex(t1)}\\b`).test(t2)) {
    return true;
  }
  if (!GENERIC_CROP_TOKENS.has(t2) && new RegExp(`\\b${escapeRegex(t2)}\\b`).test(t1)) {
    return true;
  }

  return false;
}

/**
 * Checks whether two crop names match, taking into account:
 * 1. Exact string matches & case-insensitivity
 * 2. Multi-dialect Indian agronomic synonyms (paddy <-> rice, maize <-> corn, etc.)
 * 3. Composite strings like "paddy / rice" or "Gram (Chickpea)"
 * 4. Distinct pulse differentiation (e.g. black gram vs green gram are distinct)
 */
export function isCropMatch(crop1?: string | null, crop2?: string | null): boolean {
  if (!crop1 || !crop2) return true;
  const norm1 = normalizeCropName(crop1);
  const norm2 = normalizeCropName(crop2);

  if (!norm1 || !norm2) return true;
  if (norm1 === "unknown" || norm2 === "unknown") return true;
  if (norm1 === norm2) return true;

  // Check cluster for full normalized strings
  const cluster1 = TERM_TO_CLUSTER.get(norm1);
  const cluster2 = TERM_TO_CLUSTER.get(norm2);
  if (cluster1 != null && cluster2 != null) {
    if (cluster1 === cluster2) return true;
    if (cluster1 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(cluster2)) return true;
    if (cluster2 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(cluster1)) return true;
    return false;
  }

  // Check composite raw strings with slashes / parentheses e.g. "paddy / rice"
  const rawSegments1 = String(crop1).toLowerCase().split(/[\/\\,()|]/).map(normalizeCropName).filter(Boolean);
  const rawSegments2 = String(crop2).toLowerCase().split(/[\/\\,()|]/).map(normalizeCropName).filter(Boolean);

  if (rawSegments1.length > 1 || rawSegments2.length > 1) {
    for (const r1 of rawSegments1) {
      for (const r2 of rawSegments2) {
        if (matchSingleTerms(r1, r2)) return true;
      }
    }
  }

  // If one term was recognized in a cluster and the other has matching tokens
  if (cluster1 != null) {
    const tokens2 = norm2.split(/\s+/).filter((t) => !GENERIC_CROP_TOKENS.has(t));
    for (const t2 of tokens2) {
      const c2 = TERM_TO_CLUSTER.get(t2);
      if (c2 != null) {
        if (c2 === cluster1) return true;
        if (cluster1 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(c2)) return true;
        if (c2 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(cluster1)) return true;
      }
    }
  }
  if (cluster2 != null) {
    const tokens1 = norm1.split(/\s+/).filter((t) => !GENERIC_CROP_TOKENS.has(t));
    for (const t1 of tokens1) {
      const c1 = TERM_TO_CLUSTER.get(t1);
      if (c1 != null) {
        if (c1 === cluster2) return true;
        if (cluster2 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(c1)) return true;
        if (c1 === BROAD_PULSES_CLUSTER_IDX && SPECIFIC_PULSE_CLUSTER_IDXS.has(cluster2)) return true;
      }
    }
  }

  return matchSingleTerms(norm1, norm2);
}

/**
 * True if both are specified and clearly different crops.
 */
export function isCropMismatch(declared?: string | null, detected?: string | null): boolean {
  if (!declared || !detected) return false;
  const d = normalizeCropName(declared);
  const s = normalizeCropName(detected);
  if (!d || !s || s === "unknown" || d === "unknown") return false;
  return !isCropMatch(declared, detected);
}

