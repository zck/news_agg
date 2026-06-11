//
// Cluster-keyed interest ratings, persisted to localStorage. Solves the
// "lead drift" problem: when the lead article of a cluster changes between
// refreshes (e.g. a higher-importance article joins), the user's prior
// rating for that cluster shouldn't disappear just because the row's lead
// id changed.
//
// Storage shape: Record<fingerprint, ClusterRating> where fingerprint is the
// sorted member-id list. On read, an exact fingerprint match wins; otherwise
// we fall back to a Jaccard-similarity match against stored fingerprints —
// so partial cluster reshapes (a few new members, a few aged out) still
// recover the rating.

import type { InterestLevel } from "@/lib/scanViewModel";

export type ClusterRating = {
  interest: InterestLevel;
  ratedAt: string;       // ISO timestamp
  memberIds: string[];   // members at rating time, used for Jaccard match
};

export type ClusterRatingStore = Record<string, ClusterRating>;

const JACCARD_THRESHOLD = 0.5;

export function fingerprintFromIds(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length && !b.length) return 0;
  const setA = new Set(a);
  let intersection = 0;
  for (const x of b) {
    if (setA.has(x)) intersection += 1;
  }
  const union = setA.size + b.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type ClusterRatingMatch = {
  rating: ClusterRating;
  fingerprint: string;
  exact: boolean;
};

// Find a stored rating that matches the given member set. Exact fingerprint
// match wins. Otherwise the highest-Jaccard candidate over the threshold.
export function findClusterRating(
  memberIds: readonly string[],
  store: ClusterRatingStore,
): ClusterRatingMatch | null {
  if (!memberIds.length) return null;
  const fp = fingerprintFromIds(memberIds);
  const exact = store[fp];
  if (exact) return { rating: exact, fingerprint: fp, exact: true };

  let best: ClusterRatingMatch | null = null;
  let bestScore = JACCARD_THRESHOLD;
  for (const [fingerprint, rating] of Object.entries(store)) {
    const score = jaccard(rating.memberIds, memberIds);
    if (score >= bestScore) {
      best = { rating, fingerprint, exact: false };
      bestScore = score;
    }
  }
  return best;
}

// Write a rating for the given members. If a Jaccard-matching prior rating
// exists under a different fingerprint, drop the old key so we don't
// accumulate stale entries as clusters reshape.
export function setClusterRating(
  memberIds: readonly string[],
  interest: InterestLevel,
  store: ClusterRatingStore,
): ClusterRatingStore {
  const fp = fingerprintFromIds(memberIds);
  const next: ClusterRatingStore = { ...store };
  const prior = findClusterRating(memberIds, store);
  if (prior && !prior.exact && prior.fingerprint !== fp) {
    delete next[prior.fingerprint];
  }
  next[fp] = {
    interest,
    ratedAt: new Date().toISOString(),
    memberIds: [...memberIds],
  };
  return next;
}

// Clear the rating that matches the given members (exact or Jaccard).
export function clearClusterRating(
  memberIds: readonly string[],
  store: ClusterRatingStore,
): ClusterRatingStore {
  const match = findClusterRating(memberIds, store);
  if (!match) return store;
  const next = { ...store };
  delete next[match.fingerprint];
  return next;
}
