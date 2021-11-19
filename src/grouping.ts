import { Map } from 'immutable'
import { Bindings } from '@comunica/types'
import { Table } from './flow'
import { AsyncIterator } from 'asynciterator'
import { SplitIterator } from './iterators'
import { Term } from '@rdfjs/types'

export function groupOrdered(
  input: Table,
  groupingVariables: string[]
): AsyncIterator<{ groupBindings: Bindings; members: Table }> {
  return new SplitIterator(
    input.bindingsStream,
    (bindings) =>
      Map<string, Term>(
        bindings.filter((term, varname) => groupingVariables.includes(varname))
      ),
    (itemBindings, groupBindings) => itemBindings.isSuperset(groupBindings)
  ).map((splitIteratorItem) => ({
    groupBindings: splitIteratorItem.groupId,
    members: {
      bindingsStream: splitIteratorItem.members,
      variables: input.variables,
      canContainUndefs: input.canContainUndefs
    }
  }))
}
