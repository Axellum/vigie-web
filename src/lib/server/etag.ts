/** True when the `If-None-Match` of a request names this tag (weak or strong) or `*`. */
export function etagMatches(header: string | null, etag: string): boolean {
	if (!header) return false;
	const bare = (t: string) => t.replace(/^W\//, '');
	return header
		.split(',')
		.map((t) => t.trim())
		.some((t) => t === '*' || bare(t) === bare(etag));
}
