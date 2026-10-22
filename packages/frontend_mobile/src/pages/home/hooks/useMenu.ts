import { uiConfig } from '@/config/uiConfig';
import { t } from '@/languages';
import { addCommand, callCommand } from '@/plugins/mxcad/command';
import { canExportDownloadGate } from '@/services/permissionService';
import { useVoerkaI18n } from '@voerkai18n/vue';
import { MxCpp } from 'mxcad';
import { PopoverAction, showToast } from 'vant';
import { ref, computed } from 'vue';
import { isTokenExpired, readToken } from '@/utils/authSession';
import {
  saveToCloudTrigger,
  saveAsToCloudTrigger,
  saveLoginRequiredTrigger,
} from '../../../composables/useSaveAs';
import { useUser } from '../../../composables/useUser';

/**
 * M7 编辑器菜单裁剪：壳模式下从编辑器菜单剥离的入口。
 *
 * 保留在编辑器菜单的：新建图纸 / 打开文件（OpenDwg、OpenDwg_DoNotUseCache，
 * 对齐 PC 的「打开文件 / 打开文件(不使用缓存)」）/ 导出 / 保存 / 版本历史 /
 * 布局 / 协同 / 图纸库 / 图块库。打开文件走本机文件选择器（.mxweb 就地打开、
 * .dwg/.dxf 上传后等转换），云端图纸由图纸库/图块库与壳文件浏览器打开。
 *
 * 剥离的：账号与设置类入口（语言切换 Mx_languages、退出登录）不属编辑器命令，
 * 已迁移到壳顶栏「+」菜单（shell/index.vue），此处一并过滤。
 */
const SHELL_REMOVED_CMDS = new Set(['Mx_languages']);

function isShellMenuCmd(cmd: string): boolean {
  return SHELL_REMOVED_CMDS.has(cmd);
}

// 导出下载会员门控的实现在 services/permissionService.ts（库抽屉 LibraryPanel 直接引用），
// 此处转出以兼容本文件既有的导入方。
export { canExportDownloadGate };

/**
 * 导出对话框触发器（模块级，home/index.vue 监听）：菜单「导出」打开
 * DownloadFormatPopup，而不是展开二级子菜单。
 */
export const exportDialogTrigger = ref(0);

export const useMenu = () => {
  const i18n = useVoerkaI18n();
  const isShowMenu = ref(false);

  // 菜单「导出」不展开二级子菜单，直接打开 DownloadFormatPopup——它与 PC 的
  // DownloadFormatModal 同构（MXWEB/DWG/DXF/PDF 单选 + DWG 版本 / PDF 宽高与色彩），
  // 由 home/index.vue 渲染，VIP 门控在确认时做（MXWEB 是源格式、纯前端导出、免门控）。
  const openExportDialog = () => {
    isShowMenu.value = false;
    exportDialogTrigger.value++;
  };

  const getDefaultMenuData = () => {
    let items = [
      ...(uiConfig.headerMenuData?.map((item) => {
        const copy = Object.assign({} as Record<string, unknown>, item);
        if (
          copy.cmd === 'Mx_export' ||
          copy.cmd === 'Mx_saveDwg' ||
          copy.cmd === 'Mx_exportPDF'
        ) {
          copy.call = openExportDialog;
        }
        if (copy.cmd === 'Mx_versionHistory') {
          copy.call = () => {
            window.dispatchEvent(new CustomEvent('open-version-history'));
          };
        }
        return copy;
      }) || []),
    ];

    // M7 壳模式：编辑器菜单只剥离账号设置入口（语言/退出登录），
    // 迁移到壳顶栏「+」菜单（移动端 App 恒为壳模式，过滤恒生效）
    return items.filter(
      (item) => !isShellMenuCmd((item as Record<string, unknown>).cmd as string)
    );
  };
  const actions = ref<PopoverAction[]>(getDefaultMenuData());
  addCommand('Mx_NewFile', () => {
    window.dispatchEvent(new CustomEvent('mxcad-new-file'));
  });
  addCommand('Mx_versionHistory', () => {
    window.dispatchEvent(new CustomEvent('open-version-history'));
  });
  addCommand('Mx_layouts', () => {
    setTimeout(() => {
      isShowMenu.value = true;
      const layouts = MxCpp.App.getCurrentMxCAD().getAllLayoutName();
      const _layouts: PopoverAction[] = [];
      layouts.forEach((name) => {
        const call = () => {
          isShowMenu.value = false;
          MxCpp.App.getCurrentMxCAD().setCurrentLayout(name);
        };
        if (name === 'Model') {
          _layouts.unshift({
            text: name,
            call,
          });
        } else {
          _layouts.push({
            text: name,
            call,
          });
        }
      });
      actions.value = _layouts;
    }, 200);
  });
  addCommand('Mx_ShowCollaborate', () => {
    window.dispatchEvent(new CustomEvent('mxcad-show-collaborate'));
  });
  // 移动端 App 恒为壳模式：图纸库/图块库走壳内导航（旧的 mxcad-show-library 非壳分支已删）
  addCommand('Mx_ShowDrawingLibrary', () => {
    window.dispatchEvent(
      new CustomEvent('mxcad-shell-navigate', {
        detail: '/shell/library/drawing',
      })
    );
  });
  addCommand('Mx_ShowBlockLibrary', () => {
    window.dispatchEvent(
      new CustomEvent('mxcad-shell-navigate', {
        detail: '/shell/library/block',
      })
    );
  });
  addCommand('Mx_export', openExportDialog);
  addCommand('Mx_saveDwg', openExportDialog);
  addCommand('Mx_exportPDF', openExportDialog);
  // 分享当前图纸：home/index.vue 监听 mxcad-share-current 打开分享底部弹窗
  addCommand('Mx_Share', () => {
    window.dispatchEvent(new CustomEvent('mxcad-share-current'));
  });
  addCommand('Mx_SaveToCloud', () => {
    saveToCloudTrigger.value++;
  });
  addCommand('Mx_SaveAsToCloud', () => {
    const { isAuthenticated } = useUser();
    if (!isAuthenticated.value || isTokenExpired(readToken())) {
      saveLoginRequiredTrigger.value++;
      return;
    }
    saveAsToCloudTrigger.value++;
  });
  const onSelectMenu = (action: PopoverAction) => {
    action.cmd && callCommand(action.cmd);
    action.call && action.call();
  };
  const onCloseMenu = () => {
    actions.value = getDefaultMenuData();
  };
  const translatedActions = computed(() => {
    // access activeLanguage to re-evaluate on language change
    void i18n.activeLanguage;
    return actions.value.map((item) => ({
      ...item,
      text: item.text ? t(item.text) : item.text,
    }));
  });
  return {
    isShowMenu,
    actions: translatedActions,
    onSelectMenu,
    onCloseMenu,
  };
};
