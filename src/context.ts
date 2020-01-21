import {
    Metadata,
    ServiceError,
    ServerUnaryCall,
    ServerWritableStream,
    sendUnaryData,
} from 'grpc'

/**
 *
 */
export class GrpcServerCallContext<RequestType, ResponseType> {
    readonly call:
        | ServerUnaryCall<RequestType>
        | ServerWritableStream<RequestType>
    private readonly handler?: sendUnaryData<ResponseType>;

    [propName: string]: any

    constructor(
        call: ServerUnaryCall<RequestType> | ServerWritableStream<RequestType>,
        handler?: sendUnaryData<ResponseType>
    ) {
        this.call = call
        this.handler = handler
    }

    get cancelled(): boolean {
        return this.call.cancelled
    }

    get metadata(): Metadata {
        return this.call.metadata
    }

    get request(): RequestType {
        return this.call.request
    }

    halt(error: ServiceError): void {
        if (this.handler) {
            this.handler(error, null)
        } else {
            ;(this.call as ServerWritableStream<RequestType>).destroy(error)
        }
    }

    send(value: ResponseType, trailer?: Metadata, flags?: number): void {
        this.handler!(null, value, trailer, flags)
    }

    write(payload: ResponseType): void {
        ;(this.call as ServerWritableStream<RequestType>).write(payload)
    }

    end(): void {
        ;(this.call as ServerWritableStream<RequestType>).end()
    }

    destroy(error: ServiceError): void {
        if (this.handler) {
            this.handler(error, null)
        } else {
            ;(this.call as ServerWritableStream<RequestType>).destroy(error)
        }
    }
}

export type grpcRequestHandlerCall<RequestType, ResponseType> = (
    context: GrpcServerCallContext<RequestType, ResponseType>
) => void

export type GrpcUntypedServiceImplementation = {
    [name: string]: grpcRequestHandlerCall<any, any>
}
