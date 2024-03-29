import {
  Flow,
  ActionExecutor,
  Parallel,
  ForEach,
  Cascade,
  DataOperation,
  Hide,
  SingleVarRenameConfig,
  Rename,
  SingleInputDataOperation,
  InputFromLeftDataOperation,
  InputFromRightDataOperation,
  MultiInputDataOperation
} from './flow'
import * as RDF from 'rdf-js'
import { Algebra, Factory, toSparql } from 'sparqlalgebrajs'
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

/**
 * Reassigns values of variables one to another, optionally hiding the orginal
 * variable, plus hiding some other variables too.
 * @param input - Input stream of bindings
 * @param renamings - Renamings to be performed
 * @param toBeHidden - Names of the other variables to be hidden
 * @returns Updated stream of bindings
 */
function scrambleVars(
  input: Table,
  renamings: SingleVarRenameConfig[] = [],
  toBeHidden: string[] = []
): Table {
  const renamingsMap = Object.fromEntries(
    renamings.map((r) => [r.currVarname, r])
  )
  const varsToHide = toBeHidden
    .concat(renamings.filter((r) => r.hideCurrVar).map((r) => r.currVarname))
    .concat(renamings.map((r) => r.newVarname))
  const varsToAdd = renamings
    .map((r) => r.newVarname)
    .filter((v) => !input.variables.includes(v) || varsToHide.includes)
  const variables = [
    ...input.variables.filter((v) => !varsToHide.includes(v)),
    ...varsToAdd
  ]
  return {
    variables,
    bindingsStream: input.bindingsStream.map((bindings) => {
      const newBindings: { [key: string]: RDF.Term } = {}
      bindings.forEach((value, varname) => {
        if (varname in renamingsMap) {
          newBindings[renamingsMap[varname].newVarname] = value
        }
        if (!varsToHide.includes(varname)) {
          newBindings[varname] = value
        }
      })
      return Map<string, RDF.Term>(newBindings)
    }),
    canContainUndefs: input.canContainUndefs
  }
}

function hideVars(input: Table, variables: string[] = []) {
  return scrambleVars(input, [], variables)
}

function renameVars(input: Table, renamings: SingleVarRenameConfig[] = []) {
  return scrambleVars(input, renamings)
}

/**
 * Executes flows, i.e. networks of know-flow operations
 */
export default class FlowEngine {
  engine: IQueryEngine
  queryContext: any
  algebraFactory = new Factory()

  /**
   * Create a new instance of FlowEngine
   * @param engine - SPARQL engine used to execute the queries
   * @param queryContext - Context to be passed to `engine` along each query
   */
  constructor(config: { engine: IQueryEngine; queryContext?: any }) {
    this.engine = config.engine // || newEngine();
    this.queryContext = config.queryContext || {}
  }

  private toSparqlQuery(op: Algebra.Operation, options = {}): string {
    return toSparql(this.algebraFactory.createProject(op, []), options)
  }

  private async query(
    queryOp: Algebra.Operation
  ): Promise<IActorQueryOperationOutputBindings> {
    return <IActorQueryOperationOutputBindings>(
      await this.engine.query(this.toSparqlQuery(queryOp), this.queryContext)
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
    if (flow instanceof ActionExecutor) {
      return this.runActionExecutor(flow, input)
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

  /**
   * Executes an ActionExecutor
   * @param actionExecutor - The flow to be executed
   * @param input - The input stream of bindings
   * @returns The output of the flow
   */
  private async runActionExecutor<ReturnType>(
    actionExecutor: ActionExecutor<ReturnType>,
    input: Table
  ): Promise<ReturnType> {
    return actionExecutor.action(input)
  }

  /**
   * Executes a Cascade
   * @param cascade - The flow to be executed
   * @param input - The input stream of bindings
   * @returns The output of the flow
   */
  private async runCascade<SubflowReturnType, ReturnType>(
    cascade: Cascade<SubflowReturnType, ReturnType>,
    input: Table
  ): Promise<ReturnType> {
    const subflowResult = await this.run({ flow: cascade.subflow, input })
    return cascade.action(subflowResult)
  }

  /**
   * Executes a Parallel
   * @param parallel - The flow to be executed
   * @param input - The input stream of bindings
   * @returns The output of the flow
   */
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

  /**
   * Executes a ForEach
   * @param forEach - The flow to be executed
   * @param input - The input stream of bindings
   * @returns The output of the flow
   */
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

  /**
   * Executes a DataOperation
   * @param dataOperation - The flow to be executed
   * @param input - The input stream of bindings
   * @returns The output of the flow
   */
  private async runDataOperation<ReturnType>(
    dataOperation: DataOperation<ReturnType>,
    input: Table
  ): Promise<ReturnType> {
    let results
    if (dataOperation instanceof Hide) {
      const hide = dataOperation
      results = hideVars(input, hide.variables)
    } else if (dataOperation instanceof Rename) {
      const rename = dataOperation
      results = renameVars(input, rename.renamings)
    } else {
      const valuesClause = await fromTableToValuesOp(input)
      const query = this.queryFromDataOperation(dataOperation, valuesClause)
      results = await this.query(query)
    }
    return this.run({ flow: dataOperation.subflow, input: results })
  }

  /**
   * Generates the SPARQL query corresponding to a data operation.
   * @param dataOperation - The data operation.
   * @param inputQuery - The input query, on top of which the new query is built.
   * @returns - The new query.
   */
  private queryFromDataOperation<ReturnType>(
    dataOperation: DataOperation<ReturnType>,
    inputQuery: Algebra.Operation
  ): Algebra.Operation {
    if (dataOperation instanceof SingleInputDataOperation) {
      return this.queryFromSingleInputDataOperation(dataOperation, inputQuery)
    } else if (dataOperation instanceof InputFromLeftDataOperation) {
      return this.queryFromInputFromLeftDataOperation(dataOperation, inputQuery)
    } else if (dataOperation instanceof InputFromRightDataOperation) {
      return this.queryFromInputFromRightDataOperation(
        dataOperation,
        inputQuery
      )
    } else if (dataOperation instanceof MultiInputDataOperation) {
      return this.queryFromMultiInputDataOperation(dataOperation, inputQuery)
    } else {
      throw new Error('Unrecognized data operation')
    }
  }

  /**
   * Generates the SPARQL query corresponding to a single input data operation.
   * @param dataOperation - The data operation.
   * @param inputQuery - The input query, on top of which the new query is built.
   * @returns - The new query.
   */
  private queryFromSingleInputDataOperation<
    OpType extends Algebra.Single,
    ReturnType
  >(
    dataOperation: SingleInputDataOperation<OpType, ReturnType>,
    inputQuery: Algebra.Operation
  ): OpType {
    return {
      type: dataOperation.dataOperationType,
      ...dataOperation.params,
      input: inputQuery
    } as OpType
  }

  /**
   * Generates the SPARQL query corresponding to a double input data operation.
   * @param dataOperation - The data operation.
   * @param inputQuery - The input query, on top of which the new query is built,
   * taken as left input.
   * @returns - The new query.
   */
  private queryFromInputFromLeftDataOperation<
    OpType extends Algebra.Double,
    ReturnType
  >(
    dataOperation: InputFromLeftDataOperation<OpType, ReturnType>,
    inputQuery: Algebra.Operation
  ): OpType {
    return {
      type: dataOperation.dataOperationType,
      ...dataOperation.params,
      input: [inputQuery, dataOperation.rightInput]
    } as OpType
  }

  /**
   * Generates the SPARQL query corresponding to a double input data operation.
   * @param dataOperation - The data operation.
   * @param inputQuery - The input query, on top of which the new query is built,
   * taken as right input.
   * @returns - The new query.
   */
  private queryFromInputFromRightDataOperation<
    OpType extends Algebra.Double,
    ReturnType
  >(
    dataOperation: InputFromRightDataOperation<OpType, ReturnType>,
    inputQuery: Algebra.Operation
  ): OpType {
    return {
      type: dataOperation.dataOperationType,
      ...dataOperation.params,
      input: [dataOperation.leftInput, inputQuery]
    } as OpType
  }

  /**
   * Generates the SPARQL query corresponding to a multiple input data operation.
   * @param dataOperation - The data operation.
   * @param inputQuery - The input query, on top of which the new query is built,
   * taken as right input.
   * @returns - The new query.
   */
  private queryFromMultiInputDataOperation<
    OpType extends Algebra.Multi,
    ReturnType
  >(
    dataOperation: MultiInputDataOperation<OpType, ReturnType>,
    inputQuery: Algebra.Operation
  ): OpType {
    return {
      type: dataOperation.dataOperationType,
      ...dataOperation.params,
      input: [inputQuery, ...dataOperation.input]
    } as OpType
  }
}
