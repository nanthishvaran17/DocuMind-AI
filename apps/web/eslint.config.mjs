import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });
const config = [
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "**/public/**", "public/pdf.worker.min.mjs"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
export default config;
