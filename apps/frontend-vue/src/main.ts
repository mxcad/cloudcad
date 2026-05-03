import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

// Vuetify
import vuetify from './plugins/vuetify';

// i18n
import i18n from './plugins/i18n';

// 全局样式
import './styles/transitions.css';
import './styles/app.css';

const app = createApp(App);

// 注册插件（顺序重要：Pinia 必须在 Router 之前，确保守卫可访问 Store）
const pinia = createPinia();
app.use(pinia);
app.use(vuetify);
app.use(i18n);
app.use(router);

// 全局错误处理
app.config.errorHandler = (err, _instance, info) => {
  console.error('[CloudCAD] 全局错误:', err, info);

  // 认证错误由 axios 拦截器处理，此处不再重复
  // 网络错误同理
  // 此处仅记录非预期的 UI 运行时错误
};

// 未处理的 Promise rejection
window.addEventListener('unhandledrejection', (event) => {
  // 请求取消错误不处理
  if (event.reason?.name === 'CanceledError' || event.reason?.name === 'AbortError') {
    event.preventDefault();
    return;
  }

  console.error('[CloudCAD] 未处理的 Promise rejection:', event.reason);
});

app.mount('#root');
