# 外部参照文件磁盘命名约定

外部参照 DWG/DXF 文件在磁盘上存储为 `${fileName}.mxweb`（保留原始扩展名），而非 `${baseName}.mxweb`（剥掉扩展名）。例如 `A1.dwg` → `A1.dwg.mxweb`。

**背景**：上传端 `handleExternalReferenceFile`、`checkExists`、`enrichFileInfoList` 使用 `${fileName}.mxweb`，但下载端 `getExternalRefDownloadPath` 错误地用 `${baseName}.mxweb`（剥掉 `.dwg`），导致查看/下载永远找不到文件。修复后所有端统一为 `${fileName}.mxweb`，并增加 `${baseName}.mxweb` 作为旧格式降级兼容。

**理由**：保留原始扩展名使磁盘文件名包含完整信息（格式+状态），多个外部参照同名不同格式（如 `A1.dwg` 和 `A1.dxf`）不会冲突；消费端直接复现上传端的命名规则，无需各自推导，减少不一致。

**取舍**：`${baseName}.mxweb`（剥掉扩展名）更简洁，但不能区分格式，且与上传端不一致。保留扩展名虽然文件名较长，但语义明确、零歧义。

**影响**：磁盘文件已按 `${fileName}.mxweb` 命名，无需迁移；`viewExternalRef` 的 `Content-Disposition` 显示逻辑文件名（`A1.dwg`）而非磁盘文件名（`A1.dwg.mxweb`），用户端无感知。