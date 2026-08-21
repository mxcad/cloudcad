#!/bin/bash
# ================================================================
# AWS Lambda 部署脚本
# 部署 梦想网页CAD实时协同平台 转换函数到 AWS Lambda
#
# 前置条件:
#   1. 安装 AWS CLI (https://aws.amazon.com/cli/)
#   2. 配置: aws configure
#   3. 已将 mxcadassembly 和转换脚本打包为 function.zip
#
# 使用:
#   ./deploy-aws.sh [function-name] [region]
# ================================================================

set -euo pipefail

FUNCTION_NAME="${1:-cloudcad-convert}"
REGION="${2:-us-east-1}"
ZIP_FILE="./function.zip"

if [ ! -f "$ZIP_FILE" ]; then
  echo "错误: 未找到 $ZIP_FILE"
  echo "请先打包转换函数:"
  echo "  zip -j function.zip mxcadassembly converter.js"
  exit 1
fi

echo "=== 部署到 AWS Lambda ==="
echo "函数名称: $FUNCTION_NAME"
echo "区域: $REGION"
echo ""

# 检查函数是否存在
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  echo "更新已有函数..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --zip-file "fileb://$ZIP_FILE"
else
  echo "创建新函数..."
  ROLE_ARN="${AWS_LAMBDA_ROLE_ARN:-arn:aws:iam::xxx:role/lambda-execution}"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$ZIP_FILE" \
    --memory-size 1024 \
    --timeout 120
fi

echo ""
echo "部署完成。"
echo ""
echo "在 梦想网页CAD实时协同平台 中配置:"
echo "  FUNCTION_EXECUTOR=cloud-faas"
echo "  CLOUD_FAAS_PROVIDER=aws"
echo "  AWS_LAMBDA_ENDPOINT=https://lambda.$REGION.amazonaws.com"
echo "  AWS_AK=<your-access-key>"
echo "  AWS_SK=<your-secret-key>"
echo "  AWS_REGION=$REGION"
