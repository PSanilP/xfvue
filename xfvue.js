//hariOm
var xfvue = function (exports) {
    "use strict";

    // --- Core Utilities ---
    const objectAssign = Object.assign;
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    const hasOwn = (obj, key) => hasOwnProperty.call(obj, key);
    const isArray = Array.isArray;
    const isMap = val => toRawType(val) === "[object Map]";
    const isDate = val => toRawType(val) === "[object Date]";
    const isString = val => typeof val === "string";
    const isSymbol = val => typeof val === "symbol";
    const isObject = val => val !== null && typeof val === "object";
    const objectToString = Object.prototype.toString;
    const toRawType = val => objectToString.call(val);
    const isIntegerKey = val => isString(val) && "NaN" !== val && "-" !== val[0] && "" + parseInt(val, 10) === val;
    const memoize = (fn) => {
        const cache = Object.create(null);
        return (key) => cache[key] || (cache[key] = fn(key));
    };
    const KEBAB_CASE_REGEX = /-(\w)/g;
    const camelize = memoize(str => str.replace(KEBAB_CASE_REGEX, (_, char) => char ? char.toUpperCase() : ""));
    const CAMEL_CASE_REGEX = /\B([A-Z])/g;
    const hyphenate = memoize(str => str.replace(CAMEL_CASE_REGEX, "-$1").toLowerCase());
    const looseToNumber = val => {
        const num = isString(val) ? Number(val) : NaN;
        return isNaN(num) ? val : num;
    };

    // --- Style & Class Normalization ---
    function normalizeStyle(value) {
        if (isArray(value)) {
            const styleObject = {};
            for (let i = 0; i < value.length; i++) {
                const styleItem = value[i];
                const parsed = isString(styleItem) ? parseStyleString(styleItem) : normalizeStyle(styleItem);
                if (parsed)
                    for (const key in parsed) styleObject[key] = parsed[key]
            }
            return styleObject
        }
        return isString(value) || isObject(value) ? value : void 0
    }
    const STYLE_SEMICOLON_REGEX = /;(?![^(]*\))/g;
    const STYLE_COLON_REGEX = /:([^]+)/;
    const STYLE_COMMENT_REGEX = /\/\*[^]*?\*\//g;

    function parseStyleString(cssText) {
        const styleObject = {};
        return cssText.replace(STYLE_COMMENT_REGEX, "").split(STYLE_SEMICOLON_REGEX).forEach((item => {
            if (item) {
                const parts = item.split(STYLE_COLON_REGEX);
                parts.length > 1 && (styleObject[parts[0].trim()] = parts[1].trim())
            }
        })), styleObject
    }

    function normalizeClass(value) {
        let classText = "";
        if (isString(value)) classText = value;
        else if (isArray(value))
            for (let i = 0; i < value.length; i++) {
                const itemClass = normalizeClass(value[i]);
                itemClass && (classText += itemClass + " ")
            } else if (isObject(value))
            for (const key in value) value[key] && (classText += key + " ");
        return classText.trim()
    }

    // --- Deep Equality Comparison ---
    function looseEqual(a, b) {
        if (a === b) return !0;
        let isDateA = isDate(a),
            isDateB = isDate(b);
        if (isDateA || isDateB) return !(!isDateA || !isDateB) && a.getTime() === b.getTime();
        if (isDateA = isSymbol(a), isDateB = isSymbol(b), isDateA || isDateB) return a === b;
        if (isDateA = isArray(a), isDateB = isArray(b), isDateA || isDateB) return !(!isDateA || !isDateB) && function (arrA, arrB) {
            if (arrA.length !== arrB.length) return !1;
            let isEqual = !0;
            for (let i = 0; isEqual && i < arrA.length; i++) isEqual = looseEqual(arrA[i], arrB[i]);
            return isEqual
        }(a, b);
        if (isDateA = isObject(a), isDateB = isObject(b), isDateA || isDateB) {
            if (!isDateA || !isDateB) return !1;
            if (Object.keys(a).length !== Object.keys(b).length) return !1;
            for (const key in a) {
                const hasOwnA = a.hasOwnProperty(key),
                    hasOwnB = b.hasOwnProperty(key);
                if (hasOwnA && !hasOwnB || !hasOwnA && hasOwnB || !looseEqual(a[key], b[key])) return !1
            }
        }
        return String(a) === String(b)
    }

    function looseIndexOf(arr, val) {
        return arr.findIndex((item => looseEqual(item, val)))
    }

    // --- Core Reactivity System ---
    function trackEffectInParentContext(effect, context) {
        context && context.active && context.effects.push(effect)
    }
    const createDep = (effects) => {
        const dep = new Set(effects);
        return dep.w = 0, dep.n = 0, dep
    };
    const wasTracked = dep => (dep.w & trackOpBit) > 0;
    const newlyTracked = dep => (dep.n & trackOpBit) > 0;
    const targetMap = new WeakMap;
    let effectStackDepth = 0;
    let trackOpBit = 1;
    let activeEffect;
    const ITERATE_KEY = Symbol("");
    const MAP_KEY_ITERATE_KEY = Symbol("");

    class ReactiveEffect {
        constructor(fn, scheduler = null, context) {
            this.fn = fn;                     // The reactive function to run
            this.scheduler = scheduler;      // Optional scheduler for deferred execution
            this.active = true;              // Indicates if the effect is still active
            this.deps = [];                  // List of dependencies this effect is tracking
            this.parent = undefined;         // Parent effect in nested execution

            // Register this effect in the provided context (if any)
            trackEffectInParentContext(this, context);
        }

        run() {
            // If the effect is inactive, just run the function directly
            if (!this.active) return this.fn();

            // Prevent recursive execution of the same effect
            let current = activeEffect;
            const previousShouldTrack = shouldTrack;

            while (current) {
                if (current === this) return;
                current = current.parent;
            }

            try {
                // Set up tracking context
                this.parent = activeEffect;
                activeEffect = this;
                shouldTrack = true;

                // Assign a unique bit for this effect in the tracking stack
                trackOpBit = 1 << ++effectStackDepth;

                // If stack depth is within safe bounds, mark dependencies as "was tracked"
                if (effectStackDepth <= 30) {
                    const { deps } = this;
                    for (let i = 0; i < deps.length; i++) {
                        deps[i].w |= trackOpBit; // Mark as previously tracked
                    }
                } else {
                    // If too deep, clean up dependencies instead
                    cleanupEffect(this);
                }

                // Execute the reactive function
                return this.fn();
            } finally {
                // Finalize tracking and cleanup
                if (effectStackDepth <= 30) {
                    const { deps } = this;
                    let newDepsIndex = 0;

                    for (let i = 0; i < deps.length; i++) {
                        const dep = deps[i];

                        // Remove effect from dep if it was tracked but not newly tracked
                        if (wasTracked(dep) && !newlyTracked(dep)) {
                            dep.delete(this);
                        } else {
                            deps[newDepsIndex++] = dep;
                        }

                        // Clear tracking bits
                        dep.w &= ~trackOpBit;
                        dep.n &= ~trackOpBit;
                    }

                    deps.length = newDepsIndex;
                }

                // Restore previous tracking context
                trackOpBit = 1 << --effectStackDepth;
                activeEffect = this.parent;
                shouldTrack = previousShouldTrack;
                this.parent = undefined;

                // If stop was deferred during execution, stop now
                if (this.deferStop) this.stop();
            }
        }

        stop() {
            // If currently running, defer stopping until after execution
            if (activeEffect === this) {
                this.deferStop = true;
            } else if (this.active) {
                // Clean up dependencies and mark as inactive
                cleanupEffect(this);
                if (this.onStop) this.onStop();
                this.active = false;
            }
        }
    }

    function cleanupEffect(reactiveEffect) {
        const { deps: dependencySets } = reactiveEffect;

        if (dependencySets.length > 0) {
            for (let i = 0; i < dependencySets.length; i++) {
                dependencySets[i].delete(reactiveEffect);
            }
            dependencySets.length = 0;
        }
    }


    function stopEffect(runner) {
        runner.effect.stop()
    }
    let shouldTrack = !0;
    const shouldTrackStack = [];

    function track(target, key) {
        if (shouldTrack && activeEffect) {
            let depsMap = targetMap.get(target);
            depsMap || targetMap.set(target, depsMap = new Map);
            let dep = depsMap.get(key);
            dep || depsMap.set(key, dep = createDep());
            (function (dep) {
                let shouldAdd = !1;
                effectStackDepth <= 30 ? newlyTracked(dep) || (dep.n |= trackOpBit, shouldAdd = !wasTracked(dep)) : shouldAdd = !dep.has(activeEffect), shouldAdd && (dep.add(activeEffect), activeEffect.deps.push(dep))
            })(dep)
        }
    }

    function trigger(target, type, key, newValue) {
        const depsMap = targetMap.get(target);
        if (!depsMap) return;
        let depsToRun = [];
        if ("clear" === type) depsToRun = [...depsMap.values()];
        else if ("length" === key && isArray(target)) {
            const newLength = Number(newValue);
            depsMap.forEach(((dep, depKey) => {
                ("length" === depKey || depKey >= newLength) && depsToRun.push(dep)
            }))
        } else switch (void 0 !== key && depsToRun.push(depsMap.get(key)), type) {
            case "add":
                isArray(target) ? isIntegerKey(key) && depsToRun.push(depsMap.get("length")) : (depsToRun.push(depsMap.get(ITERATE_KEY)), isMap(target) && depsToRun.push(depsMap.get(MAP_KEY_ITERATE_KEY)));
                break;
            case "delete":
                isArray(target) || (depsToRun.push(depsMap.get(ITERATE_KEY)), isMap(target) && depsToRun.push(depsMap.get(MAP_KEY_ITERATE_KEY)));
                break;
            case "set":
                isMap(target) && depsToRun.push(depsMap.get(ITERATE_KEY))
        }
        if (1 === depsToRun.length) depsToRun[0] && triggerEffects(depsToRun[0]);
        else {
            const allEffects = [];
            for (const dep of depsToRun) dep && allEffects.push(...dep);
            triggerEffects(createDep(allEffects))
        }
    }

    function triggerEffects(dep) {
        const effects = isArray(dep) ? dep : [...dep];
        for (const effect of effects) effect.computed && runEffect(effect);
        for (const effect of effects) effect.computed || runEffect(effect)
    }

    function runEffect(effect) {
        (effect !== activeEffect || effect.allowRecurse) && (effect.scheduler ? effect.scheduler() : effect.run())
    }

    // --- Proxy Handlers & Reactive Object Creation ---
    const isSpecialGettableProperty = function (str) {
        const map = Object.create(null),
            list = str.split(",");
        for (let i = 0; i < list.length; i++) map[list[i]] = !0;
        return (val) => !!map[val]
    }("__proto__,__v_isRef,__isVue");
    const hiddenSymbolProperties = new Set(Object.getOwnPropertyNames(Symbol).filter((e => "arguments" !== e && "caller" !== e)).map((e => Symbol[e])).filter(isSymbol));
    const reactiveGet = createGetter();
    const readonlyGet = createGetter(!0);
    const arrayInstrumentations = function () {
        const instrumentations = {};
        return ["includes", "indexOf", "lastIndexOf"].forEach((key => {
            instrumentations[key] = function (...args) {
                const arr = toRaw(this);
                for (let i = 0, len = this.length; i < len; i++) track(arr, i + "");
                const res = arr[key](...args);
                return -1 === res || !1 === res ? arr[key](...args.map(toRaw)) : res
            }
        })), ["push", "pop", "shift", "unshift", "splice"].forEach((key => {
            instrumentations[key] = function (...args) {
                shouldTrackStack.push(shouldTrack), shouldTrack = !1;
                const res = toRaw(this)[key].apply(this, args);
                return function () {
                    const e = shouldTrackStack.pop();
                    shouldTrack = void 0 === e || e
                }(), res
            }
        })), instrumentations
    }();

    function hasOwn_tracked(key) {
        const target = toRaw(this);
        return track(target, key), target.hasOwnProperty(key)
    }

    function createGetter(isReadonly = !1, isShallow = !1) {
        return function get(target, key, receiver) {
            if ("__v_isReactive" === key) return !isReadonly;
            if ("__v_isReadonly" === key) return isReadonly;
            if ("__v_isShallow" === key) return isShallow;
            if ("__v_raw" === key && receiver === (isReadonly ? isShallow ? shallowReadonlyMap : readonlyMap : isShallow ? shallowReactiveMap : reactiveMap).get(target)) return target;
            const isTargetArray = isArray(target);
            if (!isReadonly) {
                if (isTargetArray && hasOwn(arrayInstrumentations, key)) return Reflect.get(arrayInstrumentations, key, receiver);
            }
            const res = Reflect.get(target, key, receiver);
            return (isSymbol(key) ? hiddenSymbolProperties.has(key) : isSpecialGettableProperty(key)) || (isReadonly || track(target, key), isShallow) ? res : isRef(res) ? isTargetArray && isIntegerKey(key) ? res : res.value : isObject(res) ? isReadonly ? readonly(res) : reactive(res) : res
        }
    }

    const mutableHandlers = {
        get: reactiveGet,
        set: function (isShallow = !1) {
            return function set(target, key, value, receiver) {
                let oldValue = target[key];
                if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) return !1;
                if (!isShallow && (!isShallowValue(value) && !isReadonly(value) && (oldValue = toRaw(oldValue), value = toRaw(value)),
                    !isArray(target) && isRef(oldValue) && !isRef(value))) return oldValue.value = value, !0;
                const hadKey = isArray(target) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key),
                    result = Reflect.set(target, key, value, receiver);
                return target === toRaw(receiver) && (hadKey ? ((e, t) => !Object.is(e, t))(value, oldValue) && trigger(target, "set", key, value) : trigger(target, "add", key, value)), result
            }
        }(),
        deleteProperty: function (target, key) {
            const hadKey = hasOwn(target, key);
            target[key];
            const result = Reflect.deleteProperty(target, key);
            return result && hadKey && trigger(target, "delete", key, void 0), result
        },
        has: function (target, key) {
            const result = Reflect.has(target, key);
            return (!isSymbol(key) || !hiddenSymbolProperties.has(key)) && track(target, key), result
        },
        ownKeys: function (target) {
            return track(target, isArray(target) ? "length" : ITERATE_KEY), Reflect.ownKeys(target)
        }
    };


    const readonlyHandlers = {
        get: readonlyGet,
        set: (e, t) => !0,
        deleteProperty: (e, t) => !0
    };
    const reactiveMap = new WeakMap;
    const shallowReactiveMap = new WeakMap;
    const readonlyMap = new WeakMap;
    const shallowReadonlyMap = new WeakMap;

    function getReactivityType(value) {
        return value.__v_skip || !Object.isExtensible(value) ? 0 : function (e) {
            switch (e) {
                case "Object":
                case "Array":
                    return 1;
                case "Map":
                case "Set":
                case "WeakMap":
                case "WeakSet":
                    return 2;
                default:
                    return 0
            }
        }(toRawType(value).slice(8, -1))
    }

    function reactive(target) {
        return isReadonly(target) ? target : createReactiveObject(target, !1, mutableHandlers, null, reactiveMap)
    }

    function readonly(target) {
        return createReactiveObject(target, !0, readonlyHandlers, null, readonlyMap)
    }

    function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers, proxyMap) {
        if (!isObject(target) || target.__v_raw && (!isReadonly || !target.__v_isReactive)) return target;
        const existingProxy = proxyMap.get(target);
        if (existingProxy) return existingProxy;
        const reactivityType = getReactivityType(target);
        if (0 === reactivityType) return target;
        const proxy = new Proxy(target, 2 === reactivityType ? collectionHandlers : baseHandlers);
        return proxyMap.set(target, proxy), proxy
    }

    function isReadonly(value) {
        return !(!value || !value.__v_isReadonly)
    }

    function toRaw(observed) {
        const raw = observed && observed.__v_raw;
        return raw ? toRaw(raw) : observed
    }

    function isRef(value) {
        return !(!value || !0 !== value.__v_isRef)
    }
    const isShallowValue = (value) => !(!value || !value.__v_isShallow);

    // --- Scheduler ---
    let isFlushing = !1;
    const queue = [];
    const resolvedPromise = Promise.resolve();
    const nextTick = fn => resolvedPromise.then(fn);
    const queueJob = job => {
        queue.includes(job) || queue.push(job), isFlushing || (isFlushing = !0, nextTick(flushJobs))
    };
    const flushJobs = () => {
        for (const job of queue) job();
        queue.length = 0, isFlushing = !1
    };

    // --- Directives Logic & Helpers ---
    const forceEnabledAttrsRegex = /^(spellcheck|draggable|form|list|type)$/;

    const bindDirective = ({
        el: targetElement,
        get: evaluateBinding,
        effect: registerReactiveEffect,
        arg: bindingKey,
        modifiers: bindingModifiers
    }) => {
        let previousValue;

        if (bindingKey === "class") {
            targetElement._class = targetElement.className;
        }

        registerReactiveEffect(() => {
            let currentValue = evaluateBinding();

            if (bindingKey) {
                if (bindingModifiers?.camel) {
                    bindingKey = camelize(bindingKey);
                }
                applyBinding(targetElement, bindingKey, currentValue, previousValue);
            } else {
                for (const key in currentValue) {
                    applyBinding(targetElement, key, currentValue[key], previousValue && previousValue[key]);
                }
                for (const key in previousValue) {
                    if (!currentValue || !(key in currentValue)) {
                        applyBinding(targetElement, key, null);
                    }
                }
            }

            previousValue = currentValue;
        });
    };

    const applyBinding = (element, key, newValue, oldValue) => {
        if (key === "class") {
            const normalizedClass = normalizeClass(element._class ? [element._class, newValue] : newValue);
            element.setAttribute("class", normalizedClass || "");
        } else if (key === "style") {
            newValue = normalizeStyle(newValue);
            const { style } = element;

            if (newValue) {
                if (isString(newValue)) {
                    if (newValue !== oldValue) {
                        style.cssText = newValue;
                    }
                } else {
                    for (const prop in newValue) {
                        setStyleProperty(style, prop, newValue[prop]);
                    }
                    if (oldValue && !isString(oldValue)) {
                        for (const prop in oldValue) {
                            if (newValue[prop] == null) {
                                setStyleProperty(style, prop, "");
                            }
                        }
                    }
                }
            } else {
                element.removeAttribute("style");
            }
        } else {
            const isSpecialAttr = element instanceof SVGElement || !(key in element) || forceEnabledAttrsRegex.test(key);

            if (isSpecialAttr) {
                if (key === "true-value") {
                    element._trueValue = newValue;
                } else if (key === "false-value") {
                    element._falseValue = newValue;
                } else if (newValue != null) {
                    element.setAttribute(key, newValue);
                } else {
                    element.removeAttribute(key);
                }
            } else {
                element[key] = newValue;
                if (key === "value") {
                    element._value = newValue;
                }
            }
        }
    };


    const importantRegex = /\s*!important$/;
    const setStyleProperty = (e, t, n) => {
        isArray(n) ? n.forEach((n => setStyleProperty(e, t, n))) : t.startsWith("--") ? e.setProperty(t, n) : importantRegex.test(n) ? e.setProperty(hyphenate(t), n.replace(importantRegex, ""), "important") : e[t] = n
    };
    const getAndRemoveAttr = (e, t) => {
        const n = e.getAttribute(t);
        return null != n && e.removeAttribute(t), n
    };
    const addEventListener = (e, t, n, s) => {
        e.addEventListener(t, n, s)
    };
    const simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/;

    const modifierKeys = ["ctrl", "shift", "alt", "meta"];
    const eventModifiers = {
        stop: e => e.stopPropagation(),
        prevent: e => e.preventDefault(),
        self: e => e.target !== e.currentTarget,
        ctrl: e => !e.ctrlKey,
        shift: e => !e.shiftKey,
        alt: e => !e.altKey,
        meta: e => !e.metaKey,
        left: e => "button" in e && 0 !== e.button,
        middle: e => "button" in e && 1 !== e.button,
        right: e => "button" in e && 2 !== e.button,
        exact: (e, t) => modifierKeys.some((n => e[`${n}Key`] && !t[n]))
    };


 
    const onDirective = ({ el, get, exp, arg, modifiers }) => {
        if (!arg) return;
        let handler;
        const isInlineFunction = exp.trim().startsWith("() =>") || exp.trim().startsWith("function");
        if (arg === "mount") {
            handler = isInlineFunction ? get(exp) : get(`() => { ${exp} }`);
            nextTick(() => handler());
            return;
        }
        const rawHandler = isInlineFunction
            ? get(exp)
            : simplePathRE.test(exp)
                ? get(`(e) => ${exp}(e)`)
                : get(`(e) => { ${exp} }`);

        if (modifiers) {
            if (arg === "click" && modifiers.right) arg = "contextmenu";
            if (arg === "click" && modifiers.middle) arg = "mouseup";

            handler = (event) => {
                const hasKeyModifiers = "key" in event && Object.keys(modifiers).some(k => !eventModifiers[k]);
                if (!("key" in event) || !hasKeyModifiers || hyphenate(event.key) in modifiers) {
                    for (const key in modifiers) {
                        const mod = eventModifiers[key];
                        if (mod && mod(event, modifiers)) return;
                    }
                    return rawHandler(event);
                }
            };
        } else {
            handler = rawHandler;
        }
        el.addEventListener(arg, handler, modifiers);
    };
   

    const textDirective = ({ el: e, get: t, effect: n }) => {
        n((() => {
            e.textContent = toString(t())
        }))
    };
    const toString = e => null == e ? "" : isObject(e) ? JSON.stringify(e, null, 2) : String(e);
    const getInputValue = e => "_value" in e ? e._value : e.value;
    const getCheckboxValue = (e, t) => {
        const n = t ? "_trueValue" : "_falseValue";
        return n in e ? e[n] : t
    };
    const onCompositionStart = e => {
        e.target.composing = !0
    };
    const onCompositionEnd = e => {
        const t = e.target;
        t.composing && (t.composing = !1, dispatchEvent(t, "input"))
    };
    const dispatchEvent = (e, t) => {
        const n = document.createEvent("HTMLEvents");
        n.initEvent(t, !0, !0), e.dispatchEvent(n)
    };
    const expressionCache = Object.create(null);
    const evaluate = (e, t, n) => evaluateAndCache(e, `return(${t})`, n);
    const evaluateAndCache = (e, t, n) => {
        const s = expressionCache[t] || (expressionCache[t] = createExpressionFunction(t));
        try {
            return s(e, n)
        } catch (r) {
            console.error(r)
        }
    };
    const createExpressionFunction = e => {
        try {
            return new Function("$data", "$el", `with($data){${e}}`)
        } catch (t) {
            return console.error(`${t.message} in expression: ${e}`), () => { }
        }
    };

    //directives
    const directives = {
        bind: bindDirective,
        on: onDirective,
        show: ({
            el: e,
            get: t,
            effect: n
        }) => {
            const s = e.style.display;
            n((() => {
                e.style.display = t() ? s : "none"
            }))
        },
        text: textDirective,
        html: ({
            el: e,
            get: t,
            effect: n
        }) => {
            n((() => {
                e.innerHTML = t()
            }))
        },
        model: ({
            el: e,
            exp: t,
            get: n,
            effect: s,
            modifiers: i
        }) => {
            const o = e.type,
                c = n(`(val) => { ${t} = val }`),
                {
                    trim: l,
                    number: f = "number" === o
                } = i || {};
            if ("SELECT" === e.tagName) {
                const t = e;
                addEventListener(e, "change", (() => {
                    const e = Array.prototype.filter.call(t.options, (e => e.selected)).map((e => f ? looseToNumber(getInputValue(e)) : getInputValue(e)));
                    c(t.multiple ? e : e[0])
                })), s((() => {
                    const e = n(),
                        s = t.multiple;
                    for (let n = 0, i = t.options.length; n < i; n++) {
                        const i = t.options[n],
                            o = getInputValue(i);
                        if (s) isArray(e) ? i.selected = looseIndexOf(e, o) > -1 : i.selected = e.has(o);
                        else if (looseEqual(getInputValue(i), e)) return void (t.selectedIndex !== n && (t.selectedIndex = n))
                    } !s && -1 !== t.selectedIndex && (t.selectedIndex = -1)
                }))
            } else if ("checkbox" === o) {
                let t;
                addEventListener(e, "change", (() => {
                    const t = n(),
                        s = e.checked;
                    if (isArray(t)) {
                        const n = getInputValue(e),
                            r = looseIndexOf(t, n),
                            i = -1 !== r;
                        if (s && !i) c(t.concat(n));
                        else if (!s && i) {
                            const e = [...t];
                            e.splice(r, 1), c(e)
                        }
                    } else c(getCheckboxValue(e, s))
                })), s((() => {
                    const s = n();
                    isArray(s) ? e.checked = looseIndexOf(s, getInputValue(e)) > -1 : s !== t && (e.checked = looseEqual(s, getCheckboxValue(e, !0))), t = s
                }))
            } else if ("radio" === o) {
                let t;
                addEventListener(e, "change", (() => {
                    c(getInputValue(e))
                })), s((() => {
                    const s = n();
                    s !== t && (e.checked = looseEqual(s, getInputValue(e)))
                }))
            } else {
                const t = e => l ? e.trim() : f ? looseToNumber(e) : e;
                addEventListener(e, "compositionstart", onCompositionStart), addEventListener(e, "compositionend", onCompositionEnd), addEventListener(e, null != i && i.lazy ? "change" : "input", (() => {
                    e.composing || c(t(e.value))
                })), l && addEventListener(e, "change", (() => {
                    e.value = e.value.trim()
                })), s((() => {
                    if (e.composing) return;
                    const s = e.value,
                        r = n();
                    document.activeElement === e && t(s) === r || s !== r && (e.value = r)
                }))
            }
        },
        effect: ({
            el: e,
            ctx: t,
            exp: n,
            effect: s
        }) => {
            nextTick((() => s((() => evaluateAndCache(t.scope, n, e)))))
        }
    };


    const forRegex = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
    const forAliasRegex = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
    const forParensRegex = /^\(|\)$/g;
    const forDestructureRegex = /^[{[]\s*((?:[\w_$]+\s*,?\s*)+)[\]}]$/;

    const forDirective = (templateEl, expression, context) => {
        const match = expression.match(/([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/);
        if (!match) return;

        const aliasRaw = match[1].trim().replace(/^\(|\)$/g, "").trim();
        const sourceExp = match[2].trim();

        const parentEl = templateEl.parentElement;
        const anchor = new Text("");
        parentEl.insertBefore(anchor, templateEl);
        parentEl.removeChild(templateEl);

        let itemAlias = aliasRaw;
        let indexAlias = null;
        let keyAlias = null;

        const aliasMatch = aliasRaw.match(/,([^,\}\]]*)(?:,([^,\}\]]*))?$/);
        if (aliasMatch) {
            itemAlias = aliasRaw.replace(/,([^,\}\]]*)(?:,([^,\}\]]*))?$/, "").trim();
            indexAlias = aliasMatch[1].trim();
            keyAlias = aliasMatch[2] ? aliasMatch[2].trim() : null;
        }

        const isDestructured = /^[{[]\s*((?:[\w_$]+\s*,?\s*)+)[\]}]$/.test(itemAlias);
        const destructuredKeys = isDestructured ? itemAlias.replace(/^[{[]|[\]}]$/g, "").split(",").map(k => k.trim()) : null;

        const keyAttr = templateEl.getAttribute("key") ||
            templateEl.getAttribute(":key") ||
            templateEl.getAttribute("v-bind:key");

        if (keyAttr) templateEl.removeAttribute("key");

        let previousBlocks = [];
        let initialized = false;

        const createScope = (value, index, key) => {
            const scopeVars = {};

            if (destructuredKeys) {
                destructuredKeys.forEach((k, i) => scopeVars[k] = value[i]);
            } else {
                scopeVars[itemAlias] = value;
            }

            if (indexAlias) scopeVars[indexAlias] = index;
            if (keyAlias) scopeVars[keyAlias] = key;

            const childContext = createChildContext(context, scopeVars);
            const blockKey = keyAttr ? evaluate(childContext.scope, keyAttr) : index;
            childContext.key = blockKey;

            return childContext;
        };

        const renderBlock = (scopeObj, insertBeforeEl) => {
            const block = new Block(templateEl, scopeObj);
            block.key = scopeObj.key;
            block.insert(parentEl, insertBeforeEl);
            return block;
        };

        context.effect(() => {
            const source = evaluate(context.scope, sourceExp);
            const newBlocksMap = new Map();
            const newScopes = [];

            if (Array.isArray(source)) {
                source.forEach((item, index) => {
                    const scopeObj = createScope(item, index);
                    newScopes.push(scopeObj);
                    newBlocksMap.set(scopeObj.key, scopeObj);
                });
            } else if (typeof source === "number") {
                for (let i = 0; i < source; i++) {
                    const scopeObj = createScope(i + 1, i);
                    newScopes.push(scopeObj);
                    newBlocksMap.set(scopeObj.key, scopeObj);
                }
            } else if (typeof source === "object") {
                let index = 0;
                for (const key in source) {
                    const scopeObj = createScope(source[key], index++, key);
                    newScopes.push(scopeObj);
                    newBlocksMap.set(scopeObj.key, scopeObj);
                }
            }

            if (initialized) {
                previousBlocks.forEach(block => {
                    if (!newBlocksMap.has(block.key)) block.remove();
                });

                const updatedBlocks = [];
                let nextEl = anchor;
                for (let i = newScopes.length - 1; i >= 0; i--) {
                    const scopeObj = newScopes[i];
                    const existingIndex = previousBlocks.findIndex(b => b.key === scopeObj.key);
                    let block;

                    if (existingIndex === -1) {
                        block = renderBlock(scopeObj, nextEl);
                    } else {
                        block = previousBlocks[existingIndex];

                        // FINAL FIX: Use `block.context` which is the correct property name on the Block class.
                        Object.assign(block.context.scope, scopeObj.scope);

                        if (previousBlocks[existingIndex + 1] !== nextEl) {
                            block.insert(parentEl, nextEl);
                        }
                    }

                    updatedBlocks.unshift(block);
                    nextEl = block.el;
                }

                previousBlocks = updatedBlocks;
            } else {
                previousBlocks = newScopes.map(scopeObj => renderBlock(scopeObj, anchor));
                initialized = true;
            }
        });

        return templateEl.nextSibling;
    };

    const refDirective = ({ el, ctx, get, effect }) => {
        const refs = ctx.scope.$refs;
        let previousRefName;
        // Reactive effect to track ref name changes
        const stopEffect = effect(() => {
            const currentRefName = get();
            // Assign the element to the current ref name
            refs[currentRefName] = el;
            // Clean up the previous ref if the name changed
            if (previousRefName && currentRefName !== previousRefName) { delete refs[previousRefName]; }
            previousRefName = currentRefName;
        });
        // Cleanup function to remove the ref when unmounted
        return () => { if (previousRefName) { delete refs[previousRefName]; } };
    };

    const directivePrefixRegex = /^(?:v-|:|@)/;
    const modifierRegex = /\.([\w-]+)/g;
    let isOnceActive = !1;


    const processNode = (e, t) => {
        const nodeType = e.nodeType;
        if (nodeType === 1) {
            const element = e;
            if (element.hasAttribute("v-pre")) return;

            let directiveValue;

            getAndRemoveAttr(element, "v-cloak");
            directiveValue = getAndRemoveAttr(element, "v-if");
            if (directiveValue) {
                return ((el, expr, ctx) => {
                    const parent = el.parentElement;
                    const anchor = new Comment("v-if");
                    parent.insertBefore(anchor, el);

                    const branches = [{ exp: expr, el }];
                    let sibling, condition;

                    while (
                        (sibling = el.nextElementSibling) &&
                        (condition = null, getAndRemoveAttr(sibling, "v-else") === "" || (condition = getAndRemoveAttr(sibling, "v-else-if")))
                    ) {
                        parent.removeChild(sibling);
                        branches.push({ exp: condition, el: sibling });
                    }

                    const nextNode = el.nextSibling;
                    parent.removeChild(el);

                    let activeBlock, activeIndex = -1;

                    const clearBlock = () => {
                        if (activeBlock) {
                            parent.insertBefore(anchor, activeBlock.el);
                            activeBlock.remove();
                            activeBlock = undefined;
                        }
                    };

                    ctx.effect(() => {
                        for (let i = 0; i < branches.length; i++) {
                            const { exp, el } = branches[i];
                            if (!exp || evaluate(ctx.scope, exp)) {
                                if (i !== activeIndex) {
                                    clearBlock();
                                    activeBlock = new Block(el, ctx);
                                    activeBlock.insert(parent, anchor);
                                    parent.removeChild(anchor);
                                    activeIndex = i;
                                }
                                return;
                            }
                        }
                        activeIndex = -1;
                        clearBlock();
                    });

                    return nextNode;
                })(element, directiveValue, t);
            }

            directiveValue = getAndRemoveAttr(element, "v-for");
            if (directiveValue) return forDirective(element, directiveValue, t);

            directiveValue = getAndRemoveAttr(element, "v-scope");
            if (directiveValue || directiveValue === "") {
                const scopeData = directiveValue ? evaluate(t.scope, directiveValue) : {};
                t = createChildContext(t, scopeData);
                if (scopeData.$template) renderTemplate(element, scopeData.$template);
            }

            const isOnce = getAndRemoveAttr(element, "v-once") != null;
            if (isOnce) isOnceActive = true;

            directiveValue = getAndRemoveAttr(element, "ref");
            if (directiveValue) applyDirective(element, refDirective, `"${directiveValue}"`, t);

            walkChildren(element, t);

            const directiveQueue = [];
            for (const { name, value } of [...element.attributes]) {
                if (directivePrefixRegex.test(name) && name !== "v-cloak") {
                    if (name === "v-model") directiveQueue.unshift([name, value]);
                    else if (name[0] === "@" || /^v-on\b/.test(name)) directiveQueue.push([name, value]);
                    else processSingleDirective(element, name, value, t);
                }
            }
            for (const [name, value] of directiveQueue) {
                processSingleDirective(element, name, value, t);
            }
            if (isOnce) isOnceActive = false;

        } else if (nodeType === 3) {
            const textContent = e.data;
            if (textContent.includes(t.delimiters[0])) {
                let match;
                const tokens = [];
                let lastIndex = 0;

                while ((match = t.delimitersRE.exec(textContent))) {
                    const staticText = textContent.slice(lastIndex, match.index);
                    if (staticText) tokens.push(JSON.stringify(staticText));
                    tokens.push(`$s(${match[1]})`);
                    lastIndex = match.index + match[0].length;
                }

                if (lastIndex < textContent.length) {
                    tokens.push(JSON.stringify(textContent.slice(lastIndex)));
                }

                applyDirective(e, textDirective, tokens.join("+"), t);
            }

        } else if (nodeType === 11) {
            walkChildren(e, t);
        }
    },
        walkChildren = (e, t) => {
            let n = e.firstChild;
            for (; n;) n = processNode(n, t) || n.nextSibling
        },
        processSingleDirective = (element, rawName, expression, context) => {
            let directiveFn;
            let argument;
            let modifiers = {};

            // Extract modifiers (e.g., .stop, .camel) and clean the directive name
            const cleanedName = rawName.replace(modifierRegex, (_, mod) => {
                modifiers[mod] = true;
                return "";
            });

            // Determine directive type
            if (cleanedName.startsWith(":")) {
                directiveFn = bindDirective;
                argument = cleanedName.slice(1);
            } else if (cleanedName.startsWith("@")) {
                directiveFn = onDirective;
                argument = cleanedName.slice(1);
            } else {
                const colonIndex = cleanedName.indexOf(":");
                const directiveName = colonIndex > 0
                    ? cleanedName.slice(2, colonIndex)
                    : cleanedName.slice(2);
                argument = colonIndex > 0 ? cleanedName.slice(colonIndex + 1) : undefined;
                directiveFn = directives[directiveName] || context.dirs[directiveName];
            }

            // Special case: v-bind:ref → refDirective
            if (directiveFn === bindDirective && argument === "ref") {
                directiveFn = refDirective;
            }

            // Apply the directive if found
            if (directiveFn) {
                applyDirective(element, directiveFn, expression, context, argument, modifiers);
                element.removeAttribute(rawName);
            }

        },
        applyDirective = (element, directiveFn, expression, context, argument, modifiers) => {
            const cleanupFn = directiveFn({
                el: element,
                get: (exp = expression) => evaluate(context.scope, exp, element),
                effect: context.effect,
                ctx: context,
                exp: expression,
                arg: argument,
                modifiers
            });

            if (cleanupFn) {
                context.cleanups.push(cleanupFn);
            }
        },
        renderTemplate = (e, t) => {
            if ("#" !== t[0]) e.innerHTML = t;
            else {
                const n = document.querySelector(t);
                e.appendChild(n.content.cloneNode(!0))
            }
        },
        createContext = (options = {}) => {
            const context = {
                delimiters: ["{{", "}}"],
                delimitersRE: /\{\{([^]+?)\}\}/g,
                ...options,
                scope: options.scope || reactive({}),
                dirs: options.dirs || {},
                effects: [],
                blocks: [],
                cleanups: [],
                effect: (fn) => {
                    if (isOnceActive) {
                        queueJob(fn);
                        return fn;
                    }

                    const wrappedEffect = (() => {
                        if (fn.effect) fn = fn.effect.fn;

                        const reactiveEffect = new ReactiveEffect(fn);

                        const effectOptions = {
                            scheduler: () => queueJob(runner)
                        };

                        Object.assign(reactiveEffect, effectOptions);

                        if (options.scope) {
                            trackEffectInParentContext(reactiveEffect, options.scope);
                        }

                        if (!effectOptions.lazy) {
                            reactiveEffect.run();
                        }

                        const runner = reactiveEffect.run.bind(reactiveEffect);
                        runner.effect = reactiveEffect;

                        return runner;
                    })();

                    context.effects.push(wrappedEffect);
                    return wrappedEffect;
                }
            };

            return context;
        },


        createChildContext = (e, t = {}) => {
            const n = e.scope,
                s = Object.create(n);
            Object.defineProperties(s, Object.getOwnPropertyDescriptors(t)), s.$refs = Object.create(n.$refs);
            const r = reactive(new Proxy(s, {
                set: (e, t, s, i) => i !== r || e.hasOwnProperty(t) ? Reflect.set(e, t, s, i) : Reflect.set(n, t, s)
            }));
            return bindScopeMethods(r), {
                ...e,
                scope: r
            }
        },
        bindScopeMethods = e => {
            for (const t of Object.keys(e)) "function" == typeof e[t] && (e[t] = e[t].bind(e))
        };





    class Block {
        get el() {
            return this.startNode || this.template;
        }

        constructor(sourceNode, contextOrParent, isRaw = false) {
            this.isFragment = sourceNode instanceof HTMLTemplateElement;

            // Clone the template or raw node
            if (isRaw) {
                this.template = sourceNode;
            } else if (this.isFragment) {
                this.template = sourceNode.content.cloneNode(true);
            } else {
                this.template = sourceNode.cloneNode(true);
            }

            // Context setup
            if (isRaw) {
                this.context = contextOrParent;
            } else {
                this.parentContext = contextOrParent;
                contextOrParent.blocks.push(this);
                this.context = createContext(contextOrParent);
            }

            // Process the template with the context
            processNode(this.template, this.context);

            // Fragment markers
            this.startNode = null;
            this.endNode = null;
        }

        insert(parentNode, anchorNode = null) {
            if (this.isFragment) {
                if (this.startNode) {
                    // Re-insert existing fragment
                    let current = this.startNode;
                    while (current) {
                        const next = current.nextSibling;
                        parentNode.insertBefore(current, anchorNode);
                        if (current === this.endNode) break;
                        current = next;
                    }
                } else {
                    // First-time fragment insertion
                    this.startNode = new Text("");
                    this.endNode = new Text("");

                    parentNode.insertBefore(this.endNode, anchorNode);
                    parentNode.insertBefore(this.startNode, this.endNode);
                    parentNode.insertBefore(this.template, this.endNode);
                }
            } else {
                parentNode.insertBefore(this.template, anchorNode);
            }
        }

        remove() {
            // Remove from parent context's block list
            if (this.parentContext) {
                const index = this.parentContext.blocks.indexOf(this);
                if (index > -1) {
                    this.parentContext.blocks.splice(index, 1);
                }
            }

            // Remove DOM nodes
            if (this.startNode) {
                const parent = this.startNode.parentNode;
                let current = this.startNode;
                while (current) {
                    const next = current.nextSibling;
                    parent.removeChild(current);
                    if (current === this.endNode) break;
                    current = next;
                }
            } else if (this.template.parentNode) {
                this.template.parentNode.removeChild(this.template);
            }

            this.teardown();
        }

        teardown() {
            this.context.blocks.forEach(block => block.teardown());
            this.context.effects.forEach(stopEffect);
            this.context.cleanups.forEach(cleanup => cleanup());
        }
    }


    const escapeRegex = e => e.replace(/[-.*+?^${}()|[\]\/\\]/g, "\\$&"),
        createApp = e => {
            const t = createContext();
            if (e && (t.scope = reactive(e), bindScopeMethods(t.scope), e.$delimiters)) {
                const [n, s] = t.delimiters = e.$delimiters;
                t.delimitersRE = new RegExp(escapeRegex(n) + "([^]+?)" + escapeRegex(s), "g")
            }
            let n;
            return t.scope.$s = toString, t.scope.$nextTick = nextTick, t.scope.$refs = Object.create(null), {
                directive(e, n) {
                    return n ? (t.dirs[e] = n, this) : t.dirs[e]
                },
                mount(e) {
                    if ("string" == typeof e && !(e = document.querySelector(e))) return;
                    let s;
                    return s = (e = e || document.documentElement).hasAttribute("v-scope") ?
                        [e] : [...e.querySelectorAll("[v-scope]")].filter((e => !e.matches("[v-scope] [v-scope]"))),
                        s.length || (s = [e]), n = s.map((e => new Block(e, t, !0))), t.scope;
                },
                unmount() {
                    n.forEach((e => e.teardown()))
                }
            }
        },
        currentScript = document.currentScript;
    return currentScript && currentScript.hasAttribute("init") && createApp().mount(),
        exports.createApp = createApp,
        exports.nextTick = nextTick,
        exports.reactive = reactive,
        exports
}({});
