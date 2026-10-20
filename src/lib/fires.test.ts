import { describe, expect, it } from 'vitest';
import { FIRE_LEVELS, fireLevel, fireLevelById, isTile, MAX_FIRE_TILES, tileBox, tilesInView } from './fires';

const level = (id: string) => fireLevelById(id)!;

describe('fire levels', () => {
	it('counts per cell far away and shows each detection up close', () => {
		expect(fireLevel(0).id).toBe('w5');
		expect(fireLevel(2.9).id).toBe('w5');
		expect(fireLevel(3).id).toBe('w1');
		expect(fireLevel(6).id).toBe('g025');
		expect(fireLevel(7.4).id).toBe('g025');
		expect(fireLevel(7.5).id).toBe('dots');
		expect(fireLevel(12).id).toBe('dots');
		expect(fireLevelById('nope')).toBeNull();
	});

	it('cuts each level in tiles that hold whole cells', () => {
		for (const l of FIRE_LEVELS) {
			if (l.cellDeg != null) expect((l.tileDeg / l.cellDeg) % 1).toBe(0);
		}
		expect(tileBox(level('w5'), 0, 0)).toEqual([-180, -90, 180, 90]);
		expect(tileBox(level('g025'), 0, 0)).toEqual([-180, -90, -150, -60]);
		expect(tileBox(level('dots'), 179, 89)).toEqual([178, 88, 180, 90]);
		expect(isTile(level('dots'), 179, 89)).toBe(true);
		expect(isTile(level('dots'), 180, 0)).toBe(false);
		expect(isTile(level('w1'), 0, 1)).toBe(false);
		expect(isTile(level('g025'), 1.5, 0)).toBe(false);
	});
});

describe('tiles in view', () => {
	it('asks for the one tile of the world far away', () => {
		expect(tilesInView(level('w1'), [-400, -85, 400, 85])).toEqual([[0, 0]]);
	});

	it('covers a view with the tiles it touches', () => {
		// Zambia, close: 28°E to 31°E, 16°S to 13°S.
		const tiles = tilesInView(level('dots'), [28.2, -15.9, 30.9, -13.1])!;
		expect(tiles).toEqual([
			[104, 37],
			[104, 38],
			[105, 37],
			[105, 38]
		]);
		for (const [x, y] of tiles) {
			const [w, s, e, n] = tileBox(level('dots'), x, y);
			expect(e > 28.2 && w < 30.9 && n > -15.9 && s < -13.1).toBe(true);
		}
	});

	it('wraps a view across the antimeridian', () => {
		const tiles = tilesInView(level('g025'), [170, -20, 200, -10])!;
		expect(tiles.map(([x]) => x)).toEqual([0, 11]);
		expect(tileBox(level('g025'), 11, 2)[0]).toBe(150);
	});

	it('gives up on a view that would take too many tiles', () => {
		expect(tilesInView(level('dots'), [0, 0, 100, 40])).toBeNull();
		expect(MAX_FIRE_TILES).toBeGreaterThan(20);
	});
});
