# mxVersionTool — packages/mxVersionTool

MX 版本控制 CLI 包装器（CommonJS），后端通过此包进行 SVN 式文件版本操作。

## 结构

```
mxcmd.js           # 入口 + 导出
mx-executor.js     # MX 命令执行包装器
mxpath.js          # 路径解析
mxadminpath.js     # 管理路径
mxcheck.js         # 可用性检查
mxcheckout.js      # Checkout
mxadd.js           # Add
mxcommit.js        # Commit
mxlist.js          # List
mxadmincreate.js   # 仓库创建
mximport.js        # Import
mxdelete.js        # Delete
mxlog.js           # Log
mxcat.js           # Cat
mxpropset.js       # 属性设置
mxupdate.js        # Update
mxcleanup.js       # Cleanup
mxresolve.js       # Resolve
```

## 说明

- **集成**: 后端自动调用，不使用直接 CLI
- **输出**: 返回结构化数据供程序消费
- **安全**: 不存储凭据
