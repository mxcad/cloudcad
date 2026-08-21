import { h, render } from 'vue'
import { UploadFileInfo, UploadState } from './types'
import ExternalRefUploadPopup from './ExternalRefUploadPopup.vue'

export interface SelectUploadXRefFileDialogParam {
  images: string[]
  externalReference: string[]
  hash: string
}

export const showExternalReferenceUploadPopup = async (param: SelectUploadXRefFileDialogParam) => {
  const infos: UploadFileInfo[] = [
    ...param.externalReference.map((name) => ({
      name,
      uploadState: UploadState.notSelected,
      progress: 0,
      type: 'ref' as const,
      hash: param.hash,
    })),
    ...param.images.map((name) => ({
      name,
      uploadState: UploadState.notSelected,
      progress: 0,
      type: 'img' as const,
      hash: param.hash,
    })),
  ]

  return new Promise<{ data: boolean }>((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let mounted: ReturnType<typeof h> | null = null

    const vnode = h(ExternalRefUploadPopup, {
      files: infos,
      onClose(result: { data: boolean }) {
        if (mounted) {
          render(null, container)
          mounted = null
        }
        container.remove()
        resolve(result)
      },
    })
    mounted = vnode
    render(vnode, container)
  })
}
