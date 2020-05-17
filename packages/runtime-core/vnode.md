# vNode

## 统一共知
vnode简单的说就是，使用JS对象描述节点。   

vnode的结构如下
```
// runtime-core/src/vnode.ts
export interface VNode<HostNode = any, HostElement = any> {
  _isVNode: true
  type: VNodeTypes
  props: VNodeProps | null
  key: string | number | null
  ref: string | Function | null
  children: NormalizedChildren<HostNode, HostElement>
  component: ComponentInternalInstance | null
  suspense: SuspenseBoundary<HostNode, HostElement> | null
  dirs: DirectiveBinding[] | null

  // DOM
  el: HostNode | null
  anchor: HostNode | null // fragment anchor
  target: HostElement | null // portal target

  // optimization only
  shapeFlag: number
  patchFlag: number
  dynamicProps: string[] | null
  dynamicChildren: VNode[] | null

  // application root node only
  appContext: AppContext | null
}
```
 
框架提供**h**方法创建vnode。     

```
// runtime-core/src/vnode.ts
export function h(type: any, propsOrChildren?: any, children?: any): VNode {
  if (arguments.length === 2) {
    if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
      // single vnode without props
      if (isVNode(propsOrChildren)) {
        return createVNode(type, null, [propsOrChildren])
      }
      // props without children
      return createVNode(type, propsOrChildren)
    } else {
      // omit props
      return createVNode(type, null, propsOrChildren)
    }
  } else {
    if (isVNode(children)) {
      children = [children]
    }
    return createVNode(type, propsOrChildren, children)
  }
}
```

哈哈，和预想一样，单独抽取一个函数处理各参数的兼容。     
真正的核心函数是**createVNode**

```
// runtime-core/src/vnode.ts
export function createVNode(
  type: VNodeTypes,
  props: { [key: string]: any } | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null
): VNode {
  ...
  ...

  const vnode: VNode = {
    _isVNode: true,
    type,
    props,
    key: (props !== null && props.key) || null,
    ref: (props !== null && props.ref) || null,
    children: null,
    component: null,
    suspense: null,
    dirs: null,
    el: null,
    anchor: null,
    target: null,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null
  }

  normalizeChildren(vnode, children) //生成 子vnode 引用关系

  ...
  ...

  return vnode
}
```
创建vnode无非就生成一个JS对象，与子vnode保持引用关系。 

## 类型
vnode的类型通过type属性定义，我们查看type的类型声明。 

```
// runtime-core/src/vnode.ts
export type VNodeTypes =
  | string //字符串
  | Component //组件
  | typeof Fragment //代码片段
  | typeof Portal //portal组件
  | typeof Text //文本
  | typeof Comment //注释
  | typeof SuspenseImpl //suspense组件
``` 

## 过程
mount > compile > render > vnode > patch > dom 

### mount

```
// runtime-core/src/apiApp.ts
export function createAppAPI( render ) {
  return function createApp(): App {
    ...
    ...

    const app = {
      ...
      ...

      mount(
        rootComponent: Component,
        rootContainer: HostElement,
        rootProps?: Data
      ): any {
        if (!isMounted) {
          const vnode = createVNode(rootComponent, rootProps)
          // store app context on the root VNode.
          // this will be set on the root instance on initial mount.
          vnode.appContext = context
          render(vnode, rootContainer)
          isMounted = true
          return vnode.component!.renderProxy
        ...
        ...
      },
      ...
      ...
    }

    return app
  }
}
```

在使用createApp方法，创建Vue对象有一个mount的属性，把Vue组件挂载对应的dom里。
