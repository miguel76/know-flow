import {
  AsyncIterator,
  BufferedIterator,
  SimpleTransformIterator
} from 'asynciterator'

class WritableIterator<ItemType> extends BufferedIterator<ItemType> {
  write(item: ItemType) {
    this._push(item)
  }
}

export function getItemsAsArray<ItemType>(
  iterator: AsyncIterator<ItemType>
): Promise<ItemType[]> {
  return new Promise((resolve, reject) => {
    const items: ItemType[] = []
    iterator.on('data', (item: ItemType) => {
      items.push(item)
    })
    iterator.on('end', () => {
      resolve(items)
    })
    iterator.on('error', (error) => {
      reject(error)
    })
  })
}

type Group<GroupIdType, ItemType> = {
  groupId: GroupIdType
  members: AsyncIterator<ItemType>
}

type WritableGroup<GroupIdType, ItemType> = {
  groupId: GroupIdType
  members: WritableIterator<ItemType>
}

export class SplitIterator<
  ItemType,
  GroupIdType
> extends SimpleTransformIterator<ItemType, Group<GroupIdType, ItemType>> {
  groupOf: (item: ItemType) => GroupIdType
  belongsToGroup: (item: ItemType, group: GroupIdType) => boolean
  currGroup: WritableGroup<GroupIdType, ItemType> | undefined

  constructor(
    inputIterator: AsyncIterator<ItemType>,
    groupOf: (item: ItemType) => GroupIdType,
    belongsToGroup: (item: ItemType, group: GroupIdType) => boolean
  ) {
    super(inputIterator)
    this.groupOf = groupOf
    this.belongsToGroup = belongsToGroup
  }

  protected _transform(
    item: ItemType,
    done: () => void,
    push: (group: Group<GroupIdType, ItemType>) => void
  ) {
    if (
      this.currGroup === undefined ||
      !this.belongsToGroup(item, this.currGroup.groupId)
    ) {
      if (this.currGroup) {
        this.currGroup.members.close()
      }
      this.currGroup = {
        groupId: this.groupOf(item),
        members: new WritableIterator()
      }
      push(this.currGroup)
    }
    this.currGroup.members.write(item)
    done()
  }

  close() {
    if (this.currGroup !== undefined) {
      this.currGroup.members.close()
    }
    super.close()
  }
}
