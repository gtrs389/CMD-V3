import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O painel roda numa moldura do PROPRIO site (endereco limpo, ver
  // `src/lib/domain/endereco-limpo.ts`). Nenhum outro site pode emoldura-lo.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
