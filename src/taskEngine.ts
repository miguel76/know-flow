import {Task, Action, TaskSequence, ForEach, Traverse, Join, Filter} from './task';
import * as rdfjs from "rdf-js";

export function executeTask(
        task: Task,
        endpointURL: String,
        variables: rdfjs.Variable[],
        bindings: {[key: string]: rdfjs.Term}[]): void {
    switch(task.type) {
        
    }
}

export function generateQuery(task: Task): void {
    switch(task.type) {
        
    }
}