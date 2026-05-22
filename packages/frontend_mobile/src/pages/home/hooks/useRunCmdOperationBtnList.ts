import { closeToast, showToast } from "vant"
import { ref } from "vue"
import { MxFun } from "mxdraw"
import { t } from "@/languages"
export interface CmdTipObj {
    msg: string,
    keys?: { label: string, key: string }[],
    endMsg?: string
  }
export const useRunCmdOperationBtnList = ()=> {
    const isRunCmd = ref(false)
    
    const cmdTipObj = ref<CmdTipObj>()
    function parseCmdTip(str: string): CmdTipObj {
        const regex = /(.+)\[(.+)\]/;
        const matches = str.match(regex);
        if (matches) {
            const msg = matches[1].trim();
            const keysStr = matches[2];
            const keysArr = keysStr.split('/').map(key => key.trim());
            const result = {
            msg: msg,
            keys: keysArr.map(key => ({
                label: key.substring(0, key.indexOf('(')),
                key: key.substring(key.indexOf('(') + 1, key.indexOf(')'))
            })),
            endMsg: ':'
            };
            return result;
        }
        return {
            msg: str
        };
    }
    const sendInputCmd = (cmdStr: string) => {
        MxFun.setCommandLineInputData(cmdStr, 13)
    }
    MxFun.listenForCommandLineInput(({
        msCmdTip
    }) => {
        closeToast()
        isRunCmd.value = MxFun.isRunningCommand()
        cmdTipObj.value = parseCmdTip(msCmdTip)
        if (cmdTipObj.value.endMsg === "命令" + ": ") return
        const regex = new RegExp(`[${t("命令")}:| ]`, 'g');
        const message = t(cmdTipObj.value.msg.replace(regex, ''))
        if(message === t("命令") || !message) return closeToast()
        showToast({
            message,
            duration: 0,
        })
    })
    
    
    const stopRunCmd = () => {
        closeToast()
        MxFun.stopRunCommand()
        isRunCmd.value = false
    }
    const determine = () => {
        closeToast()
        // ‍  回车键的 keyCode 13
// ‍ KeyCode 13 for Enter key

        MxFun.setCommandLineInputData("", 13)
    }
    return {
        isRunCmd,
        stopRunCmd,
        determine,
        cmdTipObj,
        sendInputCmd
    }
}