# reactivity 源码学习
reactivity主要为项目提供响应式功能。

## 目录结果
* effect 监听数据变化，触发更新
* lock 全局锁
* operations 数据操作类型枚举
* reactive 响应式数据
* ref 特殊的数据类型

### ref

Ref vs Reactive区别
>对于基本数据类型，函数传递或者对象解构时，会丢失原始数据的引用，   
>换言之，我们没法让基本数据类型，或者解构后的变量(如果它的值也是基本数据类型的话)，成为响应式的数据。

```
//proxy无法劫持以下的基础类型
const a = 1;
const { x: 1 } = { x: 1 }
```

所以，Reactive的参数只能是Object,Array,Map,Set,WeakMap,WeakSet类型。   
接下来探究下，Ref方法如何让基本类型变成响应式。    

```
//声明ref
export interface Ref<T = any> {
  // 1. symbol的属性让TS用判断是否为Ref类型
  // 2. 用基本类型的属性要比用symbol类型的属性判断性能要好，isRef使用基本类型判断
  [isRefSymbol]: true
  value: UnwrapRef<T>
}

export function isRef(r: any): r is Ref {
  return r ? r._isRef === true : false
}
```

通过声明可以得出，Ref类型只有两个属性，1.symbol的标识 2.value存储值    
接下来看UnwrapRef是怎样数据类型。

```
type UnwrapArray<T> = { [P in keyof T]: UnwrapRef<T[P]> }

// 递归地检测嵌套数据的类型  
export type UnwrapRef<T> = {
  // 如果是ref计算类型，继续解套
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  // 如果是ref类型，继续解套
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  // 如果是数组，循环解套
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> & UnwrapArray<T> : T
  // 如果是对象，遍历解套
  object: { [K in keyof T]: UnwrapRef<T[K]> }
}[T extends ComputedRef<any>
  ? 'cRef'
  : T extends Ref
    ? 'ref'
    : T extends Array<any>
      ? 'array'
      : T extends Function | CollectionTypes
        ? 'ref' // bail out on types that shouldn't be unwrapped
        : T extends object ? 'object' : 'ref']

```
因此，Ref是这样的数据结构。有个symbol的属性判断是否ref类型，然后有个value的属性保存值。   


ref方法具体实现
```
const convert = <T extends unknown>(val: T): T =>
  isObject(val) ? reactive(val) : val

//如果是ref 直接返回
export function ref<T extends Ref>(raw: T): T
//函数参数可以任意类型 返回一个ref类型
export function ref<T>(raw: T): Ref<T>
export function ref<T = any>(): Ref<T>
export function ref(raw?: unknown) {
  if (isRef(raw)) {
    return raw
  }
  //如果是参数是引用类型，使用reactive将其变成响应式
  raw = convert(raw) 
  const r = {
    _isRef: true,
    get value() {
      track(r, OperationTypes.GET, 'value')
      return raw
    },
    set value(newVal) {
      raw = convert(newVal)
      trigger(
        r,
        OperationTypes.SET,
        'value',
        __DEV__ ? { newValue: newVal } : void 0
      )
    }
  }
  return r
}
```

## 参考
[https://juejin.im/post/5d9eff686fb9a04de04d8367](https://juejin.im/post/5d9eff686fb9a04de04d8367)