import { ServiceError } from 'grpc'
import { GrpcServerCallContext } from './context'

/**
 *
 */
export type nextGrpcMiddlewareCallback = (err?: ServiceError) => void

/**
 *
 */
export type GrpcServerMiddleware<RequestType, ResponseType> = (
    context: GrpcServerCallContext<RequestType, ResponseType>,
    next: nextGrpcMiddlewareCallback
) => void

/**
 *
 */
export type onMiddieComplete = (
    err: ServiceError | null,
    context: GrpcServerCallContext<any, any>
) => void

/**
 *
 */
export class Middie {
    private readonly middlewares: ReadonlyArray<GrpcServerMiddleware<any, any>>
    private readonly complete: onMiddieComplete

    constructor(
        middlewares: ReadonlyArray<GrpcServerMiddleware<any, any>>,
        complete: onMiddieComplete
    ) {
        this.middlewares = middlewares
        this.complete = complete
    }

    /**
     *
     * @param context
     */
    run(context: GrpcServerCallContext<any, any>) {
        const middlewares = this.middlewares
        if (this.middlewares.length == 0) {
            this.complete(null, context)
            return
        }
        //
        let i = 1
        let that = this
        function next(err?: ServiceError) {
            if (err) {
                that.complete(err, context)
            } else if (middlewares.length === i) {
                that.complete(null, context)
            } else {
                const m = middlewares[i++]
                m(context, next)
            }
        }
        const m = this.middlewares[0]
        m(context, next)
    }
}

/**
 *
 */
export interface MiddlewareInfo<RequestType, ResponseType> {
    readonly path?: string
    readonly middleware: GrpcServerMiddleware<RequestType, ResponseType>
}

/**
 *
 * @param handler
 * @param middlewares
 */
export function getMiddlewaresForHandler(
    handler: string,
    middlewares: Array<MiddlewareInfo<any, any>>
): ReadonlyArray<GrpcServerMiddleware<any, any>> {
    const filteredMiddlewares: Array<GrpcServerMiddleware<any, any>> = []
    for (const mfi of middlewares) {
        if (mfi.path) {
            if (mfi.path == handler) {
                filteredMiddlewares.push(mfi.middleware)
            }
        } else {
            filteredMiddlewares.push(mfi.middleware)
        }
    }
    return filteredMiddlewares
}
