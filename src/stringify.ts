import { Algebra, toSparql, Factory } from 'sparqlalgebrajs'
import {
  Flow,
  ActionExecutor,
  Parallel,
  ForEach,
  Join,
  Filter,
  Cascade,
  Let
} from './flow'
import { Wildcard } from 'sparqljs'

const algebraFactory = new Factory()
const WILDCARD = new Wildcard()

export function toSparqlQuery(op: Algebra.Operation, options = {}): string {
  return toSparql(algebraFactory.createProject(op, [WILDCARD]), options)
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
  } else if (flow instanceof Let) {
    const letFlow = flow
    return {
      type: 'let',
      currVarname: letFlow.currVarname,
      newVarname: letFlow.newVarname,
      hideCurrVar: letFlow.hideCurrVar,
      subflow: stringifyFlow(letFlow.subflow, options)
    }
  } else if (flow instanceof Filter) {
    const filter = flow
    const filterSparql = toSparqlFragment(
      algebraFactory.createFilter(
        algebraFactory.createBgp([]),
        filter.expression
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
  } else if (flow instanceof Join) {
    const join = flow
    return {
      type: 'join',
      right: toSparqlFragment(join.right, options),
      subflow: stringifyFlow(join.subflow, options)
    }
  } else {
    throw new Error('Unrecognized flow type')
  }
}
