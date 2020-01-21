# Gamoraa GRPC Framework for Node

Simplest framework for building GRPC services.

## How to use

```js
import path from 'path'
import Server from 'gamoraa'

const server = new Server({
    address: '0.0.0.0',
    port: 50051,
})

server.addServiceWithPackageName(
    path.join(__dirname, '../../examples/protos/helloworld.proto'),
    'helloworld',
    'Greeter',
    {
        sayHello: async function(context) {
            const name = context.request.name
            context.send({ message: 'Hello ' + name })
        },
    }
)

server.startInsecure()
```

## License

Licensed under [MIT](./LICENSE).
