/**
 * 多文件上传并发池（阶段 5）
 *
 * 最多 concurrency 个上传在途；单文件失败不影响其余文件（onResult 逐文件回调，
 * 页面侧据此出独立成功/失败 toast）；全部结束后 resolve，调用方统一重载一次列表。
 */
export async function runUploadPool(
  files: File[],
  uploadOne: (file: File) => Promise<void>,
  onResult: (file: File, ok: boolean) => void,
  concurrency = 2,
): Promise<{ ok: number; failed: number }> {
  const queue = [...files]
  let ok = 0
  let failed = 0

  const worker = async () => {
    while (queue.length > 0) {
      const file = queue.shift()
      if (!file) return
      try {
        await uploadOne(file)
        ok++
        onResult(file, true)
      } catch {
        failed++
        onResult(file, false)
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, files.length)) }, () => worker())
  await Promise.all(workers)
  return { ok, failed }
}
