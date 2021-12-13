import { Algebra, toSparql, Factory } from 'sparqlalgebrajs'
import {
  Flow,
  ActionExecutor,
  Parallel,
  ForEach,
  Cascade,
  SingleInputDataOperation,
  MultiInputDataOperation
} from './flow'

const algebraFactory = new Factory()

export function toSparqlQuery(op: Algebra.Operation, options = {}): string {
  return toSparql(algebraFactory.createProject(op, []), options)
}

export function toSparqlFragment(op: Algebra.Operation, options = {}): string {
  const sparqlStr = toSparqlQuery(op, options)
  return sparqlStr.substring(
    'SELECT * WHERE { '.length,
    sparqlStr.length - ' }'.length
  )
}

export function stringifyFlow<ReturnType>(
  flow: Flow<ReturnType>,
  options = {}
): any {
  if (flow instanceof ActionExecutor) {
    const action = flow
    return {
      type: 'action',
      exec: action.action.toString()
    }
  } else if (flow instanceof Cascade) {
    const cascade = flow
    return {
      type: 'cascade',
      subflow: stringifyFlow(cascade.subflow, options),
      action: cascade.action.toString()
    }
  } else if (flow instanceof Parallel) {
    return {
      type: 'parallel',
      subflows: flow.subflows.map((t) => stringifyFlow(t, options))
    }
  } else if (flow instanceof ForEach) {
    return {
      type: 'for-each',
      subflow: stringifyFlow(flow.subflow)
    }
  } else if (flow instanceof SingleInputDataOperation) {
    const dataOperation = flow
    if (dataOperation.dataOperationType === 'filter') {
      const filter = dataOperation
      const filterSparql = toSparqlFragment(
        algebraFactory.createFilter(
          algebraFactory.createBgp([]),
          filter.params.expression
        ),
        options
      )
      return {
        type: 'filter',
        expression: filterSparql.substring(
          'FILTER('.length,
          filterSparql.length - ')'.length
        ),
        subflow: stringifyFlow(filter.subflow, options)
      }
    } else {
      throw new Error('Unrecognized data operation')
    }
  } else if (flow instanceof MultiInputDataOperation) {
    const dataOperation = flow
    if (dataOperation.dataOperationType === 'join') {
      const join = dataOperation
      return {
        type: 'join',
        right: join.input.map((op) => toSparqlFragment(op, options)),
        subflow: stringifyFlow(join.subflow, options)
      }
    } else {
      throw new Error('Unrecognized data operation')
    }
  } else {
    throw new Error('Unrecognized flow type')
  }
}
