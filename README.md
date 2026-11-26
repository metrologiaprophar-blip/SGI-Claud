# SGI Cloud - PROPHAR

Plataforma web para el Sistema de Gestión Integrado de PROPHAR: BPM/GMP farmacéuticas, BPADT
(almacenamiento, distribución y transporte), ISO 9001 y metrología.

- Requisitos del producto: [`PRD.md`](PRD.md)
- Arquitectura, convenciones y comandos: [`CLAUDE.md`](CLAUDE.md)

## Estado: Fase 1 (núcleo)

- Portal de acceso en dos columnas (ID corporativo + usuario + contraseña), con indicadores de seguridad.
- Español, inglés y portugués.
- Aplicación instalable (PWA) con botón "Instalar".
- "¿Olvidó su clave?" → solicitud que aprueba el administrador (clave temporal + cambio obligatorio).
- Multiempresa con aislamiento forzado por `organizationId`.
- Roles `SUPER_ADMIN`, `ADMIN_EMPRESA`, `USUARIO`.
- Bloqueo tras 5 intentos fallidos, caducidad de clave, historial de 5 claves y cierre por inactividad.
- Registro de auditoría de solo inserción con valor anterior, valor nuevo y motivo.
- Barra superior por áreas: Documentos, Calidad GMP, Metrología, Almacén y distribución, Auditorías, SGI/ISO 9001,
  Más áreas y Administración. Los módulos de fases posteriores muestran "Próximamente".
- Administración: usuarios, solicitudes de clave, registro de auditoría y datos/políticas de la empresa.

## Puesta en marcha

Requisitos: Node.js 22 o superior.

```bash
npm install
cp .env.example .env
```

Genera un secreto y pégalo en `AUTH_SECRET` dentro de `.env`:

```bash
openssl rand -base64 32
```

Crea la base de datos (SQLite por defecto) y los usuarios iniciales:

```bash
npm run db:setup
```

```bash
npm run dev
```

Abre http://localhost:3000 e ingresa con:

| ID corporativo | Usuario | Contraseña inicial |
|---|---|---|
| `PROPHAR` | `admin` | `ChangeMe!2026` |
| `PROPHAR` | `metrologia` | `ChangeMe!2026` |

En el primer acceso el sistema pide cambiar la contraseña. Para definir otras claves iniciales, usa
`SEED_ADMIN_PASSWORD` y `SEED_SUPERADMIN_PASSWORD` en `.env` antes de `npm run db:setup`.

### Con PostgreSQL

```bash
docker compose up -d db
```

En `.env`:

```
DATABASE_PROVIDER=postgresql
DATABASE_URL="postgresql://sgi:sgi@localhost:5432/sgi_cloud?schema=public"
```

```bash
npm run db:setup
```

## Pruebas

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` ejecuta las pruebas unitarias y de integración contra una base SQLite temporal (`test.db`).
`npm run test:e2e` compila la aplicación y recorre en Chromium el login, los idiomas, la PWA, la solicitud
y aprobación de clave, el cambio obligatorio y la gestión de usuarios (`e2e.db`).

## Producción (resumen)

1. PostgreSQL gestionado con copias de seguridad diarias.
2. Variables: `DATABASE_PROVIDER=postgresql`, `DATABASE_URL`, `AUTH_SECRET`, `SEED_*_PASSWORD`.
3. `npm ci && npm run build && npm run db:deploy && npm run db:seed && npm start`, siempre detrás de HTTPS.
4. Si se usará para registros GMP, PROPHAR debe validar el sistema (ver `PRD.md §5`).
