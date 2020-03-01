import { reactive, readonly, toRaw } from './reactive'
import { OperationTypes } from './operations'
import { track, trigger } from './effect'
import { LOCKED } from './lock'
import { isObject, hasOwn, isSymbol, hasChanged } from '@vue/shared'
import { isRef } from './ref'

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

function createGetter(isReadonly: boolean, unwrap: boolean = true) {
  return function get(target: object, key: string | symbol, receiver: object) {
    let res = Reflect.get(target, key, receiver)
    //如果目标值是symbol类型且是原始symbol的字段，直接返回
    if (isSymbol(key) && builtInSymbols.has(key)) {
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
        ? // need to lazy access readonly and reactive here to avoid
          // circular dependency
          // 防止无限循环
          readonly(res)
        : reactive(res)
      : res
  }
}

function set(
  target: object,
  key: string | symbol,
  value: unknown,
  receiver: object
): boolean {
  //获取劫持前的值
  value = toRaw(value)
  //获取修改前的值
  const oldValue = (target as any)[key]
  if (isRef(oldValue) && !isRef(value)) {
    //旧值Ref类型，新值不是，直接修改旧值
    oldValue.value = value
    return true
  }
  const hadKey = hasOwn(target, key) //是否已拥有字段
  const result = Reflect.set(target, key, value, receiver) //更新值
  // don't trigger if target is something up in the prototype chain of original
  if (target === toRaw(receiver)) {
    //目标值不是原型上属性
    /* istanbul ignore else */
    if (__DEV__) {
      const extraInfo = { oldValue, newValue: value }
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      if (!hadKey) {
        //新字段
        trigger(target, OperationTypes.ADD, key) //trigger触发add类型
      } else if (hasChanged(value, oldValue)) {
        trigger(target, OperationTypes.SET, key) //trigger触发set类型
      }
    }
  }
  return result
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    //如果存在的key被删除
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, OperationTypes.HAS, key)
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, OperationTypes.ITERATE)
  return Reflect.ownKeys(target) //return 全部key
}

export const mutableHandlers: ProxyHandler<object> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: createGetter(true),

  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Set operation on key "${String(key)}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return set(target, key, value, receiver)
    }
  },

  deleteProperty(target: object, key: string | symbol): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Delete operation on key "${String(
            key
          )}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return deleteProperty(target, key)
    }
  },

  has,
  ownKeys
}

// props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const readonlyPropsHandlers: ProxyHandler<object> = {
  ...readonlyHandlers,
  get: createGetter(true, false)
}
