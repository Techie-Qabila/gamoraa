import path from 'path'

import Server from '../src/server'
import routeJson from './route_guide_db'

const server = new Server({
    address: '0.0.0.0',
    port: 50051,
})

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

server.addServiceWithPackageName(
    path.join(__dirname, '../../examples/protos/route_guide.proto'),
    'routeguide',
    'RouteGuide',
    {
        getFeature: async function(context) {
            context.send({ name: 'Mordor', location: context.request })
        },
        listFeatures: async function(context) {
            let i = 0
            await sleep(1000)
            context.write(routeJson[i++])
            await sleep(1000)
            context.write(routeJson[i++])
            await sleep(1000)
            context.write(routeJson[i++])
            await sleep(1000)
            context.write(routeJson[i++])
            await sleep(1000)
            context.write(routeJson[i++])
            context.end()
        },
    }
)

server.startInsecure()
