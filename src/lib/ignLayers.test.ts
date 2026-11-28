import { afterEach, describe, expect, it, vi } from 'vitest';
import { IGN_KEY, IgnLayers } from './ignLayers.svelte';

function fakeStorage(initial: Record<string, string> = {}) {
	const held = new Map(Object.entries(initial));
	return {
		held,
		getItem: (key: string) => held.get(key) ?? null,
		setItem: (key: string, value: string) => void held.set(key, value)
	};
}

afterEach(() => vi.unstubAllGlobals());

describe('IgnLayers', () => {
	it('counts the relief and the details at first, then what the visitor ticks', () => {
		vi.stubGlobal('localStorage', fakeStorage());
		const ign = new IgnLayers();
		expect(ign.count).toBe(2);
		expect(ign.reliefOnMap('R')).toEqual({ contours: false, credit: 'R' });
		expect(ign.photoOnMap('P')).toBeNull();
		const lifts = { chairlift: 'a', gondola: 'b', other: 'c' };
		expect(ign.detailsOnMap('D', lifts)).toEqual({ credit: 'D', lifts });
		ign.photo = true;
		ign.contours = true;
		expect(ign.count).toBe(4);
		expect(ign.photoOnMap('P')).toEqual({ credit: 'P' });
		// The contour lines are counted with the relief only.
		ign.on = false;
		expect(ign.count).toBe(2);
		expect(ign.reliefOnMap('R')).toBeNull();
		ign.details = false;
		expect(ign.count).toBe(1);
		expect(ign.detailsOnMap('D', lifts)).toBeNull();
	});

	it('keeps the choice in this browser, and reads one stored when the relief was alone', () => {
		const storage = fakeStorage({ [IGN_KEY]: '{"on":false,"contours":true}' });
		vi.stubGlobal('localStorage', storage);
		const ign = new IgnLayers();
		ign.restore();
		expect([ign.on, ign.contours, ign.photo, ign.details]).toEqual([false, true, false, true]);
		ign.photo = true;
		expect(JSON.parse(storage.held.get(IGN_KEY) ?? '')).toEqual({
			on: false,
			contours: true,
			photo: true,
			details: true
		});
	});

	it('keeps the defaults when the storage refuses', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		});
		const ign = new IgnLayers();
		ign.restore();
		ign.photo = true;
		expect([ign.on, ign.contours, ign.photo, ign.details]).toEqual([true, false, true, true]);
	});
});
