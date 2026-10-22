const cosine = (a: number[], b: number[]) => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i]! * b[i]!; normA += a[i]! * a[i]!; normB += b[i]! * b[i]!; }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
};

/**
 * Each source joins the group whose centroid it most resembles, when that
 * similarity reaches the threshold; otherwise it starts its own group. Comparing
 * against centroids keeps one bridging ticket from chaining unrelated matters.
 */
export function groupBySimilarity(vectors: Map<string, number[]>, threshold: number): string[][] {
  const groups: { ids: string[]; centroid: number[] }[] = [];
  for (const id of [...vectors.keys()].sort()) {
    const vector = vectors.get(id)!;
    let best: (typeof groups)[number] | undefined;
    let bestScore = threshold;
    for (const group of groups) {
      const score = cosine(vector, group.centroid);
      if (score >= bestScore) { best = group; bestScore = score; }
    }
    if (!best) { groups.push({ ids: [id], centroid: [...vector] }); continue; }
    best.centroid = best.centroid.map((value, i) => (value * best!.ids.length + vector[i]!) / (best!.ids.length + 1));
    best.ids.push(id);
  }
  return groups.map((group) => group.ids);
}

