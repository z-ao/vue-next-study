# reactive源码学习
响应式是Vue框架的核心，而响应式主要使用reactive方法实现。

```
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
```
从声明文件中，reactive只能传入对象类型，返回一个不为Ref类型的对象。

```
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // 如果已劫持 直接返回
  if (readonlyToRaw.has(target)) {
    return target
  }
  //用户的只读标记 到readonly方法
  // target is explicitly marked as readonly by user
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}
```
前面两个判断很简单，只要是被劫持或只读直接返回。     
第二步，分两个逻辑分支，分别是readonly和普通响应式。它们都使用createReactiveObject方法实现，     
区别是保存的Map对象不一样。    

```
function createReactiveObject(
  target: unknown,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target 已经被劫持
  // target already has corresponding Proxy
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // target is already a Proxy
  if (toRaw.has(target)) {
    return target
  }
  //只监听 Object,Array,Map,Set,WeakMap,WeakSet
  // only a whitelist of value types can be observed.
  if (!canObserve(target)) {
    return target
  }
  //target 为Set, Map, WeakMap, WeakSet 用方法collectionHandlers
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  return observed
}
```
createReactiveObject方法前面照旧也是琐碎判断，如果是响应式、或已劫持、或是不能劫持类型，直接返回。       
然后是用ES Proxy劫持数据，    
再把源数据和劫持后数据保存到两个Map里，
最后在targetMap为该响应式数据创建空间，收集对应的监听者。

上面述说的大概逻辑。现在对每一个在详细描述。

### 为什么reactive只能传对象
这个在RFC有提到，

===
我们知道在 JavaScript 中，原始值类型如 string 和 number 是只有值，没有引用的。    
如果在一个函数中返回一个字符串变量，接收到这个字符串的代码只会获得一个值，是无法追踪原始变量后续的变化的。

简单的说，JS基本类型只有值，没有引用地址。所以无法跟踪基本类型变量以后变化。

### reactive如何返回不为Ref类型的对象
在上面概括中，reactive返回Proxy劫持的值，    
而这里Proxy有两种handle的情况，为了易懂，先看baseHandlers。   

```
//baseHandlers 其实是 baseHandlers.ts 文件的 mutableHandlers 对象
export const mutableHandlers: ProxyHandler<object> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}
//获取proxy的值，主要是get的影响
function createGetter(isReadonly: boolean, unwrap: boolean = true) {
  return function get(target: object, key: string | symbol, receiver: object) {
    let res = Reflect.get(target, key, receiver) //拿目标值
    if (isSymbol(key) && builtInSymbols.has(key)) {
      return res
    }
    if (unwrap && isRef(res)) { //主要是这步，如果目标值是Ref类型，取value
      res = res.value
    } 
    ...
    ...
  }
}
```