import * as S from "../src/source";
import {translate, toSparql, Algebra} from 'sparqlalgebrajs';
import assert = require('assert');

// const emptyMap = new Map<string, string>();

export function createRDFTermSourceFromSelectQueryAlgebra(
        varName: string, selectQuery: Algebra.Operation,
        datasetSource: S.DatasetSource, params: Map<string, S.RDFTermSource>) {
    if (selectQuery.type === Algebra.types.PROJECT) {
        const project = selectQuery as Algebra.Project;
        assert.ok( project.variables.some(v => v.value === varName),
                "Variable " + varName + " not found in projection");
        selectQuery = project.input;
    }
    return new S.VarFromSelectQuery(varName, selectQuery, datasetSource, params);
}

// function allVars(varMapping: S.VarMapping): string[] {
//     var varList = [];
//     varMapping.defaultVar && varList.push(varMapping.defaultVar);
//     if (varMapping.namedVarsMap) {
//         for (let varName of varMapping.namedVarsMap.keys()) {
//             varList.push(varName);
//         }
//     }
//     return varList;
// }

const DEFAULT_VARNAME = "_";
const DEFAULT_OUTPUT_VARNAME = "_out";
const DEFAULT_INPUT_VARNAME = "_in";
const OUTPUT_VARNAME_PREFIX = "_out_";
const INPUT_VARNAME_PREFIX = "_in_";

type OptionalNamedVarMapping = S.NamedVarMapping | string;

function getNamedVarMapping():
        (optionalNamedVarMapping: OptionalNamedVarMapping) => S.NamedVarMapping {
    // defaultVarname = defaultVarname || DEFAULT_VARNAME;
    return (optionalNamedVarMapping: OptionalNamedVarMapping) => {
        if ((optionalNamedVarMapping as S.NamedVarMapping).name !== undefined) {
            return optionalNamedVarMapping as S.NamedVarMapping;
        } else {
            const varname = optionalNamedVarMapping as string;
            return {
                name: varname,
                nameInQuery: varname
            };
        }
    };
}

type PartialVarMapping = {
    default?: string;
    named: OptionalNamedVarMapping[] | OptionalNamedVarMapping;
};

type OptionalVarMapping = PartialVarMapping | string;

function getVarMapping(defaultVarname?: string):
        (optionalVarMapping: OptionalVarMapping) => S.VarMapping {
    defaultVarname = defaultVarname || DEFAULT_VARNAME;
    return (optionalVarMapping: OptionalVarMapping) => {
        if ((optionalVarMapping as PartialVarMapping).named !== undefined) {
            const partialVarMapping = optionalVarMapping as PartialVarMapping;
            const named = Array.isArray(partialVarMapping.named) ?
                    partialVarMapping.named as OptionalNamedVarMapping[] :
                    [partialVarMapping.named as OptionalNamedVarMapping];
            return {
                default: partialVarMapping.default,
                named: named.map(getNamedVarMapping())
            };
        } else {
            return {
                default: optionalVarMapping as string,
                named: []
            };
        }

    };
}

type TabularSourceAndOptionalMapping = {
    source: S.TabularSource;
    var: OptionalVarMapping;
};

type TabularSourceAndMaybeMapping = S.TabularSource | TabularSourceAndOptionalMapping;

function getSourceAndMapping(defaultVarname?: string):
        (sourceAndMaybeMapping: TabularSourceAndMaybeMapping) => S.TabularSourceAndMapping {
    defaultVarname = defaultVarname || DEFAULT_VARNAME;
    return (sourceAndMaybeMapping: TabularSourceAndMaybeMapping) => {
        const defaultMapping: S.VarMapping = {default: defaultVarname, named: []};
        if ((sourceAndMaybeMapping as TabularSourceAndOptionalMapping).source !== undefined) {
            const sourceAndOptionalMapping = sourceAndMaybeMapping as TabularSourceAndOptionalMapping;
            return {
                source: sourceAndOptionalMapping.source,
                var: getVarMapping(defaultVarname)(sourceAndOptionalMapping.var)
            };
        } else {
            return {
                source: (sourceAndMaybeMapping as S.TabularSource),
                var: defaultMapping
            };
        }
    };
}

type MapOfTabularSourceDefaults = {
    [key:string]: S.TabularSource;
}

type TabularSources = TabularSourceAndMaybeMapping[] | TabularSourceAndMaybeMapping | MapOfTabularSourceDefaults;

function getSourceAndMappings(sources: TabularSources): S.TabularSourceAndMapping[] {
    if (Array.isArray(sources)) {
        const sourceList = sources as TabularSourceAndMaybeMapping[]
        return sourceList.map(getSourceAndMapping());
    }
    if ((sources as TabularSourceAndOptionalMapping).source !== undefined ||
            typeof (sources as S.TabularSource).type === 'string' ) {
        const sourceAndMapping = sources as TabularSourceAndMaybeMapping;
        return [getSourceAndMapping()(sourceAndMapping)];
    }
    const mapOfSources = sources as MapOfTabularSourceDefaults;
    return Object.entries(mapOfSources).map(varnameAndSource => ({
            source: varnameAndSource[1], var: {default: varnameAndSource[0], named: []}
    }));
}

function allVars(varMapping: S.VarMapping): string[] {
    var varList = [];
    varMapping.default && varList.push(varMapping.default);
    varMapping.named && varList.concat(varMapping.named.map(v => v.nameInQuery));
    return varList;
}

function allBindingSources(sourceList: S.TabularSourceAndMapping[]) {
    return sourceList.map(s => s.source);
}

function defaultBindingSources(sourceList: S.TabularSourceAndMapping[]) {
    return sourceList.filter(s => s.var.default).map(s => s.source);
}

function datasetSourceFromBindingSources(bindingSources: S.TabularSource[]): S.DatasetSource {
    const dsSources = [...new Set(bindingSources.map(s => s.getDatasetSource()).filter(ds => ds !== undefined))];
    if (dsSources.length === 1) {
        return dsSources[0];
    } else if (dsSources.length > 1) {
        return new S.DatasetMerge(dsSources);
    } else {
        return undefined;
    }
}

type QueryInAnyForm = Algebra.Operation | Algebra.Expression | string

const PROPERTY_PATH_SYMBOL_TYPES = [
    'alt', 'inv', 'link', 'nps', 'OneOrMorePath',
    'seq', 'ZeroOrMorePath', 'ZeroOrOnePath'
];

const UPDATE_TYPES = [
    'compositeupdate', 'deleteinsert', 'load', 'clear', 'create', 'drop',
    'add', 'move', 'copy'
];

const EXPRESSION_TYPE = 'expression';

const ASK_QUERY_TYPE = 'ask';
const CONSTRUCT_QUERY_TYPE = 'construct';
const DESCRIBE_QUERY_TYPE = 'describe';

const MODIFIER_TYPES = [
    'distinct', 'project', 'reduced', 'orderby', 'slice'
];

const PATTERN_TYPES = [
    'bgp', 'join', 'leftjoin', 'filter', 'union', 'graph', 'extend', 'minus',
    'group', 'values', 'service', 'path'
];

const SINGLE_PATTERN_TYPE = 'pattern';

const FROM_TYPE = 'from';

function getQuery(queryInAnyForm: QueryInAnyForm): Algebra.Operation {
    var query: Algebra.Operation;
    if ((queryInAnyForm as Algebra.Operation).type !== undefined) {
        const operation = queryInAnyForm as Algebra.Operation;
        if ((operation as Algebra.Expression).expressionType !== undefined) {
            const expression = operation as Algebra.Expression;
            // TODO: build query from expression (now or later?)
        }
        if (PROPERTY_PATH_SYMBOL_TYPES.includes(operation.type)) {
            const path = operation as Algebra.PropertyPathSymbol;
            // TODO: build query from property path (now or later?)
        }
        // TODO: check if actually usable as pattern (now or later?)
        query = operation;
    } else {
        query = translate(queryInAnyForm as string);
    }
    return query;
}

function noPrefix(varname: string, prefix: string): string {
    return varname.startsWith(prefix) ?
            varname.substring(prefix.length) :
            varname;
}

export function createSourceFromQuery(
        queryInAnyForm: QueryInAnyForm,
        config?: {
            output?: OptionalVarMapping,
            dataset?: S.DatasetSource,
            input?: TabularSources
        }) {
    var query = getQuery(queryInAnyForm);
    if (!config) {
        config = {};
    }
    var output: S.VarMapping;
    if (config.output) {
        output = getVarMapping()(config.output);
    } else {
        if (query.type === Algebra.types.PROJECT) {
            const project = query as Algebra.Project;
            const varNames = project.variables.map(v => v.value);
            const namedVarsMap =
                    varNames.filter(v => v !== DEFAULT_OUTPUT_VARNAME).map(v => ({name: noPrefix(v, OUTPUT_VARNAME_PREFIX), nameInQuery: v}));
            var defaultVar = undefined;
            if (varNames.includes(DEFAULT_OUTPUT_VARNAME)) {
                defaultVar = DEFAULT_OUTPUT_VARNAME;
            } else if (varNames.length === 1) {
                defaultVar = varNames[0];
            }
            output = {default: defaultVar, named: namedVarsMap};
        } else {
            // TODO: get list of all free vars in query
            // TODO: extract from them DEFAULT_OUTPUT_VARNAME and vars starting with OUTPUT_VARNAME_PREFIX
        }
    }
    if (query.type === Algebra.types.PROJECT) {
        const project = query as Algebra.Project;
        if (output) {
            assert.ok(
                    allVars(output).every(
                            varName => project.variables.some(v => v.value === varName)),
                    "Some variables defined in mapping but not found in projection");
        }
        query = project.input;
    }
    const bindingSources = config.input ? getSourceAndMappings(config.input) : ([] as S.TabularSourceAndMapping[]);
    if (!config.dataset) {
        config.dataset = datasetSourceFromBindingSources(defaultBindingSources(bindingSources));
    }
    if (!config.dataset) {
        config.dataset = datasetSourceFromBindingSources(allBindingSources(bindingSources));
    }
    assert.notStrictEqual(config.dataset, undefined, "Could not infer any dataset source");
    return new S.SelectQuerySource(output, query, config.dataset, bindingSources);
}
