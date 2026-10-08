import type { IVoerkaI18nStorage } from "@voerkai18n/runtime"
import { read, write, erase } from "@/lib/browserStorage"

export default {
    get(key:string){
        return read(key)
    },
    set(key:string,value:any){
        write(key,value)
    },
    remove(key:string){
        erase(key)
    }
} as IVoerkaI18nStorage
