
interface MxToolbarItem {
    name?: string,
    icon?: string,
    isIconDefault?: boolean
    listTitle?:string,
    list?: MxToolbarItem[]
    cmd?: string,
    isClosed?: boolean
    popoverProps?: Partial<import('vant').PopoverProps>
}