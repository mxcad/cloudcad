#!/bin/bash
# ================================================================
# 阿里云函数计算(FC)部署脚本
# 部署 梦想网页CAD实时协同平台 转换函数到阿里云 FC
#
# 前置条件:
#   1. 安装 fun CLI (npm install @alicloud/fun -g)
#   2. 配置: fun config
#   3. 已将 mxcadassembly 和转换脚本打包
#
# 使用:
#   ./deploy-aliyun.sh [function-name] [region]
# ================================================================

set -euo pipefail

FUNCTION_NAME="${1:-cloudcad-convert}"
REGION="${2:-cn-hangzhou}"
SERVICE_NAME="cloudcad"

echo "=== 部署到阿里云函数计算 ==="
echo "服务名称: $SERVICE_NAME"
echo "函数名称: $FUNCTION_NAME"
echo "区域: $REGION"
echo ""

# 使用 fun 部署
cat > template.yml << EOF
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  $SERVICE_NAME:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: '梦想网页CAD实时协同平台 图纸转换函数'
    $FUNCTION_NAME:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: index.handler
        Runtime: nodejs20
        CodeUri: ./function.zip
        MemorySize: 1024
        Timeout: 120
      Events:
        HttpTrigger:
          Type: HTTP
          Properties:
            AuthType: anonymous
            Methods: ['POST', 'GET']
EOF

fun deploy -y

echo ""
echo "部署完成。"
echo ""
echo "在 梦想网页CAD实时协同平台 中配置:"
echo "  FUNCTION_EXECUTOR=cloud-faas"
echo "  CLOUD_FAAS_PROVIDER=aliyun"
echo "  ALIYUN_FC_ENDPOINT=https://$FUNCTION_NAME.$REGION.fc.aliyuncs.com"
echo "  ALIYUN_AK=<your-ak>"
echo "  ALIYUN_SK=<your-sk>"
