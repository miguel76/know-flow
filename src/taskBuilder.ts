import TaskFactory from './taskFactory';
import * as RDF from "rdf-js";
import { Algebra, Factory } from 'sparqlalgebrajs';
import { Table, Task } from './task';

export default class TaskBuilder {

    taskFactory: TaskFactory;
    // tasks: Task<any>[];
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

    // task(): Task<any> {
    //     return this.generateTask()
    // }

    // addTask(newTask: Task<any>): void {
    //     this.tasks.push(newTask);
    // }

    derive(localGenerateTask: (localTask: Task<any>) => Task<any>): TaskBuilder {
        return new TaskBuilder({
            taskFactory: this.taskFactory,
            generateTask: (task: Task<any>) => this.generateTask(localGenerateTask(task))
        });
    }

    static isTaskBuilder(t: Task<any> | TaskBuilder): t is TaskBuilder {
        return 'generateTask' in t;
    }

    next<ReturnType>(
            task: Task<ReturnType> | {[key: string]: Task<unknown>} | Task<unknown> []): TaskApplier<unknown> {
        if (Array.isArray(task)) {
            return this.next(this.taskFactory.createParallel(task));
        } else {
            if (task.taskType === undefined || typeof task.taskType === 'object') {
                return this.next(this.taskFactory.createParallelDict(
                        <{[key: string]: Task<unknown>}> task));
            } else {
                return new TaskApplier<ReturnType>(
                    this.generateTask(<Task<ReturnType>> task),
                    this.taskFactory);
                };
        }
    }

    action<ReturnType>(exec: (input: Table) => ReturnType): Task<ReturnType> {
        return this.next(this.taskFactory.createAction({exec}));
    }

    actionAsync<ReturnType>(exec: (input: Table) => Promise<ReturnType>): Task<ReturnType> {
        return this.next(this.taskFactory.createActionAsync({exec}));
    }

    traverse(predicate: Algebra.PropertyPathSymbol | RDF.Term | string): TaskBuilder {
        return this.derive((task: Task<any>) => this.taskFactory.createTraverse({
            next: task, predicate
        }));
    }

    forEach(predicate?: Algebra.PropertyPathSymbol | RDF.Term | string): TaskBuilder {
        return this.derive((task: Task<any>) => this.taskFactory.createForEach({
            subtask: task, predicate
        }));
    }

    value(predicate?: Algebra.PropertyPathSymbol | RDF.Term | string): TaskApplier<any> {
        return this.next(this.taskFactory.createValueReader({predicate: predicate}));
    }

    input(bindings:
            {[key: string]: RDF.Term | string}[] |
            {[key: string]: RDF.Term | string} | 
            (RDF.Term | string)[] |
            RDF.Term | string): TaskBuilder {
        return this.derive((task: Task<any>) => this.taskFactory.createValues({
            bindings, next: task
        }));
    }

}

class TaskApplier<ReturnType> implements Task<ReturnType> {

    __task: Task<ReturnType>;
    __taskFactory: TaskFactory;
    taskType: string;

    constructor(task: Task<ReturnType>, taskFactory: TaskFactory) {
        this.__task = task;
        this.taskType = task.taskType;
        this.__taskFactory = taskFactory;
        return new Proxy(this, {
            get: function (target, prop, receiver) {
                if (typeof prop === 'string' && !["__task", "__taskFactory"].includes(prop)) {
                    return (<any> target.__task)[prop];
                } else {
                    return (<any> target)[prop];
                }
            }
        });
    }

    apply<NewReturnType>(exec: (x:ReturnType) => NewReturnType): TaskApplier<NewReturnType> {
        return new TaskApplier<NewReturnType>(
                this.__taskFactory.createCascade({task: this.__task, action: exec}),
                this.__taskFactory);
    }

    applyAsync<NewReturnType>(exec: (x:ReturnType) => Promise<NewReturnType>): TaskApplier<NewReturnType> {
        return new TaskApplier<NewReturnType>(
                this.__taskFactory.createCascadeAsync({task: this.__task, action: exec}),
                this.__taskFactory);
    }
}
