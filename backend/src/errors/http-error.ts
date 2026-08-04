export default class HttpError extends Error {
    status: number
    code?: string
    recoverable: boolean

    constructor(status: number, message: string, code?: string, recoverable = false) {
        super(message)
        this.name = 'HttpError'
        this.status = status
        this.code = code
        this.recoverable = recoverable
    }
}
