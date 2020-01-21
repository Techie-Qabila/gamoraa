import grpc from 'grpc'
import {
    GrpcServerCallContext,
    GrpcUntypedServiceImplementation,
} from './context'
import {
    GrpcServerMiddleware,
    Middie,
    MiddlewareInfo,
    getMiddlewaresForHandler,
} from './middleware'

/**
 *
 */
export interface ServiceInfo {
    readonly packageName?: string
    readonly protoFilePath: string
    readonly serviceName: string
    readonly implimentation: GrpcUntypedServiceImplementation
    readonly middlewares: Array<MiddlewareInfo<any, any>>
    serviceDefination?: any
}

/**
 *
 */
export class ServiceImplContext {
    private readonly serviceInfo: ServiceInfo

    constructor(serviceInfo: ServiceInfo) {
        this.serviceInfo = serviceInfo
    }

    /**
     *
     * @param middleware
     * @param path
     */
    with(
        middleware:
            | GrpcServerMiddleware<any, any>
            | ReadonlyArray<GrpcServerMiddleware<any, any>>,
        path?: string
    ): ServiceImplContext {
        if (Array.isArray(middleware)) {
            for (const m of middleware) {
                this.serviceInfo.middlewares.push({
                    middleware: m,
                    path: path,
                })
            }
        } else {
            this.serviceInfo.middlewares.push({
                middleware: middleware as GrpcServerMiddleware<any, any>,
                path: path,
            })
        }

        return this
    }
}

export class ServiceInfoBuilder {
    private readonly services: Array<ServiceInfo>

    constructor() {
        this.services = []
    }

    add(info: ServiceInfo) {
        this.services.push(info)
    }

    build(): ReadonlyArray<ServiceInfo> {
        return this.services
    }
}

export function buildServiceProxy(
    globalMiddlewares: ReadonlyArray<GrpcServerMiddleware<any, any>>,
    serviceInfo: ServiceInfo
): grpc.UntypedServiceImplementation {
    const service =
        serviceInfo.serviceDefination[serviceInfo.serviceName].service

    const serviceImpl: grpc.UntypedServiceImplementation = {}
    for (const rpc in service) {
        if (service.hasOwnProperty(rpc)) {
            const rpcDef = service[rpc]
            const userHandler = serviceInfo.implimentation[rpcDef.originalName]
            if (!userHandler) {
                throw new Error(
                    `${serviceInfo.serviceName}.${rpcDef.originalName} expected but not provided`
                )
            }

            const handlerMiddlewares = getMiddlewaresForHandler(
                rpcDef.originalName,
                serviceInfo.middlewares
            )
            const allMiddleware = [...globalMiddlewares, ...handlerMiddlewares]
            //
            function middieCompleter(
                err: grpc.ServiceError | null,
                context: GrpcServerCallContext<any, any>
            ) {
                if (err) {
                    context.halt(err)
                } else {
                    userHandler(context)
                }
            }
            // handle rpc where client request once and server response back once
            if (
                rpcDef.requestStream === false &&
                rpcDef.responseStream === false
            ) {
                function unaryCallHandler(
                    call: grpc.ServerUnaryCall<any>,
                    callback: grpc.sendUnaryData<any>
                ) {
                    const callContext = new GrpcServerCallContext<any, any>(
                        call,
                        callback
                    )
                    if (allMiddleware.length == 0) {
                        userHandler(callContext)
                    } else {
                        const middie = new Middie(
                            allMiddleware,
                            middieCompleter
                        )
                        middie.run(callContext)
                    }
                }

                serviceImpl[rpcDef.originalName] = unaryCallHandler
            } else if (
                // handle rpc where client request once and server response back as stream
                rpcDef.requestStream === false &&
                rpcDef.responseStream === true
            ) {
                function streamCallHandler(
                    call: grpc.ServerWritableStream<any>
                ) {
                    const callContext = new GrpcServerCallContext<any, any>(
                        call
                    )
                    if (allMiddleware.length == 0) {
                        userHandler(callContext)
                    } else {
                        const middie = new Middie(
                            allMiddleware,
                            middieCompleter
                        )
                        middie.run(callContext)
                    }
                }

                serviceImpl[rpcDef.originalName] = streamCallHandler
            }
        }
    }
    return serviceImpl
}
