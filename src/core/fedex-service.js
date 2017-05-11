'use static'

var path = require('path')
var grpc = require('grpc')
var path = require('path')

var updateShipmentStatus = require(path.join(__dirname, 'update-shipment-status'))

var PROTO_PATH = path.join(__dirname, 'fedex.proto')
var protobuf = grpc.load(PROTO_PATH).fedex
var server = {};

module.exports = {

  start: function (callback) {
    server = new grpc.Server()
    server.addProtoService(protobuf.FedexService.service, { ping: ping, updateShipments: updateShipments })
    server.bind('0.0.0.0:50052', grpc.ServerCredentials.createInsecure())
    server.start()

    callback(null, {
      message: 'The Fedex service has started.',
      port: '50052'
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

function updateShipments (call, callback) {
  updateShipmentStatus.update(function (err, result) {    
    callback(null, { message: result } )
  })
}
