import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollWhileVisible } from './pollVisible';

// A stand-in for `document`: only what the helper reads.
class FakeDocument extends EventTarget {
	hidden = false;
	show(visible: boolean) {
		this.hidden = !visible;
		this.dispatchEvent(new Event('visibilitychange'));
	}
}

describe('pollWhileVisible', () => {
	let doc: FakeDocument;
	beforeEach(() => {
		vi.useFakeTimers();
		doc = new FakeDocument();
		vi.stubGlobal('document', doc);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('runs every period while the page is visible', () => {
		const run = vi.fn();
		const stop = pollWhileVisible(run, 60_000);
		vi.advanceTimersByTime(180_000);
		expect(run).toHaveBeenCalledTimes(3);
		stop();
	});

	it('sends nothing while hidden, then runs at once on the return when it is stale', () => {
		const run = vi.fn();
		const stop = pollWhileVisible(run, 60_000);
		doc.show(false);
		vi.advanceTimersByTime(600_000);
		expect(run).not.toHaveBeenCalled();
		doc.show(true);
		expect(run).toHaveBeenCalledTimes(1);
		stop();
	});

	it('does not run on the return when the data is still fresh', () => {
		const run = vi.fn();
		const stop = pollWhileVisible(run, 60_000);
		vi.advanceTimersByTime(60_000);
		expect(run).toHaveBeenCalledTimes(1);
		doc.show(false);
		vi.advanceTimersByTime(10_000);
		doc.show(true);
		expect(run).toHaveBeenCalledTimes(1);
		stop();
	});

	it('stops for good once cleaned up', () => {
		const run = vi.fn();
		const stop = pollWhileVisible(run, 60_000);
		stop();
		vi.advanceTimersByTime(300_000);
		doc.show(false);
		doc.show(true);
		expect(run).not.toHaveBeenCalled();
	});
});
