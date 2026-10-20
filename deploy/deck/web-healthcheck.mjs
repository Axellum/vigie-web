// Health of Vigie Web inside its container: exit 0 when a page answers 2xx. (A quadlet HealthCmd with
// quotes is mangled, hence this file mounted read-only.)
const response = await fetch('http://127.0.0.1:3000/about', { signal: AbortSignal.timeout(4000) }).catch(
	() => null
);
process.exit(response?.ok ? 0 : 1);
