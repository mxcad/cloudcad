import { App } from "vue";
import globalComponents from "./globalComponents";
export default {
    install(app:App) {
        app.use(globalComponents)
    }
}