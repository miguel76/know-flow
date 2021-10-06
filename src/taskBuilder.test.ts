import {TaskBuilder, TaskEngine, stringifyTask} from './index';
import {newEngine as newComunicaEngine} from '@comunica/actor-init-sparql';
import { ActionContext, IActorQueryOperationOutput, IActorQueryOperationOutputBindings, IQueryEngine } from '@comunica/types';
import { Algebra } from 'sparqlalgebrajs';
import { toSparqlFragment } from './utils';

const tb =  new TaskBuilder({
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/prop/direct/'
    }
});

let getLabel = tb.value('rdfs:label');

let adorno = tb.input('wd:Q152388');
let hegel = tb.input('wd:Q9235');

let labelOfAdorno = adorno.next(getLabel);

// let getPersonInfo = tb.next({
//     name: tb.value('wdt:P735'),
//     surname: tb.value('wdt:P734'),
//     dateOfBirth: tb.value('wdt:P569')
// });

let getPersonInfo = tb.next({
    name: tb.value('wdt:P1559'),
    dateOfBirth: tb.value('wdt:P569'),
    dateOfDeath: tb.value('wdt:P570')
});

let infoOnAdorno = adorno.next(getPersonInfo);
let infoOnHegel = hegel.next(getPersonInfo);

let getStudentsInfo = tb.forEach('wdt:P802').next(getPersonInfo);

let adornoStudentsInfo = adorno.next(getStudentsInfo);
let hegelStudentsInfo = hegel.next(getStudentsInfo);

// const engine = newEngine();

let engine = newComunicaEngine();

let proxyEngine: IQueryEngine = {
    query: async (queryOp: Algebra.Operation, queryContext: any) => {
        console.log('');
        console.log('Executing...');
        console.log(toSparqlFragment(queryOp));
        const res = <IActorQueryOperationOutputBindings>await engine.query(queryOp, queryContext);
        console.log('Result variables :' + res.variables);
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

console.log(JSON.stringify(stringifyTask(infoOnAdorno), null, 4));
console.log(JSON.stringify(stringifyTask(adornoStudentsInfo), null, 4));

let te = new TaskEngine({
    // engine: newComunicaEngine(),
    engine: proxyEngine,
    queryContext: {
        sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
    }
});

te.run(infoOnAdorno).then(console.log, console.error);
// {
//   name: 'Theodor Ludwig Wiesengrund Adorno',
//   dateOfBirth: '1903-09-11T00:00:00Z',
//   dateOfDeath: '1969-08-06T00:00:00Z'
// }

te.run(infoOnHegel).then(console.log, console.error);

te.run(adornoStudentsInfo).then(console.log, console.error);

te.run(hegelStudentsInfo).then(console.log, console.error);
