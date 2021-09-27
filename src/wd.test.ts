import TaskFactory from './taskFactory';
import {stringifyTask, toSparqlFragment} from './utils';
import {executeTask, NO_BINDING_SINGLETON_TABLE, tableUnion, tableFromArray} from './taskEngine';
import {newEngine} from '@comunica/actor-init-sparql';
import { Task } from '.';
import { Factory, Algebra } from 'sparqlalgebrajs';
import { ActionContext, IActorQueryOperationOutput, IActorQueryOperationOutputBindings, IQueryEngine } from '@comunica/types';

const engine = newEngine();
let algebraFactory = new Factory();
let dataFactory = algebraFactory.dataFactory;

let proxyEngine: IQueryEngine = {
    query: async (queryOp: Algebra.Operation, queryContext: any) => {
        // console.log('');
        // console.log('Executing...');
        // console.log(toSparqlFragment(queryOp));
        const res = <IActorQueryOperationOutputBindings>await engine.query(queryOp, queryContext);
        // console.log('Result variables :' + res.variables);
        return res;
    },
    getResultMediaTypes: function (context?: ActionContext): Promise<Record<string, number>> {
        throw new Error('Function not implemented.');
    },
    getResultMediaTypeFormats: function (context?: ActionContext): Promise<Record<string, string>> {
        throw new Error('Function not implemented.');
    },
    resultToString: function (queryResult: IActorQueryOperationOutput, mediaType?: string, context?: any) {
        throw new Error('Function not implemented.');
    },
    invalidateHttpCache: function (url?: string): Promise<any> {
        throw new Error('Function not implemented.');
    }
};


let options = {
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'dbo': 'http://dbpedia.org/ontology/',
        'dbr': 'http://dbpedia.org/resource/',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/prop/direct/'
    }
};

let queryContext = {
    sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
};



let taskFactory = new TaskFactory(options);

// select ?language ?languageLabel WHERE {
//     ?language wdt:P31 wd:Q1288568;
//               wdt:P17 wd:Q38.
//      SERVICE wikibase:label {
//        bd:serviceParam wikibase:language "en" .
//      }
//   } limit 200

let wdt = {
    instanceOf: 'wdt:P31',
    country: 'wdt:P17',
    ISO_639_3_code: 'wdt:P220'
};

let wd = {
    italy: 'wd:Q38',
    ModernLanguage: 'wd:Q1288568'
}

function showAttr(attrPath: string, attrLabel: string, language?: string): Task<string> {
    let show = taskFactory.createSimpleActionOnFirst(bindings => {
        let term = bindings.get('?_');
        return attrLabel + ': ' + (term ? term.value : '?');
    });
    let filterAndShow = language ?
            taskFactory.createFilter(show, 'langMatches( lang(?_), "' + language + '" )') :
            show;
    return taskFactory.createTraverse(filterAndShow, attrPath);
}

let showLanguage =
        taskFactory.createSimpleCascade(
            taskFactory.log(taskFactory.createTaskSequence([
                    taskFactory.log(showAttr('rdfs:label', 'Name', 'en'), "Show Label"),
                    taskFactory.log(showAttr(wdt.ISO_639_3_code, 'ISO Code'), "Show Code")
                ]), "Seq of attrs"), (lines: string[]) => lines.join('\n'));

let showLanguageList =
        taskFactory.createSimpleCascade(
                taskFactory.createForEach(showLanguage),
                (lines: string[]) => lines.join('\n'));

let showLanguagesForCountrySimple = taskFactory.createTraverse(
        taskFactory.createFilter(showLanguageList,
            `EXISTS {?_ ${wdt.instanceOf} ${wd.ModernLanguage}}`),
        `^${wdt.country}`
);

let showLanguagesForCountry = taskFactory.createJoin(
        showLanguageList,
        `?language ${wdt.instanceOf} ${wd.ModernLanguage}; ${wdt.country} ?_`,
        '?language', true);
                
// executeTask(action1).then(console.log, console.error)


// executeTask(showLanguages, NO_BINDING_SINGLETON_TABLE, engine, queryContext).then(console.log, console.error);

// executeTask(
//     showLanguage,
//     tableFromArray([{
//         '?_': dataFactory.namedNode('http://www.wikidata.org/entity/Q9027')
//     }]),
//     proxyEngine, queryContext).then(console.log, console.error);

    
// executeTask(
//     showAttr('rdfs:label', 'Name', 'en'),
//     tableFromArray([{
//         '?_': dataFactory.namedNode('http://www.wikidata.org/entity/Q9027')
//     }]),
//     engine, queryContext).then(console.log, console.error);

executeTask(
    showLanguagesForCountry,
    tableFromArray([{
        '?_': dataFactory.namedNode('http://www.wikidata.org/entity/Q38')
    }]),
    proxyEngine, queryContext).then(console.log, console.error);

