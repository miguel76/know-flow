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
    let show = taskFactory.createActionOnFirst({
        exec: bindings => {
            let term = bindings.get('?_');
            return attrLabel + ': ' + (term ? term.value : '?');
        }
    });
    let filterAndShow = language ?
            taskFactory.createFilter({
                expression: 'langMatches( lang(?_), "' + language + '" )',
                next: show
            }) :
            show;
    return taskFactory.createTraverse({
        predicate: attrPath,
        next: filterAndShow
    });
}

let showLanguage = taskFactory.createCascade({
    task: taskFactory.log(taskFactory.createParallel({
            subtasks: [
                taskFactory.log(showAttr('rdfs:label', 'Name', 'en'), "Show Label"),
                taskFactory.log(showAttr(wdt.ISO_639_3_code, 'ISO Code'), "Show Code")
            ]
    }), "Seq of attrs"),
    action: (lines: string[]) => lines.join('\n')
});

let showLanguageList = taskFactory.createCascade<string[],string>({
    task: taskFactory.createForEach({subtask: showLanguage}),
    action: (lines: string[]) => lines.join('\n')
});

let showLanguagesForCountrySimple = taskFactory.createTraverse({
    predicate: `^${wdt.country}`,
    next: taskFactory.createFilter({
            expression: `EXISTS {?_ ${wdt.instanceOf} ${wd.ModernLanguage}}`,
            next: showLanguageList
    }),
});

let showLanguagesForCountry = taskFactory.createJoin({
    right: `?language ${wdt.instanceOf} ${wd.ModernLanguage}; ${wdt.country} ?_`,
    newDefault: '?language',
    hideCurrVar: true,
    next: showLanguageList
});
                
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
    {
        input: tableFromArray([{
            '?_': dataFactory.namedNode('http://www.wikidata.org/entity/Q38')
        }]),
        engine: proxyEngine, queryContext
    }).then(console.log, console.error);

