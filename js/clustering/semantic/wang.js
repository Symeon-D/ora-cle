// clustering/semantic/wang.js: Wang semantic similarity (replicates GOSemSim getSV). No DOM access.

// Wang semantic similarity — exact replication of GOSemSim getSV()
// Uses gotbl parent structure: BFS, first-path-wins, topNode sv=0
export function wangSimilarity(idA, idB, dag) {
  if (idA === idB) return 1.0;
  if (!dag[idA] && !dag[idB]) return 0.0;

  function getSV(termId) {
    const sv = {}; sv[termId] = 1.0;
    let current = [termId];
    while (current.length) {
      const next = [];
      for (const curr of current) {
        const term = dag[curr]; if (!term) continue;
        for (const [pid, w] of term.p) {
          if (!(pid in sv)) {          // first path wins — matches GOSemSim
            sv[pid] = w * sv[curr];
          }
          next.push(pid);
        }
      }
      current = next;
    }
    sv['all'] = 0;  // topNode gets 0 — matches GOSemSim
    return sv;
  }

  const svA = getSV(idA), svB = getSV(idB);
  let shared = 0;
  for (const id in svA) { if (id in svB) shared += svA[id] + svB[id]; }
  const sumA = Object.values(svA).reduce((a,b)=>a+b,0);
  const sumB = Object.values(svB).reduce((a,b)=>a+b,0);
  if (sumA + sumB === 0) return 0;
  return shared / (sumA + sumB);
}
