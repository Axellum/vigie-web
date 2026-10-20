/** A name a person typed: printable, single spaces, 1 to `max` characters; null otherwise. */
export function cleanName(value: unknown, max = 60): string | null {
	if (typeof value !== 'string') return null;
	const name = value
		.normalize('NFC')
		.replace(/\p{Cc}|\p{Cf}/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
	return name.length >= 1 && name.length <= max ? name : null;
}
