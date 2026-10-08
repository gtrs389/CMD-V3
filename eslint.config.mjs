import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // O icone de estrelinhas ("sparkles", a estrela de quatro pontas) nunca
  // entra no sistema: pedido expresso de quem e dono do produto. A regra
  // barra o icone e todos os nomes e variacoes dele no lucide-react.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              importNames: ["BroomSparkles", "BroomSparklesIcon", "LucideBroomSparkles", "LucideMopSparkles", "LucidePencilSparkles", "LucideSparkle", "LucideSparkles", "LucideStars", "LucideToothbrushSparkles", "LucideWandSparkles", "MopSparkles", "MopSparklesIcon", "PencilSparkles", "PencilSparklesIcon", "Sparkle", "SparkleIcon", "Sparkles", "SparklesIcon", "Stars", "StarsIcon", "ToothbrushSparkles", "ToothbrushSparklesIcon", "Wand2", "Wand2Icon", "WandSparkles", "WandSparklesIcon"],
              message: "O ícone de estrelinhas (sparkles) não é usado neste sistema. Escolha outro ícone.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
