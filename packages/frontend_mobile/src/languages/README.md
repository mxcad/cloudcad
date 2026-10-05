# i18n 相关命令说明

`npm run i18n`: 从初始化到自动提取翻译编译的合集，一般需要自动翻译时调用它就可以了
`npm run i18nAutoTranslate`: 
自动翻译命令，只有需要手动添加未翻译到的部分时需要用到该命令
在`translates/custom.json` 或者任意json文件(`translates/default.json`除外，这是自动提取的产物)
添加需要翻译的文字就可以了，如翻译"红色":
```json
{
    "红色": {}
}
```
添加一个"红色"的中文字符串作为JSON的key键就可以了
`npm run i18nCompile`: 编译命令
当`translates`目录中的json文件内容都已经翻译并且正确无误后可以使用该命令 编译成ts文件 然后就可以打包了

`npm run setDefaultI18n`: 这是设置默认的翻译配置 其中的命令实现`voerkai18n init .` 是初始化的命令 `-r` 是为了覆盖`languages/settings.json`的配置
可以通过`-lngs <语言代码>`设置语言列表 如设置 中文和英文的语言列表 `-lngs zh en`
通过`-d <语言代码>` 确认默认语言。

语言代码
常见的语言代码如下：

|名称	 |   语言代码 
|  ----  | ----  
|中文	 |zh-CN
|繁体中文|	zh-TW
|英语|	en-US
|日语|	ja
|韩语|	ko-KR
|法语|	fra
|西班牙语|	spa
|泰语|	th
|阿拉伯语|	ara
|俄语|	ru
|葡萄牙语|	pt
|德语|	de
|意大利语|	it
|希腊语|	el
|荷兰语|	nl
|波兰语|	pl
|保加利亚语|	bul
|爱沙尼亚语|	est
|丹麦语|	dan
|芬兰语|	fin
|捷克语|	cs
|罗马尼亚语|	rom
|斯洛文尼亚语|	slo
|瑞典语|	swe
|匈牙利语|	hu
|越南语|	vie


完整语言种类参考：
https://fanyi-api.baidu.com/doc/21

`npm run i18n`: 完整流水线 = extract + autoTranslate(baidu) + compile。`compile -t` 会按 idMap 校验键映射，不一致即失败；翻译质量需人工校对。

`node scripts/i18n/index.cjs`: 独立工具，先把 `public/mxUIConfig.json` 的 `name` / `text` 字段提取到 `src/languages/translates/mxUIConfig.json`，再串跑 `i18nInit → i18nExtract → i18nAutoTranslate → i18nCompile`。未在 package.json 注册，直接用 `node` 调用。

> 历史上的 `i18nAnnotationTranslation`、`i18nSourceCodeSubstitution-ZH`、`i18nSourceCodeSubstitution-EN` 三条命令曾注册在 package.json，但指向从未入库的文件（`git log --all` 可证），已于 2026-10-05 删除。勿再引用。
