import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Các trang cũ đã gộp vào Tổng quan / Meta / Google — giữ link cũ (bookmark) không bị 404
  async redirects() {
    return ["/awareness", "/traffic", "/lead", "/campaigns"].map((source) => ({
      source,
      destination: "/",
      permanent: false,
    }));
  },
};

export default nextConfig;
