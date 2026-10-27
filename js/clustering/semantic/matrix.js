// clustering/semantic/matrix.js: Pairwise similarity matrix for a list of GO terms. No DOM access.
import { icSimilarity } from './ic.js';
import { wangSimilarity } from './wang.js';

export function computeSimilarityMatrix(termIds, dag, ic, method) {
  const n = termIds.length;
  const sim = Array.from({length:n}, () => new Array(n).fill(0));
  const useWang = method === 'Wang';

  // Resnik needs normalisation by max pairwise IC(MICA)
  let resnikVals = useWang ? null : [];

  for (let i = 0; i < n; i++) {
    sim[i][i] = 1.0;
    for (let j = i+1; j < n; j++) {
      let s;
      if (useWang) {
        s = wangSimilarity(termIds[i], termIds[j], dag);
      } else {
        s = icSimilarity(termIds[i], termIds[j], dag, ic, method);
        if (method === 'Resnik' && !isNaN(s)) resnikVals.push(s);
      }
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  // Normalise Resnik to [0,1] by dividing by max IC value across all terms
  if (method === 'Resnik') {
    const maxIC = Math.max(...Object.values(ic).filter(v => isFinite(v)));
    if (maxIC > 0) {
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          if (i !== j && !isNaN(sim[i][j])) sim[i][j] = Math.min(1, sim[i][j] / maxIC);
    }
  }

  return sim;
}
