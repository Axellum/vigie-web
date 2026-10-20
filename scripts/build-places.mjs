// Builds data/places.tsv.gz, the places the "near me" page can search by name, from two GeoNames files
// (https://download.geonames.org/export/dump/, CC BY 4.0):
//   node scripts/build-places.mjs <cities500.txt> <admin1CodesASCII.txt>
// One line per place: name, other names (|), country, region, latitude, longitude, population.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const [citiesPath, admin1Path] = process.argv.slice(2);
if (!citiesPath || !admin1Path) {
	throw new Error('usage: node scripts/build-places.mjs <cities500.txt> <admin1CodesASCII.txt>');
}
// Other names (another language's name of a city: Londres, Genève, Köln) only for places this large: they
// are what people search in another language, and they would multiply the size for every village.
const ALT_NAMES_FROM_POPULATION = 100_000;
// A name in the Latin script that starts with a capital: leaves out the airport codes (GVA) and the
// lowercase transliterations.
const LATIN = /^\p{Lu}[\p{Script=Latin}\p{M}\s'’.\-()]+$/u;
const CODE = /^[\p{Lu}\d]+$/u;
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const clean = (s) => s.replace(/[\t\n|]/g, ' ').trim();

const regions = new Map();
for (const line of readFileSync(admin1Path, 'utf-8').split('\n')) {
	const [code, name] = line.split('\t');
	if (code && name) regions.set(code, clean(name));
}

const out = [];
let alternates = 0;
for (const line of readFileSync(citiesPath, 'utf-8').split('\n')) {
	const f = line.split('\t');
	if (f.length < 15) continue;
	const [, name, ascii, altnames, lat, lon, , , cc, , admin1, , , , population] = f;
	const pop = Number(population) || 0;
	const others = new Set();
	const own = new Set([fold(name), fold(ascii)]);
	if (fold(ascii) !== fold(name)) others.add(clean(ascii));
	if (pop >= ALT_NAMES_FROM_POPULATION) {
		for (const alt of altnames.split(',')) {
			const a = clean(alt);
			if (a.length < 3 || a.length > 40 || !LATIN.test(a) || CODE.test(a)) continue;
			const key = fold(a);
			if (own.has(key)) continue;
			own.add(key);
			others.add(a);
		}
	}
	alternates += others.size;
	out.push(
		[
			clean(name),
			[...others].join('|'),
			cc,
			regions.get(`${cc}.${admin1}`) ?? '',
			Number(lat).toFixed(4),
			Number(lon).toFixed(4),
			pop
		].join('\t')
	);
}
const target = join(import.meta.dirname, '..', 'data', 'places.tsv.gz');
const body = gzipSync(out.join('\n') + '\n', { level: 9 });
writeFileSync(target, body);
console.log(`${out.length} places, ${alternates} other names, ${body.length} bytes -> ${target}`);
