// @ts-nocheck - plain ES5 for old televisions, read as it is by their browsers: no types to write, and src/lib/tv/screen.test.ts checks it.
/* The script of a Vigie television screen (/tv). It is ES5 on purpose: the browsers of the televisions sold from 2018 to 2021 are
   Chromium 53 to 76, so no arrow function, no let or const, no template string, no fetch, no Promise. src/lib/tv/screen.test.ts
   checks it, and e2e/tv.spec.ts runs it against a page. What it does, with nothing to click:
   - the clock runs on the clock of the server (a television's own is often wrong) and on the time zone of the place;
   - the panels take turns; with one panel, or without this script, the first one stays;
   - the day and the night follow the sun (`data-windows`) unless the address fixed a theme;
   - a clock without a time zone stays empty (the screen of a personal page whose places did not give theirs);
   - every few minutes it reads the page again and puts the new screen in place of the old one; when the site does not answer it keeps
     the last screen and says "offline, last update hh:mm" instead of an empty screen or an error;
   - it reloads the whole page every few hours, and as soon as the site has a new version, against a memory that grows over days;
   - it moves the screen by a few pixels every two minutes, against the burn-in of a panel left on for months. */
(function () {
	'use strict';

	var index = 0; // the panel shown
	var skew = 0; // seconds to add to the clock of the television to get the clock of the server
	var rotation = null;
	var rotationSeconds = 0;
	var offline = false;
	var lastGood = Date.now(); // when the last page was read
	var reloadAt = 0;
	var nudge = 0;
	var NUDGES = [
		[0, 0],
		[5, 3],
		[-4, 5],
		[3, -5],
		[-5, -3]
	];

	function byId(id) {
		return document.getElementById(id);
	}
	function number(text, fallback) {
		var n = parseFloat(text);
		return isNaN(n) ? fallback : n;
	}
	function pad(n) {
		return (n < 10 ? '0' : '') + n;
	}
	function attr(name, fallback) {
		var root = byId('tv-root');
		var value = root ? root.getAttribute(name) : null;
		return value === null || value === '' ? fallback : value;
	}
	function guard(fn) {
		return function () {
			try {
				fn();
			} catch (e) {
				/* a failure of one job must not stop the others */
			}
		};
	}

	/* The stage is 192 by 108 rem: 1 rem is a 192nd of the width, or a 108th of the height when the screen is less wide than 16:9. */
	function fit() {
		var w = window.innerWidth || document.documentElement.clientWidth;
		var h = window.innerHeight || document.documentElement.clientHeight;
		if (w > 0 && h > 0) document.documentElement.style.fontSize = Math.min(w / 192, h / 108) + 'px';
	}

	function serverNow() {
		return Date.now() / 1000 + skew;
	}

	/* The wall clock of the place: the server's time plus the offset of the time zone the server gave. */
	function placeTime() {
		return new Date((serverNow() + number(attr('data-offset', '0'), 0)) * 1000);
	}

	function setText(id, text) {
		var el = byId(id);
		if (el && el.textContent !== text) el.textContent = text;
	}

	function showClock() {
		if (attr('data-state', '') !== 'screen') return;
		/* A screen that does not know the time zone of its place (the weather of the page did not say) leaves the clock empty
		   rather than showing the hour of another zone. */
		var root = byId('tv-root');
		if (!root || root.getAttribute('data-offset') === null) return;
		var d = placeTime();
		setText('tv-clock', pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()));
		try {
			setText(
				'tv-date',
				d.toLocaleDateString(attr('data-lang', 'fr') === 'en' ? 'en-GB' : 'fr-FR', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					timeZone: 'UTC'
				})
			);
		} catch (e) {
			/* the date the server wrote stays */
		}
	}

	/* Day or night by the sun, when the address left it to the sun and the server gave the hours of it. */
	function showTheme() {
		var root = byId('tv-root');
		if (!root || attr('data-theme-mode', 'auto') !== 'auto') return;
		var windows = attr('data-windows', '').split(',');
		var now = serverNow();
		var last = 0;
		var day = false;
		for (var i = 0; i < windows.length; i++) {
			var pair = windows[i].split('-');
			var rise = number(pair[0], 0);
			var set = number(pair[1], 0);
			if (set > last) last = set;
			if (now >= rise && now < set) day = true;
		}
		/* Past the last sunset the server gave, the sun is not known any more: the next reading of the page decides. */
		if (!last || now >= last) return;
		var wanted = day ? 'tv-day' : 'tv-night';
		var other = day ? 'tv-night' : 'tv-day';
		if (root.className.indexOf(wanted) < 0) {
			root.className = root.className.replace(other, wanted);
		}
	}

	function show(i) {
		var host = byId('tv-panels');
		if (!host) return;
		var list = host.children;
		var n = list.length;
		if (!n) return;
		index = ((i % n) + n) % n;
		for (var k = 0; k < n; k++) {
			if (k === index) {
				if (list[k].className.indexOf('tv-on') < 0) list[k].className += ' tv-on';
			} else {
				list[k].className = list[k].className.replace(/\s*\btv-on\b/g, '');
			}
		}
		var dots = byId('tv-dots');
		if (dots) {
			for (var j = 0; j < dots.children.length; j++) {
				var dot = dots.children[j];
				dot.className = 'tv-dot' + (j === index ? ' tv-dot-on' : '');
			}
		}
	}

	function startRotation() {
		var seconds = number(attr('data-seconds', '20'), 20);
		var host = byId('tv-panels');
		var many = host && host.children.length > 1;
		if (rotation && rotationSeconds === seconds && many) return;
		if (rotation) clearInterval(rotation);
		rotation = null;
		rotationSeconds = seconds;
		if (many) {
			rotation = setInterval(
				guard(function () {
					show(index + 1);
				}),
				seconds * 1000
			);
		}
	}

	function banner(text) {
		var el = byId('tv-banner');
		if (!el) return;
		if (text) {
			el.textContent = text;
			if (el.className.indexOf('tv-banner-on') < 0) el.className += ' tv-banner-on';
		} else {
			el.className = el.className.replace(/\s*\btv-banner-on\b/g, '');
			el.textContent = '';
		}
	}

	function moveScreen() {
		var el = byId('tv-shift');
		if (!el) return;
		var step = NUDGES[nudge % NUDGES.length];
		nudge++;
		el.style.transform = 'translate(' + step[0] + 'px,' + step[1] + 'px)';
	}

	/* A new reading of the page, put in place of the screen on show. */
	function swap(html) {
		var doc = new DOMParser().parseFromString(html, 'text/html');
		var fresh = doc.getElementById('tv-root');
		var old = byId('tv-root');
		if (!fresh || !old) return false;
		if (fresh.getAttribute('data-build') !== old.getAttribute('data-build')) {
			window.location.reload();
			return true;
		}
		/* A page that has nothing to show (the site has not read its data yet) does not replace a screen that has. */
		if (fresh.getAttribute('data-state') !== 'screen' && old.getAttribute('data-state') === 'screen')
			return false;
		old.parentNode.replaceChild(document.importNode(fresh, true), old);
		skew = number(attr('data-now', ''), serverNow()) - Date.now() / 1000;
		show(index);
		startRotation();
		moveScreen();
		showClock();
		showTheme();
		return true;
	}

	function reading(done) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', window.location.href, true);
		xhr.timeout = 30000;
		xhr.onload = function () {
			var ok = false;
			/* The address is not known any more (the link of a personal page was revoked): the page itself says so, with the same
			   answer as for any address that does not exist. A reading that failed some other way is only "offline". */
			if (xhr.status === 404) {
				window.location.reload();
				return;
			}
			if (xhr.status === 200) {
				try {
					ok = swap(xhr.responseText);
				} catch (e) {
					ok = false;
				}
			}
			done(ok);
		};
		xhr.onerror = xhr.ontimeout = function () {
			done(false);
		};
		xhr.send();
	}

	var refreshTimer = null;
	function schedule(seconds) {
		if (refreshTimer) clearTimeout(refreshTimer);
		/* A tenth of jitter, so that screens started together do not all ask together. */
		var wait = seconds * 1000 * (0.95 + Math.random() * 0.1);
		refreshTimer = setTimeout(function () {
			reading(function (ok) {
				if (ok) {
					lastGood = Date.now();
					offline = false;
					var el = byId('tv-banner');
					var stale = el ? el.getAttribute('data-stale') : '';
					var shown = el && el.className.indexOf('tv-banner-on') >= 0;
					if (!shown) banner('');
					else banner(stale && el.textContent === stale ? stale : '');
				} else {
					offline = true;
					banner(attr('data-offline', ''));
				}
				/* Offline, it asks again sooner (a minute), then goes back to its pace once the site answers. */
				schedule(ok ? number(attr('data-refresh', '300'), 300) : 60);
			});
		}, wait);
	}

	/* A whole reload every few hours, only when the last reading worked: offline, a reload would leave the browser's error page. */
	function maybeReload() {
		if (!reloadAt) {
			var hours = number(attr('data-reload', '12'), 12);
			reloadAt = Date.now() + hours * 3600 * 1000 * (1 + Math.random() * 0.1);
		}
		var quick = number(attr('data-refresh', '300'), 300) * 2000 + 60000;
		if (Date.now() > reloadAt && !offline && Date.now() - lastGood < quick) window.location.reload();
	}

	function start() {
		var state = attr('data-state', '');
		skew = number(attr('data-now', ''), Date.now() / 1000) - Date.now() / 1000;
		fit();
		window.addEventListener('resize', guard(fit));
		moveScreen();
		/* A site that had nothing to say (it has not read its data yet): ask again in a minute. */
		if (state === 'unavailable') {
			setTimeout(
				function () {
					window.location.reload();
				},
				number(attr('data-retry', '60'), 60) * 1000
			);
		}
		if (state !== 'screen') return;
		show(0);
		startRotation();
		showClock();
		showTheme();
		setInterval(guard(showClock), 1000);
		setInterval(guard(showTheme), 30000);
		setInterval(guard(moveScreen), 120000);
		setInterval(guard(maybeReload), 60000);
		schedule(number(attr('data-refresh', '300'), 300));
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guard(start));
	else guard(start)();
})();
