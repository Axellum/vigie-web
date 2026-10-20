<script lang="ts">
	import { translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
</script>

<svelte:head>
	<title>Vigie · {tr('privacy.title')}</title>
	<meta name="description" content={tr('privacy.description')} />
</svelte:head>

<div class="page prose">
	<h1>{tr('privacy.title')}</h1>
	{#if lang === 'fr'}
		<p>
			Sans compte, Vigie ne garde rien sur vous : voir <a href="/about">À propos</a>. Cette page dit ce que le
			site garde sur les personnes qui ont un compte. Les comptes sont ouverts sur invitation.
		</p>
		<h2>Ce qui est gardé</h2>
		<ul>
			<li>
				<b>Votre compte</b> : le nom que vous avez choisi (pas forcément le vrai), la langue du site, la date de
				création et la date de dernière utilisation.
			</li>
			<li>
				<b>Vos passkeys</b> : pour chacune, son identifiant, sa clé publique, un compteur d'utilisation, si elle
				est synchronisée entre vos appareils, ses dates de création et de dernière utilisation. La partie secrète
				reste sur votre appareil ; le site ne la voit jamais.
			</li>
			<li>
				<b>Vos sessions</b> : une empreinte (SHA-256) du jeton de connexion de chaque appareil, et sa date de fin.
				Le jeton lui-même n'est que dans le cookie de votre navigateur.
			</li>
			<li>
				<b>Vos zones</b> : leur nom, leur forme (un point et un rayon, les coins d'une zone dessinée, un pays ou
				une zone officielle) et leurs règles (niveau, types d'alerte). Un point peut être votre domicile : il ne
				sert qu'à vos alertes et disparaît avec la zone ou le compte.
			</li>
			<li>
				<b>Votre invitation</b> : une empreinte du code, la note de la personne qui vous a invité (par exemple pour
				qui elle était) et ses dates.
			</li>
		</ul>
		<p>
			Pas d'adresse e-mail, pas de mot de passe, pas d'adresse IP dans la base. Aucune donnée n'est vendue, ni
			partagée, ni utilisée pour de la publicité ou de la mesure d'audience.
		</p>
		<h2>Pourquoi</h2>
		<p>
			Pour vous reconnaître quand vous vous connectez, et garder ce que vous réglez dans votre compte. C'est
			le service que vous demandez en créant le compte (base légale : l'exécution de ce service).
		</p>
		<h2>Combien de temps</h2>
		<ul>
			<li>Le compte : jusqu'à ce que vous le supprimiez, ou deux ans sans aucune utilisation.</li>
			<li>Une session : 30 jours après sa dernière utilisation.</li>
			<li>Une invitation : 30 jours après sa date d'expiration.</li>
			<li>La vérification d'une passkey en cours : 5 minutes.</li>
		</ul>
		<h2>Cookies</h2>
		<p>
			Deux cookies, tous deux nécessaires : <code>vigie-session</code> (votre connexion, 30 jours, illisible
			par les scripts de la page) et <code>vigie-lang</code> (la langue choisie, un an). Le thème clair ou sombre
			est gardé dans votre navigateur, pas sur le site.
		</p>
		<h2>Vos droits</h2>
		<p>
			Depuis <a href="/account">votre compte</a>, vous pouvez télécharger tout ce que le site garde sur vous
			et supprimer le compte : la suppression efface tout de suite le compte, ses passkeys, ses sessions et
			ses zones. Vous pouvez aussi saisir la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).
		</p>
		<h2>Où</h2>
		<p>Sur le serveur du site, dans l'Union européenne.</p>
	{:else}
		<p>
			Without an account, Vigie keeps nothing about you: see <a href="/about">About</a>. This page says what
			the site keeps about the people who have an account. Accounts are by invitation.
		</p>
		<h2>What is kept</h2>
		<ul>
			<li>
				<b>Your account</b>: the name you chose (not necessarily your real one), the language of the site, the
				date it was created and the date it was last used.
			</li>
			<li>
				<b>Your passkeys</b>: for each, its identifier, its public key, a use counter, whether it is synced
				across your devices, and the dates it was created and last used. The secret part stays on your device;
				the site never sees it.
			</li>
			<li>
				<b>Your sessions</b>: a fingerprint (SHA-256) of the sign-in token of each device, and its end date.
				The token itself is only in your browser's cookie.
			</li>
			<li>
				<b>Your zones</b>: their name, their shape (a point and a radius, the corners of a drawn zone, a
				country or an official area) and their rules (level, kinds of alert). A point may be your home: it
				only serves your alerts and goes with the zone or the account.
			</li>
			<li>
				<b>Your invitation</b>: a fingerprint of the code, the note of the person who invited you (for example
				who it was for) and its dates.
			</li>
		</ul>
		<p>
			No e-mail address, no password, no IP address in the database. No data is sold, shared, or used for
			advertising or audience measurement.
		</p>
		<h2>Why</h2>
		<p>
			To recognise you when you sign in, and to keep what you set in your account. It is the service you ask
			for by creating the account (legal basis: providing that service).
		</p>
		<h2>For how long</h2>
		<ul>
			<li>The account: until you delete it, or two years without any use.</li>
			<li>A session: 30 days after it was last used.</li>
			<li>An invitation: 30 days after it expired.</li>
			<li>The check of a passkey in progress: 5 minutes.</li>
		</ul>
		<h2>Cookies</h2>
		<p>
			Two cookies, both needed: <code>vigie-session</code> (your sign-in, 30 days, not readable by the page's
			scripts) and <code>vigie-lang</code> (the language you chose, one year). The light or dark theme is kept in
			your browser, not on the site.
		</p>
		<h2>Your rights</h2>
		<p>
			From <a href="/account">your account</a>, you can download everything the site keeps about you and
			delete the account: deleting erases the account, its passkeys, its sessions and its zones at once. You
			can also complain to the French data protection authority, the CNIL (<a href="https://www.cnil.fr"
				>cnil.fr</a
			>).
		</p>
		<h2>Where</h2>
		<p>On the site's server, in the European Union.</p>
	{/if}
</div>
