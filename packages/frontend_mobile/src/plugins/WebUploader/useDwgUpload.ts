///////////////////////////////////////////////////////////////////////////////
// ‍ 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// ‍ Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.

// ‍ 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// ‍ The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement

// ‍ 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// ‍ This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials

//https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { ref } from "vue";
import { createDwgFileUploader, setReloadFile } from "./createDwgFileUploader";
import { MxFun } from "mxdraw"

import { getBaseUrl, getUploadFileConfig } from "@/config/serverConfig";
import { showLoadingToast, showToast } from "vant";
import { Console } from "console";
import { t } from "@/languages";
import { keepDecimal } from "@/utils/number";


const createEl = () => {
  const el = document.createElement("div")
  el.id = "picker"
  document.body.appendChild(el)
  return el
}

const el = createEl()
let upload: any
const tipsShow = ref(false)
const fileTips = ref("")
const progress = ref(0)
let sCmd = "OpenDwgImp";
let uploadFile_call: ((param: any) => void) | undefined;

function do_uploadFile_call(uploadFile_call: ((param: any) => void) | undefined, param: any) {

  if (!uploadFile_call) return;
  if (!param) {
    uploadFile_call(param);
    return;
  }

  const type = param.type
  const hash = param.hash
  const file = param.file
  let filePath = ""
  if (hash) {
    let {
      mxfilepath = ""
    } = getUploadFileConfig() || {};
    const baseUrl = getBaseUrl();
    filePath = baseUrl + mxfilepath + hash + "." + type + ".mxweb";
  } else if (type === "mxweb") {
    filePath = URL.createObjectURL(file.source.source)
  }
  param.file_path = filePath;
  uploadFile_call(param);
}

export const uploadFile = async (isReloadFile: boolean, cmd: string, in_uploadFile_call: ((param: any) => void) | undefined = undefined) => {
  return new Promise<void>((res) => {
    setReloadFile(isReloadFile);
    if (cmd && cmd.length > 0) {
      sCmd = cmd;
      uploadFile_call = undefined;
    }
    else if (in_uploadFile_call) {
      sCmd = "";
      uploadFile_call = in_uploadFile_call;
    }
    else {
      res();
    }

    el.getElementsByTagName("label")[0].click()
    el.click()
    // ‍  模拟取消事件
// ‍ Simulate cancellation event

    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          res()
        }, 50)
      },
      { once: true }
    )
  })
}

export interface LoadFileParam {
  file: {
    ext: string,
    id: string,
    lastModifiedDate: Date,
    loaded: number,
    name: string,
    size: number,
    source: {
      source: File
    },
    destroy(): void
    getSource(): File
  },
  type: string
  hash?: string
  isUseServerExistingFile?: boolean
}

export const timeoutHideTip = () => {
  setTimeout(() => {
    tipsShow.value = false;
  }, 100);
}

export const setFileTips = (val: string) => {
  showToast(val)
  fileTips.value = val
}
export const setTipsShow = (val: boolean) => {
  tipsShow.value = val
}

export const useDwgUpload = () => {
  if(!upload) upload = createDwgFileUploader({
    pick: el,
    onError: () => {
      tipsShow.value = true;
      setFileTips(`${t("上传中断")}：${t("服务器程序异常")}！`);
      showToast(`${t("上传中断")},${t("请稍后重试")}！`)
      timeoutHideTip()

      do_uploadFile_call(uploadFile_call, null);

      sCmd = "";
      uploadFile_call = undefined;
    },
    onFileQueued: (file) => {
      if (file.ext === "mxweb") {
        upload.stop();
        upload.reset();
        setTipsShow(false);
        timeoutHideTip();
        const parma = { type: file.ext, file, isUseServerExistingFile: false } as LoadFileParam

        if (sCmd && sCmd.length > 0) {
          MxFun.sendStringToExecute(sCmd, parma);
        }
        else if (uploadFile_call != undefined) {
          do_uploadFile_call(uploadFile_call, parma);
        }
        sCmd = "";
        uploadFile_call = undefined;
        return false
      }

      setFileTips(t("文件预处理中") + "...");
  
      setTipsShow(true);
    },
    onBeginUpload: () => {
      setFileTips(t("上传图纸") + "...")
    },
    onProgress: percentage => {
      if (percentage < 100)
        setFileTips(t("上传图纸") + keepDecimal(percentage, 2) + "%..");
      else
        setFileTips(t("图纸处理中") + "...");
      setTipsShow(true);
      progress.value = percentage;
    },
    onUploadSuccess: (file, hash, isUseExistingFile) => {
      setTipsShow(false);
      timeoutHideTip();
      const param = { hash: hash, type: file.ext, file, isUseServerExistingFile: isUseExistingFile } as LoadFileParam
      if (sCmd && sCmd.length > 0) {
        MxFun.sendStringToExecute(sCmd, param);
      }
      else if (uploadFile_call != undefined) {
        do_uploadFile_call(uploadFile_call, param);
      }
      sCmd = "";
      uploadFile_call = undefined;
    }
  });
  return {
    uploadFile,
    upload,
    tipsShow,
    fileTips,
    progress
  }
}
