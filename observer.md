# Vue中的观察者模式

>
观察者模式的定义:     
在对象中存在一对多的依赖关系，当一个对象的状态发生改变时，所有依赖于它的对象都得到通知并被自动更新。   
这种模式有时又称作发布-订阅模式、模型-视图模式，它是对象行为型模式。


Vue中的观察者模式:  
**响应式对象**与视图、计算属性、监听对象与建立依赖关系。    
**响应式对象**状态改变时，会通知并触发它的依赖对象更新。
<br/>
<br/>

我们可以用有趣的说法，剖析响应式实现的流程 
 
我们把响应式对象比喻成**客栈**，依赖目标比喻成**旅客**。   
当旅客走进客栈时，小二安排旅客入住房间。  
当客栈对房间进行时调整，通知旅客做相应的变化。

<br/>
<br/>
这时候问题来了，

* 如何把平房改造为客栈
* 如何成为一名入住旅客
* 小二如何感知旅客走进客栈
* 房间调整时如何通知旅客 
* 旅客如何做变化

## 响应式对象创建
>把平房改造为客栈

框架提供 **reactive** 函数创建响应式对象。

```
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
```
从声明得知。参数只能传**Object类型**，并返回一个，每层嵌套属性值都不为**Ref类型**的对象。(如何做到？①)

打开**reactive**函数

```
export function reactive(target: object) {
  ...(去掉多余逻辑)
  ...
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}
```
  
**rawToReactive**、**reactiveToRaw**是俩个WeakMap数据，   
它们的作用是保存数据转换前后的对应关系。大家可以把它看成两张表，

+ 平房对应客栈表     
+ 客栈对应平房表 

我们都知道Vue3使用的ES6的Proxy对象实现数据劫持[【文档】](http://es6.ruanyifeng.com/#docs/proxy)，   
而mutableHandlers、mutableCollectionHandlers，作用是实例Proxy时，根据不同类型用到不同的handle。    
我们继续看创建响应对象的核心函数 **createReactiveObject**。


```
function createReactiveObject(
  target: unknown,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  ...
  ...
  let observed = toProxy.get(target)
  if (observed !== void 0) { //平房已经改造成客栈
    return observed
  }

  if (toRaw.has(target)) { //造成房子就是客栈
    return target
  }
  //只转化 Object,Array,Map,Set,WeakMap,WeakSet 类型
  if (!canObserve(target)) {
    return target
  }
  //target 为Set, Map, WeakMap, WeakSet 用collectionHandlers
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  if (!targetMap.has(target)) { //给客栈一张旅客登记表
    targetMap.set(target, new Map()) 
  }
  return observed
}
```
其实该函数就3个重点

+ 判断对象有没资格
+ 使用Proxy转化对象
+ 把对象登记在两个WeakMap，targetMap再分配收集依赖Map 

<br/>
<br/>
响应式对象创建已经梳理完了，接下来分析如何创建依赖对象。

## 创建依赖对象
> 成为一名入住旅客

不管是视图、计算属性、监听，其实内部都是使用 **effect** 函数创建依赖对象。    

我们打开 **effect** 函数。

```
//对源码稍稍做了下处理
export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions { //配置项
	  lazy?: boolean
	  computed?: boolean
	  scheduler?: (run: Function) => void
	  onTrack?: (event: DebuggerEvent) => void
	  onTrigger?: (event: DebuggerEvent) => void
	  onStop?: () => void
   }
): ReactiveEffect<T = any> { //返回effect对象
  (): T
  _isEffect: true
  active: boolean
  raw: () => T
  deps: Array<Dep>
  options: ReactiveEffectOptions
} { //函数体
  ...
  ...
  const effect = createReactiveEffect(fn, options)
  if (!options.lazy) {
    effect()
  }
  return effect
}
```
从声明中得知，第一个参数是函数，第二参数是可选配置对象，返回 **effect** 类型数据。   
与 **reactive** 函数差不多，兼容各种情景在入口函数处理，重点逻辑在核心函数 **createReactiveEffect** 处理。    

我们来查看 **createReactiveEffect** 函数。

```
function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: unknown[]): unknown {
    return run(effect, fn, args)
  } as ReactiveEffect
  effect._isEffect = true
  effect.active = true
  effect.raw = fn
  effect.deps = []
  effect.options = options
  return effect
}
```
首先 **effect** 的类型数据是一个函数，（里面调用 **run** 函数），    
然后在数据添加各个属性，其中最有价值的是 **deps** 属性。（②下回分解）   

因为最后 **effect** 类型数据会被执行，即调用了 **run** 函数，打开 **run**

```
function run(effect: ReactiveEffect, fn: Function, args: unknown[]): unknown {
  if (!effect.active) {
    return fn(...args)
  }
  if (!effectStack.includes(effect)) {
    cleanup(effect) //清除与有关响应式对象的依赖关系
    try {
      effectStack.push(effect)
      return fn(...args)
    } finally {
      effectStack.pop()
    }
  }
}
```
其实 **run** 核心操作是，把 **effcet** 先保存到 **栈** 的尾部，再执行 **fn** 函数。   
因此 **响应式数据** 就可通过 **栈** 获取 **effcet** 数据。

## 响应式对象收集依赖
> 小二如何感知旅客走进客栈

其实对Vue有了解的人都知道，框架使用Proxy劫持对象，从而收集依赖。    
我们回顾创建响应式数据的后半段逻辑。

```
...
...
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  if (!targetMap.has(target)) { //给客栈一张旅客登记表
    targetMap.set(target, new Map()) 
  }
  return observed
```

在创建依赖的后半段逻辑，*** effect *** 会被执行。所以必然触发响应式的*** get ***。   
我们打开*** baseHandlers ***。

```
reactivity/src/baseHandlers.ts

import { track, trigger } from './effect'

export const mutableHandlers: ProxyHandler<object> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}

function createGetter(isReadonly: boolean, unwrap: boolean = true) {
  return function get(target: object, key: string | symbol, receiver: object) {
    let res = Reflect.get(target, key, receiver)

    if (isSymbol(key) && builtInSymbols.has(key)) { //如果目标值是symbol类型且是原始symbol的字段，直接返回
      return res
    }
    if (unwrap && isRef(res)) {
      res = res.value
    } else {
      // track用于收集依赖，以后专门分析
      track(target, OperationTypes.GET, key)
    }
    return isObject(res)
      ? isReadonly
        ? // 防止无限循环
          readonly(res)
        : reactive(res)
      : res
  }
}
```

这段代码的重点在，*** track ***函数，看名字就知道是收集的意思，    
传了三个参数，原始值，动作，键。

```
reactivity/src/effect.ts

export function track(target: object, type: OperationTypes, key?: unknown) {
  if (!shouldTrack || effectStack.length === 0) {
    return
  }
  const effect = effectStack[effectStack.length - 1] //触发get的依赖对象
  if (type === OperationTypes.ITERATE) {
    key = ITERATE_KEY
  }
  let depsMap = targetMap.get(target)
  if (depsMap === void 0) {
    targetMap.set(target, (depsMap = new Map()))
  }
  let dep = depsMap.get(key!) // 获取触发动作所有的依赖
  if (dep === void 0) {
    depsMap.set(key!, (dep = new Set()))
  }
  if (!dep.has(effect)) {
    dep.add(effect) // 如果改触发动作没有收集，那保存
    effect.deps.push(dep) // 依赖也把触发动作的 【依赖集合】保存
    if (__DEV__ && effect.options.onTrack) {
      effect.options.onTrack({
        effect,
        target,
        type,
        key
      })
    }
  }
}
```
因为在创建依赖的后半段逻辑，依赖对象会添加到 依赖栈 的末尾。     
所以响应式数据能通过 依赖栈 获取对应的依赖。    
然后再把 依赖 保存到对应 触发动作分类集合中。    
然后 依赖 也罢 触发动作分类集合 保存到自己属性里。