// A PostgreSQL with PostGIS for the end-to-end tests, in memory (PGlite, PostgreSQL compiled to WebAssembly):
// nothing to install, nothing kept. The site reaches it through the PostgreSQL protocol, like a real server.
// It is one session shared by every connection (the site's and the specs'): see e2e/pglite-batches.mjs.
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { serializeBatches } from './pglite-batches.mjs';

const port = Number(process.env.TEST_DB_PORT || 15433);
const db = await PGlite.create({ extensions: { postgis } });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 16 });
serializeBatches(server);
await server.start();
console.log(`test database on postgres://postgres@127.0.0.1:${port}/postgres`);
