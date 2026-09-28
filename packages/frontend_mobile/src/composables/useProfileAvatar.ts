/**
 * 个人中心头像上传（D-01）。
 *
 * POST /users/avatar（multipart 走 SDK 的 formDataBodySerializer，传普通对象）。
 * 校验前端先行：格式白名单 + 5MB 上限，后端再兜底。
 */
import { ref } from 'vue'
import { usersControllerUploadAvatar } from '@cloudcad/api-sdk/sdk.gen'
import { showFailToast, showSuccessToast } from 'vant'
import { t } from '@/languages'
import { unwrap, errMsg } from '@/utils/apiError'

const AVATAR_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/jfif']
const AVATAR_MAX_BYTES = 5 * 1024 * 1024

export function useProfileAvatar(refresh: () => Promise<unknown>) {
  const avatarInputRef = ref<HTMLInputElement | null>(null)
  const uploadingAvatar = ref(false)
  // 头像 URL 加载失败（过期签名/服务不可达）→ 回落到首字母占位
  const avatarImgFailed = ref(false)

  function pickAvatar() {
    avatarInputRef.value?.click()
  }

  async function onAvatarChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      showFailToast(t('仅支持 PNG、JPEG、GIF、WebP 格式的图片'))
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      showFailToast(t('头像文件大小不能超过 5MB'))
      return
    }
    uploadingAvatar.value = true
    try {
      unwrap(await usersControllerUploadAvatar({ body: { file } as never }))
      // 头像 URL 对用户是稳定的（/api/v1/users/avatar/:id），src 不变浏览器不会重新请求；
      // 上一次 404 已置真 avatarImgFailed 并卸载 img，须复位让新头像重新加载
      avatarImgFailed.value = false
      showSuccessToast(t('头像更新成功'))
      await refresh()
    } catch (e) {
      showFailToast(errMsg(e, t('头像上传失败')))
    } finally {
      uploadingAvatar.value = false
    }
  }

  return {
    avatarInputRef,
    uploadingAvatar,
    avatarImgFailed,
    pickAvatar,
    onAvatarChange,
  }
}
