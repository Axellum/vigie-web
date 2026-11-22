import { error } from '@sveltejs/kit';
import { ApiError, getWindField, getWindFieldImage, TTL_S } from '#lib/server/vigie.js';
import { FIELD_STAMP, fieldImagePath, type FieldLevelId } from '#lib/windField.js';
import type { RequestHandler } from './$types';

// One image of the forecast wind, /data/wind-field/<level>/<hour>-<run>.png. Only the images of the hour the site lists are relayed,
// so that the addresses a visitor can ask for stay few. An image never changes: kept a day by browsers.
export const GET: RequestHandler = async ({ params }) => {
	const level = params.level as FieldLevelId;
	const stamp = params.stamp.replace(/\.png$/, '');
	if (!FIELD_STAMP.test(stamp)) error(404, 'No such image');
	try {
		const listed = (await getWindField()).value?.levels.some((l) => l.image === fieldImagePath(level, stamp));
		if (!listed) error(404, 'No such image');
		const image = (await getWindFieldImage(level, stamp)).value;
		if (!image) error(404, 'No such image');
		return new Response(image as BodyInit, {
			headers: {
				'content-type': 'image/png',
				'cache-control': `public, max-age=${TTL_S.windFieldImage}, immutable`
			}
		});
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
