// A widget cannot scroll, and its host may give it less height than its size says: the Windows widgets board gives a large
// widget about 300 × 462 pixels, and writes its name over the top 48 of them. The page then hides the parts that do not fit,
// whole, rather than cutting the last one in the middle: each optional part carries `data-drop`, a rank, and the lowest rank
// goes first (the five days before the gusts, the gusts before the wind, the wind before the spot). The warnings, the rain
// and the header have no rank: they always stay.
import type { Action } from 'svelte/action';

/** The attribute set on a part hidden for want of room. */
export const DROPPED = 'data-dropped';

/** Hides the ranked parts of `node`, lowest rank first, until what is left fits in its height. */
export function fitParts(node: HTMLElement): void {
	const parts = [...node.querySelectorAll<HTMLElement>('[data-drop]')];
	for (const part of parts) part.removeAttribute(DROPPED);
	parts.sort((a, b) => Number(a.dataset.drop) - Number(b.dataset.drop));
	for (const part of parts) {
		if (node.scrollHeight <= node.clientHeight) return;
		part.setAttribute(DROPPED, '');
	}
}

/** `use:fit` on the frame of the widget: fits again when its size, its content or its fonts change. */
export const fit: Action<HTMLElement> = (node) => {
	// Right after the change, not at the next frame: a page out of sight draws no frame, and would show its overflow for one.
	let queued = false;
	let live = true;
	const later = () => {
		if (queued) return;
		queued = true;
		queueMicrotask(() => {
			queued = false;
			if (live) fitParts(node);
		});
	};
	const resize = new ResizeObserver(later);
	resize.observe(node);
	// Only what Svelte changes (parts, texts, classes such as the layout): the attribute set here is not watched, or the page
	// would fit again for ever.
	const changes = new MutationObserver(later);
	changes.observe(node, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['class']
	});
	document.fonts?.addEventListener('loadingdone', later);
	void document.fonts?.ready.then(later);
	fitParts(node);
	return {
		destroy() {
			live = false;
			resize.disconnect();
			changes.disconnect();
			document.fonts?.removeEventListener('loadingdone', later);
		}
	};
};
