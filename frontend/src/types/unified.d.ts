declare module 'unified' {
  export interface Plugin {
    (...args: any[]): any
  }
  
  export interface Processor {
    use(plugin: Plugin, ...args: any[]): this
    parse(content: string): any
  }

  export function unified(): Processor
}
