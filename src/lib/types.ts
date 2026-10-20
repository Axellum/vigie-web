// The site's own view of the Vigie API data. Every field the API did not give stays null.
import type { Geometry } from 'geojson';

export type Level = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';

export interface Hazard {
	id: string;
	category: string;
	level: Level | null;
	title: string;
	source: string;
	sources: string[];
	time: number | null;
	value: number | null;
	unit: string | null;
	depthKm: number | null;
	tsunami: boolean | null;
	lon: number;
	lat: number;
	attribution: string | null;
}

export interface HazardsData {
	generated: number | null;
	attribution: string | null;
	items: Hazard[];
}

/** A text of a warning in one language, as the issuer wrote it. */
export interface WarningText {
	language: string;
	senderName: string | null;
	event: string | null;
	headline: string | null;
	description: string | null;
	instruction: string | null;
}

export interface WarningSummary {
	/** The site's id: the message identifier and the area. */
	id: string;
	cc: string;
	source: string;
	level: Level | null;
	levelOriginal: string | null;
	phenomenon: string | null;
	area: string | null;
	sent: number | null;
	onset: number | null;
	expires: number | null;
	ends: number | null;
	/** Key of the shape in `WarningsData.shapes`, or null when the warning cannot be placed on a map. */
	shape: string | null;
	/** Short texts (headline and event) in every language the issuer gave. */
	texts: Pick<WarningText, 'language' | 'headline' | 'event'>[];
}

export interface WarningDetail extends Omit<WarningSummary, 'texts'> {
	/** Identifier of the official message (shared by the areas it covers). */
	identifier: string;
	texts: WarningText[];
	issuer: string | null;
	event: string | null;
	status: string | null;
	messageType: string | null;
	link: string | null;
	web: string | null;
	attribution: string | null;
	derived: string[];
	geometrySource: string | null;
	geometry: Geometry | null;
}

export interface Coverage {
	source: string;
	country: string;
	status: string;
	warningsInFeed: number | null;
	warningsNotMatchable: number | null;
	note: string | null;
}

export interface WarningsData {
	cc: string;
	generated: number | null;
	coverage: Coverage[];
	attributions: string[];
	disclaimer: string | null;
	shapes: Record<string, Geometry>;
	warnings: WarningSummary[];
}

export interface Provider {
	name: string;
	healthy: boolean | null;
	[key: string]: unknown;
}
