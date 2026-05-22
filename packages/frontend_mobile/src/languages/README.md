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
|中文	 |zh 
|繁体中文|	cht
|英语|	en
|日语|	jp
|韩语|	kor
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

`npm run i18nAnnotationTranslation`: 将中文翻译追加英文注释， 一般在写了中文注释后调用它

`npm run i18nSourceCodeSubstitution-EN`: 根据`src/languages/settings.json`查看当前的语言，如果不是英文会将源码中包含`t("文字")` 的`文字`，会去寻找`src/languages/translates`目录中的`json`文件记录的对象的键是否是这个`文字`， 如果是， 则会根据语言代码(比如这个命令是 EN) 就会在这个对象键中寻找en属性对应的文字，进行替换， 替换会先替换源码中的`t("文字")`然后替换`json`文件对象中的键。
如: 
index.ts 存在 `t("你好")` 而 `src/languages/translates/default.json`中正好存在`{"你好": { "en": "Hello" }}`这个对象
那么 index.ts源码会变成`t("Hello")` 而`src/languages/translates/default.json`中的这个对象就会变成: `{"Hello": { "zh": "你好" }}`

这样就完成了源码的转换并且适配i18n。
所有， 调用这个命令前最好先`npm run i18n` 确保源码中所有需要提取的内容都提取到了`src/languages/translates`的json文件中，再调用该命令。
