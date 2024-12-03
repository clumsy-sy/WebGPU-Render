import typescript from '@rollup/plugin-typescript';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

function wgsl2String() {
  return {
    name: 'wgsl-plugin',
    transform(code, id) {
      if (id.endsWith('.wgsl')) {
        return {
          code: `export default \`${code}\`;`,
          map: { mappings: '' },
        };
      }
    },
  };
}

export default {
  input: 'src/main.ts', // 项目入口文件
  output: {
    file: 'dist/bundle.js', // 输出文件
    format: 'iife', // 打包为立即执行函数，适合浏览器环境
    sourcemap: true, // 生成 source map
  },
  plugins: [
    wgsl2String(), // 处理 wgsl 文件
    typescript(), // TypeScript 转换插件
    serve({
      open: true, // 启动服务器时自动打开浏览器
      contentBase: '.', // 根目录
      port: 8080, // 本地服务器端口
    }),
    livereload({
      watch: 'dist', // 监听 dist 目录文件变化
    }),
  ],
};