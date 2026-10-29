<script lang="ts">
	// One country's travel advice: each ministry's advice side by side, in its words and language, with the date it
	// published it and the time Vigie read it; whether the ministries disagree (Vigie's comparison); the versions the API
	// archived; and the ECDC's publications that name the country.
	import Credits from '#lib/components/Credits.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import Time from '#lib/components/Time.svelte';
	import { countryName, t } from '#lib/i18n.js';
	import {
		inLanguage,
		kindLabel,
		languageName,
		mapLevel,
		statusLabel,
		travel,
		travelDate,
		whyNotRead,
		type AdviceLevel,
		type Text
	} from '#lib/travel.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const detail = $derived(data.detail);
	const name = $derived(countryName(lang, data.cc));
	const ministries = $derived(detail?.ministries ?? []);
	const byId = (id: string) => ministries.find((m) => m.id === id);
	const ministryLabel = (id: string) => {
		const m = byId(id);
		return m ? countryName(lang, m.country) : id.toUpperCase();
	};
	const order = (id: string) => {
		const i = ministries.findIndex((m) => m.id === id);
		return i < 0 ? 99 : i;
	};
	const whole = $derived(
		(detail?.advices ?? []).filter((a) => !a.part).sort((a, b) => order(a.ministry) - order(b.ministry))
	);
	const parts = $derived(
		(detail?.advices ?? []).filter((a) => a.part).sort((a, b) => order(a.ministry) - order(b.ministry))
	);
	const notRead = $derived(ministries.filter((m) => !m.read));
	const comparison = $derived(detail?.comparison ?? null);
	const health = $derived(detail?.health ?? null);
	const linked = $derived(health ? health.agencies.filter((a) => !a.read) : []);

	/** The level of an advice in the ministry's words, or Vigie's label of the FCDO's statuses (said to be ours). */
	function words(a: AdviceLevel & { levelTexts: Record<string, string> }) {
		if (a.ministry === 'gb') return { text: statusLabel(lang, a.statuses), language: lang, ours: true };
		const w = inLanguage(lang, a.levelTexts);
		return w ? { ...w, ours: false } : null;
	}
	const textHeading = (text: Text) =>
		text.language
			? `${travel(lang, 'text')} (${travel(lang, 'textIn', { language: languageName(lang, text.language) })})`
			: travel(lang, 'text');
</script>

<Seo
	title={travel(lang, 'countryTitle', { country: name })}
	description={travel(lang, 'countryDescription', { country: name })}
/>

<div class="page">
	<header class="intro">
		<p class="eyebrow"><a href="/travel">{travel(lang, 'nav')}</a></p>
		<h1>{travel(lang, 'countryTitle', { country: name })}</h1>
		{#if data.apiDown}<p class="note">{travel(lang, 'unavailable')}</p>{/if}
	</header>

	{#if detail}
		{#if comparison}
			<section class="compare" class:split={comparison.disagree}>
				{#if comparison.disagree}
					<p><strong>{travel(lang, 'disagree', { gap: comparison.gap ?? '–' })}</strong></p>
					<p>
						{travel(lang, 'disagreeDetail', {
							strict: comparison.strictest.map(ministryLabel).join(', '),
							lax: comparison.laxest.map(ministryLabel).join(', ')
						})}
					</p>
				{:else if comparison.disagree === false}
					<p>{travel(lang, 'agree')}</p>
				{:else}
					<p>{travel(lang, detail.advices.length ? 'notCompared' : 'noAdvice')}</p>
				{/if}
				<p class="muted small">{travel(lang, 'disagreementsNote')}</p>
			</section>
		{/if}

		{#if whole.length}
			<div class="advices">
				{#each whole as a (a.ministry + a.title)}
					{@const w = words(a)}
					{@const level = mapLevel(a)}
					<article class="card advice sev-{level ?? 'NONE'}">
						<header>
							<h2>{ministryLabel(a.ministry)}</h2>
							<p class="muted small">{byId(a.ministry)?.name ?? a.ministry}</p>
						</header>
						<p class="level">
							{#if w}<strong lang={w.language}>{w.text}</strong>{#if w.ours}
									{' '}<span class="muted small">({travel(lang, 'oursLabel')})</span>{/if}{:else}<strong
									>{t(lang, 'level.none')}</strong
								>{/if}
						</p>
						{#if a.regional}<p class="small">{travel(lang, 'regional')}</p>{/if}
						<p class="muted small">
							{travel(lang, 'published')}
							{a.published != null ? travelDate(lang, a.published) : (a.publishedText ?? '–')} · {travel(
								lang,
								'checked'
							)}
							<Time {lang} unix={a.checked} />
						</p>
						{#if a.url}<p class="small"><a href={a.url} rel="noopener">{travel(lang, 'readOn')}</a></p>{/if}
						{#each a.texts as text, i (i)}
							<details>
								<summary>{text.title ?? textHeading(text)}</summary>
								<div class="text" lang={text.language || undefined}>
									{#each text.blocks as b, j (j)}
										{#if b.kind === 'h'}<h3>{b.text}</h3>{:else if b.kind === 'li'}<p class="li">
												{b.text}
											</p>{:else}<p>
												{b.text}
											</p>{/if}
									{/each}
								</div>
							</details>
						{/each}
						{#if a.changeNote.length}
							<p class="small note-change">{travel(lang, 'changeNote')}</p>
						{/if}
						{#each a.changeNote as note, i (i)}
							<p class="small note-change" lang={note.language || undefined}>
								{note.blocks.map((b) => b.text).join(' ')}
							</p>
						{/each}
						{#if a.sourceHistory.length}
							<details>
								<summary>{travel(lang, 'sourceHistory')}</summary>
								<ul class="plain small" lang="en">
									{#each a.sourceHistory as c, i (i)}
										<li><span class="muted">{travelDate(lang, c.published)}</span> · {c.note}</li>
									{/each}
								</ul>
							</details>
						{/if}
					</article>
				{/each}
			</div>
		{/if}

		{#if parts.length}
			<section class="block">
				<h2>{travel(lang, 'part')}</h2>
				<ul class="plain">
					{#each parts as a (a.ministry + a.title)}
						{@const w = words(a)}
						<li>
							<strong>{ministryLabel(a.ministry)}</strong> · {a.title} ·
							{#if w}<span lang={w.language}>{w.text}</span>{:else}{t(lang, 'level.none')}{/if}
							{#if a.url}· <a href={a.url} rel="noopener">{travel(lang, 'readOn')}</a>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if detail.notCovered.length}
			<p class="small">{travel(lang, 'notCovered')} {detail.notCovered.map(ministryLabel).join(', ')}</p>
		{/if}

		{#if notRead.length}
			<section class="block">
				<h2>{travel(lang, 'notRead')}</h2>
				<ul class="plain">
					{#each notRead as m (m.id)}
						<li>
							{#if m.url}<a href={m.url} rel="noopener">{m.name}</a>{:else}{m.name}{/if}
							<span class="muted small">{whyNotRead(lang, m)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if detail.history.length}
			<section class="block">
				<h2>{travel(lang, 'history')}</h2>
				{#if detail.historySince}
					<p class="muted small">
						{travel(lang, 'historyNote', { date: travelDate(lang, detail.historySince) })}
					</p>
				{/if}
				<ul class="plain">
					{#each detail.history as c, i (i)}
						{@const w =
							c.ministry === 'gb' ? statusLabel(lang, c.statuses) : inLanguage(lang, c.levelTexts)?.text}
						<li>
							<span class="muted"><Time {lang} unix={c.observed} /></span> ·
							<strong>{ministryLabel(c.ministry)}</strong>
							· {w ?? t(lang, 'level.none')}
							{#if c.first}<span class="muted small">({travel(lang, 'historyFirst')})</span
								>{:else if c.levelChanged}<span class="small"
									><strong>({travel(lang, 'historyChanged')})</strong></span
								>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if health}
			<section class="block">
				<h2>{travel(lang, 'health')}</h2>
				<h3 class="sub">{travel(lang, 'healthCountry')}</h3>
				{#if health.items.length}
					<ul class="plain">
						{#each health.items as item (item.url)}
							<li>
								<a href={item.url} rel="noopener" lang="en">{item.title}</a>
								<span class="muted small"
									>· {travelDate(lang, item.published)} · {kindLabel(lang, item.kind)}</span
								>
								{#if item.summary.length}
									<p class="small" lang="en">{item.summary.map((b) => b.text).join(' ')}</p>
								{/if}
							</li>
						{/each}
					</ul>
					<p class="muted small">{travel(lang, 'healthMatched')}</p>
				{:else}
					<p class="small">{travel(lang, 'healthNone')}</p>
				{/if}
				{#if linked.length}
					<p class="small">{travel(lang, 'healthAlso')}</p>
					<ul class="plain small">
						{#each linked as a (a.id)}
							<li>
								{#if a.url}<a href={a.url} rel="noopener">{a.name}</a>{:else}{a.name}{/if}
								<span class="muted">{whyNotRead(lang, a)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}

	<p class="small"><a href="/travel">{travel(lang, 'allTravel')}</a></p>
	<Credits {lang} credits={[detail?.attribution, health?.attribution]} />
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
	.compare {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.compare.split {
		background: var(--accent-soft);
	}
	.compare p {
		margin: 0;
	}
	.advices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: 12px;
		align-items: start;
	}
	.advice {
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		padding-top: 20px;
	}
	.advice::before {
		content: '';
		position: absolute;
		inset: 0 0 auto 0;
		height: 5px;
		background: var(--c);
	}
	.advice h2 {
		font-size: 18px;
		margin: 0;
	}
	.advice header p,
	.advice p {
		margin: 0;
	}
	.level {
		font-size: 16px;
	}
	details summary {
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 6px;
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.text h3 {
		font-size: 15px;
		margin: 6px 0 0;
	}
	.text p {
		margin: 0;
	}
	.text .li {
		padding-left: 14px;
		position: relative;
	}
	.text .li::before {
		content: '•';
		position: absolute;
		left: 2px;
	}
	.note-change {
		color: var(--muted);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.sub {
		font-size: 16px;
		margin: 0;
	}
	.plain {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-wrap: anywhere;
	}
	.plain p {
		margin: 4px 0 0;
	}
</style>
