/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // better-sqlite3 is a native binding; let Next leave it alone in the server bundle.
  serverExternalPackages: ["better-sqlite3", "@wopr-network/better-prompts"],
};

export default config;
