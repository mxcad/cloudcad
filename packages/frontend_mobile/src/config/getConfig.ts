

const configMap = new Map()
export const getConfig = async <T = Object>(url: string)=> {
  if(configMap.has(url)) {
    return configMap.get(url) as T
  }else {
    try {
      const config = await (await fetch(url)).json()
      configMap.set(url, config)
      return config as T
    } catch(e) {
      console.error("error Config:" + url, e)
    }
  }
}
