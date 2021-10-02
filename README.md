# know-flow
JS(TS) library to query a knowledge graph (aka linked data source) in a data-flow-oriented
template-like way.

It enables the development of data-aware modules which encapsulate both query and data-consuming logic. 
It is based on SPARQL (standard query language for linked data), but its knownledge is not needed for most of the features.
It can be potentially used to generate any kind of data structure. 

The library know-flow-react allows to use the paradigm in React.

## Installation

Add know-flow as a dependency to your project by executing the following command from the root folder of your project (assumes you are already using npm to manage it).

```shell
$ npm install know-flow
```

## Building simple tasks 

In this example we will build simple tasks to generate JSON from a knowledge graph which uses Wikidata schema.

To execute the queries, a query engine is needed. We will be using the Comunica SPARQL engine in this example. Install it with:

```shell
$ npm install @comunica/actor-init-sparql
```

In Javascript/Typescript code, import the task builder and task engine, alongside the Comunica query engine:

```ts
import {TaskBuilder,TaskEngine} from 'know-flow';
import {newEngine as newComunicaEngine} from '@comunica/actor-init-sparql';
```

Create an instance of the task builder:

```ts
const tb =  new TaskBuilder({
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/prop/direct/'
    }
});
```

Create a task to get the label of the current default resource (which will depend on the dynamic context of execution of the task).

```ts
let getLabel = tb.value('rdfs:label');
```

Create a task to get basic anagraphic information (the default resource is expected in this case to be a person).

```ts
let getPersonInfo = tb.next({
    name: tb.value('wdt:P735'),
    surname: tb.value('wdt:P734'),
    dateOfBirth: tb.value('wdt:P569')
});
```

Create a task to list the students of a person (e.g., a philosopher):

```ts
let getStudentsInfo = tb.forEach('wdt:P1066').next(getPersonInfo);
```

Define tasks that add some input data:

```ts
let adorno = tb.input('wd:Q152388');
let hegel = tb.input('wd:Q9235');

let infoOnAdorno = adorno.next(getPersonInfo);
let infoOnHegel = hegel.next(getPersonInfo);
let hegelStudentsInfo = hegel.next(getStudentsInfo);
```


## Executing the tasks 

Create an instance of the task engine, pointing to the wikidata public endpoint:

```ts
let te = new TaskEngine({
    engine: newComunicaEngine(),
    queryContext: {
        sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
    }
});
```

Execute the tasks and print the results when done:

```ts
te.run(infoOnAdorno).then(console.log, console.error);
// {
//   name: 'Theodor Ludwig Wiesengrund Adorno',
//   dateOfBirth: '1903-09-11T00:00:00Z',
//   dateOfDeath: '1969-08-06T00:00:00Z'
// }

te.run(infoOnHegel).then(console.log, console.error);
// {
//   name: 'Georg Wilhelm Friedrich Hegel',
//   dateOfBirth: '1770-08-27T00:00:00Z',
//   dateOfDeath: '1831-11-14T00:00:00Z'
// }

te.run(hegelStudentsInfo).then(console.log, console.error);
// [
//   {
//     name: 'Max Stirner',
//     dateOfBirth: '1806-10-25T00:00:00Z',
//     dateOfDeath: '1856-06-26T00:00:00Z'
//   }
// ]

te.run(adornoStudentsInfo).then(console.log, console.error);
// [
//   {
//     name: 'Jürgen Habermas',
//     dateOfBirth: '1929-06-18T00:00:00Z',
//     dateOfDeath: null
//   }
// ]
```
