# @vue/compiler-dom

## 编辑器
其作用是把template编译成render函数。

## 解析

它的入口是***compiler-dom/src/index.ts***

```
import { baseCompile, CompilerOptions, CodegenResult } from '@vue/compiler-core'
...
...

export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  return baseCompile(template, {
    ...options,
    ...(__BROWSER__ ? parserOptionsMinimal : parserOptionsStandard),
    nodeTransforms: [transformStyle, ...(options.nodeTransforms || [])],
    directiveTransforms: {
      cloak: transformCloak,
      html: transformVHtml,
      text: transformVText,
      model: transformModel, // override compiler-core
      on: transformOn,
      ...(options.directiveTransforms || {})
    }
  })
}

export * from '@vue/compiler-core'
```

入口函数基于平台特性进行封装，把平台特性的方法通过参数传入到核心方法中，核心方法在***compiler-core/src/index.ts***

```
export function baseCompile(
  template: string | RootNode,
  options: CompilerOptions = {}
): CodegenResult {
  /* istanbul ignore if */
  if (__BROWSER__) {
    const onError = options.onError || defaultOnError
    if (options.prefixIdentifiers === true) {
      onError(createCompilerError(ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED))
    } else if (options.mode === 'module') {
      onError(createCompilerError(ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED))
    }
  }

  const ast = isString(template) ? parse(template, options) : template //解析模板字符串生成 AST

  const prefixIdentifiers =
    !__BROWSER__ &&
    (options.prefixIdentifiers === true || options.mode === 'module')
  //优化语法树
  transform(ast, {
    ...options,
    prefixIdentifiers,
    nodeTransforms: [
      transformOnce,
      transformIf,
      transformFor,
      ...(prefixIdentifiers
        ? [
            // order is important
            trackVForSlotScopes,
            transformExpression
          ]
        : []),
      transformSlotOutlet,
      transformElement,
      trackSlotScopes,
      transformText,
      ...(options.nodeTransforms || []) // user transforms
    ],
    directiveTransforms: {
      on: transformOn,
      bind: transformBind,
      model: transformModel,
      ...(options.directiveTransforms || {}) // user transforms
    }
  })
 
  //生成代码
  return generate(ast, {
    ...options,
    prefixIdentifiers
  })
}
```

核心方法的主要逻辑是

1. 解析模板字符串生成 AST
2. 优化语法树
3. 生成代码

### parse

编辑过程首先对模版进行解析，生产AST，它是一个抽象语法树，是对源代码的抽象语法结构的树状表现形象。

我们看个例子

```
<ul :class="state.ulClass" class="list" v-if="state.isShow">
  <li v-for="(item,index) in state.list" @click="clickItem(index)">{{item}}:{{index}}</li>
</ul>
```
进过parse过程，生产AST如下 

```
{
  cached: 0
  children: [{…}],
  codegenNode: {type: 9, loc: {…}, branches: Array(1), codegenNode: {…}}
  components: []
  directives: []
  helpers: (7) [Symbol(openBlock), Symbol(renderList), Symbol(createBlock), Symbol(Fragment), Symbol(toString), Symbol(createVNode), Symbol(createCommentVNode)]
  hoists: []
  loc: {start: {…}, end: {…}, source: "↵  <ul :class="state.ulClass" class="list" v-if="s…lickItem(index)">{{item}}:{{index}}</li>↵  </ul>↵"}
  type: 0
}

```

生产的AST是树状结构，每个节点都是一个AST Element，     
除了自身属性外，还有**children**属性维护父子关系。   
先到AST形成印象，接下来分析AST是怎么生产的。

首先看***parse***定义，在***compiler-core/src/parse.ts***

```
export function parse(content: string, options: ParserOptions = {}): RootNode {
  const context = createParserContext(content, options)
  const start = getCursor(context)

  return {
    type: NodeTypes.ROOT,
    children: parseChildren(context, TextModes.DATA, []),
    helpers: [],
    components: [],
    directives: [],
    hoists: [],
    cached: 0,
    codegenNode: undefined,
    loc: getSelection(context, start)
  }
}
```