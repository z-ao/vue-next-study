# Vue中的观察者模式

## 统一认知
观察者模式的定义:     
> 一个对象中存在一对多的依赖关系，   
> 当对象的状态发生改变时，它所有的依赖都得到通知并被自动更新。   

<br/>

观察者模式在Vue框架使用:  
<b class="reactive">响应式数据</b>是观察对象，而<b class="effect">视图、计算属性、监听对象</b>是依赖数据。   
首先<b class="reactive">响应式数据</b>与<b class="effect">视图、计算属性、监听对象</b>建立依赖关系。   
当<b class="reactive">响应式数据</b>状态改变时，对应的<b class="effect">视图、计算属性、监听对象</b>会得到通知并自动更新。

这时候问题来了😁，分为如下步骤

1. 如何创建响应式数据和依赖数据
2. 响应式数据如何与依赖数据建立关系
3. 响应式数据的状态改变时，如何通知依赖数据
4. 依赖数据收到通知如何做更新
5. 响应式数据的状态有多少种改变情况


## 解答正文
### 如何创建响应式数据
框架提供创建响应式数据的函数**reactive**，我们从改函数入手。

```
// reactivity/src/effect.ts
// reactive声明
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
```
从声明得知。参数只能是***Object类型***，并返回一个，每层嵌套的属性值不为***Ref类型***的对象。(如何做到？①)

```
// reactivity/src/reactive.ts
// 打开reactive函数
const rawToReactive = new WeakMap<any, any>()
const reactiveToRaw = new WeakMap<any, any>()

export function reactive(target: object) {
  ...(省略与判断readonly有关逻辑)
  ...
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

function createReactiveObject(
  target: unknown,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  ...(省略原始数据已经转化判断逻辑)
  ...

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
  if (!targetMap.has(target)) {
  	// 在全局数据targetMap中分配收集依赖的Map （结构=动作->Set(依赖)）
    targetMap.set(target, new Map()) 
  }
  return observed
}

```
梳理逻辑前，先统一认知。   
**rawToReactive**、**reactiveToRaw**是WeakMap数据，   
主要用<b class="reactive">原始数据</b>与<b class="reactive">响应式数据</b>相互查询。

我们知道Vue3使用Proxy实现数据劫持[【文档】](http://es6.ruanyifeng.com/#docs/proxy)，   
所以mutableHandlers、mutableCollectionHandlers，是实例Proxy时不同类型用到的handle。    

<b class="reactive">响应式数据</b>创建的大概流程是:    
1. 检验**原始数据能转化**（是否readonly、是否已经为响应式数据、是否能被proxy劫持）  
2. 使用**Proxy**劫持原始数据，转化成响应式数据   
3. 把原始数据和响应式数据保存**相互查询WeakMap**   
4. 在**全局数据targetMap**为原始数据分配收集依赖Map 

<br/>
### 创建依赖数据
不管是<b class="effect">视图、计算属性还是监听对象</b>，其实内部通过**effect**函数来创建的。    

```
// reactivity/src/effect.ts
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
}
```
从声明得知，   
**effect**第一个参数是函数，第二参数是可选配置对象，然后返回<b class="effect">依赖数据</b>。   

```
// reactivity/src/effect.ts
export function effect(fn, options){ //函数体
  ...
  ...
  const effect = createReactiveEffect(fn, options)
  if (!options.lazy) {
    effect() //执行
  }
  return effect
}

function createReactiveEffect(fn, options) {
  const effect = function reactiveEffect(...args) {
    return run(effect, fn, args)
  }
  effect._isEffect = true
  effect.active = true
  effect.raw = fn
  effect.deps = []
  effect.options = options
  return effect
}
```
与reactive函数一样，入口函数处理各种兼容情景，重点逻辑在createReactiveEffect核心函数。    
从核心函数看出，<b class="effect">依赖数据</b>是一个函数，有各种特有属性。     
最后执行<b class="effect">依赖数据</b>，即调用**run**方法。

```
// reactivity/src/effect.ts
export const effectStack: ReactiveEffect[] = []

function run(effect: ReactiveEffect, fn: Function, args: unknown[]): unknown {
  if (!effect.active) { // 失活，不走响应式逻辑，直接调用
    return fn(...args)
  }
  if (!effectStack.includes(effect)) { 判断该依赖数据不存在与全局依赖栈里 ②why
    cleanup(effect) //清除与与所有响应式对象建立的依赖关系 ③why
    try {
      effectStack.push(effect)
      return fn(...args)
    } finally {
      effectStack.pop()
    }
  }
}

function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}
```
其实**run**核心操作是，把当前<b class="effect">依赖数据</b>保存到**依赖栈**的尾部，再执行**fn**函数。   
因此<b class="reactive">响应式数据</b>就可通过**依赖栈**获取<b class="effect">依赖数据</b>。

<br/>
### 响应式数据如何与依赖数据建立关系
建立关系，其实在创建<b class="reactive">响应式数据</b>与<b class="effect">依赖数据</b>时，就已埋下伏笔。   
我们回顾创建这两种数据的关键“伏笔”。

在创建依赖最后，<b class="effect">依赖数据</b>被执行。所以触发对应<b class="reactive">响应式数据</b>的代理事务中**get**。      
我们查看代理handle。

```
// reactivity/src/baseHandlers.ts
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
	 // 如果target是symbol类型下属性，直接返回
    if (isSymbol(key) && builtInSymbols.has(key)) { 
      return res
    }
    if (unwrap && isRef(res)) {
      res = res.value
    } else {
      // track用于收集依赖
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
这段代码的重点在，**track**函数，看名字就知道是收集的意思，    
传了三个参数，原始值，动作，键。

```
reactivity/src/effect.ts

export function track(target: object, type: OperationTypes, key?: unknown) {
  ...
  ...
  const effect = effectStack[effectStack.length - 1] //获取依赖对象
  ...
  ...
  let depsMap = targetMap.get(target)
  ...
  ...
  let dep = depsMap.get(key!) // 获取触发动作下的依赖集合
  ...
  ...
  if (!dep.has(effect)) {
    dep.add(effect) // 依赖对象保存依赖集合
    effect.deps.push(dep) // 把依赖集合也保存到依赖对象的dep属性下
    ...
    ...
  }
}
```

建立关系的主要逻辑：   
1. <b class="effect">依赖数据</b>执行，触发对应<b class="reactive">响应式数据</b>的**get**函数   
2. **get**函数调用**track**，进行建立关系核心逻辑      
3. 通过全句数据的**依赖栈**，获取当前的<b class="effect">依赖数据</b>    
4. 通过全句数据的**targetMap**，获取当前<b class="reactive">响应式数据</b>依赖集合     
5. 然后把<b class="effect">依赖数据</b>添加在<b class="reactive">响应式数据</b>依赖集合对应分类**动作集合**   
6. 也把对应**动作集合**添加在<b class="effect">依赖数据</b>的**Dep**属性下           

<br/>
### 响应式数据的状态改变时，如何通知依赖数据

当<b class="reactive">响应式数据</b>修改数据时，会触发代理事务中**set**。

```
// reactivity/src/baseHandlers.ts

function set(
  target: object,
  key: string | symbol,
  value: unknown,
  receiver: object
): boolean {
  ...
  ...
  const hadKey = hasOwn(target, key)
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

这段代码的重点在，**trigger**函数，看名字就知道是通知的意思，   
传了三个参数，原始值，动作，键。 

```
reactivity/src/effect.ts

export function trigger(target, type, key?, extraInfo?) {
  const depsMap = targetMap.get(target) //获取依赖集合
  if (depsMap === void 0) {
    return
  }
  // 普通依赖和计算依赖分开存放到各自Set
  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  if (type === OperationTypes.CLEAR) {// 如果是clear动作，通知所有依赖
    depsMap.forEach(dep => {
      addRunners(effects, computedRunners, dep)
    })
  } else {
    // 修改 | 增加 | 删除 都会有key
    if (key !== void 0) {
      addRunners(effects, computedRunners, depsMap.get(key)) //把动作集合进行分类存放到对应Set
    }
    // 如果是增加或者删除动作，通知length或者ITERATE_KEY动作下的依赖
    if (type === OperationTypes.ADD || type === OperationTypes.DELETE) {
      const iterationKey = isArray(target) ? 'length' : ITERATE_KEY
      addRunners(effects, computedRunners, depsMap.get(iterationKey))
    }
  }
  //遍历各自Set，通知依赖更新
  const run = (effect: ReactiveEffect) => {
    scheduleRun(effect, target, type, key, extraInfo)
  }
  computedRunners.forEach(run)
  effects.forEach(run)
}

④why
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
    effect() // 更新依赖
  }
}
```

通知依赖数据主要逻辑:    
1. 通过全句数据的**targetMap**，获取当前<b class="reactive">响应式数据</b>依赖集合  
2. 创建**effects**和**computedRunners**两个普通依赖和计算依赖的Set    
3. 通过**addRunners**函数，把依赖分类存放**effects**和**computedRunners**两个Set中     
4. 遍历两个Set，执行并更新<b class="effect">依赖数据</b> 

<br/>
### 依赖数据收到通知如何做更新
<b class="reactive">响应式数据</b>调用**trigger**函数后，会立刻执行<b class="effect">依赖数据</b>，    
<b class="effect">依赖数据</b>的执行过程和创建的逻辑大致相同，当然到了，存在差异才是这步最有价值的地方。   

解答第③问题，为什么要清除当前依赖与所有响应式关系

```
// reactivity/src/effect.ts
export const effectStack: ReactiveEffect[] = []

function run(effect: ReactiveEffect, fn: Function, args: unknown[]): unknown {
  ...
  cleanup(effect) //清除与所有响应式对象建立的依赖关系 ③why
}

function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}
```
因为<b class="reactive">响应式数据</b>会存在被删除的情景，所以清除对应关系，便会**释放内存**以免造成内存泄漏，    
而当前<b class="effect">依赖数据</b>无法感知具体被删除的<b class="reactive">响应式数据</b>，    
但是被删除的<b class="reactive">响应式数据</b>是无法触发**get**收集<b class="effect">依赖数据</b>，   
所以只好全都删除，然后与其在没有删除的<b class="reactive">响应式数据</b>重建关系。

<br/>

#### 响应式数据的状态有多少种改变情况
所以改变情况的情况都写在**operations**文件中，其中需要注意的地方是    
**CLEAR**动作会触发所有状态，**SET、ADD、DELETE**会附带通知**ITERATE**状态更新

```
// reactivity/src/operations.ts
export const enum OperationTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate'
}
```

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
    color: #666;
 }
</style>