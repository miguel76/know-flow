import { AsyncIterator } from 'asynciterator'

export class LookAheadIterator<T> extends AsyncIterator<T> {
  inputIterator: AsyncIterator<T>
  lookAhead: T

  constructor(inputIterator: AsyncIterator<T>) {
    super()
    this.readAhead()
  }

  private readAhead() {
    if (this.inputIterator.readable) {
      this.lookAhead = this.inputIterator.read()
    } else {
      this.close()
    }
  }

  read(): T {
    const returnValue = this.lookAhead
    this.readAhead()
    return returnValue
  }
}

export class WhileIterator<T> extends AsyncIterator<T> {
  inputIterator: LookAheadIterator<T>
  expression: (item: T) => boolean
  afterWhile: () => void | undefined

  constructor(
    expression: (item: T) => boolean,
    inputIterator: LookAheadIterator<T>,
    afterWhile?: () => void
  ) {
    super()
    this.expression = expression
    this.inputIterator = inputIterator
    this.afterWhile = afterWhile
    this.closeIfNotTrue()
  }

  read(): T {
    if (this.closed) {
      return null
    } else {
      const returnValue = this.inputIterator.read()
      this.closeIfNotTrue()
      return returnValue
    }
  }

  private closeIfNotTrue() {
    if (
      this.inputIterator.closed ||
      !this.expression(this.inputIterator.lookAhead)
    ) {
      this.close()
      if (this.afterWhile !== undefined) {
        this.afterWhile()
      }
    }
  }
}

export class SplitIterator<T, G> extends AsyncIterator<{
  group: G
  members: AsyncIterator<T>
}> {
  inputIterator: LookAheadIterator<T>
  groupOf: (item: T) => G
  belongsToGroup: (item: T, group: G) => boolean
  currGroup: G | undefined
  currWhileIterator: WhileIterator<T> | undefined

  constructor(
    inputIterator: AsyncIterator<T>,
    groupOf: (item: T) => G,
    belongsToGroup: (item: T, group: G) => boolean
  ) {
    super()
    this.inputIterator = new LookAheadIterator(inputIterator)
    this.groupOf = groupOf
    this.belongsToGroup = belongsToGroup
    this.loadNewIterator()
  }

  read(): { group: G; members: AsyncIterator<T> } {
    return {
      group: this.currGroup,
      members: this.currWhileIterator
    }
  }

  private loadNewIterator() {
    if (this.inputIterator.closed) {
      this.currGroup = undefined
      this.currWhileIterator = undefined
      this.close()
    } else {
      const group = this.groupOf(this.inputIterator.lookAhead)
      this.currGroup = group
      this.currWhileIterator = new WhileIterator(
        (item) => this.belongsToGroup(item, group),
        this.inputIterator,
        this.loadNewIterator
      )
    }
  }
}
