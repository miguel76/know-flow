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

In Javascript/Typescript code, import the task builder and task engine:

```ts
import {TaskBuilder,TaskEngine} from 'know-flow';
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
```


## Executing the tasks 

Create an instance of the task engine, pointing to the wikidata public endpoint:

```ts
let te = new TaskEngine({
    queryContext: {
        sources: [{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }]
    }
});
```

Execute the tasks and print the results when done:

```ts
te.run(infoOnAdorno).then(console.log, console.error);
```
