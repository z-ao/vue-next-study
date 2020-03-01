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
与 **reactive** 函数差不多，兼容各种情景在入口函数处理，重点逻辑在核心函数处理。    

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
首先 **effect** 类型数据是一个函数，（里面调用 **run** 函数），    
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
其实 **run** 核心操作就把 **effcet** 保存到 **栈** 的尾部，然后执行 **fn** 。   
所以 **响应式数据** 就可通过 **栈** 获取 **effcet** 数据。

