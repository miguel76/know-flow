import {
  Flow,
  Action,
  Parallel,
  ForEach,
  Join,
  Filter,
  Cascade,
  Let,
  DataOperation
} from './flow'
import * as RDF from 'rdf-js'
import { Algebra, Factory } from 'sparqlalgebrajs'
import {
  IQueryEngine,
  IActorQueryOperationOutputBindings
} from '@comunica/types'
import {
  Table,
  cloneTable,
  fromTableToValuesOp,
  noBindingSingletonTable,
  oneTupleTable
} from './table'
import { Map } from 'immutable'
// import { Wildcard } from 'sparqljs'
import { AsyncIterator } from 'asynciterator'
import { group } from './grouping'
import { getItemsAsArray } from './iterators'

const algebraFactory = new Factory()

/**
 * Assigns the value of a variable to another, optionally hiding the orginal
 * variable.
 * The previous value of the new variable is in any case overwritten.
 * @param input - Input stream of bindings
 * @param currVarName - Current variable name
 * @param newVarName - New variable name
 * @param hideCurrVar - True iff the orginal variable is to be hidden
 * @returns Updated stream of bindings
 */
function assignVar(
  input: Table,
  currVarName: string,
  newVarName: string,
  hideCurrVar: boolean
): Table {
  if (!input.variables.includes(currVarName)) {
    throw new Error(
      'New focus ' +
        currVarName +
        ' not found among the variables (' +
        input.variables +
        ').'
    )
  }
  const variables = hideCurrVar
    ? input.variables.filter((v) => v !== currVarName)
    : input.variables
  return {
    variables: variables.includes(newVarName)
      ? variables
      : variables.concat(newVarName),
    bindingsStream: input.bindingsStream.map((bindings) => {
      const newBindings: { [key: string]: RDF.Term } = {}
      bindings.forEach((value, varname) => {
        if (varname === currVarName) {
          newBindings[newVarName] = value
        }
        if (
          varname !== newVarName &&
          (varname !== currVarName || !hideCurrVar)
        ) {
          newBindings[varname] = value
        }
      })
      return Map<string, RDF.Term>(newBindings)
    }),
    canContainUndefs: input.canContainUndefs
  }
}

/**
 * Executes flows, i.e. networks of know-flow operations
 */
export default class FlowEngine {
  engine: IQueryEngine
  queryContext: any

  /**
   * Create a new instance of FlowEngine
   * @param engine - SPARQL engine used to execute the queries
   * @param queryContext - Context to be passed to `engine` along each query
   */
  constructor(config: { engine: IQueryEngine; queryContext?: any }) {
    this.engine = config.engine // || newEngine();
    this.queryContext = config.queryContext || {}
  }

  private async query(
    queryOp: Algebra.Operation
  ): Promise<IActorQueryOperationOutputBindings> {
    return <IActorQueryOperationOutputBindings>(
      await this.engine.query(queryOp, this.queryContext)
    )
  }

  /**
   * Split a stream of bindings in groups, according to the values of a subset
   * of variables
   * @param input - Input stream of bindings.
   * @param groupingVariables - Name of variables used for groups.
   * If undefined, every variable is considered (as in SELECT *).
   * If empty, no variable is considered (the result is hence a single group).
   * @param distinct - In the case every variable is considered for grouping
   * (`groupingVariables` undefined or including all the variables in `input`),
   * this boolean decides if identical tuples should be part of the same group
   * or not.
   * If not, each tuple goes to a separate group.
   * @returns - An iterator of the streams of bindings associated with each
   * group.
   */
  private async group(
    input: Table,
    groupingVariables: string[] | undefined,
    distinct = false
  ): Promise<AsyncIterator<Table>> {
    const star =
      groupingVariables === undefined ||
      input.variables.every((varname) => groupingVariables.includes(varname))
    if (star && !distinct) {
      const newBindings = input.bindingsStream.map((bindings) =>
        oneTupleTable(input.variables, bindings, input.canContainUndefs)
      )
      return newBindings
    } else {
      // const inputOp = await fromTableToValuesOp(input)
      // const orderOp = algebraFactory.createOrderBy(
      //   inputOp,
      //   groupingVariables.map((varname) =>
      //     algebraFactory.createTermExpression(
      //       algebraFactory.dataFactory.variable(varname.substr(1))
      //     )
      //   )
      // )
      // console.log(toSparqlQuery(orderOp))
      // const result = await this.query(orderOp)
      // return groupOrdered(result, groupingVariables).map((g) => g.members)
      return (await group(input, groupingVariables)).map((g) => g.members)
    }
  }

  /**
   * Executes a flow
   * @param config.flow - flow to be executed
   * @param config.input - optional input stream of bindings
   * @returns the output of the flow
   */
  async run<ReturnType>(
    config:
      | {
          flow: Flow<ReturnType>
          input?: Table
        }
      | Flow<ReturnType>
  ): Promise<ReturnType> {
    // Setup values for flow and input
    let flow: Flow<ReturnType>
    let input: Table
    if (config instanceof Flow) {
      flow = <Flow<ReturnType>>config
      input = noBindingSingletonTable()
    } else {
      flow = (<{ flow: Flow<ReturnType>; input?: Table }>config).flow
      input = <Table>(<any>config).input || noBindingSingletonTable()
    }
    // By case execution of each type of flow
    if (flow instanceof Action) {
      return this.runAction(flow, input)
    } else if (flow instanceof Cascade) {
      return this.runCascade(flow, input)
    } else if (flow instanceof Parallel) {
      return <ReturnType>(<unknown>await this.runParallel(flow, input))
    } else if (flow instanceof ForEach) {
      return <ReturnType>(<unknown>await this.runForEach(flow, input))
    } else if (flow instanceof DataOperation) {
      return this.runDataOperation(flow, input)
    } else {
      throw new Error('Unrecognized flow type')
    }
  }

  private async runAction<ReturnType>(
    action: Action<ReturnType>,
    input: Table
  ): Promise<ReturnType> {
    return action.exec(input)
  }

  private async runCascade<SubflowReturnType, ReturnType>(
    cascade: Cascade<SubflowReturnType, ReturnType>,
    input: Table
  ): Promise<ReturnType> {
    const subflowResult = await this.run({ flow: cascade.subflow, input })
    return cascade.action(subflowResult)
  }

  private async runParallel<EachReturnType>(
    parallel: Parallel<EachReturnType>,
    input: Table
  ): Promise<EachReturnType[]> {
    return await Promise.all(
      parallel.subflows.map((subflow) =>
        this.run({ flow: subflow, input: cloneTable(input) })
      )
    )
  }

  private async runForEach<EachReturnType>(
    forEach: ForEach<EachReturnType>,
    input: Table
  ): Promise<EachReturnType[]> {
    const groupIterator = await this.group(
      input,
      forEach.variables,
      forEach.distinct
    )
    const resultPromisesIterator = groupIterator.map((subflowInput: Table) =>
      this.run({
        flow: forEach.subflow,
        input: subflowInput
      })
    )
    const resultPromisesArray = await getItemsAsArray(resultPromisesIterator)
    return Promise.all(resultPromisesArray)
  }

  private async runDataOperation<ReturnType>(
    dataOperation: DataOperation<ReturnType>,
    input: Table
  ): Promise<ReturnType> {
    let results
    if (dataOperation instanceof Let) {
      const letFlow = dataOperation
      results = assignVar(
        input,
        letFlow.currVarname,
        letFlow.newVarname,
        letFlow.hideCurrVar
      )
    } else {
      const valuesClause = await fromTableToValuesOp(input)
      const query = this.queryFromDataOperation(dataOperation, valuesClause)
      results = await this.query(query)
    }
    return this.run({ flow: dataOperation.subflow, input: results })
  }

  private queryFromDataOperation<ReturnType>(
    dataOperation: DataOperation<ReturnType>,
    inputQuery: Algebra.Operation
  ): Algebra.Operation {
    if (dataOperation instanceof Join) {
      const join = dataOperation
      return algebraFactory.createJoin(inputQuery, join.right)
      // (input === NO_BINDING_SINGLETON_TABLE) ?
      // join.right :
      // algebraFactory.createJoin(inputQuery, join.right)
    } else if (dataOperation instanceof Filter) {
      const filter = dataOperation
      return algebraFactory.createFilter(inputQuery, filter.expression)
    } else {
      throw new Error('Unrecognized data operation')
    }
  }
}
