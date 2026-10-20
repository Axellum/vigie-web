// A PostgreSQL for the end-to-end tests, in memory (PGlite, PostgreSQL compiled to WebAssembly): nothing to
// install, nothing kept. The site reaches it through the PostgreSQL protocol, like a real server.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.TEST_DB_PORT || 15433);
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 16 });
await server.start();
console.log(`test database on postgres://postgres@127.0.0.1:${port}/postgres`);
