import {TaskBuilder} from './index';

const tb =  new TaskBuilder({
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/prop/direct/'
    }
});

let getLabel = tb.value('rdfs:label');

let adorno = tb.bind('wd:Q152388');
let hegel = tb.bind('wd:Q9235');

let labelOfAdorno = adorno.next(getLabel);

let getPersonInfo = tb.next({
    name: tb.value('wdt:P735'),
    surname: tb.value('wdt:P734'),
    dateOfBirth: tb.value('wdt:P569')
});

let infoOnAdorno = adorno.next(getPersonInfo);

let getStudentsInfo = tb.forEach('wdt:P1066').next(getPersonInfo);

let adornoStudentsInfo = adorno.next(getPersonInfo);

