import * as RDF from 'rdf-js'
import { Table, TableSync, syncTable } from './table'
import { Action, Flow } from './flow'
import { Bindings } from '@comunica/types'
import { Map } from 'immutable'
import { DEFAULT_INPUT_VARNAME } from './constants'

type ValueOf<T> = T[keyof T];

/**
 * Creates an Action that returns a constant value.
 * @param value - Value to be returned.
 * @returns The new Action.
 */
export function constant<ReturnType>(
  value: ReturnType
): Action<void, ReturnType> {
  return () => value
}

/**
 * Creates an Action that calls an inner action on the entire input sequence.
 * @param action - Action executed on the whole input sequence.
 * @returns The new Action.
 */
export function onAll<ReturnType>(
  fun: Action<TableSync, ReturnType>
): Action<Table, ReturnType> {
  return async (table: Table) => fun(await syncTable(table))
}

/**
 * Creates an Action that calls an inner action on the entire input sequence.
 * @param action - Action executed on the whole input sequence.
 * @returns The new Action.
 */
 export function onThisVariables<ReturnType, VarnameSet extends string>(
  varnames: VarnameSet[],
  fun: Action<Map<VarnameSet,RDF.Term>, ReturnType>
): Flow<ReturnType> {

  return async (table: Table) => fun(await syncTable(table))
}

/**
 * Creates an Action that calls an inner action on the first binding
 * of the sequence, ignoring the rest.
 * @param action - Action executed on the first binding.
 * @returns The new Action.
 */
export function onFirst<ReturnType>(
  action: Action<Bindings, ReturnType>,
  acceptEmpty: boolean = true
): Action<Table, ReturnType> {
  return async (table) => {
    const oneTuple = await syncTable(table, 1)
    let bindings: Bindings
    if (oneTuple.bindingsArray.length === 0) {
      if (acceptEmpty) {
        bindings = Map<string, RDF.Term>({})
      } else {
        throw new Error('Expected at least a value, zero found')
      }
    } else {
      bindings = Map<string, RDF.Term>(oneTuple.bindingsArray[0])
    }
    return action(bindings)
  }
}

/**
 * Creates an Action that calls an inner action on the value of the default
 * variable in  the first binding of the sequence, ignoring the rest.
 * @param action - Action executed on the value.
 * @returns The new Action.
 */
export function onFirstDefault<ReturnType>(
  action: Action<RDF.Term, ReturnType>
): Action<Table, ReturnType> {
  return onFirst(async (bindings: Bindings) => action(bindings.get(DEFAULT_INPUT_VARNAME)))
}
