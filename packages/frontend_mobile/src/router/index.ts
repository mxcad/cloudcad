/**
 * 移动端路由表
 *
 * 壳模式始终启用。Shell 组件渲染顶栏 + 编辑器根 + 子页覆盖层。
 * 根路径 `/` 重定向到 `/shell`（壳根 = 编辑器 + 顶栏）。
 * 子页通过 Action Sheet 导航覆盖在编辑器上。
 */
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/shell',
  },
  {
    path: '/shell',
    name: 'Shell',
    component: () => import('../pages/shell/index.vue'),
    children: [
      {
        path: 'file',
        name: 'FileBrowser',
        component: () => import('../pages/shell/sub-pages/FileBrowserPage.vue'),
      },
      {
        path: 'file/project/:id',
        name: 'ProjectDetail',
        component: () => import('../pages/shell/sub-pages/ProjectDetailPage.vue'),
      },
      {
        path: 'share',
        name: 'ShareManage',
        component: () => import('../pages/shell/sub-pages/ShareManagePage.vue'),
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('../pages/shell/sub-pages/ProfilePage.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
