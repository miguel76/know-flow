import TaskFactory from './taskFactory';
import {stringifyTask} from './utils'

let taskFactory = new TaskFactory();

let action1 = taskFactory.createAction(() => {console.log('Action 1')});
let action2 = taskFactory.createAction(() => {console.log('Action 2')});
let action3 = taskFactory.createAction(() => {console.log('Action 3')});
let action4 = taskFactory.createAction(() => {console.log('Action 4')});
let action5 = taskFactory.createAction(() => {console.log('Action 5')});

let taskSeq = taskFactory.createTaskSequence([action1, action2, action3]);
let forEach = taskFactory.createForEach(action1);

let traverse = taskFactory.createTraverse(action4, '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>');

console.log(action1);
console.log(stringifyTask(action1));

console.log(stringifyTask(taskSeq));
console.log(stringifyTask(forEach));

console.log(traverse);
console.log(stringifyTask(traverse));