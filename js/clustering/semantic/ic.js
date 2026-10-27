// clustering/semantic/ic.js: Information-content similarity (Resnik, Lin, Rel, Jiang). No DOM access.

// ── IC-based semantic similarity ──────────────────────────────────────────────
// Requires _goIC to be populated (embedded via build_go_dag.py --ic)
// All methods find MICA (most informative common ancestor) via Wang ancestor traversal
export function getMICA(idA, idB, dag, ic) {
  // Get all ancestors of A and B (using same getSV traversal for ancestor set)
  function getAncestors(termId) {
    const visited = new Set([termId]);
    let current = [termId];
    while (current.length) {
      const next = [];
      for (const curr of current) {
        const term = dag[curr]; if (!term) continue;
        for (const [pid] of term.p) {
          if (!visited.has(pid)) { visited.add(pid); next.push(pid); }
        }
      }
      current = next;
    }
    return visited;
  }
  const ancA = getAncestors(idA);
  const ancB = getAncestors(idB);
  // Common ancestors = intersection
  let bestIC = -1, mica = null;
  for (const t of ancA) {
    if (ancB.has(t) && ic[t] !== undefined) {
      if (ic[t] > bestIC) { bestIC = ic[t]; mica = t; }
    }
  }
  return { mica, micaIC: bestIC };
}

export function icSimilarity(idA, idB, dag, ic, method) {
  if (idA === idB) return 1.0;
  const icA = ic[idA], icB = ic[idB];
  if (icA === undefined || icB === undefined) return NaN;
  if (icA === 0 && icB === 0) return 1.0;
  const { micaIC } = getMICA(idA, idB, dag, ic);
  if (micaIC < 0) return NaN;

  switch (method) {
    case 'Resnik':
      // sim = IC(MICA) — not bounded to [0,1], normalise later by max IC
      return micaIC;
    case 'Lin':
      if (icA + icB === 0) return 0;
      return (2 * micaIC) / (icA + icB);
    case 'Rel': {
      // P(MICA) = exp(-IC(MICA)); sim = 2*IC(MICA)/(icA+icB) * (1 - P(MICA))
      if (icA + icB === 0) return 0;
      const pMica = Math.exp(-micaIC);
      return (2 * micaIC) / (icA + icB) * (1 - pMica);
    }
    case 'Jiang': {
      // distance = IC(A) + IC(B) - 2*IC(MICA), clamped to [0,1]
      // similarity = 1 - min(1, distance)
      const dist = Math.max(0, icA + icB - 2 * micaIC);
      return 1 - Math.min(1, dist);
    }
    default:
      return NaN;
  }
}
