import Home from "./pages/home/index.vue"

interface RouteRecordRaw {
  path: string;
  name?: string;
  component: any;
  meta?: Record<string, unknown>;
}

const routes: RouteRecordRaw[] = [
  {
    path: '',
    name: "default",
    component: Home,
    meta: { title: '首页', keepAlive: true }
  },
  {
    path: '/editor',
    name: "editor",
    component: () => import('./pages/editor/index.vue'),
    meta: { title: 'CAD Editor', keepAlive: true }
  },
]

export default routes
