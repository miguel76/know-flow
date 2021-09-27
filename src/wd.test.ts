import TaskFactory from './taskFactory';
import {stringifyTask, toSparqlFragment} from './utils';
import {executeTask, NO_BINDING_SINGLETON_TABLE, tableUnion, tableFromArray} from './taskEngine';
import {newEngine} from '@comunica/actor-init-sparql';
import { Task } from '.';
import { Factory } from 'sparqlalgebrajs';

const engine = newEngine();
let algebraFactory = new Factory();
let dataFactory = algebraFactory.dataFactory;


let options = {
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'dbo': 'http://dbpedia.org/ontology/',
        'dbr': 'http://dbpedia.org/resource/',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/entity/'
    }
};

let queryContext = {
    sources: [{ type: 'sparql', value: 'https://query.wikidata.org/' }]
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
    country: 'wdt:Q38',
    ISO_639_3_code: 'wdt:P220'
};

let wd = {
    italy: 'wd:Q38',
    ModernLanguage: 'wd:Q1288568'
}

function showAttr(attrPath: string, attrLabel: string, language?: string): Task<string> {
    let show = taskFactory.createSimpleActionOnFirst(bindings =>
            attrLabel + ': ' + bindings.get('?_').value);
    let filterAndShow = language ?
            taskFactory.createFilter(show, 'langMatches( lang(?_), "' + language + '" )') :
            show;
    return taskFactory.createTraverse(filterAndShow, attrPath);
}

let showLanguage =
        taskFactory.createSimpleCascade(
                taskFactory.createTaskSequence([
                    showAttr('rdfs:label', 'Name'),
                    showAttr(wdt.ISO_639_3_code, 'ISO Code')
                ]), (lines: string[]) => lines.join('\n'));

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
        '?language ${wdt.instanceOf} ${wd.ModernLanguage}; ${wdt.country} ?_',
        '?language', true);
                
// executeTask(action1).then(console.log, console.error)


// executeTask(showLanguages, NO_BINDING_SINGLETON_TABLE, engine, queryContext).then(console.log, console.error);

executeTask(
    showLanguage,
    tableFromArray([{
        '?_': dataFactory.namedNode('Q9027')
    }]),
    engine, queryContext).then(console.log, console.error);

    
// executeTask(
//     showAttr('rdfs:label', 'Name', 'EN'),
//     tableFromArray([{
//         '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
//     }]),
//     engine, queryContext).then(console.log, console.error);
    