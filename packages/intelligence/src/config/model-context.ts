import { AsyncLocalStorage } from 'node:async_hooks';
import type { ModelRole, ModelRoute } from './model-roles';
import type { CompletionTarget } from './ensemble';

export interface ModelRoutingContext {
  routes: Partial<Record<ModelRole, ModelRoute>>;
  ensemble?: CompletionTarget | null;
}
const routing = new AsyncLocalStorage<ModelRoutingContext>();

export function currentModelRouting() { return routing.getStore(); }

/** Isolate a workflow's model choices without changing process configuration or concurrent workflows. */
export function withModelRouting<T>(context: ModelRoutingContext, action: () => T): T {
  const parent = routing.getStore();
  const routes = Object.fromEntries(Object.entries({ ...parent?.routes, ...context.routes })
    .map(([role, route]) => [role, Object.freeze({ ...route })])) as ModelRoutingContext['routes'];
  return routing.run({ ...parent, ...context, routes: Object.freeze(routes) }, action);
}
