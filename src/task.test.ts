import TaskFactory from './taskFactory';
import {stringifyTask} from './utils';
import {executeTask} from './taskEngine';

let options = {
    prefixes: {
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#'
    }
};

let taskFactory = new TaskFactory(options);

let action1 = taskFactory.createConstant('Action 1');
let action2 = taskFactory.createConstant('Action 2');
let action3 = taskFactory.createConstant('Action 3');
let action4 = taskFactory.createConstant('Action 4');
let action5 = taskFactory.createConstant('Action 5');

let taskSeq = taskFactory.createTaskSequence([action1, action2, action3]);
let forEach = taskFactory.createForEach(action1);

let traverse = taskFactory.createTraverse(action4, 'rdf:type');

let join = taskFactory.createJoin(action4, '$_ rdf:type rdf:List; rdfs:label "ciccio"');

let filter = taskFactory.createFilter(action5, '$_ = "pluto"');

console.log(action1);
console.log(stringifyTask(action1));

console.log(stringifyTask(taskSeq));
console.log(stringifyTask(forEach));

console.log(stringifyTask(traverse));

console.log(stringifyTask(join));

console.log(filter);
console.log(stringifyTask(filter));

// executeTask(action1).then(console.log, console.error)