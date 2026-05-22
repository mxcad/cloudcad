import { MxFun, store } from "mxdraw"

let commands: { cmd: string, fun: Function }[] = []
export const registerCommand = () => {
  while (commands.length !== 0) {
    const obj = commands.pop()
    if (obj) {
      const { cmd, fun } = obj
      MxFun.addCommand(cmd, fun)
    }
  }
}

export const addCommand = (cmd: string, fun: Function) => {
  (store.state.MxFun !== null) ? MxFun.addCommand(cmd, fun) : commands.push({ cmd, fun })
}
export const callCommand = MxFun.sendStringToExecute.bind(MxFun)
