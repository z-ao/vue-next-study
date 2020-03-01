import { track, trigger } from './effect'
import { OperationTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive, isReactive } from './reactive'
import { ComputedRef } from './computed'
import { CollectionTypes } from './collectionHandlers'

const isRefSymbol = Symbol()

export interface Ref<T = any> {
  // [isRefSymbol]字段帮助TS区分 那个是Ref类型与那个为拥有一个value字段的对象 起到关键作用
  // This field is necessary to allow TS to differentiate a Ref from a plain
  // object that happens to have a "value" field.
  // 在对象取值的性能上，在symbol作为key比普通key慢的多，因此isRef函数，应用_isRef属性判断是否为Ref类型
  // However, checking a symbol on an arbitrary object is much slower than
  // checking a plain property, so we use a _isRef plain property for isRef()
  // check in the actual implementation.
  // 不在interface声明isRef的原因是，不想让内部字段泄漏让使用者自动补全（是有特别的方法实现私有symbol），
  // The reason for not just declaring _isRef in the interface is because we
  // don't want this internal field to leak into userland autocompletion -
  // a private symbol, on the other hand, achieves just that.
  [isRefSymbol]: true
  value: UnwrapRef<T>
}

const convert = <T extends unknown>(val: T): T =>
  isObject(val) ? reactive(val) : val

export function isRef(r: any): r is Ref {
  return r ? r._isRef === true : false
}

//如果Ref类型 直接返回 参数
export function ref<T extends Ref>(raw: T): T
//在有参数情况 返回 Ref类型
export function ref<T>(raw: T): Ref<T>
//没有传入参数，直接返回 Ref类型
export function ref<T = any>(): Ref<T>
export function ref(raw?: unknown) {
  if (isRef(raw)) {
    return raw
  }
  //如果参数是引用类型，使用reactive将其变成响应式、如果是基本类型，直接使用proxy变成响应式
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

//reactive/对象类型 key转化为Ref
export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  if (__DEV__ && !isReactive(object)) {
    console.warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}

function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  return {
    _isRef: true,
    get value(): any {
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  } as any
}

type UnwrapArray<T> = { [P in keyof T]: UnwrapRef<T[P]> }

// 不是ref的类型
// Recursively unwraps nested value bindings.
export type UnwrapRef<T> = {
  //参数是ComputedRef类型进来 如果是ref计算类型，继续解套
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  // 参数是Function、CollectionTypes或其他类型进来  如果是ref类型，继续解套，如果不是直接返回
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  //参数是Array 如果是数组，循环解套
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> & UnwrapArray<T> : T
  //参数是对象 如果是对象，遍历解套
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
