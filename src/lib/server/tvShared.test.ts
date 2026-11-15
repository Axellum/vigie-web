import { describe, expect, it, vi } from 'vitest';
import type { Borders } from '#lib/near.js';
import type { SharedPage } from './pageLinks';
import { readBlocks, readContext, type ContextReaders, type Readers } from './tvShared';
import { ApiError, BudgetError } from './vigie';

const place = (name: string, lat: number, lon: number) => ({ name, lat, lon, radiusKm: 25, profile: null });
const block = (id: string, type: SharedPage['blocks'][number]['type'], p: ReturnType<typeof place>) => ({
	id,
	type,
	size: 'm' as const,
	place: p
});
const page = (...blocks: SharedPage['blocks']): SharedPage => ({
	title: 'Page',
	blocks,
	units: {} as SharedPage['units'],
	lang: 'fr'
});

const beach = place('Plage', 43.66, -1.44);
const harbour = place('Port', 43.5, -1.5);
const cached = <T>(value: T) => ({ value, stale: false, fetchedAt: 1 });

function readers(over: Partial<Readers> = {}): Readers & {
	point: ReturnType<typeof vi.fn>;
	tide: ReturnType<typeof vi.fn>;
	aurora: ReturnType<typeof vi.fn>;
} {
	return {
		point: vi.fn(async () => cached({ marker: 'point' })),
		tide: vi.fn(async () => cached({ marker: 'tide' })),
		aurora: vi.fn(async () => cached({ marker: 'aurora' })),
		...over
	} as never;
}

describe('what a screen of a page reads', () => {
	it('asks once for a place whatever the number of its blocks, and for tide/aurora only where those cards are', async () => {
		const r = readers();
		const read = await readBlocks(
			page(
				block('aaaa0001', 'weather', beach),
				block('aaaa0002', 'sea', beach),
				block('aaaa0003', 'tide', beach),
				block('aaaa0004', 'air', harbour),
				block('aaaa0005', 'sky', beach)
			),
			r
		);
		expect(r.point).toHaveBeenCalledTimes(2); // the beach and the harbour
		expect(r.tide).toHaveBeenCalledTimes(1);
		expect(r.tide).toHaveBeenCalledWith(43.66, -1.44);
		expect(r.aurora).toHaveBeenCalledTimes(1);
		expect(r.aurora).toHaveBeenCalledWith(43.66, -1.44);
		expect([...read.keys()]).toEqual(['aaaa0001', 'aaaa0002', 'aaaa0003', 'aaaa0004', 'aaaa0005']);
		expect(read.get('aaaa0001')!.tide).toBeNull();
		expect(read.get('aaaa0001')!.aurora).toBeUndefined();
		expect(read.get('aaaa0003')!.tide).toMatchObject({ value: { marker: 'tide' } });
		expect(read.get('aaaa0004')!.point).toMatchObject({ value: { marker: 'point' } });
		expect(read.get('aaaa0005')!.aurora).toMatchObject({ value: { marker: 'aurora' } });
	});

	it('asks for shared warnings, hazards and surf once across blocks when readContext runs', async () => {
		const ctxReaders: ContextReaders = {
			served: vi.fn(async () => cached([{ country: 'FR', sources: [] }])) as never,
			warnings: vi.fn(async () => cached({ data: { marker: 'fr' }, details: new Map() })) as never,
			hazards: vi.fn(async () => cached({ marker: 'hazards' })) as never,
			surf: vi.fn(async () => cached({ marker: 'surf' })) as never,
			borders: vi.fn(async () => ({ FR: [] }) as Borders)
		};
		const ctx = await readContext(
			page(
				block('aaaa0001', 'official', beach),
				block('aaaa0002', 'official', harbour),
				block('aaaa0003', 'hazards', beach),
				block('aaaa0004', 'surf', beach)
			),
			ctxReaders
		);
		expect(ctxReaders.served).toHaveBeenCalledTimes(1);
		expect(ctxReaders.warnings).toHaveBeenCalledTimes(1);
		expect(ctxReaders.hazards).toHaveBeenCalledTimes(1);
		expect(ctxReaders.surf).toHaveBeenCalledTimes(1);
		expect(ctx.served).toEqual(['FR']);
		expect(ctx.warnings?.get('FR')?.value).toEqual({ marker: 'fr' });
	});

	it('skips context calls when no official, hazards or surf card is on the screen', async () => {
		const ctxReaders: ContextReaders = {
			served: vi.fn(),
			warnings: vi.fn(),
			hazards: vi.fn(),
			surf: vi.fn(),
			borders: vi.fn()
		} as never;
		const ctx = await readContext(page(block('aaaa0001', 'weather', beach)), ctxReaders);
		expect(ctx).toEqual({});
		expect(ctxReaders.served).not.toHaveBeenCalled();
		expect(ctxReaders.hazards).not.toHaveBeenCalled();
		expect(ctxReaders.surf).not.toHaveBeenCalled();
	});

	it('leaves out what the API does not answer, and the used-up budget of the screens, and nothing else', async () => {
		const r = readers({
			point: vi.fn(async () => {
				throw new ApiError('down', 502);
			}) as never,
			tide: vi.fn(async () => {
				throw new BudgetError('used up');
			}) as never
		});
		const read = await readBlocks(page(block('aaaa0001', 'tide', beach)), r);
		expect(read.get('aaaa0001')).toEqual({ point: null, tide: null });
	});

	it('lets a failure that is not the API’s go up: a bug must not look like a missing reading', async () => {
		const r = readers({
			point: vi.fn(async () => {
				throw new TypeError('a bug');
			}) as never
		});
		await expect(readBlocks(page(block('aaaa0001', 'weather', beach)), r)).rejects.toThrow('a bug');
	});

	it('keeps null for a tide the API does not have (inland)', async () => {
		const r = readers({ tide: vi.fn(async () => null) as never });
		const read = await readBlocks(page(block('aaaa0001', 'tide', beach)), r);
		expect(read.get('aaaa0001')!.tide).toBeNull();
		expect(read.get('aaaa0001')!.point).not.toBeNull();
	});
});
