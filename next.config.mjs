/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app doesn't use next/image, and the built-in image-optimization
  // route has a known critical AVIF RCE (GHSA-2xp9-vwfh-vxw4) not yet
  // patched in the 14.x line. Disabling it removes that code path.
  images: { unoptimized: true },
};

export default nextConfig;
