<script lang="ts">
	// "Should you go?" for one surf spot: a verdict for surf, kite, boat and shore fishing (its best slot, what holds it back, the
	// criteria it stands on), the same hour by hour as bars whose height is the verdict, the tide of each day, the coastal
	// warnings, and the nearest wave buoy. Every verdict is a rule of Vigie, written at the end of the section; every figure is
	// the API's, and a value it did not give is left out.
	import {
		activityText,
		axisHour,
		BAR_HEIGHT,
		criterionName,
		criterionValueText,
		reasonText,
		ruleLines,
		stateText,
		tideOfDay,
		verdictDays,
		verdictRuns,
		type Activity,
		type ActivitiesForecast,
		type SpotBuoy,
		type Verdict
	} from '#lib/activities.js';
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { WindUnit } from '#lib/sea/choice.js';
	import { dayLabel, hourLabel, slotLabel } from '#lib/surf.js';

	let {
		lang,
		v,
		buoy = null,
		buoyMaxKm = null,
		night = $bindable(false),
		windUnit = 'kn'
	}: {
		lang: Lang;
		v: ActivitiesForecast;
		buoy?: SpotBuoy | null;
		buoyMaxKm?: number | null;
		night?: boolean;
		/** The unit a wind in knots is shown in (the visitor's choice, kept in this browser). */
		windUnit?: WindUnit;
	} = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => activityText(lang, key, vars);
	const days = $derived(verdictDays(v.activities, night));
	const byTime = $derived(new Map(v.activities.map((a) => [a.id, new Map(a.hours.map((h) => [h.t, h]))])));
	const rules = $derived(ruleLines(lang, v.rules));
	const glyph = (verdict: Verdict | null) =>
		verdict === 'good' ? '✓' : verdict === 'possible' ? '~' : verdict === 'poor' ? '✕' : '?';
	const word = (verdict: Verdict | null) => (verdict ? t(`verdict.${verdict}`) : t('unknown'));
	const inSlot = (a: Activity, time: number) => !!a.slot && time >= a.slot.start && time < a.slot.end;
	const km = (value: number) => number(lang, value, value < 10 ? 1 : 0);
	const height = (m: number) => `${m >= 0 ? '+' : '−'}${number(lang, Math.abs(m), 2)} m`;

	// What a row of bars says, for a reader who does not see them: the runs of one verdict through the day.
	function rowLabel(a: Activity, times: number[], day: number): string {
		const runs = verdictRuns(a.hours, times).map((r) =>
			r.verdict
				? t('run', {
						verdict: word(r.verdict).toLowerCase(),
						from: hourLabel(lang, r.from),
						to: hourLabel(lang, r.to + 3600)
					})
				: t('runNone', { from: hourLabel(lang, r.from), to: hourLabel(lang, r.to + 3600) })
		);
		return t('barLabel', {
			activity: t(`activity.${a.id}`),
			day: dayLabel(lang, day),
			runs: runs.join('; ')
		});
	}
</script>

<section class="card verdicts" aria-labelledby="verdicts-title">
	<h2 id="verdicts-title">{t('title')}</h2>
	<p class="muted small">{t('intro')}</p>

	<div class="cards">
		{#each v.activities as a (a.id)}
			<article class="act">
				<h3>{t(`activity.${a.id}`)}</h3>
				{#if !a.available}
					<p class="muted small">{t('unavailableActivity')}</p>
					{#if a.note}<p class="muted small" lang="en">{a.note}</p>{/if}
				{:else}
					<p class="line">
						<span class="chip v-{a.verdict ?? 'none'}"
							><span aria-hidden="true">{glyph(a.verdict)}</span> {word(a.verdict)}</span
						>
					</p>
					<p class="small">
						{#if a.slot}
							<b>{t('slot')}</b>
							{slotLabel(lang, a.slot.start)} – {hourLabel(lang, a.slot.end)}
						{:else if a.verdict}
							{t('noSlot')}
						{/if}
					</p>
					{#if reasonText(lang, a.reason)}
						<p class="muted small"><b>{t('why')}</b> · {reasonText(lang, a.reason)}</p>
					{/if}
					{#if a.detail && a.detail.criteria.length}
						<details class="crit">
							<summary class="small">{t('criteriaAt', { time: hourLabel(lang, a.detail.t) })}</summary>
							<ul class="criteria">
								{#each a.detail.criteria as c (c.name)}
									<li>
										<span class="mark v-{c.verdict ?? 'none'}" role="img" aria-label={word(c.verdict)}
											>{glyph(c.verdict)}</span
										>
										<span class="what">
											<span class="name">{criterionName(lang, c.name)}</span>
											<span class="data">{criterionValueText(lang, c, windUnit) ?? t('unknownValue')}</span>
											{#if stateText(lang, c.name, c.state)}
												<span class="muted small">{stateText(lang, c.name, c.state)}</span>
											{/if}
										</span>
										{#if c.max != null}
											<span class="data pts"
												>{c.points == null ? t('notScored') : `${c.points}/${c.max}`}</span
											>
										{/if}
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				{/if}
			</article>
		{/each}
	</div>

	{#if v.stale}<p class="note small">{t('stale')}</p>{/if}

	<h3 class="strip">{t('strip')}</h3>
	<p class="muted small">{t('stripNote')}</p>
	<label class="small"><input type="checkbox" bind:checked={night} /> {t('showNight')}</label>
	{#each days as day (day.key)}
		{@const tide = tideOfDay(v.tide, day.key)}
		<div class="day">
			<h4>{dayLabel(lang, day.t)}</h4>
			{#if tide.extremes.length}
				<p class="small muted tide">
					<b>{t('tide')}</b>
					{#each tide.extremes as e (e.t)}
						· {t(e.kind === 'high' ? 'tideHigh' : 'tideLow')}
						<span class="data">{hourLabel(lang, e.t)}</span> ({height(e.height)}){' '}
					{/each}
					{#if tide.coefficients.length}· {t('coefficient', { value: tide.coefficients.join(' · ') })}{/if}
				</p>
			{/if}
			<div class="axis" aria-hidden="true">
				{#each day.hours as time (time)}<span>{axisHour(time) ?? ''}</span>{/each}
			</div>
			{#each v.activities as a (a.id)}
				{#if a.available}
					<div class="rowbars">
						<span class="cap small">{t(`activity.${a.id}`)}</span>
						<div class="bars" role="img" aria-label={rowLabel(a, day.hours, day.t)}>
							{#each day.hours as time (time)}
								{@const h = byTime.get(a.id)?.get(time)}
								<span
									class="cell"
									class:best={inSlot(a, time)}
									title="{hourLabel(lang, time)} · {word(h?.verdict ?? null)}{reasonText(
										lang,
										h?.reason ?? null
									)
										? ` · ${reasonText(lang, h?.reason ?? null)}`
										: ''}"
									><span
										class="bar v-{h?.verdict ?? 'none'}"
										style:height={h?.verdict ? `${BAR_HEIGHT[h.verdict]}%` : undefined}
									></span></span
								>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/each}
	{#if v.tide}<p class="muted small">{t('tideNote')}</p>{/if}

	<div class="block">
		{#if v.vigilance.status === 'unknown'}
			<p class="note small">{t('vigilanceUnknown')}</p>
		{:else if v.vigilance.alerts.length}
			<p class="small">
				<b>{t('vigilanceIn')}</b>
				{#each v.vigilance.alerts as al (al.id)}
					· {al.source}{#if al.level}, {t('level', { level: al.level.toLowerCase() })}{/if}
				{/each}
			</p>
		{:else}
			<p class="muted small">{t('vigilanceNone')}</p>
		{/if}
	</div>

	{#if buoy && buoy.buoy}
		<div class="block buoy">
			<h3>{t('buoy')}</h3>
			<p class="small">
				{#if buoy.km != null}{t('buoyAt', { name: buoy.buoy.name, km: km(buoy.km) })}{/if}
				{#if buoy.realTimeBuoy && buoy.realTimeBuoy.id !== buoy.buoy.id && buoy.realTimeKm != null}
					{t('buoyRealTime', { name: buoy.realTimeBuoy.name, km: km(buoy.realTimeKm) })}
				{/if}
				{buoy.comparable
					? t('buoyNear')
					: t('buoyFar', { max: buoyMaxKm != null ? number(lang, buoyMaxKm, 0) : '30' })}
			</p>
			<p class="muted small">{t('buoyNotRead')}</p>
		</div>
	{/if}

	<details class="rules">
		<summary class="small">{t('rules')}</summary>
		{#if v.windRange}
			<p class="small">
				{t('windRange', { min: number(lang, v.windRange.min, 0), max: number(lang, v.windRange.max, 0) })}
			</p>
		{/if}
		<dl class="small">
			{#each rules as r (r.key)}
				<dt>{t(`rule_${r.key}`)}</dt>
				<dd lang={lang === 'fr' && r.text !== v.rules[r.key] ? 'fr' : 'en'}>{r.text}</dd>
			{/each}
		</dl>
		{#if v.limits}
			<p class="muted small" lang="en"><b>{t('limits')}</b> · {v.limits}</p>
		{/if}
	</details>
</section>

<style>
	.verdicts h2 {
		margin: 0 0 6px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 10px;
		margin: 10px 0;
	}
	.act {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 10px;
		min-width: 0;
	}
	.act h3 {
		margin: 0 0 6px;
		font-size: 16px;
	}
	.act p {
		margin: 4px 0;
	}
	.chip {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 2px 10px;
		border-radius: 12px;
		font-weight: 600;
	}
	.v-good {
		background: var(--sev-green);
		color: var(--on-sev);
	}
	.v-possible {
		background: var(--sev-yellow);
		color: var(--on-yellow);
	}
	.v-poor {
		background: var(--sev-red);
		color: var(--on-sev);
	}
	.chip.v-none {
		border: 1px dashed var(--sev-none);
		color: var(--muted);
	}
	.crit summary {
		cursor: pointer;
		color: var(--muted);
	}
	.criteria {
		list-style: none;
		padding: 0;
		margin: 6px 0 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.criteria li {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.what {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 8px;
		align-items: baseline;
	}
	.mark {
		flex: none;
		display: inline-block;
		width: 1.4em;
		text-align: center;
		border-radius: 3px;
		font-size: 12px;
		font-weight: 700;
	}
	.mark.v-none {
		border: 1px dashed var(--sev-none);
		color: var(--muted);
	}
	.pts {
		flex: none;
	}
	.strip {
		margin: 16px 0 4px;
	}
	.day h4 {
		margin: 12px 0 4px;
		font-size: 15px;
	}
	.day h4::first-letter {
		text-transform: uppercase;
	}
	.tide {
		margin: 0 0 6px;
	}
	.axis {
		display: flex;
		gap: 2px;
		font-size: 11px;
		color: var(--muted);
		font-family: var(--font-data);
	}
	.axis span {
		flex: 1 1 0;
		max-width: 34px;
		min-width: 0;
		text-align: center;
		white-space: nowrap;
		overflow: visible;
	}
	.rowbars {
		margin-top: 4px;
	}
	.cap {
		display: block;
		color: var(--muted);
	}
	.bars {
		display: flex;
		gap: 2px;
		height: 30px;
		padding-bottom: 5px;
	}
	.cell {
		flex: 1 1 0;
		max-width: 34px;
		min-width: 0;
		display: flex;
		align-items: flex-end;
	}
	.cell.best {
		box-shadow: 0 4px 0 0 var(--accent);
	}
	/* On a wide screen the bars are wider too, so that the day is not a small chart in a corner. */
	@media (min-width: 720px) {
		.axis span,
		.cell {
			max-width: 56px;
		}
	}
	.bar {
		display: block;
		width: 100%;
		border-radius: 2px 2px 0 0;
	}
	.bar.v-none {
		height: 100%;
		border: 1px dashed var(--sev-none);
		background: transparent;
	}
	.block {
		margin-top: 12px;
	}
	.buoy h3 {
		margin: 0 0 4px;
		font-size: 16px;
	}
	.buoy p {
		margin: 2px 0;
	}
	.rules {
		margin-top: 12px;
	}
	.rules summary {
		cursor: pointer;
		color: var(--muted);
	}
	dl {
		margin: 8px 0 0;
		display: grid;
		gap: 2px 12px;
	}
	dt {
		font-weight: 600;
		margin-top: 6px;
	}
	dd {
		margin: 0;
	}
</style>
