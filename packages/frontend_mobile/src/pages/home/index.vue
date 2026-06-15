    <script setup lang="ts">

    import { onMounted, onBeforeUnmount, ref, unref, computed } from 'vue';
    import { t } from '@/languages';
    import { createMxCAD } from '../../plugins/mxcad';
    import { callCommand } from '@/plugins/mxcad/command';
    import { uiConfig } from '@/config/uiConfig';
    import BScroll from '@better-scroll/core';
    import ObserveDOM from '@better-scroll/observe-dom'
    import ObserveImage from '@better-scroll/observe-image';
    import { McCmColor, MxCpp } from 'mxcad';
    import { useColorPicker } from './useColorPicker';
    import iro from '@jaames/iro';
    import { drawArc } from "mxcad"
    import { useMenu } from "./hooks/useMenu"
    import { useEditObjectToolbar } from "./hooks/useEditObjectToolbar"
    import { useSimulatedMouse } from './hooks/useSimulatedMouse';
    import { useRunCmdOperationBtnList } from './hooks/useRunCmdOperationBtnList';
    import { useFooterToolbar } from './hooks/useFooterToolbar';
    import { useFloatingRightBtnList } from './hooks/useFloatingRightBtnList';
    import { useFileLoader, checkFileExternalRefs, checkPublicFileExternalRefs } from '../../composables/useFileLoader';
    import { isHashLike, resolvePublicExtRefUrl } from '../../services/publicFileService';
    import { checkLibraryPermissions } from '../../services/permissionService';
    import { useEditorState } from '../../composables/useEditorState';
    import { useSave } from '../../composables/useSave';
    import { useUser } from '../../composables/useUser';

    import { showToast, showConfirmDialog } from 'vant';
import { showToastOnce } from '@/utils/toast';
import { exitCollaborationIfNeeded } from '../../composables/useCooperate';
import CommitMessageDialog from './components/CommitMessageDialog.vue';
    import SaveAsSheet from './components/SaveAsSheet.vue';
    import VersionHistoryPopup from './components/VersionHistoryPopup.vue';
    import LoginPromptPopup from './components/LoginPromptPopup.vue';
import CooperatePopup from './components/CooperatePopup.vue';
import SharePopup from '@/components/SharePopup.vue';
import MxToolbar from '@/components/MxToolbar.vue';

    BScroll.use(ObserveDOM)
    BScroll.use(ObserveImage)
    // ‍  气泡菜单
    // ‍ Bubble menu

    const {
        isShowMenu,
        actions,
        onSelectMenu,
        onCloseMenu
    } = useMenu()

    // ‍  图元编辑工具栏
    // ‍ Element Editing Toolbar

    const {
        isShowObjectEditingToolbar,
        objectEditingToolbarItems,
        onObjectEditingBtnTap,
        initEditObjectToolbar
    } = useEditObjectToolbar()

    const {
        needle,
        handle,
        arrowTip,
        onTouchstart
    } = useSimulatedMouse()
    const {
        isRunCmd,
        stopRunCmd,
        determine,
        cmdTipObj,
        sendInputCmd
    } = useRunCmdOperationBtnList()
    // ‍  颜色选择器
    // ‍ Color picker

    const { isShowColorPicker, openColorPicker } = useColorPicker('.colorPicker')
    const color = ref("#fff")

    function doGoBack() {
        if (window.history.length > 1) {
            window.history.back()
        } else {
            const backUrl = new URLSearchParams(window.location.search).get('back')
            if (backUrl) {
                window.location.href = backUrl
            }
        }
    }

    function goBack() {
        if (editorState.state.isModified) {
            showConfirmDialog({
                title: '未保存的更改',
                message: '当前图纸有未保存的更改，确定要返回吗？',
                confirmButtonText: '确定返回',
                cancelButtonText: '取消',
            }).then(() => {
                doGoBack()
            }).catch(() => { })
        } else {
            doGoBack()
        }
    }
    const selectColor = () => {
        let _color = MxCpp.getCurrentMxCAD().getDatabase().getCurrentlyTrueColor()
        if (_color.getColorValue() === "0xFFFFFF") {
            _color.setRGB(255, 255, 255)
        }
        openColorPicker((c) => {
            color.value = c.hexString
            const mcColor = new McCmColor()
            mcColor.setRGB(c.red, c.green, c.blue)
            MxCpp.getCurrentMxCAD().getDatabase().setCurrentlyTrueColor(mcColor)
            MxCpp.getCurrentMxCAD().drawColor = mcColor
        }, new iro.Color({
            r: _color.red,
            g: _color.green,
            b: _color.blue
        }))
    }

    const {
        left,
        currentItem,
        onTap,
        onClick,
        // ‍  历史点击
        // ‍ Historical clicks

        state,
        historyBtnList,
        toggle,
        onHistoryBtnClick
    } = useFooterToolbar()




    const {
        floatingRightBtnArr,
        actionBtn,
        onClickBtn
    } = useFloatingRightBtnList()


    const {
        loading: fileLoading,
        error: fileError,
        progress: fileProgress,
        loadByNodeId,
        loadByHash,
        getFileIdFromUrl,
        getHashFromUrl,
        getVersionFromUrl,
    } = useFileLoader()
    const editorState = useEditorState()
    const drawName = computed(() => {
      return editorState.state.fileName
    })
    const currentVersion = computed(() => editorState.state.currentVersion)
    const isPublicFile = computed(() => editorState.state.isPublicFile)

    const { saving, save: saveAction } = useSave()
    const { isAuthenticated } = useUser()
    const showCommitDialog = ref(false)
    const showSaveAsSheet = ref(false)
    const pendingCommitMessage = ref('')
    const canManageLibrary = ref(false)
    const showVersionHistory = ref(false)
    const showLoginPrompt = ref(false)
    const pendingActionAfterLogin = ref<'save' | 'version-history' | null>(null)
    const showCooperate = ref(false)
    const showShare = ref(false)

    checkLibraryPermissions().then(result => {
        canManageLibrary.value = result.canManageDrawing || result.canManageBlock
    })

    async function onSaveClick() {
        if (isPublicFile.value) {
            showToast('公开文件不支持保存')
            return
        }
        if (!editorState.state.permissions.canSave) {
            showToast('没有保存权限')
            return
        }
        if (!isAuthenticated.value) {
            pendingActionAfterLogin.value = 'save'
            showLoginPrompt.value = true
            return
        }
        showCommitDialog.value = true
    }

    function onCommitConfirm(message: string) {
        pendingCommitMessage.value = message
        showCommitDialog.value = false
        executeSave()
    }

    async function executeSave() {
        const success = await saveAction(pendingCommitMessage.value)
        if (!success) {
            if (!isAuthenticated.value) {
                showLoginPrompt.value = true
                return
            }
            showSaveAsSheet.value = true
        }
    }

    function onSaveAsClose() {
        showSaveAsSheet.value = false
    }

    function onSaveAsSuccess() {
        showSaveAsSheet.value = false
    }

    function onShowVersionHistory() {
        if (isPublicFile.value) {
            showToast('公开文件不支持版本历史')
            return
        }
        if (!editorState.state.fileId) {
            showToast('本地图纸无版本历史')
            return
        }
        if (!editorState.state.permissions.canSave) {
            showToast('没有查看版本历史的权限')
            return
        }
        if (!isAuthenticated.value) {
            pendingActionAfterLogin.value = 'version-history'
            showLoginPrompt.value = true
            return
        }
        showVersionHistory.value = true
    }

    function onLoginPromptLogin() {
        showLoginPrompt.value = false
        if (pendingActionAfterLogin.value) {
            sessionStorage.setItem('pendingAction', pendingActionAfterLogin.value)
            pendingActionAfterLogin.value = null
        }
        const currentUrl = encodeURIComponent(window.location.href)
        window.location.href = `/login?redirect=${currentUrl}`
    }

    function onLoginPromptClose() {
        showLoginPrompt.value = false
    }

    async function handleNewFile() {
        exitCollaborationIfNeeded()

        if (editorState.state.isModified) {
            try {
                await showConfirmDialog({
                    title: '未保存的更改',
                    message: '当前图纸有未保存的更改，是否保存？',
                    confirmButtonText: '保存',
                    cancelButtonText: '不保存',
                })
                try {
                    const success = await saveAction()
                    if (!success) return
                } catch {
                    return
                }
            } catch {
                editorState.setIsModified(false)
            }
        }

        editorState.resetNewFile()

        editorState.setNewFileInfo()

        const mxcad = MxCpp.App.getCurrentMxCAD()
        mxcad.newFile()

        showToastOnce('已新建空白图纸')
    }

    const handleShowCollaborate = () => { showCooperate.value = true }
    const handleShowShare = () => { showShare.value = true }

    onMounted(async () => {
        window.addEventListener('open-version-history', onShowVersionHistory)
        window.addEventListener('mxcad-new-file', handleNewFile)
        window.addEventListener('mxcad-show-collaborate', handleShowCollaborate)
        window.addEventListener('mxcad-show-share', handleShowShare)

        onBeforeUnmount(() => {
            window.removeEventListener('open-version-history', onShowVersionHistory)
            window.removeEventListener('mxcad-new-file', handleNewFile)
            window.removeEventListener('mxcad-show-collaborate', handleShowCollaborate)
            window.removeEventListener('mxcad-show-share', handleShowShare)
        })

        const mxcad = await createMxCAD()
        mxcad.on('databaseModify', () => {
            editorState.setIsModified(true)
        })

        mxcad.on('openFileComplete', () => {
            editorState.setIsModified(false)
        })

        initEditObjectToolbar(mxcad)

        const fileId = getFileIdFromUrl()
        const fileHash = getHashFromUrl()

        if (fileId) {
            const ok = await loadByNodeId(fileId)
            if (ok) {
                editorState.setCurrentVersion(getVersionFromUrl())
                checkFileExternalRefs(fileId)
            }
        } else if (fileHash && isHashLike(fileHash)) {
            editorState.setIsPublicFile(true)
            const ok = await loadByHash(fileHash)
            if (ok) {
                editorState.setCurrentVersion(getVersionFromUrl())
                checkPublicFileExternalRefs(fileHash)
            } else {
                editorState.setFileName(mxcad.getCurrentFileName())
            }
        } else {
            editorState.setFileName('new.dwg')
        }

        const pendingAction = sessionStorage.getItem('pendingAction')
        if (pendingAction && isAuthenticated.value) {
            sessionStorage.removeItem('pendingAction')
            await new Promise(resolve => setTimeout(resolve, 500))
            if (pendingAction === 'save') {
                showCommitDialog.value = true
            } else if (pendingAction === 'version-history') {
                showVersionHistory.value = true
            }
        }
    })
    // ‍  适配内容高度
    // ‍ Adaptation content height

    function setViewportHeight() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
    setViewportHeight();

</script>

<template>

    <div class="mxCanvasBox">
        <div class="header">
            <button class="header_huitui zoomed" @click="goBack">
                <MxIcon icon="huitui1" isDefault></MxIcon>
            </button>
            <span class="draw_name">{{ drawName }}</span>
            <span v-if="currentVersion" class="version-badge">r{{ currentVersion }}</span>
            <div class="top_toolbar">
                <button class="item" :disabled="saving || isPublicFile || !editorState.state.permissions.canSave"
                    @click="onSaveClick">
                    <MxIcon icon="baocun" isDefault class="zoomed"></MxIcon>
                </button>
                <button class="item" @click="callCommand('Mx_ZoomE')">
                    <MxIcon icon="quanping" isDefault class="zoomed"></MxIcon>
                </button>
                <button class="item" @click="callCommand('Mx_Undo')">
                    <MxIcon icon="huitui" isDefault class="zoomed"></MxIcon>
                </button>
                <button class="item" @click="selectColor">
                    <div class="color_box zoomed" :style="{ backgroundColor: color }"></div>
                </button>
                <van-popover v-model:show="isShowMenu" icon-prefix="mxicon" theme="dark" placement="bottom-end"
                    :actions="actions.map((item) => { item.text = t(item.text); return item })" @select="onSelectMenu"
                    @closed="onCloseMenu">
                    <template #reference>
                        <button class="item">
                            <MxIcon icon="caidan" isDefault class="zoomed"></MxIcon>
                        </button>
                    </template>
                </van-popover>
            </div>

        </div>
        <div class="cmd_operation_btn_list" v-if="isRunCmd">
            cmdTipObj
            <template v-if="cmdTipObj?.keys">
                <van-button color="#363636c4" size="small" style="margin-right: 5px; margin-bottom: 5px;"
                    v-for="item in cmdTipObj.keys" @click.stop="item?.key && sendInputCmd(item.key)">{{ item.label
                    }}</van-button>
            </template>

            <button class="item zoomed" @click.stop="stopRunCmd">
                <van-icon name="./mxcustomui/draw/cuo.png"></van-icon>
            </button>
            <button class="item zoomed" @click.stop="determine">
                <van-icon name="./mxcustomui/draw/dui.png"></van-icon>
            </button>
        </div>
        <div class="colorPicker" v-show="isShowColorPicker"></div>
        <div class="floating_right_box_list" v-show="actionBtn">
            <div class="floating_right_box_list_scroll">
                <button v-for="({ icon, actionIcon }, index) in actionBtn?.icons" class="floating_right_box_list_item"
                    @click.stop="actionBtn && (actionBtn.index = index, actionBtn = null)">
                    <van-icon class="img zoomed" :name="actionBtn?.index === index ? actionIcon : icon" />
                </button>
            </div>
        </div>
        <div class="floating_right_box_btns">
            <button class="floating_right_box_btn" v-for="btn in floatingRightBtnArr" @click.stop="onClickBtn(btn)">
                <van-icon class="img zoomed" :name="unref(btn.icon)" />
            </button>
        </div>

        <!-- 模拟鼠标指针 -->
        <!-- 针头 -->
        <div class="singleArrow" ref="needle">
            <div class="singleArrow_tip" ref="arrowTip"></div>
        </div>
        <!-- 针柄 -->
        <button class="needle-handle ring" ref="handle" @touchstart="onTouchstart"></button>

        <!-- Loading overlay -->
        <div class="loading-overlay" v-if="fileLoading">
            <div class="loading-content">
                <van-loading color="#fff" type="spinner" />
                <p class="loading-text">{{ fileProgress }}</p>
            </div>
        </div>
        <!-- Error overlay -->
        <div class="loading-overlay" v-if="fileError && !fileLoading">
            <div class="loading-content">
                <van-icon name="warning-o" color="#ff4444" size="48" />
                <p class="loading-text">{{ fileError }}</p>
            </div>
        </div>
        <CommitMessageDialog v-if="showCommitDialog" @confirm="onCommitConfirm" @cancel="showCommitDialog = false" />
        <SaveAsSheet :show="showSaveAsSheet" :current-file-name="editorState.state.fileName"
            :can-manage-library="canManageLibrary" @close="onSaveAsClose" @success="onSaveAsSuccess"
            @login-required="showLoginPrompt = true" />
        <VersionHistoryPopup v-if="showVersionHistory" @close="showVersionHistory = false" />
        <LoginPromptPopup v-if="showLoginPrompt" @login="onLoginPromptLogin" @close="onLoginPromptClose" />
        <CooperatePopup v-if="showCooperate" @close="showCooperate = false" />
        <SharePopup v-if="showShare" @close="showShare = false" />
        <canvas id="mxCanvas"></canvas>
        <div class="history_box">
            <transition name="slide">
                <div class="history_btn_list" v-if="state">
                    <button v-for="item in historyBtnList" class="history_btn zoomed"
                        @click.stop="onHistoryBtnClick(item)">
                        <div class="history_btn_content">
                            <MxIcon :icon="item.icon" :isDefault="item.isIconDefault"></MxIcon>
                        </div>
                    </button>
                </div>
            </transition>
            <button class="history_btn" @click.stop="() => toggle()">
                <van-icon class="img"
                    :name="state ? './mxcustomui/history_close.png' : './mxcustomui/history_open.png'"></van-icon>
            </button>
        </div>
        <div class="footer">
            <MxToolbar class="object_editing_toolbar" :items="objectEditingToolbarItems"
                v-show="isShowObjectEditingToolbar" @tap="onObjectEditingBtnTap" />
            <transition name="fade">
                <div class="bubble_dialog" v-if="currentItem && currentItem.list">
                    <div class="bubble_dialog_box chamfer">
                        <div class="bubble_dialog_content chamfer">
                            <MxToolbar class="bubble_dialog_content_toolbar" :items="currentItem.list" @tap="onClick" />
                        </div>
                    </div>
                    <div class="arrow_box">
                        <div class="arrow" :style="{
                            left: left + 'px'
                        }"></div>
                    </div>
                </div>
            </transition>
            <MxToolbar :items="uiConfig.toolbarData || []" @tap="onTap" />
        </div>
    </div>
</template>
<style lang='scss'>
.van-popover--dark {
    .van-popover__arrow {
        color: #51B3D8
    }

    .van-popover__content {
        --van-popover-action-width: auto;
        --van-popover-radius: 0;
        border-top: 2px solid #51B3D8;
        border-radius: 0;
    }

    .van-popover__action {
        border-bottom: 4px solid #202020;

        &:active {
            background: #666666;
        }
    }
}
</style>
<style scoped lang='scss'>
.needle-handle {
    --handleSize: 70px;
    display: none;
    position: absolute;
    width: var(--handleSize);
    height: var(--handleSize);
    cursor: move;
    border-radius: 50%;
    transform: translate(calc(50vw - 35px), calc(50vh - 35px));

    &:before {
        content: "";
        position: absolute;
        top: 5px;
        /* 控制内外圆的间距，调整以改变环的宽度 */
        left: 5px;
        right: 5px;
        bottom: 5px;
        border-radius: inherit;
        background-color: #ccccccc8;
        /* 内部填充颜色 */
    }

    &:after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: inherit;
        border: 1px solid #ccccccc8;
        /* 环的边框颜色和宽度 */
        box-sizing: border-box;
    }
}

.singleArrow {
    display: none;
    width: 120px;
    height: 1px;
    position: absolute;
    background-color: #ccc;
    transform-origin: left;
    transform: translate(50vw, 50vh) rotate(-110deg);
    opacity: 0.8;
}

.singleArrow_tip {
    display: none;
    width: 10px;
    height: 10px;
    display: block;
    position: absolute;
    top: -5px;
    right: -5px;
    transform: rotate(140deg);
}

.singleArrow_tip::after {
    content: "";
    position: absolute;
    width: 1px;
    height: 30px;
    background: #ccc;
    transform: rotate(-30deg);
    transform-origin: top;
}

.singleArrow_tip::before {
    content: "";
    position: absolute;

    width: 1px;
    height: 30px;
    background: #ccc;
    transform: rotate(290deg);
    transform-origin: top;
}

.zoomed:active {
    transform: scale(1.2);
}

.colorPicker {
    position: absolute;
    top: 100px;
    left: 20%;
    z-index: 100;
}

.color_box {
    width: 34px;
    height: 34px;
}

.floating_right_box_list {
    position: absolute;
    overflow: hidden;
    top: 88px;
    right: 100px;
    width: 180px;
    max-height: 600px;
    background-color: #363636c4;
    margin-right: 20px;

    .floating_right_box_list_item {
        width: 100%;
        padding: 0;
        height: 70px;
        margin-bottom: 10px;
        overflow: hidden;
        --zoomed-scale: 1.1;
    }

}

.object_editing_toolbar {
    border-radius: 20px;
    margin-bottom: 10px;
    border: 4px solid #4B84BE;
}

.floating_right_box_btns {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 200px;
    right: 0;

    .floating_right_box_btn {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100px;
        height: 85px;
        border-radius: 20px;
        margin: 5px 0;
        overflow: hidden;

        &:active .zoomed {
            transform: scale(var(--zoomed-scale, 1.2));
        }
    }
}

.chamfer {
    background:
        linear-gradient(135deg, transparent var(--leftTopChamferDist, 3px), var(--leftTopChamferColor, #00A99E) 0) top left,
        linear-gradient(-135deg, transparent var(--rightTopChamferDist, 3px), var(--rightTopChamferColor, #00A99E) 0) top right,
        linear-gradient(-45deg, transparent var(--rightBottomChamferDist, 3px), var(--rightBottomChamferColor, #00A99E) 0) bottom right,
        linear-gradient(45deg, transparent var(--leftBottomChamferDist, 3px), var(--leftBottomChamferColor, #00A99E) 0) bottom left;
    background-size: var(--bgSize1, 50.1%) var(--bgSize2, 50.1%);
    background-repeat: no-repeat;
}

.bubble_dialog {
    &.fade-enter-active {
        transition: all 0.2s ease-in-out;
    }

    &.fade-enter-from {
        opacity: 0;
        transform: translateY(100%);
        /*  ‍ 元素初始位置向下偏移其自身高度 */
        /* ‍ The initial position of the element is offset downwards by its own height*/

    }

    &.fade-enter-to {
        opacity: 1;
        transform: translateY(0);
        /*  ‍ 元素最终位置回到正常 */
        /* ‍ The final position of the element returns to normal*/

    }

    &.fade-leave-active {
        transition: all 0.2s ease-in-out;
    }

    &.fade-leave-from {
        opacity: 1;
        transform: translateY(0);
    }

    &.fade-leave-to {
        opacity: 0;
        transform: translateY(100%);
        /*  ‍ 离开时向下偏移，可选，根据实际需求调整 */
        /* ‍ Shift downwards when leaving, optional, adjust according to actual needs*/

    }

    .bubble_dialog_box {
        height: 114px;
        padding-top: 4px;
        margin: 0 10px;
        --bgSize1: 80%;
        --leftTopChamferColor: #292929;
        --rightTopChamferColor: #292929;

    }

    .bubble_dialog_content_toolbar {
        --toolbar-name-min-width: 100px;
        --toolbar-padding: 0;
    }

    .bubble_dialog_content {
        display: flex;
        padding-left: 10px;
        padding-right: 10px;
        --leftTopChamferColor: #292929;
        --rightTopChamferColor: #292929;
        --rightBottomChamferColor: #292929;
        --leftBottomChamferColor: #292929;
        --rightBottomChamferDist: 0;
        --leftBottomChamferDist: 0;
    }

    .arrow_box {
        position: relative;
        width: 100%;
        height: 24px;
        margin-top: -1px;
    }

    .arrow {
        position: absolute;
        width: 0;
        height: 0;
        border-top: 24px solid #00A99E;
        border-right: 12px solid transparent;
        border-bottom: 0 solid transparent;
        border-left: 12px solid transparent;
    }
}

.mxCanvasBox {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: calc(var(--vh, 1vh) * 100);
    background: #000;

    .header {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 var(--van-padding-xs);
        color: var(--van-white);
        margin-top: 10px;
        height: 60px;

        .header_huitui {
            width: 200px;
            height: 100%;
            text-align: center;
        }

        .draw_name {
            text-align: center;
            height: 60px;
            line-height: 60px;
            background: #62859161;
            width: 600px;
            margin-right: 10px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .top_toolbar {
            display: flex;
            align-items: center;
            height: 100%;
            background-color: #363636c4;
            border-radius: var(--van-radius-md);
            --zoomed-scale: 1.5;
            --icon-size: 48px;

            .item {
                width: 60px;
                margin-right: 10px;
            }
        }
    }

    .footer {
        width: 100%;
        position: absolute;
        bottom: 0;
    }
}

.loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.loading-content {
    text-align: center;
}

.loading-text {
    color: #fff;
    margin-top: 16px;
    font-size: 16px;
}

.version-badge {
    position: absolute;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff6b35;
    color: #fff;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    z-index: 10;
    white-space: nowrap;
}

.cmd_operation_btn_list {
    position: absolute;
    right: 0;
    top: 80px;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;

    .item {
        width: 60px;
        height: 60px;
        margin-right: 10px;
        border-radius: 10px;
        background: #323435bb;
        display: flex;
        align-items: center;
        justify-content: center;
    }
}

.history_box {
    display: flex;
    position: absolute;
    color: #fff;
    right: 0;
    bottom: 130px;
    --icon-size: 48px;

    .history_btn_list {
        display: flex;

        &.slide-enter-active,
        &.slide-leave-active {
            transition: all 0.1s ease;
        }

        &.slide-enter-from {
            transform: translateX(100%);
        }
    }

    .history_btn {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 60px;
        height: 60px;
        border-radius: 10px;
        background-color: #232323;
        margin-right: 15px;
        padding: 0;
        --zoomed-scale: 1.4;

        .history_btn_content {
            transform: scale(1);
        }
    }

}
</style>