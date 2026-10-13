/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Backend alvo (central-kairos). Em prod fica atrás do mesmo domínio via
  // rewrite do Caddy/Dokploy, mas em dev bate direto.
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://central.fbautomacao.space";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};
export default nextConfig;
