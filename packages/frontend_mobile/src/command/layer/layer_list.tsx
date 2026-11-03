import { addCommand } from "@/plugins/mxcad/command";
import { createVNode, defineComponent, h, onMounted, ref, render } from "vue";
import { Row, Col, Icon } from "vant";
import { onClickOutside } from "@vueuse/core";
import { MxCpp } from "mxcad";
import { currentLayerNameHistoryState } from "./currentLayerNameHistoryState";
import { FloatingPanelDrawer } from "@/components/FloatingPanelDrawer";

const anchors = new Array(7).fill(0).map((_, index) => {
  if (index === 0) return 100;
  return Math.round(0.1 * index * window.innerHeight);
});
const height = ref(anchors[0]);
const el = ref<InstanceType<typeof FloatingPanelDrawer>>();
export interface Layer {
  name: string;
  off: number;
  locked: number;
  plottable: number;
  linetypename: string;
  color: { red: number; green: number; blue: number };
  id: number;
  linetypeid: number
}
const layerListData = ref<Layer[]>([])
const currentLayerName = ref<string>("")
const setCurrentLayerName = (name: string)=> {
  if(currentLayerName.value !== name) currentLayerNameHistoryState.value.push(name)
  currentLayerName.value = name
  const database =  MxCpp.getCurrentDatabase()
  database.setCurrentlyLayerName(name)
}
const setData = <K extends keyof Layer>(item: Layer, propName: K, val: Layer[K])=> {
  if (Reflect.has(item, propName)) { // ‍  确保属性存在
// ‍ Ensure the existence of attributes

    item[propName] = val; 
    const database =  MxCpp.getCurrentDatabase()
    database.getLayerTable().setJson(JSON.stringify(layerListData.value))
    MxCpp.getCurrentMxCAD().updateLayerDisplayStatus();
    MxCpp.getCurrentMxCAD().updateDisplay()
  } else {
    throw new Error(`Property '${String(propName)}' does not exist on type 'Layer'.`);
  }
}

const showLayerList = ()=> {
  const LayerList = defineComponent({
    setup(props, context) {
      // ‍  返回用于渲染的数据或组件
// ‍ Return data or components used for rendering

      return ()=> (
        <FloatingPanelDrawer
          ref={el}
          v-model:height={height.value}
          anchors={anchors}
          content-draggable={false}
          panel-style="--van-floating-panel-background: #3C3C3C"
          onClose={closePanel}
        >
          { layerListData.value.map((item)=> (
              <Row class="layer_list_item" key={item.id} onClick={()=> setData(item, "off", item.off === 1 ? 0 : 1)}>
                <Col span={3}><Icon onClick={(event: MouseEvent)=> {event.stopPropagation();setCurrentLayerName(item.name)}} name={currentLayerName.value !== item.name ? "./mxcustomui/layer/tc_ic_tc_off.png" : "./mxcustomui/layer/tc_ic_tc_on.png" }></Icon></Col>
                <Col span={3}><Icon name={item.off === 1 ? "./mxcustomui/layer/tc_ic_xs_off.png" :"./mxcustomui/layer/tc_ic_xs_on.png" }></Icon></Col>
                <Col span={3}><Icon onClick={()=> {event?.stopPropagation(); setData(item, "locked", item.locked === 1 ? 0 : 1)}} name={item.locked === 0 ? "./mxcustomui/layer/tc_ic_suo_off.png" : "./mxcustomui/layer/tc_ic_suo_on.png"}></Icon></Col>
                <Col class="layer_list_item_name">{ item.name }</Col>
              </Row>
          )) }
        </FloatingPanelDrawer>
      );
    },
  });
  
  vNode = createVNode(
    h(() => (
      <LayerList></LayerList>
    ))
  );
  render(vNode, document.body);
  setTimeout(() => {
    cancel && cancel();
    cancel = onClickOutside(el.value?.$el, () => {
      closePanel();
    });
  }, 500);
  
}

let cancel!: () => void;
let vNode: ReturnType<typeof createVNode> | null = null;

const closePanel = () => {
  vNode?.el && vNode.el.remove();
  vNode = null;
  cancel && cancel();
};

async function layer_list() {
  const database =  MxCpp.getCurrentDatabase()
  const json = database.getLayerTable().getJson()
  layerListData.value = JSON.parse(json)
  currentLayerName.value = database.getCurrentlyLayerName()
  showLayerList()
}

addCommand("layer_list", layer_list);
