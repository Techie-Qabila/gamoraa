import path from 'path'

import Server from '../src/server'

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

server.register(function(server, optios, done) {
    console.log('Loading plugin')
    done()
})

server.register(function(server, optios, done) {
    console.log('Loading plugin 2')
    done()
})

server
    .register(function(server, optios, done) {
        console.log('Loading plugin 3')
        done()
    })
    .after(err => {
        console.log('After plugin')
        if (err) console.log(err)
    })

server.register(function(server, optios, done) {
    console.log('Loading plugin 4')
    done()
})

server.startInsecure()
