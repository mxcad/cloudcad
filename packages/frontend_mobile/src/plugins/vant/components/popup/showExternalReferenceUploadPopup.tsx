import { t } from "@/languages";
import {
  showConfirmDialog,

} from "vant";
import { createVNode, h, ref, render } from "vue";
import { UploadFileInfo, UploadState } from "./types";
const teleport = document.createElement("div");
document.body.appendChild(teleport);
import ExternalReferenceUploadPopup from "./ExternalReferenceUploadPopup.vue"
import { getHostUrl, getUploadFileConfig } from "@/config/serverConfig";
let dialog: any = null;
export interface selectUploadXRefFileDialogParam {
  images: string[]
  externalReference: string[],
  hash: string
}

const files = ref<UploadFileInfo[]>([])

export const showExternalReferenceUploadPopup = async (parma: selectUploadXRefFileDialogParam) => {
  return new Promise((res) => {
    const infos: UploadFileInfo[] = []
    parma.externalReference.forEach((name) => {
      infos.push({
        name,
        uploadState: UploadState.notSelected,
        progress: 0,
        type: "ref",
        hash: parma.hash,

      })
    })
    parma.images.forEach((name) => {
      infos.push({
        name,
        uploadState: UploadState.notSelected,
        progress: 0,
        hash: parma.hash,
        type: "img"
      })
    })

    files.value = infos

    const action = showConfirmDialog({
      title: t("上传外部参照"),
    
      message: () => (
        <ExternalReferenceUploadPopup files={files.value}></ExternalReferenceUploadPopup>
      )
    }).then(() => {

      res({
        data: true
      })
    }).catch(() => {
      res({
        data: false
      })
    })
  })

};
