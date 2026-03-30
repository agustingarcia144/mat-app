module.exports = {
  reactStrictMode: true,
  images: {
    deviceSizes: [640, 768, 1024, 1280],
    imageSizes: [32, 40, 64, 96, 128, 192, 256, 384, 512],
    qualities: [60, 75],
    minimumCacheTTL: 2678400,
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
    ],
  },
}
