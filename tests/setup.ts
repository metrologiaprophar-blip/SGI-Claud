// Base de datos SQLite exclusiva para pruebas (creada en tests/integration/global-setup.ts).
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = "file:./test.db";
// Archivos de pruebas en una carpeta temporal propia.
process.env.STORAGE_DIR = "storage-test";
