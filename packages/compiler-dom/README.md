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

根节点的AST树很明了，重点是children节点生成逻辑   

```
//打开parseChildren方法

function parseChildren(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  const parent = last(ancestors)
  const ns = parent ? parent.ns : Namespaces.HTML
  const nodes: TemplateChildNode[] = []

  ...
  ...

  return removedWhitespace ? nodes.filter(node => node !== null) : nodes
}
```
使用nodes保存template的node子节点。

```

function parseChildren(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  ...
  ...

  while (!isEnd(context, mode, ancestors)) {
    __DEV__ && assert(context.source.length > 0)
    const s = context.source
    let node: TemplateChildNode | TemplateChildNode[] | undefined = undefined

    if (!context.inPre && startsWith(s, context.options.delimiters[0])) {
      // '{{'
      node = parseInterpolation(context, mode)
    } else if (mode === TextModes.DATA && s[0] === '<') {
      // https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
      if (s.length === 1) {
        emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 1)
      } else if (s[1] === '!') {
        // https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
        if (startsWith(s, '<!--')) { //注释
          node = parseComment(context)
        } else if (startsWith(s, '<!DOCTYPE')) { //DTD
          // Ignore DOCTYPE by a limitation.
          node = parseBogusComment(context)
        } else if (startsWith(s, '<![CDATA[')) { //xml
          if (ns !== Namespaces.HTML) {
            node = parseCDATA(context, ancestors)
          } else {
            emitError(context, ErrorCodes.CDATA_IN_HTML_CONTENT)
            node = parseBogusComment(context)
          }
        } else {
          emitError(context, ErrorCodes.INCORRECTLY_OPENED_COMMENT)
          node = parseBogusComment(context)
        }
      } else if (s[1] === '/') {
        // https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state
        if (s.length === 2) {
          emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 2)
        } else if (s[2] === '>') {
          emitError(context, ErrorCodes.MISSING_END_TAG_NAME, 2)
          advanceBy(context, 3)
          continue
        } else if (/[a-z]/i.test(s[2])) {
          emitError(context, ErrorCodes.X_INVALID_END_TAG)
          parseTag(context, TagType.End, parent)
          continue
        } else {
          emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 2)
          node = parseBogusComment(context)
        }
      } else if (/[a-z]/i.test(s[1])) {
        node = parseElement(context, ancestors)
      } else if (s[1] === '?') {
        emitError(
          context,
          ErrorCodes.UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME,
          1
        )
        node = parseBogusComment(context)
      } else {
        emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 1)
      }
    }
    if (!node) {
      node = parseText(context, mode)
    }

    if (isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        pushNode(nodes, node[i])
      }
    } else {
      pushNode(nodes, node)
    }
  }

  ...
  ...
  return removedWhitespace ? nodes.filter(node => node !== null) : nodes
}


function advanceBy(context: ParserContext, numberOfCharacters: number): void {
  const { source } = context
  __DEV__ && assert(numberOfCharacters <= source.length)
  advancePositionWithMutation(context, source, numberOfCharacters)
  context.source = source.slice(numberOfCharacters)
}
```
在while中解析，并通过多个判断执行对应parse方法，advanceBy方法推动解析。