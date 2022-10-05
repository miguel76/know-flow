import { Algebra, Factory } from 'sparqlalgebrajs-input'
import { Bindings, BindingsStream } from '@comunica/types'
import * as RDF from '@rdfjs/types'
import { ArrayIterator, SingletonIterator, UnionIterator } from 'asynciterator'
import { Map } from 'immutable'

const algebraFactory = new Factory()
const dataFactory = algebraFactory.dataFactory

/** A sequence of bindings to be read, defined to be compatible with
 * {@link @comunica/types#IActorQueryOperationOutputBindings}, the return type
 * for SPARQL SELECT queries in Comunica.
 * The actual sequence is represented as a stream in the field `bindingStream`. */
export interface Table {
  /** The sequence of bindings as a stream. */
  bindingsStream: BindingsStream
  /** Names of the used variables. */
  variables: string[]
  /** True iff there are some bindings for which some variables can be undefined
   * (not bound). */
  canContainUndefs: boolean
}

/** A sequence of bindings already read, internally represented through JSON
 * notation. */
export interface TableSync {
  /** The sequence of bindings as an array of dictionary objects containing
   * variable names as keys and RDF terms as objects */
  bindingsArray: { [varname: string]: RDF.Literal | RDF.NamedNode }[]
  /** Names of the used variables. */
  variables: string[]
  /** True iff there are some bindings for which some variables can be undefined
   * (not bound). */
  canContainUndefs: boolean
}

export function syncTable(table: Table, limit?: number): Promise<TableSync> {
  return new Promise<TableSync>((resolve, reject) => {
    const bindingsArray: { [varname: string]: RDF.Literal | RDF.NamedNode }[] =
      []
    const bindingsStream =
      limit === undefined
        ? table.bindingsStream
        : table.bindingsStream.take(limit)
    bindingsStream.on('data', (bindings: Bindings) => {
      bindingsArray.push(Object.fromEntries(<any>bindings))
    })
    bindingsStream.on('end', () => {
      bindingsStream.close()
      resolve({
        variables: table.variables,
        bindingsArray,
        canContainUndefs: table.canContainUndefs
      })
    })
    bindingsStream.on('error', (error) => {
      bindingsStream.close()
      reject(error)
    })
  })
}

export function cloneTable(originalTable: Table): Table {
  return {
    bindingsStream: originalTable.bindingsStream.clone(),
    variables: originalTable.variables,
    canContainUndefs: originalTable.canContainUndefs
  }
}

export async function fromTableToValuesOp(
  table: Table
): Promise<Algebra.Values> {
  return algebraFactory.createValues(
    table.variables.map((varname) =>
      dataFactory.variable(varname.substring(1))
    ),
    (await syncTable(table)).bindingsArray
  )
}

export function oneTupleTable(
  variables: string[],
  bindings: Bindings,
  canContainUndefs: boolean
): Table {
  return {
    bindingsStream: new SingletonIterator<Bindings>(bindings),
    variables,
    canContainUndefs
  }
}

export function noBindingSingletonTable() {
  return oneTupleTable([], Map<string, RDF.Term>({}), false)
}

function arrayUnion<T>(arrays: T[][]): T[] {
  return arrays.reduce((vars, newVars) =>
    vars.concat(newVars.filter((v) => !vars.includes(v)))
  )
}

export function tableUnion(tables: Table[]): Table {
  return {
    bindingsStream: new UnionIterator<Bindings>(
      tables.map((t) => t.bindingsStream)
    ),
    variables: arrayUnion(tables.map((t) => t.variables)),
    canContainUndefs: tables.some((t) => t.canContainUndefs)
  }
}

export function tableFromArray(
  bindingsArray: { [varname: string]: RDF.Term }[]
): Table {
  const variables = arrayUnion(bindingsArray.map((a) => Object.keys(a)))
  return {
    variables,
    bindingsStream: new ArrayIterator(bindingsArray.map((obj) => Map(obj))),
    canContainUndefs: bindingsArray.some((b) =>
      variables.some((v) => !(v in b))
    )
  }
}
