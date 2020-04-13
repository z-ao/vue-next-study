# packages 源码学习

packages目录是Vue主要功能实现的目录。     
功能拆分为6大模块，每个模块可独自使用。     

>&符标示能单独发布的模块

* compiler-core 编译器核心功能&
* compiler-dom 浏览器中实现编译器核心功能&
* compiler-sfc 单文件组件编译器
* reactivity 响应式的模块&
* runtime-core 核心功能，虚拟DOM、Vue生命周期等各个API& 
* rumtime-dom 浏览器中实现核心功能&
* server-renderer 服务端渲染&
* shared 全局工具库
* template-explorer 调试template
* vue 主要功能集合&

## 模块的目录结构

* __tests__ 单元测试目录
* dist 生产目录
* src 开发入口
* api-extractor 打包配置