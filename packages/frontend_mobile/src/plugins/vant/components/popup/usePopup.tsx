import { Popup } from "vant";
import { Ref, ref, h, render, VNode, reactive, DefineComponent } from "vue";
type FilteredPerson<T> = {
    -readonly [K in keyof T as K extends `$${string}` ? never : K]: T[K];
};

type PopupProps = Partial<FilteredPerson<InstanceType<typeof Popup>>>

type SlotType = VNode | string;
export interface PopupConfig {
  /**  ‍ 是否使用单实例 */
/** ‍ Do you want to use a single instance*/

  instance?: boolean;
  props?: PopupProps;
  slots?: {
    default?: () => SlotType;
    overlayContent?: () => SlotType;
  };
}

/**  ‍ 弹框管理组件 */
/** ‍ Frame management component*/

class PopupClass {
  // ‍  单实例
// ‍ Single instance

  static _instance: PopupClass;
  _vnode!: VNode;
  _isRender!: boolean;
  private config: PopupConfig = reactive({
    instance: false,
    props: {
      show: false,
    },
    slots: {
      default: () => "",
    },
  });
  constructor(config?: PopupConfig) {
    if (config && config.instance) {
        const _instance = this.getInstance();
        if (_instance) {
          return _instance;
        }else {
            PopupClass._instance = this
        }
    }
    this.setConfig(config)
    this._isRender = false;
    this._vnode = this.createVNode();
  }
  setConfig(config?:PopupConfig) {
    if (config) {
        if (typeof config.instance !== "undefined")
          this.config.instance = config.instance;
        if (typeof config.props !== "undefined") this.config.props = config.props;
        if (typeof config.slots !== "undefined") this.config.slots = config.slots;
      }
  }
  private createVNode = () => {
    return h(() => (
      <Popup {...this.config.props} onUpdate:show={(is: boolean)=> { if(this.config.props) this.config.props.show = is }} v-slots={this.config.slots}></Popup>
    ));
  };
  show() {
    if (!this._vnode) return;
    if (this.config.props) this.config.props.show = true;
    if (!this._isRender) {
      render(this._vnode, document.body);
      this._isRender = true;
    }
  }
  public setProps(props: PopupProps) {
    if (props) this.config.props = props;
  }
  public getInstance() {
    return PopupClass._instance;
  }
}

export const usePopup = (config?: PopupConfig) => {
  return new PopupClass(config);
};
