### Lifecycle Events

Use `v-on:mount` and `v-on:unmount` for lifecycle events:

It can run functions as well!

```html
<div
  v-if="show"
  v-on:mount="console.log('mounted on: ', $el)"
  v-on:unmount="console.log('unmounted: ', $el)"
></div>

<div v-on:mount="function() { console.log('Mounted!');msg2='function ran on:mount'} ">
  {{msg2}}
</div>
```

### `v-effect`

Use `v-effect` to execute **reactive** inline statements:

```html
<div v-scope="{ count: 0 }">
  <div v-effect="$el.textContent = count"></div>
  <button @click="count++">++</button>
</div
```
### Vue Compatible

- `{{ }}` text bindings (configurable with custom delimiters)
- `v-bind` (including `:` shorthand and class/style special handling)
- `v-on` (including `@` shorthand and all modifiers)
- `v-model` (all input types + non-string `:value` bindings)
- `v-if` / `v-else` / `v-else-if`
- `v-for`
- `v-show`
- `v-html`
- `v-text`
- `v-pre`
- `v-once`
- `v-cloak`
