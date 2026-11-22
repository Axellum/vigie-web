import { error } from '@sveltejs/kit';
import { RAIN_FIELD_STAMP, rainFieldImagePath, rainLevelFrom } from '#lib/rainField.js';
import { ApiError, getRainField, getRainFieldImage, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// One RGBA PNG overlay of the forecast rain field: `/data/rain-field/<level>/<stamp>.png`.
// Only frames currently listed by `/v1/rain/field` are relayed, with immutable browser caching.
export const GET: RequestHandler = async ({ params }) => {
	const level = rainLevelFrom(params.level);
	const stamp = params.stamp.replace(/\.png$/, '');
	if (!level || !RAIN_FIELD_STAMP.test(stamp)) error(404, 'No such image');
	try {
		const field = (await getRainField()).value;
		const path = rainFieldImagePath(level, stamp);
		const listed = field?.levels.some((l) => l.id === level && l.frames.some((f) => f.url === path));
		if (!listed) error(404, 'No such image');
		const image = (await getRainFieldImage(level, stamp)).value;
		if (!image) error(404, 'No such image');
		return new Response(image as BodyInit, {
			headers: {
				'content-type': 'image/png',
				'cache-control': `public, max-age=${TTL_S.rainFieldImage}, immutable`
			}
		});
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
