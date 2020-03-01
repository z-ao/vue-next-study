# ref源码学习
ref文件主要提供三个方法

* isRef 返回是否Ref类型
* toRef 把[响应式/对象]类型转化为Ref类型
* ref 创建并返回Ref类型数据

## isRef

使用_isRef属性判断 

```
export function isRef(r: any): r is Ref {
  return r ? r._isRef === true : false
}
//_isRef属性在创建是注入
export function ref(raw?: unknown) {
  ...
  const r = {
    _isRef: true,
    ...
  }
  return r
}
```

## toRef
返回新对象,对象的属性为Ref包装类型,并value属性对应源响应式对象下属性的值

```
export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  ...
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key) //遍历传人对象key，注入Ref数据
  }
  return ret
}

//提供给toRefs函数创建Ref数据类型方法
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
```

## ref
reactive方法局限在，它只能创建object类型响应式数据，   
所以Vue编写ref方法为基本类型创建响应式数据。

```
export function ref(raw?: unknown) {
  ...
  //如果参数是引用类型，使用reactive将劫持key层级数据变成响应式
  raw = convert(raw)
  //如果是基本类型 直接使用get/set代理
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

const convert = <T extends unknown>(val: T): T =>
  isObject(val) ? reactive(val) : val
```