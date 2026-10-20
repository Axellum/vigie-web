import type { Level } from './types';

export const LEVELS: Level[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN'];

const RANK: Record<Level, number> = { RED: 3, ORANGE: 2, YELLOW: 1, GREEN: 0 };

/** Rank of a level, -1 when unknown, so that unknown levels sort last. */
export function rank(level: Level | null | undefined): number {
	return level ? RANK[level] : -1;
}

export function asLevel(value: unknown): Level | null {
	return value === 'RED' || value === 'ORANGE' || value === 'YELLOW' || value === 'GREEN' ? value : null;
}

/** The highest of several levels, or null when none is known. */
export function maxLevel(levels: (Level | null)[]): Level | null {
	let best: Level | null = null;
	for (const level of levels) if (rank(level) > rank(best)) best = level;
	return best;
}

/** Sort by level (highest first), then by time (most recent first). */
export function byLevelThenTime<T extends { level: Level | null; time?: number | null }>(a: T, b: T): number {
	return rank(b.level) - rank(a.level) || (b.time ?? 0) - (a.time ?? 0);
}
