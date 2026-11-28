import type { Page } from '@playwright/test';

// The frame of a map (the home map, the sea map): its layers are ticked in the panel of their family, opened from the rail.

/** The rail of the families of layers, in French or in English. */
export const layerRail = (page: Page) =>
	page.getByRole('group', { name: /^(Couches de la carte|Map layers)$/ });

// On the home map the rain and the wind are layers of the weather family, the tide one of the sea family; the sea map keeps
// them as families of their own.
const HOME_FAMILY: Record<string, string> = {
	Pluie: 'Météo',
	Vent: 'Météo',
	Marée: 'Mer',
	Rain: 'Weather',
	Wind: 'Weather',
	Tide: 'Sea'
};

/** Opens a family of layers ("Pluie", "Vent"…), unless it is open already. */
export async function openLayers(page: Page, family: string) {
	const rail = layerRail(page);
	let button = rail.getByRole('button', { name: new RegExp(`^${family}`) });
	if (!(await button.count()) && HOME_FAMILY[family])
		button = rail.getByRole('button', { name: new RegExp(`^${HOME_FAMILY[family]}`) });
	if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

/** Folds the family open, so that the map is free under it. */
export async function closeLayers(page: Page) {
	const close = page.getByRole('button', { name: /^(Fermer les couches|Close the layers)$/ });
	if (await close.count()) await close.click();
}
