// Notion API 관련 타입 정의

export interface NotionRichText {
  type: 'text'
  text: {
    content: string
    link?: {
      url: string
    } | null
  }
  annotations: {
    bold: boolean
    italic: boolean
    strikethrough: boolean
    underline: boolean
    code: boolean
    color: string
  }
  plain_text: string
  href?: string | null
}

export interface NotionBlock {
  object: 'block'
  type: string
  id?: string
  created_time?: string
  last_edited_time?: string
  has_children?: boolean
  archived?: boolean
  [key: string]: unknown
}

export interface NotionParagraphBlock extends NotionBlock {
  type: 'paragraph'
  paragraph: {
    rich_text: NotionRichText[]
    color?: string
  }
}

export interface NotionHeadingBlock extends NotionBlock {
  type: 'heading_1' | 'heading_2' | 'heading_3'
  heading_1?: {
    rich_text: NotionRichText[]
    color?: string
    is_toggleable?: boolean
  }
  heading_2?: {
    rich_text: NotionRichText[]
    color?: string
    is_toggleable?: boolean
  }
  heading_3?: {
    rich_text: NotionRichText[]
    color?: string
    is_toggleable?: boolean
  }
}

export interface NotionBulletedListItemBlock extends NotionBlock {
  type: 'bulleted_list_item'
  bulleted_list_item: {
    rich_text: NotionRichText[]
    color?: string
    children?: NotionBlock[]
  }
}

export interface NotionNumberedListItemBlock extends NotionBlock {
  type: 'numbered_list_item'
  numbered_list_item: {
    rich_text: NotionRichText[]
    color?: string
    children?: NotionBlock[]
  }
}

export interface NotionDividerBlock extends NotionBlock {
  type: 'divider'
  divider: Record<string, never>
}

// 테이블 블록 타입
export interface NotionTableBlock extends NotionBlock {
  type: 'table'
  table: {
    table_width: number
    has_column_header: boolean
    has_row_header: boolean
    children: NotionTableRowBlock[]
  }
}

export interface NotionTableRowBlock extends NotionBlock {
  type: 'table_row'
  table_row: {
    cells: NotionRichText[][]
  }
}

export interface NotionPage {
  id: string
  object: 'page'
  created_time: string
  last_edited_time: string
  parent: {
    type: 'database_id'
    database_id: string
  }
  properties: Record<string, unknown>
  url: string
}

export interface NotionCreatePageRequest {
  parent: {
    database_id: string
  }
  properties: Record<string, unknown>
  children?: NotionBlock[]
}

