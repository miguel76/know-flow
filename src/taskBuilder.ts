import TaskFactory from './taskFactory';
import * as RDF from "rdf-js";
import { Algebra, Factory } from 'sparqlalgebrajs';
import { Table, Task, Cascade } from './task';
import {promisifyFromSync} from './utils';

export default class TaskBuilder {

    taskFactory: TaskFactory;
    generateTask: (localTask: Task<any>) => Task<any>;

    constructor(options: {
        generateTask?: (localTask: Task<any>) => Task<any>,
        taskFactory?: TaskFactory,
        dataFactory?: RDF.DataFactory,
        algebraFactory?: Factory,
        quads?: boolean,
        prefixes?: {[prefix: string]: string},
        baseIRI?: string,
        blankToVariable?: boolean,
        sparqlStar?: boolean,
        onError?: (error: any) => void } = {}) {
        if (options.taskFactory) {
            this.taskFactory = options.taskFactory;
        } else {
            this.taskFactory = new TaskFactory(options);
        }
        this.generateTask = options.generateTask || (t => t);
    }

    derive(localGenerateTask: (localTask: Task<any>) => Task<any>): TaskBuilder {
        return new TaskBuilder({
            taskFactory: this.taskFactory,
            generateTask: (task: Task<any>) => this.generateTask(localGenerateTask(task))
        });
    }

    static isTaskBuilder(t: Task<any> | TaskBuilder): t is TaskBuilder {
        return 'generateTask' in t;
    }

    next<ReturnType>(obj: any): TaskApplier<unknown,unknown> {
        return new TaskApplier<ReturnType,ReturnType>(
                this.taskFactory,
                this.generateTask(this.taskFactory.createParallelFromObject(obj)),
                async x => x);
    }

    action<ReturnType>(exec: (input: Table) => ReturnType): Task<ReturnType> {
        return this.next(this.taskFactory.createAction({exec}));
    }

    actionAsync<ReturnType>(exec: (input: Table) => Promise<ReturnType>): Task<ReturnType> {
        return this.next(this.taskFactory.createActionAsync({exec}));
    }

    traverse(predicate: Algebra.PropertyPathSymbol | RDF.Term | string): TaskBuilder {
        return this.derive((task: Task<any>) => this.taskFactory.createTraverse({
            subtask: task, predicate
        }));
    }

    forEach(predicate?: Algebra.PropertyPathSymbol | RDF.Term | string): TaskBuilder {
        return this.derive((task: Task<any>) => this.taskFactory.createForEach({
            subtask: task, predicate
        }));
    }

    value(traverse?: Algebra.PropertyPathSymbol | RDF.Term | string): TaskApplier<any,any> {
        return this.next(this.taskFactory.createValueReader({traverse}));
    }

    input(bindings:
            {[key: string]: RDF.Term | string}[] |
            {[key: string]: RDF.Term | string} | 
            (RDF.Term | string)[] |
            RDF.Term | string): TaskBuilder {
        return this.derive((task: Task<any>) => this.taskFactory.createValues({
            bindings, subtask: task
        }));
    }

}

class TaskApplier<TaskReturnType, ActionReturnType> extends Cascade<TaskReturnType, ActionReturnType> {

    taskFactory: TaskFactory;

    constructor(
            taskFactory: TaskFactory,
            task: Task<TaskReturnType>,
            action: (x:TaskReturnType) => Promise<ActionReturnType>) {
        super(task, action);
        this.taskFactory = taskFactory;
    }

    apply<NewReturnType>(exec: (x:ActionReturnType) => NewReturnType):
            TaskApplier<ActionReturnType, NewReturnType> {
        return new TaskApplier<ActionReturnType, NewReturnType>(
                this.taskFactory, this.task, promisifyFromSync(exec));
    }

    applyAsync<NewReturnType>(exec: (x:ActionReturnType) => Promise<NewReturnType>):
            TaskApplier<ActionReturnType, NewReturnType> {
        return new TaskApplier<ActionReturnType, NewReturnType>(
                this.taskFactory, this.task, exec);
    }
}
