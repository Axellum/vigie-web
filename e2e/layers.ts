import type { Page } from '@playwright/test';

// The frame of a map (the home map, the sea map): its layers are ticked in the panel of their family, opened from the rail.

/** The rail of the families of layers, in French or in English. */
export const layerRail = (page: Page) =>
	page.getByRole('group', { name: /^(Couches de la carte|Map layers)$/ });

/** Opens a family of layers ("Pluie", "Vent"…), unless it is open already. */
export async function openLayers(page: Page, family: string) {
	const button = layerRail(page).getByRole('button', { name: new RegExp(`^${family}`) });
	if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

/** Folds the family open, so that the map is free under it. */
export async function closeLayers(page: Page) {
	const close = page.getByRole('button', { name: /^(Fermer les couches|Close the layers)$/ });
	if (await close.count()) await close.click();
}
