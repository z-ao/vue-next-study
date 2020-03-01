# shared 源码学习
shared是项目全局工具库，是私有目录，不会独立发布。

## 目录结构

* codeframe 在日志中生成代码块
* domTagConfig 判断html、svg、非闭合标签
* globalsWhitelist 对象白名单
* index 入口文件 除同级功能外，提供其他类型判断、数据处理等功能
* makeMap 字符串生成字典
* patchFlags patch的标示