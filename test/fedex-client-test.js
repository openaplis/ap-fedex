const path = require('path')
const grpc = require('grpc')

const PROTO_PATH = path.join(__dirname, '../node_modules/ap-protobuf/src/core/fedex/fedex-service.proto')
const fedex_proto = grpc.load(PROTO_PATH).fedex
const fedexService = new fedex_proto.FedexService(process.env.AP_FEDEX_SERVICE_BINDING, grpc.credentials.createInsecure())
console.log('Connecting to: ' + process.env.AP_FEDEX_SERVICE_BINDING)

fedexService.updateShipments({ message: 'null'}, function (err, message) {
  if(err) return console.log(err)  
  console.log(message)
})
