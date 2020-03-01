# 源码学习

vue 3项目结构分析     
根目录除了自动化部署、文档、打包等配置文件外，    
重点分析3个目录    

* packages / 存放框架代码
* scripts / 存放项目打包脚本
* test-dts / 存放项目测试脚本

> 从各个配置文件中，可以看出项目使用的技术栈

* prettierrc > 一个关注代码格式的插件（分号、引号等）
* jest > 集成测试框架
* rollup > javascript打包工具
* typescript > javascript超类
