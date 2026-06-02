import type { VNode, Ref } from 'vue'

declare global {
  namespace JSX {
    type Element = VNode
    interface IntrinsicElements {
      [elem: string]: any
    }
    interface ElementChildrenAttribute {
      children: any
    }
  }
}

declare module 'vue' {
  type JSXComponent<Props = any> = { new(): { $props: Props } } | ((props: Props) => any)
}

export {}
