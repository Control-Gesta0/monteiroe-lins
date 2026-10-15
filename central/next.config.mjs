import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // O repositório tem outro package-lock (o do agente) na raiz: a Central é um projeto próprio
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
}
export default nextConfig
