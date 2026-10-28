<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { translator } from '#lib/i18n.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
</script>

<Seo title={tr('privacy.title')} description={tr('privacy.description')} />

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
				<b>Vos appareils qui reçoivent les notifications</b> : pour un navigateur, l'adresse que son service de
				notification lui a donnée et les clés qui chiffrent les messages pour lui ; pour l'appli Android, son jeton
				Firebase Cloud Messaging. Pour chacun, ses dates d'ajout et de dernier envoi, et le nombre d'envois échoués
				de suite. Le fuseau horaire de l'appareil et votre choix d'heures calmes, pour ne pas vous réveiller.
			</li>
			<li>
				<b>Les alertes de vos zones</b> : pour chaque alerte qui a touché une de vos zones, son titre, son niveau,
				la zone, la date, et si elle vous a été envoyée.
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
			Pour vous reconnaître quand vous vous connectez, garder ce que vous réglez dans votre compte et vous
			envoyer les alertes de vos zones si vous l'avez demandé. C'est le service que vous demandez en créant le
			compte (base légale : l'exécution de ce service).
		</p>
		<h2>Notifications</h2>
		<p>
			Une notification passe par le service de notification de votre navigateur (celui de Google pour Chrome
			et Android, de Mozilla pour Firefox, d'Apple pour Safari, de Microsoft pour Edge sous Windows). Elle est
			chiffrée pour votre appareil : ce service ne lit ni l'alerte ni vos zones ; il voit qu'un message part
			vers cet appareil, et quand. Ces services peuvent être hors de l'Union européenne. Vous pouvez arrêter
			les notifications d'un appareil depuis votre compte, ou dans les réglages du navigateur.
		</p>
		<p>
			Dans l'appli Android, une notification passe par Google (Firebase Cloud Messaging), comme pour toute
			appli Android, et elle n'est <b>pas</b> chiffrée pour votre appareil : Google voit son titre (le niveau et
			le titre de l'alerte) et son texte (les noms de vos zones). Choisissez des noms de zone qui ne disent rien
			de vous si cela vous gêne. Vous pouvez arrêter les notifications de l'appli depuis votre compte ou dans les
			réglages d'Android.
		</p>
		<h2>Combien de temps</h2>
		<ul>
			<li>Le compte : jusqu'à ce que vous le supprimiez, ou deux ans sans aucune utilisation.</li>
			<li>Une session : 30 jours après sa dernière utilisation.</li>
			<li>Une invitation : 30 jours après sa date d'expiration.</li>
			<li>La vérification d'une passkey en cours : 5 minutes.</li>
			<li>
				Un appareil : jusqu'à ce que vous le retiriez, que son navigateur s'en désabonne, ou après 5 envois
				échoués de suite.
			</li>
			<li>Les alertes de vos zones : 30 jours, ou tant que l'alerte est en cours.</li>
			<li>
				Les sauvegardes de la base, faites chaque jour : 7 jours au plus. Un compte supprimé en disparaît dans
				ce délai.
			</li>
		</ul>
		<h2>Cookies</h2>
		<p>
			Deux cookies, tous deux nécessaires : <code>vigie-session</code> (votre connexion, 30 jours, illisible
			par les scripts de la page) et <code>vigie-lang</code> (la langue choisie, un an). Le thème clair ou sombre
			est gardé dans votre navigateur, pas sur le site, comme les lieux suivis sans compte sur la page « Autour
			de moi » : ils ne sont pas envoyés au site, et effacer les données du site dans le navigateur les efface.
		</p>
		<h2>Vos droits</h2>
		<p>
			Depuis <a href="/account">votre compte</a>, vous pouvez télécharger tout ce que le site garde sur vous
			et supprimer le compte : la suppression efface tout de suite le compte, ses passkeys, ses sessions, ses
			zones, ses appareils et ses alertes, et les sauvegardes l'oublient sous 7 jours. Vous pouvez aussi
			saisir la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).
		</p>
		<h2>Où</h2>
		<p>
			Sur le serveur du site, loué à OVHcloud à Beauharnois, au Canada. Le Canada est reconnu par l'Union
			européenne comme assurant une protection adéquate des données (décision 2002/2/CE de la Commission, pour
			les entreprises).
		</p>
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
				<b>Your devices that receive the notifications</b>: for a browser, the address its notification
				service gave it and the keys that encrypt the messages for it; for the Android app, its Firebase Cloud
				Messaging token. For each, the dates it was added and last sent to, and the number of failed sendings
				in a row. The device's time zone and your choice of quiet hours, so as not to wake you up.
			</li>
			<li>
				<b>The alerts of your zones</b>: for each alert that fell in one of your zones, its title, its level,
				the zone, the date, and whether it was sent to you.
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
			To recognise you when you sign in, to keep what you set in your account, and to send you the alerts of
			your zones if you asked for them. It is the service you ask for by creating the account (legal basis:
			providing that service).
		</p>
		<h2>Notifications</h2>
		<p>
			A notification goes through the notification service of your browser (Google's for Chrome and Android,
			Mozilla's for Firefox, Apple's for Safari, Microsoft's for Edge on Windows). It is encrypted for your
			device: that service reads neither the alert nor your zones; it sees that a message goes to this device,
			and when. These services may be outside the European Union. You can stop the notifications of a device
			from your account, or in the browser's settings.
		</p>
		<p>
			In the Android app, a notification goes through Google (Firebase Cloud Messaging), as for any Android
			app, and it is <b>not</b> encrypted for your device: Google sees its title (the level and title of the alert)
			and its text (the names of your zones). Choose zone names that say nothing about you if that bothers you.
			You can stop the app's notifications from your account or in Android's settings.
		</p>
		<h2>For how long</h2>
		<ul>
			<li>The account: until you delete it, or two years without any use.</li>
			<li>A session: 30 days after it was last used.</li>
			<li>An invitation: 30 days after it expired.</li>
			<li>The check of a passkey in progress: 5 minutes.</li>
			<li>
				A device: until you remove it, its browser unsubscribes it, or after 5 failed sendings in a row.
			</li>
			<li>The alerts of your zones: 30 days, or as long as the alert is in force.</li>
			<li>
				The daily backups of the database: 7 days at most. A deleted account is gone from them within that
				time.
			</li>
		</ul>
		<h2>Cookies</h2>
		<p>
			Two cookies, both needed: <code>vigie-session</code> (your sign-in, 30 days, not readable by the page's
			scripts) and <code>vigie-lang</code> (the language you chose, one year). The light or dark theme is kept in
			your browser, not on the site, and so are the places you follow without an account on the "Near me" page:
			they are not sent to the site, and clearing the site's data in the browser clears them.
		</p>
		<h2>Your rights</h2>
		<p>
			From <a href="/account">your account</a>, you can download everything the site keeps about you and
			delete the account: deleting erases the account, its passkeys, its sessions, its zones, its devices and
			its alerts at once, and the backups forget it within 7 days. You can also complain to the French data
			protection authority, the CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).
		</p>
		<h2>Where</h2>
		<p>
			On the site's server, rented from OVHcloud in Beauharnois, Canada. The European Union recognises Canada
			as giving an adequate level of protection to personal data (Commission decision 2002/2/EC, for
			businesses).
		</p>
	{/if}
</div>
