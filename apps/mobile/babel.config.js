const path = require('path')

module.exports = function (api) {
  api.cache(true)
  return {
    // require.resolve() gives Metro an absolute path — needed because bun
    // hoists packages into .bun cache and Metro's transform worker can't
    // resolve bare strings from its own location.
    presets: [require.resolve('babel-preset-expo')],
    plugins: [
      [
        require.resolve('@tamagui/babel-plugin'),
        {
          // Absolute path so Metro finds the config regardless of working dir
          config: path.resolve(__dirname, '../../packages/ui/tamagui.config.ts'),
          components: ['@tamagui/core'],
          logTimings: true,
        },
      ],
    ],
  }
}
