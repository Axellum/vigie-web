<script lang="ts">
	import { translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
</script>

<svelte:head>
	<title>Vigie · {tr('about.title')}</title>
	<meta name="description" content={tr('about.description')} />
</svelte:head>

<div class="page prose">
	<h1>{tr('about.title')}</h1>
	{#if lang === 'fr'}
		<p>
			Vigie est un projet personnel, non commercial, fait avec l'aide de l'IA et partagé au cas où il
			servirait à quelqu'un. Il montre sur des cartes les catastrophes naturelles du monde et les vigilances
			météo officielles que l'<a href="https://github.com/Axellum/vigie-api">API Vigie</a> rassemble à partir de
			sources publiques.
		</p>
		<h2>Ce que Vigie n'est pas</h2>
		<p>
			Vigie n'est pas un service d'alerte officiel. Les alertes sont relayées depuis des flux publics : elles
			peuvent arriver en retard, être incomplètes ou fausses, et aucune disponibilité n'est promise. Suivez
			les consignes de vos autorités et des services météorologiques nationaux.
		</p>
		<h2>Les textes officiels</h2>
		<p>
			Les textes des vigilances sont affichés tels que l'émetteur les a écrits, dans sa langue, sans
			traduction ni résumé. Le niveau et le phénomène affichés par Vigie sont dérivés de ceux de la source ;
			le niveau d'origine est donné sur chaque fiche.
		</p>
		<h2>Vie privée</h2>
		<p>
			Pas d'inscription obligatoire, pas de publicité, pas de mesure d'audience, aucun script ni police d'un
			tiers. Le seul cookie retient la langue choisie ; le thème est gardé dans votre navigateur. Le fond de
			carte est chargé depuis OpenFreeMap, qui reçoit donc votre adresse IP comme tout site que vous visitez.
		</p>
		{#if data.accounts}
			<p>
				Les comptes, ouverts sur invitation, ajoutent un cookie de connexion et gardent le peu décrit sur la
				page <a href="/privacy">Confidentialité</a>.
			</p>
		{/if}
		<p>
			Sur la page « Autour de moi », le lieu que vous choisissez reste dans votre navigateur : les vigilances
			et les catastrophes autour de lui y sont calculées. Seuls le nom que vous cherchez et une position
			arrondie à environ 5 km, pour la météo, sont envoyés au site ; il ne les garde pas avec votre adresse
			IP.
		</p>
		<h2>Mentions légales</h2>
		<p>En préparation : le site n'est pas encore ouvert au public.</p>
	{:else}
		<p>
			Vigie is a personal, non-commercial project, made with the help of AI and shared in case it helps
			someone. It shows on maps the world natural hazards and the official weather warnings that the
			<a href="https://github.com/Axellum/vigie-api">Vigie API</a> gathers from public sources.
		</p>
		<h2>What Vigie is not</h2>
		<p>
			Vigie is not an official warning service. The alerts are relayed from public feeds: they can be late,
			incomplete or wrong, and no availability is promised. Follow the instructions of your authorities and of
			the national weather services.
		</p>
		<h2>The official texts</h2>
		<p>
			The texts of the warnings are shown as the issuer wrote them, in the issuer's language, with no
			translation and no summary. The level and phenomenon Vigie shows are derived from the source's; the
			original level is given on each page.
		</p>
		<h2>Privacy</h2>
		<p>
			No sign-up needed, no advertising, no audience measurement, no third-party script or font. The only
			cookie keeps the language you chose; the theme is kept in your browser. The base map is loaded from
			OpenFreeMap, which therefore receives your IP address like any site you visit.
		</p>
		{#if data.accounts}
			<p>
				Accounts, by invitation, add a sign-in cookie and keep the little described on the
				<a href="/privacy">Privacy</a> page.
			</p>
		{/if}
		<p>
			On the "Near me" page, the place you choose stays in your browser: the warnings and hazards around it
			are worked out there. Only the name you search and a position rounded to about 5 km, for the weather,
			are sent to the site; it does not keep them with your IP address.
		</p>
		<h2>Legal notice</h2>
		<p>In preparation: the site is not open to the public yet.</p>
	{/if}
</div>

<style>
	.prose {
		max-width: 760px;
		gap: 14px;
	}
	.prose h2 {
		margin-top: 10px;
	}
	.prose p {
		max-width: 68ch;
	}
</style>
