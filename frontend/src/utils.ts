import { DensityPoint } from "./types";

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function aggregateDensityPoints(points: DensityPoint[], bucketSize: number): DensityPoint[] {
  if (bucketSize <= 1) {
    return points;
  }

  const grouped = new Map<number, number>();
  for (const point of points) {
    const bucket = Math.floor(point.second / bucketSize) * bucketSize;
    grouped.set(bucket, (grouped.get(bucket) ?? 0) + point.count);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([second, count]) => ({ second, count }));
}
