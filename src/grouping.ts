import { Map } from 'immutable'
import { Bindings } from '@comunica/types'
import { Table } from './table'
import { ArrayIterator, AsyncIterator } from 'asynciterator'
import { getItemsAsArray, SplitIterator } from './iterators'
import { Term } from '@rdfjs/types'

function compareTerms(term1: Term, term2: Term): number {
  return term1 === undefined
    ? term2 === undefined
      ? 0
      : -1
    : term2 === undefined
    ? +1
    : term1.termType < term2.termType
    ? -1
    : term1.termType > term2.termType
    ? +1
    : term1.value < term2.value
    ? -1
    : term1.value > term2.value
    ? +1
    : 0
}

export async function group(
  input: Table,
  groupingVariables: string[]
): Promise<AsyncIterator<{ groupBindings: Bindings; members: Table }>> {
  const bindingsArray = await getItemsAsArray(input.bindingsStream)
  const sortedGroups = bindingsArray.sort((bindings1, bindings2) => {
    for (let varIndex = 0; varIndex < groupingVariables.length; varIndex++) {
      const varname = groupingVariables[varIndex]
      const value1 = bindings1.get(varname)
      const value2 = bindings2.get(varname)
      const compResult = compareTerms(value1, value2)
      if (compResult !== 0) {
        return compResult
      }
    }
    return 0
  })
  return groupOrdered(
    {
      variables: input.variables,
      canContainUndefs: input.canContainUndefs,
      bindingsStream: new ArrayIterator(sortedGroups)
    },
    groupingVariables
  )
}

export function groupOrdered(
  input: Table,
  groupingVariables: string[]
): AsyncIterator<{ groupBindings: Bindings; members: Table }> {
  console.log(
    'In groupOrdered with grouping variables [' +
      groupingVariables +
      '] over variables [' +
      input.variables +
      ']'
  )
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
