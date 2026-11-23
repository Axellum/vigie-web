// The official warning zones as the map draws them, and what changed between two lists of them. A country's zones weigh up to
// a few megabytes (Germany: 750 zones, 80,000 points), and a whole view of Europe was sent again to the map's worker each time
// one country answered or the map stopped moving. A zone that did not change now keeps the same object from one list to the
// next, so the map is told only about the zones that are new, gone or changed.
import type { Feature } from 'geojson';
import { sameGeometry } from './geo';
import { maxLevel } from './levels';
import type { Level, WarningsData } from './types';

/**
 * One feature per zone of a country that has a warning to show: its key (`CC|shape`), its highest level and how many warnings
 * it holds. A zone drawn as in `previous` (the list this function gave the last time for the same country) is the same object.
 */
export function zoneFeatures(
	cc: string,
	data: WarningsData,
	shown: (level: Level | null) => boolean,
	previous: readonly Feature[] = []
): Feature[] {
	const before = new Map<unknown, Feature>();
	for (const f of previous) before.set(f.properties?.key, f);
	const byShape = new Map<string, Level[]>();
	for (const w of data.warnings) {
		if (!w.shape || !shown(w.level)) continue;
		const list = byShape.get(w.shape) ?? [];
		list.push(w.level as Level);
		byShape.set(w.shape, list);
	}
	const features: Feature[] = [];
	for (const [shape, list] of byShape) {
		const geometry = data.shapes[shape];
		if (!geometry) continue;
		const key = `${cc}|${shape}`;
		const level = maxLevel(list) ?? 'NONE';
		const old = before.get(key);
		features.push(
			old &&
				old.properties?.level === level &&
				old.properties?.n === list.length &&
				sameGeometry(old.geometry, geometry)
				? old
				: { type: 'Feature', geometry, properties: { key, level, n: list.length } }
		);
	}
	return features;
}

/** The features by their `key` property, or null when one has none or two share one: such a list is only replaced whole. */
export function byKey(features: readonly Feature[]): Map<string, Feature> | null {
	const keyed = new Map<string, Feature>();
	for (const f of features) {
		const key = f.properties?.key;
		if (typeof key !== 'string' || keyed.has(key)) return null;
		keyed.set(key, f);
	}
	return keyed;
}

export interface FeatureChanges {
	/** New features, and those that replace one of the same key. */
	add: Feature[];
	/** Keys that are gone. */
	remove: string[];
	/** How many features are the same objects as before. */
	kept: number;
}

/** What to tell a map that holds `held` so that it holds `next`: only the objects that differ. */
export function featureChanges(
	held: ReadonlyMap<string, Feature>,
	next: ReadonlyMap<string, Feature>
): FeatureChanges {
	const add: Feature[] = [];
	const remove: string[] = [];
	let kept = 0;
	for (const [key, f] of next) {
		if (held.get(key) === f) kept++;
		else add.push(f);
	}
	for (const key of held.keys()) if (!next.has(key)) remove.push(key);
	return { add, remove, kept };
}
