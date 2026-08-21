# Config Center

部署配置管理中心，零外部依赖的纯 Node.js HTTP 服务。管理后端 .env、前端 ini 配置、品牌资产、PM2 服务编排。

## Language

**myUiConfig.json**:
前端 UI 配置的文件名，控制工具栏、菜单栏、右键菜单等外观。由 config-service 通过管理面板写入。
_Avoid_: UI 配置、界面配置

**myServerConfig.json**:
前端运行时服务端配置，包含 WASM 路径、AI 端点、上传限制、字体列表等。
_Avoid_: 服务端配置

**FRONTEND_INI_DIR**:
前端 ini 配置文件在服务器上的存放目录路径。config-service 读取和写入此目录下的 .json 文件。
_Avoid_: ini 目录

**FRONTEND_DIST_DIR**:
前端构建产物的部署路径。config-service 将品牌配置（标题、Logo）写入 `dist/brand/config.json`。
_Avoid_: dist 目录
