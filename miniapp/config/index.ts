import { defineConfig, type UserConfigExport } from '@tarojs/cli'

export default defineConfig(async (merge) => merge({
  projectName: 'gmzz-club-miniapp',
  date: '2026-11-16',
  designWidth: 750,
  deviceRatio: { '640': 1.17, '750': 1, '828': 1.81 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  defineConstants: {
    'process.env.TARO_APP_API_BASE': JSON.stringify(process.env.TARO_APP_API_BASE || 'http://127.0.0.1:19080'),
  },
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
  h5: {},
} as UserConfigExport))
