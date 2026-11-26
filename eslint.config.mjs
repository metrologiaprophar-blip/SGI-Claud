import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "prisma/generated/**", "coverage/**", "next-env.d.ts", "test-results/**", "playwright-report/**", "public/sw.js"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Aislamiento por empresa: el cliente Prisma sin filtro solo se usa en la capa de servidor.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db/client",
              message: "Usa getTenantDb() de @/server/db/tenant (aislamiento por empresa).",
            },
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Usa getTenantDb() de @/server/db/tenant.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
