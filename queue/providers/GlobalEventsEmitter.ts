
export class GlobalEventsEmitterProvider {
  constructor(private readonly cb: (eventName: string, data?: any) => void) { }

  emit(eventName: string, data?: any): void {
    this.cb(eventName, data)
  }
}