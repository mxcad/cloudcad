
import { fetchServerConfig } from "./serverConfig"
import { fetchUiConfig } from "./uiConfig"

export const initConfig = async ()=> {
  await fetchUiConfig()
  await fetchServerConfig()
}
