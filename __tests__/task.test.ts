import TaskFactory from '../src/taskFactory';
import {stringifyTask} from '../src/utils'

let taskFactory = new TaskFactory();

let action1 = taskFactory.createAction(() => {console.log('Action 1')});
let action2 = taskFactory.createAction(() => {console.log('Action 2')});
let action3 = taskFactory.createAction(() => {console.log('Action 3')});
let action4 = taskFactory.createAction(() => {console.log('Action 4')});
let action5 = taskFactory.createAction(() => {console.log('Action 5')});

console.log(stringifyTask(action1));