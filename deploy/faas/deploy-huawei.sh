#!/bin/bash
# ================================================================
# 华为 FunctionGraph 部署脚本
# 部署 梦想网页CAD实时协同平台 转换函数到华为云 FunctionGraph
#
# 前置条件:
#   1. 安装 hcloud CLI (https://github.com/huaweicloud/hcloud-cli)
#   2. 配置 AK/SK: hcloud configure set --access-key=xxx --secret-key=yyy
#   3. 已将 mxcadassembly 和转换脚本打包为 function.zip
#
# 使用:
#   ./deploy-huawei.sh [function-name] [region]
# ================================================================

set -euo pipefail

FUNCTION_NAME="${1:-cloudcad-convert}"
REGION="${2:-cn-north-4}"
ZIP_FILE="./function.zip"

if [ ! -f "$ZIP_FILE" ]; then
  echo "错误: 未找到 $ZIP_FILE"
  echo "请先打包转换函数:"
  echo "  zip -j function.zip mxcadassembly.exe converter.js"
  exit 1
fi

echo "=== 部署到华为 FunctionGraph ==="
echo "函数名称: $FUNCTION_NAME"
echo "区域: $REGION"
echo ""

# 检查函数是否存在
if hcloud FGS ShowFunctionConfig --function-urn="urn:fss:$REGION:xxx:function:default:$FUNCTION_NAME" &>/dev/null; then
  echo "更新已有函数..."
  hcloud FGS UpdateFunctionCode \
    --function-urn="urn:fss:$REGION:xxx:function:default:$FUNCTION_NAME" \
    --file-type=zip \
    --code-attachment="@$ZIP_FILE"
else
  echo "创建新函数..."
  hcloud FGS CreateFunction \
    --function-name="$FUNCTION_NAME" \
    --handler="index.handler" \
    --runtime="Node.js 20" \
    --code-type=zip \
    --code-attachment="@$ZIP_FILE" \
    --func-memory=1024 \
    --timeout=120
fi

echo ""
echo "部署完成。函数端点:"
echo "  https://$FUNCTION_NAME.$REGION.functiongraph.com"
echo ""
echo "在 梦想网页CAD实时协同平台 中配置:"
echo "  FUNCTION_EXECUTOR=cloud-faas"
echo "  CLOUD_FAAS_PROVIDER=huawei"
echo "  HUAWEI_FUNCTIONGRAPH_ENDPOINT=https://$FUNCTION_NAME.$REGION.functiongraph.com"
echo "  HUAWEI_AK=<your-ak>"
echo "  HUAWEI_SK=<your-sk>"
