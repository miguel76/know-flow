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

## Building simple flows 

In this example we will build simple flows to generate JSON from a knowledge graph which uses Wikidata schema.

To execute the queries, a query engine is needed. We will be using the Comunica SPARQL engine in this example. Install it with:

```shell
$ npm install @comunica/actor-init-sparql
```

In Javascript/Typescript code, import the flow builder and flow engine, alongside the Comunica query engine:

```ts
import {FlowBuilder,FlowEngine} from 'know-flow';
import {newEngine as newComunicaEngine} from '@comunica/actor-init-sparql';
```

Create an instance of the flow builder:

```ts
const tb =  new FlowBuilder({
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'wd': 'http://www.wikidata.org/entity/',
        'wdt': 'http://www.wikidata.org/prop/direct/'
    }
});
```

Create a flow to get the label of the current default resource (which will depend on the dynamic context of execution of the flow).

```ts
let getLabel = tb.value('rdfs:label');
```

Create a flow to get basic anagraphic information (the default resource is expected in this case to be a person).

```ts
let getPersonInfo = tb.next({
    name: tb.value('wdt:P1559'),
    dateOfBirth: tb.value('wdt:P569'),
    dateOfDeath: tb.value('wdt:P570')
});
```

Create a flow to list the students of a person (e.g., a philosopher):

```ts
let getStudentsInfo = tb.forEach('wdt:P1066').next(getPersonInfo);
```

Define flows that add some input data:

```ts
let hegel = tb.input('wd:Q9235');
let adorno = tb.input('wd:Q152388');

let infoOnHegel = hegel.next(getPersonInfo);
let infoOnAdorno = adorno.next(getPersonInfo);
let hegelStudentsInfo = hegel.next(getStudentsInfo);
let adornoStudentsInfo = adorno.next(getStudentsInfo);
```


## Executing the flows 

Create an instance of the flow engine, pointing to the wikidata public endpoint:

```ts
let te = new FlowEngine({
    engine: newComunicaEngine(),
    queryContext: {
        sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
    }
});
```

Execute the flows and print the results when done:

```ts
te.run(infoOnHegel).then(console.log, console.error);
// {
//   name: 'Georg Wilhelm Friedrich Hegel',
//   dateOfBirth: '1770-08-27T00:00:00Z',
//   dateOfDeath: '1831-11-14T00:00:00Z'
// }

te.run(infoOnAdorno).then(console.log, console.error);
// {
//   name: 'Theodor Ludwig Wiesengrund Adorno',
//   dateOfBirth: '1903-09-11T00:00:00Z',
//   dateOfDeath: '1969-08-06T00:00:00Z'
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
