<script lang="ts">
	import { t, type Key, type Lang } from '#lib/i18n.js';
	import type { Level } from '#lib/types.js';

	let { lang, level }: { lang: Lang; level: Level | null } = $props();
</script>

<span class="pill sev-{level ?? 'NONE'}"
	>{level ? t(lang, `level.${level}` as Key) : t(lang, 'level.none')}</span
>
