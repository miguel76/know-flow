import { Algebra } from 'sparqlalgebrajs'
import * as RDF from 'rdf-js'
import { asArray, withDefaults } from './paramUtils'
import { DEFAULT_INPUT_VARNAME } from './constants'
 
/**
 * Something used to represent a simple property path (on the default graph): a
 * full property path ({@link sparqlalgebrajs#Algebra.PropertyPathSymbol}), a
 * single predicate ({@link rdf-js#Term}), or a string parseable as one of the
 * two (SPARQL/Turtle syntax).
 */
export type PathParam = Algebra.PropertyPathSymbol | RDF.Term | string

/**
 * Something used to represent an RDF term: either a {@link rdf-js#Term} or a
 * string parseable as one.
 */
export type TermParam = string | RDF.Term

/**
 * Something used to represent a SPARQL expression: either a
 * {@link sparqlalgebrajs#Algebra.Expression} or a string parseable as one.
 */
export type ExpressionParam = Algebra.Expression | string

/**
 * Parameters used to specify a traversal.
 */
export type TraversalParam = {
  // Path specification
  path: PathParam
  // Optional graph name
  graphName?: TermParam
  // Name of the variable from which the path starts (defaults to `?_`)
  from?: string
  // Name of the variable to which the result is bound (defaults to `?_`)
  as?: string
}

type AggregatorParam = {
  expressionBefore?: ExpressionParam
  aggregator:
    | 'avg'
    | 'count'
    | 'group_concat'
    | 'max'
    | 'min'
    | 'sample'
    | 'sum'
  distinct?: boolean
  separator?: string
  expressionAfter?: ExpressionParam
}

/**
 * Parameters used to specify a sequence of values (or a single value).
 */
export type PathQueryParam = {
  // RDF term (possibly a variable) from which the path starts (defaults to `?_`)
  from?: TermParam
  // Path specification
  path: PathParam
  // Optional graph name
  graphName?: TermParam
  // Optional expression against which values are tested (the value selected so far is assigned to `?_`)
  where?: ExpressionParam
  // Optional expression used to compute the result value (the value selected so far is assigned to `?_`)
  value?: ExpressionParam | AggregatorParam
  // Name of the variable to which the result is bound (defaults to `?_`)
  as?: string
}

/**
 * Parameters used to select a variable and possibly rename it
 */
export type SingleVariableParam =
  | {
      // The variable whose value is read
      var?: string
      // New name given to the variable
      // as?: string
    }
  | string
  | undefined

export type CanonSingleVariableParam = {
  // The variable whose value is read
  var: string
  // New name given to the variable
  // as?: string
}

function canonSingleVariableParam(
  param: SingleVariableParam
): CanonSingleVariableParam {
  return param === undefined
    ? { var: DEFAULT_INPUT_VARNAME }
    : typeof param === 'string'
    ? { var: param }
    : canonSingleVariableParam(param.var)
}

/**
 * Parameters used to select a single value
 */
export type SingleValueSelector = SingleVariableParam | TraversalParam

export type CanonSingleValueSelector = CanonSingleVariableParam | TraversalParam

export function canonSingleValuesSelector(
  selector: SingleValueSelector
): CanonSingleValueSelector {
  return selector === undefined
    ? { var: DEFAULT_INPUT_VARNAME }
    : typeof selector === 'string'
    ? { var: selector }
    : 'path' in selector
    ? (selector as TraversalParam)
    : 'var' in selector
    ? (selector as CanonSingleVariableParam)
    : { var: DEFAULT_INPUT_VARNAME }
}

/**
 * Parameters used to select all the variables in scope
 */
export type AllVariablesSelector = { allVars: true; distinct?: boolean }

type CanonAllVariablesSelector = { allVars: true; distinct: boolean }

/**
 * Parameters used to select a set of (named) values
 */
export type ValuesSelector =
  | SingleValueSelector
  | SingleValueSelector[]
  | AllVariablesSelector

type CanonValuesSelector =
  | CanonSingleValueSelector[]
  | CanonAllVariablesSelector

export function canonValuesSelector(
  selector: ValuesSelector
): CanonValuesSelector {
  return Array.isArray(selector)
    ? selector.map(canonSingleValuesSelector)
    : typeof selector === 'object' && 'allVars' in selector
    ? {
        allVars: true,
        distinct: 'distinct' in selector ? selector.distinct : false
      }
    : [canonSingleValuesSelector(selector)]
}

/**
 * Parameters used to select a subset or all the variables in scope
 */
export type VariablesSelector =
  | SingleVariableParam
  | SingleVariableParam[]
  | AllVariablesSelector

type CanonVariablesSelector =
  | CanonSingleVariableParam[]
  | CanonAllVariablesSelector

export function canonVariablesSelector(
  selector: VariablesSelector
): CanonVariablesSelector {
  return typeof selector === 'object' && 'allVars' in selector
    ? withDefaults<CanonAllVariablesSelector, 'distinct'>({ distinct: false })(
        selector
      )
    : asArray(selector).map(canonSingleVariableParam)
}
export function newVariablesFromTraversals(traversals: TraversalParam[]) {
  return traversals.map((t) => t.as).filter((v) => v !== undefined)
}

export function variablesFromValuesSelector(selector: CanonValuesSelector) {
  return 'allVars' in selector
    ? undefined
    : [
        ...selector
          .filter((s) => 'var' in s)
          .map((s: CanonSingleVariableParam) => s.var),
        ...newVariablesFromTraversals(
          selector.filter((s) => 'path' in s) as TraversalParam[]
        )
      ]
}
