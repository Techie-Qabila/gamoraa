import Pino, { Logger } from 'pino'
import grpc from 'grpc'
import Avvio from 'avvio'
import { loadSync } from '@grpc/proto-loader'
import { GrpcUntypedServiceImplementation } from './context'
import { GrpcServerMiddleware } from './middleware'
import {
    ServiceInfo,
    ServiceInfoBuilder,
    ServiceImplContext,
    buildServiceProxy,
} from './service-proxy'
import avvio from 'avvio'
export { GrpcServerCallContext } from './context'
export { GrpcServerMiddleware, Middie, onMiddieComplete } from './middleware'

export type readyCallback = (done?: Function) => void

export interface ServerConfig {
    readonly address: string
    readonly port: number
    readonly logger?: Pino.LoggerOptions | Pino.DestinationStream
    readonly pluginTimeout?: number
}

export interface ServerState {
    started: boolean
    closing: boolean
    listening: boolean
}

export default class Server {
    private readonly config: ServerConfig
    private readonly middlewares: Array<GrpcServerMiddleware<any, any>>
    private readonly serviceInfoBuilder: ServiceInfoBuilder
    public readonly state: ServerState
    public readonly logger: Logger
    private grpcServer!: grpc.Server
    // avvivo typins only for typescrip
    register!: avvio.Use<Server>
    after!: avvio.After<Server>
    ready!: avvio.Ready<Server>
    close!: avvio.Close<Server>
    onClose!: avvio.OnClose<Server>

    constructor(config: ServerConfig) {
        this.config = config
        this.middlewares = []
        this.serviceInfoBuilder = new ServiceInfoBuilder()
        this.state = {
            started: false,
            closing: false,
            listening: false,
        }
        this.logger = Pino(config.logger)

        //
        const { pluginTimeout = 10000 } = config
        const avvio = Avvio(this, {
            autostart: false,
            timeout: pluginTimeout,
            expose: { use: 'register' },
        } as any)
        avvio.on('start', () => (this.state.started = true))
        avvio.once('preReady', () => {
            this.onClose((instance, done) => {
                this.state.closing = true
                if (this.state.listening) {
                    this.grpcServer.tryShutdown(done as any)
                } else {
                    done(null)
                }
            })
        })
    }

    private throwIfAlreadyStarted(msg: string) {
        if (this.state.started) throw new Error(msg)
    }

    /**
     * stoping grpc server and database connection
     */
    private async stop(): Promise<void> {
        this.logger.info('Server shutting down')
        return new Promise<void>(resolve => {
            if (this.grpcServer) this.grpcServer.tryShutdown(resolve)
            else resolve()
        })
    }

    /**
     * starting database connection and then grpc server
     */
    async startInsecure(): Promise<void> {
        this.startServer(grpc.ServerCredentials.createInsecure())
    }

    async startSecure(
        rootCerts: Buffer | null,
        keyCertPairs: grpc.KeyCertPair[],
        checkClientCertificate?: boolean
    ): Promise<void> {
        this.startServer(
            grpc.ServerCredentials.createSsl(
                rootCerts,
                keyCertPairs,
                checkClientCertificate
            )
        )
    }

    use(
        middleware:
            | GrpcServerMiddleware<any, any>
            | ReadonlyArray<GrpcServerMiddleware<any, any>>
    ): Server {
        this.throwIfAlreadyStarted(
            'Cannot call "use" when server instance is already started!'
        )
        if (Array.isArray(middleware)) {
            for (const m of middleware) {
                this.middlewares.push(m)
            }
        } else {
            this.middlewares.push(middleware as GrpcServerMiddleware<any, any>)
        }

        return this
    }

    addService(
        protoFilePath: string,
        serviceName: string,
        implimentation: GrpcUntypedServiceImplementation
    ): ServiceImplContext {
        this.throwIfAlreadyStarted(
            'Cannot call "addService" when server instance is already started!'
        )

        const infoHolder: ServiceInfo = {
            protoFilePath: protoFilePath,
            serviceName: serviceName,
            implimentation: implimentation,
            middlewares: [],
        }

        this.serviceInfoBuilder.add(infoHolder)
        const serviceImpl = new ServiceImplContext(infoHolder)
        return serviceImpl
    }

    addServiceWithPackageName(
        protoFilePath: string,
        packageName: string,
        serviceName: string,
        implimentation: GrpcUntypedServiceImplementation
    ): ServiceImplContext {
        this.throwIfAlreadyStarted(
            'Cannot call "addServiceWithPackageName" when server instance is already started!'
        )
        const infoHolder: ServiceInfo = {
            packageName: packageName,
            protoFilePath: protoFilePath,
            serviceName: serviceName,
            implimentation: implimentation,
            middlewares: [],
        }

        this.serviceInfoBuilder.add(infoHolder)
        const serviceImpl = new ServiceImplContext(infoHolder)
        return serviceImpl
    }

    //
    private async startServer(
        credentials: grpc.ServerCredentials
    ): Promise<void> {
        this.logger.info('Server starting...')
        await this.ready()
        const servicesInfos = this.serviceInfoBuilder.build()
        for (const serviceInfo of servicesInfos) {
            const packageDefinition = loadSync(serviceInfo.protoFilePath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
            })
            const serviceDefination = grpc.loadPackageDefinition(
                packageDefinition
            )
            if (!serviceInfo.packageName) {
                if (!serviceDefination[serviceInfo.serviceName]) {
                    throw Error(
                        `Invalid service name ${serviceInfo.serviceName}`
                    )
                } else {
                    serviceInfo.serviceDefination = serviceDefination
                }
            } else if (!serviceDefination[serviceInfo.packageName]) {
                throw Error(`Invalid package name ${serviceInfo.packageName}`)
            } else {
                serviceInfo.serviceDefination =
                    serviceDefination[serviceInfo.packageName]
            }
        }

        const { address, port } = this.config
        this.grpcServer = new grpc.Server()

        for (const serviceInfo of servicesInfos) {
            this.grpcServer.addService(
                serviceInfo.serviceDefination[serviceInfo.serviceName].service,
                buildServiceProxy(this.middlewares, serviceInfo)
            )
        }

        const portNumber = this.grpcServer.bind(
            `${address}:${port}`,
            credentials
        )
        if (portNumber == 0) {
            this.logger.error('GRPC server failed to start')
        } else {
            this.grpcServer.start()
            this.state.listening = true
            this.logger.info(`GRPC server start at ${portNumber}`)
        }
    }
}
