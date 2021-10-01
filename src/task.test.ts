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
        'dbr': 'http://dbpedia.org/resource/'
    }
};

let queryContext = {
    sources: [{ type: 'sparql', value: 'https://dbpedia.org/sparql' }]
};

let taskFactory = new TaskFactory(options);

let table3 = tableFromArray([
    {}, {}, {}
]);

let action1 = taskFactory.createConstant('Action 1');
let action2 = taskFactory.createConstant('Action 2');
let action3 = taskFactory.createConstant('Action 3');
let action4 = taskFactory.createConstant('Action 4');
let action5 = taskFactory.createConstant('Action 5');

let taskSeq = taskFactory.createParallel([action1, action2, action3]);
let forEach = taskFactory.createForEach(action1);

let traverse = taskFactory.createTraverse({predicate: 'rdf:type', next: action4});

let join = taskFactory.createJoin({
    right: '$_ rdf:type rdf:List; rdfs:label "ciccio"',
    next: action5
});

let showList = {};

function showAttr(attrPath: string, attrLabel: string, language?: string): Task<string> {
    let show = taskFactory.createActionOnFirst(bindings =>
            attrLabel + ': ' + bindings.get('?_').value);
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

let showLanguage =
        taskFactory.createCascade({
            task: taskFactory.createParallel([
                    showAttr('rdf:label', 'Name'),
                    showAttr('dbo:iso6392Code', 'ISO Code'),
                    showAttr('dbo:languageFamily', 'Family')
            ]),
            action: (lines: string[]) => lines.join('\n')});

// let showLanguageList = taskFactory.createSimpleActionOnAll(ts => ts.bindingsArray.map(b => b.get('?_')));

// let showLanguages = taskFactory.createJoin(showLanguageList, '$_ rdf:type dbo:Language; dbo:spokenIn dbr:Italy');

let filter = taskFactory.createFilter({
    expression: '$_ = "pluto"',
    next: action5
});

console.log(action1);
console.log(stringifyTask(action1));

console.log(stringifyTask(taskSeq));
console.log(stringifyTask(forEach));

console.log(stringifyTask(traverse));

console.log(stringifyTask(join));

console.log(filter);
console.log(stringifyTask(filter));

// executeTask(action1).then(console.log, console.error)

executeTask(action1, table3, engine, queryContext).then(console.log, console.error);
executeTask(taskSeq, table3, engine, queryContext).then(console.log, console.error);
executeTask(forEach, table3, engine, queryContext).then(console.log, console.error);

// executeTask(showLanguages, NO_BINDING_SINGLETON_TABLE, engine, queryContext).then(console.log, console.error);

executeTask(
    showLanguage,
    tableFromArray([{
        '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
    }]),
    engine, queryContext).then(console.log, console.error);

    
executeTask(
    showAttr('rdfs:label', 'Name', 'EN'),
    tableFromArray([{
        '?_': dataFactory.namedNode('http://dbpedia.org/resource/Bari_dialect')
    }]),
    engine, queryContext).then(console.log, console.error);
    