var grpc = require('grpc')

var PROTO_PATH = 'node_modules/ap-protobuf/src/fedex/fedex.proto'
var protobuf = grpc.load(PROTO_PATH).fedex

function main() {
  var server = new grpc.Server()
  server.addProtoService(protobuf.UpdateFedexShipments.service, { update: UpdateShipments })
  server.bind('0.0.0.0:50052', grpc.ServerCredentials.createInsecure())
  server.start()
  console.log('The Fedex micro service is listening on port 50052!')
}
