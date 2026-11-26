# PRD — SGI Cloud - PROPHAR

Plataforma web para gestionar el **Sistema de Gestión Integrado (SGI)** de PROPHAR:
**Buenas Prácticas de Manufactura farmacéuticas (BPM/GMP)**, **Buenas Prácticas de Almacenamiento,
Distribución y Transporte (BPADT)**, **ISO 9001**, **ISO/IEC 17025**, **ISO 14001** e **ISO 45001**,
con metrología y calibración integradas.

La arquitectura es multiempresa (SaaS), aunque el primer y principal cliente es PROPHAR.

> **Referencia funcional:** plataforma NORMIC (solutions-valer.com), analizada con el usuario de demo
> el 26/11/2026 en modo solo lectura (≈ 50 pantallas). Se toma su **funcionalidad** como referencia.
> Marca, textos, imágenes y diseño son propios (logo y colores de PROPHAR).
>
> **Importante:** el "HACCP + GMP" de la demo es de **inocuidad alimentaria** (ISO 22000, PCC, POES).
> PROPHAR necesita **GMP farmacéutico**, que es distinto. De la demo se reutiliza la mecánica
> (lotes, bloqueo y liberación, mediciones, desviaciones, retiros con simulacro, checklist con puntuación),
> no el contenido de inocuidad.

---

## 0. Hallazgos del análisis de la demo

| Aspecto | Lo observado | Decisión para SGI Cloud - PROPHAR |
|---|---|---|
| Tecnología | Node.js + Express renderizado en servidor, sesión por cookie, CSRF, helmet, Tailwind, nginx en VPS. | Next.js App Router + Auth.js; mismas garantías (sesión segura, CSRF, cabeceras). |
| Login | Dos columnas: imagen + propuesta de valor e indicadores *SSL · VPS dedicado · Disponibilidad 99,9 %*; a la derecha logo, idioma, botón "Instalar en mi celular", usuario, contraseña con ojo, "¿Olvidó su clave?", aviso de sistema monitoreado. | Misma estructura con **dos campos**: ID corporativo + usuario (§3). |
| Hub tras el login | "Selecciona el módulo": *Sistema de Gestión* / *Inocuidad (HACCP + GMP)*. | Inicio único con accesos a las áreas; sin hub separado. |
| Navegación | **Barra superior por áreas** con menús desplegables (Calidad, Medio Ambiente, Inocuidad, SST, Tutoriales, Más áreas); "Vista por norma"; buscador, notificaciones, bandeja, cambio de clave, idioma, cerrar sesión. Migas "Área / Herramienta". | **Igual: barra superior por áreas** con desplegables (§8) y filtro por norma. |
| Hallazgos / NC | Registro único en 5 pasos: Detección → Análisis → Plan de acción → Verificación → Cierre. Tipo (NC / Observación / Oportunidad de mejora), origen, proceso, responsable, acción inmediata. | Base del módulo Desviaciones / CAPA (GMP). |
| Documentos | Listado maestro (7.5), versiones, bandeja de revisión, "mi firma de aprobación", historial, carpetas de registros. | Control documental GMP con firma electrónica (F2). |
| Lotes y control | Lote (código, tipo, producto, cantidad, fecha, vencimiento, proveedor, lote del proveedor). Una medición fuera de límite **abre una desviación y bloquea el lote y sus derivados**; la liberación exige decisión expresa de Calidad. | Mismo principio para lotes, cuarentena y liberación (F5/F8). |
| Retiros | Retiro real o **simulacro** desde un lote raíz, motivo, coordinador, alcance y recuperación. | Retiro de mercado + simulacro anual (F5). |
| Equipos | Equipos de medición (código, nombre, uso) y evaluación de mediciones afectadas por un equipo fuera de calibración. | Metrología y calibración completas (F4). |
| Checklist GMP | Inspecciones por sector con ítems (categoría, descripción, resultado, observación) y puntuación; tendencia. | Autoinspecciones GMP/BPADT (F6). |
| Otros | Riesgos P×I (inicial → residual), plan anual de auditorías (tabla/calendario), indicadores por año con mediciones mensuales, revisión por la dirección, capacitaciones, proveedores, calibración en Mantenimiento, mensajería, asistente IA, exportación Word/PDF/Excel, planes de pago. | Ver roadmap (§1). |

---

## Contexto regulatorio

| | |
|---|---|
| País | **Ecuador** (zona horaria `America/Guayaquil`, moneda USD) |
| Autoridad sanitaria | ARCSA: inspecciones y certificación de BPM y BPADT, registros sanitarios, notificación de retiros |
| Identificación fiscal | RUC de 13 dígitos (sociedades: termina en `001`) |
| Datos personales | LOPDP |
| Normas del SGI | BPM (GMP) y BPADT de ARCSA · ISO 9001 · ISO/IEC 17025 · ISO 14001 · ISO 45001 |

## 1. Objetivo, alcance y fases

| | |
|---|---|
| **Problema** | El SGI de PROPHAR se gestiona en papel, hojas de cálculo y carpetas: difícil demostrar trazabilidad, integridad de datos y control de versiones ante la autoridad sanitaria y auditores. |
| **Solución** | Una aplicación web única donde cada área registra, revisa y aprueba su información GMP/BPADT/ISO con firma electrónica, registro de auditoría y evidencias listas para inspección. |
| **Usuarios** | Garantía de Calidad (QA), Control de Calidad, Producción, Almacén y Distribución, Metrología, Mantenimiento, RRHH/Capacitación, Dirección Técnica, Gerencia. |
| **Fuera de alcance (v1)** | Facturación, ERP/inventario contable, LIMS completo, SSO, app nativa, envío automático de correos. |

### Fases

| Fase | Contenido |
|---|---|
| **F1 — Núcleo** | Portal de acceso, autenticación, multiempresa, roles, registro de auditoría preparado para GMP, restablecimiento de clave por aprobación, barra superior por áreas, inicio, administración de usuarios, PWA, ES/EN/PT. **(Este plan)** |
| F2 — Documentos GMP ✅ | Listado maestro, POE/SOP, especificaciones, registros; versiones; revisión y aprobación con **firma electrónica**; lectura obligatoria; aviso de copia no controlada. Detalle en §13. |
| F3 — Calidad GMP ✅ | **Desviaciones**, **CAPA**, **Control de cambios**, con evaluación de riesgo e impacto. Detalle en §14. |
| F4 — Metrología y laboratorio ✅ | Inventario de equipos, programa y registros de **calibración** con regla de decisión y trazabilidad de patrones, verificaciones intermedias, mantenimiento, **calificación DQ/IQ/OQ/PQ**, fuera de servicio con evaluación de impacto y desviación vinculada, **ensayos de aptitud** (ISO 13528). Detalle en §15. |
| F5 — Almacén y distribución (BPADT) | Áreas y ubicaciones, **monitoreo de temperatura y humedad**, mapeo térmico, **excursiones**, recepción y cuarentena, despacho y transporte, cadena de frío, devoluciones, productos sospechosos/falsificados, **retiros de mercado y simulacros**. |
| F6 — Auditorías, proveedores, quejas y capacitación | Plan anual, **autoinspecciones GMP/BPADT** con checklist y puntuación, auditorías a proveedores, inspecciones de la autoridad; calificación de proveedores y clientes; **quejas de producto**; matriz y registros de **capacitación**. |
| F7 — Dirección e indicadores | Indicadores y objetivos, gestión de riesgos de calidad (ICH Q9), **revisión anual de producto (RAP/PQR)**, revisión por la dirección, contexto/partes interesadas/política (ISO 9001). |
| F8 — Producción y laboratorio | Productos y registros sanitarios, lotes y trazabilidad, liberación de lotes, **OOS/OOT**, validaciones (proceso, limpieza, métodos, sistemas computarizados), monitoreo ambiental; consola SUPER_ADMIN y exportaciones. |
| F9 — Ambiente y SST | **ISO 14001**: aspectos e impactos, matriz legal, residuos, emergencias y simulacros. **ISO 45001**: IPERC, incidentes y accidentes, EPP, consulta y participación. |
| F10 — Laboratorio avanzado (ISO/IEC 17025) | Estimación de incertidumbre (presupuestos GUM), validación y verificación de métodos, emisión de informes de ensayo y certificados de calibración. |

---

## 2. Roles y permisos

| Rol | Ámbito | Puede |
|---|---|---|
| `SUPER_ADMIN` | Plataforma | Crear/suspender empresas y su primer `ADMIN_EMPRESA`. No ve datos GMP de las empresas. |
| `ADMIN_EMPRESA` | Su empresa | Gestionar usuarios, aprobar/rechazar solicitudes de clave, configurar la empresa (procesos, áreas), ver el registro de auditoría. |
| `USUARIO` | Su empresa | Trabajar en los módulos según sus permisos. |

- Desde F2 se añaden **permisos por función GMP** sobre `USUARIO` (p. ej. `QA_APPROVER`, `QC`, `PRODUCTION`,
  `WAREHOUSE`, `METROLOGY`, `TECHNICAL_DIRECTOR`), asignables a cada usuario. Ejemplos: solo QA aprueba
  documentos, cierra desviaciones y libera lotes.
- La **segregación de funciones** es obligatoria en GMP: quien elabora un registro no puede aprobarlo.
- Todo se comprueba en el servidor; el menú solo oculta.

---

## 3. Portal de acceso (`/login`)

### 3.1 Diseño
- Dos columnas en escritorio (≥ 1024 px); en móvil, formulario primero.
- **Izquierda**: imagen corporativa con degradado en el morado de PROPHAR (`#5A248C`), titular y texto de
  propuesta de valor, e indicadores de seguridad:
  - **Conexión segura SSL**: verde solo si la página se sirve por HTTPS.
  - **Disponibilidad** y **Respaldo diario**: textos configurables que deben corresponder con la realidad (§9).
- **Derecha**: logo PROPHAR + "SGI Cloud", "Bienvenido", selector de idioma, botón "Instalar SGI Cloud en mi
  dispositivo", formulario, "¿Olvidó su clave?", aviso "Sistema privado y monitoreado. Acceso restringido a
  personal autorizado".

### 3.2 Formulario de acceso (dos campos de identificación)
| Campo | Reglas |
|---|---|
| ID corporativo | `Organization.code` (p. ej. `PROPHAR`). Sin distinción de mayúsculas. Se recuerda en el dispositivo. |
| Usuario | `User.username`, único dentro de la empresa. |
| Contraseña | Mínimo 10 caracteres en altas/cambios; botón mostrar/ocultar. |

- Error **genérico** ("Credenciales no válidas").
- Bloqueo 15 min tras **5 intentos fallidos** por usuario, y límite por IP.
- `mustChangePassword = true` → redirección obligatoria a `/cambiar-clave`.
- Caducidad de contraseña configurable por empresa (p. ej. 90 días) y no reutilizar las 5 últimas (práctica habitual en sistemas GxP).
- Cierre de sesión por inactividad configurable (por defecto 15 min).
- Cuentas **personales e intransferibles**; no se permiten usuarios genéricos compartidos.

### 3.3 Idiomas
Español (por defecto), Inglés y Portugués con `next-intl`; idioma en cookie y luego en `User.locale`.

### 3.4 PWA
Manifest con logo y colores de PROPHAR; service worker que solo cachea recursos estáticos y una página
offline (**nunca** datos GMP ni páginas autenticadas). Botón de instalación (Chrome/Edge/Android con
`beforeinstallprompt`; iOS con instrucciones); oculto si ya está instalada.

### 3.5 "¿Olvidó su clave?" (sin correo automático)
1. Modal: ID corporativo, usuario, motivo/contacto opcional.
2. Se crea `PasswordResetRequest` (`PENDING`) solo si existen empresa y usuario, pero la respuesta es siempre
   la misma ("Si los datos son correctos, el administrador recibirá su solicitud").
3. Máximo 1 pendiente por usuario y 5 por IP y hora; caducan a las 72 h.
4. El `ADMIN_EMPRESA` las ve en *Administración → Solicitudes de clave* (con contador) y puede **aprobar**
   (clave temporal mostrada una sola vez + cambio obligatorio + desbloqueo) o **rechazar** con motivo.
5. Nadie resuelve su propia solicitud: la de un administrador la resuelve otro administrador de la empresa.
   Si es el único, en F1 el `SUPER_ADMIN` restablece la clave manualmente; la bandeja de plataforma para
   estos casos llega con la consola SUPER_ADMIN (F7). Todo queda en el registro de auditoría.

---

## 4. Multiempresa

Base de datos y esquema compartidos con columna `organizationId` en toda tabla de negocio.

1. El `organizationId` sale **solo** de la sesión.
2. Los módulos acceden a datos únicamente con `getTenantDb()` (extensión de Prisma que impone el filtro y
   rellena `organizationId` en las altas). El cliente sin filtro solo se usa en `src/server/**`, el seed y la
   consola SUPER_ADMIN; una regla de ESLint lo impide en el resto.
3. Pruebas automáticas "empresa A no ve ni modifica datos de empresa B" en cada módulo.
4. En producción, Row-Level Security de PostgreSQL como segunda barrera (F8).
5. IDs no secuenciales (`cuid`); recurso de otra empresa → 404.

---

## 5. Integridad de datos GMP (requisito transversal)

Los registros GMP electrónicos deben cumplir **ALCOA+** (atribuible, legible, contemporáneo, original,
exacto, completo, consistente, perdurable, disponible). Referencias: Guías de BPM de la OMS, PIC/S, EU GMP
Anexo 11, 21 CFR Part 11, GAMP 5, ICH Q9/Q10 y la normativa técnica sanitaria vigente de la **ARCSA**
(Agencia Nacional de Regulación, Control y Vigilancia Sanitaria del Ecuador) para BPM de medicamentos y
para BPADT de establecimientos farmacéuticos. Los números de resolución vigentes se registrarán en
configuración y los validará QA antes de citarlos en plantillas o informes.

| Requisito | Cómo se cumple |
|---|---|
| Registro de auditoría | `AuditLog` de solo inserción: quién, qué, cuándo (hora del servidor, UTC), entidad, **valor anterior y nuevo**, y **motivo del cambio** cuando se modifica un registro GMP aprobado. No se puede desactivar ni editar. |
| Firma electrónica (F2) | Al firmar se vuelve a pedir la contraseña; la firma guarda usuario, nombre, fecha/hora, **significado** (elaboró / revisó / aprobó) y queda vinculada al contenido firmado (hash). |
| Sin borrados | Los registros GMP no se eliminan: se **anulan** con motivo y siguen visibles. |
| Versiones | Documentos y registros aprobados conservan su historial; un cambio crea una nueva versión. |
| Reloj | Hora del servidor (NTP), almacenada en UTC y mostrada en la zona de la empresa. |
| Copias de seguridad | Diarias, cifradas, con prueba de restauración periódica. |
| Validación del sistema | Al usarse para registros GMP, **PROPHAR debe validar la aplicación** (URS, evaluación de riesgos, IQ/OQ/PQ según GAMP 5). El proyecto entregará: especificación de requisitos, matriz de trazabilidad requisito → prueba, pruebas automatizadas y notas de versión. |

F1 deja preparados el `AuditLog` con valores anterior/nuevo y motivo, la política de contraseñas y la
caducidad de sesión. La firma electrónica llega en F2.

---

## 6. Modelo de datos (F1)

```prisma
enum Role        { SUPER_ADMIN ADMIN_EMPRESA USUARIO }
enum Status      { ACTIVE SUSPENDED }
enum ResetStatus { PENDING APPROVED REJECTED EXPIRED }

model Organization {
  id                   String   @id @default(cuid())
  code                 String   @unique        // ID corporativo, en mayúsculas (PROPHAR)
  name                 String
  taxId                String?                 // RUC
  status               Status   @default(ACTIVE)
  locale               String   @default("es")
  timezone             String   @default("America/Guayaquil")
  passwordMaxAgeDays   Int      @default(90)
  sessionIdleMinutes   Int      @default(15)
  isPlatform           Boolean  @default(false)
  users                User[]
  resetRequests        PasswordResetRequest[]
  auditLogs            AuditLog[]
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

model User {
  id                 String   @id @default(cuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id])
  username           String              // minúsculas
  fullName           String
  email              String?
  jobTitle           String?             // cargo (relevante para firmas GMP)
  passwordHash       String              // bcrypt coste 12
  passwordHistory    Json?               // últimos 5 hashes
  role               Role     @default(USUARIO)
  status             Status   @default(ACTIVE)
  locale             String?
  mustChangePassword Boolean  @default(false)
  failedLoginCount   Int      @default(0)
  lockedUntil        DateTime?
  lastLoginAt        DateTime?
  passwordChangedAt  DateTime @default(now())
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([organizationId, username])
  @@index([organizationId])
}

model PasswordResetRequest {
  id             String      @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId         String
  user           User        @relation(fields: [userId], references: [id])
  status         ResetStatus @default(PENDING)
  note           String?
  requestIp      String?
  resolvedById   String?
  resolvedAt     DateTime?
  resolutionNote String?
  expiresAt      DateTime
  createdAt      DateTime    @default(now())
  @@index([organizationId, status])
}

model AuditLog {
  id             String   @id @default(cuid())
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])
  actorId        String?
  actorName      String?             // copia del nombre en ese momento
  action         String              // "auth.login.success", "user.update"…
  entityType     String?
  entityId       String?
  before         Json?               // valor anterior (sin secretos)
  after          Json?               // valor nuevo (sin secretos)
  reason         String?             // motivo del cambio
  ip             String?
  userAgent      String?
  createdAt      DateTime @default(now())
  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
}
```

Mismo esquema en SQLite (desarrollo) y PostgreSQL (producción): sin tipos nativos `@db.*`.

### Entidades previstas (orientativo)
- **Documentos**: `Document`, `DocumentVersion`, `ElectronicSignature`, `DocumentDistribution`, `ReadAcknowledgement`.
- **Calidad GMP**: `Deviation`, `Capa`, `CapaAction`, `ChangeControl`, `RiskAssessment`, `Complaint`, `Recall`.
- **Metrología**: `Equipment`, `CalibrationPlan`, `Calibration` (certificado, patrón, incertidumbre, resultado), `Qualification`, `MaintenanceOrder`.
- **BPADT**: `StorageArea`, `Location`, `Sensor`, `EnvironmentalReading`, `TemperatureExcursion`, `ThermalMapping`, `Receipt`, `Shipment`, `Return`, `Carrier`.
- **Otros**: `Product`, `SanitaryRegistration`, `Batch`, `BatchRelease`, `Supplier`, `Customer`, `Audit`, `AuditChecklistItem`, `Finding`, `Training`, `TrainingRecord`, `Indicator`, `IndicatorMeasurement`, `Attachment`, `Process`.

Todas con `organizationId`.

---

## 7. Autenticación y sesión

- **Auth.js v5**, `Credentials` (campos `organizationCode`, `username`, `password`).
- `authorize()`: normaliza → empresa activa → usuario activo → bloqueo → `bcrypt.compare` (hash ficticio si
  el usuario no existe, para igualar tiempos) → contadores → auditoría.
- Sesión JWT en cookie `httpOnly`, `secure`, `sameSite=lax`; caducidad absoluta 8 h + **inactividad según la empresa**.
- El JWT incluye `passwordChangedAt`; si la clave cambia o el usuario se suspende, la sesión deja de valer.
- `src/proxy.ts` (Next 16) protege las rutas privadas y fuerza `/cambiar-clave`; además `requireSession()`
  repite ambas comprobaciones en el servidor, porque las redirecciones de Server Actions no pasan por el proxy.

---

## 8. Navegación y panel (`/inicio`)

**Barra superior por áreas** (como la demo), con menús desplegables y migas "Área / Herramienta":

| Área | Herramientas (fase) |
|---|---|
| **Inicio** | Avisos pendientes, accesos recientes, tarjetas resumen (F1). |
| **Documentos** | Listado maestro, POE/SOP, especificaciones, registros, bandeja de revisión, mis firmas (F2). |
| **Calidad GMP** | Desviaciones, CAPA, control de cambios (F3); quejas (F6); OOS/OOT, liberación de lotes, RAP (F7–F8). |
| **Metrología y laboratorio** | Equipos e instrumentos, calibraciones, verificaciones, patrones, incertidumbre y validación de métodos, ensayos de aptitud, informes (ISO/IEC 17025), calificaciones, mantenimiento (F4). |
| **Almacén y distribución** | Áreas y sensores, temperatura y humedad, excursiones, recepción, despacho y transporte, devoluciones, retiros y simulacros (F5). |
| **Auditorías** | Plan anual, autoinspecciones, auditorías a proveedores, inspecciones de la autoridad (F6). |
| **Ambiente y SST** | Aspectos ambientales, matriz legal, residuos, emergencias, IPERC, incidentes, EPP, consulta y participación (F9). |
| **Sistema integrado** | Contexto, partes interesadas, alcance, política, riesgos, indicadores, revisión por la dirección comunes a todas las normas (F7). |
| **Más áreas** | Capacitación, proveedores y clientes, productos y registros sanitarios (F6–F8). |
| **Administración** *(ADMIN_EMPRESA)* | Usuarios, solicitudes de clave (con contador), registro de auditoría, datos de la empresa (F1). |

- Derecha de la barra: buscador (F2+), notificaciones, idioma, usuario (perfil, cambiar clave, cerrar sesión).
- Filtro "Vista por norma": *SGI integrado · BPM · BPADT · ISO 9001 · ISO/IEC 17025 · ISO 14001 · ISO 45001*
  (filtra las herramientas del menú; desde F2 filtrará también los registros).
- En F1 las herramientas de fases posteriores muestran una página "Próximamente" con su descripción.
- Móvil: la barra se convierte en un menú desplegable de pantalla completa.

---

## 9. APIs

Mutaciones con **Server Actions** validadas con **Zod**; Route Handlers solo cuando hace falta una URL.

| Tipo | Ruta / acción | Rol | Descripción |
|---|---|---|---|
| Route | `/api/auth/[...nextauth]` | público | Auth.js. |
| Route | `GET /api/health` | público | Estado de la app y la BD. |
| Action | `requestPasswordReset` | público | Solicitud de clave (§3.5). |
| Action | `changeOwnPassword` | autenticado | Cambio de clave con política. |
| Action | `listUsers / createUser / updateUser / setUserStatus` | ADMIN_EMPRESA | Usuarios de su empresa. |
| Action | `listResetRequests / approveResetRequest / rejectResetRequest` | ADMIN_EMPRESA | Solicitudes. |
| Action | `listAuditLogs` | ADMIN_EMPRESA | Registro de auditoría con filtros. |
| Route (F2+) | `GET /api/files/[id]` | autenticado | Descarga de adjuntos verificando empresa. |
| Route (F5) | `POST /api/v1/readings` | token de dispositivo | Ingreso de lecturas de dataloggers de temperatura/humedad. |

Respuesta de las acciones: `{ ok: true, data } | { ok: false, error: { code, message } }`.

---

## 10. Requisitos no funcionales

| Área | Requisito |
|---|---|
| Seguridad | OWASP ASVS nivel 2; CSP, HSTS, X-Frame-Options; sin secretos en el cliente. |
| Integridad de datos | §5 (ALCOA+). |
| Rendimiento | LCP < 2,5 s en login; acciones < 300 ms p95. |
| Disponibilidad | Objetivo 99,5 %. |
| Respaldo | Backup diario cifrado, PITR 7 días, prueba de restauración trimestral; retención de registros GMP según la normativa aplicable (mínimo 1 año tras el vencimiento del lote o 5 años, lo que sea mayor; a confirmar con QA). |
| Privacidad | Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP, 2021). |
| Accesibilidad | WCAG 2.1 AA. |
| Navegadores | Últimas 2 versiones de Chrome, Edge, Firefox y Safari; Android 10+, iOS 16+. |

## 11. Despliegue

- Desarrollo: SQLite (`file:./dev.db`) o PostgreSQL con `docker compose up -d db`.
- Producción: servidor Node + PostgreSQL gestionado; migraciones con `prisma migrate deploy` en CI;
  entornos separados de pruebas y producción (necesario para validar el sistema).

## 12. Criterios de aceptación F1

1. Tras `npm run db:setup`, el administrador entra con ID corporativo `PROPHAR`, usuario `admin` y la clave del seed.
2. Login y panel cambian entre ES/EN/PT.
3. La PWA se instala en Chrome de escritorio y Android; en iOS se muestran instrucciones.
4. Una solicitud de clave aparece en el panel del admin; al aprobarla, el usuario entra con la clave temporal y debe cambiarla.
5. Prueba automatizada: un usuario de otra empresa no puede leer ni modificar datos de PROPHAR.
6. Login correcto/fallido, bloqueo, solicitudes y su resolución, y altas/cambios de usuarios quedan en el registro de auditoría con valor anterior y nuevo.
7. La sesión se cierra tras el tiempo de inactividad configurado.

## 13. Fase 2 — Control documental GMP (implementada)

### Flujo de una versión

| Estado | Quién actúa | Firma | Siguiente estado |
|---|---|---|---|
| Borrador | Autor: sube el archivo, elige revisor, aprobador, lectores y fecha de vigencia | **Elaboró** | En revisión |
| En revisión | Revisor asignado | **Revisó** o **Rechazó** (con comentario) | Pendiente de aprobación / Borrador |
| Pendiente de aprobación | Aprobador asignado (permiso `DOC_APPROVE`) | **Aprobó** o **Rechazó** | Aprobado / Borrador |
| Aprobado | Automático en la fecha de vigencia | — | Vigente (la anterior pasa a Sustituida) |
| Vigente | Lectores asignados (plazo 15 días) | **Leído y comprendido** | — |
| Obsoleto | Aprobador, con motivo | **Declaró obsoleto** | — |

Un borrador que no sigue adelante se **anula** con motivo; nunca se borra.

### Reglas GMP

- **Segregación de funciones:** autor, revisor y aprobador son tres personas distintas.
- **Firma electrónica:** se pide la contraseña en cada firma. Se registran nombre, cargo, significado, fecha y hora del servidor, comentario y la huella SHA-256 del archivo. La firma completa se sella con su propio SHA-256, y la ficha del documento comprueba que no se ha alterado. Las firmas son de solo inserción (extensión de Prisma + trigger en PostgreSQL), y una contraseña incorrecta queda registrada en la auditoría.
- **Integridad del archivo:** se valida el tipo real del archivo (PDF, DOCX, XLSX, DOC, XLS; máx. 20 MB). Cada descarga recalcula el SHA-256, la bloquea si no coincide y queda auditada.
- **Inmutabilidad:** una vez enviada a revisión, el archivo de la versión no cambia. Cualquier cambio exige una nueva versión con descripción del cambio, y solo puede haber una versión abierta por documento.
- **Acceso:** la versión vigente es visible para toda la empresa. Borradores y versiones anteriores solo para sus participantes y el control documental (`DOC_MANAGE`).
- **Revisión periódica:** la próxima revisión es la fecha de vigencia más el periodo del documento (24 meses por defecto). Aparece en la bandeja del responsable 30 días antes y el listado maestro marca las vencidas.
- **Permisos GMP** (Administración → Usuarios): `DOC_MANAGE` permite crear documentos y versiones; `DOC_APPROVE` permite aprobar y declarar obsoleto. Ningún rol los incluye por defecto: se asignan persona a persona y el cambio queda auditado.

### Pendiente para fases posteriores

- Copias controladas impresas con marca de agua y numeración.
- Edición de los metadatos del documento (título, proceso, responsable) con motivo.
- Administración del mapa de procesos desde la aplicación (hoy viene del seed).
- Almacenamiento de archivos en un servicio de objetos (S3/Azure) para varias instancias.

## 14. Fase 3 — Calidad GMP (implementada)

Permiso nuevo: `QA_APPROVE` (Garantía de Calidad). Numeración correlativa por empresa y año:
`DEV-2026-0001`, `CAPA-2026-0001`, `CC-2026-0001`.

### Desviaciones (5 pasos)

| Paso | Quién | Qué | Firma |
|---|---|---|---|
| 1. Detección | Cualquier usuario | Descripción, categoría, proceso, lotes afectados, **acción inmediata (contención)**. La fecha no puede ser futura. | — |
| 2. Clasificación | QA | Menor / mayor / crítica, investigador y plazo (15 días si es crítica, 30 si no). Indica si exige CAPA; una crítica siempre la exige. Un reporte que no es desviación se anula con motivo. | — |
| 3. Investigación | Investigador | Método (5 porqués, Ishikawa, árbol de fallas), causa raíz, impacto en el producto, disposición y conclusión. Puede crear CAPA vinculadas. | **Elaboró** |
| 4. Revisión QA | QA (no el investigador) | Aprueba el cierre o devuelve la investigación con comentario. | **Aprobó / Rechazó** |
| 5. Cierre | — | Cerrada, con sus CAPA vinculadas. | — |

### CAPA

Origen: desviación, auditoría, queja, control de cambios, revisión por la dirección, riesgos, OOS o
inspección. La crea QA, o el investigador si nace de su desviación.

1. **Plan:** se definen acciones con responsable y plazo.
2. **Aprobación:** QA firma el plan **Aprobó**, o lo devuelve. Quien aprueba no puede ser el responsable de la CAPA.
3. **Ejecución:** cada responsable registra la ejecución con su evidencia. QA puede anular acciones con motivo.
4. **Eficacia:** con todas las acciones cerradas, el responsable solicita la verificación. QA (no el responsable)
   firma **Verificó** y la CAPA se cierra. Si no fue eficaz, vuelve a ejecución con nuevas acciones.

### Control de cambios

1. **Propuesta:** cualquier usuario la registra (tipo, proceso, descripción, justificación, elementos afectados,
   fecha prevista) y la firma **Elaboró**.
2. **Evaluación:** QA (no el solicitante) registra clasificación, nivel de riesgo, **si requiere notificación a
   ARCSA**, e impacto en calidad, validación, documentos y capacitación. Define también las acciones de implementación.
3. **Decisión:** QA aprueba (**Aprobó**), devuelve al solicitante o rechaza definitivamente, con motivo.
4. **Implementación:** se ejecutan las acciones con evidencia y el solicitante declara el cambio implementado.
5. **Cierre:** QA verifica la implementación y su eficacia (**Verificó**).

### Común

- Bandeja **"Mis pendientes de calidad"** en el área Calidad GMP y contador en Inicio.
- Todo cambio de estado queda en el registro de auditoría con valor anterior, valor nuevo y motivo.
  Los registros no se borran: se anulan con motivo.

### Pendiente para fases posteriores

- Adjuntar archivos de evidencia (hoy la evidencia es texto).
- Avisos por correo de plazos vencidos.
- Vincular un control de cambios con los documentos que actualiza (fase 2) y generar la CAPA desde auditorías y
  quejas cuando existan esos módulos (fase 6).

## 15. Fase 4 — Metrología y laboratorio (implementada)

Permisos nuevos: `METROLOGY_MANAGE` (registrar equipos, calibraciones, verificaciones, mantenimientos y ensayos)
y `METROLOGY_APPROVE` (aprobar calibraciones, poner en servicio y dar de baja). Las calificaciones las aprueba
Garantía de Calidad (`QA_APPROVE`). Códigos: `CAL-2026-0001`, `QUAL-2026-0001`, `EA-2026-0001`.

### Equipos
- **Ficha del equipo:**
  - identificación, proceso, responsable, criticidad y si es patrón de referencia;
  - rango, resolución, unidad y **error máximo permitido (EMP)**;
  - intervalos de calibración, verificación y mantenimiento.
- **Vencimientos:** las fechas se recalculan automáticamente al aprobar o registrar.
  - Panel del área: vencidas, próximas a 30 días, fuera de servicio, verificaciones vencidas y registros por aprobar.
  - Contador de calibraciones vencidas en Inicio.
- **Estados:**
  - en servicio;
  - fuera de servicio, con motivo;
  - **puesta en servicio firmada**, bloqueada si la calibración está vencida;
  - baja definitiva firmada, que conserva el historial.

### Calibraciones
- **Externa:** proveedor, acreditación, n.º de certificado y **archivo del certificado** (tipo real validado, SHA-256).
- **Interna:** patrones utilizados. Cada patrón debe tener **calibración vigente en la fecha** (trazabilidad); si no, el
  registro se rechaza.
- **Puntos medidos:** nominal, lectura e incertidumbre expandida U (k=2). El error y la conformidad se calculan
  en vivo con la **regla de decisión documentada: conforme si |error| + U ≤ EMP** (ILAC-G8, banda de guarda = U).
  - Sin EMP, la persona declara el resultado.
  - "Conforme tras ajuste" solo es posible si el cálculo es conforme.
- **No conforme:**
  - exige la evaluación del impacto sobre las mediciones anteriores;
  - el equipo queda **fuera de servicio de inmediato**;
  - con un clic se abre una **desviación** (categoría Equipo) vinculada.
- **Aprobación** firmada por alguien con `METROLOGY_APPROVE` distinto de quien registró.
  - Al aprobar, se actualizan la última calibración y el próximo vencimiento, solo si es la más reciente.
  - Si es conforme, el equipo vuelve a servicio.

### Otros registros
- **Verificación intermedia:** firmada por quien la realiza. Si no es conforme, el equipo queda fuera de servicio.
- **Mantenimiento** preventivo o correctivo. Si afecta a la medición, el equipo queda fuera de servicio y la
  calibración vence en ese momento.
- **Calificación DQ/IQ/OQ/PQ:** protocolo, resultado, resumen e informe adjunto, con aprobación firmada de QA. Si
  falla, el equipo queda fuera de servicio.
- **Ensayos de aptitud:**
  - z = (x − X)/σ, o el z del informe del proveedor;
  - clasificación según ISO 13528: satisfactorio, cuestionable o insatisfactorio;
  - si es insatisfactorio, QA crea la CAPA desde el propio ensayo (origen "Ensayo de aptitud").

### Pendiente (fase 10)
- Estimación de incertidumbre (presupuestos GUM) y validación de métodos.
- Emisión de informes de ensayo y certificados de calibración.
- Etiquetas con código QR de estado de calibración.

## 16. Preguntas abiertas

- Orden de las fases F2–F8; propuesta: F2 Documentos → F3 Calidad GMP → F4 Metrología → F5 BPADT.
- Formato de los dataloggers de temperatura (exportan CSV, API, ninguno).
- Periodos de retención de registros que fija QA.
