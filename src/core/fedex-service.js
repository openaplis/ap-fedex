'use static'

var grpc = require('grpc')
var path = require('path')

var updateShipmentStatus = require(path.join(__dirname, 'update-shipment-status'))
var PROTO_PATH = path.join(__dirname, '../../node_modules/ap-protobuf/src/core/fedex/fedex-service.proto')
var protobuf = grpc.load(PROTO_PATH).fedex
var server = {}

module.exports = {

  start: function (callback) {
    server = new grpc.Server()
    server.addService(protobuf.FedexService.service,
      {
        updateShipments: updateShipments
      })
    server.bind(process.env.AP_FEDEX_SERVICE_BINDING, grpc.ServerCredentials.createInsecure())
    server.start()

    callback(null, {
      message: 'The Fedex service has started.',
      serviceBinding: process.env.AP_FEDEX_SERVICE_BINDING
    })
  },

  shutdown: function (callback) {
    server.tryShutdown(function () {
      callback(null, { message: 'The service has been stopped.'} )
    })
  }

}

function updateShipments (call, callback) {  
  updateShipmentStatus.update(function (err, result) {
    if(err) return callback(err)
    callback(null, result)
  })
}
