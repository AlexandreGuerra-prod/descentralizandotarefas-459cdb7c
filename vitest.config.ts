import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Teste unitario do Organizador de Tarefas.
 *
 * O reporter TAP e o que o `onp-spec audit` le para provar critérios de
 * aceite (onpspec.config.json -> reporter: "tap").
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules/**", ".spec/**"],
    // Teste pulado NAO conta como prova (onp-spec P-001). Falhar alto.
    allowOnly: false,
    passWithNoTests: false,
  },
});
