# CLAUDE.md — SGI Cloud - PROPHAR

Plataforma web para el Sistema de Gestión Integrado de PROPHAR: BPM/GMP farmacéuticas, BPADT
(almacenamiento, distribución y transporte), ISO 9001, ISO/IEC 17025, ISO 14001 e ISO 45001. Arquitectura multiempresa.
Requisitos completos en `PRD.md`; leerlo antes de cambiar comportamiento funcional.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, `src/proxy.ts`), React 19, TypeScript 6 `strict` |
| Estilos | Tailwind CSS v4 con tokens de marca; componentes propios en `src/components/ui` |
| Base de datos | PostgreSQL 16 (producción) · SQLite (desarrollo rápido) · Prisma ORM 6.19 (no subir a 7 sin migrar a driver adapters) |
| Autenticación | Auth.js v5 (`next-auth@5`), Credentials (ID corporativo + usuario + clave), JWT, `bcryptjs` coste 12 |
| Validación | Zod |
| i18n | `next-intl` sin prefijo en URL; cookie `NEXT_LOCALE`; `messages/{es,en,pt}.json` |
| PWA | `src/app/manifest.ts` + `public/sw.js` propio |
| Tests | Vitest (unidad/integración con SQLite temporal) · Playwright (e2e) |
| Calidad | ESLint 9 (`eslint-config-next`), Prettier, `tsc --noEmit` |

## Marca

- Nombre visible: **SGI Cloud - PROPHAR**. Logo: `public/brand/prophar-logo.svg`.
- Color primario `#5A248C` (morado PROPHAR) con escala `brand-50…900` definida en `src/app/globals.css`
  (`@theme`). Neutros slate. Tipografía Inter.
- No usar nombres, textos, imágenes ni logos de NORMIC / Solutions Valer.

## Estructura

```
prisma/
  schema.prisma          # fuente de verdad (provider postgresql)
  migrations/            # migraciones PostgreSQL (incluye trigger de AuditLog solo inserción)
  generated/sqlite/      # esquema SQLite generado + dev.db/test.db/e2e.db (ignorado por git)
  seed.ts                # empresas PLATFORM, PROPHAR y OTRA + usuarios iniciales
messages/                # es.json, en.json, pt.json
public/                  # brand/, icons/, sw.js, offline.html
scripts/
  prisma-schema.mjs      # genera prisma/generated/sqlite/schema.prisma (provider sqlite)
  prisma.mjs             # ejecuta la CLI de Prisma con el esquema de DATABASE_PROVIDER
  db-setup.mjs           # sqlite → db push · postgresql → migrate deploy
src/
  app/
    (public)/login/
    (public)/cambiar-clave/
    (public)/salir/      # cierre de sesión por GET (inactividad, sesión invalidada)
    (app)/layout.tsx     # barra superior por áreas + migas + aviso de inactividad
    (app)/inicio/
    (app)/[area]/        # portada de área y [tool] "Próximamente" (desde config/navigation.ts)
    (app)/admin/         # usuarios, solicitudes-clave, auditoria, empresa (ADMIN_EMPRESA)
    api/auth/[...nextauth]/route.ts
    api/health/route.ts
    sesion/ping/         # mantiene viva la sesión con actividad sin navegación
    manifest.ts
  config/navigation.ts   # áreas, herramientas, fase, normas, rol requerido (fuente del menú)
  auth.ts                # Auth.js: authorize, callbacks jwt (inactividad) / session
  proxy.ts               # (antes middleware) redirección a /login y a /cambiar-clave
  i18n/                  # request.ts, locales
  components/ui/         # Button, Input, Modal, Table, Badge, Dropdown…
  components/layout/     # TopNav, AreaMenu, Breadcrumbs, LanguageSwitcher, InstallPwaButton, UserMenu
  features/<modulo>/     # service.ts (lógica testeable) · actions.ts ("use server") · components/
  server/
    db/client.ts         # PrismaClient singleton (uso restringido)
    db/tenant-client.ts  # createTenantClient(): extensión Prisma + TENANT_MODELS
    db/tenant.ts         # getTenantDb(): cliente de la empresa de la sesión
    auth/guards.ts       # requireSession(), requireRole(), requireSessionAllowingPasswordChange()
    auth/authenticate.ts # verificación de credenciales, bloqueo, auditoría de accesos
    action.ts            # getServiceContext(), runAction(), parseForm()
    public/              # lógica pública sin sesión (solicitud de clave)
    auth/password.ts     # hash, verificación, política, historial
    audit.ts             # logAudit({ action, entity, before, after, reason })
    signatures.ts        # verifySigner() + recordSignature(): firma electrónica reutilizable
    permissions.ts       # requirePermission(ctx, "DOC_MANAGE" | "DOC_APPROVE") (lee la BD)
    storage.ts           # archivos en STORAGE_DIR: validación de tipo real, SHA-256, rutas seguras
    rate-limit.ts
  lib/                   # utilidades puras
tests/
  unit/                  # política de claves, auditoría, diccionarios, navegación
  integration/           # contra SQLite real (test.db): aislamiento, login, solicitudes, usuarios
  e2e/                   # Playwright sobre build de producción (e2e.db)
```

## Comandos

```bash
npm install
cp .env.example .env              # completar AUTH_SECRET (npx auth secret)
npm run db:setup                  # genera cliente, migra y siembra (SQLite por defecto)
npm run dev                       # http://localhost:3000
npm run lint
npm run typecheck
npm test                          # Vitest
npm run test:e2e                  # Playwright
npm run build && npm start
npm run db:studio
npm run db:migrate -- --name x    # nueva migración (PostgreSQL)
docker compose up -d db           # PostgreSQL local; luego DATABASE_PROVIDER=postgresql
```

`DATABASE_PROVIDER=sqlite` (por defecto, `DATABASE_URL=file:./dev.db`) o `postgresql`. Los scripts `db:*`
eligen el esquema según esa variable; **solo se edita a mano `prisma/schema.prisma`**.

Antes de dar una tarea por terminada: `npm run lint && npm run typecheck && npm test` y, si cambia la
interfaz o la autenticación, `npm run test:e2e`.

Las bases de pruebas (`test.db`, `e2e.db`) y sus carpetas de archivos (`storage-test/`, `storage-e2e/`) se
recrean solas en cada ejecución. Prisma bloquea
`db push --force-reset` lanzado por agentes: no forzarlo; para limpiar la BD de desarrollo, que lo haga
una persona (`rm prisma/generated/sqlite/dev.db && npm run db:setup`).

## Reglas de arquitectura (obligatorias)

1. **Aislamiento por empresa**
   - Todo modelo de negocio tiene `organizationId` + índice.
   - En `features/**` y `app/**` los datos se leen y escriben **solo** con `const db = await getTenantDb()`.
     Prohibido importar `@/server/db/client` fuera de `src/server/**`, `prisma/seed.ts` y la consola
     SUPER_ADMIN (regla ESLint `no-restricted-imports`).
   - El `organizationId` sale siempre de la sesión. Recurso de otra empresa → `notFound()`.
   - Altas con claves foráneas escalares (`userId`), nunca `connect`, ni la relación `organization`.
   - Modelo nuevo con `organizationId` → añadirlo a `TENANT_MODELS` en `tenant-client.ts` (si no, la
     extensión lanza error al usarlo).
   - Cada feature incluye un test de integración de aislamiento entre empresas.
2. **Autorización en servidor**: toda página, Server Action y Route Handler empieza con `requireSession()`
   o `requireRole()` (en acciones: `getServiceContext(...roles)`). `requireSession()` también obliga a
   cambiar la clave pendiente; el proxy NO basta (las redirecciones de Server Actions no pasan por él).
   Solo `/cambiar-clave` y el cambio de idioma usan `requireSessionAllowingPasswordChange()`.
3. **Server Actions**: entrada validada con Zod (`parseForm`); lógica en `service.ts` que recibe un
   `ServiceContext` y lanza `ServiceError(code)`; la acción la envuelve con `runAction` y devuelve
   `{ ok: true, data } | { ok: false, error: { code, message, fields } }`. Los códigos se traducen en el
   cliente con `useActionMessages()` (`errors.<code>` / `fieldErrors.<code>`).
   Formularios: `<form action={formAction} onSubmit={submitWithoutReset(formAction)}>` — ambos atributos
   (el `action` evita envíos GET antes de hidratar; el `onSubmit` evita que React borre lo escrito).
4. **Integridad de datos GMP (ALCOA+)**
   - Toda creación, cambio, anulación, aprobación y evento de autenticación llama a `logAudit()` con
     `before`/`after`. Cambiar un registro aprobado exige `reason` (motivo).
   - `AuditLog` es solo inserción: lo impiden la extensión de Prisma y, en PostgreSQL, un trigger.
   - Usar `logAudit(entry, tx)` dentro de la misma transacción que el cambio auditado.
   - Los registros GMP **no se borran**: se anulan (`voidedAt`, `voidedById`, `voidReason`).
   - Registros aprobados → nueva versión, nunca edición en sitio.
   - Firmas electrónicas (desde F2): reautenticación con contraseña, significado de la firma y hash del
     contenido firmado. Quien elabora no aprueba.
   - Fechas en UTC con hora del servidor; nunca confiar en la hora del cliente para registros GMP.
   - Nunca guardar contraseñas, hashes ni tokens en `metadata`, `before` o `after`.
5. **Contraseñas**: solo vía `src/server/auth/password.ts` (bcrypt 12, mínimo 10 caracteres, historial de 5,
   caducidad según empresa). Errores de login genéricos.
6. **Navegación**: el menú se genera desde `src/config/navigation.ts`. Una herramienta nueva se registra ahí
   (área, slug, clave i18n, fase, normas); al implementarla, se crea su ruta estática y se sube
   `CURRENT_PHASE` o se ajusta `phase`.
7. **i18n**: ninguna cadena visible fija; toda clave nueva va en los **tres** diccionarios
   (lo verifica `tests/unit/messages.test.ts`). Las claves no pueden contener puntos (next-intl los
   interpreta como anidación).
8. **Esquema compatible SQLite/PostgreSQL**: sin `@db.*`, sin arrays escalares. Enums y `Json` sí.
9. **Service worker**: nunca cachear `/api/**` ni páginas autenticadas.
10. **Firma electrónica**: toda firma GMP usa `verifySigner()` (fuera de la transacción) y
    `recordSignature(ctx, tx, …)` (dentro de la transacción del cambio que firma), con un significado de
    `SignatureMeaning` y el SHA-256 del contenido firmado. `ElectronicSignature` es de solo inserción.
11. **Permisos GMP**: se comprueban con `requirePermission()`/`hasPermission()`, que leen la BD en cada
    acción (una revocación tiene efecto inmediato). Ningún rol los concede implícitamente.
12. **Archivos**: solo a través de `src/server/storage.ts` y descargas por `/api/files/...` con
    comprobación de empresa, permisos, SHA-256 y auditoría. Nunca servir `STORAGE_DIR` como estático.
13. **Referencias entre registros** (revisor, proceso, lectores…): validarlas con el cliente de la empresa
    antes de guardarlas; un id de otra empresa debe resultar en `not_found`/`invalid_user`.

## Convenciones de código

- TypeScript `strict`, sin `any`.
- Server Components por defecto; `"use client"` solo donde haya estado o eventos, lo más abajo posible.
- Archivos `kebab-case.ts(x)`, componentes `PascalCase`, funciones `camelCase`, enums `UPPER_SNAKE`.
- Identificadores de código y BD en inglés; rutas URL y textos de interfaz en español (diccionarios).
- Alias `@/` → `src/`.
- Un componente por archivo; dividir por encima de ~200 líneas.
- Accesibilidad: `<label>` en todo input, foco visible, contraste AA, menús y modales navegables con teclado.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) en imperativo.

## Roles

`SUPER_ADMIN` (plataforma) · `ADMIN_EMPRESA` (su empresa) · `USUARIO` (su empresa, con permisos GMP desde F2).
Matriz en `PRD.md §2`; implementación en `src/server/auth/guards.ts`. Segregación de funciones: nadie
resuelve su propia solicitud de clave ni cambia su propio rol/estado.

## Credenciales de desarrollo (seed)

| ID corporativo | Usuario | Rol | Clave |
|---|---|---|---|
| `PLATFORM` | `superadmin` | SUPER_ADMIN | `SEED_SUPERADMIN_PASSWORD` o `ChangeMe!2026` |
| `PROPHAR` | `admin` | ADMIN_EMPRESA | `SEED_ADMIN_PASSWORD` o `ChangeMe!2026` |
| `PROPHAR` | `metrologia` | USUARIO | igual que el admin |
| `PROPHAR` | `calidad` | USUARIO | igual que el admin |
| `OTRA` | `admin` | ADMIN_EMPRESA | igual (solo para pruebas de aislamiento) |

Permisos GMP del seed: `admin` → `DOC_MANAGE` + `DOC_APPROVE`; `metrologia` → `DOC_MANAGE`.
Circuito de ejemplo: metrología elabora, calidad revisa y admin aprueba.

Solo para desarrollo: el seed se niega a ejecutarse en producción sin las variables definidas, y los
usuarios sembrados deben cambiar la clave en el primer acceso salvo con `SEED_FORCE_PASSWORD_CHANGE=false`
(lo usan las pruebas e2e). El seed es idempotente: no sobrescribe usuarios existentes.
