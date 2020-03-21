# Vue中的观察者模式

## 统一认知
观察者模式的定义:     
> 一个对象中存在一对多的依赖关系，   
> 当对象的状态发生改变时，它所有的依赖都得到通知并被自动更新。   

<br/>
<br/>
观察者模式在Vue框架使用:  
<b class="reactive">响应式数据</b>是观察对象，而<b class="effect">视图、计算属性、监听对象</b>是依赖数据。   
首先<b class="reactive">响应式数据</b>与<b class="effect">视图、计算属性、监听对象</b>建立依赖关系。   
当<b class="reactive">响应式数据</b>状态改变时，对应的<b class="effect">视图、计算属性、监听对象</b>会得到通知并自动更新。

这时候问题来了😁  

* 如何创建响应式数据或依赖数据
* 响应式数据如何与依赖数据建立关系
* 响应式数据的状态改变时，如何通知依赖数据
* 依赖数据收到通知如何做更新
* 响应式数据的状态有多少种改变情况

<br/>
<article class="demo">
我们可以换个有趣的说法，例如把       
响应式数据比喻成<b class="reactive">客栈</b>，依赖比喻成<b class="effect">旅客</b>。   
当<b class="effect">旅客</b>入住客栈时，会收录到<b class="reactive">客栈</b>系统中。  
当<b class="reactive">客栈</b>中有人员调整时，通知对应的<b class="effect">旅客</b>做相应的变化。

Q:   
1. 如何创建客栈或成为入住旅客   
2. 旅客如何入住客栈，并把其信息录入系统    
3. 客栈调整时并如何通知旅客   
4. 旅客如何做变化   
5. 客栈有多少种调整情况
</article>

## 解答正文
### 响应式对象创建
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

### 响应式对象收集依赖
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

在创建依赖的后半段逻辑，***effect*** 会被执行。所以必然触发响应式的 ***get***。   
我们打开 ***baseHandlers***。

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

这段代码的重点在，***track*** 函数，看名字就知道是收集的意思，    
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
因为在创建依赖的后半段逻辑，***依赖对象***会添加到***依赖栈***的末尾。     
所以响应式数据能通过***依赖栈***获取对应的***依赖对象***。    
然后再把***依赖对象***保存到对应***触发动作集合***中。    
然后***依赖对象***也把***触发动作集合***保存到自己属性里。

### 响应式对象状态改变通知依赖更新
> 房间调整时如何通知旅客 

当响应式对象修改数据时，会触发***Proxy***的***set函数***。

```
reactivity/src/baseHandlers.ts

function set(
  target: object,
  key: string | symbol,
  value: unknown,
  receiver: object
): boolean {
  ...
  ...
  const hadKey = hasOwn(target, key) //是否已拥有字段
  const result = Reflect.set(target, key, value, receiver) //更新值

  if (target === toRaw(receiver)) {
    ...
    ...
      if (!hadKey) {
        //新字段
        trigger(target, OperationTypes.ADD, key) //trigger触发add类型
      } else if (hasChanged(value, oldValue)) {
        trigger(target, OperationTypes.SET, key) //trigger触发set类型
      }
  }
  return result
}
```

这段代码的重点在，trigger 函数，看名字就知道是触发的意思，   
传了三个参数，原始值，动作，键。 

```
reactivity/src/effect.ts

export function trigger(
  target: object,
  type: OperationTypes,
  key?: unknown,
  extraInfo?: DebuggerEventExtraInfo
) {
  const depsMap = targetMap.get(target) //所有动作依赖
  if (depsMap === void 0) {
    return
  }
  // 普通依赖和计算依赖分开存放
  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  if (type === OperationTypes.CLEAR) {// 如果是清除动作，所有都要依赖通知
    depsMap.forEach(dep => {
      addRunners(effects, computedRunners, dep)
    })
  } else {
    // 修改 | 增加 | 删除 都会有key
    if (key !== void 0) {
      addRunners(effects, computedRunners, depsMap.get(key)) //获取对应动作的依赖
    }
    // 如果是 增加 或者 删除 动作 通知 length 或者 ITERATE_KEY 动作下的依赖
    if (type === OperationTypes.ADD || type === OperationTypes.DELETE) {
      const iterationKey = isArray(target) ? 'length' : ITERATE_KEY
      addRunners(effects, computedRunners, depsMap.get(iterationKey))
    }
  }
  //通知依赖更新
  const run = (effect: ReactiveEffect) => {
    scheduleRun(effect, target, type, key, extraInfo)
  }
  computedRunners.forEach(run)
  effects.forEach(run)
}

// 遍历单个动作的依赖集合 
// 判断如果是普通依赖就放进 effects, 计算依赖就放进 computedRunners
function addRunners(
  effects: Set<ReactiveEffect>,
  computedRunners: Set<ReactiveEffect>,
  effectsToAdd: Set<ReactiveEffect> | undefined
) {
  if (effectsToAdd !== void 0) {
    effectsToAdd.forEach(effect => {
      if (effect.options.computed) {
        computedRunners.add(effect)
      } else {
        effects.add(effect)
      }
    })
  }
}
```

trigger函数会声明***effects***和***computedRunners***，分别存放普通依赖和计算依赖。    
根据对应动作情况，获取对应动作集合下依赖，（通过***addRunners***函数保存到***effects***和***computedRunners***）。    
这里主要根据动作情况取出对应的依赖，依赖的更新主要通过***scheduleRun***函数实现。

```
reactivity/src/effect.ts

function scheduleRun(
  effect: ReactiveEffect,
  target: object,
  type: OperationTypes,
  key: unknown,
  extraInfo?: DebuggerEventExtraInfo
) {
  ...
  ...
  if (effect.options.scheduler !== void 0) {
    effect.options.scheduler(effect) //如果有 scheduler 参数，使用 scheduler
  } else {
    effect() // 调用依赖
  }
}
```
scheduleRun 逻辑比较简单，判断是否在创建依赖时有***scheduler***函数，就调用。   
否则就直接调用***依赖对象***完成更新。

<style>
body{
	color: #333;
}

code{
	background: #f5f5f5;
}

.reactive{
	background-color: #fff5f5;
   color: #2c898c;
}

.effect{
	background-color: #fff7e6;
   color: #d46b08;
}

.demo{
	 padding: 12px;
    background-color: #fffaeb;
    color: #666
 }
</style>