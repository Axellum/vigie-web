// Builds src/lib/data/borders.json, the simplified borders of the covered countries, from the API's own file
// (Natural Earth, public domain):
//   node scripts/build-borders.mjs ../vigie_api/app/data/countries.geojson.gz
// The "near me" page uses them to tell which country a place is in, without asking anything to anybody.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const source = process.argv[2];
if (!source) throw new Error('usage: node scripts/build-borders.mjs <countries.geojson.gz>');
// About 5 km, like the source's own spacing: enough to tell a country from its neighbours (the page adds a
// margin at borders and coasts, as the API does).
const TOLERANCE_DEG = 0.05;
// Islands smaller than this (square degrees, about 100 km² in Europe) are left out; a place on one of them
// is matched to the nearest country by the coastal margin.
const MIN_AREA_DEG2 = 0.012;
const round = (v) => Math.round(v * 1000) / 1000;

/** Douglas-Peucker on an open polyline. */
function simplify(points, tolerance) {
	if (points.length < 3) return points;
	const keep = new Uint8Array(points.length);
	keep[0] = keep[points.length - 1] = 1;
	const stack = [[0, points.length - 1]];
	while (stack.length) {
		const [first, last] = stack.pop();
		const [ax, ay] = points[first];
		const [bx, by] = points[last];
		const dx = bx - ax,
			dy = by - ay;
		const len = Math.hypot(dx, dy);
		let worst = -1,
			index = -1;
		for (let i = first + 1; i < last; i++) {
			const [px, py] = points[i];
			const d =
				len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
			if (d > worst) {
				worst = d;
				index = i;
			}
		}
		if (worst > tolerance) {
			keep[index] = 1;
			stack.push([first, index], [index, last]);
		}
	}
	return points.filter((_, i) => keep[i]);
}

/** Area of a ring in square degrees (shoelace). */
function area(points) {
	let sum = 0;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++)
		sum += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1]);
	return Math.abs(sum / 2);
}

/** A closed ring, simplified and rounded; null when too little of it is left. */
function ring(coordinates) {
	const open = coordinates.slice(0, -1);
	// Split the ring at its farthest point so that both halves keep their shape.
	let far = 0,
		best = -1;
	for (let i = 1; i < open.length; i++) {
		const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
		if (d > best) {
			best = d;
			far = i;
		}
	}
	const a = simplify(open.slice(0, far + 1), TOLERANCE_DEG);
	const b = simplify([...open.slice(far), open[0]], TOLERANCE_DEG);
	const points = [...a, ...b.slice(1)].map(([x, y]) => [round(x), round(y)]);
	const unique = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
	return unique.length >= 4 ? unique : null;
}

const collection = JSON.parse(gunzipSync(readFileSync(source)).toString('utf-8'));
const borders = {};
let before = 0,
	after = 0;
for (const feature of collection.features) {
	const cc = feature.properties.country;
	const geometry = feature.geometry;
	const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	const out = [];
	const largest = Math.max(...polygons.map((polygon) => area(polygon[0])));
	for (const polygon of polygons) {
		const outer = area(polygon[0]);
		if (outer < MIN_AREA_DEG2 && outer < largest) continue;
		const rings = [];
		for (const [i, coordinates] of polygon.entries()) {
			before += coordinates.length;
			const simplified = ring(coordinates);
			if (simplified) rings.push(simplified);
			else if (i === 0) break; // the outer ring vanished: drop the polygon (a tiny island)
		}
		if (rings.length) {
			after += rings.reduce((n, r) => n + r.length, 0);
			out.push(rings);
		}
	}
	borders[cc] = out;
}
const target = join(import.meta.dirname, '..', 'src', 'lib', 'data', 'borders.json');
writeFileSync(target, JSON.stringify(borders));
console.log(`${Object.keys(borders).length} countries, ${before} points -> ${after}, ${target}`);
