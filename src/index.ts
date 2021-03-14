import Vue from 'vue';

type ExtensionCallback = (context: StartupContext, obj: any) => void;

/**
 * Define a plugin module
 */
interface Module {
    // This Module's Name
    name: string;
    // Depends on which module (names / actual module object)
    dependsOn?: Array<string | Module>;
    extensionPoints?: object;
    extensions?: object;
    // Startup Code
    start?: (context: StartupContext) => void;
}

/**
 * Used to start the framework
 */
interface ModuleConfig {
    modules: Array<Module>;
    config?: object;
}

class StartupContext {
    vue: Vue;
    vueModx: object;
    registry: PluginRegistry;
    config?: object;
    constructor(vue: Vue, vueModx: object, registry: PluginRegistry, config?: object) {
        this.vue = vue;
        this.vueModx = vueModx;
        this.registry = registry;
        this.config = config;
    }
}

/**
 * The core framework is to provide a plugin registry
 */
class PluginRegistry {

    extensionCallbacks: Map<string, ExtensionCallback>;
    moduleVariables: Map<string, Map<string, any>>;
    config: object;

    constructor(config) {
        this.extensionCallbacks = new Map<string, ExtensionCallback>();
        this.moduleVariables = new Map<string, Map<string, any>>();
        this.config = config;
    }

    registerExtensionPoint(extensionPointName: string, extensionCallback: ExtensionCallback) {
        this.extensionCallbacks[extensionPointName] = extensionCallback;
    }

    registerExtension(extensionPointName: string, obj: any): ((context: StartupContext) => void) {
        if (this.extensionCallbacks[extensionPointName]) {
            return (context) => this.extensionCallbacks[extensionPointName](context, obj);
        } else {
            console.log("Invalid Extension Point: ", extensionPointName);
        }
    }

    moduleVarAppend(moduleName: string, varname: string, obj: any) {
        if (!this._ensureMod(moduleName)[varname]) {
            this.moduleVariables[moduleName][varname] = [obj];
        } else {
            this.moduleVariables[moduleName][varname].push(obj);
        }
    }

    moduleVarSet(moduleName: string, varname: string, obj: any) {
        this._ensureMod(moduleName)[varname] = obj;
    }

    moduleVarGet(moduleName: string, varname: string) {
        return this._ensureMod(moduleName)[varname];
    }

    configGet(varname: string): any {
        return this.config[varname];
    }

    _ensureMod(moduleName: string) {
        if (!this.moduleVariables[moduleName]) {
            this.moduleVariables[moduleName] = new Map<string, any>();
        }
        return this.moduleVariables[moduleName];
    }

}

/**
 * as module dependsOn may contain Module object, expand and make dependsOn string array again.
 * 
 * @param modules 
 */
function standardize(modules: Array<Module>): Array<Module> {
    let result = [];
    let names = [];
    for (var m of modules) {
        const exp = expand(m)
        for (var ins of exp) {
            if (names.find(n => n === ins.name)) {
                console.log('% module name' + ins.name + 'already exists', 'color: #f70303')
                continue
            } else {
                names.push(ins.name)
                result.push(ins)
            }
        }
    }
    return result;
}

function expand(module: Module): Array<Module> {
    let result = [];
    if (module) {

        if (module.dependsOn) {

            const deps = module.dependsOn;
            // 找出dependsOn集合中不是字符串的依赖
            const modDeps = deps.filter(m => typeof m !== 'string') as Module[];
            // 递归查找dependsOn
            result = result.concat(standardize(modDeps))
            const stringDeps = module.dependsOn.map(m => {
                if (typeof m === 'string') {
                    return m;
                } else {
                    return (m as Module).name;
                }
            })

            module.dependsOn = stringDeps; // fix as string dependencies
        }
        result.push(module)
    }
    return result
}

/**
 * Used to calculate startup sequence using the dependsOn specification
 * 
 * @param modules 
 */
export function calculateStartupSeq(modules: Array<Module>): Array<Module> {

    let rootModules = []; // push Module if no deps related
    let rootKeys = []; // root module keys
    let remainModules = standardize(modules);

    do {

        let progress = false;
        remainModules.forEach(m => {
            if (m.dependsOn == null || m.dependsOn.length == 0 || m.dependsOn.every(dep => rootKeys.find(x => dep === x))) {
                rootModules.push(m);
                rootKeys.push(m.name);
                progress = true;
            }
        });
        remainModules = remainModules.filter(m => rootKeys.indexOf(m.name) == -1);

        if (remainModules.length > 0 && !progress) {
            let moduleNames = remainModules.map(m => m.name);
            let missing = [].concat(...remainModules.map(m => m.dependsOn.filter(n => !rootKeys.includes(n)))) //
                .filter(m => !moduleNames.includes(m)) //
                .filter((el, i, arr) => arr.indexOf(el) === i); // dedup
            let base = remainModules.filter(m => m.dependsOn.find(m => missing.includes(m))) //
                .map(m => m.name) //
                .filter((el, i, arr) => arr.indexOf(el) === i); // dedup
            throw "Unresolved Dependencies for " + base + " (missing: " + missing + ")";
        }

    } while (remainModules.length > 0)

    return rootModules;
}

let modules = null;

const plugin = {
    install(Vue, ops: ModuleConfig = { modules: [], config: {} }) {
        let registry = new PluginRegistry(ops.config);
        Vue.prototype.$pluginConfig = ops.config;
        Vue.prototype.$pluginRegistry = registry;
        let startupSeq = calculateStartupSeq(ops.modules);
        modules = startupSeq;

        const context = new StartupContext(Vue, this, registry, ops.config);
        startupSeq.forEach(mod => {
            if (mod.extensionPoints) {
                for (const k in mod.extensionPoints) {
                    registry.registerExtensionPoint(k, mod.extensionPoints[k]);
                }
            }
            if (mod.extensions) {
                for (const k in mod.extensions) {
                    const ext = mod.extensions[k];
                    if (typeof ext === 'function') {
                        registry.registerExtension(k, ext(context))(context);
                    } else {
                        registry.registerExtension(k, ext)(context);
                    }
                }
            }
        })
        startupSeq.forEach(mod => {
            // start module (if any)
            if (mod.start) {
                mod.start(context)
            }
        });
    },
    modules() {
        return modules;
    },
    moduleByName(name: string) {
        if (modules) {
            return modules.find(m => m.name === name);
        }
        return undefined;
    }
}

export default plugin;
