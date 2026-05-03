import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import '@mdi/font/css/materialdesignicons.css';

/**
 * Vuetify 主题配置接口
 * 对应 public/ini/myVuetifyThemeConfig.json 的结构
 */
interface VuetifyThemeConfig {
  defaultTheme: string;
  themes: {
    light: {
      colors: Record<string, string>;
      variables: Record<string, unknown>;
    };
    dark: {
      colors: Record<string, string>;
      variables: Record<string, unknown>;
    };
  };
}

/**
 * 从 public/ini/myVuetifyThemeConfig.json 加载主题配置
 * 该文件由 mxcad-app 和平台共享
 */
export async function loadThemeConfig(): Promise<VuetifyThemeConfig | null> {
  try {
    const response = await fetch('/ini/myVuetifyThemeConfig.json');
    if (!response.ok) {
      console.warn('[Vuetify] 主题配置加载失败:', response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('[Vuetify] 主题配置加载异常:', error);
    return null;
  }
}

// 同步创建默认实例（用于 app.use() 注册）
// 主题配置加载后在 useTheme composable 中动态更新
const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
  },
});

export default vuetify;
