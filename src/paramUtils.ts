import { Flow } from './flow'

export function asArray<T>(input: T | T[]): T[] {
  return Array.isArray(input) ? input : [input]
}

export function withDefaults<Type, OptionalKeys extends keyof Type>(
  defaults: Pick<Type, OptionalKeys>
): (input: Omit<Type, OptionalKeys> & Partial<Type>) => Type {
  return (input) => ({ ...defaults, ...input } as Type)
}

export type SubflowAndParams<SubflowReturnType, ParamType> =
  | Flow<SubflowReturnType>
  | ({ subflow: Flow<SubflowReturnType> } & ParamType)

export function getFlowConfig<SubflowReturnType, ParamType>(
  config: SubflowAndParams<SubflowReturnType, ParamType>
): { subflow: Flow<SubflowReturnType>; params: ParamType | {} } {
  return config instanceof Flow
    ? { subflow: config, params: {} }
    : { subflow: config.subflow, params: { ...config } }
}
