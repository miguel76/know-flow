import { Algebra, translate, Factory } from 'sparqlalgebrajs'
import * as RDF from 'rdf-js'
import {
  Flow,
  ActionExecutor,
  ForEach,
  Cascade,
  ParallelTwo,
  ParallelThree,
  ParallelN,
  Action,
  Hide,
  Rename,
  SingleVarRenameConfig,
  SingleInputDataOperation,
  MultiInputDataOperation,
  InputFromLeftDataOperation,
  InputFromRightDataOperation,
  BlindActionExecutor
} from './flow'
import * as Actions from './actions'
import { canonVariablesSelector, VariablesSelector } from './selectors'
import {
  asArray,
  getFlowConfig,
  SubflowAndParams,
  withDefaults
} from './paramUtils'
import {
  DEFAULT_INPUT_VAR_STR,
  DEFAULT_OUTPUT_VAR_STR,
  DEFAULT_INPUT_VARNAME,
  DEFAULT_OUTPUT_VARNAME
} from './constants'

/**
 * Options object accepted by {@link sparqlalgebrajs#translate}
 */
interface TranslateOptions {
  dataFactory?: RDF.DataFactory
  quads?: boolean
  prefixes?: {
    [prefix: string]: string
  }
  baseIRI?: string
  blankToVariable?: boolean
  sparqlStar?: boolean
}

/**
 * Options object accepted by {@link sparqlalgebrajs#translate}, plus an
 * optional {@link sparqlalgebrajs#Factory} to build algebra objects.
 */
export interface FlowFactoryOptions extends TranslateOptions {
  algebraFactory?: Factory
}

/**
 * Parameters to configure the renaming of a variable
 */
type SingleVarRenameParam = {
  /** Current of the variable. Defaults to default variable (?_). */
  currVarname?: string
  /** New name of the variable. Defaults to default variable (?_). */
  newVarname?: string
  /** If true, the original variable (`currVarname`) is hidden. Defaults to
   * false. */
  hideCurrVar?: boolean
}

/**
 * Parameters to configure the renaming of a set of variables
 */
export type RenameParam = SingleVarRenameParam | SingleVarRenameParam[]

function canonRenameConfig(renameParam: RenameParam): SingleVarRenameConfig[] {
  return asArray(renameParam).map(
    withDefaults({ currVarname: DEFAULT_INPUT_VARNAME, newVarname: DEFAULT_INPUT_VARNAME, hideCurrVar: false })
  )
}

/**
 * Parameters used to define a ForEach: either the selection of a set of values
 * to iterate on or, if all the variables are considered, the 'distinct' flag
 * to decide if repeated tuples must be considered in the same repetition.
 */
export type ForEachParam = { select: VariablesSelector }

/**
 * Parameter used to define an Algebra.Operation: either the Algebra.Operation
 * or a SPARQL string parseable as one.
 */
export type OperationParam = Algebra.Operation | string

/**
 * Factory used to build flow objects, based on a set of options (e.g., a set of
 * assigned prefixes).
 */
export default class FlowFactory {
  /** Factory for algebra objects. */
  algebraFactory: Factory
  /** Factory for RDF objects. */
  dataFactory: RDF.DataFactory<RDF.BaseQuad, RDF.BaseQuad>
  /** Variable used as default. */
  defaultInput: RDF.Variable
  /** Variable used as temporary for the output (for traversal). */
  defaultOutput: RDF.Variable
  /** Options used translating SPARQL from textual notation to object notation
   * using {@link sparqlalgebrajs#translate}.
   */
  options: TranslateOptions

  /**
   * Creates a new FlowFactory
   * @param options Options used translating SPARQL from textual notation to
   * SPARQL algebra notation.
   * @param options.algebraFactory Factory to build SPARQL algebra objects
   */
  constructor(options: FlowFactoryOptions = {}) {
    this.algebraFactory =
      options.algebraFactory || new Factory(options.dataFactory)
    this.dataFactory = this.algebraFactory.dataFactory
    this.defaultInput = this.dataFactory.variable(DEFAULT_INPUT_VAR_STR)
    this.defaultOutput = this.dataFactory.variable(DEFAULT_INPUT_VAR_STR)
    this.options = options
  }

  /**
   * Creates a Cascade flow.
   * @param config.subflow - Subflow to be executed before the action.
   * @param config.action - Function to be executed as action after the subflow.
   * @returns The new Cascade instance.
   */
  createCascade<SubflowReturnType, ActionReturnType>(config: {
    subflow: Flow<SubflowReturnType>
    action: Action<SubflowReturnType, ActionReturnType>
  }): Cascade<SubflowReturnType, ActionReturnType> {
    return new Cascade(config.subflow, config.action)
  }

  /**
   * Creates an ActionExecutor.
   * @param action - Action to be executed.
   * @returns The new ActionExecutor instance.
   */
  createActionExecutor<ReturnType>(
    action: Action<RDF.Term, ReturnType>
  ): ActionExecutor<ReturnType> {
    return new ActionExecutor(action)
  }

  /**
   * Creates an ActionExecutor.
   * @param action - Action to be executed.
   * @returns The new ActionExecutor instance.
   */
  createBlindActionExecutor<ReturnType>(
    action: Action<void, ReturnType>
  ): BlindActionExecutor<ReturnType> {
    return new BlindActionExecutor(action)
  }

  /**
   * Creates a Parallel flow from an array of subflows.
   * @param subflows - Array of subflows to be executed.
   * @returns The new Parallel instance.
   */
  createParallel<EachReturnType>(
    subflows: Flow<EachReturnType>[]
  ): ParallelN<EachReturnType> {
    return new ParallelN(subflows)
  }

  /**
   * Creates a Parallel flow from a dictionary of subflows.
   * @param subflowsDict - Dictionary of subflows to be executed.
   * @returns The new Parallel instance.
   */
  createParallelDict<KeySet extends string, EachReturnType>(subflowsDict: {
    [key in KeySet]: Flow<EachReturnType>
  }): Flow<{ [key in KeySet]: EachReturnType }> {
    const keys: string[] = []
    const subflows: Flow<EachReturnType>[] = []
    Object.entries(subflowsDict).forEach(([key, subflow]) => {
      keys.push(key)
      subflows.push(subflow)
    })
    return this.createCascade({
      subflow: this.createParallel(subflows),
      action: (resultArray: EachReturnType[]) =>
        Object.fromEntries(
          resultArray.map((singleRes, index) => [keys[index], singleRes])
        )
    })
  }

  // /**
  //  * Creates a Parallel flow from a dictionary of subflows.
  //  * @param subflowsDict - Dictionary of subflows to be executed.
  //  * @returns The new Parallel instance.
  //  */
  //  createParallelDict<ReturnType, ReturnMapType extends { [key: string]:  ReturnType}>(subflowsDict: {
  //   [key: string]: Flow<ReturnMapType[key]>
  // }): Flow<{ [key: string]: EachReturnType }> {
  //   const keys: string[] = []
  //   const subflows: Flow<EachReturnType>[] = []
  //   Object.entries(subflowsDict).forEach(([key, subflow]) => {
  //     keys.push(key)
  //     subflows.push(subflow)
  //   })
  //   return this.createCascade({
  //     subflow: this.createParallel(subflows),
  //     action: (resultArray: EachReturnType[]) =>
  //       Object.fromEntries(
  //         resultArray.map((singleRes, index) => [keys[index], singleRes])
  //       )
  //   })
  // }

  /**
   * Creates a Parallel flow from a JS object containing nested subflows.
   * @param obj - JS object containing nested subflows.
   * @returns The new Parallel instance.
   */
  createParallelFromObject(obj: any): Flow<any> {
    if (obj instanceof Flow) {
      return obj
    } else if (Array.isArray(obj)) {
      return this.createParallel(
        obj.map((e) => this.createParallelFromObject(e))
      )
    } else if (typeof obj === 'object' && obj !== null) {
      return this.createParallelDict(
        Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [
            k,
            this.createParallelFromObject(v)
          ])
        )
      )
    } else {
      return this.createBlindActionExecutor(Actions.constant(obj))
    }
  }

  /**
   * Creates a Parallel flow from an array of two subflows.
   * It is a special case of createParallel, here only to provide more control
   * of types.
   * @param subflows - Array of subflows to be executed.
   * @returns The new Parallel instance.
   */
  createParallelTwo<ReturnType1, ReturnType2>(
    subflows: [Flow<ReturnType1>, Flow<ReturnType2>]
  ): ParallelTwo<ReturnType1, ReturnType2> {
    return new ParallelTwo(subflows)
  }

  /**
   * Creates a Parallel flow from an array of two subflows.
   * It is a special case of createParallel, here only to provide more control
   * of types.
   * @param subflows - Array of subflows to be executed.
   * @returns The new Parallel instance.
   */
  createParallelThree<ReturnType1, ReturnType2, ReturnType3>(
    config:
      | {
          subflows: [Flow<ReturnType1>, Flow<ReturnType2>, Flow<ReturnType3>]
        }
      | [Flow<ReturnType1>, Flow<ReturnType2>, Flow<ReturnType3>]
  ): ParallelThree<ReturnType1, ReturnType2, ReturnType3> {
    const subflows = Array.isArray(config) ? config : config.subflows
    return new ParallelThree(subflows)
  }

  /**
   * Creates a ForEach flow.
   * @param config - The subflow or an object with the subflow and the ForEach
   * parameters.
   * @returns New ForEach instance.
   */
  createForEach<EachReturnType>(
    inputConfig: SubflowAndParams<EachReturnType, ForEachParam>
  ): Flow<EachReturnType[]> {
    const config = getFlowConfig(inputConfig)
    const variablesSelector = canonVariablesSelector(
      'select' in config.params ? config.params.select : config.params
    )
    let variablesOrDistinct: string[] | boolean
    if ('allVars' in variablesSelector) {
      variablesOrDistinct = variablesSelector.distinct
    } else {
      variablesOrDistinct = variablesSelector.map((s) => s.var)
    }
    return new ForEach<EachReturnType>(config.subflow, variablesOrDistinct)
  }

  private selectEnvelope(patternStr: string): string {
    return 'SELECT * WHERE { ' + patternStr + ' }'
  }

  translateOperation(patternStr: string): Algebra.Operation {
    return (<Algebra.Project>(
      translate(this.selectEnvelope(patternStr), this.options)
    )).input
  }

  asOperation(operationParam: OperationParam) {
    return typeof operationParam === 'string'
      ? this.translateOperation(operationParam)
      : operationParam
  }

  /**
   * Creates a Hide data operation.
   * @param config - The subflow and the name of the variables to hide.
   * @returns New Hide instance.
   */
  createHide<ReturnType>(config: {
    subflow: Flow<ReturnType>
    variables: string[]
  }): Hide<ReturnType> {
    return new Hide<ReturnType>(config.subflow, config.variables)
  }

  /**
   * Creates a Rename data operation.
   * @param config - The subflow and the spec of the renamings.
   * @returns New Rename instance.
   */
  createRename<ReturnType>(config: {
    subflow: Flow<ReturnType>
    renamings: RenameParam
  }): Rename<ReturnType> {
    return new Rename<ReturnType>(
      config.subflow,
      canonRenameConfig(config.renamings)
    )
  }

  private createSingleInputDataOperation<
    OpType extends Algebra.Single,
    ReturnType
  >(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    params?: Omit<OpType, 'type | input'>
  ): SingleInputDataOperation<OpType, ReturnType> {
    return new SingleInputDataOperation(type, subflow, { ...params })
  }

  private createInputFromLeftDataOperation<
    OpType extends Algebra.Double,
    ReturnType
  >(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    rightInput: OperationParam,
    params: Omit<OpType, 'type | input'>
  ): InputFromLeftDataOperation<OpType, ReturnType> {
    return new InputFromLeftDataOperation(
      type,
      subflow,
      this.asOperation(rightInput),
      { ...params }
    )
  }

  private createInputFromRightDataOperation<
    OpType extends Algebra.Double,
    ReturnType
  >(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    leftInput: OperationParam,
    params: Omit<OpType, 'type | input'>
  ): InputFromRightDataOperation<OpType, ReturnType> {
    return new InputFromRightDataOperation(
      type,
      subflow,
      this.asOperation(leftInput),
      { ...params }
    )
  }

  private createMultiInputDataOperation<
    OpType extends Algebra.Multi,
    ReturnType
  >(
    type: OpType['type'],
    subflow: Flow<ReturnType>,
    input: OperationParam | OperationParam[],
    params?: Omit<OpType, 'type | input'>
  ): MultiInputDataOperation<OpType, ReturnType> {
    return new MultiInputDataOperation(
      type,
      subflow,
      asArray(input).map((op) => this.asOperation(op)),
      { ...params }
    )
  }

  // Distinct
  // Extend

  /**
   * Creates a Filter flow.
   * @param config.subflow - The subflow.
   * @param config.expression - The expression to be used for the Filter, either
   * an Algebra.Expression or a string to be parsed as such.
   * @returns New Filter instance.
   */
  createFilter<ReturnType>(config: {
    subflow: Flow<ReturnType>
    expression: Algebra.Expression | string
  }): SingleInputDataOperation<Algebra.Filter, ReturnType> {
    return this.createSingleInputDataOperation(
      Algebra.types.FILTER,
      config.subflow,
      {
        expression:
          typeof config.expression === 'string'
            ? (
                this.translateOperation(
                  'FILTER(' + config.expression + ')'
                ) as Algebra.Filter
              ).expression
            : config.expression
      }
    )
  }

  // Group
  // OrderBy
  // Project
  // Reduced
  // Slice

  /**
   * Creates a LeftJoin flow with the current result as left input.
   * @param config.subflow - The subflow.
   * @param config.rightInput - SPARQL query to be leftjoined to the
   * current result.
   * @returns New LeftJoin instance.
   */
  createLeftJoinFromLeft<ReturnType>(config: {
    subflow: Flow<ReturnType>
    rightInput: OperationParam
    params: Omit<Algebra.LeftJoin, 'type| input'>
  }): InputFromLeftDataOperation<Algebra.LeftJoin, ReturnType> {
    return this.createInputFromLeftDataOperation<Algebra.LeftJoin, ReturnType>(
      Algebra.types.LEFT_JOIN,
      config.subflow,
      config.rightInput,
      config.params
    )
  }

  /**
   * Creates a LeftJoin flow with the current result as right input.
   * @param config.subflow - The subflow.
   * @param config.leftInput - SPARQL query to be leftjoined to the
   * current result.
   * @returns New LeftJoin instance.
   */
  createLeftJoinFromRight<ReturnType>(config: {
    subflow: Flow<ReturnType>
    leftInput: OperationParam
    params: Omit<Algebra.LeftJoin, 'type| input'>
  }): InputFromRightDataOperation<Algebra.LeftJoin, ReturnType> {
    return this.createInputFromRightDataOperation<Algebra.LeftJoin, ReturnType>(
      Algebra.types.LEFT_JOIN,
      config.subflow,
      config.leftInput,
      config.params
    )
  }

  // Minus

  /**
   * Creates a Join flow.
   * @param config.subflow - The subflow.
   * @param config.input - SPARQL query(ies) to be joined to the current result.
   * @param config.newDefault - Optionally assigns to the default variable (?_)
   * the value of the variable with this name.
   * @param config.hideCurrVar - Flag Deciding if the variable specified in
   * `newDefault` is to be hidden.
   * @returns New Join instance.
   */
  createJoin<ReturnType>(config: {
    subflow: Flow<ReturnType>
    input: OperationParam | OperationParam[]
    newDefault?: string
    hideCurrVar?: boolean
  }): MultiInputDataOperation<Algebra.Join, ReturnType> {
    let subflow = config.subflow
    if (config.newDefault) {
      subflow = this.createRename({
        subflow,
        renamings: [
          {
            currVarname: config.newDefault,
            hideCurrVar: config.hideCurrVar
          }
        ]
      })
    }
    return this.createMultiInputDataOperation<Algebra.Join, ReturnType>(
      Algebra.types.JOIN,
      subflow,
      config.input
    )
  }

  /**
   * Creates an action executor that works on an entire subset of the parameter bindings represented as an object
   * @param varnames - Labels selecting the subset of bindings.
   * @param fun - Action executed on the whole input sequence.
   * @returns The new Action.
   */
  createActionExecutorOnTheseVariables<VarnameSet extends string, ReturnType>(
    varnames: VarnameSet[],
    fun: Action<{[key in VarnameSet]: RDF.Term}, ReturnType>
  ): Flow<ReturnType> {
    return this.createCascade({
      subflow: this.createParallelDict(Object.fromEntries(varnames.map(varname => ([
        varname,
        this.createRename({
          renamings: {currVarname: varname},
          subflow: this.createActionExecutor((t:RDF.Term) => t)
        })
      ])))),
      action: fun
    })
  }

  /**
   * Creates an action executor that works on an entire subset of the parameter bindings represented as an object
   * and the default input sequence, considering another subset of bindings for each solution.
   * @param paramVarnames - Labels selecting the subset of bindings from the parameters.
   * @param inputVarnames - Labels selecting the subset of bindings from each solution in the input sequence.
   * @param fun - Action executed on the whole input sequence.
   * @returns The new Action.
   */
  createActionExecutorOnAllTheInputAndTheseVariables<ParamVarnameSet extends string, InputVarnameSet extends string, ReturnType>(
    paramVarnames: ParamVarnameSet[],
    inputVarnames: InputVarnameSet[],
    fun: Action<{
      parameterValues: {[key in ParamVarnameSet]: RDF.Term},
      inputValues: {[key in InputVarnameSet]: RDF.Term}[]
    }, ReturnType>
  ): Flow<ReturnType> {
    return this.createCascade({
      subflow: this.createParallelDict<'parameterValues' | 'inputValues', any>({
        parameterValues: this.createActionExecutorOnTheseVariables(paramVarnames, d => d),
        inputValues: this.createForEach({
          select: inputVarnames,
          subflow: this.createActionExecutorOnTheseVariables(inputVarnames, d => d),
        })
      }),
      action: fun
    })
  }

}

// Union



