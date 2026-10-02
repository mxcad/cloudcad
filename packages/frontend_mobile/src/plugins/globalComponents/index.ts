import { App, type Component } from 'vue';
// ‍  自动导入 components 目录下的所有 .vue 文件
// ‍ Automatically import all. vue files from the components directory

const modules = import.meta.globEager<{ default: Component }>(
  '../../components/**/*.vue'
);

export default {
  install: (app: App) => {
    for (const path in modules) {
      const name = path.match(/\.\/(\S*)\.vue/)![1];
      const component = modules[path].default;
      // ‍  自动注册全局组件
// ‍ Automatically register global components

      app.component(name, component);
    }
  },
};