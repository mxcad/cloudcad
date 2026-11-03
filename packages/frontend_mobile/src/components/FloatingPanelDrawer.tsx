import { defineComponent, h, type PropType } from "vue";
import { FloatingPanel, Icon } from "vant";

const headerStyle = { position: "relative" };

const closeBtnStyle = {
  position: "absolute",
  right: "8px",
  top: "0",
  bottom: "0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  cursor: "pointer",
  color: "#c8c9cc",
};

/**
 * 底部抽屉（Vant FloatingPanel 封装）
 *
 * 保留默认拖拽把手，并在右上角提供一个关闭按钮，点击触发 `close` 事件。
 * 供图层、查找文字结果等使用同一抽屉样式的场景复用，避免各自重复实现。
 *
 * 注意：项目 .tsx 未启用全局 JSX.IntrinsicElements，原生标签须用 h() 渲染，
 * 组件标签（FloatingPanel/Icon）可直接使用 JSX。
 */
export const FloatingPanelDrawer = defineComponent({
  name: "FloatingPanelDrawer",
  props: {
    height: { type: Number as PropType<number>, default: 0 },
    anchors: { type: Array as PropType<number[]>, default: () => [] },
    contentDraggable: { type: Boolean, default: false },
    panelStyle: { type: String as PropType<string>, default: "" },
    closeable: { type: Boolean, default: true },
  },
  emits: ["close", "update:height"],
  setup(props, { emit, slots }) {
    const renderHeader = () =>
      h("div", { class: "van-floating-panel__header", style: headerStyle }, [
        h("div", { class: "van-floating-panel__header-bar" }),
        props.closeable
          ? h(
              "div",
              {
                class: "floating-panel-drawer__close",
                style: closeBtnStyle,
                onClick: (event: MouseEvent) => {
                  event.stopPropagation();
                  emit("close");
                },
              },
              [h(Icon, { name: "cross", size: "18" })]
            )
          : null,
      ]);

    return () => (
      <FloatingPanel
        height={props.height}
        anchors={props.anchors}
        content-draggable={props.contentDraggable}
        style={props.panelStyle}
        onUpdate:height={(value: number) => emit("update:height", value)}
      >
        {{
          header: renderHeader,
          default: slots.default,
        }}
      </FloatingPanel>
    );
  },
});
