// clustering/semantic/linkage.js: Complete-linkage hierarchical clustering on a similarity matrix. No DOM access.

// Complete-linkage hierarchical clustering — threshold is DISTANCE (1-sim), matching R's hclust+cutree
export function hierarchicalCluster(simMatrix, distThreshold) {
  const n = simMatrix.length;
  let clusters = Array.from({length:n},(_,i)=>[i]);
  while (true) {
    // complete linkage: distance between clusters = MAX distance between members
    // = 1 - MIN similarity between members
    let bestDist=Infinity, bestI=-1, bestJ=-1;
    for (let i=0;i<clusters.length;i++) {
      for (let j=i+1;j<clusters.length;j++) {
        let minSim=Infinity;
        for (const a of clusters[i]) for (const b of clusters[j]) {
          const s=simMatrix[a][b]; if (s<minSim) minSim=s;
        }
        const dist = 1 - minSim;  // convert to distance
        if (dist<bestDist) { bestDist=dist; bestI=i; bestJ=j; }
      }
    }
    // merge if distance <= threshold (same as R cutree h=threshold)
    if (bestDist>distThreshold||bestI===-1) break;
    clusters[bestI]=clusters[bestI].concat(clusters[bestJ]);
    clusters.splice(bestJ,1);
  }
  const assignment=new Array(n);
  clusters.forEach((members,ci)=>members.forEach(idx=>{assignment[idx]=ci;}));
  return assignment;
}
