module.exports = {
  packagerConfig: {
    asar: true,
    name: "News Agg",
    executableName: "news-agg",
    ignore: [
      /^\/\.next/,
      /^\/certificates/,
      /^\/out/,
      /^\/\.env/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {},
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {},
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
};
