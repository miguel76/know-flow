import { Algebra } from 'sparqlalgebrajs-input'
import * as RDF from 'rdf-js'

/**
 * Add parameter generating query where needed in the current query.
 * @param {Algebra.Operation} op - Input algebra tree.
 * @param {Variable[]} parameters - List of parameters as variables.
 * @param {Algebra.Operation} parametersOp - Algebra tree for the query returning parameter values.
 * @returns {Algebra.Operation} - Modified query.
 */
export function addParameterQuery(
  op: Algebra.Operation,
  parameters: RDF.Variable[],
  parametersOp: Algebra.Operation,
  parametersInScope: RDF.Variable[] = [],
  options: {

  }
): Algebra.Operation {
  const variables: Variable[] = []

  function addVariable(v: Variable) {
    if (!variables.find((v2) => v.value === v2.value)) variables.push(v)
  }

  function recurseTerm(quad: BaseQuad) {
    if (quad.subject.termType === 'Variable')
      addVariable(<Variable>quad.subject)
    if (quad.predicate.termType === 'Variable')
      addVariable(<Variable>quad.predicate)
    if (quad.object.termType === 'Variable') addVariable(<Variable>quad.object)
    if (quad.graph.termType === 'Variable') addVariable(<Variable>quad.graph)
    if (quad.subject.termType === 'Quad') recurseTerm(quad.subject)
    if (quad.predicate.termType === 'Quad') recurseTerm(quad.predicate)
    if (quad.object.termType === 'Quad') recurseTerm(quad.object)
    if (quad.graph.termType === 'Quad') recurseTerm(quad.graph)
  }

  // https://www.w3.org/TR/sparql11-query/#variableScope
  Util.recurseOperation(op, {
    [types.EXPRESSION]: (op) => {
      let expr = <A.Expression>op
      if (expr.expressionType === 'aggregate' && expr.variable) {
        let agg = <A.BoundAggregate>expr
        addVariable(agg.variable)
      }
      return true
    },
    [types.EXTEND]: (op) => {
      let extend = <A.Extend>op
      addVariable(extend.variable)
      return true
    },
    [types.GRAPH]: (op) => {
      let graph = <A.Graph>op
      if (graph.name.termType === 'Variable') addVariable(<Variable>graph.name)
      return true
    },
    [types.GROUP]: (op) => {
      let group = <A.Group>op
      group.variables.forEach(addVariable)
      return true
    },
    [types.INPUT]: (op) => {
      let input = <A.Input>op
      Object.values(input.varMap).forEach(addVariable)
      return true
    },
    [types.PATH]: (op) => {
      let path = <A.Path>op
      if (path.subject.termType === 'Variable')
        addVariable(<Variable>path.subject)
      if (path.object.termType === 'Variable')
        addVariable(<Variable>path.object)
      if (path.graph.termType === 'Variable') addVariable(<Variable>path.graph)
      if (path.subject.termType === 'Quad') recurseTerm(path.subject)
      if (path.object.termType === 'Quad') recurseTerm(path.object)
      if (path.graph.termType === 'Quad') recurseTerm(path.graph)
      return true
    },
    [types.PATTERN]: (op) => {
      let pattern = <A.Pattern>op
      recurseTerm(pattern)
      return true
    },
    [types.PROJECT]: (op) => {
      let project = <A.Project>op
      project.variables.forEach(addVariable)
      return false
    },
    [types.SERVICE]: (op) => {
      let service = <A.Service>op
      if (service.name.termType === 'Variable')
        addVariable(<Variable>service.name)
      return true
    },
    [types.VALUES]: (op) => {
      let values = <A.Values>op
      values.variables.forEach(addVariable)
      return true
    }
  })

  return variables
}
