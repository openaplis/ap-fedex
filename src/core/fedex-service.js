var grpc = require('grpc')

var PROTO_PATH = './src/core/fedex.proto'
var protobuf = grpc.load(PROTO_PATH).fedex
var port = 50052
var server = {};

module.exports = {

  start: function (callback) {
    server = new grpc.Server()
    server.addProtoService(protobuf.FedexService.service, { ping: ping })
    server.bind('0.0.0.0:50052', grpc.ServerCredentials.createInsecure())
    server.start()

    callback(null, {
      message: 'The Fedex service has started.',
      port: port
    })
  },

  shutdown: function (callback) {
    server.tryShutdown(function () {
      callback(null, { message: 'The service has been stopped.'} )
    })
  }

}

function ping (call, callback) {
  callback(null, { message: 'I recieved this message: ' + call.request.message } )
}
